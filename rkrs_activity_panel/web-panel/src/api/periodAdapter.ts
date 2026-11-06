// Проверка и перевод ответов period-v1 (§5.1, §5.2) в модели интерфейса.
// Как и loadActivityRatings: ответ обязан повторить запрос (версия формулы,
// период, окно, отсечка) и содержать всех запрошенных сотрудников; иначе —
// «unavailable», без локального пересчёта.

import { periodOf, previousPeriod, SEGMENT_MINUTES, type DayState, type DayStat, type EmployeePeriodDays, type EmployeePeriodStats, type HourCell, type KpiVector, type PeriodDaySegments, type PeriodStats } from "../domain/period";
import { addDays } from "../domain/time";
import type { EmployeeId } from "../domain/types";
import { ApiError } from "./errors";
import type { RawDayStat, RawPeriodDaysResponse, RawPeriodResponse } from "./periodDto";
import type { PeriodDaysParams, PeriodStatsParams } from "./source";

export const PERIOD_FORMULA_VERSION = "period-v1";
/** Сотрудников в одном запросе /view/period (лимит ответа 3 МБ). */
export const PERIOD_BATCH_SIZE = 25;
/** Предел периода в одном запросе period-days. */
export const PERIOD_DAYS_LIMIT = 31;

const STATES: readonly DayState[] = ["future", "today", "ready", "pending", "unavailable"];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function invalid(message = "Некорректный ответ расчёта периода"): ApiError {
  return new ApiError({ code: "unavailable", message, retryable: true });
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isMinute = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1440;
const isRating = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1);
const hasStats = (state: DayState) => state === "ready" || state === "today";

export function periodQuery(params: PeriodStatsParams, employeeIds: readonly EmployeeId[] | null, cutoffUnix: number | null): URLSearchParams {
  const q = new URLSearchParams({ kind: params.kind, anchor: params.anchor, start_minutes: String(params.startMinutes), end_minutes: String(params.endMinutes) });
  if (cutoffUnix !== null) q.set("cutoff_unix", String(cutoffUnix));
  if (employeeIds?.length) q.set("employee_ids", employeeIds.join(","));
  return q;
}

