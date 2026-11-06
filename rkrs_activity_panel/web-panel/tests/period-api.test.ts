import { afterEach, describe, expect, it, vi } from "vitest";
import { AmocrmProViewerSource } from "../src/api/amocrmPro";
import { FixtureSource } from "../src/api/fixtures/fixtureSource";
import { HybridSource } from "../src/api/hybridSource";
import type { RawDayStat, RawPeriodDaysResponse, RawPeriodResponse } from "../src/api/periodDto";
import type { PeriodStatsParams } from "../src/api/source";
import { periodOf, previousPeriod, previousUpToCut, ratingOf } from "../src/domain/period";
import { unixAt } from "../src/domain/time";

const tz = "Europe/Moscow";
const cutoff = unixAt("2026-11-05", 940, tz);
const params: PeriodStatsParams = { kind: "week", anchor: "2026-11-05", startMinutes: 540, endMinutes: 1080, cutoffUnix: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
function rawDay(day: string, state: RawDayStat["state"] = "ready", over: Partial<RawDayStat> = {}): RawDayStat {
  if (state !== "ready" && state !== "today") return { day, state, counted: false };
  return { day, state, counted: true, coverage: "verified", partial: false, kpi: [3, 2, 1, 4, 1], events: 11, active: 300, call: 90, elapsed: 540, idle_inside: 60, first: 548, last: 1062, hours: HOURS.map(() => [30, 10, 60]), ...over };
}
function rawPeriod(ids: number[], over: Partial<RawPeriodResponse> = {}, cutoffUnix = cutoff): RawPeriodResponse {
  const cur = periodOf("week", "2026-11-05");
  const prev = previousPeriod(cur);
  const available = over.previous?.available ?? true;
  return {
    formula_version: "period-v1", kind: "week", timezone: tz, start_minutes: 540, end_minutes: 1080, cutoff_unix: cutoffUnix, snapshot_at: cutoffUnix + 5, history_from: "2026-10-04", hours: HOURS,
    current: { start: cur.start, end: cur.end, days: cur.days },
    previous: { start: prev.start, end: prev.end, available, cut: { day_index: 3, minute: 940 } },
    employees: ids.map((employee_id) => ({
      employee_id,
      current: { rating: 0.47, days: cur.days.map((d, i) => rawDay(d, i < 3 ? "ready" : i === 3 ? "today" : "future")) },
      previous: available ? { rating: 0.44, rating_full: 0.45, days: prev.days.map((d) => rawDay(d)), cut_day: rawDay(prev.days[3] as string, "ready", { active: 100 }) } : null,
    })),
    ...over,
  };
}
const queryOf = (call: unknown[]) => new URL(call[0] as string, "http://local");

describe("loadPeriodStats (§5.1)", () => {
  it("builds the request and maps DayStat fields", async () => {
    const fetch = vi.fn().mockResolvedValue(json(rawPeriod([7])));
    vi.stubGlobal("fetch", fetch);
    const got = await new AmocrmProViewerSource("viewer", "").loadPeriodStats({ ...params, employeeIds: [7] });
    const url = queryOf(fetch.mock.calls[0]!);
    expect(url.pathname).toBe("/api/v1/activity/view/period");
    expect(Object.fromEntries(url.searchParams)).toEqual({ kind: "week", anchor: "2026-11-05", start_minutes: "540", end_minutes: "1080", employee_ids: "7" });
    expect(fetch.mock.calls[0]![1]).toMatchObject({ headers: { Authorization: "Bearer viewer" } });
    const e = got.byEmployee.get(7)!;
    expect(e.current.days[0]).toMatchObject({ day: "2026-11-02", state: "ready", idleInside: 60, kpi: [3, 2, 1, 4, 1], first: 548, last: 1062 });
    expect(e.current.days[4]).toMatchObject({ state: "future", counted: false, active: 0, first: null });
    expect(e.previous?.cutDay?.active).toBe(100);
    expect(got.previous.cut).toEqual({ dayIndex: 3, minute: 940 });
    expect(got.cutoffUnix).toBe(cutoff);
    expect(got.historyFrom).toBe("2026-10-04");
    expect(got.refreshAfter).toBeNull();
  });

  it("requests 25 employees per batch with the first batch's server cutoff and merges them", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    const fetch = vi.fn().mockImplementation(async (input: string) => {
      const url = new URL(input, "http://local");
      const batch = url.searchParams.get("employee_ids")!.split(",").map(Number);
      return json(rawPeriod(batch, url.searchParams.has("cutoff_unix") ? {} : { refresh_after: cutoff + 60 }));
    });
    vi.stubGlobal("fetch", fetch);
    const got = await new AmocrmProViewerSource("viewer", "").loadPeriodStats({ ...params, employeeIds: ids });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [first, second] = fetch.mock.calls.map((c) => queryOf(c).searchParams);
    expect(first!.get("employee_ids")!.split(",")).toHaveLength(25);
    expect(first!.has("cutoff_unix")).toBe(false);
    expect(second!.get("employee_ids")).toBe("26,27,28,29,30");
    expect(second!.get("cutoff_unix")).toBe(String(cutoff));
    expect(got.byEmployee.size).toBe(30);
    expect(got.refreshAfter).toBe(cutoff + 60);
  });

  it("defaults to all panel employees after loadPanel", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ name: "p", timezone: tz, display_window: { from: "09:00", to: "18:00" }, employees: [{ id: 7, name: "A", group_id: 1, group_name: "G" }, { id: 8, name: "B", group_id: 1, group_name: "G" }] }))
      .mockResolvedValueOnce(json(rawPeriod([7, 8])));
    vi.stubGlobal("fetch", fetch);
    const source = new AmocrmProViewerSource("viewer", "");
    await source.loadPanel();
    await source.loadPeriodStats(params);
    expect(queryOf(fetch.mock.calls[1]!).searchParams.get("employee_ids")).toBe("7,8");
  });

  it("keeps previous null and marks partial days/employees without failing", async () => {
    const raw = rawPeriod([7], { previous: { start: "2026-10-26", end: "2026-11-01", available: false, cut: { day_index: 3, minute: 940 } } });
    raw.employees[0]!.partial = true;
    raw.employees[0]!.current.days[3] = rawDay("2026-11-05", "today", { partial: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(raw)));
    const got = await new AmocrmProViewerSource("viewer", "").loadPeriodStats({ ...params, employeeIds: [7] });
    expect(got.previous.available).toBe(false);
    expect(got.byEmployee.get(7)?.previous).toBeNull();
    expect(got.byEmployee.get(7)?.partial).toBe(true);
    expect(got.byEmployee.get(7)?.current.days[3]?.partial).toBe(true);
    expect(got.partial).toBe(true);
  });

  const broken: [string, (r: RawPeriodResponse) => void][] = [
    ["formula version", (r) => { r.formula_version = "period-v2"; }],
    ["kind", (r) => { r.kind = "month"; }],
    ["window echo", (r) => { r.end_minutes = 1020; }],
    ["period bounds", (r) => { r.current.start = "2026-11-03"; }],
    ["previous bounds", (r) => { r.previous.start = "2026-10-19"; }],
    ["missing employee", (r) => { r.employees = []; }],
    ["day order", (r) => { r.employees[0]!.current.days.reverse(); }],
    ["kpi length", (r) => { r.employees[0]!.current.days[0]!.kpi = [1, 2, 3, 4] as never; }],
    ["hours length", (r) => { r.employees[0]!.current.days[0]!.hours = [[1, 1, 1]]; }],
    ["rating range", (r) => { r.employees[0]!.current.rating = 47; }],
    ["counted future", (r) => { r.employees[0]!.current.days[6]!.counted = true; }],
    ["missing previous", (r) => { r.employees[0]!.previous = null; }],
    ["missing cut day", (r) => { r.employees[0]!.previous!.cut_day = null; }],
  ];
  it.each(broken)("rejects an invalid response: %s", async (_name, mutate) => {
    const raw = rawPeriod([7]);
    mutate(raw);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(raw)));
    await expect(new AmocrmProViewerSource("viewer", "").loadPeriodStats({ ...params, employeeIds: [7] })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("rejects batches that disagree or ignore the sent cutoff", async () => {
    const ids = Array.from({ length: 26 }, (_, i) => i + 1);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: string) => {
      const url = new URL(input, "http://local");
      const batch = url.searchParams.get("employee_ids")!.split(",").map(Number);
      return json(rawPeriod(batch, {}, url.searchParams.has("cutoff_unix") ? cutoff + 120 : cutoff));
    }));
    await expect(new AmocrmProViewerSource("viewer", "").loadPeriodStats({ ...params, employeeIds: ids })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("passes HTTP errors through as ActivityShareError codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "invalid_argument", message: "bad anchor" } }, 400)));
    await expect(new AmocrmProViewerSource("viewer", "").loadPeriodStats({ ...params, employeeIds: [7] })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("loadEmployeePeriodDays (§5.2)", () => {
  const p = { fromDay: "2026-11-02", toDay: "2026-11-04", startMinutes: 540, endMinutes: 560, cutoffUnix: cutoff };
  const raw = (): RawPeriodDaysResponse => ({
    formula_version: "period-v1", timezone: tz, employee_id: 7, cutoff_unix: cutoff, start_minutes: 540, end_minutes: 560, segment_minutes: 2,
    days: [{ day: "2026-11-02", state: "ready", first: 540, last: 560, partial: true, coverage: "verified", kinds: "1120000001", zones: "CCT------O" }, { day: "2026-11-03", state: "unavailable" }, { day: "2026-11-04", state: "today", first: null, last: null, kinds: "000.......", zones: "---......." }],
  });

  it("builds the request and keeps strips as returned", async () => {
    const fetch = vi.fn().mockResolvedValue(json(raw()));
    vi.stubGlobal("fetch", fetch);
    const got = await new HybridSource("viewer").loadEmployeePeriodDays(7, p);
    const url = queryOf(fetch.mock.calls[0]!);
    expect(url.pathname).toBe("/api/v1/activity/view/employees/7/period-days");
    expect(Object.fromEntries(url.searchParams)).toEqual({ from_day: "2026-11-02", to_day: "2026-11-04", start_minutes: "540", end_minutes: "560", cutoff_unix: String(cutoff) });
    expect(got.days.map((d) => d.state)).toEqual(["ready", "unavailable", "today"]);
    expect(got.days[0]).toMatchObject({ kinds: "1120000001", zones: "CCT------O", first: 540, last: 560, partial: true, coverage: "verified" });
    expect(got.days[1]).toMatchObject({ kinds: "", first: null });
  });

  it.each<[string, (r: RawPeriodDaysResponse) => void]>([
    ["version", (r) => { r.formula_version = "dashboard-v1"; }],
    ["employee", (r) => { r.employee_id = 8; }],
    ["cutoff", (r) => { r.cutoff_unix++; }],
    ["strip length", (r) => { r.days[0]!.kinds = "11"; }],
    ["strip alphabet", (r) => { r.days[0]!.zones = "XXXXXXXXXX"; }],
    ["segment size", (r) => { r.segment_minutes = 5; }],
    ["day list", (r) => { r.days.pop(); }],
  ])("rejects an invalid response: %s", async (_n, mutate) => {
    const body = raw();
    mutate(body);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)));
    await expect(new AmocrmProViewerSource("viewer", "").loadEmployeePeriodDays(7, p)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("refuses more than 31 days without calling the server", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(new AmocrmProViewerSource("viewer", "").loadEmployeePeriodDays(7, { ...p, fromDay: "2026-10-01", toDay: "2026-11-04" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("fixture period source", () => {
  const now = unixAt("2026-11-05", 940, tz);
  const source = () => new FixtureSource("normal", () => now);

  it("computes the current week up to now and the previous week up to the same point", async () => {
    const got = await source().loadPeriodStats({ ...params, employeeIds: [9001, 9002] });
    expect(got.source).toBe("fixture");
    expect(got.historyFrom).toBe("2026-10-04");
    expect(got.previous).toMatchObject({ available: true, cut: { dayIndex: 3, minute: 940 } });
    const e = got.byEmployee.get(9001)!;
    expect(e.current.days.map((d) => d.state)).toEqual(["ready", "ready", "ready", "today", "future", "future", "future"]);
    expect(e.current.days[3]?.elapsed).toBe(940 - 540);
    expect(e.current.rating).toBeCloseTo(ratingOf(e.current.days)!);
    expect(e.previous?.cutDay?.elapsed).toBe(400);
    expect(e.previous?.rating).toBeCloseTo(ratingOf(previousUpToCut(e.previous!.days, got.previous.cut, e.previous!.cutDay))!);
    expect(e.previous?.ratingFull).toBeCloseTo(ratingOf(e.previous!.days)!);
    expect(got.byEmployee.size).toBe(2);
  });

  it("marks days before the 33-day history unavailable and drops the previous period", async () => {
    const got = await source().loadPeriodStats({ ...params, kind: "month", anchor: "2026-10-15" });
    const days = got.byEmployee.get(9001)!.current.days;
    expect(days.slice(0, 3).map((d) => d.state)).toEqual(["unavailable", "unavailable", "unavailable"]);
    expect(days[3]?.state).toBe("ready");
    expect(got.previous.available).toBe(false);
    expect(got.byEmployee.get(9001)?.previous).toBeNull();
    expect(got.previous.cut).toBeNull();
  });

  it("returns pending days with refresh_after in the period-pending scenario", async () => {
    const got = await new FixtureSource("period-pending", () => now).loadPeriodStats({ ...params, employeeIds: [9001] });
    expect(got.byEmployee.get(9001)!.current.days.map((d) => d.state).slice(0, 4)).toEqual(["ready", "pending", "pending", "today"]);
    expect(got.refreshAfter).toBe(now + 60);
  });

  it("builds §5.2 strips from the same events", async () => {
    const got = await source().loadEmployeePeriodDays(9001, { fromDay: "2026-11-02", toDay: "2026-11-08", startMinutes: 540, endMinutes: 1080, cutoffUnix: now });
    expect(got.days).toHaveLength(7);
    expect(got.days[0]?.kinds).toHaveLength(270);
    expect(got.days[3]?.kinds.endsWith(".")).toBe(true);
    expect(got.days[3]?.kinds.indexOf(".")).toBe(200);
    expect(got.days[6]).toMatchObject({ state: "future", kinds: "" });
  });
});
