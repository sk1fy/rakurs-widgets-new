import assert from "node:assert/strict";
import test from "node:test";
import { createDemoDeals, DEFAULT_SETTINGS, FROZEN_NOW } from "../src/demo-data.js";
import {
  criticalDecision,
  isInsideWorkingWindow,
  preAlertDecision,
  projectDeal,
  speedGroup,
  workingMilliseconds,
} from "../src/time.js";

const MIN = 60 * 1000;
const settings = DEFAULT_SETTINGS;

function findDeal(id) {
  return createDemoDeals().find((deal) => deal.id === id);
}

function touchDeal(start, end, extra = {}) {
  return {
    id: "synth",
    title: "Синтетическая",
    pipelineId: "sales",
    stageId: "new",
    budget: extra.budget ?? 10000,
    createdAt: start,
    assignments: extra.assignments || [{ managerId: extra.managerId || "m1", at: start }],
    events: extra.events || [
      {
        id: "touch",
        type: extra.type || "call",
        direction: extra.direction || "out",
        durationSec: extra.durationSec ?? 30,
        actorId: extra.actorId || extra.managerId || "m1",
        actorKind: extra.actorKind || "user",
        at: end,
      },
    ],
  };
}

test("friday 17:50 to monday 09:20 is exactly 30 working minutes and on time", () => {
  const start = Date.parse("2026-10-02T17:50:00+03:00");
  const end = Date.parse("2026-10-05T09:20:00+03:00");
  assert.equal(workingMilliseconds(start, end, settings), 30 * MIN);
  const view = projectDeal(findDeal("d-boundary"), settings, FROZEN_NOW);
  assert.equal(view.elapsedMs, 30 * MIN);
  assert.equal(view.status.id, "on_time");
  assert.equal(view.isBreach, false);
  assert.equal(view.channel, "Звонок");
  assert.equal(view.speed, "within");
});

test("evening assignment, holiday wednesday, thursday answer is 10 working minutes", () => {
  const start = Date.parse("2026-10-06T18:10:00+03:00");
  const end = Date.parse("2026-10-08T09:10:00+03:00");
  assert.equal(workingMilliseconds(start, end, settings), 10 * MIN);
  const withoutHoliday = workingMilliseconds(start, end, { ...settings, holidays: [] });
  assert.equal(withoutHoliday, 10 * MIN + 9 * 60 * MIN);
  const early = projectDeal(findDeal("d-holiday"), settings, FROZEN_NOW);
  assert.equal(early.future, true);
  assert.equal(early.touch, null);
  const later = projectDeal(
    findDeal("d-holiday"),
    settings,
    Date.parse("2026-10-08T09:15:00+03:00")
  );
  assert.equal(later.elapsedMs, 10 * MIN);
  assert.equal(later.status.id, "on_time");
  assert.equal(later.channel, "Звонок");
});

test("elapsed equal to the target is on time and one millisecond later is late", () => {
  const start = Date.parse("2026-10-06T10:00:00+03:00");
  const end = start + 30 * MIN;
  assert.equal(workingMilliseconds(start, end, settings), 30 * MIN);
  const onTime = projectDeal(touchDeal(start, end), settings, end);
  assert.equal(onTime.status.id, "on_time");
  assert.equal(onTime.isBreach, false);
  const late = projectDeal(touchDeal(start, end + 1), settings, end + 1);
  assert.equal(late.status.id, "late");
  assert.equal(late.isBreach, true);
  assert.equal(speedGroup(30 * MIN, 30 * MIN, true), "within");
  assert.equal(speedGroup(30 * MIN + 1, 30 * MIN, true), "slight");
  assert.equal(speedGroup(60 * MIN, 30 * MIN, true), "slight");
  assert.equal(speedGroup(60 * MIN + 1, 30 * MIN, true), "severe");
  assert.equal(speedGroup(10 * MIN, 30 * MIN, false), "unanswered");
});

test("invalid work window does not invent a duration", () => {
  assert.throws(
    () =>
      workingMilliseconds(FROZEN_NOW, FROZEN_NOW + MIN, {
        ...settings,
        workStart: "18:00",
        workEnd: "09:00",
      }),
    (error) => error.code === "invalid-schedule"
  );
  assert.equal(
    projectDeal(findDeal("d-boundary"), { ...settings, workStart: "18:00", workEnd: "09:00" }, FROZEN_NOW)
      .invalid,
    true
  );
});

