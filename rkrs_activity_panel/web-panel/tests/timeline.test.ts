import { describe, expect, it } from "vitest";
import { buildExternalLane, LANE_COLORS, laneColor } from "../src/domain/formulas/externalLane";
import { formatSpan, formatSpanSeconds } from "../src/domain/time";
import type { WorkSession } from "../src/domain/types";

const TZ = "Europe/Moscow";
const DAY = "2026-10-21";
const iso = (hhmm: string) => `${DAY}T${hhmm}:00+03:00`;
const work = (from: string, to: string | null, seconds: number, extra: Partial<WorkSession> = {}): WorkSession => ({
  kind: "work", startedAt: iso(from), stoppedAt: to ? iso(to) : null, workTimeSeconds: seconds, ...extra,
});

describe("форматы длительности таймлайна", () => {
  it("минуты отрезка", () => {
    expect(formatSpan(45)).toBe("45м");
    expect(formatSpan(65)).toBe("1ч 5м");
    expect(formatSpan(120)).toBe("2ч");
  });
  it("секунды сессии", () => {
    expect(formatSpanSeconds(0)).toBe("0с");
    expect(formatSpanSeconds(45)).toBe("45с");
    expect(formatSpanSeconds(190)).toBe("3м 10с");
    expect(formatSpanSeconds(3900)).toBe("1ч 5м");
    expect(formatSpanSeconds(null)).toBe("—");
  });
});

describe("полоса панели задач", () => {
  const base = { dayKey: DAY, timeZone: TZ, startMinutes: 9 * 60, endMinutes: 18 * 60, nowMinutes: null };
  it("короткие сессии рядом — кластер, длинная — отдельно", () => {
    const lane = buildExternalLane({
      ...base,
      sessions: [work("10:00", "10:01", 50), work("10:02", "10:03", 40), work("10:04", "10:05", 30), work("11:00", "11:20", 1200)],
    });
    expect(lane.segments.map((s) => s.items.length)).toEqual([3, 1]);
    expect(lane.segments[0]?.color).toBe(LANE_COLORS.cluster);
    expect(lane.segments[1]?.color).toBe("#fbbf24");
  });
  it("цвет по длительности и ручная активность", () => {
    expect(laneColor(work("10:00", "10:01", 30))).toBe("#60a5fa");
    expect(laneColor({ ...work("10:00", "10:30", 1800), kind: "activity" })).toBe(LANE_COLORS.activity);
  });
  it("идущая сессия тянется до «сейчас», простой не заходит в будущее", () => {
    const lane = buildExternalLane({ ...base, nowMinutes: 12 * 60, sessions: [work("11:00", null, 600)] });
    expect(lane.segments[0]).toMatchObject({ startMinutes: 11 * 60, endMinutes: 12 * 60 });
    expect(lane.idle).toEqual([{ startMinutes: 9 * 60, endMinutes: 11 * 60 }]);
  });
  it("паузы и другие дни не попадают", () => {
    const lane = buildExternalLane({ ...base, sessions: [{ ...work("10:00", "10:10", 600), kind: "pause" }, { ...work("10:00", "10:10", 600), startedAt: "2026-10-20T10:00:00+03:00" }] });
    expect(lane.segments).toEqual([]);
    expect(lane.idle).toEqual([{ startMinutes: 9 * 60, endMinutes: 18 * 60 }]);
  });
});

describe("длительность с секундами", () => {
  it("остаток секунд не теряется (п. 5.29, 5.30, 6.2)", async () => {
    const { formatDurationWithSeconds } = await import("../src/domain/time");
    expect(formatDurationWithSeconds(65)).toBe("1 м. 5 с.");
    expect(formatDurationWithSeconds(10)).toBe("10 с.");
    expect(formatDurationWithSeconds(0)).toBe("0 с.");
    expect(formatDurationWithSeconds(3600)).toBe("1 ч.");
    expect(formatDurationWithSeconds(3725)).toBe("1 ч. 2 м. 5 с.");
  });
});
