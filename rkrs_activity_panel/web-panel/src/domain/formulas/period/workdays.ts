// Блок «Сравнение рабочих дней» (контракт period-v1 §8.5).

import { SEGMENT_MINUTES, isWeekend, type DayStat, type PeriodDaySegments } from "../../period";

/** Чип дня можно выбрать: день наступил и данные по нему есть. */
export function isSelectableDay(d: DayStat): boolean {
  return d.state === "ready" || d.state === "today";
}

/** По умолчанию — прошедшие Пн–Пт (включая сегодня). */
export function defaultSelectedDays(days: readonly DayStat[]): string[] {
  return days.filter((d) => isSelectableDay(d) && !isWeekend(d.day)).map((d) => d.day);
}

export function pluralEvents(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "событие" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "события" : "событий";
  return `${n} ${word}`;
}

/** Подпись чипа: «N событий» / «нет событий» / «идёт» и состояния без данных. */
export function dayChipNote(d: DayStat): string {
  switch (d.state) {
    case "future": return "ещё не наступило";
    case "pending": return "считается";
    case "unavailable": return "нет данных";
    case "today": return d.first === null ? "идёт" : `${pluralEvents(d.events)} · идёт`;
    default: return d.first === null ? "нет событий" : pluralEvents(d.events);
  }
}

/** Медиана; при чётном числе — округлённое среднее двух средних. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : Math.round(((s[m - 1] as number) + (s[m] as number)) / 2);
}

export interface WorkdaysSummary {
  /** Выбранные дни с активностью (first != null). */
  daysWithActivity: number;
  medianFirst: number | null;
  medianLast: number | null;
  /** max(last) − min(last), минуты; null — нет дней с активностью. */
  spread: number | null;
  /** Σactive и Σevents по выбранным дням. */
  active: number;
  events: number;
}

export function workdaysSummary(selected: readonly DayStat[]): WorkdaysSummary {
  const withData = selected.filter((d) => d.first !== null && d.last !== null);
  const firsts = withData.map((d) => d.first as number);
  const lasts = withData.map((d) => d.last as number);
  return {
    daysWithActivity: withData.length,
    medianFirst: median(firsts),
    medianLast: median(lasts),
    spread: lasts.length ? Math.max(...lasts) - Math.min(...lasts) : null,
    active: selected.reduce((s, d) => s + d.active, 0),
    events: selected.reduce((s, d) => s + d.events, 0),
  };
}

export interface RecurringPause {
  /** Индексы 2-минутных отрезков окна [fromSegment, toSegment). */
  fromSegment: number;
  toSegment: number;
  /** Минуты дня. */
  from: number;
  to: number;
  /** Наибольшее число дней, в которых отрезок — пауза. */
  days: number;
  /** Дней с активностью, по которым искались паузы. */
  outOf: number;
}

/** Минимальная длина повторяющейся паузы: 8 отрезков (16 минут). */
export const RECURRING_PAUSE_SEGMENTS = 8;

/**
 * Повторяющиеся паузы: нужно ≥ 2 дней с активностью; A = min(first), B = max(last);
 * для каждого отрезка — число дней, где он пауза и лежит внутри [first, last]
 * этого дня; порог max(2, ceil(0.6 × дней)); пауза — подряд ≥ 8 отрезков.
 */
export function recurringPauses(days: readonly PeriodDaySegments[], startMinutes: number, endMinutes: number): RecurringPause[] {
  const withData = days.filter((d) => d.first !== null && d.last !== null && d.kinds.length > 0);
  if (withData.length < 2) return [];
  const bounds = withData.map((d) => ({
    kinds: d.kinds,
    first: Math.floor(((d.first as number) - startMinutes) / SEGMENT_MINUTES),
    last: Math.ceil(((d.last as number) - startMinutes) / SEGMENT_MINUTES) - 1,
  }));
  const a = Math.min(...bounds.map((b) => b.first));
  const b = Math.max(...bounds.map((x) => x.last));
  const threshold = Math.max(2, Math.ceil(0.6 * withData.length));
  const count = (i: number) => bounds.filter((d) => i >= d.first && i <= d.last && d.kinds[i] === "0").length;
  const out: RecurringPause[] = [];
  let i = a;
  while (i <= b) {
    if (count(i) < threshold) {
      i += 1;
      continue;
    }
    let j = i;
    let most = 0;
    while (j <= b && count(j) >= threshold) {
      most = Math.max(most, count(j));
      j += 1;
    }
    if (j - i >= RECURRING_PAUSE_SEGMENTS) {
      out.push({ fromSegment: i, toSegment: j, from: startMinutes + i * SEGMENT_MINUTES, to: Math.min(endMinutes, startMinutes + j * SEGMENT_MINUTES), days: most, outOf: withData.length });
    }
    i = j;
  }
  return out;
}
