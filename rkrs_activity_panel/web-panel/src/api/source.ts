// Контракт слоя данных панели. Экраны зависят только от этого интерфейса;
// реализации: amocrm-pro viewer API, синтетика режима разработки и их
// комбинация (hybrid). Отсутствующий контракт — явное значение, а не пустой ответ.

import type { EmployeePeriodDays, PeriodKind, PeriodStats } from "../domain/period";
import type { CallFacts, DayEvents, EmployeeId, EmployeeSessions, PanelContext, ProblemLists } from "../domain/types";

export type DataMode = "live" | "hybrid" | "fixtures";

export type ContractId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";

export const CONTRACTS: Record<ContractId, string> = {
  C1: "Факты звонков (длительность, номер) в событиях viewer API",
  C2: "Базовый адрес amoCRM для ссылок",
  C3: "Текущий срез проблемных списков (сделки без задач, с просроченными задачами, просроченные задачи)",
  C4: "Чтение сессий виджета (задачи, активности, Imbox, паузы)",
  C5: "Расширенные настройки панели (воронки, операторы, пороги, Telegram)",
  C6: "Глобальные настройки панели задач",
  C7: "Браузерная авторизация администратора для управления панелями",
  C8: "Горизонт истории один месяц и покрытие по дням",
};

export type Sourced<T> =
  | { kind: "ok"; data: T }
  | { kind: "unavailable"; contract: ContractId; reason: string };

export interface EventCardDetail {
  label: string;
  before: string | null;
  after: string | null;
  text: string | null;
}

export interface EventCard {
  id: string;
  title: string | null;
  summary: string | null;
  authorLabel: string | null;
  entityLabel: string | null;
  details: EventCardDetail[];
  call: CallFacts | null;
  source: "amocrm-pro" | "fixture";
}

export interface DayRange {
  dayKey: string;
  from: number;
  to: number;
}

/** Inputs to the Activity-owned legacy-compatible percentage calculation. */
export interface ActivityRatingParams extends DayRange {
  surface: "dashboard" | "profile";
  startMinutes: number;
  endMinutes: number;
  cutoffUnix: number | null;
  employeeIds?: EmployeeId[];
}

export interface ActivityEmployeeRating {
  employeeId: EmployeeId;
  percent: number;
  /** Profile-only ready-made percentages indexed by local minute 0..1440. */
  minutePercentages?: number[];
}

export interface ActivityRatings {
  formulaVersion: "dashboard-v1" | "profile-v1";
  dayKey: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  cutoffUnix: number | null;
  snapshotAt: number;
  partial: boolean;
  byEmployee: Map<EmployeeId, ActivityEmployeeRating>;
}

/** Запрос недели/месяца (контракт period-v1 §5.1). */
export interface PeriodStatsParams {
  kind: PeriodKind;
  /** Любой день периода, YYYY-MM-DD. */
  anchor: string;
  startMinutes: number;
  endMinutes: number;
  /** null — сервер берёт своё время и возвращает его. */
  cutoffUnix: number | null;
  /** По умолчанию — все сотрудники панели. */
  employeeIds?: EmployeeId[];
}

/** Ленты дней сотрудника (§5.2), не больше 31 дня. */
export interface PeriodDaysParams {
  fromDay: string;
  toDay: string;
  startMinutes: number;
  endMinutes: number;
  cutoffUnix: number | null;
}

export interface ActivitySource {
  readonly mode: DataMode;
  loadActivityRatings(params: ActivityRatingParams, signal?: AbortSignal): Promise<ActivityRatings>;
  loadPanel(signal?: AbortSignal): Promise<PanelContext>;
  /** События всех сотрудников панели за окно [from, to]. */
  loadDayEvents(range: DayRange, signal?: AbortSignal): Promise<DayEvents>;
  /** События одного сотрудника (профиль). */
  loadEmployeeEvents(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<DayEvents>;
  loadEventCard(eventId: string, signal?: AbortSignal): Promise<EventCard>;
  loadProblemLists(params: { managers: EmployeeId[]; pipelines: string[] }, signal?: AbortSignal): Promise<Sourced<ProblemLists>>;
  loadSessions(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<Sourced<EmployeeSessions>>;
  /** Статистика недели/месяца по сотрудникам (period-v1 §5.1). */
  loadPeriodStats(params: PeriodStatsParams, signal?: AbortSignal): Promise<PeriodStats>;
  /** 2-минутные ленты дней сотрудника для «Сравнения рабочих дней» (period-v1 §5.2). */
  loadEmployeePeriodDays(employeeId: EmployeeId, params: PeriodDaysParams, signal?: AbortSignal): Promise<EmployeePeriodDays>;
}
