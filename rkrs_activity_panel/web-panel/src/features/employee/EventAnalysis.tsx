import { useMemo, useState, type ReactNode } from "react";
import type { Sourced } from "../../api/source";
import { entityLink, eventsListLink, phoneSearchLink } from "../../domain/crmLinks";
import { CATEGORY_META, eventCategory, eventLabel, TASK_EVENT_LABELS, type EventCategory } from "../../domain/eventCatalog";
import {
  analyzeEvents,
  binStack,
  binTypes,
  CALL_DIRECTION_LABEL,
  CALL_LANE_COLORS,
  CALL_TABS,
  correctnessColor,
  inCallTab,
  layoutCallLanes,
  uniqueCalls,
  type AnalysisBin,
  type CallLaneItem,
  type CallTab,
} from "../../domain/formulas/eventAnalysis";
import { completedTaskSeconds } from "../../domain/formulas/sessions";
import { phoneDisplay } from "../../domain/phone";
import { formatCallDuration, formatDurationWithSeconds, formatMinutes, hhmm, minutesToHHMM } from "../../domain/time";
import type { CrmEvent, EmployeeSessions } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { anchorAt, AnchoredPop, ExtLink, HelpTip, Switch, Tabs } from "../../ui/primitives";
import { CALL_ARROW } from "../dashboard/Timeline";

type Pop = { kind: "bin"; bin: AnalysisBin; category: EventCategory; x: number; y: number } | { kind: "call"; call: CallLaneItem; x: number; y: number };

/** Полоса звонков: высота одной дорожки и зазор, px. */
const LANE_H = 6;
const LANE_GAP = 2;
/** Сколько строк видно без прокрутки, дальше — подсказка «ещё ниже». */
const TYPES_VISIBLE = 7;
const CALLS_VISIBLE = 6;

const pctOf = (m: number, start: number, end: number) => `${(((m - start) / (end - start)) * 100).toFixed(3)}%`;
const spanOf = (a: number, b: number, start: number, end: number) => `${(((b - a) / (end - start)) * 100).toFixed(3)}%`;

function Dot({ color }: { color: string }) {
  return <i className="ea-dot" style={{ background: color }} aria-hidden="true" />;
}

function MoreBelow({ show, children }: { show: boolean; children: ReactNode }) {
  return show ? (
    <div className="ea-more">
      {children} <span aria-hidden="true">⌄</span>
    </div>
  ) : null;
}

