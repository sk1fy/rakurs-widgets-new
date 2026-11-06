import { describe, expect, it } from "vitest";
import {
  canOpenPeriod,
  dayAxisLabel,
  dayChipLabel,
  dayStateOf,
  defaultHistoryFrom,
  emptyDayStat,
  isCountedDay,
  periodCut,
  periodOf,
  periodTitle,
  previousPeriod,
  previousUpToCut,
  rangeEndFor,
  ratingOf,
  shiftPeriod,
  weekdayIndex,
  windowHours,
  type DayStat,
} from "../src/domain/period";

const stat = (day: string, over: Partial<DayStat> = {}): DayStat => ({ ...emptyDayStat(day, "ready"), counted: true, ...over });

describe("period calendar", () => {
  it("builds Mon–Sun weeks from any anchor day", () => {
    for (const anchor of ["2026-11-02", "2026-11-05", "2026-11-08"]) {
      const w = periodOf("week", anchor);
      expect(w.start).toBe("2026-11-02");
      expect(w.end).toBe("2026-11-08");
      expect(w.days).toHaveLength(7);
    }
    expect(weekdayIndex("2026-11-02")).toBe(0);
    expect(weekdayIndex("2026-11-08")).toBe(6);
  });

  it("builds calendar months including leap February and year boundaries", () => {
    expect(periodOf("month", "2026-11-17")).toMatchObject({ start: "2026-11-01", end: "2026-11-30" });
    expect(periodOf("month", "2028-02-10").days).toHaveLength(29);
    expect(periodOf("month", "2026-02-10").days).toHaveLength(28);
    expect(previousPeriod(periodOf("month", "2026-01-31"))).toMatchObject({ start: "2025-12-01", end: "2025-12-31" });
    expect(shiftPeriod(periodOf("month", "2026-03-31"), -1)).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("crosses month and year boundaries for weeks", () => {
    const w = periodOf("week", "2026-01-01");
    expect(w).toMatchObject({ start: "2025-12-29", end: "2026-01-04" });
    expect(previousPeriod(w)).toMatchObject({ start: "2025-12-22", end: "2025-12-28" });
    expect(shiftPeriod(w, 1).start).toBe("2026-01-05");
  });

  it("labels days and periods", () => {
    expect(dayAxisLabel("2026-11-03", "week")).toBe("Вт 3");
    expect(dayAxisLabel("2026-11-03", "month")).toBe("3");
    expect(dayChipLabel("2026-11-03")).toBe("Вт, 03.11");
    expect(periodTitle(periodOf("week", "2026-11-04"))).toBe("2–8 ноября 2026");
    expect(periodTitle(periodOf("week", "2026-10-28"))).toBe("26 октября – 1 ноября 2026");
    expect(periodTitle(periodOf("week", "2026-01-01"))).toBe("29 декабря 2025 – 4 января 2026");
    expect(periodTitle(periodOf("month", "2026-11-04"))).toBe("Ноябрь 2026");
  });
});

describe("cut «до той же точки» (§4)", () => {
  it("uses the weekday index for the current week", () => {
    expect(periodCut(periodOf("week", "2026-11-05"), "2026-11-05", 940)).toEqual({ dayIndex: 3, minute: 940 });
  });
  it("uses day of month − 1 and drops the cut when the previous month is shorter", () => {
    expect(periodCut(periodOf("month", "2026-03-10"), "2026-03-10", 600)).toEqual({ dayIndex: 9, minute: 600 });
    // 31 марта: февраль 2026 — 28 дней → прошлый период целиком.
    expect(periodCut(periodOf("month", "2026-03-31"), "2026-03-31", 600)).toBeNull();
    expect(periodCut(periodOf("month", "2026-03-28"), "2026-03-28", 600)).toEqual({ dayIndex: 27, minute: 600 });
  });
  it("has no cut for a past period", () => {
    expect(periodCut(periodOf("week", "2026-10-28"), "2026-11-05", 940)).toBeNull();
  });
  it("collects previous days up to the cut", () => {
    const days = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"].map((d) => stat(d));
    const cutDay = stat("2026-10-28", { active: 7 });
    expect(previousUpToCut(days, { dayIndex: 2, minute: 600 }, cutDay).map((d) => [d.day, d.active])).toEqual([["2026-10-26", 0], ["2026-10-27", 0], ["2026-10-28", 7]]);
    expect(previousUpToCut(days, null, null)).toHaveLength(4);
  });
});

describe("range end (dashboard-v1 rule)", () => {
  it("keeps the whole window for a past day", () => {
    expect(rangeEndFor(1080, null)).toBe(1080);
  });
  it("cuts inside the window at the cutoff minute", () => {
    expect(rangeEndFor(1080, 15 * 60 + 40)).toBe(940);
  });
  it("clamps after the window to the end hour without minutes", () => {
    expect(rangeEndFor(1080, 20 * 60 + 10)).toBe(1080);
    // Окно до 18:30: после 18:59 граница — 18:00 (как в dashboard-v1).
    expect(rangeEndFor(1110, 19 * 60 + 5)).toBe(1080);
    expect(rangeEndFor(1110, 18 * 60 + 20)).toBe(1100);
  });
  it("lists window hours intersecting the window", () => {
    expect(windowHours(540, 1080)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(windowHours(570, 1110)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});

describe("counted days and rating (§3, §4, R1, R4)", () => {
  it("skips future days and weekends without activity, keeps idle weekdays", () => {
    expect(isCountedDay("2026-11-06", "2026-11-05", 10)).toBe(false);
    expect(isCountedDay("2026-11-07", "2026-11-09", 0)).toBe(false);
    expect(isCountedDay("2026-11-07", "2026-11-09", 1)).toBe(true);
    expect(isCountedDay("2026-11-04", "2026-11-05", 0)).toBe(true);
  });
  it("sums active/elapsed over counted days rather than averaging percentages", () => {
    const days = [stat("2026-11-02", { active: 100, elapsed: 500 }), stat("2026-11-03", { active: 300, elapsed: 100 }), { ...stat("2026-11-07", { active: 50, elapsed: 50 }), counted: false }];
    expect(ratingOf(days)).toBeCloseTo(400 / 600);
    expect(ratingOf([])).toBeNull();
  });
  it("derives day state from today and history", () => {
    expect(dayStateOf("2026-11-06", "2026-11-05", "2026-10-04")).toBe("future");
    expect(dayStateOf("2026-11-05", "2026-11-05", "2026-10-04")).toBe("today");
    expect(dayStateOf("2026-10-03", "2026-11-05", "2026-10-04")).toBe("unavailable");
    expect(dayStateOf("2026-10-04", "2026-11-05", "2026-10-04")).toBe("ready");
  });
  it("limits navigation to 33 days of history", () => {
    expect(defaultHistoryFrom("2026-11-05")).toBe("2026-10-04");
    expect(canOpenPeriod(periodOf("week", "2026-10-01"), "2026-11-05", "2026-10-04")).toBe(true);
    expect(canOpenPeriod(periodOf("week", "2026-09-25"), "2026-11-05", "2026-10-04")).toBe(false);
    expect(canOpenPeriod(periodOf("month", "2026-10-15"), "2026-11-05", "2026-10-04")).toBe(true);
    expect(canOpenPeriod(periodOf("month", "2026-09-15"), "2026-11-05", "2026-10-04")).toBe(false);
    expect(canOpenPeriod(periodOf("week", "2026-11-10"), "2026-11-05", "2026-10-04")).toBe(false);
  });
});
