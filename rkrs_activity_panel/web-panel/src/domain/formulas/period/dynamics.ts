// Блок «Динамика» (контракт period-v1 §8.4): сумма по выбранным сотрудникам
// по индексу дня; день без данных (будущий, pending, unavailable) — null;
// прошлый период — целиком (пунктир).

import { KPI_INDEX, type DayStat, type PeriodStats } from "../../period";
import type { EmployeeId } from "../../types";

export type DynamicsMetric = "outgoingCalls" | "completedTasks";

export interface DynamicsSeries {
  /** По дню текущего периода. */
  current: (number | null)[];
  /** По дню прошлого периода; null — прошлого периода нет. */
  previous: (number | null)[] | null;
  max: number;
}

const hasData = (d: DayStat | undefined) => d !== undefined && (d.state === "ready" || d.state === "today");

function series(dayLists: readonly (readonly DayStat[])[], length: number, metric: DynamicsMetric): (number | null)[] {
  const k = KPI_INDEX[metric];
  return Array.from({ length }, (_, i) => {
    let sum = 0;
    let any = false;
    for (const days of dayLists) {
      const d = days[i];
      if (!hasData(d)) continue;
      any = true;
      if (d?.counted) sum += d.kpi[k];
    }
    return any ? sum : null;
  });
}

export function dynamicsSeries(stats: PeriodStats, employeeIds: readonly EmployeeId[], metric: DynamicsMetric): DynamicsSeries {
  const emps = employeeIds.flatMap((id) => stats.byEmployee.get(id) ?? []);
  const current = series(emps.map((e) => e.current.days), stats.current.days.length, metric);
  const prevLists = emps.flatMap((e) => (e.previous ? [e.previous.days] : []));
  const previous = stats.previous.available && emps.length > 0 && prevLists.length === emps.length ? series(prevLists, stats.previous.days.length, metric) : null;
  const max = Math.max(0, ...current.filter((v): v is number => v !== null), ...(previous ?? []).filter((v): v is number => v !== null));
  return { current, previous, max };
}