/** «Анализ событий» (EmployeeActivitiesSectionV3): 2-минутные корзины, простой, категории, задачи, звонки. */
export function EventAnalysis({
  events,
  sessions,
  dayKey,
  timeZone,
  startMinutes,
  endMinutes,
  nowUnix,
  crmBase,
  employeeId,
  demo = false,
}: {
  events: CrmEvent[];
  sessions: Sourced<EmployeeSessions> | null;
  dayKey: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  nowUnix: number;
  crmBase: string | null;
  employeeId: number;
  demo?: boolean;
}) {
  const a = useMemo(() => analyzeEvents({ events, dayKey, timeZone, startMinutes, endMinutes, nowUnix }), [events, dayKey, timeZone, startMinutes, endMinutes, nowUnix]);
  const [unique, setUnique] = useState(false);
  const [tab, setTab] = useState<CallTab>("all");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [highlightCall, setHighlightCall] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);

  const byTab = a.calls.filter((c) => inCallTab(c, tab));
  const calls = unique ? uniqueCalls(byTab) : byTab;
  const unknown = a.calls.filter((c) => !c.durationKnown).length;
  const lanes = useMemo(() => layoutCallLanes(a.calls, startMinutes, endMinutes, a.visibleEndMinutes), [a, startMinutes, endMinutes]);
  const taskSeconds = sessions?.kind === "ok" ? completedTaskSeconds(sessions.data.items) : null;
  const typeLink = (key: string) => eventsListLink(crmBase, employeeId, dayKey, key);
  const callLink = (e: CrmEvent) => entityLink(crmBase, e.call?.entityType, e.call?.entityId) ?? e.call?.link ?? null;
  const toggleType = (key: string) => setSelectedType((t) => (t === key ? null : key));
  const muted = (types: Set<string> | string) => selectedType !== null && (typeof types === "string" ? types !== selectedType : !types.has(selectedType));
  const futureFrom = Math.max(startMinutes, a.visibleEndMinutes);

  const summary: { icon: "clock" | "ok" | "close" | "chart"; value: ReactNode; label: string; cls?: string }[] = [
    { icon: "clock", value: a.firstEventUnix ? hhmm(a.firstEventUnix, timeZone) : "--:--", label: "первое событие" },
    { icon: "clock", value: a.lastEventUnix ? hhmm(a.lastEventUnix, timeZone) : "--:--", label: "последнее событие" },
    { icon: "ok", value: a.categoryCounts.positive, label: "позитивные", cls: "pos" },
    { icon: "close", value: a.categoryCounts.negative, label: "негативные", cls: "neg" },
    { icon: "chart", value: a.events.length, label: "всего событий" },
    { icon: "close", value: formatMinutes(a.idleMinutes), label: "бездействие", cls: "idle" },
  ];

  return (
    <section className="sec event-analysis">
      <div className="sec-h">
        <h2>Анализ событий</h2>
        {demo && <span className="chip warn">Тестовый пример · полный день</span>}
        <span className="dim small">
          {minutesToHHMM(startMinutes)}–{minutesToHHMM(endMinutes)}
        </span>
        <div className="sp" />
        {selectedType && (
          <button type="button" className="chip mut ea-filter" onClick={() => setSelectedType(null)} title="Снять выделение типа">
            {TASK_EVENT_LABELS[selectedType] ?? eventLabel(selectedType)} <Icon name="close" size={12} />
          </button>
        )}
        {eventsListLink(crmBase, employeeId, dayKey) && (
          <a className="small" href={eventsListLink(crmBase, employeeId, dayKey) as string} target="_blank" rel="noreferrer noopener">
            события в amoCRM
          </a>
        )}
      </div>
      <div className="card ea-chart">
        <div className="ea-chart-scroll"><div className="ea-chart-plot">
        {a.events.length === 0 && a.calls.length === 0 ? (
          <div className="ea-empty">
            <Icon name="info" />
            <span>Нет событий в рабочем диапазоне</span>
          </div>
        ) : (
          <>
            <div className="hist ea-hist" aria-label="Количество событий по 2-минутным отрезкам">
              {a.bins.map((b) => {
                const future = b.endMinutes > a.visibleEndMinutes;
                if (future) return <i key={b.index} className="fut" style={{ height: "100%" }} />;
                if (!b.events.length) return <i key={b.index} className="idle" title={`${minutesToHHMM(b.startMinutes)} - ${minutesToHHMM(b.endMinutes)}: без событий`} />;
                const h = Math.max(6, (b.events.length / a.maxBinCount) * 100);
                const stack = binStack(b.events);
                const open = pop?.kind === "bin" && pop.bin === b;
                return (
                  <div key={b.index} className={`bin${open ? " hl" : ""}`} style={{ height: `${h}%` }} role="group" aria-label={`События за ${minutesToHHMM(b.startMinutes)} - ${minutesToHHMM(b.endMinutes)}`}>
                    {stack.map((s) => (
                      <button key={s.category} type="button"
                        className={`ea-stack-segment ${muted(s.types) ? "mute" : selectedType ? "match" : ""}${pop?.kind === "bin" && pop.bin === b && pop.category === s.category ? " selected" : ""}`}
                        style={{ flexGrow: s.count, background: CATEGORY_META[s.category].color }}
                        aria-label={`${CATEGORY_META[s.category].label}: ${s.count}, ${minutesToHHMM(b.startMinutes)}–${minutesToHHMM(b.endMinutes)}`}
                        title={`${CATEGORY_META[s.category].label}: ${s.count}`}
                        onClick={(e) => setPop({ kind: "bin", bin: b, category: s.category, ...anchorAt(e, ".ea-chart") })}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="ea-calls" style={{ height: lanes.lanes * (LANE_H + LANE_GAP) + LANE_GAP * 2 }} aria-label="Звонки на шкале времени">
              {futureFrom < endMinutes && <span className="fut" style={{ left: pctOf(futureFrom, startMinutes, endMinutes), right: 0 }} />}
              {lanes.items.map((c) => {
                const e = c.item.event;
                const label = `${CALL_DIRECTION_LABEL[c.item.direction]}: ${hhmm(e.createdAt, timeZone)}, ${c.item.durationKnown ? formatCallDuration(c.item.displaySeconds) : "длительность неизвестна"}`;
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`${muted(e.type) ? "mute" : ""}${highlightCall === e.id ? " hl" : ""}`}
                    style={{ left: pctOf(c.startMinutes, startMinutes, endMinutes), width: spanOf(c.startMinutes, c.endMinutes, startMinutes, endMinutes), top: LANE_GAP + c.lane * (LANE_H + LANE_GAP), height: LANE_H, background: CALL_LANE_COLORS[c.item.direction] }}
                    title={label}
                    aria-label={label}
                    onClick={(ev) => {
                      setHighlightCall(e.id);
                      setPop({ kind: "call", call: c, ...anchorAt(ev, ".ea-chart") });
                    }}
                  />
                );
              })}
            </div>
          </>
        )}
        <div className="axis small" style={{ position: "relative" }}>
          {Array.from({ length: Math.floor((endMinutes - startMinutes) / 60) + 1 }, (_, i) => startMinutes + i * 60)
            .filter((m) => m <= endMinutes)
            .map((m) => (
              <span key={m} className={m === endMinutes ? "axis-end" : undefined} style={{ left: `${((m - startMinutes) / (endMinutes - startMinutes)) * 100}%` }}>
                {minutesToHHMM(m)}
              </span>
            ))}
        </div>
        </div></div>
        {pop?.kind === "bin" && (
          <AnchoredPop x={pop.x} y={pop.y} title={`${CATEGORY_META[pop.category].label} · ${minutesToHHMM(pop.bin.startMinutes)} - ${minutesToHHMM(pop.bin.endMinutes)}`} onClose={() => setPop(null)}>
            {binTypes(pop.bin.events.filter((e) => eventCategory(e.type) === pop.category)).map((t) => (
              <div key={t.key} className="ea-pop-row">
                <Dot color={CATEGORY_META[t.category].color} />
                <span className="lb">{t.label}</span>
                <b>{t.count}</b>
                <ExtLink href={typeLink(t.key)} title="Открыть события в amoCRM" />
              </div>
            ))}
          </AnchoredPop>
        )}
        {pop?.kind === "call" && (
          <AnchoredPop x={pop.x} y={pop.y} title="Звонок" onClose={() => setPop(null)}>
            <CallDetails item={pop.call} timeZone={timeZone} link={callLink(pop.call.item.event)} />
          </AnchoredPop>
        )}
      </div>
      <div className="card ea-details">
        <div className="ea-details-head">
          <h3>События и звонки</h3>
          <div className="ea-sum">
            {summary.map((s) => (
              <span key={s.label} className={`ea-sum-it ${s.cls ?? ""}`}>
                <Icon name={s.icon} /><b>{s.value}</b><span>{s.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="ea-columns">
        <div className="ea-call-list">
          <div className="ch">
            <h3>Звонки</h3>
            <Switch checked={unique} onChange={setUnique} label="уникальные" />
          </div>
          <div className="ea-tabs">
            <Tabs value={tab} onChange={setTab} items={CALL_TABS} />
            <span className="dim small">
              {calls.length} звонков
              {unknown > 0 && ` · ${unknown} без длительности (C1)`}
            </span>
          </div>
          <div className="bars ea-list" style={{ maxHeight: CALLS_VISIBLE * 40 }}>
            {calls.length === 0 && <div className="dim small">Нет звонков в диапазоне</div>}
            {calls.map((c) => {
              const phone = c.event.call?.phone ?? null;
              const link = phone ? phoneSearchLink(crmBase, phone) : null;
              const arrow = CALL_ARROW[c.direction];
              return (
                <div className={`br ea-row${highlightCall === c.event.id ? " on" : ""}`} key={c.event.id}>
                  <button type="button" className="lb" onClick={() => setHighlightCall((h) => (h === c.event.id ? null : c.event.id))} title="Показать на шкале">
                    <span className="ea-arr" style={{ color: CALL_LANE_COLORS[c.direction] }} title={CALL_DIRECTION_LABEL[c.direction]}>
                      {arrow.glyph}
                    </span>
                    <span className="tn">{hhmm(c.event.createdAt, timeZone)}</span> {CALL_DIRECTION_LABEL[c.direction]}
                    {phone && <span className="dim"> · {phoneDisplay(phone)}</span>}
                  </button>
                  <span className="vl">
                    {c.durationKnown ? formatCallDuration(c.displaySeconds) : "—"}
                    {link && <ExtLink href={link} title="Найти контакт по номеру" />}
                    <ExtLink href={callLink(c.event)} title="Открыть связанную сущность в новой вкладке" />
                  </span>
                </div>
              );
            })}
          </div>
          <MoreBelow show={calls.length > CALLS_VISIBLE}>Ещё звонки ниже</MoreBelow>
        </div>
        <div className="ea-tasks">
          <h3>Задачи</h3>
          <div className="bars">
            {a.taskCounts.map((t) => {
              const sub = t.key === "task_result_added";
              return (
                <div className={`br ea-row${sub ? " sub" : ""}${selectedType === t.key ? " on" : ""}`} key={t.key}>
                  <button type="button" className="lb" onClick={() => toggleType(t.key)}>
                    {sub ? <span className="ea-sub" aria-hidden="true">↳</span> : <Dot color={CATEGORY_META[eventCategory(t.key)].color} />}
                    {t.label}
                    {t.key === "task_completed" && taskSeconds !== null && <span className="ea-meta">{taskSeconds > 0 ? formatDurationWithSeconds(taskSeconds) : "время не указано"}</span>}
                  </button>
                  <span className="vl">
                    {t.value}
                    <ExtLink href={typeLink(t.key)} title="Открыть события задач в amoCRM" />
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ea-correct">
            Корректность <b style={{ color: correctnessColor(a.correctnessPercent) }}>{a.correctnessPercent}%</b>
            <HelpTip label="Что такое корректность" align="left">
              *закрыто с результатом, норма: от 75%
            </HelpTip>
          </div>
        </div>
        <div className="ea-types">
          <h3>Другие активности</h3>
          <div className="bars ea-list" style={{ maxHeight: TYPES_VISIBLE * 40 }}>
            {a.typeCounts.length === 0 && <div className="dim small">Нет событий</div>}
            {a.typeCounts.map((t) => (
              <div className={`br ea-row${selectedType === t.key ? " on" : ""}`} key={t.key}>
                <button type="button" className="lb" onClick={() => toggleType(t.key)}>
                  <Dot color={CATEGORY_META[eventCategory(t.key)].color} />
                  {t.label}
                </button>
                <span className="vl">
                  {t.value}
                  <ExtLink href={typeLink(t.key)} title="Открыть в amoCRM" />
                </span>
              </div>
            ))}
          </div>
          <MoreBelow show={a.typeCounts.length > TYPES_VISIBLE}>Ещё активности ниже</MoreBelow>
        </div>
        </div>
      </div>
      <div className="card ea-legend">
        {(Object.keys(CATEGORY_META) as EventCategory[]).map((k) => (
          <div key={k}>
            <div><Dot color={CATEGORY_META[k].color} /><b>{CATEGORY_META[k].label}</b></div>
            <p>{CATEGORY_META[k].description}</p>
          </div>
        ))}
      </div>
      <div className="card ea-note"><Icon name="info" size={14} />Цветовая индикация помогает оценить характер событий: красный — негатив, синий — нейтрально, зелёный — позитив, жёлтый — контекст.</div>
    </section>
  );
}

function CallDetails({ item, timeZone, link }: { item: CallLaneItem; timeZone: string; link: string | null }) {
  const c = item.item;
  const phone = c.event.call?.phone ?? null;
  return (
    <div className="ea-call">
      <div className="ea-call-h">
        <Dot color={CALL_LANE_COLORS[c.direction]} />
        <b>{CALL_DIRECTION_LABEL[c.direction]}</b>
        <span className="dim">
          {hhmm(c.event.createdAt, timeZone)} - {minutesToHHMM(Math.floor(item.endMinutes))}
        </span>
      </div>
      <dl>
        <dt>Длительность</dt>
        <dd>{c.durationKnown ? formatCallDuration(c.displaySeconds) : "—"}</dd>
        <dt>Номер</dt>
        <dd>{phone ? phoneDisplay(phone) : "—"}</dd>
      </dl>
      {link && (
        <a className="lane-link" href={link} target="_blank" rel="noreferrer noopener">
          Открыть
        </a>
      )}
    </div>
  );
}
