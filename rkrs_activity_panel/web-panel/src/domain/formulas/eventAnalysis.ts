// «Анализ событий» профиля (EmployeeActivitiesSectionV3.vue).
// Двухминутные корзины считают все события из whitelist в рабочем окне;
// простой — пустые полностью прошедшие корзины. Для сегодняшнего дня
// события позже текущего момента не учитываются.

import {
  TASK_EVENT_LABELS,
  TASK_EVENT_TYPES,
  eventCategory,
  isCall,
  isProfileActivityEvent,
  matchEventType,
  EVENT_LABELS,
  type EventCategory,
} from "../eventCatalog";
import { normalizePhoneForUnique } from "../phone";
import { zoned } from "../time";
import type { CrmEvent } from "../types";

export const BIN_MINUTES = 2;

export interface AnalysisBin {
  index: number;
  startMinutes: number;
  endMinutes: number;
  events: CrmEvent[];
}

export interface IdleRange {
  startMinutes: number;
  endMinutes: number;
}

export type CallDirection = "incoming" | "outgoing" | "missed" | "unknown";

export interface CallLogItem {
  event: CrmEvent;
  startMinutes: number;
  /** Длительность для отображения: факт либо 60 с по умолчанию (как в V3). */
  displaySeconds: number;
  durationKnown: boolean;
  direction: CallDirection;
}

export interface EventAnalysis {
  bins: AnalysisBin[];
  events: CrmEvent[];
  idle: IdleRange[];
  idleMinutes: number;
  visibleEndMinutes: number;
  maxBinCount: number;
  firstEventUnix: number | null;
  lastEventUnix: number | null;
  categoryCounts: Record<EventCategory, number>;
  typeCounts: { key: string; label: string; value: number }[];
  taskCounts: { key: string; label: string; value: number }[];
  correctnessPercent: number;
  calls: CallLogItem[];
}

export function callDirection(event: CrmEvent): CallDirection {
  const duration = event.call?.durationSeconds;
  if (event.type === "incoming_call") {
    if (duration === null || duration === undefined) return "unknown";
    return duration <= 0 ? "missed" : "incoming";
  }
  return "outgoing";
}

export const CALL_DIRECTION_LABEL: Record<CallDirection, string> = {
  incoming: "Входящий",
  outgoing: "Исходящий",
  missed: "Пропущенный",
  unknown: "Входящий (длительность неизвестна)",
};

export function analyzeEvents(params: {
  events: CrmEvent[];
  dayKey: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  nowUnix: number;
}): EventAnalysis {
  const { dayKey, timeZone, startMinutes, endMinutes, nowUnix } = params;
  const now = zoned(nowUnix, timeZone);
  const isToday = now.dayKey === dayKey;
  const nowMinutes = now.hour * 60 + now.minute;

  const dayEvents = params.events.filter((e) => {
    if (zoned(e.createdAt, timeZone).dayKey !== dayKey) return false;
    if (isToday && e.createdAt > nowUnix) return false;
    return isProfileActivityEvent(e);
  });
  const inWindow = dayEvents
    .filter((e) => {
      const z = zoned(e.createdAt, timeZone);
      const m = z.hour * 60 + z.minute;
      return m >= startMinutes && m <= endMinutes;
    })
    .sort((a, b) => a.createdAt - b.createdAt);

  const count = Math.max(1, Math.ceil((endMinutes - startMinutes) / BIN_MINUTES));
  const bins: AnalysisBin[] = Array.from({ length: count }, (_, index) => ({
    index,
    startMinutes: startMinutes + index * BIN_MINUTES,
    endMinutes: Math.min(startMinutes + (index + 1) * BIN_MINUTES, endMinutes),
    events: [],
  }));
  for (const e of inWindow) {
    const z = zoned(e.createdAt, timeZone);
    const bin = bins[Math.floor((z.hour * 60 + z.minute - startMinutes) / BIN_MINUTES)];
    if (bin) bin.events.push(e);
  }

  const visibleEndMinutes = isToday ? Math.min(endMinutes, nowMinutes) : endMinutes;
  const idle: IdleRange[] = [];
  let current: IdleRange | null = null;
  for (const bin of bins) {
    if (bin.endMinutes > visibleEndMinutes || bin.events.length > 0) {
      if (current) idle.push(current);
      current = null;
      continue;
    }
    if (current) current.endMinutes = bin.endMinutes;
    else current = { startMinutes: bin.startMinutes, endMinutes: bin.endMinutes };
  }
  if (current) idle.push(current);
  const idleMinutes = idle.reduce((sum, r) => sum + (r.endMinutes - r.startMinutes), 0);

  const categoryCounts: Record<EventCategory, number> = { negative: 0, neutral: 0, positive: 0, context: 0 };
  const typeMap = new Map<string, number>();
  const taskMap = new Map<string, number>();
  for (const e of inWindow) {
    const key = matchEventType(e.type);
    const isTask = key !== null && (TASK_EVENT_TYPES as readonly string[]).includes(key);
    if (isTask && key) {
      taskMap.set(key, (taskMap.get(key) ?? 0) + 1);
      continue;
    }
    categoryCounts[eventCategory(e.type)] += 1;
    if (key) typeMap.set(key, (typeMap.get(key) ?? 0) + 1);
  }
  const completed = taskMap.get("task_completed") ?? 0;
  const withResult = taskMap.get("task_result_added") ?? 0;

  const calls: CallLogItem[] = dayEvents
    .filter(isCall)
    .map((event) => {
      const z = zoned(event.createdAt, timeZone);
      const known = typeof event.call?.durationSeconds === "number";
      return {
        event,
        startMinutes: z.hour * 60 + z.minute,
        displaySeconds: known && (event.call?.durationSeconds ?? 0) > 0 ? (event.call?.durationSeconds as number) : known ? 0 : 60,
        durationKnown: known,
        direction: callDirection(event),
      };
    })
    .sort((a, b) => a.event.createdAt - b.event.createdAt);

  return {
    bins,
    events: inWindow,
    idle,
    idleMinutes,
    visibleEndMinutes,
    maxBinCount: Math.max(1, ...bins.map((b) => b.events.length)),
    firstEventUnix: inWindow[0]?.createdAt ?? null,
    lastEventUnix: inWindow[inWindow.length - 1]?.createdAt ?? null,
    categoryCounts,
    typeCounts: [...typeMap.entries()]
      .map(([key, value]) => ({ key, label: EVENT_LABELS[key] ?? key, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
    // task_text_changed не выводится строкой (VISIBLE_TASK_ACTIVITY_EVENT_TYPES).
    taskCounts: TASK_EVENT_TYPES.filter((k) => k !== "task_text_changed").map((key) => ({
      key,
      label: TASK_EVENT_LABELS[key] ?? key,
      value: taskMap.get(key) ?? 0,
    })),
    correctnessPercent: completed > 0 ? Math.round((withResult / completed) * 100) : 0,
    calls,
  };
}

/** Уникальные звонки: первый звонок на нормализованный номер. */
export function uniqueCalls(items: CallLogItem[]): CallLogItem[] {
  const seen = new Map<string, CallLogItem>();
  for (const item of items) {
    const key = normalizePhoneForUnique(item.event.call?.phone) || `call-${item.event.id}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

export function correctnessColor(percent: number): string {
  if (percent >= 75) return "#7ad63f";
  if (percent >= 50) return "#f4a63c";
  return "#ff5a5f";
}
