// Полоса событий панели задач под таймлайном (TimelineExternalActivitiesV2.vue).
// Короткие завершённые сессии работы (< 3 мин), идущие почти вплотную,
// собираются в кластер с числом внутри; длинные, идущие сейчас и ручные
// активности стоят отдельно. Цвет одиночного сегмента — по длительности.
// Старая полоса кластеризовала по пикселям; здесь порог в минутах,
// чтобы раскладка не зависела от ширины экрана и проверялась тестами.

import { addDays, dayStart, unixAt } from "../time";
import { sessionWindow } from "./sessionWindow";
import type { WorkSession } from "../types";

export interface LaneItem {
  session: WorkSession;
  startMinutes: number;
  endMinutes: number;
  /** Сессия ещё идёт (stoppedAt = null). */
  active: boolean;
  seconds: number;
}

export interface LaneSegment {
  items: LaneItem[];
  startMinutes: number;
  endMinutes: number;
  color: string;
}

export interface LaneIdle {
  startMinutes: number;
  endMinutes: number;
}

export interface ExternalLane {
  segments: LaneSegment[];
  idle: LaneIdle[];
}

const CLUSTER_MAX_SECONDS = 3 * 60;
const CLUSTER_GAP_MINUTES = 2;

export const LANE_COLORS = { activity: "#a78bfa", cluster: "#34d399", event: "#22c55e" } as const;

const DURATION_BUCKETS: { maxSeconds: number; color: string }[] = [
  { maxSeconds: 60, color: "#60a5fa" },
  { maxSeconds: 300, color: "#34d399" },
  { maxSeconds: 900, color: "#22c55e" },
  { maxSeconds: 3600, color: "#fbbf24" },
  { maxSeconds: Infinity, color: "#f97316" },
];

export function laneColor(session: WorkSession): string {
  if (session.kind === "activity") return LANE_COLORS.activity;
  const seconds = session.workTimeSeconds ?? 0;
  return (DURATION_BUCKETS.find((b) => seconds < b.maxSeconds) ?? DURATION_BUCKETS[DURATION_BUCKETS.length - 1]!).color;
}

export function laneLabel(session: WorkSession): string {
  if (session.kind === "work") return "Работа над задачей";
  if (session.activityType === "imbox") return "Imbox";
  return "Другое";
}

const alone = (item: LaneItem) => item.active || item.session.kind === "activity" || (item.session.workTimeSeconds ?? 0) >= CLUSTER_MAX_SECONDS;

export function buildExternalLane(params: {
  sessions: WorkSession[];
  dayKey: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  /** Минута «сейчас» для текущего дня, иначе null (как TimelineRow.nowMinutes). */
  nowMinutes: number | null;
}): ExternalLane {
  const { sessions, dayKey, timeZone, startMinutes, endMinutes, nowMinutes } = params;
  const items: LaneItem[] = [];
  for (const session of sessions) {
    if (session.kind === "pause") continue;
    const cutoff = nowMinutes === null ? dayStart(addDays(dayKey, 1), timeZone) : unixAt(dayKey, nowMinutes, timeZone);
    const interval = sessionWindow(session, dayKey, timeZone, cutoff);
    if (!interval) continue;
    items.push({ session, startMinutes: interval.startMinutes, endMinutes: interval.endMinutes, active: session.stoppedAt === null, seconds: interval.seconds });
  }
  items.sort((x, y) => x.startMinutes - y.startMinutes);

  const segments: LaneSegment[] = [];
  for (const item of items) {
    const last = segments[segments.length - 1];
    const lastItem = last?.items[last.items.length - 1];
    if (last && lastItem && !alone(item) && !alone(lastItem) && item.startMinutes - last.endMinutes <= CLUSTER_GAP_MINUTES) {
      last.items.push(item);
      last.endMinutes = Math.max(last.endMinutes, item.endMinutes);
      last.color = LANE_COLORS.cluster;
      continue;
    }
    segments.push({ items: [item], startMinutes: item.startMinutes, endMinutes: item.endMinutes, color: laneColor({ ...item.session, workTimeSeconds: item.seconds }) });
  }

  const idle: LaneIdle[] = [];
  const limit = nowMinutes !== null ? Math.min(endMinutes, nowMinutes) : endMinutes;
  let cursor = startMinutes;
  for (const seg of segments) {
    const from = Math.max(cursor, startMinutes);
    const to = Math.min(seg.startMinutes, limit);
    if (to - from >= 1) idle.push({ startMinutes: from, endMinutes: to });
    cursor = Math.max(cursor, seg.endMinutes);
  }
  if (limit - cursor >= 1) idle.push({ startMinutes: Math.max(cursor, startMinutes), endMinutes: limit });
  return { segments, idle };
}
