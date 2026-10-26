// Чистые преобразования черновиков экрана настроек ⇄ моделей.
// Не зависят от React и транспорта — покрыты unit-тестами.

import type { DisplayWindow, Employee, EmployeeId, OperatorSettings } from "../../domain/types";
import {
  defaultExtensions,
  defaultPreferences,
  PRIORITY_RULES,
  validateCore,
  validateExtensions,
  type CallThresholds,
  type LocalPreferences,
  type PanelCore,
  type PanelExtensions,
  type PanelSettings,
  type TaskPanelSettings,
} from "../../settings/models";

export const DEFAULT_PANEL_NAME = "Моя компания";
export const DEFAULT_WINDOW: DisplayWindow = { from: "09:00", to: "18:00" };
export const DEFAULT_THRESHOLDS: CallThresholds = { dialingSeconds: 10, conversationSeconds: 30, exceedingSeconds: 180 };
export const DEFAULT_PLAN = 100;

/** Черновик редактора панели: ядро (amocrm-pro) и расширения (C5) раздельно. */
export interface PanelDraft {
  core: PanelCore;
  ext: PanelExtensions;
}

export type FieldErrors = Record<string, string>;

export function draftFromPanel(panel: PanelSettings | null): PanelDraft {
  if (!panel) {
    return {
      core: { name: DEFAULT_PANEL_NAME, employeeIds: [], displayWindow: { ...DEFAULT_WINDOW }, enabled: true },
      ext: defaultExtensions(),
    };
  }
  const base = defaultExtensions();
  const ext = panel.extensions;
  return {
    core: { name: panel.name, employeeIds: [...panel.employeeIds], displayWindow: { ...panel.displayWindow }, enabled: panel.enabled },
    ext: ext
      ? {
          pipelines: [...ext.pipelines],
          operators: ext.operators.map((o) => ({ ...o })),
          departmentThresholds: Object.fromEntries(Object.entries(ext.departmentThresholds).map(([k, v]) => [k, { ...v }])),
          telegram: { ...base.telegram, ...ext.telegram },
        }
      : base,
  };
}

export function defaultOperator(employeeId: EmployeeId, thresholds: CallThresholds = DEFAULT_THRESHOLDS): OperatorSettings {
  return { employeeId, enabled: true, plan: DEFAULT_PLAN, ...thresholds };
}

/** Операторы возможны только среди выбранных сотрудников панели. */
export function syncOperators(operators: OperatorSettings[], employeeIds: EmployeeId[]): OperatorSettings[] {
  const allowed = new Set(employeeIds);
  return operators.filter((o) => allowed.has(o.employeeId));
}

/** Выбор сотрудников в «Общих» с синхронизацией операторов. */
export function setDraftEmployees(draft: PanelDraft, employeeIds: EmployeeId[]): PanelDraft {
  return {
    core: { ...draft.core, employeeIds },
    ext: { ...draft.ext, operators: syncOperators(draft.ext.operators, employeeIds) },
  };
}

export function toggleOperator(operators: OperatorSettings[], employeeId: EmployeeId, on: boolean, thresholds?: CallThresholds): OperatorSettings[] {
  const has = operators.some((o) => o.employeeId === employeeId);
  if (on && !has) return [...operators, defaultOperator(employeeId, thresholds)];
  if (!on && has) return operators.filter((o) => o.employeeId !== employeeId);
  return operators;
}

export function thresholdsValid(t: CallThresholds): boolean {
  return t.dialingSeconds >= 0 && t.dialingSeconds < t.conversationSeconds && t.conversationSeconds < t.exceedingSeconds;
}

export function departmentThresholds(ext: PanelExtensions, groupId: string): CallThresholds {
  return ext.departmentThresholds[groupId] ?? { ...DEFAULT_THRESHOLDS };
}

/** «Применить к операторам отдела»: пороги отдела копируются в операторов этого отдела. */
export function applyThresholdsToDepartment(operators: OperatorSettings[], employees: Employee[], groupId: string, thresholds: CallThresholds): OperatorSettings[] {
  const inGroup = new Set(employees.filter((e) => e.groupId === groupId).map((e) => e.id));
  return operators.map((o) => (inGroup.has(o.employeeId) ? { ...o, ...thresholds } : o));
}

/** Изменённые поля ядра для PATCH; новая панель — всё ядро целиком. */
export function coreChanges(original: PanelCore | null, core: PanelCore): Partial<PanelCore> {
  if (!original) return { ...core, name: core.name.trim() };
  const out: Partial<PanelCore> = {};
  if (original.name !== core.name.trim()) out.name = core.name.trim();
  if (!sameIds(original.employeeIds, core.employeeIds)) out.employeeIds = core.employeeIds;
  if (original.displayWindow.from !== core.displayWindow.from || original.displayWindow.to !== core.displayWindow.to) out.displayWindow = core.displayWindow;
  if (original.enabled !== core.enabled) out.enabled = core.enabled;
  return out;
}

