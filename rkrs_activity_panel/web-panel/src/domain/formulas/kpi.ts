// KPI строки сотрудника (EmployeeTimelineStatistics.vue).
// Сравнение «сегодня / вчера»: вчерашнее значение null означает
// «нет данных» (F3), а не ноль; тренд считается только при известном вчера.

import { KPI_PREDICATES, isDashboardCall, type CountKpi } from "../eventCatalog";
import type { CrmEvent } from "../types";

export interface KpiValue {
  today: number;
  yesterday: number | null;
  trend: "up" | "down" | "equal" | null;
}

export interface RowKpis {
  totalCallSeconds: number;
  /** Звонки, у которых источник не передал длительность. */
  callsWithoutDuration: number;
  counts: Record<CountKpi, KpiValue>;
}

export function trendOf(today: number, yesterday: number | null): KpiValue["trend"] {
  if (yesterday === null) return null;
  if (today > yesterday) return "up";
  if (today < yesterday) return "down";
  return "equal";
}

export function rowKpis(today: CrmEvent[], yesterday: CrmEvent[] | null): RowKpis {
  const counts = {} as Record<CountKpi, KpiValue>;
  for (const key of Object.keys(KPI_PREDICATES) as CountKpi[]) {
    const predicate = KPI_PREDICATES[key];
    const t = today.filter(predicate).length;
    const y = yesterday ? yesterday.filter(predicate).length : null;
    counts[key] = { today: t, yesterday: y, trend: trendOf(t, y) };
  }
  let totalCallSeconds = 0;
  let callsWithoutDuration = 0;
  for (const event of today) {
    if (!isDashboardCall(event)) continue;
    const duration = event.call?.durationSeconds;
    if (duration === null || duration === undefined) callsWithoutDuration += 1;
    else totalCallSeconds += Math.max(0, duration);
  }
  return { totalCallSeconds, callsWithoutDuration, counts };
}
