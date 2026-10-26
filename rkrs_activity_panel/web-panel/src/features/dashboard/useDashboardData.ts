// Загрузки дневного экрана. Каждый блок грузится независимо (F3: ошибка
// вчерашних данных не блокирует сегодняшние и показывается как «—»).
// Автообновление: сегодня каждые 4 мин до конца рабочего окна (F1:
// первый тик через 4 мин); пропущенные — каждые 10 мин, проблемные списки
// по серверному сроку общего среза (7 мин) и чаще во время сбора,
// всегда за «сегодня» (F5).

import { useMemo } from "react";
import { useResource, type Resource } from "../../app/hooks";
import type { ActivitySource, ActivityRatings, Sourced } from "../../api/source";
import { minutesOfDay, todayKey } from "../../domain/time";
import type { DayEvents, PanelContext, ProblemLists } from "../../domain/types";
import { useProblemLists } from "./useProblemLists";
import { dayRange, previousDayRange, type DayWindow } from "./model";

export const DAY_REFRESH_MS = 4 * 60_000;
export const SNAPSHOT_REFRESH_MS = 10 * 60_000;

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
  const currentRange = useMemo(() => dayRange(currentWin, tz), [currentWin, tz]);
  const beforeEnd = minutesOfDay(nowUnix, tz) <= win.endMinutes;
  const live = win.isToday && beforeEnd;

  const today = useResource(`day:${range.from}:${range.to}`, (signal) => source.loadDayEvents(range, signal), { refreshMs: live ? DAY_REFRESH_MS : null });
  const cutoffUnix = win.isToday ? today.data?.meta.snapshotAt ?? nowUnix : null;
  const ratings = useResource(today.data ? `rating:${range.from}:${range.to}:${win.startMinutes}:${win.endMinutes}` : null,
    (signal) => source.loadActivityRatings({ ...range, surface: "dashboard", startMinutes: win.startMinutes, endMinutes: win.endMinutes, cutoffUnix }, signal),
    { refreshKey: `${today.updatedAt}:${cutoffUnix}` });
  const yesterday = useResource(`prev:${prevRange.from}:${prevRange.to}`, (signal) => source.loadDayEvents(prevRange, signal));
  const managers = useMemo(() => panel.employees.map((e) => e.id), [panel.employees]);
  const problems = useProblemLists(source, `problems:${todayKey(tz)}:${managers.join(",")}:${panel.pipelines.join(",")}`, managers, panel.pipelines);
  const current = useResource(win.isToday ? null : `current:${currentRange.from}`, (signal) => source.loadDayEvents(currentRange, signal), { refreshMs: SNAPSHOT_REFRESH_MS });

  return { today, ratings, yesterday, problems, current: win.isToday ? null : current };
}
