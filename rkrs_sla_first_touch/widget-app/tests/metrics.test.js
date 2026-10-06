import assert from "node:assert/strict";
import test from "node:test";
import {
  createDemoDeals,
  DEFAULT_SETTINGS,
  EMPLOYEES,
  FROZEN_NOW,
} from "../src/demo-data.js";
import {
  buildMetrics,
  cohortToCsv,
  composeDigest,
  composeEod,
  formatDelta,
  formatDuration,
  percentDelta,
  periodBounds,
  previousBounds,
  projectDeal,
  selectDigestBreaches,
  selectEodDeals,
} from "../src/time.js";

const settings = DEFAULT_SETTINGS;
const now = FROZEN_NOW;

function viewsAt(at = now) {
  return createDemoDeals().map((deal) => {
    const view = projectDeal(deal, settings, at);
    const manager = EMPLOYEES.find((item) => item.id === view.managerId);
    view.managerName = manager?.name || view.managerId;
    view.pipelineName = view.pipelineId === "care" ? "Сопровождение" : "Продажи";
    return view;
  });
}

function report(filters = {}, bounds = periodBounds("month", now, settings.timezone)) {
  return buildMetrics({
    deals: viewsAt(),
    bounds,
    settings,
    filters,
    employees: EMPLOYEES,
    now,
  });
}

test("empty sample says there is no data and does not invent a delta", () => {
  const bounds = periodBounds("custom", now, settings.timezone, {
    from: "2026-01-05",
    to: "2026-01-09",
  });
  const empty = buildMetrics({
    deals: viewsAt(),
    bounds,
    settings,
    filters: {},
    employees: EMPLOYEES,
    now,
  });
  assert.equal(empty.kpis.average.label, "нет данных");
  assert.equal(empty.kpis.onTime.label, "нет данных");
  assert.equal(empty.kpis.breaches.label, "нет данных");
  assert.equal(empty.kpis.worst.label, "нет данных");
  assert.equal(empty.kpis.average.delta.state, "absent");
  assert.equal(empty.kpis.onTime.delta.state, "absent");
  assert.equal(empty.kpis.breaches.delta.state, "absent");
  assert.equal(formatDelta(empty.kpis.average.delta), "сравнение отсутствует");
  assert.equal(empty.cohort.length, 0);
  assert.equal(formatDuration(null), "нет данных");
  assert.equal(percentDelta(12, 0).state, "absent");
  assert.equal(percentDelta(12, null).state, "absent");
  assert.equal(Number.isFinite(percentDelta(12, 0).value), false);
});

test("a populated period with an empty previous period keeps the average and drops the delta", () => {
  const current = [
    {
      id: "a",
      managerId: "m1",
      pipelineId: "sales",
      assignedAt: Date.parse("2026-10-06T10:00:00+03:00"),
      elapsedMs: 10 * 60000,
      channel: "Звонок",
      answered: true,
      future: false,
      invalid: false,
      isBreach: false,
      overrunMs: 0,
      weekday: 2,
      hour: 10,
      speed: "within",
      status: { id: "on_time", label: "отвечено вовремя" },
      title: "Одна",
    },
  ];
  const bounds = periodBounds("today", now, settings.timezone);
  const metrics = buildMetrics({
    deals: current,
    bounds,
    settings,
    filters: {},
    employees: EMPLOYEES,
    now,
  });
  assert.equal(metrics.kpis.average.label, "10 мин");
  assert.equal(metrics.kpis.average.sample, 1);
  assert.equal(metrics.kpis.average.delta.state, "absent");
  assert.notEqual(metrics.kpis.average.delta.value, Infinity);
});

test("averages use only touched deals and breaches are counted once", () => {
  const metrics = report();
  assert.ok(metrics.kpis.average.sample > 0);
  assert.equal(metrics.kpis.average.label.includes("нет данных"), false);
  assert.ok(metrics.kpis.average.waiting > 0);
  const touched = metrics.cohort.filter((row) => row.answered);
  const waiting = metrics.cohort.filter((row) => !row.answered);
  assert.equal(metrics.kpis.average.sample, touched.length);
  assert.equal(metrics.kpis.average.waiting, waiting.length);
  const breachIds = new Set(metrics.cohort.filter((row) => row.isBreach).map((row) => row.id));
  assert.equal(metrics.kpis.breaches.count, breachIds.size);
  assert.equal(metrics.kpis.breaches.controlled, metrics.cohort.length);
  const speedSum = metrics.speed.reduce((sum, group) => sum + group.count, 0);
  assert.equal(speedSum, metrics.kpis.breaches.controlled);
  assert.equal(
    metrics.speed.find((group) => group.id === "unanswered").count,
    waiting.length
  );
});

