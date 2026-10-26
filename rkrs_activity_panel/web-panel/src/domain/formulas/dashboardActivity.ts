// Эталон поверхности «строка dashboard» (DashboardView.vue,
// calculateEmployeeActivityPercentage). Формула сохраняется как есть;
// единственное явное изменение — F4: минуты считаются в timezone аккаунта,
// а не браузера.

import { isDashboardCall } from "../eventCatalog";
import { minutesOfDay, zoned } from "../time";
import type { CrmEvent } from "../types";

export interface DashboardActivityInput {
  events: CrmEvent[];
  dayKey: string;
  timeZone: string;
  /** Рабочее окно в минутах от начала дня. */
  startMinutes: number;
  endMinutes: number;
  /** Для текущего дня — момент последнего обновления, иначе null. */
  cutoffUnix: number | null;
}

const SEGMENT = 2;

export function dashboardActivityPercent(input: DashboardActivityInput): number {
  const { events, dayKey, timeZone, startMinutes, endMinutes, cutoffUnix } = input;
  let rangeEnd = endMinutes;
  if (cutoffUnix !== null) {
    const now = zoned(cutoffUnix, timeZone);
    // Старый код: min(END_HOUR, hour) + минуты, если граница — текущий час.
    const endHour = Math.floor(endMinutes / 60);
    const rangeEndHour = Math.min(endHour, now.hour);
    rangeEnd = rangeEndHour * 60 + (now.hour === rangeEndHour ? now.minute : 0);
  }
  const total = rangeEnd - startMinutes;
  if (total <= 0) return 0;

  const segments: { start: number; end: number; active: boolean }[] = [];
  for (let i = startMinutes; i < rangeEnd; i += SEGMENT) {
    segments.push({ start: i, end: Math.min(i + SEGMENT, rangeEnd), active: false });
  }
  for (const event of events) {
    if (zoned(event.createdAt, timeZone).dayKey !== dayKey) continue;
    const start = minutesOfDay(event.createdAt, timeZone);
    const duration = event.call?.durationSeconds ?? 0;
    const length = isDashboardCall(event) && duration > 0 ? Math.ceil(duration / 60) : 1;
    const end = start + length;
    for (const segment of segments) {
      if (start < segment.end && end > segment.start) segment.active = true;
    }
  }
  const active = segments.filter((s) => s.active).length * SEGMENT;
  const percent = (active / total) * 100;
  return Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
}