function sameIds(a: EmployeeId[], b: EmployeeId[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((id) => s.has(id));
}

/** Полезная нагрузка сохранения: расширения уходят, только если бэкенд их поддерживает. */
export function draftPayload(draft: PanelDraft, extensionsAvailable: boolean): { core: PanelCore; ext: PanelExtensions | null } {
  const core = { ...draft.core, name: draft.core.name.trim() };
  if (!extensionsAvailable) return { core, ext: null };
  return { core, ext: { ...draft.ext, operators: syncOperators(draft.ext.operators, draft.core.employeeIds) } };
}

export function validateDraft(draft: PanelDraft, extensionsAvailable: boolean): FieldErrors {
  const issues = [...validateCore(draft.core), ...(extensionsAvailable ? validateExtensions(draft.ext) : [])];
  const out: FieldErrors = {};
  for (const i of issues) out[i.field] ??= i.message;
  if (extensionsAvailable) {
    for (const [groupId, t] of Object.entries(draft.ext.departmentThresholds)) {
      if (!thresholdsValid(t)) out[`departments.${groupId}`] ??= "Пороги: дозвон < разговор < превышение";
    }
  }
  return out;
}

/** На какой вкладке редактора лежит поле ошибки. */
export type EditorTab = "general" | "operators" | "calls" | "notifications";

export function tabOfField(field: string): EditorTab {
  if (field.startsWith("operators.")) return "operators";
  if (field.startsWith("telegram")) return "notifications";
  if (field.startsWith("departments.")) return "calls";
  return "general";
}

export function parsePipelines(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
}

export interface EmployeeGroup {
  groupId: string;
  groupName: string;
  employees: Employee[];
}

export function groupEmployees(employees: Employee[]): EmployeeGroup[] {
  const map = new Map<string, EmployeeGroup>();
  for (const e of employees) {
    const g = map.get(e.groupId) ?? { groupId: e.groupId, groupName: e.groupName || "Без отдела", employees: [] };
    g.employees.push(e);
    map.set(e.groupId, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, employees: [...g.employees].sort((a, b) => a.name.localeCompare(b.name, "ru")) }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName, "ru"));
}

export function toggleId<T>(list: T[], id: T, on: boolean): T[] {
  const has = list.includes(id);
  if (on && !has) return [...list, id];
  if (!on && has) return list.filter((x) => x !== id);
  return list;
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Проверка окна просмотра; null — корректно. */
export function windowError(w: DisplayWindow): string | null {
  if (!TIME_RE.test(w.from) || !TIME_RE.test(w.to)) return "Время в формате ЧЧ:ММ";
  if (w.from >= w.to) return "Начало должно быть раньше конца";
  return null;
}

/** Сброс «Моего вида»: состояние боковой панели (скрытые, свёрнутые) не трогаем. */
export function resetViewPreferences(prev: LocalPreferences): LocalPreferences {
  return {
    ...defaultPreferences(),
    hiddenEmployees: prev.hiddenEmployees,
    compactGroups: prev.compactGroups,
    sidebarCollapsed: prev.sidebarCollapsed,
    collapsedGroups: prev.collapsedGroups,
  };
}

/** Все 6 правил ровно по разу: неизвестные отбрасываются, недостающие — в конец включёнными. */
export function normalizePriorities(priorities: TaskPanelSettings["priorities"]): TaskPanelSettings["priorities"] {
  const known = new Set<string>(PRIORITY_RULES.map((r) => r.key));
  const seen = new Set<string>();
  const out: TaskPanelSettings["priorities"] = [];
  for (const p of priorities) {
    if (!known.has(p.key) || seen.has(p.key)) continue;
    seen.add(p.key);
    out.push({ key: p.key, enabled: p.enabled });
  }
  for (const r of PRIORITY_RULES) if (!seen.has(r.key)) out.push({ key: r.key, enabled: true });
  return out;
}

export function priorityLabel(key: string): string {
  return PRIORITY_RULES.find((r) => r.key === key)?.label ?? key;
}

/** Условие правила приоритета (SettingsView.vue). */
export function priorityHint(key: string): string | null {
  return PRIORITY_RULES.find((r) => r.key === key)?.hint ?? null;
}

/** Целое из поля ввода; пустое/мусор — NaN (валидация покажет ошибку). */
export function toInt(text: string): number {
  if (text.trim() === "") return Number.NaN;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : Number.NaN;
}

export function formatUpdatedAt(iso: string | null, timeZone?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString("ru-RU", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toLocaleString("ru-RU");
  }
}
