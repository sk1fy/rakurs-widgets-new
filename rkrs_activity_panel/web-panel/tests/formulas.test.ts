import { describe, expect, it } from "vitest";
import { dashboardActivityPercent } from "../src/domain/formulas/dashboardActivity";
import { profileRatingPercent } from "../src/domain/formulas/profileRating";
import { computeMissedCalls } from "../src/domain/formulas/missedCalls";
import { classifyCall, compareWithYesterday, countOperatorCalls, operatorForecast, requiredSpeed, remainingWorkHours } from "../src/domain/formulas/operator";
import { taskHistory, summaryCards, FALLBACK_COMPLETED_TASK_SECONDS } from "../src/domain/formulas/sessions";
import { filterByPipelines, extractPipelineIds } from "../src/domain/formulas/pipelineFilter";
import { buildTimelineRow } from "../src/domain/formulas/timelineRow";
import { analyzeEvents, uniqueCalls } from "../src/domain/formulas/eventAnalysis";
import { rowKpis } from "../src/domain/formulas/kpi";
import { unixAt, dayEndInclusive, dayStart } from "../src/domain/time";
import type { CrmEvent, WorkSession } from "../src/domain/types";

const TZ = "Europe/Moscow";
const DAY = "2026-10-21";
const at = (hhmm: string, sec = 0, day = DAY) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return unixAt(day, h * 60 + m, TZ) + sec;
};
let seq = 0;
function ev(type: string, time: number, extra: Partial<CrmEvent> = {}): CrmEvent {
  return { id: `e${seq++}`, type, createdAt: time, createdBy: 1, entityId: 10, entityType: "leads", call: null, pipelineIds: [], taskId: null, taskTypeId: null, statusId: null, related: null, ...extra };
}
const call = (type: "incoming_call" | "outgoing_call", time: number, duration: number | null, phone = "79000000001") =>
  ev(type, time, { call: { durationSeconds: duration, phone, entityType: "contacts", entityId: 5, result: null, link: null } });

describe("пример аудита: старт 09:00, срез 09:03, событие 09:02", () => {
  const events = [ev("common_note_added", at("09:02"))];
  it("dashboard считает частичный последний отрезок — 66.7%", () => {
    expect(dashboardActivityPercent({ events, dayKey: DAY, timeZone: TZ, startMinutes: 540, endMinutes: 1080, cutoffUnix: at("09:03") })).toBe(66.7);
  });
  it("рейтинг профиля учитывает только полностью прошедшие корзины — 0%", () => {
    expect(profileRatingPercent({ events, dayKey: DAY, timeZone: TZ, startMinutes: 540, endMinutes: 1080, nowUnix: at("09:03") })).toBe(0);
  });
});

describe("пропущенные звонки", () => {
  it("входящий 0 с без перезвона — пропущенный; перезвон снимает", () => {
    const byEmp = new Map([[1, [call("incoming_call", at("10:00"), 0), call("incoming_call", at("11:00"), 0, "89000000002"), call("outgoing_call", at("11:05"), 0, "+7 900 000-00-02")]]]);
    const r = computeMissedCalls(byEmp, TZ);
    expect(r.items.map((i) => i.normalizedPhone)).toEqual(["79000000001"]);
  });
  it("F9: входящий без длительности не пропущенный, а «без данных»", () => {
    const r = computeMissedCalls(new Map([[1, [call("incoming_call", at("10:00"), null)]]]), TZ);
    expect(r.items).toHaveLength(0);
    expect(r.unknownDurationIncoming).toBe(1);
  });
});

