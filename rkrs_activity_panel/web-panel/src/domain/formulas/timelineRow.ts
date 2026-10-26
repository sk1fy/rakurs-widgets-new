// Полоса CRM/звонков строки сотрудника (TimelineActivityGroup.vue).
// Активности: события без "call", разрыв ≤ 2 мин объединяет группу.
// Звонки: события с "call", разрыв ≤ 1 мин; длительность из фактов звонка,
// неизвестная — как обычное событие (1 мин). Простой — промежутки ≥ 1 мин.

import { isDashboardCall } from "../eventCatalog";
import { minutesOfDay, zoned } from "../time";
import type { CrmEvent } from "../types";

export interface PlacedEvent {
  event: CrmEvent;
  startMinutes: number;
  endMinutes: number;
}

export interface TimelineGroup {
  kind: "activity" | "call";
  startMinutes: number;
  endMinutes: number;
  items: PlacedEvent[];
}

export interface IdleSegment {
  startMinutes: number;
  endMinutes: number;
}

export interface TimelineRow {
  activity: TimelineGroup[];
  calls: TimelineGroup[];
  idle: IdleSegment[];
  /** Минута «сейчас» для текущего дня, иначе null. */
  nowMinutes: number | null;
}

const ACTIVITY_GAP = 2;
const CALL_GAP = 1;

function place(event: CrmEvent, timeZone: string): PlacedEvent {
  const start = minutesOfDay(event.createdAt, timeZone);
  const seconds = isDashboardCall(event) && event.call?.durationSeconds ? event.call.durationSeconds : 60;
  return { event, startMinutes: start, endMinutes: start + Math.max(1, Math.ceil(seconds / 60)) };
}

function groupBy(items: PlacedEvent[], gap: number, kind: TimelineGroup["kind"]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  let current: TimelineGroup | null = null;
  for (const item of items) {
    const last: PlacedEvent | undefined = current?.items[current.items.length - 1];
    if (current && last && item.startMinutes - last.endMinutes <= gap) {
      current.items.push(item);
      current.endMinutes = Math.max(current.endMinutes, item.endMinutes);
    } else {
      if (current) groups.push(current);
      current = { kind, startMinutes: item.startMinutes, endMinutes: item.endMinutes, items: [item] };
    }
  }
  if (current) groups.push(current);
  return groups;
}

export function buildTimelineRow(params: {
  events: CrmEvent[];
  dayKey: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  nowUnix: number | null;
}): TimelineRow {
  const { events, dayKey, timeZone, startMinutes, endMinutes } = params;
  const placed = events
    .filter((e) => zoned(e.createdAt, timeZone).dayKey === dayKey)
    .map((e) => place(e, timeZone))
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const activity = groupBy(placed.filter((p) => !isDashboardCall(p.event)), ACTIVITY_GAP, "activity");
  let calls = groupBy(placed.filter((p) => isDashboardCall(p.event)), CALL_GAP, "call");

  let nowMinutes: number | null = null;
  if (params.nowUnix !== null) {
    const now = zoned(params.nowUnix, timeZone);
    if (now.dayKey === dayKey) nowMinutes = now.hour * 60 + now.minute;
  }
  if (nowMinutes !== null) {
    const limit = nowMinutes;
    calls = calls.filter((g) => !(g.startMinutes >= limit || (g.startMinutes < limit && g.endMinutes > limit)));
  }

  const busy = [...activity, ...calls].sort((a, b) => a.startMinutes - b.startMinutes);
  const idle: IdleSegment[] = [];
  let cursor = startMinutes;
  for (const segment of busy) {
    if (segment.startMinutes - cursor >= 1) idle.push({ startMinutes: cursor, endMinutes: segment.startMinutes });
    cursor = Math.max(cursor, segment.endMinutes);
  }
  if (endMinutes - cursor >= 1) idle.push({ startMinutes: cursor, endMinutes });

  const visibleIdle = nowMinutes === null
    ? idle
    : idle
        .filter((s) => s.startMinutes < (nowMinutes as number))
        .map((s) => ({ ...s, endMinutes: Math.min(s.endMinutes, nowMinutes as number) }))
        .filter((s) => s.endMinutes - s.startMinutes >= 1);

  return { activity, calls, idle: visibleIdle, nowMinutes };
}
