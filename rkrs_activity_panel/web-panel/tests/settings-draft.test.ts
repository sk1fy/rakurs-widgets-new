import { describe, expect, it } from "vitest";
import type { Employee } from "../src/domain/types";
import {
  applyThresholdsToDepartment,
  coreChanges,
  DEFAULT_PANEL_NAME,
  DEFAULT_THRESHOLDS,
  draftFromPanel,
  draftPayload,
  groupEmployees,
  moveItem,
  normalizePriorities,
  parsePipelines,
  resetViewPreferences,
  setDraftEmployees,
  tabOfField,
  toggleId,
  toggleOperator,
  toInt,
  validateDraft,
  windowError,
} from "../src/features/settings/draft";
import { defaultExtensions, defaultPreferences, PRIORITY_RULES, type PanelSettings } from "../src/settings/models";

const employees: Employee[] = [
  { id: 1, name: "Борис", groupId: "a", groupName: "Продажи" },
  { id: 2, name: "Анна", groupId: "a", groupName: "Продажи" },
  { id: 3, name: "Виктор", groupId: "b", groupName: "Колл-центр" },
];

const panel: PanelSettings = {
  id: "p1",
  name: "Отдел продаж",
  employeeIds: [1, 2, 3],
  displayWindow: { from: "09:00", to: "18:00" },
  enabled: true,
  timezone: "Europe/Moscow",
  revision: 4,
  updatedAt: "2026-10-01T10:00:00Z",
  shareUrlIssued: true,
  extensions: {
    ...defaultExtensions(),
    operators: [{ employeeId: 3, enabled: true, plan: 50, dialingSeconds: 5, conversationSeconds: 20, exceedingSeconds: 100 }],
  },
};

describe("draftFromPanel", () => {
  it("creates defaults for a new panel", () => {
    const d = draftFromPanel(null);
    expect(d.core.name).toBe(DEFAULT_PANEL_NAME);
    expect(d.core.employeeIds).toEqual([]);
    expect(d.core.enabled).toBe(true);
    expect(d.ext.telegram.inactivityMinutes).toBe(20);
    expect(d.ext.telegram.intervalMinutes).toBe(10);
  });

  it("copies an existing panel without sharing references", () => {
    const d = draftFromPanel(panel);
    expect(d.core.name).toBe("Отдел продаж");
    d.core.employeeIds.push(99);
    d.ext.operators[0]!.plan = 1;
    expect(panel.employeeIds).toEqual([1, 2, 3]);
    expect(panel.extensions?.operators[0]?.plan).toBe(50);
  });

  it("falls back to default extensions when backend has none", () => {
    expect(draftFromPanel({ ...panel, extensions: null }).ext).toEqual(defaultExtensions());
  });
});

describe("operators", () => {
  it("drops operators of deselected employees", () => {
    const d = setDraftEmployees(draftFromPanel(panel), [1, 2]);
    expect(d.core.employeeIds).toEqual([1, 2]);
    expect(d.ext.operators).toEqual([]);
  });

  it("adds operator with defaults and removes it", () => {
    const added = toggleOperator([], 1, true);
    expect(added).toEqual([{ employeeId: 1, enabled: true, plan: 100, ...DEFAULT_THRESHOLDS }]);
    expect(toggleOperator(added, 1, true)).toBe(added);
    expect(toggleOperator(added, 1, false)).toEqual([]);
  });

  it("applies department thresholds only to that department", () => {
    const ops = [toggleOperator([], 1, true)[0]!, toggleOperator([], 3, true)[0]!];
    const t = { dialingSeconds: 1, conversationSeconds: 2, exceedingSeconds: 3 };
    const next = applyThresholdsToDepartment(ops, employees, "a", t);
    expect(next[0]).toMatchObject(t);
    expect(next[1]).toMatchObject(DEFAULT_THRESHOLDS);
  });
});

describe("coreChanges", () => {
  it("returns only changed fields with trimmed name", () => {
    const d = draftFromPanel(panel);
    expect(coreChanges(d.core, d.core)).toEqual({});
    expect(coreChanges(d.core, { ...d.core, name: "  Новое  ", employeeIds: [3, 2, 1] })).toEqual({ name: "Новое" });
    expect(coreChanges(d.core, { ...d.core, enabled: false, displayWindow: { from: "08:00", to: "18:00" } })).toEqual({ enabled: false, displayWindow: { from: "08:00", to: "18:00" } });
  });

  it("returns the whole core for a new panel", () => {
    const d = draftFromPanel(null);
    expect(coreChanges(null, d.core)).toEqual(d.core);
  });
});

