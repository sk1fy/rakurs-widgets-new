import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePanelScope } from "../../app/context";
import { entityLink, phoneSearchLink } from "../../domain/crmLinks";
import { eventColor, eventLabel, isDashboardCall } from "../../domain/eventCatalog";
import { callDirection, CALL_DIRECTION_LABEL, type CallDirection } from "../../domain/formulas/eventAnalysis";
import { buildExternalLane, LANE_COLORS, laneLabel, type LaneItem, type LaneSegment } from "../../domain/formulas/externalLane";
import type { IdleSegment, TimelineGroup, TimelineRow } from "../../domain/formulas/timelineRow";
import { phoneDisplay } from "../../domain/phone";
import { formatCallDuration, formatSpan, formatSpanSeconds, hhmmss, minutesToHHMM } from "../../domain/time";
import type { CrmEvent, WorkSession } from "../../domain/types";
import type { EventCard } from "../../api/source";
import { Icon } from "../../ui/Icon";
import { HelpTip } from "../../ui/primitives";

const pct = (m: number, start: number, end: number) => `${(((m - start) / (end - start)) * 100).toFixed(3)}%`;
const width = (a: number, b: number, start: number, end: number) => `${((Math.max(0, Math.min(b, end) - Math.max(a, start)) / (end - start)) * 100).toFixed(3)}%`;
const range = (a: number, b: number) => `${minutesToHHMM(a)} - ${minutesToHHMM(b)}`;

export const CALL_ARROW: Record<CallDirection, { glyph: string; color: string }> = {
  incoming: { glyph: "↙", color: "#52c41a" },
  outgoing: { glyph: "↗", color: "#1890ff" },
  missed: { glyph: "↙", color: "#ff4d4f" },
  unknown: { glyph: "↙", color: "#94a1ae" },
};

export function TimeAxis({ startMinutes, endMinutes, small }: { startMinutes: number; endMinutes: number; small?: boolean }) {
  const hours: number[] = [];
  for (let h = Math.ceil(startMinutes / 60); h * 60 < endMinutes; h++) hours.push(h);
  return (
    <div className={`axis${small ? " small" : ""}`} aria-hidden="true">
      {hours.map((h) => (
        <span key={h} style={{ left: pct(h * 60, startMinutes, endMinutes) }}>
          {String(h).padStart(2, "0")}:00
        </span>
      ))}
    </div>
  );
}

/** Сумма известных длительностей звонков группы; «<1м», если меньше минуты. */
function callGroupSpan(g: TimelineGroup): string {
  const seconds = g.items.reduce((s, { event }) => s + (event.call?.durationSeconds ?? 0), 0);
  const minutes = Math.ceil(seconds / 60);
  return minutes > 0 ? formatSpan(minutes) : "<1м";
}

/** Подсказки отрезков в формате старой панели. */
export function groupTooltip(g: TimelineGroup): string {
  const head = range(g.startMinutes, g.endMinutes);
  return g.kind === "call" ? `${head}\n${g.items.length} зв. • ≈${callGroupSpan(g)}` : `${head}\n${g.items.length} соб. • ≈${formatSpan(g.endMinutes - g.startMinutes)}`;
}

export function idleTooltip(s: IdleSegment): string {
  return `${range(s.startMinutes, s.endMinutes)}\n≈${formatSpan(s.endMinutes - s.startMinutes)} бездействия`;
}

type Popup =
  | { kind: "group"; group: TimelineGroup }
  | { kind: "idle"; segment: IdleSegment }
  | { kind: "lane"; segment: LaneSegment };

const popupTarget = (p: Popup): object => (p.kind === "group" ? p.group : p.segment);

interface OpenPopup {
  popup: Popup;
  x: number;
  y: number;
}

