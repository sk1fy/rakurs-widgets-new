// Загрузка недели/месяца. Текущий период обновляется как дневной экран
// (ACTIVE_REFRESH_MS); дни в состоянии pending перезапрашиваются по refresh_after.

import { useEffect, useMemo } from "react";
import { ACTIVE_REFRESH_MS, useResource, type Resource } from "../../app/hooks";
import type { ActivitySource } from "../../api/source";
import type { EmployeePeriodDays, Period, PeriodStats } from "../../domain/period";
import type { EmployeeId, PanelContext } from "../../domain/types";
import type { DayWindow } from "../dashboard/model";

export const PERIOD_REFRESH_MS = ACTIVE_REFRESH_MS;
/** Не чаще одного внепланового запроса в 5 секунд, даже если refresh_after уже прошёл. */
const MIN_PENDING_DELAY_MS = 5_000;

export function usePeriodStats(source: ActivitySource, panel: PanelContext, period: Period, win: DayWindow, isCurrent: boolean): Resource<PeriodStats> {
  // Грузим всех сотрудников панели: смена выбора в боковой панели не перезапрашивает данные.
  const ids = useMemo(() => panel.employees.map((e) => e.id), [panel.employees]);
  const key = `period:${period.kind}:${period.start}:${win.startMinutes}:${win.endMinutes}:${ids.join(",")}`;
  const stats = useResource(key, (signal) => source.loadPeriodStats({ kind: period.kind, anchor: period.start, startMinutes: win.startMinutes, endMinutes: win.endMinutes, cutoffUnix: null, employeeIds: ids }, signal), { refreshMs: isCurrent ? PERIOD_REFRESH_MS : null });
  const refreshAfter = stats.data?.refreshAfter ?? null;
  const { reload, updatedAt } = stats;
  // Каждый ответ с pending-днями планирует следующий запрос, даже если refresh_after не изменился.
  useEffect(() => {
    if (refreshAfter === null) return;
    const t = setTimeout(reload, Math.max(MIN_PENDING_DELAY_MS, refreshAfter * 1000 - Date.now()));
    return () => clearTimeout(t);
  }, [refreshAfter, reload, updatedAt]);
  return stats;
}

/** Ленты дней сотрудника (§5.2) — только когда группа раскрыта; обновляются вместе со статистикой периода. */
export function useEmployeePeriodDays(source: ActivitySource, employeeId: EmployeeId, stats: PeriodStats, toDay: string, enabled: boolean): Resource<EmployeePeriodDays> {
  const key = enabled ? `period-days:${employeeId}:${stats.current.start}:${toDay}:${stats.startMinutes}:${stats.endMinutes}` : null;
  return useResource(key, (signal) => source.loadEmployeePeriodDays(employeeId, { fromDay: stats.current.start, toDay, startMinutes: stats.startMinutes, endMinutes: stats.endMinutes, cutoffUnix: stats.cutoffUnix }, signal), { refreshKey: stats.cutoffUnix });
}