export function batches<T>(items: readonly T[], size = PERIOD_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function dayStat(raw: RawDayStat | null | undefined, expectedDay: string, hourCount: number): DayStat {
  if (!raw || raw.day !== expectedDay || !STATES.includes(raw.state) || typeof raw.counted !== "boolean") throw invalid();
  const base: DayStat = { day: raw.day, state: raw.state, counted: false, coverage: null, partial: raw.partial === true, kpi: [0, 0, 0, 0, 0], events: 0, active: 0, call: 0, elapsed: 0, idleInside: 0, first: null, last: null, hours: [] };
  if (!hasStats(raw.state)) {
    if (raw.counted) throw invalid();
    return base;
  }
  const kpi = raw.kpi;
  const hours = raw.hours;
  if (!Array.isArray(kpi) || kpi.length !== 5 || !kpi.every(isCount)) throw invalid();
  if (![raw.events, raw.active, raw.call, raw.elapsed, raw.idle_inside].every(isCount)) throw invalid();
  if (!Array.isArray(hours) || hours.length !== hourCount || !hours.every((h) => Array.isArray(h) && h.length === 3 && h.every(isCount))) throw invalid();
  const first = raw.first ?? null;
  const last = raw.last ?? null;
  if ((first !== null && !isMinute(first)) || (last !== null && !isMinute(last)) || (first === null) !== (last === null)) throw invalid();
  return {
    ...base,
    counted: raw.counted,
    coverage: raw.coverage === "verified" || raw.coverage === "partial" ? raw.coverage : "unknown",
    kpi: [...kpi] as unknown as KpiVector,
    events: raw.events as number,
    active: raw.active as number,
    call: raw.call as number,
    elapsed: raw.elapsed as number,
    idleInside: raw.idle_inside as number,
    first,
    last,
    hours: hours.map((h) => [h[0], h[1], h[2]] as HourCell),
  };
}

/**
 * Один ответ §5.1. expectedCutoff — отправленная отсечка (null — любая
 * серверная); expectedIds — запрошенные сотрудники (null — без проверки).
 */
export function parsePeriodResponse(raw: RawPeriodResponse, params: PeriodStatsParams, expectedCutoff: number | null, expectedIds: readonly EmployeeId[] | null): PeriodStats {
  const current = periodOf(params.kind, params.anchor);
  const previous = previousPeriod(current);
  if (!raw || raw.formula_version !== PERIOD_FORMULA_VERSION) throw invalid("Неизвестная версия расчёта периода");
  if (raw.kind !== params.kind || raw.start_minutes !== params.startMinutes || raw.end_minutes !== params.endMinutes) throw invalid();
  if (typeof raw.cutoff_unix !== "number" || !Number.isFinite(raw.cutoff_unix) || (expectedCutoff !== null && raw.cutoff_unix !== expectedCutoff)) throw invalid();
  if (typeof raw.timezone !== "string" || !raw.timezone || typeof raw.history_from !== "string" || !DAY_RE.test(raw.history_from)) throw invalid();
  if (!Array.isArray(raw.hours) || !raw.hours.every((h) => Number.isInteger(h) && h >= 0 && h <= 23)) throw invalid();
  if (raw.current?.start !== current.start || raw.current.end !== current.end || (Array.isArray(raw.current.days) && raw.current.days.join() !== current.days.join())) throw invalid();
  if (raw.previous?.start !== previous.start || raw.previous.end !== previous.end || typeof raw.previous.available !== "boolean") throw invalid();
  const rawCut = raw.previous.cut ?? null;
  if (rawCut !== null && (!Number.isInteger(rawCut.day_index) || rawCut.day_index < 0 || rawCut.day_index >= previous.days.length || !isMinute(rawCut.minute))) throw invalid();
  if (!Array.isArray(raw.employees)) throw invalid();
  const available = raw.previous.available;
  const cut = rawCut ? { dayIndex: rawCut.day_index, minute: rawCut.minute } : null;
  const hourCount = raw.hours.length;
  const byEmployee = new Map<EmployeeId, EmployeePeriodStats>();
  let partial = false;
  for (const e of raw.employees) {
    if (!e || !Number.isInteger(e.employee_id) || !Array.isArray(e.current?.days) || e.current.days.length !== current.days.length || !isRating(e.current.rating)) throw invalid();
    const days = current.days.map((d, i) => dayStat(e.current.days[i], d, hourCount));
    let prev: EmployeePeriodStats["previous"] = null;
    if (available) {
      const p = e.previous;
      if (!p || !Array.isArray(p.days) || p.days.length !== previous.days.length || !isRating(p.rating) || !isRating(p.rating_full)) throw invalid();
      if ((cut === null) !== (p.cut_day == null)) throw invalid();
      prev = {
        rating: p.rating,
        ratingFull: p.rating_full,
        days: previous.days.map((d, i) => dayStat(p.days[i], d, hourCount)),
        cutDay: cut ? dayStat(p.cut_day, previous.days[cut.dayIndex] as string, hourCount) : null,
      };
    }
    const empPartial = e.partial === true || days.some((d) => d.partial) || Boolean(prev?.days.some((d) => d.partial) || prev?.cutDay?.partial);
    partial ||= empPartial;
    byEmployee.set(e.employee_id, { employeeId: e.employee_id, partial: empPartial, current: { rating: e.current.rating, days }, previous: prev });
  }
  if (expectedIds && expectedIds.some((id) => !byEmployee.has(id))) throw invalid("Расчёт периода вернул не всех сотрудников");
  return {
    kind: params.kind,
    timeZone: raw.timezone,
    startMinutes: raw.start_minutes,
    endMinutes: raw.end_minutes,
    cutoffUnix: raw.cutoff_unix,
    snapshotAt: isCount(raw.snapshot_at) ? raw.snapshot_at : 0,
    historyFrom: raw.history_from,
    refreshAfter: isCount(raw.refresh_after) ? raw.refresh_after : null,
    hours: [...raw.hours],
    current,
    previous: { ...previous, available, cut },
    byEmployee,
    partial,
    source: "amocrm-pro",
  };
}

/** Склейка пачек по 25 сотрудников: общие поля обязаны совпасть. */
export function mergePeriodBatches(parts: readonly PeriodStats[]): PeriodStats {
  const [head, ...rest] = parts;
  if (!head) throw invalid();
  const signature = (p: PeriodStats) => JSON.stringify([p.kind, p.timeZone, p.startMinutes, p.endMinutes, p.cutoffUnix, p.hours, p.current.start, p.previous.available, p.previous.cut]);
  const sig = signature(head);
  const byEmployee = new Map(head.byEmployee);
  let snapshotAt = head.snapshotAt;
  let refreshAfter = head.refreshAfter;
  let historyFrom = head.historyFrom;
  let partial = head.partial;
  for (const p of rest) {
    if (signature(p) !== sig) throw invalid("Пачки расчёта периода не согласованы");
    for (const [id, e] of p.byEmployee) byEmployee.set(id, e);
    snapshotAt = Math.min(snapshotAt, p.snapshotAt);
    if (p.refreshAfter !== null) refreshAfter = refreshAfter === null ? p.refreshAfter : Math.min(refreshAfter, p.refreshAfter);
    if (p.historyFrom > historyFrom) historyFrom = p.historyFrom;
    partial ||= p.partial;
  }
  return { ...head, byEmployee, snapshotAt, refreshAfter, historyFrom, partial };
}

export function periodDaysQuery(params: PeriodDaysParams): URLSearchParams {
  const q = new URLSearchParams({ from_day: params.fromDay, to_day: params.toDay, start_minutes: String(params.startMinutes), end_minutes: String(params.endMinutes) });
  if (params.cutoffUnix !== null) q.set("cutoff_unix", String(params.cutoffUnix));
  return q;
}

export function dayKeysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= PERIOD_DAYS_LIMIT; d = addDays(d, 1)) out.push(d);
  return out;
}

