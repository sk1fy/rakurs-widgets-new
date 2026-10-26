import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityRatings } from "../src/api/source";
import { AmocrmProViewerSource } from "../src/api/amocrmPro";
import { profileActivityPercent } from "../src/domain/activityRatings";
import { unixAt } from "../src/domain/time";

const dayKey = "2026-10-26";
const tz = "Europe/Moscow";
const cutoff = unixAt(dayKey, 543, tz);
const params = { dayKey, from: unixAt(dayKey, 540, tz), to: unixAt(dayKey, 1080, tz), startMinutes: 540, endMinutes: 1080, cutoffUnix: cutoff, surface: "dashboard" as const };
const raw = () => ({ formula_version: "dashboard-v1", day: dayKey, timezone: tz, start_minutes: 540, end_minutes: 1080, cutoff_unix: cutoff, snapshot_at: cutoff, partial: false, employees: [{ employee_id: 7, percent: 66.7 }] });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

describe("Activity-owned percentages", () => {
  it("sends the observed cutoff and personal window and uses the returned percentage", async () => {
    const fetch = vi.fn().mockResolvedValue(response(raw()));
    vi.stubGlobal("fetch", fetch);
    const got = await new AmocrmProViewerSource("viewer", "").loadActivityRatings({ ...params, employeeIds: [7] });
    const url = new URL(fetch.mock.calls[0]![0] as string, "http://local");
    expect(url.pathname).toBe("/api/v1/activity/view/activity");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ day: dayKey, start_minutes: "540", end_minutes: "1080", cutoff_unix: String(cutoff), employee_ids: "7", surface: "dashboard" });
    expect(got.byEmployee.get(7)?.percent).toBe(66.7);
    expect(got.cutoffUnix).toBe(cutoff);
  });
  it("does not silently calculate a local fallback when the endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "unavailable" } }, 503)));
    await expect(new AmocrmProViewerSource("viewer", "").loadActivityRatings(params)).rejects.toMatchObject({ code: "unavailable" });
  });
  it.each([
    { ...raw(), formula_version: "future-formula" },
    { ...raw(), cutoff_unix: cutoff + 60 },
    { ...raw(), employees: [{ employee_id: 7, percent: null }] },
    { ...raw(), employees: [] },
  ])("rejects invalid/incomplete server calculations", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
    await expect(new AmocrmProViewerSource("viewer", "").loadActivityRatings({ ...params, employeeIds: [7] })).rejects.toMatchObject({ code: "unavailable" });
  });
  it("selects a ready-made profile minute value without calculating a formula", () => {
    const curve = Array<number>(1441).fill(12.3);
    curve[543] = 45.6;
    const ratings: ActivityRatings = { formulaVersion: "profile-v1", dayKey, timeZone: tz, startMinutes: 540, endMinutes: 1080, cutoffUnix: cutoff, snapshotAt: cutoff, partial: false, byEmployee: new Map([[7, { employeeId: 7, percent: 89.1, minutePercentages: curve }]]) };
    expect(profileActivityPercent(ratings, 7, cutoff)).toBe(45.6);
    expect(profileActivityPercent(ratings, 7, cutoff + 60)).toBe(12.3);
    expect(profileActivityPercent(ratings, 7, unixAt("2026-10-27", 543, tz))).toBe(89.1);
    expect(profileActivityPercent(null, 7, cutoff)).toBeNull();
    expect(profileActivityPercent(ratings, 8, cutoff)).toBeNull();
  });
  it("loads the profile schedule and preserves server partial coverage", async () => {
    const minutePercentages = Array<number>(1441).fill(23.4);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...raw(), formula_version: "profile-v1", partial: true, employees: [{ employee_id: 7, percent: 67.8, minute_percentages: minutePercentages }] })));
    const got = await new AmocrmProViewerSource("viewer", "").loadActivityRatings({ ...params, surface: "profile", employeeIds: [7] });
    expect(got.partial).toBe(true);
    expect(got.byEmployee.get(7)?.minutePercentages).toEqual(minutePercentages);
    expect(profileActivityPercent(got, 7, cutoff)).toBe(23.4);
  });
  it("requires the complete profile schedule rather than inventing zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...raw(), formula_version: "profile-v1" })));
    await expect(new AmocrmProViewerSource("viewer", "").loadActivityRatings({ ...params, surface: "profile", employeeIds: [7] })).rejects.toMatchObject({ code: "unavailable" });
  });
});
