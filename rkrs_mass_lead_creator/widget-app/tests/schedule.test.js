import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../src/schedule.js";

const DAY = "2026-10-06T09:00:00+03:00";

const cabinet = {
  workingDays: [1, 2, 3, 4, 5],
  startMinutes: 9 * 60,
  endMinutes: 18 * 60,
  offsetMinutes: 180,
  holidays: [],
};

function contacts(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `c${index + 1}` }));
}

function managers(ids) {
  return ids.map((id) => ({ id }));
}

test("100 contacts, 4 managers, limit 25 at day start", () => {
  const plan = buildPlan({
    contacts: contacts(100),
    managers: managers(["m1", "m2", "m3", "m4"]),
    durationMinutes: 5,
    dailyLimit: 25,
    now: DAY,
    cabinet,
  });
  assert.equal(plan.ok, true);
  const counts = ["m1", "m2", "m3", "m4"].map((id) => plan.countsByManager[id]);
  assert.deepEqual(counts, [25, 25, 25, 25]);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  assert.deepEqual(plan.days, ["2026-10-06"]);
  assert.equal(plan.items.length, 100);
});

test("100 contacts, 2 managers, limit 25 splits across two working days", () => {
  const plan = buildPlan({
    contacts: contacts(100),
    managers: managers(["m1", "m2"]),
    durationMinutes: 5,
    dailyLimit: 25,
    now: DAY,
    cabinet,
  });
  assert.deepEqual(
    ["m1", "m2"].map((id) => plan.countsByManager[id]),
    [50, 50]
  );
  assert.deepEqual(plan.days, ["2026-10-06", "2026-10-07"]);
  for (const id of ["m1", "m2"]) {
    assert.equal(plan.byManagerDay[id]["2026-10-06"], 25);
    assert.equal(plan.byManagerDay[id]["2026-10-07"], 25);
  }
});

test("30 tasks in a 09:00–18:00 window step by 18 minutes", () => {
  const plan = buildPlan({
    contacts: contacts(30),
    managers: managers(["m1"]),
    durationMinutes: 5,
    dailyLimit: 30,
    now: DAY,
    cabinet,
  });
  assert.equal(plan.items[0].stepMinutes, 18);
  assert.equal(plan.items[1].stepMinutes, 18);
  assert.equal(plan.items[0].startMs, Date.parse("2026-10-06T09:00:00+03:00"));
  assert.equal(plan.items[1].startMs, Date.parse("2026-10-06T09:18:00+03:00"));
  assert.equal(plan.items[0].dueMs, Date.parse("2026-10-06T09:05:00+03:00"));
  assert.equal(plan.warnings.length, 0);
});

test("friday 16:00 with monday holiday continues on tuesday", () => {
  const plan = buildPlan({
    contacts: contacts(8),
    managers: managers(["m1"]),
    durationMinutes: 30,
    dailyLimit: 25,
    now: "2026-10-02T16:00:00+03:00",
    cabinet: { ...cabinet, holidays: ["2026-10-05"] },
  });
  const days = new Set(plan.items.map((item) => item.day));
  assert.ok(plan.items.some((item) => item.day === "2026-10-02"));
  assert.equal(days.has("2026-10-03"), false);
  assert.equal(days.has("2026-10-04"), false);
  assert.equal(days.has("2026-10-05"), false);
  const tuesday = plan.items.filter((item) => item.day === "2026-10-06");
  assert.ok(tuesday.length >= 1);
  assert.equal(
    Math.min(...tuesday.map((item) => item.startMs)),
    Date.parse("2026-10-06T09:00:00+03:00")
  );
  assert.equal(plan.items[0].startMs, Date.parse("2026-10-02T16:00:00+03:00"));
});

test("duration greater than the window forbids the plan", () => {
  const plan = buildPlan({
    contacts: contacts(3),
    managers: managers(["m1"]),
    durationMinutes: 541,
    dailyLimit: 10,
    now: DAY,
    cabinet,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.forbidden, true);
  assert.equal(plan.reason, "duration_exceeds_window");
  assert.deepEqual(plan.items, []);
});

test("duration greater than step warns and still schedules fitting tasks", () => {
  const plan = buildPlan({
    contacts: contacts(10),
    managers: managers(["m1"]),
    durationMinutes: 60,
    dailyLimit: 10,
    now: DAY,
    cabinet,
  });
  assert.equal(plan.ok, true);
  assert.ok(plan.warnings.some((warning) => warning.code === "overload" && warning.stepMinutes === 54));
  const firstDay = plan.items.filter((item) => item.day === "2026-10-06");
  assert.equal(firstDay.length, 9);
  assert.equal(plan.items.length, 10);
  const windowEnd = Date.parse("2026-10-06T18:00:00+03:00");
  for (const item of firstDay) {
    assert.equal(item.overloaded, true);
    assert.ok(item.dueMs <= windowEnd + 1);
  }
  assert.equal(plan.items[9].day, "2026-10-07");
  assert.equal(plan.items[9].startMs, Date.parse("2026-10-07T09:00:00+03:00"));
});

test("duplicate contact id is scheduled once", () => {
  const plan = buildPlan({
    contacts: [{ id: "c1" }, { id: "c1" }, { id: "c2" }, { id: "c3" }],
    managers: managers(["m1", "m2"]),
    durationMinutes: 5,
    dailyLimit: 10,
    now: DAY,
    cabinet,
  });
  assert.deepEqual(
    plan.items.map((item) => item.contactId),
    ["c1", "c2", "c3"]
  );
  assert.equal(plan.duplicateIgnored, 1);
  assert.deepEqual(
    plan.items.map((item) => item.managerId),
    ["m1", "m2", "m1"]
  );
});

test("round-robin follows chip order", () => {
  const plan = buildPlan({
    contacts: contacts(4),
    managers: managers(["anna", "boris", "vera"]),
    durationMinutes: 5,
    dailyLimit: 10,
    now: DAY,
    cabinet,
  });
  assert.deepEqual(
    plan.items.map((item) => [item.contactId, item.managerId]),
    [
      ["c1", "anna"],
      ["c2", "boris"],
      ["c3", "vera"],
      ["c4", "anna"],
    ]
  );
});
