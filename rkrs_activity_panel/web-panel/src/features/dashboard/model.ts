// Чистая сборка строк дневного экрана из загруженных данных. Без React —
// чтобы правила (отсечка, сравнение со вчера, сортировка, фильтры) проверялись тестами.

import { dashboardActivityPercent } from "../../domain/formulas/dashboardActivity";
import { rowKpis, type RowKpis } from "../../domain/formulas/kpi";
import { filterByPipelines } from "../../domain/formulas/pipelineFilter";
import { buildTimelineRow, type TimelineRow } from "../../domain/formulas/timelineRow";
import { addDays, minutesOfDay, parseHHMM, unixAt, zoned } from "../../domain/time";
import type { CrmEvent, DayEvents, Employee, EmployeeId, PanelContext, ProblemCount, ProblemLists } from "../../domain/types";
import type { LocalPreferences, SortOrder } from "../../settings/models";

export interface DayWindow {
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  isToday: boolean;
}

export function resolveWindow(panel: PanelContext, prefs: LocalPreferences, dayKey: string, nowUnix: number): DayWindow {
  const w = prefs.workWindow ?? panel.displayWindow;
  const startMinutes = parseHHMM(w.from) ?? 540;
  let endMinutes = parseHHMM(w.to) ?? 1080;
  if (endMinutes <= startMinutes) endMinutes = Math.min(24 * 60, startMinutes + 60);
  return { dayKey, startMinutes, endMinutes, isToday: zoned(nowUnix, panel.timezone).dayKey === dayKey };
}

/** Диапазон загрузки дня: рабочее окно выбранного дня. */
export function dayRange(win: DayWindow, timeZone: string) {
  return { dayKey: win.dayKey, from: unixAt(win.dayKey, win.startMinutes, timeZone), to: unixAt(win.dayKey, win.endMinutes, timeZone) };
}

/** Окно предыдущего календарного дня (загружается целиком, отсекается при расчёте). */
export function previousDayRange(win: DayWindow, timeZone: string) {
  return dayRange({ ...win, dayKey: addDays(win.dayKey, -1) }, timeZone);
}

/**
 * Граница сравнения со вчера.
 * Сегодня — то же время на часах вчера (как в старой панели).
 * F11: для прошедшего дня — весь рабочий день накануне (старая панель
 * сравнивала с текущим временем на часах даже для истории).
 */
export function comparisonCutoff(win: DayWindow, timeZone: string, nowUnix: number): number {
  const prev = addDays(win.dayKey, -1);
  if (!win.isToday) return unixAt(prev, win.endMinutes, timeZone);
  return unixAt(prev, minutesOfDay(nowUnix, timeZone), timeZone) + (nowUnix % 60);
}

export interface EmployeeRow {
  employee: Employee;
  events: CrmEvent[];
  percent: number;
  kpis: RowKpis;
  timeline: TimelineRow;
  problems: { noTasks: ProblemCount | null; failed: ProblemCount | null; overdue: ProblemCount | null };
}

export interface GroupBlock {
  id: string;
  name: string;
  rows: EmployeeRow[];
  total: number;
}

export function buildRows(params: {
  panel: PanelContext;
  win: DayWindow;
  today: DayEvents;
  yesterday: DayEvents | null;
  problems: ProblemLists | null;
  nowUnix: number;
  /** Момент среза текущих данных — отсечка процента для сегодня. */
  cutoffUnix: number | null;
}): EmployeeRow[] {
  const { panel, win, today, yesterday, problems, nowUnix } = params;
  const tz = panel.timezone;
  const yCut = comparisonCutoff(win, tz, nowUnix);
  const byId = <T extends { managerId: EmployeeId }>(list: T[] | undefined, id: EmployeeId) => list?.find((p) => p.managerId === id) ?? null;
  return panel.employees.map((employee) => {
    const events = filterByPipelines(today.byEmployee.get(employee.id) ?? [], panel.pipelines);
    const yEvents = yesterday ? filterByPipelines(yesterday.byEmployee.get(employee.id) ?? [], panel.pipelines).filter((e) => e.createdAt <= yCut) : null;
    return {
      employee,
      events,
      percent: dashboardActivityPercent({
        events,
        dayKey: win.dayKey,
        timeZone: tz,
        startMinutes: win.startMinutes,
        endMinutes: win.endMinutes,
        cutoffUnix: win.isToday ? params.cutoffUnix ?? nowUnix : null,
      }),
      kpis: rowKpis(events, yEvents),
      timeline: buildTimelineRow({ events, dayKey: win.dayKey, timeZone: tz, startMinutes: win.startMinutes, endMinutes: win.endMinutes, nowUnix: win.isToday ? nowUnix : null }),
      problems: {
        noTasks: byId(problems?.leadsNoTasks, employee.id),
        failed: byId(problems?.leadsWithFailedTasks, employee.id),
        overdue: byId(problems?.overdueTasks, employee.id),
      },
    };
  });
}

export function sortRows(rows: EmployeeRow[], order: SortOrder): EmployeeRow[] {
  const copy = [...rows];
  if (order === "name") return copy.sort((a, b) => a.employee.name.localeCompare(b.employee.name, "ru"));
  return copy.sort((a, b) => (order === "desc" ? b.percent - a.percent : a.percent - b.percent) || a.employee.name.localeCompare(b.employee.name, "ru"));
}

export function groupRows(rows: EmployeeRow[], panel: PanelContext, prefs: LocalPreferences): GroupBlock[] {
  const visible = rows.filter((r) => !prefs.hiddenEmployees.includes(r.employee.id));
  const selected = prefs.selectedDepartments.length ? new Set(prefs.selectedDepartments) : null;
  const inDept = visible.filter((r) => !selected || selected.has(r.employee.groupId));
  if (!prefs.groupByDepartments) {
    return [{ id: "all", name: "Все сотрудники", rows: sortRows(inDept, prefs.sort), total: rows.filter((r) => !selected || selected.has(r.employee.groupId)).length }];
  }
  return panel.groups
    .filter((g) => !selected || selected.has(g.id))
    .map((g) => ({
      id: g.id,
      name: g.name,
      rows: sortRows(inDept.filter((r) => r.employee.groupId === g.id), prefs.sort),
      total: rows.filter((r) => r.employee.groupId === g.id).length,
    }))
    .filter((g) => g.total > 0);
}

export function matchesSearch(row: EmployeeRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || row.employee.name.toLowerCase().includes(q);
}
