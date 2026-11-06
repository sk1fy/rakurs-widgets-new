// Блок «Итоги» (контракт period-v1 §8.1). Σ — по выбранным сотрудникам и
// counted дням; прошлый период — «до той же точки» (§4).

import { KPI_INDEX, previousUpToCut, type DayStat, type PeriodStats } from "../../period";
import type { EmployeeId } from "../../types";

/** Изменение к прошлому периоду: none — нет прошлого периода, same — оба 0. */
export type Delta =
  | { kind: "none" }
  | { kind: "same" }
  | { kind: "pct"; ratio: number; tone: "good" | "bad" | "flat" };

/** (cur − prev) / prev; prev = 0 и cur > 0 → +100%. inverse — рост плохо (простой). */
export function relativeDelta(cur: number, prev: number | null, inverse = false): Delta {
  if (prev === null) return { kind: "none" };
  if (prev === 0 && cur === 0) return { kind: "same" };
  const ratio = prev === 0 ? 1 : (cur - prev) / prev;
  if (Math.abs(ratio) < 0.005) return { kind: "pct", ratio, tone: "flat" };
  return { kind: "pct", ratio, tone: (inverse ? ratio <= 0 : ratio >= 0) ? "good" : "bad" };
}

export interface PeriodSums {
  outgoingCalls: number;
  messages: number;
  outgoingMail: number;
  completedTasks: number;
  leadStatusChanges: number;
  events: number;
  /** Минуты. */
  active: number;
  idle: number;
  countedDays: number;
}

export function sumDays(days: readonly DayStat[]): PeriodSums {
  const s: PeriodSums = { outgoingCalls: 0, messages: 0, outgoingMail: 0, completedTasks: 0, leadStatusChanges: 0, events: 0, active: 0, idle: 0, countedDays: 0 };
  for (const d of days) {
    if (!d.counted) continue;
    s.outgoingCalls += d.kpi[KPI_INDEX.outgoingCalls];
    s.messages += d.kpi[KPI_INDEX.messages];
    s.outgoingMail += d.kpi[KPI_INDEX.outgoingMail];
    s.completedTasks += d.kpi[KPI_INDEX.completedTasks];
    s.leadStatusChanges += d.kpi[KPI_INDEX.leadStatusChanges];
    s.events += d.events;
    s.active += d.active;
    s.idle += d.idleInside;
    s.countedDays += 1;
  }
  return s;
}

/** Текущий период сотрудника и прошлый «до той же точки» (null — прошлого периода нет). */
export function employeeSums(stats: PeriodStats, employeeId: EmployeeId): { current: PeriodSums; previous: PeriodSums | null } | null {
  const e = stats.byEmployee.get(employeeId);
  if (!e) return null;
  const prev = stats.previous.available && e.previous ? sumDays(previousUpToCut(e.previous.days, stats.previous.cut, e.previous.cutDay)) : null;
  return { current: sumDays(e.current.days), previous: prev };
}

export type TotalKey = "outgoingCalls" | "completedTasks" | "leadStatusChanges" | "events" | "outgoingMail" | "active" | "idle";

export interface TotalTile {
  key: TotalKey;
  label: string;
  hint?: string;
  format: "count" | "minutes";
  value: number;
  previous: number | null;
  delta: Delta;
}

export interface PeriodTotals {
  tiles: TotalTile[];
  /** «Прошло дней: N» — максимум counted дней среди выбранных сотрудников. */
  daysPassed: number;
  previousAvailable: boolean;
}

const TILES: { key: TotalKey; label: string; hint?: string; format: TotalTile["format"]; inverse?: boolean }[] = [
  { key: "outgoingCalls", label: "Исходящие звонки", format: "count" },
  { key: "completedTasks", label: "Закрытые задачи", format: "count" },
  { key: "leadStatusChanges", label: "Переведённые сделки", format: "count", hint: "любая смена этапа" },
  { key: "events", label: "Все активности", format: "count", hint: "звонки, сообщения, письма, задачи, сделки" },
  { key: "outgoingMail", label: "Письма", format: "count" },
  { key: "active", label: "Рабочее время", format: "minutes", hint: "интервалы активности, сумма по дням" },
  { key: "idle", label: "Простой", format: "minutes", inverse: true, hint: "паузы без событий внутри рабочего дня" },
];

export function periodTotals(stats: PeriodStats, employeeIds: readonly EmployeeId[]): PeriodTotals {
  const empty = sumDays([]);
  const cur = { ...empty };
  const prev = { ...empty };
  let previousAvailable = stats.previous.available && employeeIds.length > 0;
  let daysPassed = 0;
  for (const id of employeeIds) {
    const sums = employeeSums(stats, id);
    if (!sums) continue;
    daysPassed = Math.max(daysPassed, sums.current.countedDays);
    for (const k of Object.keys(cur) as (keyof PeriodSums)[]) cur[k] += sums.current[k];
    if (sums.previous) for (const k of Object.keys(prev) as (keyof PeriodSums)[]) prev[k] += sums.previous[k];
    else previousAvailable = false;
  }
  return {
    daysPassed,
    previousAvailable,
    tiles: TILES.map((t) => {
      const previous = previousAvailable ? prev[t.key] : null;
      return { key: t.key, label: t.label, hint: t.hint, format: t.format, value: cur[t.key], previous, delta: relativeDelta(cur[t.key], previous, t.inverse) };
    }),
  };
}
