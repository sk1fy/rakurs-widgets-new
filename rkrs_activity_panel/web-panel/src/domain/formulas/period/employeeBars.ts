// Блок «Сотрудники» (контракт period-v1 §8.3): Σactive, Σevents, рейтинг,
// % к прошлому периоду до той же точки; полоса — от максимума.

import type { PeriodStats } from "../../period";
import type { EmployeeId } from "../../types";
import { employeeSums, relativeDelta, type Delta } from "./totals";

export interface EmployeeBar {
  employeeId: EmployeeId;
  active: number;
  events: number;
  rating: number | null;
  activeDelta: Delta;
  eventsDelta: Delta;
  /** Длина полосы 0..1 от максимума среди выбранных. */
  activeShare: number;
  eventsShare: number;
}

export function employeeBars(stats: PeriodStats, employeeIds: readonly EmployeeId[]): EmployeeBar[] {
  const rows = employeeIds.flatMap((id) => {
    const sums = employeeSums(stats, id);
    if (!sums) return [];
    return [{ id, sums, rating: stats.byEmployee.get(id)?.current.rating ?? null }];
  });
  const maxActive = Math.max(1, ...rows.map((r) => r.sums.current.active));
  const maxEvents = Math.max(1, ...rows.map((r) => r.sums.current.events));
  return rows
    .map(({ id, sums, rating }) => ({
      employeeId: id,
      active: sums.current.active,
      events: sums.current.events,
      rating,
      activeDelta: relativeDelta(sums.current.active, sums.previous?.active ?? null),
      eventsDelta: relativeDelta(sums.current.events, sums.previous?.events ?? null),
      activeShare: sums.current.active / maxActive,
      eventsShare: sums.current.events / maxEvents,
    }))
    .sort((a, b) => b.active - a.active);
}
