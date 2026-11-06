// Блок «Сравнение рабочих дней» (period-v1 §8.5): по сотруднику, ленты дней
// грузятся лениво (§5.2) при раскрытии группы.

import { useMemo, useState } from "react";
import { usePanelScope } from "../../app/context";
import { href } from "../../app/router";
import { dayChipNote, defaultSelectedDays, isSelectableDay, pluralEvents, recurringPauses, workdaysSummary, type RecurringPause } from "../../domain/formulas/period/workdays";
import { dayChipLabel, dayLongLabel, isWeekend, SEGMENT_MINUTES, type DayStat, type PeriodDaySegments, type PeriodStats } from "../../domain/period";
import { formatMinutes, minutesToHHMM } from "../../domain/time";
import type { Employee } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { ErrorState, Skeleton, Switch } from "../../ui/primitives";
import { TimeAxis } from "../dashboard/Timeline";
import { useEmployeePeriodDays } from "./usePeriodData";

type StripMode = "zones" | "activity";

const ZONES: Record<string, { name: string; color: string }> = {
  C: { name: "Звонки", color: "var(--tl-call)" },
  T: { name: "Задачи", color: "#9654f1" },
  I: { name: "Imbox", color: "#54b5b5" },
  D: { name: "Сделки", color: "var(--tl-crm)" },
  O: { name: "Прочее CRM", color: "var(--tx3)" },
};
const KINDS: Record<string, { name: string; color: string }> = {
  "1": { name: "активность в amoCRM", color: "var(--tl-crm)" },
  "2": { name: "звонок", color: "var(--tl-call)" },
  "0": { name: "пауза", color: "rgba(255,77,79,.55)" },
};

interface Run {
  value: string;
  from: number;
  to: number;
}

function runsOf(line: string): Run[] {
  const out: Run[] = [];
  for (let i = 0; i < line.length; ) {
    let j = i + 1;
    while (j < line.length && line[j] === line[i]) j++;
    out.push({ value: line[i] as string, from: i, to: j });
    i = j;
  }
  return out;
}

function DayStrip({ strip, mode, pauses, startMinutes, endMinutes }: { strip: PeriodDaySegments; mode: StripMode; pauses: RecurringPause[]; startMinutes: number; endMinutes: number }) {
  const line = mode === "zones" ? strip.zones : strip.kinds;
  const total = line.length || 1;
  const at = (i: number) => minutesToHHMM(Math.min(endMinutes, startMinutes + i * SEGMENT_MINUTES));
  const pos = (from: number, to: number) => ({ left: `${((from / total) * 100).toFixed(3)}%`, width: `${(((to - from) / total) * 100).toFixed(3)}%` });
  if (strip.first === null) {
    return (
      <div className="pd-strip empty">
        {runsOf(strip.kinds).filter((r) => r.value === ".").map((r) => <span key={r.from} className="fut" style={pos(r.from, r.to)} />)}
        <span className="empty-l">{strip.partial || strip.coverage === "partial" ? "Неполные данные ленты" : "Нет зарегистрированных событий"}</span>
      </div>
    );
  }
  return (
    <div className={`pd-strip ${mode}`}>
      {runsOf(line).map((r) => {
        if (r.value === ".") return <span key={r.from} className="fut" style={pos(r.from, r.to)} title={`${at(r.from)}–${at(r.to)} · ещё не наступило`} />;
        const meta = mode === "zones" ? ZONES[r.value] : KINDS[r.value];
        if (!meta) return null;
        return <span key={r.from} style={{ ...pos(r.from, r.to), background: meta.color }} title={`${at(r.from)}–${at(r.to)} · ${meta.name} · ${(r.to - r.from) * SEGMENT_MINUTES} мин`} />;
      })}
      {pauses.map((p) => <span key={p.fromSegment} className="pd-pause" style={pos(p.fromSegment, p.toSegment)} title={`повторяющаяся пауза ${minutesToHHMM(p.from)}–${minutesToHHMM(p.to)} · ${p.days} из ${p.outOf} дней`} />)}
    </div>
  );
}