describe("draftPayload", () => {
  it("passes ext=null when extensions are unavailable", () => {
    expect(draftPayload(draftFromPanel(panel), false).ext).toBeNull();
  });

  it("keeps operators consistent with employees", () => {
    const d = draftFromPanel(panel);
    const payload = draftPayload({ ...d, core: { ...d.core, employeeIds: [1] } }, true);
    expect(payload.ext?.operators).toEqual([]);
  });
});

describe("validateDraft", () => {
  it("reports core and extension errors by field", () => {
    const d = draftFromPanel(null);
    const errors = validateDraft({ ...d, core: { ...d.core, name: " ", displayWindow: { from: "18:00", to: "09:00" } } }, true);
    expect(Object.keys(errors).sort()).toEqual(["displayWindow", "employeeIds", "name"]);
  });

  it("ignores extension errors when extensions are unavailable", () => {
    const d = draftFromPanel(panel);
    const bad = { ...d, ext: { ...d.ext, operators: [{ ...d.ext.operators[0]!, plan: 0 }], departmentThresholds: { a: { dialingSeconds: 50, conversationSeconds: 10, exceedingSeconds: 5 } } } };
    expect(validateDraft(bad, false)).toEqual({});
    const errors = validateDraft(bad, true);
    expect(errors["operators.3.plan"]).toBeDefined();
    expect(errors["departments.a"]).toBeDefined();
  });

  it("maps fields to editor tabs", () => {
    expect(tabOfField("name")).toBe("general");
    expect(tabOfField("operators.3.plan")).toBe("operators");
    expect(tabOfField("departments.a")).toBe("calls");
    expect(tabOfField("telegram.intervalMinutes")).toBe("notifications");
  });
});

describe("helpers", () => {
  it("parses pipelines", () => {
    expect(parsePipelines(" 1, 2;3  2 ")).toEqual(["1", "2", "3"]);
    expect(parsePipelines("")).toEqual([]);
  });

  it("groups employees by department sorted by name", () => {
    const groups = groupEmployees(employees);
    expect(groups.map((g) => g.groupName)).toEqual(["Колл-центр", "Продажи"]);
    expect(groups[1]?.employees.map((e) => e.name)).toEqual(["Анна", "Борис"]);
  });

  it("toggles ids and moves items", () => {
    expect(toggleId([1], 2, true)).toEqual([1, 2]);
    expect(toggleId([1, 2], 1, false)).toEqual([2]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    const same = ["a", "b"];
    expect(moveItem(same, 0, -1)).toBe(same);
  });

  it("validates local window", () => {
    expect(windowError({ from: "09:00", to: "18:00" })).toBeNull();
    expect(windowError({ from: "18:00", to: "09:00" })).not.toBeNull();
    expect(windowError({ from: "", to: "09:00" })).not.toBeNull();
  });

  it("parses integers from input", () => {
    expect(toInt("12")).toBe(12);
    expect(Number.isNaN(toInt(""))).toBe(true);
    expect(Number.isNaN(toInt("abc"))).toBe(true);
  });

  it("resets view preferences but keeps sidebar state", () => {
    const prev = { ...defaultPreferences(), sort: "name" as const, showPlanFact: false, hiddenEmployees: [5], sidebarCollapsed: true };
    const next = resetViewPreferences(prev);
    expect(next.sort).toBe("desc");
    expect(next.showPlanFact).toBe(true);
    expect(next.hiddenEmployees).toEqual([5]);
    expect(next.sidebarCollapsed).toBe(true);
  });

  it("normalizes priority rules", () => {
    const out = normalizePriorities([
      { key: "future", enabled: false },
      { key: "future", enabled: true },
      { key: "bogus" as never, enabled: true },
    ]);
    expect(out).toHaveLength(PRIORITY_RULES.length);
    expect(out[0]).toEqual({ key: "future", enabled: false });
    expect(new Set(out.map((p) => p.key)).size).toBe(PRIORITY_RULES.length);
  });
});