export function parsePeriodDaysResponse(raw: RawPeriodDaysResponse, employeeId: EmployeeId, params: PeriodDaysParams): EmployeePeriodDays {
  if (!raw || raw.formula_version !== PERIOD_FORMULA_VERSION) throw invalid("Неизвестная версия расчёта периода");
  if (raw.start_minutes !== params.startMinutes || raw.end_minutes !== params.endMinutes || raw.segment_minutes !== SEGMENT_MINUTES || typeof raw.timezone !== "string") throw invalid();
  if (raw.employee_id !== employeeId || !Number.isSafeInteger(raw.cutoff_unix) || raw.cutoff_unix < 0 || (params.cutoffUnix !== null && raw.cutoff_unix !== params.cutoffUnix)) throw invalid();
  const expected = dayKeysBetween(params.fromDay, params.toDay);
  if (!Array.isArray(raw.days) || raw.days.length !== expected.length) throw invalid();
  const segments = Math.ceil((params.endMinutes - params.startMinutes) / SEGMENT_MINUTES);
  const days: PeriodDaySegments[] = expected.map((day, i) => {
    const d = raw.days[i];
    if (!d || d.day !== day || !STATES.includes(d.state)) throw invalid();
    if (!hasStats(d.state)) return { day, state: d.state, first: null, last: null, kinds: "", zones: "" };
    const first = d.first ?? null;
    const last = d.last ?? null;
    if (typeof d.kinds !== "string" || typeof d.zones !== "string" || d.kinds.length !== segments || d.zones.length !== segments) throw invalid();
    if (!/^[012.]*$/.test(d.kinds) || !/^[-CTIDO.]*$/.test(d.zones)) throw invalid();
    if ((first !== null && !isMinute(first)) || (last !== null && !isMinute(last)) || (first === null) !== (last === null)) throw invalid();
    const coverage = d.coverage === "verified" || d.coverage === "partial" ? d.coverage : "unknown";
    return { day, state: d.state, coverage, partial: d.partial === true, first, last, kinds: d.kinds, zones: d.zones };
  });
  return { employeeId, timeZone: raw.timezone, startMinutes: raw.start_minutes, endMinutes: raw.end_minutes, segmentMinutes: raw.segment_minutes, days };
}