test("pre-alert fires at 22 min 30 s once and is not a first touch", () => {
  const targetMs = 30 * MIN;
  const mark = 22.5 * MIN;
  assert.equal(
    preAlertDecision({
      elapsedMs: mark,
      targetMs,
      percent: 75,
      answered: false,
      alreadySent: false,
    }).action,
    "fire"
  );
  assert.equal(
    preAlertDecision({
      elapsedMs: mark - 1,
      targetMs,
      percent: 75,
      answered: false,
      alreadySent: false,
    }).action,
    "none"
  );
  assert.equal(
    preAlertDecision({
      elapsedMs: mark,
      targetMs,
      percent: 75,
      answered: false,
      alreadySent: true,
    }).action,
    "none"
  );
  assert.equal(
    preAlertDecision({
      elapsedMs: mark,
      targetMs,
      percent: 75,
      answered: true,
      alreadySent: false,
    }).action,
    "none"
  );
  assert.equal(
    preAlertDecision({
      elapsedMs: 2 * targetMs + 1,
      targetMs,
      percent: 75,
      answered: false,
      alreadySent: false,
    }).action,
    "skip"
  );
  const waiting = projectDeal(findDeal("d-prealert"), settings, FROZEN_NOW);
  assert.equal(waiting.touch, null);
  assert.equal(waiting.channel, null);
  assert.equal(waiting.elapsedMs, 20 * MIN);
  assert.equal(
    preAlertDecision({
      elapsedMs: waiting.elapsedMs + 5 * MIN,
      targetMs,
      percent: 75,
      answered: false,
      alreadySent: false,
    }).action,
    "fire"
  );
});

test("zero outbound call and inbound message do not stop the timer", () => {
  const zero = projectDeal(findDeal("d-zero-call"), settings, FROZEN_NOW);
  assert.equal(zero.touch, null);
  assert.equal(zero.channel, null);
  assert.equal(zero.elapsedMs, 45 * MIN);
  assert.equal(zero.status.id, "overdue");
  assert.ok(zero.timeline.some((item) => item.kind === "ignored"));

  const inbound = projectDeal(findDeal("d-inbound"), settings, FROZEN_NOW);
  assert.equal(inbound.touch, null);
  assert.equal(inbound.channel, null);
  assert.ok(inbound.elapsedMs > 0);

  const noise = projectDeal(findDeal("d-task-noise"), settings, FROZEN_NOW);
  const bot = projectDeal(findDeal("d-bot"), settings, FROZEN_NOW);
  assert.equal(noise.touch, null);
  assert.equal(bot.touch, null);
});

test("positive outbound call fixes the first touch and the call channel", () => {
  const view = projectDeal(findDeal("d-call-fixed"), settings, FROZEN_NOW);
  assert.ok(view.touch);
  assert.equal(view.channel, "Звонок");
  assert.equal(view.elapsedMs, 18 * MIN);
  assert.equal(view.status.id, "on_time");
  assert.equal(view.touch.managerId, "m2");
});

test("manual note depends on the setting", () => {
  const counted = projectDeal(findDeal("d-note"), settings, FROZEN_NOW);
  assert.equal(counted.channel, "Примечание");
  assert.equal(counted.elapsedMs, 12 * MIN);
  assert.equal(counted.status.id, "on_time");
  const ignored = projectDeal(findDeal("d-note"), { ...settings, noteCounts: false }, FROZEN_NOW);
  assert.equal(ignored.touch, null);
  assert.equal(ignored.channel, null);
  assert.ok(ignored.elapsedMs > 30 * MIN);
  assert.equal(ignored.status.id, "overdue");
});

test("reassignment while waiting follows reset or keep", () => {
  const reset = projectDeal(findDeal("d-reassign"), settings, FROZEN_NOW);
  assert.equal(reset.managerId, "m1");
  assert.equal(reset.elapsedMs, 15 * MIN);
  assert.equal(reset.touch, null);
  assert.equal(reset.status.id, "waiting");
  assert.ok(reset.epochs.length > 1);

  const keep = projectDeal(
    findDeal("d-reassign"),
    { ...settings, reassignmentPolicy: "keep" },
    FROZEN_NOW
  );
  assert.equal(keep.elapsedMs, 30 * MIN);
  assert.equal(keep.status.id, "risk");
  assert.equal(keep.isBreach, false);
});

