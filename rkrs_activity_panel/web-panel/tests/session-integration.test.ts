import { describe, expect, it, vi } from "vitest";
import type { ActivitySource, Sourced } from "../src/api/source";
import { shouldGateSessionHistory } from "../src/features/employee/sessionHistoryState";
import { sourceIdentity } from "../src/api/sourceIdentity";
import type { EmployeeSessions, WorkSession } from "../src/domain/types";
import { buildExternalLane } from "../src/domain/formulas/externalLane";
import { clippedSeconds, imboxHistory, profileSessionMetrics, taskHistory } from "../src/domain/formulas/sessions";
import { sessionWindow } from "../src/domain/formulas/sessionWindow";
import { addDays, dayEndInclusive, dayStart, unixAt } from "../src/domain/time";
import { loadExternalSessions, SessionsUnavailable } from "../src/features/dashboard/externalSessions";

const dayKey = "2026-10-27", timeZone = "Europe/Moscow";
const range = { dayKey, from: dayStart(dayKey, timeZone), to: dayEndInclusive(dayKey, timeZone) };
const bounds = { start: range.from, end: range.to };
const current = unixAt(dayKey, 12 * 60, timeZone);
const session = (startedAt: string, stoppedAt: string | null, workTimeSeconds: number, extra: Partial<WorkSession> = {}): WorkSession => ({ kind: "work", startedAt, stoppedAt, workTimeSeconds, taskId: 19, taskName: "Observed task", ...extra });
const known = session("2026-10-27T10:00:00+03:00", "2026-10-27T10:10:00+03:00", 600);
const result = (id: number, items: WorkSession[]): Sourced<EmployeeSessions> => ({ kind: "ok", data: { employeeId: id, day: dayKey, items, meta: { source: "amocrm-pro", snapshotAt: current, coverage: "verified", partial: false, stale: false } } });

describe("session observations on dashboard", () => {
  it("keeps a failed employee's observations while updating other employees", async () => {
    let failed = false;
    const source = { loadSessions: vi.fn(async (id: number) => { if (failed && id === 7) throw Error("offline"); return result(id, [id === 8 && failed ? { ...known, taskId: 20 } : known]); }) } as unknown as ActivitySource;
    const first = await loadExternalSessions(source, [7, 8], range, new AbortController().signal, null);
    failed = true;
    const next = await loadExternalSessions(source, [7, 8], range, new AbortController().signal, first);
    expect(next.byEmployee.get(7)).toEqual([known]);
    expect(next.byEmployee.get(8)).toEqual([{ ...known, taskId: 20 }]);
    expect([...next.failedEmployeeIds]).toEqual([7]);
    expect(next.stale).toBe(true);
    expect(next.synthetic).toBe(false);
  });
  it("distinguishes known empty, failed, and absent contract", async () => {
    const source = { loadSessions: vi.fn(async (id: number) => { if (id === 8) throw Error("offline"); return result(id, []); }) } as unknown as ActivitySource;
    const next = await loadExternalSessions(source, [7, 8], range, new AbortController().signal, null);
    expect(next.byEmployee.get(7)).toEqual([]);
    expect(next.byEmployee.get(8)).toBe("error");
    const absent = { loadSessions: async () => ({ kind: "unavailable", contract: "C4", reason: "not connected" }) } as unknown as ActivitySource;
    await expect(loadExternalSessions(absent, [7], range, new AbortController().signal, next)).rejects.toBeInstanceOf(SessionsUnavailable);
  });
  it("does not start queued reads after cancellation", async () => {
    const controller = new AbortController();
    const loadSessions = vi.fn(async () => { controller.abort(); throw Error("aborted"); });
    const source = { loadSessions } as unknown as ActivitySource;
    await expect(loadExternalSessions(source, [1, 2, 3, 4, 5, 6], range, controller.signal, null)).rejects.toThrow("aborted");
    expect(loadSessions).toHaveBeenCalledTimes(1);
  });
  it("keeps source instances isolated even when their modes match", () => {
    const a = { mode: "live" } as ActivitySource, b = { mode: "live" } as ActivitySource;
    expect(sourceIdentity(a)).toBe(sourceIdentity(a));
    expect(sourceIdentity(a)).not.toBe(sourceIdentity(b));
  });
});

