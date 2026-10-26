// Модели настроек. Три независимых уровня:
//  1) LocalPreferences — личные предпочтения зрителя в этом браузере
//     (не синхронизируются, не влияют на других);
//  2) PanelSettings — общие настройки панели (владелец — amocrm-pro);
//  3) TaskPanelSettings — глобальные настройки панели задач аккаунта.
// Модели не зависят от React и транспорта: их можно перенести в TeamOS.

import type { DisplayWindow, EmployeeId, OperatorSettings } from "../domain/types";

export const KPI_KEYS = [
  "totalCallsTime",
  "outgoingCalls",
  "messages",
  "outgoingMail",
  "completedTasks",
  "leadStatusChanges",
  "leadsNoTasks",
  "leadsFailedTasks",
  "overdueTasks",
] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

export const KPI_LABELS: Record<KpiKey, string> = {
  totalCallsTime: "Общее время звонков",
  outgoingCalls: "Исходящие звонки",
  messages: "Сообщения",
  outgoingMail: "Исходящие письма",
  completedTasks: "Выполненные задачи",
  leadStatusChanges: "Смена этапов сделок",
  leadsNoTasks: "Сделки без задач",
  leadsFailedTasks: "Сделки с просроченными задачами",
  overdueTasks: "Просроченные задачи",
};

export type SortOrder = "desc" | "asc" | "name";

export interface LocalPreferences {
  version: 1;
  /** Локальное окно просмотра поверх окна панели; null — как у панели. */
  workWindow: DisplayWindow | null;
  groupByDepartments: boolean;
  /** Пусто — все отделы. */
  selectedDepartments: string[];
  /** Скрытые сотрудники боковой панели. */
  hiddenEmployees: EmployeeId[];
  notifications: { missedCalls: boolean; leadsNoTasks: boolean; leadsFailedTasks: boolean };
  kpi: Record<KpiKey, boolean>;
  showPlanFact: boolean;
  /** События внешней панели задач на таймлайне (по умолчанию выкл., как в старом UI). */
  showTaskPanelEvents: boolean;
  compactGroups: string[];
  sort: SortOrder;
  sidebarCollapsed: boolean;
  collapsedGroups: string[];
}

export function defaultPreferences(): LocalPreferences {
  return {
    version: 1,
    workWindow: null,
    groupByDepartments: true,
    selectedDepartments: [],
    hiddenEmployees: [],
    notifications: { missedCalls: true, leadsNoTasks: true, leadsFailedTasks: true },
    kpi: Object.fromEntries(KPI_KEYS.map((k) => [k, true])) as Record<KpiKey, boolean>,
    showPlanFact: true,
    showTaskPanelEvents: false,
    compactGroups: [],
    sort: "desc",
    sidebarCollapsed: false,
    collapsedGroups: [],
  };
}

export interface CallThresholds {
  dialingSeconds: number;
  conversationSeconds: number;
  exceedingSeconds: number;
}

export interface TelegramSettings {
  enabled: boolean;
  /** Токен бота только для записи: сервер возвращает лишь признак наличия. */
  tokenSet: boolean;
  chatId: string | null;
  chatTitle: string | null;
  inactivityMinutes: number;
  intervalMinutes: number;
}

/** Поля, которые уже поддерживает amocrm-pro (ActivityPanelCreate/Patch). */
export interface PanelCore {
  name: string;
  employeeIds: EmployeeId[];
  displayWindow: DisplayWindow;
  enabled: boolean;
}

/** Поля старой панели, которых нет в amocrm-pro (контракт C5). */
export interface PanelExtensions {
  pipelines: string[];
  operators: OperatorSettings[];
  departmentThresholds: Record<string, CallThresholds>;
  telegram: TelegramSettings;
}

export interface PanelSettings extends PanelCore {
  id: string;
  timezone: string;
  revision: number;
  updatedAt: string | null;
  shareUrlIssued: boolean;
  extensions: PanelExtensions | null;
}

export function defaultExtensions(): PanelExtensions {
  return {
    pipelines: [],
    operators: [],
    departmentThresholds: {},
    telegram: { enabled: false, tokenSet: false, chatId: null, chatTitle: null, inactivityMinutes: 20, intervalMinutes: 10 },
  };
}

export const PRIORITY_RULES = [
  { key: "urgent", label: "Срочные" },
  { key: "overdue", label: "Просрочены" },
  { key: "overdue_no_time", label: "Просрочены без времени" },
  { key: "today_no_time", label: "Сегодняшние без времени" },
  { key: "today_timed", label: "На сегодня по времени" },
  { key: "future", label: "Будущие" },
] as const;
export type PriorityRuleKey = (typeof PRIORITY_RULES)[number]["key"];

export interface TaskPanelSettings {
  enabled: boolean;
  enabledEmployees: EmployeeId[];
  considerFutureTasks: boolean;
  includeRelatedDeals: boolean;
  priorities: { key: PriorityRuleKey; enabled: boolean }[];
}

export function defaultTaskPanel(): TaskPanelSettings {
  return {
    enabled: false,
    enabledEmployees: [],
    considerFutureTasks: false,
    includeRelatedDeals: true,
    priorities: PRIORITY_RULES.map((r) => ({ key: r.key, enabled: true })),
  };
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validateCore(core: PanelCore): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const name = core.name.trim();
  if (!name) issues.push({ field: "name", message: "Введите название панели" });
  if (name.length > 120) issues.push({ field: "name", message: "Не длиннее 120 символов" });
  if (!core.employeeIds.length) issues.push({ field: "employeeIds", message: "Выберите хотя бы одного сотрудника" });
  if (core.employeeIds.length > 100) issues.push({ field: "employeeIds", message: "Не больше 100 сотрудников" });
  const re = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  if (!re.test(core.displayWindow.from) || !re.test(core.displayWindow.to)) {
    issues.push({ field: "displayWindow", message: "Время в формате ЧЧ:ММ" });
  } else if (core.displayWindow.from >= core.displayWindow.to) {
    issues.push({ field: "displayWindow", message: "Начало должно быть раньше конца" });
  }
  return issues;
}

export function validateExtensions(ext: PanelExtensions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const op of ext.operators) {
    if (!(op.plan > 0)) issues.push({ field: `operators.${op.employeeId}.plan`, message: "План должен быть больше 0" });
    if (!(op.dialingSeconds < op.conversationSeconds && op.conversationSeconds < op.exceedingSeconds)) {
      issues.push({ field: `operators.${op.employeeId}.thresholds`, message: "Пороги: дозвон < разговор < превышение" });
    }
  }
  const t = ext.telegram;
  if (t.enabled && (!t.tokenSet || !t.chatId)) issues.push({ field: "telegram", message: "Для уведомлений нужны бот и чат" });
  if (!(t.inactivityMinutes >= 1)) issues.push({ field: "telegram.inactivityMinutes", message: "Не меньше 1 минуты" });
  if (!(t.intervalMinutes >= 1)) issues.push({ field: "telegram.intervalMinutes", message: "Не меньше 1 минуты" });
  return issues;
}