test("a touch must come from the responsible person at that moment", () => {
  const start = Date.parse("2026-10-06T10:00:00+03:00");
  const foreign = projectDeal(
    touchDeal(start, start + 5 * MIN, {
      assignments: [
        { managerId: "m4", at: start },
        { managerId: "m1", at: start + 2 * MIN },
      ],
      events: [
        {
          id: "foreign",
          type: "call",
          direction: "out",
          durationSec: 40,
          actorId: "m4",
          actorKind: "user",
          at: start + 5 * MIN,
        },
      ],
    }),
    settings,
    start + 6 * MIN
  );
  assert.equal(foreign.touch, null);
  const own = projectDeal(
    touchDeal(start, start + 5 * MIN, {
      assignments: [
        { managerId: "m4", at: start },
        { managerId: "m1", at: start + 2 * MIN },
      ],
      actorId: "m1",
      managerId: "m1",
    }),
    settings,
    start + 6 * MIN
  );
  assert.equal(own.channel, "Звонок");
  assert.equal(own.elapsedMs, 3 * MIN);
});

test("reassignment after a confirmed touch does not rewrite the result", () => {
  const start = Date.parse("2026-10-06T10:00:00+03:00");
  const view = projectDeal(
    {
      id: "locked",
      title: "Закрытый итог",
      pipelineId: "sales",
      stageId: "work",
      budget: 1000,
      createdAt: start,
      assignments: [
        { managerId: "m1", at: start },
        { managerId: "m2", at: start + 40 * MIN },
      ],
      events: [
        {
          id: "done",
          type: "call",
          direction: "out",
          durationSec: 15,
          actorId: "m1",
          actorKind: "user",
          at: start + 10 * MIN,
        },
      ],
    },
    settings,
    start + 50 * MIN
  );
  assert.equal(view.elapsedMs, 10 * MIN);
  assert.equal(view.channel, "Звонок");
  assert.equal(view.managerId, "m2");
  assert.equal(view.status.id, "on_time");
});

test("critical task is one escalation and not a first touch", () => {
  const targetMs = 30 * MIN;
  const base = {
    targetMs,
    multiplier: 2,
    threshold: 500000,
    answered: false,
    alreadyCreated: false,
  };
  assert.equal(
    criticalDecision({ ...base, elapsedMs: 60 * MIN, budget: 1000 }).create,
    true
  );
  assert.equal(
    criticalDecision({ ...base, elapsedMs: 40 * MIN, budget: 1500000 }).reason,
    "budget"
  );
  assert.equal(
    criticalDecision({ ...base, elapsedMs: 10 * MIN, budget: 2000000 }).create,
    false
  );
  assert.equal(
    criticalDecision({ ...base, elapsedMs: 30 * MIN, budget: 2000000 }).create,
    false
  );
  assert.equal(
    criticalDecision({ ...base, elapsedMs: 45 * MIN, budget: 70000 }).create,
    false
  );
  assert.equal(
    criticalDecision({ ...base, elapsedMs: 40 * MIN, budget: 500000 }).create,
    false
  );
  assert.equal(
    criticalDecision({ ...base, elapsedMs: 80 * MIN, budget: 1500000, alreadyCreated: true }).create,
    false
  );
  const flagged = findDeal("d-critical-2x");
  flagged.criticalTask = { id: "task-1", at: FROZEN_NOW, reason: "multiplier" };
  const view = projectDeal(flagged, settings, FROZEN_NOW);
  assert.equal(view.touch, null);
  assert.equal(view.channel, null);
  assert.equal(view.criticalTask.id, "task-1");
  assert.ok(view.timeline.some((item) => item.kind === "critical"));
});

test("hiding the off-hours highlight does not change working time", () => {
  const shown = projectDeal(findDeal("d-evening"), settings, FROZEN_NOW);
  const hidden = projectDeal(
    findDeal("d-evening"),
    { ...settings, hideOffHoursHighlight: true },
    FROZEN_NOW
  );
  assert.equal(shown.elapsedMs, 15 * MIN);
  assert.equal(hidden.elapsedMs, shown.elapsedMs);
  assert.equal(shown.suppressHighlight, false);
  assert.equal(hidden.suppressHighlight, true);
  assert.equal(isInsideWorkingWindow(shown.createdAt, settings), false);
  const inside = projectDeal(
    findDeal("d-boundary"),
    { ...settings, hideOffHoursHighlight: true },
    FROZEN_NOW
  );
  assert.equal(inside.suppressHighlight, false);
});

test("fixture has the agreed cast and does not leave answered deals open for weeks", () => {
  const deals = createDemoDeals();
  assert.ok(deals.length >= 28 && deals.length <= 36);
  const channels = new Set();
  for (const deal of deals) {
    const view = projectDeal(deal, settings, FROZEN_NOW);
    assert.equal(view.invalid, false, deal.id);
    if (view.answered) {
      channels.add(view.channel);
      assert.ok(view.elapsedMs < 3 * 24 * 60 * MIN, deal.id);
    }
  }
  for (const channel of ["Звонок", "Чат", "Email", "Примечание"]) {
    assert.ok(channels.has(channel), channel);
  }
});
