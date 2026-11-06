// Загрузки дневного экрана. Каждый блок грузится независимо (F3: ошибка
// вчерашних данных не блокирует сегодняшние и показывается как «—»).

import { useMemo } from "react";
import { ACTIVE_REFRESH_MS, useResource, type Resource } from "../../app/hooks";
import type { ActivitySource, ActivityRatings, Sourced } from "../../api/source";
import { todayKey } from "../../domain/time";
import type { DayEvents, PanelContext, ProblemLists } from "../../domain/types";
import { useProblemLists } from "./useProblemLists";
import { dayRange, previousDayRange, type DayWindow } from "./model";

export const DAY_REFRESH_MS = ACTIVE_REFRESH_MS;

export interface DashboardData {
  today: Resource<DayEvents>;
  ratings: Resource<ActivityRatings>;
  yesterday: Resource<DayEvents>;
  problems: Resource<Sourced<ProblemLists>>;
  /** События сегодняшнего дня для пропущенных звонков и план/факта (F5). */
  current: Resource<DayEvents> | null;
}

export function useDashboardData(source: ActivitySource, panel: PanelContext, win: DayWindow, nowUnix: number, currentWin: DayWindow): DashboardData {
  const tz = panel.timezone;
  const range = useMemo(() => dayRange(win, tz), [win, tz]);
  const prevRange = useMemo(() => previousDayRange(win, tz), [win, tz]);
  const live = win.isToday;

  const today = useResource(`day:${range.from}:${range.to}`, (signal) => source.loadDayEvents(range, signal), { refreshMs: live ? DAY_REFRESH_MS : null });
  const cutoffUnix = win.isToday ? today.data?.meta.snapshotAt ?? nowUnix : null;
  const ratings = useResource(today.data ? `rating:${range.from}:${range.to}:${win.startMinutes}:${win.endMinutes}` : null,
    (signal) => source.loadActivityRatings({ ...range, surface: "dashboard", startMinutes: win.startMinutes, endMinutes: win.endMinutes, cutoffUnix }, signal),
    { refreshKey: `${today.updatedAt}:${cutoffUnix}` });
  const yesterday = useResource(`prev:${prevRange.from}:${prevRange.to}`, (signal) => source.loadDayEvents(prevRange, signal));
  const problems = usePanelProblems(source, panel);
  const current = useCurrentDayEvents(source, panel, currentWin, !live);

  return { today, ratings, yesterday, problems, current: win.isToday ? null : current };
}

export function usePanelProblems(source: ActivitySource, panel: PanelContext) {
  const managers = useMemo(() => panel.employees.map((e) => e.id), [panel.employees]);
  return useProblemLists(source, `problems:${todayKey(panel.timezone)}:${managers.join(",")}:${panel.pipelines.join(",")}`, managers, panel.pipelines);
}

export function useCurrentDayEvents(source: ActivitySource, panel: PanelContext, win: DayWindow, enabled = true) {
  const range = dayRange(win, panel.timezone);
  return useResource(enabled ? `current:${range.from}:${range.to}` : null, (signal) => source.loadDayEvents(range, signal), { refreshMs: DAY_REFRESH_MS });
}
