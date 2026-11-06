// Периоды «Неделя»/«Месяц» (контракт period-v1, amocrm-pro
// docs/proposals/activity-period-v1.md §3–§5). Чистая календарная математика
// по dayKey (YYYY-MM-DD в timezone аккаунта) и модели ответа Activity.
// Адаптеры в src/api переводят DTO §5 в эти типы.

import { addDays, addMonths } from "./time";
import type { Coverage, EmployeeId } from "./types";

export type PeriodKind = "week" | "month";

export interface Period {
  kind: PeriodKind;
  /** Первый день периода (Пн для недели, 1-е число для месяца). */
  start: string;
  /** Последний день периода включительно. */
  end: string;
  days: string[];
}

/** «До той же точки» (§4): дни с индексом < dayIndex — целиком, dayIndex — до minute. */
export interface PeriodCut {
  dayIndex: number;
  /** Минута дня (0..1439) момента отсечки в timezone аккаунта. */
  minute: number;
}

export type DayState = "future" | "today" | "ready" | "pending" | "unavailable";

/** [active_h, call_h, elapsed_h] — минуты часа (§3). */
export type HourCell = readonly [active: number, call: number, elapsed: number];

/** Порядок kpi в DayStat (§3): [outgoing_calls, messages, outgoing_mail, completed_tasks, lead_status_changes]. */
export type KpiVector = readonly [number, number, number, number, number];

export const KPI_INDEX = { outgoingCalls: 0, messages: 1, outgoingMail: 2, completedTasks: 3, leadStatusChanges: 4 } as const;

/**
 * Статистика дня (§3). Для future/pending/unavailable числовые поля нулевые,
 * first/last — null, hours пуст: такой день никогда не бывает counted.
 */
export interface DayStat {
  day: string;
  state: DayState;
  counted: boolean;
  coverage: Coverage | null;
  /** День посчитан по неполным событиям (лимит страниц «сегодня»). */
  partial: boolean;
  kpi: KpiVector;
  events: number;
  /** Минуты активных 2-минутных отрезков в range. */
  active: number;
  call: number;
  elapsed: number;
  idleInside: number;
  /** Минуты дня; null — активных отрезков нет. */
  first: number | null;
  last: number | null;
  /** По одному элементу на час из PeriodStats.hours. */
  hours: HourCell[];
}

export interface EmployeePeriodStats {
  employeeId: EmployeeId;
  /** Сервер посчитал часть дней по неполной выборке событий (лимит сканирования). */
  partial: boolean;
  current: { rating: number | null; days: DayStat[] };
  /** null, если прошлый период недоступен (previous.available = false). */
  previous: {
    /** С учётом cut: дни < dayIndex + cutDay. */
    rating: number | null;
    /** Весь прошлый период. */
    ratingFull: number | null;
    days: DayStat[];
    cutDay: DayStat | null;
  } | null;
}

/** Ответ §5.1, переведённый в модель интерфейса. */
export interface PeriodStats {
  kind: PeriodKind;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  cutoffUnix: number;
  snapshotAt: number;
  /** Самый ранний день с историей (не глубже 33 суток). */
  historyFrom: string;
  /** Unix seconds: когда перезапросить дни в состоянии pending. */
  refreshAfter: number | null;
  hours: number[];
  current: Period;
  previous: Period & { available: boolean; cut: PeriodCut | null };
  byEmployee: Map<EmployeeId, EmployeePeriodStats>;
  /** Хоть один день или сотрудник посчитан по неполным событиям. */
  partial: boolean;
  source: "amocrm-pro" | "fixture";
}

/** День ленты «Сравнения рабочих дней» (§5.2). */
export interface PeriodDaySegments {
  day: string;
  state: DayState;
  first: number | null;
  last: number | null;
  /** Символ на 2-минутный отрезок окна: 0 пауза, 1 CRM, 2 звонок, . ещё не наступило. Пусто для future/pending/unavailable. */
  kinds: string;
  /** - нет событий, C/T/I/D/O — зоны §2.2, . ещё не наступило. */
  zones: string;
}

export interface EmployeePeriodDays {
  employeeId: EmployeeId;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  segmentMinutes: number;
  days: PeriodDaySegments[];
}

/** Сырые события хранятся 33 дня (R3/R7): самый ранний доступный день — сегодня − 32. */
export const HISTORY_DAYS = 33;
export const SEGMENT_MINUTES = 2;

function utcDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** Пн = 0 … Вс = 6. */
export function weekdayIndex(dayKey: string): number {
  return (utcDate(dayKey).getUTCDay() + 6) % 7;
}

export function isWeekend(dayKey: string): boolean {
  return weekdayIndex(dayKey) >= 5;
}

function daysBetween(start: string, end: string): string[] {
  const out = [start];
  while ((out[out.length - 1] as string) < end) out.push(addDays(out[out.length - 1] as string, 1));
  return out;
}

/** Неделя Пн–Вс или календарный месяц, содержащий anchor. */
export function periodOf(kind: PeriodKind, anchor: string): Period {
  if (kind === "week") {
    const start = addDays(anchor, -weekdayIndex(anchor));
    const end = addDays(start, 6);
    return { kind, start, end, days: daysBetween(start, end) };
  }
  const start = `${anchor.slice(0, 7)}-01`;
  const end = addDays(addMonths(start, 1), -1);
  return { kind, start, end, days: daysBetween(start, end) };
}

/** Период, сдвинутый на delta периодов (−1 — предыдущий). */
export function shiftPeriod(period: Period, delta: number): Period {
  return period.kind === "week" ? periodOf("week", addDays(period.start, 7 * delta)) : periodOf("month", addMonths(period.start, delta));
}

