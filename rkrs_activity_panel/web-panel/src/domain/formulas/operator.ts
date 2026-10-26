// План/факт оператора (EmployeeSpeedWidget.vue + GaugeComponent.vue).
// Учитываются только исходящие звонки. Классы по длительности:
// ≥ exceeding — превышение, ≥ conversation — разговор, ≥ dialing — дозвон.
// «Дозвоны» = все звонки от порога дозвона, «Разговор» включает превышения,
// время разговора — сумма длительностей дозвонов.
// В режиме уникальных номеров учитывается только первый звонок на номер.
// F9: звонок без известной длительности в старом коде считался 0 с;
// здесь он остаётся в «Звонках», но отдельно помечается как «без данных».

import { normalizePhoneForMissed } from "../phone";
import type { CrmEvent, OperatorSettings } from "../types";

export const DEFAULT_OPERATOR: Omit<OperatorSettings, "employeeId"> = {
  enabled: true,
  plan: 100,
  dialingSeconds: 10,
  conversationSeconds: 30,
  exceedingSeconds: 180,
};

export type CallClass = "dialing" | "conversation" | "exceeding" | "short" | "unknown";

type Thresholds = Pick<OperatorSettings, "dialingSeconds" | "conversationSeconds" | "exceedingSeconds">;

export function classifyCall(durationSeconds: number | null, s: Thresholds): CallClass {
  if (durationSeconds === null) return "unknown";
  if (durationSeconds >= s.exceedingSeconds) return "exceeding";
  if (durationSeconds >= s.conversationSeconds) return "conversation";
  if (durationSeconds >= s.dialingSeconds) return "dialing";
  return "short";
}

export interface CallCounts {
  calls: number;
  successful: number;
  conversation: number;
  exceeding: number;
  unknownDuration: number;
  talkSeconds: number;
  lastHourCalls: number;
  firstCallUnix: number | null;
  lastCallUnix: number | null;
}

export function countOperatorCalls(params: {
  events: CrmEvent[];
  thresholds: Thresholds;
  unique: boolean;
  /** Звонки позже границы не учитываются (вчера — до того же времени). */
  untilUnix?: number;
  /** Для «скорости»: момент, от которого считается последний час. */
  nowUnix?: number;
}): CallCounts {
  const until = params.untilUnix ?? Number.POSITIVE_INFINITY;
  const outgoing = params.events
    .filter((e) => e.type === "outgoing_call" && e.createdAt <= until)
    .sort((a, b) => a.createdAt - b.createdAt);
  const seen = new Set<string>();
  const hourAgo = params.nowUnix !== undefined ? params.nowUnix - 3600 : null;
  const counts: CallCounts = {
    calls: 0, successful: 0, conversation: 0, exceeding: 0, unknownDuration: 0, talkSeconds: 0, lastHourCalls: 0,
    firstCallUnix: outgoing[0]?.createdAt ?? null,
    lastCallUnix: outgoing[outgoing.length - 1]?.createdAt ?? null,
  };
  for (const call of outgoing) {
    const phone = call.call?.phone ? normalizePhoneForMissed(call.call.phone) : "";
    if (params.unique && phone) {
      if (seen.has(phone)) continue;
      seen.add(phone);
    }
    const duration = call.call?.durationSeconds ?? null;
    counts.calls += 1;
    if (hourAgo !== null && call.createdAt > hourAgo) counts.lastHourCalls += 1;
    const cls = classifyCall(duration, params.thresholds);
    if (cls === "unknown") counts.unknownDuration += 1;
    if (cls === "dialing" || cls === "conversation" || cls === "exceeding") {
      counts.successful += 1;
      counts.talkSeconds += duration ?? 0;
    }
    if (cls === "conversation" || cls === "exceeding") counts.conversation += 1;
    if (cls === "exceeding") counts.exceeding += 1;
  }
  return counts;
}

/**
 * Прогноз: факт, если звонков нет, последний звонок был более часа назад
 * или рабочее время закончилось; иначе факт + floor(остаток / средний
 * интервал), где интервал = прошедшее с начала рабочего окна / факт.
 */
export function operatorForecast(params: {
  actual: number;
  lastCallUnix: number | null;
  nowUnix: number;
  workStartUnix: number;
  workEndUnix: number;
}): number {
  const { actual, lastCallUnix, nowUnix, workStartUnix, workEndUnix } = params;
  if (lastCallUnix === null) return actual;
  if ((nowUnix - lastCallUnix) / 3600 > 1) return actual;
  if (actual === 0) return 0;
  const total = workEndUnix - workStartUnix;
  const elapsed = nowUnix - workStartUnix;
  if (elapsed < 0) return 0;
  if (elapsed > total) return actual;
  const perCall = elapsed / actual;
  if (perCall === 0) return actual;
  return actual + Math.floor((total - elapsed) / perCall);
}

/** Оставшиеся рабочие часы (дробные), как в GaugeComponent. */
export function remainingWorkHours(nowMinutes: number, startMinutes: number, endMinutes: number): number {
  if (nowMinutes < startMinutes) return (endMinutes - startMinutes) / 60;
  if (nowMinutes >= endMinutes) return 0;
  return (endMinutes - nowMinutes) / 60;
}

export function requiredSpeed(remainingToPlan: number, remainingHours: number): number {
  if (remainingHours <= 0 || remainingToPlan <= 0) return 0;
  return Math.ceil(remainingToPlan / remainingHours);
}

export function conversionPercent(successful: number, calls: number): number {
  return calls > 0 ? Math.round((successful / calls) * 100) : 0;
}

export function conversionTone(percent: number): "ok" | "warn" | "bad" {
  if (percent >= 80) return "ok";
  if (percent >= 60) return "warn";
  return "bad";
}

export function speedColor(speed: number): string {
  if (speed <= 2) return "#e74c3c";
  if (speed <= 5) return "#f39c12";
  if (speed <= 8) return "#2ecc71";
  return "#27ae60";
}

export function gaugeMax(speed: number): number {
  return Math.max(Math.ceil(speed * 1.2), 10);
}

export interface Comparison {
  yesterday: number;
  trend: "up" | "down" | "equal";
}

/** Сравнение с вчера: оба нуля — нет сравнения («—»); вчера 0 — рост. */
export function compareWithYesterday(today: number, yesterday: number | null): Comparison | null {
  if (yesterday === null) return null;
  if (today === 0 && yesterday === 0) return null;
  if (yesterday === 0) return { yesterday: 0, trend: "up" };
  if (today > yesterday) return { yesterday, trend: "up" };
  if (today < yesterday) return { yesterday, trend: "down" };
  return { yesterday, trend: "equal" };
}

export function remainingTimeLabel(hours: number): string {
  if (hours <= 0) return "-/-";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}ч ${m}м`;
  if (h > 0) return `${h}ч`;
  return `${m}м`;
}
