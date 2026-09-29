import test from "node:test";
import assert from "node:assert/strict";
import {
  periodBounds,
  shiftPeriod,
  canGoForward,
  readPreferences,
} from "./periods.js";
import { getDemoDay } from "../data/demo.js";

test("week boundaries use Monday and work across a year boundary", () => {
  assert.deepEqual(periodBounds("week", "2026-01-01"), {
    start: "2025-12-29",
    end: "2026-01-04",
  });
  assert.deepEqual(periodBounds("week", "2026-09-27"), {
    start: "2026-09-21",
    end: "2026-09-27",
  });
});

test("month navigation cannot skip a short month from the 31st", () => {
  assert.equal(shiftPeriod("month", "2026-03-31", -1), "2026-02-01");
  assert.deepEqual(periodBounds("month", "2024-02-12"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
});

test("forward navigation is bounded by the demo snapshot for every mode", () => {
  for (const kind of ["day", "week", "month"]) {
    assert.equal(canGoForward(kind, "2026-09-24"), false);
  }
  assert.equal(canGoForward("day", "2026-09-23"), true);
  assert.equal(canGoForward("week", "2026-09-20"), true);
  assert.equal(canGoForward("week", "2026-09-21"), false);
  assert.equal(canGoForward("month", "2026-08-31"), true);
});

test("corrupted or unavailable storage never breaks initialization", () => {
  const fallback = { sidebar: true, comparisons: true, selected: null };
  assert.deepEqual(readPreferences({ getItem: () => "{oops" }), fallback);
  assert.deepEqual(readPreferences({ getItem: () => "null" }), fallback);
  assert.deepEqual(
    readPreferences({
      getItem: () => {
        throw new Error("disabled");
      },
    }),
    fallback
  );
});

test("saved empty selection remains empty and unexpected types are discarded", () => {
  assert.deepEqual(
    readPreferences({ getItem: () => '{"selected":[],"sidebar":false}' }),
    { sidebar: false, comparisons: true, selected: [] }
  );
  assert.deepEqual(
    readPreferences({
      getItem: () => '{"selected":["vika",7,null],"sidebar":"false"}',
    }),
    { sidebar: true, comparisons: true, selected: ["vika"] }
  );
});

test("daily fixtures agree with timeline durations and do not invent missing days", () => {
  assert.deepEqual(getDemoDay("2026-09-22"), []);
  for (const date of ["2026-09-23", "2026-09-24"]) {
    for (const employee of getDemoDay(date)) {
      const total = (type) =>
        employee.timeline
          .filter((segment) => !type || segment.type === type)
          .reduce((sum, segment) => sum + segment.duration, 0);
      const elapsed = date === "2026-09-24" ? 400 : 720;
      assert.ok(
        Math.abs(total() - 720) < 0.001,
        `${employee.name}: full work window`
      );
      assert.ok(
        Math.abs(total("call") - employee.callMinutes) < 0.001,
        `${employee.name}: call duration`
      );
      assert.ok(
        Math.abs(
          ((total("crm") + total("call")) / elapsed) * 100 - employee.rating
        ) < 0.001,
        `${employee.name}: rating`
      );
    }
  }
});