export function previousPeriod(period: Period): Period {
  return shiftPeriod(period, -1);
}

export function periodContains(period: Period, dayKey: string): boolean {
  return dayKey >= period.start && dayKey <= period.end;
}

/** Самый ранний день истории для навигации до первого ответа (33 суток вместе с сегодня). */
export function defaultHistoryFrom(today: string): string {
  return addDays(today, -(HISTORY_DAYS - 1));
}

/** Период можно открыть, если его последний день не раньше historyFrom и он не в будущем (§5.1). */
export function canOpenPeriod(period: Period, today: string, historyFrom: string): boolean {
  return period.end >= historyFrom && period.start <= today;
}

/**
 * Отсечка «до той же точки» (§4). Только для периода, содержащего сегодня;
 * если прошлый период короче (месяц) — null, прошлый период целиком.
 */
export function periodCut(current: Period, today: string, cutoffMinute: number): PeriodCut | null {
  if (!periodContains(current, today)) return null;
  const dayIndex = current.days.indexOf(today);
  if (dayIndex < 0 || dayIndex >= previousPeriod(current).days.length) return null;
  return { dayIndex, minute: cutoffMinute };
}

/**
 * Конец range дня (§3), правило dashboard-v1: прошедший день — endMinutes;
 * день с отсечкой — endHour = floor(end/60), h = min(endHour, cut.hour),
 * rangeEnd = h*60 + (cut.hour == h ? cut.minute : 0).
 */
export function rangeEndFor(endMinutes: number, cutMinute: number | null): number {
  if (cutMinute === null) return endMinutes;
  const cutHour = Math.floor(cutMinute / 60);
  const h = Math.min(Math.floor(endMinutes / 60), cutHour);
  return h * 60 + (cutHour === h ? cutMinute % 60 : 0);
}

/** Часы окна: каждый час, пересекающий [start, end). */
export function windowHours(startMinutes: number, endMinutes: number): number[] {
  const out: number[] = [];
  for (let h = Math.floor(startMinutes / 60); h * 60 < endMinutes; h++) out.push(h);
  return out;
}

/** §3: день не в будущем и не (Сб/Вс без активных отрезков). */
export function isCountedDay(dayKey: string, today: string, activeSegments: number): boolean {
  if (dayKey > today) return false;
  return !(isWeekend(dayKey) && activeSegments === 0);
}

export function dayStateOf(dayKey: string, today: string, historyFrom: string): DayState {
  if (dayKey > today) return "future";
  if (dayKey < historyFrom) return "unavailable";
  return dayKey === today ? "today" : "ready";
}

export function emptyDayStat(day: string, state: DayState): DayStat {
  return { day, state, counted: false, coverage: null, partial: false, kpi: [0, 0, 0, 0, 0], events: 0, active: 0, call: 0, elapsed: 0, idleInside: 0, first: null, last: null, hours: [] };
}

/** Рейтинг (§4, R1) = Σactive / Σelapsed по counted дням; null, если Σelapsed = 0. */
export function ratingOf(days: readonly DayStat[]): number | null {
  let active = 0;
  let elapsed = 0;
  for (const d of days) {
    if (!d.counted) continue;
    active += d.active;
    elapsed += d.elapsed;
  }
  return elapsed > 0 ? active / elapsed : null;
}

/**
 * Рейтинг-доля → проценты с одним знаком, тем же порядком операций, что у
 * dashboard-v1 (round(active/elapsed*100*10)/10; общий оракул округления).
 */
export function ratingPercent(rating: number | null): number | null {
  if (rating === null) return null;
  return Math.max(0, Math.min(100, Math.round(rating * 100 * 10) / 10));
}

/** Дни прошлого периода «до той же точки»: индексы < cut.dayIndex целиком + день отсечки. */
export function previousUpToCut(days: readonly DayStat[], cut: PeriodCut | null, cutDay: DayStat | null): DayStat[] {
  if (!cut) return [...days];
  const out = days.slice(0, cut.dayIndex);
  if (cutDay) out.push(cutDay);
  return out;
}

const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function weekdayShort(dayKey: string): string {
  return WEEKDAYS_SHORT[weekdayIndex(dayKey)] as string;
}

/** Подпись оси «Динамики»: «Пн 3» (неделя) / «3» (месяц). */
export function dayAxisLabel(dayKey: string, kind: PeriodKind): string {
  const day = Number(dayKey.slice(8, 10));
  return kind === "week" ? `${weekdayShort(dayKey)} ${day}` : String(day);
}

/** Чип дня: «Пн, 03.11». */
export function dayChipLabel(dayKey: string): string {
  return `${weekdayShort(dayKey)}, ${dayKey.slice(8, 10)}.${dayKey.slice(5, 7)}`;
}

/** Строка дня: «Пн, 3 ноября». */
export function dayLongLabel(dayKey: string): string {
  return `${weekdayShort(dayKey)}, ${Number(dayKey.slice(8, 10))} ${MONTHS_GEN[Number(dayKey.slice(5, 7)) - 1]}`;
}

/** «2–8 ноября 2026», «27 октября – 2 ноября 2026», «Ноябрь 2026». */
export function periodTitle(period: Period): string {
  const [y1, m1, d1] = period.start.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = period.end.split("-").map(Number) as [number, number, number];
  if (period.kind === "month") return `${MONTHS[m1 - 1]} ${y1}`;
  if (y1 !== y2) return `${d1} ${MONTHS_GEN[m1 - 1]} ${y1} – ${d2} ${MONTHS_GEN[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${MONTHS_GEN[m1 - 1]} – ${d2} ${MONTHS_GEN[m2 - 1]} ${y2}`;
  return `${d1}–${d2} ${MONTHS_GEN[m1 - 1]} ${y1}`;
}
