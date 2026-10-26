import { describe, expect, it } from "vitest";
import { comparisonCutoff, resolveWindow, buildRows, groupRows, hasActivity } from "../src/features/dashboard/model";
import { fixturePanel, generateDay } from "../src/api/fixtures/generator";
import { mapEvent, callFactsFromPayload } from "../src/api/amocrmPro";
import { unixAt } from "../src/domain/time";
import { defaultPreferences } from "../src/settings/models";
import { parseHash, href } from "../src/app/router";

const TZ = "Europe/Moscow";

describe("сравнение со вчера", () => {
  const panel = fixturePanel(0);
  it("сегодня — до того же времени на часах", () => {
    const now = unixAt("2026-10-21", 15 * 60 + 40, TZ);
    const win = resolveWindow(panel, defaultPreferences(), "2026-10-21", now);
    expect(comparisonCutoff(win, TZ, now)).toBe(unixAt("2026-10-20", 15 * 60 + 40, TZ));
  });
  it("F11: прошедший день — весь рабочий день накануне", () => {
    const now = unixAt("2026-10-21", 10 * 60, TZ);
    const win = resolveWindow(panel, defaultPreferences(), "2026-10-15", now);
    expect(comparisonCutoff(win, TZ, now)).toBe(unixAt("2026-10-14", 18 * 60, TZ));
  });
});

describe("сборка строк", () => {
  it("скрытые сотрудники и фильтр отделов", () => {
    const now = unixAt("2026-10-21", 12 * 60, TZ);
    const panel = fixturePanel(now);
    const today = { byEmployee: new Map(panel.employees.map((e) => [e.id, generateDay(e.id, "2026-10-21", now).events])), from: 0, to: 0, meta: panel.meta };
    const win = resolveWindow(panel, defaultPreferences(), "2026-10-21", now);
    const rows = buildRows({ panel, win, today, yesterday: null, problems: null, nowUnix: now, cutoffUnix: now });
    const prefs = { ...defaultPreferences(), hiddenEmployees: [9001], selectedDepartments: ["1"] };
    const groups = groupRows(rows, panel, prefs);
    expect(groups.map((g) => g.id)).toEqual(["1"]);
    expect(groups[0]?.rows.map((r) => r.employee.id)).not.toContain(9001);
    expect(rows.every((r) => r.percent >= 0 && r.percent <= 100)).toBe(true);
  });
  it("как в старой панели: 0% не показывается, счётчик группы — активные/всего", () => {
    const now = unixAt("2026-10-21", 12 * 60, TZ);
    const panel = fixturePanel(now);
    const [idle, ...rest] = panel.employees;
    const today = { byEmployee: new Map(rest.map((e) => [e.id, generateDay(e.id, "2026-10-21", now).events])), from: 0, to: 0, meta: panel.meta };
    const win = resolveWindow(panel, defaultPreferences(), "2026-10-21", now);
    const rows = buildRows({ panel, win, today, yesterday: null, problems: null, nowUnix: now, cutoffUnix: now });
    const idleRow = rows.find((r) => r.employee.id === idle?.id);
    expect(idleRow?.percent).toBe(0);
    expect(idleRow && hasActivity(idleRow)).toBe(false);
    const group = groupRows(rows, panel, defaultPreferences()).find((g) => g.id === idle?.groupId);
    expect(group?.rows.map((r) => r.employee.id)).toContain(idle?.id);
    expect(group?.active).toBe(group?.rows.filter(hasActivity).length);
    expect(group?.active).toBeLessThan(group?.total ?? 0);
  });
  it("фикстуры детерминированы и не заходят в будущее", () => {
    const now = unixAt("2026-10-21", 12 * 60, TZ);
    const a = generateDay(9001, "2026-10-21", now);
    expect(generateDay(9001, "2026-10-21", now).events.length).toBe(a.events.length);
    expect(a.events.every((e) => e.createdAt <= now)).toBe(true);
  });
});

describe("адаптер amocrm-pro", () => {
  it("факты звонка из value_after[0].note и отсутствие длительности как null", () => {
    const raw = { id: "x1", created_at: 100, created_by: 7, type: "outgoing_call", entity_id: 3, entity_type: "contact", value_before: [], value_after: [{ note: { id: 9, params: { duration: 42, phone: "+79001112233" } } }] };
    expect(mapEvent(raw).call).toMatchObject({ durationSeconds: 42, phone: "+79001112233" });
    expect(mapEvent({ ...raw, value_after: [{ note: { id: 9 } }] }).call?.durationSeconds).toBeNull();
    expect(callFactsFromPayload({ ...raw, value_after: [] })).toBeNull();
  });
  it("задача: taskId из entity_id, связанная сделка из payload", () => {
    const e = mapEvent({ id: "t", created_at: 1, created_by: 7, type: "task_completed", entity_id: 55, entity_type: "task", value_before: [], value_after: [{ task: { entity_type: "leads", entity_id: 900 } }] });
    expect(e.taskId).toBe(55);
    expect(e.related).toEqual({ entityType: "leads", entityId: 900 });
  });
});

describe("маршруты", () => {
  it("ключ просмотра в hash и обратно", () => {
    const r = { name: "employee", viewKey: "k/ey", employeeId: 5, date: "2026-10-20" } as const;
    expect(parseHash(href(r))).toEqual(r);
    expect(parseHash("#/p/abc")).toEqual({ name: "dashboard", viewKey: "abc", date: null });
  });
});