describe("calendar-day intervals from the employee MVP", () => {
  const crossing = session("2026-10-26T23:50:00+03:00", "2026-10-27T00:10:00+03:00", 1200);
  it("counts a cross-midnight interval only within each selected day", () => {
    const previous = addDays(dayKey, -1);
    expect(clippedSeconds(crossing, dayKey, timeZone, current, bounds)).toBe(600);
    expect(clippedSeconds(crossing, previous, timeZone, current, { start: dayStart(previous, timeZone), end: dayEndInclusive(previous, timeZone) })).toBe(600);
    const history = taskHistory({ sessions: [crossing], dayKey, timeZone, nowUnix: current, dayEnd: range.to });
    expect(history.rows[0]).toMatchObject({ start: "00:00", end: "00:10", seconds: 600, startMinutes: 0, endMinutes: 10 });
    const imbox = imboxHistory({ sessions: [{ ...crossing, kind: "activity", activityType: "imbox", activityName: "Imbox 77" }], dayKey, timeZone, nowUnix: current, dayBounds: bounds, entityLink: () => null });
    expect(imbox.totalSeconds).toBe(600);
    expect(imbox.rows[0]).toMatchObject({ start: "00:00", end: "00:10", seconds: 600 });
  });
  it("uses server start for an ongoing interval, excludes future and pause time", () => {
    const active = session("2026-10-27T11:59:00+03:00", null, 0);
    expect(clippedSeconds(active, dayKey, timeZone, current, bounds)).toBe(60);
    const metric = profileSessionMetrics({ sessions: [crossing, active, { ...known, kind: "pause", workTimeSeconds: 600 }, session("2026-10-27T13:00:00+03:00", null, 0)], dayKey, timeZone, isToday: true, nowUnix: current, workEndMinutes: 1080 });
    expect(metric).toMatchObject({ dayStart: "00:00", dayFinish: null, workSeconds: 660, taskSwitches: 1 });
  });
  it("clips an ongoing historical interval at 24:00 and respects a DST day", () => {
    const active = { ...crossing, stoppedAt: null };
    const previous = addDays(dayKey, -1);
    expect(sessionWindow(active, previous, timeZone, current)).toMatchObject({ seconds: 600, endMinutes: 1440, endLabel: "24:00" });
    expect(profileSessionMetrics({ sessions: [crossing], dayKey: previous, timeZone, isToday: false, nowUnix: current, workEndMinutes: 1080 }).dayFinish).toBe("24:00");
    const dst = session("2026-11-01T00:00:00-04:00", "2026-11-02T00:00:00-05:00", 25 * 3600);
    expect(sessionWindow(dst, "2026-11-01", "America/New_York", Date.parse("2026-11-03T00:00:00Z") / 1000)?.seconds).toBe(25 * 3600);
  });
  it("renders cross-midnight work and Imbox in the same lane without future time", () => {
    const lane = buildExternalLane({ sessions: [crossing, { ...crossing, kind: "activity", activityType: "imbox" }, session("2026-10-27T13:00:00+03:00", null, 0)], dayKey, timeZone, startMinutes: 0, endMinutes: 1440, nowMinutes: 720 });
    expect(lane.segments).toHaveLength(2);
    expect(lane.segments[0]).toMatchObject({ startMinutes: 0, endMinutes: 10 });
    expect(lane.segments[0]?.items[0]?.seconds).toBe(600);
    expect(lane.segments[1]?.items[0]?.session.activityType).toBe("imbox");
    expect(lane.idle.at(-1)?.endMinutes).toBe(720);
  });
});


describe("disabled session collection", () => {
  it("gates only confirmed empty history and preserves recorded observations and contract errors", () => {
    expect(shouldGateSessionHistory(false, result(7, []))).toBe(true);
    expect(shouldGateSessionHistory(false, result(7, [known]))).toBe(false);
    expect(shouldGateSessionHistory(false, { kind: "unavailable", contract: "C4", reason: "offline" })).toBe(false);
    expect(shouldGateSessionHistory(false, null)).toBe(false);
    expect(shouldGateSessionHistory(true, result(7, []))).toBe(false);
    expect(shouldGateSessionHistory(null, result(7, []))).toBe(false);
  });
});
