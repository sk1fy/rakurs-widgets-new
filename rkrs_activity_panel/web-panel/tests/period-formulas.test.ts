import { describe, expect, it } from "vitest";
import ratingFixtures from "./fixtures/activity-rating-v1.json";
import { generateDay } from "../src/api/fixtures/generator";
import { dashboardActivityPercent } from "../src/domain/formulas/dashboardActivity";
import { dayStatFromEvents, daySegmentsFromEvents, eventZone } from "../src/domain/formulas/period/dayStat";
import { dynamicsSeries } from "../src/domain/formulas/period/dynamics";
import { employeeBars } from "../src/domain/formulas/period/employeeBars";
import { hourLevels, hourMatrix } from "../src/domain/formulas/period/hourMatrix";
import { periodTotals, relativeDelta } from "../src/domain/formulas/period/totals";
import { dayChipNote, defaultSelectedDays, median, recurringPauses, workdaysSummary } from "../src/domain/formulas/period/workdays";
import { emptyDayStat, periodOf, previousPeriod, ratingPercent, type DayStat, type EmployeePeriodStats, type PeriodCut, type PeriodDaySegments, type PeriodStats } from "../src/domain/period";
import { addDays, unixAt } from "../src/domain/time";
import type { CrmEvent } from "../src/domain/types";

const tz = "Europe/Moscow";
const day = "2026-11-03"; // вторник

function ev(minute: number, type: string, over: Partial<CrmEvent> = {}, dayKey = day): CrmEvent {
  return { id: `${type}-${minute}-${Math.random()}`, type, createdAt: unixAt(dayKey, minute, tz) + 17, createdBy: 7, entityId: 1, entityType: "leads", call: null, pipelineIds: [], taskId: null, taskTypeId: null, statusId: null, related: null, ...over };
}
const call = (minute: number, seconds: number | null, type = "outgoing_call") => ev(minute, type, { call: { durationSeconds: seconds, phone: null, entityType: null, entityId: null, result: null, link: null } });
const win = { dayKey: day, timeZone: tz, startMinutes: 540, endMinutes: 1080 };

describe("dayStatFromEvents (§2–§3)", () => {
  it("counts 2-minute segments, calls, first/last, idle inside and hour cells", () => {
    const events = [ev(541, "task_completed"), call(600, 150), ev(700, "lead_status_changed"), ev(700, "outgoing_chat_message"), ev(1200, "outgoing_mail")];
    const s = dayStatFromEvents(events, win, null);
    // 540–542 активен; звонок 600..603 → отрезки 600,602 → 4 мин; 700 → 2 мин.
    expect(s.active).toBe(8);
    expect(s.call).toBe(4);
    expect(s.elapsed).toBe(540);
    expect(s.first).toBe(540);
    expect(s.last).toBe(702);
    expect(s.idleInside).toBe(162 - 8);
    // outgoing_mail в 20:00 — вне окна, в kpi не попадает.
    expect(s.kpi).toEqual([1, 1, 0, 1, 1]);
    expect(s.events).toBe(4);
    expect(s.hours).toHaveLength(9);
    expect(s.hours[0]).toEqual([2, 0, 60]);
    expect(s.hours[1]).toEqual([4, 4, 60]);
    expect(s.hours[2]).toEqual([2, 0, 60]);
    expect(s.counted).toBe(true);
  });

  it("applies the dashboard-v1 cutoff and shortens the last segment", () => {
    const s = dayStatFromEvents([ev(600, "task_completed"), ev(640, "task_completed")], win, unixAt(day, 10 * 60 + 31, tz));
    expect(s.elapsed).toBe(91);
    expect(s.kpi[3]).toBe(1);
    expect(s.hours[1]).toEqual([2, 0, 31]);
    expect(s.last).toBe(602);
  });

  it("does not count weekends without activity but counts idle weekdays", () => {
    expect(dayStatFromEvents([], { ...win, dayKey: "2026-11-07" }, null).counted).toBe(false);
    expect(dayStatFromEvents([ev(600, "task_completed", {}, "2026-11-07")], { ...win, dayKey: "2026-11-07" }, null).counted).toBe(true);
    expect(dayStatFromEvents([], win, null)).toMatchObject({ counted: true, active: 0, elapsed: 540, first: null, last: null, idleInside: 0 });
  });

  it("classifies zones by §2.2 priority", () => {
    expect(eventZone({ type: "incoming_call", entityType: "contacts" })).toBe("C");
    expect(eventZone({ type: "task_completed", entityType: "leads" })).toBe("T");
    expect(eventZone({ type: "note_added", entityType: "tasks" })).toBe("T");
    expect(eventZone({ type: "incoming_chat_message", entityType: "leads" })).toBe("I");
    expect(eventZone({ type: "lead_status_changed", entityType: "leads" })).toBe("D");
    expect(eventZone({ type: "contact_added", entityType: "contacts" })).toBe("O");
  });

  it("builds §5.2 strips with the highest-priority zone and future marks", () => {
    const events = [ev(540, "lead_status_changed"), ev(541, "task_completed"), call(544, 30), ev(548, "contact_added", { entityType: "contacts" })];
    const strip = daySegmentsFromEvents(events, { ...win, endMinutes: 560 }, unixAt(day, 551, tz), "today");
    expect(strip.kinds).toBe("102010....");
    expect(strip.zones).toBe("T-C-O-....");
    expect(strip.first).toBe(540);
    expect(strip.last).toBe(550);
  });
});

