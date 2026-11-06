// Факты и статистика дня из сырых CrmEvent (контракт period-v1 §2–§3).
// На сервере то же самое делает Activity (period_facts.go); здесь — для
// режима фикстур и для проверки паритета с dashboard-v1.

import { isDashboardCall, KPI_PREDICATES } from "../../eventCatalog";
import { isWeekend, rangeEndFor, SEGMENT_MINUTES, windowHours, type DayStat, type DayState, type HourCell, type KpiVector, type PeriodDaySegments } from "../../period";
import { minutesOfDay, zoned } from "../../time";
import type { Coverage, CrmEvent } from "../../types";

export type Zone = "C" | "T" | "I" | "D" | "O";

/** Приоритет зон §2.2: Звонки > Задачи > Imbox > Сделки > Прочее CRM. 0 — нет событий. */
const ZONE_RANK: Record<Zone, number> = { O: 1, D: 2, I: 3, T: 4, C: 5 };
const ZONE_BY_RANK = ["-", "O", "D", "I", "T", "C"] as const;

export function eventZone(e: Pick<CrmEvent, "type" | "entityType">): Zone {
  if (isDashboardCall(e)) return "C";
  if (e.type.startsWith("task_") || e.entityType === "task" || e.entityType === "tasks") return "T";
  if (e.type === "entity_direct_message" || e.type.includes("chat_message") || e.type.includes("sms")) return "I";
  if (e.entityType === "lead" || e.entityType === "leads") return "D";
  return "O";
}

const KPI_ORDER = [KPI_PREDICATES.outgoingCalls, KPI_PREDICATES.messages, KPI_PREDICATES.outgoingMail, KPI_PREDICATES.completedTasks, KPI_PREDICATES.leadStatusChanges];

/** Факты дня (§2): занятость минут 0..1439, зоны и минуты KPI-событий. Не зависят от окна. */
export interface DayFacts {
  /** 0 — минута свободна, 1 — CRM, 2 — звонок. */
  kinds: Uint8Array;
  /** Ранг зоны минуты (0 — нет событий). */
  zones: Uint8Array;
  /** Минута дня каждого события KPI, по ключам в порядке KpiVector. */
  kpiMinutes: number[][];
}

/**
 * Правило dashboard-v1: событие занимает [m, m+len), len = ceil(duration/60)
 * для звонка с известной длительностью > 0, иначе 1; хвост после 1440
 * отбрасывается. События другого календарного дня не учитываются.
 */
export function buildDayFacts(events: readonly CrmEvent[], dayKey: string, timeZone: string): DayFacts {
  const kinds = new Uint8Array(1440);
  const zones = new Uint8Array(1440);
  const kpiMinutes: number[][] = KPI_ORDER.map(() => []);
  for (const e of events) {
    if (zoned(e.createdAt, timeZone).dayKey !== dayKey) continue;
    const start = minutesOfDay(e.createdAt, timeZone);
    const call = isDashboardCall(e);
    const duration = e.call?.durationSeconds ?? 0;
    const end = Math.min(1440, start + (call && duration > 0 ? Math.ceil(duration / 60) : 1));
    const rank = ZONE_RANK[eventZone(e)];
    for (let m = start; m < end; m++) {
      kinds[m] = call ? 2 : Math.max(kinds[m] as number, 1);
      if (rank > (zones[m] as number)) zones[m] = rank;
    }
    KPI_ORDER.forEach((predicate, i) => {
      if (predicate(e)) kpiMinutes[i]?.push(start);
    });
  }
  return { kinds, zones, kpiMinutes };
}

export interface DayStatWindow {
  dayKey: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  /** Часы ответа; по умолчанию — все часы окна. */
  hours?: number[];
}

interface Segment {
  start: number;
  end: number;
  active: boolean;
  call: boolean;
  zone: number;
}

function segmentsOf(facts: DayFacts, startMinutes: number, rangeEnd: number): Segment[] {
  const out: Segment[] = [];
  for (let s = startMinutes; s < rangeEnd; s += SEGMENT_MINUTES) {
    const e = Math.min(s + SEGMENT_MINUTES, rangeEnd);
    let active = false;
    let call = false;
    let zone = 0;
    for (let m = s; m < e; m++) {
      const k = facts.kinds[m] as number;
      if (k > 0) active = true;
      if (k === 2) call = true;
      zone = Math.max(zone, facts.zones[m] as number);
    }
    out.push({ start: s, end: e, active, call, zone });
  }
  return out;
}

