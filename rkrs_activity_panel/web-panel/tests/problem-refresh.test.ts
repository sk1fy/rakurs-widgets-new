import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelScopeContext } from "../src/app/context";
import { FixtureSource } from "../src/api/fixtures/fixtureSource";
import type { Sourced } from "../src/api/source";
import { fixturePanel, fixtureProblemLists } from "../src/api/fixtures/generator";
import { hasProblemSnapshot, problemRefreshDelay } from "../src/domain/problemRefresh";
import type { ProblemLists } from "../src/domain/types";
import { HeaderIndicators } from "../src/features/dashboard/HeaderIndicators";
import { defaultPreferences } from "../src/settings/models";

const at = 1_793_000_000;
const data = (extra: Partial<ProblemLists> = {}): Sourced<ProblemLists> => ({ kind: "ok", data: { ...fixtureProblemLists([9007], at, null), refreshAfter: at + 420, ...extra } });

describe("problem snapshot polling", () => {
  it("waits until the server deadline, rather than restarting seven minutes after each status read", () => {
    expect(problemRefreshDelay(data(), null, (at + 120) * 1000)).toBe(300_000);
    expect(problemRefreshDelay(data(), null, (at + 419) * 1000)).toBe(10_000);
  });
  it("polls an active collection without extending its seven-minute deadline", () => {
    expect(problemRefreshDelay(data({ collecting: true, refreshAfter: at + 60 }), null, at * 1000)).toBe(60_000);
  });
  it("polls the first collection without treating empty counts as a complete zero snapshot", () => {
    const initial = data({ collecting: true, refreshAfter: at, meta: { source: "amocrm-pro", snapshotAt: 0, coverage: "unknown", partial: false, stale: true } });
    expect(hasProblemSnapshot(initial)).toBe(false);
    expect(problemRefreshDelay(initial, null, at * 1000)).toBe(10_000);
  });
  it("retries failures and bounds overdue or skewed deadlines without busy polling", () => {
    expect(problemRefreshDelay(data(), new Error("failed"), at * 1000)).toBe(30_000);
    expect(problemRefreshDelay(data(), null, (at + 600) * 1000)).toBe(10_000);
    expect(problemRefreshDelay(data({ refreshAfter: at + 86400 }), null, at * 1000)).toBe(420_000);
    expect(problemRefreshDelay(null, new Error("initial failed"), at * 1000)).toBe(30_000);
  });
  it("waits out a durable retry or batch pause, with a minimum status interval", () => {
    expect(problemRefreshDelay(data({ collecting: true, refreshAfter: at + 90 }), null, at * 1000)).toBe(90_000);
    expect(problemRefreshDelay(data({ collecting: true, refreshAfter: at + 1000 }), null, at * 1000)).toBe(1_000_000);
    expect(problemRefreshDelay(data({ collecting: true, refreshAfter: at - 1 }), null, at * 1000)).toBe(10_000);
    expect(problemRefreshDelay(data({ collecting: true, refreshAfter: undefined }), null, at * 1000)).toBe(10_000);
  });
  it("waits until the server cooldown after an initial permanent failure", () => {
    const stopped = data({ collecting: false, errorCode: "permission_denied", refreshAfter: at + 420,
      meta: { source: "amocrm-pro", snapshotAt: 0, coverage: "unknown", partial: false, stale: true } });
    expect(problemRefreshDelay(stopped, null, at * 1000)).toBe(420_000);
    expect(hasProblemSnapshot(stopped)).toBe(false);
  });
  it("falls back to snapshot age with old servers and stops for disconnected sources", () => {
    expect(problemRefreshDelay(data({ refreshAfter: undefined }), null, (at + 60) * 1000)).toBe(360_000);
    expect(problemRefreshDelay({ kind: "unavailable", contract: "C3", reason: "not connected" }, null, at * 1000)).toBeNull();
  });
});

function header(problems: Sourced<ProblemLists>, loading: boolean) {
  const panel = fixturePanel(at);
  return renderToStaticMarkup(createElement(PanelScopeContext.Provider,
    { value: { panel, prefs: defaultPreferences(), source: new FixtureSource(), viewKey: "demo", setPrefs: () => {} } },
    createElement(HeaderIndicators, { missed: null, missedUpdatedAt: null, problems, problemsLoading: loading, visibleIds: [9007] }),
  ));
}

it("shows only a spinner before the first snapshot, preserving real badges during background collection", () => {
  const initial = data({ collecting: true, refreshAfter: at, meta: { source: "amocrm-pro", snapshotAt: 0, coverage: "unknown", partial: false, stale: true } });
  const initialHTML = header(initial, true);
  expect(initialHTML).toContain('aria-label="Загрузка проблемных сделок"');
  expect(initialHTML).not.toContain('aria-label="Сделки без задач"');
  const ready = data({ collecting: true, leadsNoTasks: [{ managerId: 9007, count: 82, filterLink: null }], leadsWithFailedTasks: [{ managerId: 9007, count: 108, filterLink: null }] });
  const refreshingHTML = header(ready, true);
  expect(refreshingHTML).toContain('title="82"');
  expect(refreshingHTML).toContain('title="108"');
  expect(refreshingHTML.match(/aria-label="Обновление проблемных сделок"/g)).toHaveLength(2);
});

it("shows a stopped initial collection as an error instead of an endless spinner", () => {
  const stopped = data({ collecting: false, errorCode: "permission_denied", meta: { source: "amocrm-pro", snapshotAt: 0, coverage: "unknown", partial: false, stale: true } });
  const html = header(stopped, false);
  expect(html).toContain('aria-label="Ошибка загрузки проблемных сделок"');
  expect(html).not.toContain('aria-label="Загрузка проблемных сделок"');
});