describe("parity: period-v1 day rating == dashboard-v1 (§3)", () => {
  const toEvents = (list: (typeof ratingFixtures)[number]["events"]): CrmEvent[] => list.map((e) => ({ ...e, pipelineIds: e.pipelineIds.map(String), taskId: null, taskTypeId: null, statusId: null, related: null, call: e.call ? { ...e.call, phone: null, entityType: null, entityId: null, result: null, link: null } : null }));
  for (const f of ratingFixtures) {
    it(`shared fixture ${f.name}`, () => {
      const events = toEvents(f.events);
      const s = dayStatFromEvents(events, { dayKey: f.dayKey, timeZone: f.timeZone, startMinutes: f.startMinutes, endMinutes: f.endMinutes }, f.cutoffUnix);
      const expected = dashboardActivityPercent({ events, dayKey: f.dayKey, timeZone: f.timeZone, startMinutes: f.startMinutes, endMinutes: f.endMinutes, cutoffUnix: f.cutoffUnix });
      expect(s.elapsed > 0 ? ratingPercent(s.active / s.elapsed) : 0).toBe(expected);
    });
  }

  it("matches on generated fixture days with odd windows and cutoffs", () => {
    const now = unixAt("2026-11-30", 1439, tz);
    let checked = 0;
    for (let i = 0; i < 20; i++) {
      const dayKey = addDays("2026-10-05", i);
      for (const id of [9001, 9004, 9007]) {
        const events = generateDay(id, dayKey, now).events;
        for (const [start, end, cutMinute] of [[540, 1080, null], [541, 1111, null], [480, 1200, 15 * 60 + 7], [600, 1021, 19 * 60]] as const) {
          const cutoffUnix = cutMinute === null ? null : unixAt(dayKey, cutMinute, tz);
          const s = dayStatFromEvents(events, { dayKey, timeZone: tz, startMinutes: start, endMinutes: end }, cutoffUnix);
          const expected = dashboardActivityPercent({ events, dayKey, timeZone: tz, startMinutes: start, endMinutes: end, cutoffUnix });
          expect(ratingPercent(s.active / s.elapsed)).toBe(expected);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(240);
  });
});

// ---------- блоки §8 на синтетическом ответе ----------

const stat = (d: string, over: Partial<DayStat> = {}): DayStat => ({ ...emptyDayStat(d, "ready"), counted: true, elapsed: 540, hours: [[30, 10, 60], [0, 0, 60]], ...over });

function periodStats(employees: EmployeePeriodStats[], opts: { available?: boolean; cut?: PeriodCut | null } = {}): PeriodStats {
  const current = periodOf("week", "2026-11-05");
  const previous = previousPeriod(current);
  return {
    kind: "week", timeZone: tz, startMinutes: 540, endMinutes: 660, cutoffUnix: unixAt("2026-11-05", 940, tz), snapshotAt: 0, historyFrom: "2026-10-04", refreshAfter: null,
    hours: [9, 10], current, previous: { ...previous, available: opts.available ?? true, cut: opts.cut === undefined ? { dayIndex: 3, minute: 940 } : opts.cut },
    byEmployee: new Map(employees.map((e) => [e.employeeId, e])), source: "fixture",
  };
}

function employee(id: number, curDays: DayStat[], prevDays: DayStat[] | null, cutDay: DayStat | null = null, ratings: { cur?: number | null; prev?: number | null } = {}): EmployeePeriodStats {
  return { employeeId: id, current: { rating: ratings.cur ?? null, days: curDays }, previous: prevDays ? { rating: ratings.prev ?? null, ratingFull: null, days: prevDays, cutDay } : null };
}

const weekDays = periodOf("week", "2026-11-05").days;
const prevWeekDays = previousPeriod(periodOf("week", "2026-11-05")).days;
function curWeek(over: (i: number) => Partial<DayStat>): DayStat[] {
  return weekDays.map((d, i) => (i > 3 ? emptyDayStat(d, "future") : stat(d, { state: i === 3 ? "today" : "ready", ...over(i) })));
}

describe("Итоги (§8.1)", () => {
  it("computes deltas with «без изменений», +100% and inverse idle", () => {
    expect(relativeDelta(0, 0)).toEqual({ kind: "same" });
    expect(relativeDelta(5, 0)).toEqual({ kind: "pct", ratio: 1, tone: "good" });
    expect(relativeDelta(5, null)).toEqual({ kind: "none" });
    expect(relativeDelta(8, 10)).toMatchObject({ ratio: -0.2, tone: "bad" });
    expect(relativeDelta(8, 10, true)).toMatchObject({ ratio: -0.2, tone: "good" });
    expect(relativeDelta(1000, 1001)).toMatchObject({ tone: "flat" });
  });

  it("sums counted days and compares with previous up to the cut", () => {
    const cur = curWeek((i) => ({ kpi: [2, 1, 1, 3, 1], events: 8, active: 100, idleInside: 10 * (i + 1) }));
    const prev = prevWeekDays.map((d) => stat(d, { kpi: [1, 0, 0, 1, 0], events: 2, active: 50, idleInside: 5 }));
    const cutDay = stat(prevWeekDays[3] as string, { kpi: [1, 0, 0, 0, 0], events: 1, active: 20, idleInside: 0 });
    const other = curWeek(() => ({ kpi: [1, 0, 0, 0, 0], events: 1, active: 10 }));
    other[1] = { ...(other[1] as DayStat), counted: false };
    const t = periodTotals(periodStats([employee(7, cur, prev, cutDay), employee(8, other, prev, cutDay)]), [7, 8]);
    const byKey = Object.fromEntries(t.tiles.map((x) => [x.key, x]));
    expect(t.daysPassed).toBe(4);
    expect(byKey.outgoingCalls?.value).toBe(4 * 2 + 3);
    // Прошлое: 3 полных дня + день отсечки, по двум сотрудникам.
    expect(byKey.outgoingCalls?.previous).toBe(2 * (3 * 1 + 1));
    expect(byKey.events?.value).toBe(32 + 3);
    expect(byKey.active?.previous).toBe(2 * (150 + 20));
    expect(byKey.idle?.value).toBe(10 + 20 + 30 + 40);
    expect(byKey.idle?.delta).toMatchObject({ kind: "pct", tone: "bad" });
    expect(byKey.outgoingMail?.delta).toEqual({ kind: "pct", ratio: 1, tone: "good" });
  });

  it("shows «нет прошлого периода» when previous is unavailable", () => {
    const t = periodTotals(periodStats([employee(7, curWeek(() => ({})), null)], { available: false }), [7]);
    expect(t.previousAvailable).toBe(false);
    expect(t.tiles.every((x) => x.delta.kind === "none" && x.previous === null)).toBe(true);
  });
});

describe("По часам (§8.2)", () => {
  it("averages min(1, active/elapsed) over counted days with elapsed > 0", () => {
    const days = [stat("a", { hours: [[30, 10, 60], [0, 0, 0]] }), stat("b", { hours: [[70, 0, 60], [5, 5, 20]] }), stat("c", { counted: false, hours: [[60, 60, 60], [0, 0, 60]] })];
    const r = hourLevels(days, 2);
    expect(r.level[0]).toBeCloseTo((0.5 + 1) / 2);
    expect(r.level[1]).toBeCloseTo(0.25);
    expect(r.calls[0]).toBeCloseTo((10 / 60 + 0) / 2);
  });

  it("marks best/worst hours, sorts by rating, delta vs whole previous and footer means", () => {
    const a = employee(7, curWeek(() => ({ hours: [[30, 0, 60], [6, 0, 60]] })), prevWeekDays.map((d) => stat(d, { hours: [[15, 0, 60], [6, 0, 60]] })), null, { cur: 0.4, prev: 0.3 });
    const b = employee(8, curWeek(() => ({ hours: [[0, 0, 60], [60, 30, 60]] })), prevWeekDays.map((d) => stat(d, { hours: [[0, 0, 60], [30, 0, 60]] })), null, { cur: 0.6, prev: 0.65 });
    const m = hourMatrix(periodStats([a, b]), [7, 8]);
    expect(m.rows.map((r) => r.employeeId)).toEqual([8, 7]);
    const r7 = m.rows[1]!;
    expect(r7.best).toBe(0);
    expect(r7.worst).toBe(1);
    expect(r7.cells[0]?.delta).toBeCloseTo(0.25);
    expect(r7.ratingDelta).toBeCloseTo(0.1);
    const r8 = m.rows[0]!;
    // Худший — только среди уровней > 0: единственный положительный час — лучший.
    expect(r8.best).toBe(1);
    expect(r8.worst).toBeNull();
    expect(m.footer.cells[1]?.level).toBeCloseTo((0.1 + 1) / 2);
    expect(m.footer.rating).toBeCloseTo(0.5);
  });
});

describe("Сотрудники (§8.3) и Динамика (§8.4)", () => {
  it("sorts by active, shares relative to max, % to previous", () => {
    const a = employee(7, curWeek(() => ({ active: 100, events: 4 })), prevWeekDays.map((d) => stat(d, { active: 50, events: 2 })), stat(prevWeekDays[3] as string, { active: 0, events: 0 }));
    const b = employee(8, curWeek(() => ({ active: 50, events: 10 })), prevWeekDays.map((d) => stat(d, { active: 50, events: 10 })), null);
    const rows = employeeBars(periodStats([a, b]), [8, 7]);
    expect(rows.map((r) => r.employeeId)).toEqual([7, 8]);
    expect(rows[0]).toMatchObject({ active: 400, events: 16, activeShare: 1 });
    expect(rows[1]?.activeShare).toBeCloseTo(0.5);
    expect(rows[0]?.activeDelta).toMatchObject({ kind: "pct", tone: "good" });
    expect(rows[0]?.activeDelta.kind === "pct" ? rows[0].activeDelta.ratio : null).toBeCloseTo(400 / 150 - 1);
  });

  it("sums per day, leaves future days null and keeps the whole previous period", () => {
    const cur = curWeek((i) => ({ kpi: [i, 0, 0, 2, 0] }));
    const prev = prevWeekDays.map((d, i) => (i === 6 ? { ...stat(d), counted: false } : stat(d, { kpi: [1, 0, 0, 1, 0] })));
    const s = dynamicsSeries(periodStats([employee(7, cur, prev), employee(8, cur, prev)]), [7, 8], "outgoingCalls");
    expect(s.current).toEqual([0, 2, 4, 6, null, null, null]);
    expect(s.previous).toEqual([2, 2, 2, 2, 2, 2, 0]);
    expect(s.max).toBe(6);
    const none = dynamicsSeries(periodStats([employee(7, cur, null)], { available: false }), [7], "completedTasks");
    expect(none.previous).toBeNull();
    expect(none.current).toEqual([2, 2, 2, 2, null, null, null]);
  });
});

describe("Сравнение рабочих дней (§8.5)", () => {
  it("selects past Mon–Fri by default and labels chips", () => {
    const days = periodOf("week", "2026-11-12").days.map((d, i) => (i < 6 ? stat(d, { state: i === 5 ? "today" : "ready" }) : emptyDayStat(d, "future")));
    days[0] = { ...(days[0] as DayStat), state: "unavailable" };
    expect(defaultSelectedDays(days)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(dayChipNote(stat("x", { first: 540, events: 21 }))).toBe("21 событие");
    expect(dayChipNote(stat("x", { first: 540, events: 54 }))).toBe("54 события");
    expect(dayChipNote(stat("x", { first: null }))).toBe("нет событий");
    expect(dayChipNote(stat("x", { state: "today", first: null }))).toBe("идёт");
    expect(dayChipNote(emptyDayStat("x", "future"))).toBe("ещё не наступило");
  });

  it("computes medians, spread and sums over selected days", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2])).toBe(2);
    expect(median([])).toBeNull();
    const s = workdaysSummary([stat("a", { first: 540, last: 1000, active: 100, events: 5 }), stat("b", { first: 560, last: 1060, active: 200, events: 7 }), stat("c", { first: null, last: null })]);
    expect(s).toEqual({ daysWithActivity: 2, medianFirst: 550, medianLast: 1030, spread: 60, active: 300, events: 12 });
  });

  it("finds recurring pauses ≥ 16 minutes in ≥ 60% of days inside each day's first..last", () => {
    const seg = (pattern: string, first: number, last: number): PeriodDaySegments => ({ day: "d", state: "ready", first, last, kinds: pattern, zones: "" });
    // Окно 540..600 → 30 отрезков. Пауза отрезков 5..14 (10 шт.) в трёх днях из трёх.
    const base = "11111" + "0000000000" + "111111111111111";
    const shorter = "11111" + "000000" + "1111" + "111111111111111";
    expect(recurringPauses([seg(base, 540, 600), seg(base, 540, 600), seg(shorter, 540, 600)], 540, 600)).toEqual([{ fromSegment: 5, toSegment: 15, from: 550, to: 570, days: 3, outOf: 3 }]);
    // Пауза вне [first, last] дня не считается: в двух днях из трёх день кончился раньше.
    const early = "11111" + "0000000000" + "000000000000000";
    expect(recurringPauses([seg(base, 540, 600), seg(early, 540, 550), seg(early, 540, 550)], 540, 600)).toEqual([]);
    expect(recurringPauses([seg(base, 540, 600)], 540, 600)).toEqual([]);
  });
});