test("october comparison against september is a finite delta", () => {
  const metrics = report();
  assert.equal(metrics.kpis.average.delta.state, "value");
  assert.equal(Number.isFinite(metrics.kpis.average.delta.value), true);
  assert.equal(metrics.kpis.onTime.delta.state, "value");
  assert.equal(Number.isFinite(metrics.kpis.onTime.delta.value), true);
  assert.notEqual(metrics.kpis.average.delta.value, Infinity);
  assert.notEqual(metrics.kpis.average.delta.value, -Infinity);
});

test("channel, manager and heatmap filters narrow the cohort and stay visible in the rows", () => {
  const all = report();
  const calls = report({ channel: "Звонок" });
  assert.ok(calls.cohort.length > 0);
  assert.ok(calls.cohort.every((row) => row.channel === "Звонок"));
  assert.equal(calls.kpis.breaches.controlled, all.kpis.breaches.controlled);
  assert.ok(calls.cohort.length < all.cohort.length);
  assert.equal(
    all.channels.every((channel) => channel.count === 0 || channel.averageLabel !== "0 мин" || channel.count > 0),
    true
  );
  const unansweredChannel = all.cohort.filter((row) => !row.answered);
  assert.ok(unansweredChannel.every((row) => row.channel == null));

  const manager = report({ managerId: "m1" });
  assert.ok(manager.cohort.length > 0);
  assert.ok(manager.cohort.every((row) => row.managerId === "m1"));
  assert.ok(manager.kpis.breaches.controlled < all.kpis.breaches.controlled);

  const cell = all.cohort.find((row) => row.id === "d-boundary");
  const heat = report({ weekday: cell.weekday, hour: cell.hour });
  assert.ok(heat.cohort.some((row) => row.id === "d-boundary"));
  assert.ok(heat.cohort.every((row) => row.weekday === cell.weekday && row.hour === cell.hour));

  const speed = report({ speed: "unanswered" });
  assert.ok(speed.cohort.length > 0);
  assert.ok(speed.cohort.every((row) => row.speed === "unanswered"));
  assert.ok(speed.cohort.every((row) => row.channel == null));
});

test("the boundary deal belongs to october and to the hour of its assignment", () => {
  const month = periodBounds("month", now, settings.timezone);
  const week = periodBounds("week", now, settings.timezone);
  const view = viewsAt().find((deal) => deal.id === "d-boundary");
  assert.ok(view.assignedAt >= month.from && view.assignedAt < month.to);
  assert.ok(view.assignedAt < week.from);
  assert.equal(view.weekday, 5);
  assert.equal(view.hour, 17);
  assert.equal(previousBounds(month).to, month.from);
});

test("digest and end-of-day stay empty when there is nothing to send", () => {
  assert.equal(composeDigest([], settings), null);
  assert.equal(composeEod([], EMPLOYEES, settings), null);
  const january = selectEodDeals(viewsAt(), "2026-01-06", settings.timezone);
  assert.equal(composeEod(january, EMPLOYEES, settings), null);
  const none = selectDigestBreaches(viewsAt(), now, now);
  assert.equal(composeDigest(none, settings), null);
});

test("digest keeps at most 20 worst deals and names manager, overrun and target", () => {
  const breaches = Array.from({ length: 25 }, (_, index) => ({
    id: `b${index}`,
    title: `Сделка ${index}`,
    managerId: "m1",
    managerName: "Марина Соколова",
    overrunMs: (index + 1) * 60000,
    isBreach: true,
    breachAt: index + 1,
  }));
  const message = composeDigest(breaches, settings);
  assert.equal(message.lines.length, 20);
  assert.equal(message.breachCount, 25);
  assert.match(message.lines[0], /Марина Соколова/);
  assert.match(message.lines[0], /25 мин/);
  assert.match(message.lines[0], /норматив 30 мин/);
  const today = selectEodDeals(viewsAt(), "2026-10-06", settings.timezone);
  const eod = composeEod(today, EMPLOYEES, settings);
  assert.ok(eod.total > 0);
  assert.ok(eod.managers.length > 0);
  assert.match(eod.breachPercentLabel, /%|нет данных/);
});

test("csv export follows the cohort and does not guess a channel", () => {
  const metrics = report({ speed: "unanswered" });
  const csv = cohortToCsv(metrics.cohort, settings.timezone);
  assert.match(csv.split("\n")[0], /Сделка;Менеджер;Воронка/);
  assert.match(csv, /не определён/);
  assert.equal(csv.split("\n").length, metrics.cohort.length + 1);
});
