// Календарь в timezone аккаунта через Intl, без зависимости от timezone браузера.
// dayKey — строка YYYY-MM-DD календарного дня аккаунта.

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayKey: string;
}

export function zoned(unixSeconds: number, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(new Date(unixSeconds * 1000));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    dayKey: `${year}-${pad(month)}-${pad(day)}`,
  };
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function offsetSeconds(unixSeconds: number, timeZone: string): number {
  const p = zoned(unixSeconds, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
  return asUtc - unixSeconds;
}

/** Unix seconds момента «dayKey + minutes» в timezone аккаунта (учитывает DST). */
export function unixAt(dayKey: string, minutesOfDay: number, timeZone: string): number {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0) / 1000 + minutesOfDay * 60;
  let guess = naive - offsetSeconds(naive, timeZone);
  guess = naive - offsetSeconds(guess, timeZone);
  return guess;
}

export function dayStart(dayKey: string, timeZone: string): number {
  return unixAt(dayKey, 0, timeZone);
}

/** Последняя секунда календарного дня: контракт amocrm-pro включает `to`. */
export function dayEndInclusive(dayKey: string, timeZone: string): number {
  return dayStart(addDays(dayKey, 1), timeZone) - 1;
}

export function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addMonths(dayKey: string, months: number): string {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`;
}

export function todayKey(timeZone: string, nowMs: number = Date.now()): string {
  return zoned(Math.floor(nowMs / 1000), timeZone).dayKey;
}

export function minutesOfDay(unixSeconds: number, timeZone: string): number {
  const p = zoned(unixSeconds, timeZone);
  return p.hour * 60 + p.minute;
}

/** "09:00" → 540. Невалидное значение → null. */
export function parseHHMM(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2] ?? "0");
  if (h < 0 || h > 24 || m < 0 || m > 59 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

export function minutesToHHMM(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.floor(minutes)));
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

export function hhmm(unixSeconds: number, timeZone: string): string {
  const p = zoned(unixSeconds, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function hhmmss(unixSeconds: number, timeZone: string): string {
  const p = zoned(unixSeconds, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

export function isoToUnix(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS_GEN = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function weekday(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** «четверг, 24 сен» */
export function dayTitle(dayKey: string): string {
  const [, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[weekday(dayKey)]}, ${d} ${MONTHS_GEN[m - 1]}`;
}

/** «Ср 23» */
export function dayShort(dayKey: string): string {
  return `${WEEKDAYS_SHORT[weekday(dayKey)]} ${Number(dayKey.slice(8, 10))}`;
}

/** «24.09.2026» — формат фильтров amoCRM. */
export function dayDotted(dayKey: string): string {
  return `${dayKey.slice(8, 10)}.${dayKey.slice(5, 7)}.${dayKey.slice(0, 4)}`;
}

/** «1 ч. 24 м.» по секундам, как в KPI старой панели. */
export function formatDurationShort(totalSeconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h} ч. ${m} м.`;
  if (h > 0) return `${h} ч.`;
  return `${m} м.`;
}

/** «1 м. 5 с.», «10 с.», «1 ч. 2 м.» — с остатком секунд, как в истории задач старой панели. */
export function formatDurationWithSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const sec = safe % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ч.`);
  if (m > 0) parts.push(`${m} м.`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec} с.`);
  return parts.join(" ");
}

/** Длительность звонка «m:ss». */
export function formatCallDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** «45м», «1ч 5м», «2ч» — длительность отрезка таймлайна в минутах. */
export function formatSpan(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  if (safe < 60) return `${safe}м`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

/** «0с», «45с», «3м 10с», «1ч 5м» — длительность сессии панели задач. */
export function formatSpanSeconds(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  const safe = Math.round(seconds);
  if (safe === 0) return "0с";
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return s === 0 ? `${h}ч ${m}м` : `${h}ч ${m}м ${s}с`;
  if (m === 0) return `${s}с`;
  return s === 0 ? `${m}м` : `${m}м ${s}с`;
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
}
