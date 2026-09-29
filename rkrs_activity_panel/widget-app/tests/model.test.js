import test from "node:test";
import assert from "node:assert/strict";
import { createActivityController } from "../src/model.js";

function fixture() {
  let clock = 1_800_000_000_000;
  let writes = 0;
  const records = new Map();
  const storage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
      writes += 1;
    },
  };
  return {
    storage,
    records,
    now: () => clock,
    advance: (ms) => {
      clock += ms;
    },
    writes: () => writes,
    create: (extra = {}) =>
      createActivityController({
        storage,
        now: () => clock,
        storageKey: "test:one",
        ...extra,
      }),
  };
}

test("running activity restores elapsed time across reload and tick avoids storage writes", () => {
  const f = fixture();
  const first = f.create();
  assert.equal(first.startTask(), true);
  f.advance(65_900);
  const writes = f.writes();
  first.tick();
  assert.equal(f.writes(), writes);
  assert.equal(first.getSnapshot().elapsedSeconds, 65);
  first.dispose();
  f.advance(35_100);
  const restored = f.create();
  assert.equal(restored.getSnapshot().elapsedSeconds, 101);
  assert.equal(restored.getSnapshot().totalSeconds, 101);
  assert.equal(restored.getSnapshot().active.kind, "tasks");
});

test("switching creates one history record and only one running activity", () => {
  const f = fixture();
  const controller = f.create();
  controller.startTask("task-call");
  f.advance(10_000);
  controller.startTask("task-meeting");
  let state = controller.getSnapshot();
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].seconds, 10);
  assert.equal(state.active.id, "task-meeting");
  f.advance(5_000);
  controller.startTask("task-meeting");
  assert.equal(
    controller.getSnapshot().elapsedSeconds,
    5,
    "same start must not reset the timer"
  );
  controller.selectScenario("other");
  state = controller.getSnapshot();
  assert.equal(state.active, null);
  assert.equal(state.history.length, 2);
  assert.equal(state.totalSeconds, 15);
  controller.stop();
  controller.stop();
  assert.equal(controller.getSnapshot().history.length, 2);
  controller.startOther("  Подготовка отчёта  ");
  f.advance(3_000);
  controller.startImbox("dialog-anna");
  assert.equal(controller.getSnapshot().active.kind, "imbox");
  assert.equal(
    controller.getSnapshot().history.at(-1).title,
    "Подготовка отчёта"
  );
});

test("selecting another task stops the running task without starting a timer", () => {
  const f = fixture();
  const controller = f.create();
  controller.startTask();
  f.advance(6000);
  controller.selectTask("task-email");
  assert.equal(controller.getSnapshot().active, null);
  assert.equal(controller.getSnapshot().selectedTaskId, "task-email");
  assert.equal(controller.getSnapshot().totalSeconds, 6);
});

test("completing advances to next pending task without auto-start and persists completion", () => {
  const f = fixture();
  const controller = f.create();
  controller.startTask();
  f.advance(7000);
  assert.equal(controller.completeTask(), true);
  let state = controller.getSnapshot();
  assert.equal(state.completedCount, 1);
  assert.equal(state.selectedTaskId, "task-meeting");
  assert.equal(state.active, null);
  assert.equal(state.history[0].seconds, 7);
  assert.equal(controller.startTask("task-call"), false);
  assert.equal(controller.selectTask("task-call"), false);
  assert.equal(f.create().getSnapshot().completedCount, 1);
  controller.completeTask();
  controller.completeTask();
  controller.completeTask();
  state = controller.getSnapshot();
  assert.equal(state.selectedTaskId, null);
  assert.equal(state.completedCount, 4);
  assert.equal(controller.startTask(), false);
});

test("invalid actions preserve running session; valid action clears transient error", () => {
  const f = fixture();
  const controller = f.create();
  controller.startTask();
  const running = controller.getSnapshot().active;
  const persisted = f.records.get("test:one");
  for (const invalid of [
    () => controller.startOther("  "),
    () => controller.startOther("ab"),
    () => controller.startOther("x".repeat(161)),
    () => controller.startImbox("missing"),
    () => controller.selectScenario("unknown"),
    () => controller.updateSettings({ compact: "yes" }),
  ]) {
    assert.equal(invalid(), false);
    assert.ok(controller.getSnapshot().error);
    assert.deepEqual(controller.getSnapshot().active, running);
    assert.equal(f.records.get("test:one"), persisted);
  }
  assert.equal(controller.updateSettings({ compact: true }), true);
  assert.equal(controller.getSnapshot().error, null);
  assert.equal(f.create().getSnapshot().settings.compact, true);
  controller.reset();
  const restored = f.create().getSnapshot();
  assert.equal(restored.active, null);
  assert.equal(restored.completedCount, 0);
  assert.equal(restored.totalSeconds, 0);
  assert.equal(restored.settings.compact, false);
});