describe("оператор", () => {
  const t = { dialingSeconds: 10, conversationSeconds: 30, exceedingSeconds: 180 };
  it("классы по порогам", () => {
    expect([5, 10, 30, 180, null].map((d) => classifyCall(d, t))).toEqual(["short", "dialing", "conversation", "exceeding", "unknown"]);
  });
  it("дозвоны включают разговор и превышение; уникальные — первый звонок на номер", () => {
    const events = [call("outgoing_call", at("10:00"), 5), call("outgoing_call", at("10:01"), 40), call("outgoing_call", at("10:02"), 200, "79000000009"), call("incoming_call", at("10:03"), 100)];
    const c = countOperatorCalls({ events, thresholds: t, unique: false });
    expect([c.calls, c.successful, c.conversation, c.exceeding, c.talkSeconds]).toEqual([3, 2, 2, 1, 240]);
    expect(countOperatorCalls({ events, thresholds: t, unique: true }).calls).toBe(2);
  });
  it("прогноз: факт + floor(остаток / (прошло / факт)); без звонков за час — факт", () => {
    const start = at("09:00");
    const end = at("18:00");
    expect(operatorForecast({ actual: 30, lastCallUnix: at("12:00"), nowUnix: at("12:00"), workStartUnix: start, workEndUnix: end })).toBe(30 + 60);
    expect(operatorForecast({ actual: 30, lastCallUnix: at("10:00"), nowUnix: at("12:00"), workStartUnix: start, workEndUnix: end })).toBe(30);
  });
  it("требуемая скорость и оставшиеся часы", () => {
    expect(remainingWorkHours(12 * 60, 540, 1080)).toBe(6);
    expect(requiredSpeed(70, 6)).toBe(12);
    expect(compareWithYesterday(0, 0)).toBeNull();
    expect(compareWithYesterday(3, 0)).toEqual({ yesterday: 0, trend: "up" });
  });
});

describe("сессии", () => {
  const s = (kind: WorkSession["kind"], from: string, to: string, extra: Partial<WorkSession> = {}): WorkSession => ({
    kind, startedAt: new Date(at(from) * 1000).toISOString(), stoppedAt: new Date(at(to) * 1000).toISOString(), workTimeSeconds: at(to) - at(from), ...extra,
  });
  it("F7: паузы не попадают в историю задач", () => {
    const h = taskHistory({ sessions: [s("work", "10:00", "10:10", { taskId: 1 }), s("pause", "10:10", "10:20")], dayKey: DAY, timeZone: TZ, nowUnix: at("18:00"), dayEnd: dayEndInclusive(DAY, TZ) });
    expect(h.rows).toHaveLength(1);
  });
  it("F10: завершённая задача без сессии — условные 10 с, помечено", () => {
    const cards = summaryCards({
      sessions: [],
      completedTaskEvents: [ev("task_completed", at("11:00"), { entityType: "task", entityId: 77, taskId: 77, related: { entityType: "leads", entityId: 500 } })],
      dayKey: DAY, timeZone: TZ, nowUnix: at("18:00"), dayBounds: { start: dayStart(DAY, TZ), end: dayEndInclusive(DAY, TZ) },
      links: { entity: () => null, stage: () => null },
    });
    expect(cards.fallbackTasks).toBe(1);
    expect(cards.deals[0]).toMatchObject({ seconds: FALLBACK_COMPLETED_TASK_SECONDS, includesFallback: true });
  });
});

describe("прочее", () => {
  it("фильтр воронок оставляет события без воронки", () => {
    const events = [ev("a", 1, { pipelineIds: ["1"] }), ev("b", 2, { pipelineIds: ["2"] }), ev("c", 3)];
    expect(filterByPipelines(events, ["1"]).map((e) => e.type)).toEqual(["a", "c"]);
    expect(extractPipelineIds({ value_after: [{ lead_status: { id: 5, pipeline_id: 42 } }] })).toEqual(["42"]);
  });
  it("таймлайн: звонок, пересекающий «сейчас», скрыт; простой обрезан по now", () => {
    const row = buildTimelineRow({ events: [call("outgoing_call", at("09:59"), 180)], dayKey: DAY, timeZone: TZ, startMinutes: 540, endMinutes: 1080, nowUnix: at("10:00") });
    expect(row.calls).toHaveLength(0);
    expect(row.idle.at(-1)?.endMinutes).toBe(600);
  });
  it("KPI: вчера не загружено — сравнения нет", () => {
    const k = rowKpis([ev("outgoing_call", at("10:00"))], null);
    expect(k.counts.outgoingCalls).toEqual({ today: 1, yesterday: null, trend: null });
  });
  it("анализ событий: уникальные звонки по номеру", () => {
    const a = analyzeEvents({ events: [call("outgoing_call", at("10:00"), 20), call("outgoing_call", at("10:05"), 20, "89000000001")], dayKey: DAY, timeZone: TZ, startMinutes: 540, endMinutes: 1080, nowUnix: at("18:00") });
    expect(a.calls).toHaveLength(2);
    expect(uniqueCalls(a.calls)).toHaveLength(1);
  });
});
