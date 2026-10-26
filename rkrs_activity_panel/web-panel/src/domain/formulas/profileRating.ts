// Эталон поверхности «Рейтинг активности» профиля
// (EmployeeGeneralInfoSectionV2.vue, calculateActivityPercentage).
// Отличается от dashboard: whitelist типов, обычное событие отмечает только
// корзину старта, звонок — точную длительность, считаются только полностью
// завершённые двухминутные корзины. Унификация формул не выполняется.

import { isCall, isProfileActivityEvent } from "../eventCatalog";
import { zoned } from "../time";
import type { CrmEvent } from "../types";

const BIN = 2;
const DEFAULT_CALL_SECONDS = 60;

export interface ProfileRatingInput {
  events: CrmEvent[];
  dayKey: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  /** Текущий момент аккаунта, если dayKey — сегодня; иначе null. */
  nowUnix: number | null;
}

export function profileRatingPercent(input: ProfileRatingInput): number {
  const { events, dayKey, timeZone, startMinutes, endMinutes, nowUnix } = input;
  if (endMinutes - startMinutes <= 0) return 0;
  let rangeEnd = endMinutes;
  if (nowUnix !== null) {
    const now = zoned(nowUnix, timeZone);
    if (now.dayKey === dayKey) rangeEnd = Math.min(endMinutes, now.hour * 60 + now.minute);
  }
  const bins: { start: number; end: number; active: boolean }[] = [];
  for (let m = startMinutes; m < endMinutes; m += BIN) {
    bins.push({ start: m, end: Math.min(m + BIN, endMinutes), active: false });
  }
  for (const event of events) {
    const at = zoned(event.createdAt, timeZone);
    if (at.dayKey !== dayKey || !isProfileActivityEvent(event) || isCall(event)) continue;
    const minutes = at.hour * 60 + at.minute;
    if (minutes < startMinutes || minutes >= endMinutes) continue;
    const bin = bins[Math.floor((minutes - startMinutes) / BIN)];
    if (bin) bin.active = true;
  }
  for (const event of events) {
    if (!isCall(event) || !isProfileActivityEvent(event)) continue;
    const at = zoned(event.createdAt, timeZone);
    if (at.dayKey !== dayKey) continue;
    const callStart = at.hour * 60 + at.minute;
    const seconds = event.call?.durationSeconds && event.call.durationSeconds > 0
      ? event.call.durationSeconds
      : DEFAULT_CALL_SECONDS;
    const visibleStart = Math.max(callStart, startMinutes);
    const visibleEnd = Math.min(callStart + seconds / 60, endMinutes, rangeEnd);
    if (visibleEnd <= visibleStart) continue;
    for (const bin of bins) {
      if (bin.end <= rangeEnd && !bin.active && bin.start < visibleEnd && bin.end > visibleStart) {
        bin.active = true;
      }
    }
  }
  const countable = bins.filter((b) => b.end <= rangeEnd);
  if (!countable.length) return 0;
  const percent = (countable.filter((b) => b.active).length / countable.length) * 100;
  return Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
}

export const RATING_LEGEND = [
  { label: "< 20", description: "можно не продлевать лицензии amo", color: "#ff5a5f" },
  { label: "20–40", description: "догадываюсь, что делать", color: "#f0a33a" },
  { label: "40–60", description: "делаю, но не верю", color: "#d8c100" },
  { label: "60–75", description: "системная работа", color: "#d8c100" },
  { label: "> 75", description: "отличная автоматизация", color: "#60d975" },
];

export function ratingColor(percent: number): string {
  if (percent < 20) return "#ff5a5f";
  if (percent < 40) return "#f0a33a";
  if (percent < 75) return "#d8c100";
  return "#60d975";
}

/** Окраска карточки профиля по рейтингу (RATING_THEME_MAP в EmployeeGeneralInfoSectionV2.vue). */
const RATING_THEMES: { max: number; accent: string; background: string }[] = [
  { max: 20, accent: "#ff5a5f", background: "linear-gradient(135deg, rgba(84, 46, 69, 0.98), rgba(79, 48, 70, 0.96))" },
  { max: 40, accent: "#f0a33a", background: "linear-gradient(135deg, rgba(69, 64, 57, 0.98), rgba(66, 62, 56, 0.96))" },
  { max: 60, accent: "#d8c100", background: "linear-gradient(135deg, rgba(59, 72, 42, 0.98), rgba(57, 69, 42, 0.96))" },
  { max: 75, accent: "#d8c100", background: "linear-gradient(135deg, rgba(60, 71, 43, 0.98), rgba(58, 69, 43, 0.96))" },
  { max: Infinity, accent: "#60d975", background: "linear-gradient(135deg, rgba(35, 79, 75, 0.98), rgba(37, 83, 79, 0.96))" },
];

export function ratingTheme(percent: number): { accent: string; background: string } {
  return RATING_THEMES.find((t) => percent < t.max) ?? RATING_THEMES[RATING_THEMES.length - 1]!;
}
