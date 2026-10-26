import { useEffect, useRef, useState } from "react";
import { usePanelScope } from "../../app/context";
import { entityLink, phoneSearchLink } from "../../domain/crmLinks";
import { eventLabel, isDashboardCall } from "../../domain/eventCatalog";
import { callDirection, CALL_DIRECTION_LABEL } from "../../domain/formulas/eventAnalysis";
import type { TimelineGroup, TimelineRow } from "../../domain/formulas/timelineRow";
import { phoneDisplay } from "../../domain/phone";
import { formatCallDuration, hhmm, isoToUnix, minutesOfDay, minutesToHHMM } from "../../domain/time";
import type { CrmEvent, WorkSession } from "../../domain/types";
import type { EventCard } from "../../api/source";
import { Icon } from "../../ui/Icon";

const pct = (m: number, start: number, end: number) => `${(((m - start) / (end - start)) * 100).toFixed(3)}%`;
const width = (a: number, b: number, start: number, end: number) => `${((Math.max(0, Math.min(b, end) - Math.max(a, start)) / (end - start)) * 100).toFixed(3)}%`;

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

interface OpenGroup {
  group: TimelineGroup;
  x: number;
  y: number;
}

export function TimelineBar({ row, startMinutes, endMinutes, isToday, external, emptyLabel }: { row: TimelineRow; startMinutes: number; endMinutes: number; isToday: boolean; external?: WorkSession[] | null; emptyLabel?: string }) {
  const { panel } = usePanelScope();
  const [open, setOpen] = useState<OpenGroup | null>(null);
  const nowM = row.nowMinutes;
  const pastEnd = isToday ? Math.min(endMinutes, Math.max(startMinutes, nowM ?? startMinutes)) : endMinutes;
  const hasAny = row.activity.length > 0 || row.calls.length > 0;
  const visible = (g: TimelineGroup) => g.endMinutes > startMinutes && g.startMinutes < endMinutes;

  const openAt = (group: TimelineGroup, e: React.MouseEvent) => {
    const seg = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const host = (e.currentTarget as HTMLElement).closest(".tl")?.getBoundingClientRect();
    const hostLeft = host?.left ?? 0;
    const hostWidth = host?.width ?? window.innerWidth;
    // Позиция относительно строки; попап не выходит за правый край строки.
    setOpen({ group, x: Math.max(0, Math.min(seg.left - hostLeft, hostWidth - Math.min(360, hostWidth))), y: 36 });
  };

  const label = (g: TimelineGroup) => `${g.kind === "call" ? "Звонки" : "Активность"} ${minutesToHHMM(g.startMinutes)}–${minutesToHHMM(g.endMinutes)}, событий: ${g.items.length}`;

  return (
    <div className="tl">
      <div className={`tl-bar${!hasAny && !isToday ? " empty" : ""}`}>
        <div className="past" style={{ width: width(startMinutes, pastEnd, startMinutes, endMinutes) }} />
        {row.activity.filter(visible).map((g, i) => (
          <button key={`a${i}`} type="button" className="seg-a" style={{ left: pct(Math.max(g.startMinutes, startMinutes), startMinutes, endMinutes), width: width(g.startMinutes, g.endMinutes, startMinutes, endMinutes) }} title={label(g)} aria-label={label(g)} onClick={(e) => openAt(g, e)} />
        ))}
        {row.calls.filter(visible).map((g, i) => (
          <button key={`c${i}`} type="button" className="seg-c" style={{ left: pct(Math.max(g.startMinutes, startMinutes), startMinutes, endMinutes), width: width(g.startMinutes, g.endMinutes, startMinutes, endMinutes) }} title={label(g)} aria-label={label(g)} onClick={(e) => openAt(g, e)} />
        ))}
        {external?.map((s, i) => {
          const a = isoToUnix(s.startedAt);
          if (a === null) return null;
          const b = isoToUnix(s.stoppedAt) ?? Math.floor(Date.now() / 1000);
          const am = minutesOfDay(a, panel.timezone);
          const bm = minutesOfDay(b, panel.timezone);
          const title = `Панель задач: ${s.taskName || s.activityName || "сессия"} ${minutesToHHMM(am)}–${minutesToHHMM(bm)}`;
          return <span key={`x${i}`} className="seg-x" style={{ left: pct(Math.max(am, startMinutes), startMinutes, endMinutes), width: width(am, bm, startMinutes, endMinutes) }} title={title} />;
        })}
        {nowM !== null && nowM > startMinutes && nowM < endMinutes && <span className="now" style={{ left: pct(nowM, startMinutes, endMinutes) }} />}
        {!hasAny && !isToday && emptyLabel && <span className="empty-l">{emptyLabel}</span>}
      </div>
      {open && <GroupPopup open={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function GroupPopup({ open, onClose }: { open: OpenGroup; onClose: () => void }) {
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
  const g = open.group;
  return (
    <div className="tl-pop" ref={ref} style={{ left: open.x, top: open.y }} role="dialog" aria-label="События отрезка">
      <h4>
        <span>
          {g.kind === "call" ? "Звонки" : "Активность в amoCRM"} · {minutesToHHMM(g.startMinutes)}–{minutesToHHMM(g.endMinutes)}
        </span>
        <button type="button" className="link-btn" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={14} />
        </button>
      </h4>
      {g.items.map(({ event }) => (
        <EventLine key={event.id} event={event} crmBase={panel.crmBaseUrl} timeZone={panel.timezone} />
      ))}
    </div>
  );
}

export function EventLine({ event, crmBase, timeZone }: { event: CrmEvent; crmBase: string | null; timeZone: string }) {
  const { source } = usePanelScope();
  const [card, setCard] = useState<EventCard | null | "loading" | "error">(null);
  const call = isDashboardCall(event) ? event.call : null;
  const link = call ? entityLink(crmBase, call.entityType, call.entityId) : entityLink(crmBase, event.related?.entityType ?? event.entityType, event.related?.entityId ?? event.entityId);
  const loadCard = () => {
    setCard("loading");
    source.loadEventCard(event.id).then(setCard, () => setCard("error"));
  };
  return (
    <div className="ev">
      <span className="t">{hhmm(event.createdAt, timeZone)}</span>
      <div>
        <div>{link ? <a href={link} target="_blank" rel="noreferrer noopener">{eventLabel(event.type)}</a> : eventLabel(event.type)}</div>
        {call && (
          <div className="d">
            {CALL_DIRECTION_LABEL[callDirection(event)]} · {formatCallDuration(call.durationSeconds)}
            {call.phone && (
              <>
                {" · "}
                {phoneSearchLink(crmBase, call.phone) ? (
                  <a href={phoneSearchLink(crmBase, call.phone) as string} target="_blank" rel="noreferrer noopener">
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
