// Модели интерфейса. Не зеркалят ни старый getTable, ни DTO amocrm-pro:
// адаптеры в src/api переводят ответы источников в эти типы.

export type EmployeeId = number;

export interface Employee {
  id: EmployeeId;
  name: string;
  groupId: string;
  groupName: string;
  avatarUrl?: string;
}

export interface Group {
  id: string;
  name: string;
}

/** Факты звонка. Отсутствие длительности — «неизвестно», а не 0 секунд. */
export interface CallFacts {
  durationSeconds: number | null;
  phone: string | null;
  entityType: string | null;
  entityId: number | null;
  result: string | null;
  link: string | null;
}

export interface PipelineRef {
  pipelineId: string;
}

export interface CrmEvent {
  id: string;
  type: string;
  /** Unix seconds. */
  createdAt: number;
  createdBy: EmployeeId;
  entityId: number;
  entityType: string;
  call: CallFacts | null;
  /** Воронки, найденные в payload события (правило pipelineFilter старой панели). */
  pipelineIds: string[];
  /** Для расчёта уникальных задач и fallback суммарного времени. */
  taskId: number | null;
  taskTypeId: number | null;
  statusId: number | null;
  /** Связанная сущность события задачи (сделка/контакт), если есть в payload. */
  related: { entityType: string; entityId: number } | null;
}

/** Сессии устанавливаемого виджета: work / activity (в т.ч. imbox) / pause. */
export type SessionKind = "work" | "activity" | "pause";

export interface WorkSession {
  kind: SessionKind;
  /** ISO 8601 с offset. */
  startedAt: string;
  stoppedAt: string | null;
  workTimeSeconds: number;
  pauseTimeSeconds?: number;
  taskId?: number | null;
  taskName?: string | null;
  taskUrl?: string | null;
  taskTypeId?: number | null;
  taskTypeName?: string | null;
  taskResult?: string | null;
  activityName?: string | null;
  activityType?: string | null;
  entityId?: number | null;
  entityType?: string | null;
  entityName?: string | null;
  pipelineId?: number | null;
  pipelineName?: string | null;
  statusId?: number | null;
  statusName?: string | null;
  statusColor?: string | null;
  groupName?: string | null;
}

export interface DisplayWindow {
  /** HH:MM */
  from: string;
  to: string;
}

/** Состояние покрытия истории, приходит от источника, не вычисляется UI. */
export type Coverage = "verified" | "partial" | "unknown";

export interface DataMeta {
  /** Источник ответа: живой amocrm-pro или синтетика режима разработки. */
  source: "amocrm-pro" | "fixture";
  /** Момент среза данных (Unix seconds). */
  snapshotAt: number;
  coverage: Coverage;
  /** Данные неполны: превышен лимит страниц, часть ответа недоступна и т.п. */
  partial: boolean;
  stale: boolean;
  note?: string;
}

export interface PanelContext {
  name: string;
  timezone: string;
  displayWindow: DisplayWindow;
  employees: Employee[];
  groups: Group[];
  /** Базовый адрес CRM для ссылок. В viewer API отсутствует (контракт C2). */
  crmBaseUrl: string | null;
  pipelines: string[];
  operators: OperatorSettings[];
  taskPanelEnabled: boolean | null;
  meta: DataMeta;
}

export interface OperatorSettings {
  employeeId: EmployeeId;
  enabled: boolean;
  plan: number;
  /** Пороги классификации звонка, секунды. */
  dialingSeconds: number;
  conversationSeconds: number;
  exceedingSeconds: number;
}

export interface DayEvents {
  /** События по сотрудникам в запрошенном окне. */
  byEmployee: Map<EmployeeId, CrmEvent[]>;
  from: number;
  to: number;
  meta: DataMeta;
}

/** Строка текущего CRM-среза проблемных списков по менеджеру. */
export interface ProblemCount {
  managerId: EmployeeId;
  count: number;
  filterLink: string | null;
}

export interface ProblemLists {
  leadsNoTasks: ProblemCount[];
  leadsWithFailedTasks: ProblemCount[];
  overdueTasks: ProblemCount[];
  meta: DataMeta;
}

export interface EmployeeSessions {
  employeeId: EmployeeId;
  day: string;
  items: WorkSession[];
  meta: DataMeta;
}