test("separate storage keys isolate account contexts", () => {
  const f = fixture();
  const first = f.create();
  const second = f.create({ storageKey: "test:two" });
  first.startOther("Подготовка");
  first.updateSettings({ compact: true });
  second.completeTask();
  assert.equal(f.create().getSnapshot().active.kind, "other");
  assert.equal(f.create().getSnapshot().completedCount, 0);
  const secondRestored = f.create({ storageKey: "test:two" }).getSnapshot();
  assert.equal(secondRestored.active, null);
  assert.equal(secondRestored.completedCount, 1);
  assert.equal(secondRestored.settings.compact, false);
});

test("malformed and hostile persisted data are ignored or sanitized", () => {
  const f = fixture();
  for (const payload of [
    "{bad json",
    "null",
    "[]",
    "true",
    '{"version":2,"active":{}}',
  ]) {
    f.records.set("test:one", payload);
    assert.equal(f.create().getSnapshot().active, null);
  }
  f.records.set(
    "test:one",
    JSON.stringify({
      version: 1,
      scenario: "__proto__",
      selectedTaskId: "missing",
      completedTaskIds: ["task-call", {}],
      settings: { compact: "true" },
      active: { kind: "tasks", id: "task-call", startedAt: f.now() },
      history: [
        null,
        { kind: "other", title: "Invalid", seconds: -5, finishedAt: f.now() },
        {
          kind: "other",
          title: "Huge",
          seconds: 1e100,
          finishedAt: f.now() + 1e9,
        },
      ],
    })
  );
  const state = f.create().getSnapshot();
  assert.equal(state.scenario, "tasks");
  assert.equal(state.selectedTaskId, "task-meeting");
  assert.equal(state.active, null);
  assert.equal(state.settings.compact, false);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].seconds, 86400);
  assert.equal(state.history[0].finishedAt, f.now());
  const unavailable = createActivityController({
    storage: {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("quota");
      },
    },
  });
  assert.equal(unavailable.startOther("Подготовка"), true);
});

test("clock skew and long absences produce bounded non-negative durations", () => {
  const f = fixture();
  const controller = f.create();
  controller.startTask();
  f.advance(-10000);
  assert.equal(controller.getSnapshot().elapsedSeconds, 0);
  f.advance(1000 * 86400 * 30);
  assert.equal(controller.getSnapshot().elapsedSeconds, 86400);
  controller.stop();
  assert.equal(controller.getSnapshot().history[0].seconds, 86400);
});

test("snapshots cannot mutate state; subscription is deferred and dispose preserves stored session", () => {
  const f = fixture();
  const controller = f.create();
  let calls = 0;
  const unsubscribe = controller.subscribe(() => calls++);
  assert.equal(calls, 0);
  controller.startTask();
  assert.equal(calls, 1);
  const snapshot = controller.getSnapshot();
  snapshot.tasks[0].completed = true;
  snapshot.active.title = "changed";
  snapshot.settings.compact = true;
  assert.equal(controller.getSnapshot().tasks[0].completed, false);
  assert.notEqual(controller.getSnapshot().active.title, "changed");
  unsubscribe();
  controller.tick();
  assert.equal(calls, 1);
  controller.subscribe(() => calls++);
  const persisted = f.records.get("test:one");
  controller.dispose();
  for (const action of [
    () => controller.tick(),
    () => controller.stop(),
    () => controller.startTask(),
    () => controller.completeTask(),
    () => controller.startOther("Activity"),
    () => controller.startImbox("dialog-anna"),
    () => controller.selectScenario("other"),
    () => controller.selectTask("task-email"),
    () => controller.updateSettings({ compact: true }),
    () => controller.reset(),
  ])
    assert.equal(action(), false);
  assert.equal(calls, 1);
  assert.equal(f.records.get("test:one"), persisted);
  assert.ok(f.create().getSnapshot().active);
});