function StripLegend({ mode }: { mode: StripMode }) {
  const items = mode === "zones" ? [...Object.values(ZONES), { name: "Нет событий", color: "var(--inset)" }] : Object.values(KINDS);
  return (
    <div className="legend">
      {items.map((it) => <span key={it.name}><i style={{ background: it.color }} />{it.name}</span>)}
      <span><i style={{ background: "var(--tl-future)" }} />ещё не наступило</span>
    </div>
  );
}

function WorkdayGroup({ employee, stats, today, open, onToggle }: { employee: Employee; stats: PeriodStats; today: string; open: boolean; onToggle: () => void }) {
  const { source, viewKey } = usePanelScope();
  const days = useMemo(() => stats.byEmployee.get(employee.id)?.current.days ?? [], [stats, employee.id]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelectedDays(days)));
  const [mode, setMode] = useState<StripMode>("zones");
  const [showPauses, setShowPauses] = useState(true);
  const toDay = stats.current.end < today ? stats.current.end : today;
  const strips = useEmployeePeriodDays(source, employee.id, stats, toDay, open);
  const chosen = days.filter((d) => selected.has(d.day) && isSelectableDay(d));
  const summary = workdaysSummary(chosen);
  const stripByDay = new Map((strips.data?.days ?? []).map((d) => [d.day, d]));
  const chosenStrips = chosen.flatMap((d) => stripByDay.get(d.day) ?? []);
  const pauses = showPauses ? recurringPauses(chosenStrips, stats.startMinutes, stats.endMinutes) : [];
  const toggleDay = (day: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    return next;
  });
  const select = (pick: (d: DayStat) => boolean) => setSelected(new Set(days.filter((d) => isSelectableDay(d) && pick(d)).map((d) => d.day)));
  return (
    <section className={`grp pv-grp${open ? "" : " closed"}`}>
      <button type="button" className="grp-h" aria-expanded={open} onClick={onToggle}>
        <span>
          {employee.name}
          <span className="cnt">
            дней: {summary.daysWithActivity} · активность: {formatMinutes(summary.active)} · {pluralEvents(summary.events)}
          </span>
        </span>
        <Icon name="chev" />
      </button>
      {open && (
        <div className="grp-b">
          <div className="pv-toolbar">
            <span className="dim small">Выбрано {chosen.length} из {days.length} дней</span>
            <button type="button" className="tool-btn" onClick={() => select(() => true)}>Все дни</button>
            <button type="button" className="tool-btn" onClick={() => select((d) => !isWeekend(d.day))}>Пн–Пт</button>
            <button type="button" className="tool-btn" onClick={() => setSelected(new Set())}>Сбросить</button>
          </div>
          <div className="chips pv-chips">
            {days.map((d) => {
              const enabled = isSelectableDay(d);
              const on = enabled && selected.has(d.day);
              return (
                <label key={d.day} className={`chip ${on ? "info" : "mut"} pv-chip${enabled ? "" : " off"}`} title={d.partial ? "День посчитан по неполной выборке событий" : undefined}>
                  <input type="checkbox" checked={on} disabled={!enabled} onChange={() => toggleDay(d.day)} />
                  {dayChipLabel(d.day)}
                  <span className="n">{dayChipNote(d)}{d.partial ? " · неполные" : ""}</span>
                </label>
              );
            })}
          </div>
          <div className="sum-row">
            <div className="sum-card"><div className="k">Первое событие · медиана</div><div className="v">{summary.medianFirst === null ? "—" : minutesToHHMM(summary.medianFirst)}</div><div className="s">{summary.daysWithActivity} дн. с событиями</div></div>
            <div className="sum-card"><div className="k">Последнее событие · медиана</div><div className="v">{summary.medianLast === null ? "—" : minutesToHHMM(summary.medianLast)}</div><div className="s">{summary.spread === null ? "—" : `разброс ${summary.spread} мин`}</div></div>
            <div className="sum-card"><div className="k">Интервалы активности</div><div className="v">{formatMinutes(summary.active)}</div><div className="s">сумма по выбранным дням</div></div>
            <div className="sum-card"><div className="k">Зарегистрировано в CRM</div><div className="v">{summary.events}</div><div className="s">событий</div></div>
          </div>
          <div className="pv-mode">
            <div className="mini" role="tablist" aria-label="Режим ленты">
              <button type="button" role="tab" aria-selected={mode === "zones"} className={mode === "zones" ? "on" : undefined} onClick={() => setMode("zones")}>Зоны CRM</button>
              <button type="button" role="tab" aria-selected={mode === "activity"} className={mode === "activity" ? "on" : undefined} onClick={() => setMode("activity")}>Активность и паузы</button>
            </div>
            <StripLegend mode={mode} />
            <div className="sp" />
            <Switch checked={showPauses} onChange={setShowPauses} label="Повторяющиеся паузы" />
          </div>
          {strips.status === "error" && <ErrorState compact error={strips.error} onRetry={strips.reload} />}
          <div className="tbl-wrap pv-tbl">
            <table className="tbl pv-days">
              <thead>
                <tr>
                  <th>День</th>
                  <th className="pv-axis"><TimeAxis startMinutes={stats.startMinutes} endMinutes={stats.endMinutes} small /></th>
                  <th className="num">Первое</th>
                  <th className="num">Последнее</th>
                  <th className="num">Активность</th>
                  <th className="num">События</th>
                </tr>
              </thead>
              <tbody>
                {chosen.length === 0 && (
                  <tr><td colSpan={6} className="dim">Выберите хотя бы один день</td></tr>
                )}
                {chosen.map((d) => {
                  const strip = stripByDay.get(d.day);
                  const stripPartial = strip?.partial || strip?.coverage === "partial";
                  return (
                    <tr key={d.day}>
                      <td>
                        <div>
                          {dayLongLabel(d.day)}
                          {d.state === "today" && <span className="mut"> · идёт</span>}
                          {(d.partial || stripPartial) && <span className="chip warn pv-mini-chip" title="День посчитан по неполной выборке событий">неполные</span>}
                        </div>
                        <a className="link-btn small" href={href({ name: "dashboard", viewKey, date: d.day === today ? null : d.day })}>Открыть день</a>
                      </td>
                      <td className="pv-strip-cell">
                        {strip && !strip.kinds ? <span className="dim small">Лента недоступна</span> : strip ? <DayStrip strip={strip} mode={mode} pauses={pauses} startMinutes={stats.startMinutes} endMinutes={stats.endMinutes} /> : strips.status === "error" ? <span className="dim small">лента не загрузилась</span> : <Skeleton height={22} />}
                      </td>
                      <td className="num">{d.first === null ? "—" : minutesToHHMM(d.first)}</td>
                      <td className="num">{d.last === null ? "—" : minutesToHHMM(d.last)}</td>
                      <td className="num">{formatMinutes(d.active)}</td>
                      <td className="num">{d.events}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">
            Пауза — отсутствие зарегистрированных действий в CRM; цвета — зоны CRM, а не местоположение. Отрезки по {SEGMENT_MINUTES} минуты. Повторяющаяся пауза — окно ≥ 16 минут без событий не менее чем в 60% выбранных дней с активностью.
          </p>
        </div>
      )}
    </section>
  );
}

export function WorkdaysSection({ stats, employees, today }: { stats: PeriodStats; employees: Employee[]; today: string }) {
  const ordered = useMemo(
    () => [...employees].sort((a, b) => (stats.byEmployee.get(b.id)?.current.rating ?? -1) - (stats.byEmployee.get(a.id)?.current.rating ?? -1) || a.name.localeCompare(b.name, "ru")),
    [employees, stats],
  );
  // Первые два по рейтингу раскрыты при открытии периода; дальше — как решил зритель.
  const [open, setOpen] = useState<Map<number, boolean>>(() => new Map(ordered.map((e, i) => [e.id, i < 2])));
  const isOpen = (id: number) => open.get(id) ?? false;
  return (
    <section className="sec pv-work">
      <div className="sec-h">
        <h2>Сравнение рабочих дней</h2>
        <div className="sp" />
        <div className="mini">
          <button type="button" onClick={() => setOpen(new Map(ordered.map((e) => [e.id, false])))}>Свернуть все</button>
        </div>
      </div>
      {ordered.map((e) => (
        <WorkdayGroup key={e.id} employee={e} stats={stats} today={today} open={isOpen(e.id)} onToggle={() => setOpen((m) => new Map(m).set(e.id, !(m.get(e.id) ?? false)))} />
      ))}
    </section>
  );
}