/** DayStat (§3) из фактов дня, окна и отсечки (минута дня или null — прошедший день). */
export function dayStatFromFacts(facts: DayFacts, win: DayStatWindow, cutMinute: number | null, options: { state?: DayState; partial?: boolean; coverage?: Coverage | null } = {}): DayStat {
  const { startMinutes } = win;
  const rangeEnd = rangeEndFor(win.endMinutes, cutMinute);
  const elapsed = Math.max(0, rangeEnd - startMinutes);
  const segments = segmentsOf(facts, startMinutes, rangeEnd);
  const activeIdx = segments.flatMap((s, i) => (s.active ? [i] : []));
  const firstIdx = activeIdx[0];
  const lastIdx = activeIdx[activeIdx.length - 1];
  const hoursList = win.hours ?? windowHours(startMinutes, win.endMinutes);
  const hours: HourCell[] = hoursList.map((h) => {
    const lo = h * 60;
    const hi = lo + 60;
    let active = 0;
    let call = 0;
    for (const s of segments) {
      if (s.start < lo || s.start >= hi) continue;
      if (s.active) active += s.end - s.start;
      if (s.call) call += s.end - s.start;
    }
    return [active, call, Math.max(0, Math.min(hi, rangeEnd) - Math.max(lo, startMinutes))] as const;
  });
  const kpi = facts.kpiMinutes.map((list) => list.filter((m) => m >= startMinutes && m < rangeEnd).length) as unknown as KpiVector;
  const idleInside = firstIdx === undefined || lastIdx === undefined ? 0 : (lastIdx - firstIdx + 1 - activeIdx.length) * SEGMENT_MINUTES;
  return {
    day: win.dayKey,
    state: options.state ?? "ready",
    counted: !(isWeekend(win.dayKey) && activeIdx.length === 0),
    coverage: options.coverage ?? null,
    partial: options.partial ?? false,
    kpi,
    events: kpi.reduce((a, b) => a + b, 0),
    active: Math.min(elapsed, activeIdx.length * SEGMENT_MINUTES),
    call: Math.min(elapsed, segments.filter((s) => s.call).length * SEGMENT_MINUTES),
    elapsed,
    idleInside,
    first: firstIdx === undefined ? null : (segments[firstIdx] as Segment).start,
    last: lastIdx === undefined ? null : (segments[lastIdx] as Segment).end,
    hours,
  };
}

/**
 * DayStat из сырых событий сотрудника (уже отфильтрованных по воронкам панели).
 * cutoffUnix — как в dashboardActivityPercent: null для прошедшего дня,
 * иначе момент отсечки (сегодня или «та же точка» прошлого периода).
 * Вызывается только для дня не в будущем.
 */
export function dayStatFromEvents(events: readonly CrmEvent[], win: DayStatWindow, cutoffUnix: number | null, options: { state?: DayState; partial?: boolean; coverage?: Coverage | null } = {}): DayStat {
  const facts = buildDayFacts(events, win.dayKey, win.timeZone);
  return dayStatFromFacts(facts, win, cutMinuteOf(cutoffUnix, win.timeZone), options);
}

export function cutMinuteOf(cutoffUnix: number | null, timeZone: string): number | null {
  if (cutoffUnix === null) return null;
  const p = zoned(cutoffUnix, timeZone);
  return p.hour * 60 + p.minute;
}

/** Ленты §5.2: по символу на 2-минутный отрезок всего окна; после отсечки — «.». */
export function daySegmentsFromFacts(facts: DayFacts, win: DayStatWindow, cutMinute: number | null, state: DayState): PeriodDaySegments {
  const rangeEnd = rangeEndFor(win.endMinutes, cutMinute);
  const all = segmentsOf(facts, win.startMinutes, win.endMinutes);
  let kinds = "";
  let zones = "";
  let first: number | null = null;
  let last: number | null = null;
  for (const full of all) {
    if (full.start >= rangeEnd) {
      kinds += ".";
      zones += ".";
      continue;
    }
    const s = full.end > rangeEnd ? (segmentsOf(facts, full.start, rangeEnd)[0] as Segment) : full;
    kinds += s.call ? "2" : s.active ? "1" : "0";
    zones += ZONE_BY_RANK[s.zone] ?? "-";
    if (s.active) {
      if (first === null) first = s.start;
      last = s.end;
    }
  }
  return { day: win.dayKey, state, first, last, kinds, zones };
}

export function daySegmentsFromEvents(events: readonly CrmEvent[], win: DayStatWindow, cutoffUnix: number | null, state: DayState = "ready"): PeriodDaySegments {
  return daySegmentsFromFacts(buildDayFacts(events, win.dayKey, win.timeZone), win, cutMinuteOf(cutoffUnix, win.timeZone), state);
}