export function TimelineBar({ row, startMinutes, endMinutes, isToday, dayKey, external, emptyLabel }: { row: TimelineRow; startMinutes: number; endMinutes: number; isToday: boolean; dayKey: string; external?: WorkSession[] | null; emptyLabel?: string }) {
  const [open, setOpen] = useState<OpenPopup | null>(null);
  const nowM = row.nowMinutes;
  const pastEnd = isToday ? Math.min(endMinutes, Math.max(startMinutes, nowM ?? startMinutes)) : endMinutes;
  const hasAny = row.activity.length > 0 || row.calls.length > 0;
  const visible = (g: { startMinutes: number; endMinutes: number }) => g.endMinutes > startMinutes && g.startMinutes < endMinutes;
  const place = (a: number, b: number) => ({ left: pct(Math.max(a, startMinutes), startMinutes, endMinutes), width: width(a, b, startMinutes, endMinutes) });
  const isOpen = (p: Popup) => open !== null && popupTarget(open.popup) === popupTarget(p);

  const openAt = (popup: Popup, e: React.MouseEvent) => {
    const seg = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const host = (e.currentTarget as HTMLElement).closest(".tl")?.getBoundingClientRect();
    const hostLeft = host?.left ?? 0;
    const hostTop = host?.top ?? 0;
    const hostWidth = host?.width ?? window.innerWidth;
    // Позиция относительно строки; попап не выходит за правый край строки.
    setOpen({ popup, x: Math.max(0, Math.min(seg.left - hostLeft, hostWidth - Math.min(360, hostWidth))), y: seg.bottom - hostTop + 6 });
  };

  return (
    <div className="tl">
      <div className={`tl-bar${!hasAny && !isToday ? " empty" : ""}`}>
        <div className="past" style={{ width: width(startMinutes, pastEnd, startMinutes, endMinutes) }} />
        {hasAny &&
          row.idle.filter(visible).map((s, i) => {
            const p: Popup = { kind: "idle", segment: s };
            return <button key={`i${i}`} type="button" className={`seg-i${isOpen(p) ? " hl" : ""}`} style={place(s.startMinutes, s.endMinutes)} title={idleTooltip(s)} aria-label={idleTooltip(s)} onClick={(e) => openAt(p, e)} />;
          })}
        {row.activity.filter(visible).map((g, i) => {
          const p: Popup = { kind: "group", group: g };
          return <button key={`a${i}`} type="button" className={`seg-a${isOpen(p) ? " hl" : ""}`} style={place(g.startMinutes, g.endMinutes)} title={groupTooltip(g)} aria-label={groupTooltip(g)} onClick={(e) => openAt(p, e)} />;
        })}
        {row.calls.filter(visible).map((g, i) => {
          const p: Popup = { kind: "group", group: g };
          return <button key={`c${i}`} type="button" className={`seg-c${isOpen(p) ? " hl" : ""}`} style={place(g.startMinutes, g.endMinutes)} title={groupTooltip(g)} aria-label={groupTooltip(g)} onClick={(e) => openAt(p, e)} />;
        })}
        {!hasAny && !isToday && emptyLabel && <span className="empty-l">{emptyLabel}</span>}
      </div>
      {external && <ExternalLaneBar sessions={external} dayKey={dayKey} startMinutes={startMinutes} endMinutes={endMinutes} nowMinutes={nowM} isOpen={isOpen} onOpen={openAt} />}
      {open && <PopupView open={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ExternalLaneBar({
  sessions,
  dayKey,
  startMinutes,
  endMinutes,
  nowMinutes,
  isOpen,
  onOpen,
}: {
  sessions: WorkSession[];
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  nowMinutes: number | null;
  isOpen: (p: Popup) => boolean;
  onOpen: (p: Popup, e: React.MouseEvent) => void;
}) {
  const { panel } = usePanelScope();
  const lane = buildExternalLane({ sessions, dayKey, timeZone: panel.timezone, startMinutes, endMinutes, nowMinutes });
  const visible = (g: { startMinutes: number; endMinutes: number }) => g.endMinutes > startMinutes && g.startMinutes < endMinutes;
  const place = (a: number, b: number) => ({ left: pct(Math.max(a, startMinutes), startMinutes, endMinutes), width: width(a, b, startMinutes, endMinutes) });
  const futureFrom = nowMinutes !== null ? Math.max(startMinutes, Math.min(endMinutes, nowMinutes)) : endMinutes;
  return (
    <div className="tl-ext">
      <div className="tl-ext-bar" aria-label="События панели задач">
        {futureFrom < endMinutes && <span className="fut" style={place(futureFrom, endMinutes)} />}
        {lane.idle.filter(visible).map((s, i) => (
          <span key={`i${i}`} className="idle" style={place(s.startMinutes, s.endMinutes)} title={`${range(s.startMinutes, s.endMinutes)}\n≈${formatSpan(s.endMinutes - s.startMinutes)} без событий`} />
        ))}
        {lane.segments.filter(visible).map((seg, i) => {
          const p: Popup = { kind: "lane", segment: seg };
          const single = seg.items.length === 1 ? seg.items[0] : undefined;
          const title = single ? `${laneRange(single)}\n≈${formatSpanSeconds(single.seconds)}` : `${seg.items.length} событий · ${range(seg.startMinutes, seg.endMinutes)}`;
          return (
            <button key={`s${i}`} type="button" className={`seg${single ? "" : " cl"}${single?.active ? " live" : ""}${isOpen(p) ? " hl" : ""}`} style={{ ...place(seg.startMinutes, seg.endMinutes), background: seg.color }} title={title} aria-label={title} onClick={(e) => onOpen(p, e)}>
              {!single && <span>{seg.items.length}</span>}
            </button>
          );
        })}
      </div>
      <HelpTip label="Легенда полосы панели задач" className="tl-ext-help">
        <b>Легенда</b>
        <span className="lg"><i style={{ background: LANE_COLORS.event }} />Событие</span>
        <span className="lg"><i className="cl" style={{ background: LANE_COLORS.cluster }} />Кластер</span>
        <span className="lg"><i style={{ background: LANE_COLORS.activity }} />Другая активность</span>
        <span className="lg"><i className="idle" />Бездействие</span>
        <span className="lg"><i style={{ background: "var(--tl-future)" }} />Ещё не наступило</span>
      </HelpTip>
    </div>
  );
}

function laneRange(item: LaneItem): string {
  return `${minutesToHHMM(item.startMinutes)} — ${item.active ? "В процессе..." : minutesToHHMM(item.endMinutes)}`;
}

function LaneItemView({ item }: { item: LaneItem }) {
  const { panel } = usePanelScope();
  const s = item.session;
  const link = entityLink(panel.crmBaseUrl, s.entityType, s.entityId) ?? s.taskUrl ?? null;
  const isLead = ["lead", "leads"].includes(String(s.entityType ?? "").toLowerCase());
  const color = s.kind === "activity" ? LANE_COLORS.activity : LANE_COLORS.event;
  return (
    <div className="lane-it">
      <div className="lane-h">
        <i className="dot" style={{ background: color }} />
        <b>{laneLabel(s)}</b>
      </div>
      <dl>
        <dt>Время</dt>
        <dd>{laneRange(item)}</dd>
        <dt>Длительность</dt>
        <dd style={{ color }}>{formatSpanSeconds(item.seconds)}</dd>
        {s.activityType !== "imbox" && (
          <>
            <dt>{s.taskName ? "Описание" : "Задача"}</dt>
            <dd>
              <span className="tag">{s.taskName || (s.taskId ? `#${s.taskId}` : s.activityName || "—")}</span>
            </dd>
          </>
        )}
        {isLead && s.entityName && (
          <>
            <dt>Сделка</dt>
            <dd title={s.entityName}>{s.entityName}</dd>
          </>
        )}
        {s.statusName && (
          <>
            <dt>Этап</dt>
            <dd>{s.statusName}</dd>
          </>
        )}
      </dl>
      {link && (
        <a className="lane-link" href={link} target="_blank" rel="noreferrer noopener">
          Показать
        </a>
      )}
    </div>
  );
}

function PopupView({ open, onClose }: { open: OpenPopup; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { panel } = usePanelScope();
  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const p = open.popup;
  let title: ReactNode;
  let stats: ReactNode = null;
  let body: ReactNode;
  if (p.kind === "idle") {
    title = "Период простоя";
    stats = (
      <>
        <b>{range(p.segment.startMinutes, p.segment.endMinutes)}</b> · ≈{formatSpan(p.segment.endMinutes - p.segment.startMinutes)} бездействия
      </>
    );
    body = <div className="dim small">В этот период не было зафиксировано активности в системе</div>;
  } else if (p.kind === "lane") {
    title = p.segment.items.length === 1 ? "Панель задач" : `${p.segment.items.length} событий`;
    body = p.segment.items.map((item, i) => <LaneItemView key={i} item={item} />);
  } else {
    const g = p.group;
    title = g.kind === "call" ? `Группа звонков (${g.items.length})` : "Период активности";
    stats = (
      <>
        <b>{range(g.startMinutes, g.endMinutes)}</b> · {g.kind === "call" ? `${g.items.length} зв. • ≈${callGroupSpan(g)}` : `≈${formatSpan(g.endMinutes - g.startMinutes)} • ${g.items.length} событий`}
      </>
    );
    body = g.items.map(({ event }) => <EventLine key={event.id} event={event} crmBase={panel.crmBaseUrl} timeZone={panel.timezone} />);
  }
  return (
    <div className="tl-pop" ref={ref} style={{ left: open.x, top: open.y }} role="dialog" aria-label={typeof title === "string" ? title : "События отрезка"}>
      <h4>
        <span>{title}</span>
        <button type="button" className="link-btn" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={14} />
        </button>
      </h4>
      {stats && <div className="pop-stats">{stats}</div>}
      {body}
    </div>
  );
}

export function EventLine({ event, crmBase, timeZone }: { event: CrmEvent; crmBase: string | null; timeZone: string }) {
  const { source } = usePanelScope();
  const [card, setCard] = useState<EventCard | null | "loading" | "error">(null);
  const call = isDashboardCall(event) ? event.call : null;
  const direction = call ? callDirection(event) : null;
  const link = call ? entityLink(crmBase, call.entityType, call.entityId) : entityLink(crmBase, event.related?.entityType ?? event.entityType, event.related?.entityId ?? event.entityId);
  const phoneLink = call?.phone ? phoneSearchLink(crmBase, call.phone) : null;
  const loadCard = () => {
    setCard("loading");
    source.loadEventCard(event.id).then(setCard, () => setCard("error"));
  };
  return (
    <div className="ev">
      <span className="t">{hhmmss(event.createdAt, timeZone)}</span>
      <div>
        <div className="ev-h">
          {direction ? (
            <span className="ev-arr" style={{ color: CALL_ARROW[direction].color }} title={CALL_DIRECTION_LABEL[direction]} aria-hidden="true">
              {CALL_ARROW[direction].glyph}
            </span>
          ) : (
            <i className="dot" style={{ background: eventColor(event.type) }} aria-hidden="true" />
          )}
          {link ? <a href={link} target="_blank" rel="noreferrer noopener">{eventLabel(event.type)}</a> : eventLabel(event.type)}
        </div>
        {call && direction && (
          <div className="d">
            {CALL_DIRECTION_LABEL[direction]} · {formatCallDuration(call.durationSeconds)}
            {call.phone && (
              <>
                {" · "}
                {phoneLink ? (
                  <a href={phoneLink} target="_blank" rel="noreferrer noopener">
                    {phoneDisplay(call.phone)}
                  </a>
                ) : (
                  phoneDisplay(call.phone)
                )}
              </>
            )}
            {call.link && (
              <>
                {" · "}
                <a href={call.link} target="_blank" rel="noreferrer noopener">запись</a>
              </>
            )}
          </div>
        )}
        {card === null && (
          <button type="button" className="link-btn small" onClick={loadCard}>
            подробнее
          </button>
        )}
        {card === "loading" && <div className="d">загрузка…</div>}
        {card === "error" && <div className="d">карточка события недоступна</div>}
        {card && typeof card === "object" && (
          <div className="d">
            {card.source === "fixture" && <span className="chip warn" style={{ height: 18, fontSize: 10 }}>синтетика</span>} {card.title ?? card.summary}
            {card.details.slice(0, 6).map((d, i) => (
              <div key={i}>
                {d.label}: {d.text ?? [d.before, d.after].filter(Boolean).join(" → ")}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
