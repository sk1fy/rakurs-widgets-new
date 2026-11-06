// Чистые правила экрана недели/месяца: выбор сотрудников (общий с днём),
// период из маршрута, подписи процентов и дельт.

import type { Delta } from "../../domain/formulas/period/totals";
import { canOpenPeriod, defaultHistoryFrom, periodContains, periodOf, ratingPercent, shiftPeriod, type DayStat, type Period, type PeriodKind, type PeriodStats } from "../../domain/period";
import { formatMinutes } from "../../domain/time";
import type { Coverage, DataMeta, Employee, PanelContext } from "../../domain/types";
import type { LocalPreferences } from "../../settings/models";

/** Сотрудники, выбранные в боковой панели (те же prefs, что у дневного экрана), по имени. */
export function selectedEmployees(panel: PanelContext, prefs: LocalPreferences): Employee[] {
  const hidden = new Set(prefs.hiddenEmployees);
  const depts = prefs.selectedDepartments.length ? new Set(prefs.selectedDepartments) : null;
  return panel.employees.filter((e) => !hidden.has(e.id) && (!depts || depts.has(e.groupId))).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * Период из маршрута: date — любой день периода, по умолчанию (и для будущего)
 * — текущий период. Период старше истории (33 суток) заменяется самым ранним доступным.
 */
export function resolvePeriod(kind: PeriodKind, date: string | null, today: string, historyFrom: string = defaultHistoryFrom(today)): Period {
  const anchor = date && date <= today ? date : today;
  const period = periodOf(kind, anchor);
  return canOpenPeriod(period, today, historyFrom) ? period : periodOf(kind, historyFrom);
}

export interface PeriodNavState {
  prev: Period | null;
  next: Period | null;
  isCurrent: boolean;
}

/** Навигация по периодам: назад — пока последний день не раньше history_from, вперёд — не дальше текущего. */
export function periodNav(period: Period, today: string, historyFrom: string): PeriodNavState {
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);
  return { prev: canOpenPeriod(prev, today, historyFrom) ? prev : null, next: canOpenPeriod(next, today, historyFrom) ? next : null, isCurrent: periodContains(period, today) };
}

/** Дата маршрута для периода: текущий — без даты, прошедший — его первый день. */
export function periodRouteDate(period: Period, today: string): string | null {
  return periodContains(period, today) ? null : period.start;
}

/** «47.3%» — как рейтинг на карточке дня. */
export function formatRating(rating: number | null): string {
  const p = ratingPercent(rating);
  return p === null ? "—" : `${p.toFixed(1).replace(".0", "")}%`;
}

/** Разность долей в процентных пунктах: «+3.1 п.п.». */
export function formatPp(delta: number): string {
  const v = Math.round(delta * 1000) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1).replace(".0", "")} п.п.`;
}

export function ratingTone(rating: number | null): string {
  if (rating === null) return "";
  return rating < 0.3 ? "pct-bad" : rating < 0.6 ? "pct-warn" : "pct-ok";
}

export function formatPercentDelta(delta: Extract<Delta, { kind: "pct" }>): string {
  const v = Math.round(delta.ratio * 100);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%`;
}

export function deltaClass(delta: Delta): string {
  return delta.kind === "pct" && delta.tone !== "flat" ? (delta.tone === "good" ? "up" : "down") : "";
}

export function formatValue(value: number, format: "count" | "minutes"): string {
  return format === "minutes" ? formatMinutes(value) : String(value);
}

function allDays(stats: PeriodStats): DayStat[] {
  return [...stats.byEmployee.values()].flatMap((e) => [...e.current.days, ...(e.previous?.days ?? []), ...(e.previous?.cutDay ? [e.previous.cutDay] : [])]);
}

/** Метаданные для общих бейджей среза: синтетика, неполные данные, покрытие. */
export function periodMeta(stats: PeriodStats): DataMeta {
  const covered = allDays(stats).filter((d) => d.state === "ready" || d.state === "today");
  const coverage: Coverage = covered.some((d) => d.coverage === "unknown") ? "unknown" : covered.some((d) => d.coverage === "partial") ? "partial" : "verified";
  return {
    source: stats.source,
    snapshotAt: stats.snapshotAt || stats.cutoffUnix,
    coverage,
    partial: stats.partial,
    stale: false,
    note: stats.partial ? "часть дней посчитана по неполной выборке событий" : undefined,
  };
}

export function hasUnavailableDays(stats: PeriodStats): boolean {
  return [...stats.byEmployee.values()].some((e) => e.current.days.some((d) => d.state === "unavailable"));
}

export function hasPendingDays(stats: PeriodStats): boolean {
  return stats.refreshAfter !== null || [...stats.byEmployee.values()].some((e) => e.current.days.some((d) => d.state === "pending"));
}
