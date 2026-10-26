// Контракт слоя данных панели. Экраны зависят только от этого интерфейса;
// реализации: amocrm-pro viewer API, синтетика режима разработки и их
// комбинация (hybrid). Отсутствующий контракт — явное значение, а не пустой ответ.

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

export interface ActivitySource {
  readonly mode: DataMode;
  loadPanel(signal?: AbortSignal): Promise<PanelContext>;
  /** События всех сотрудников панели за окно [from, to]. */
  loadDayEvents(range: DayRange, signal?: AbortSignal): Promise<DayEvents>;
  /** События одного сотрудника (профиль). */
  loadEmployeeEvents(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<DayEvents>;
  loadEventCard(eventId: string, signal?: AbortSignal): Promise<EventCard>;
  loadProblemLists(params: { managers: EmployeeId[]; pipelines: string[] }, signal?: AbortSignal): Promise<Sourced<ProblemLists>>;
  loadSessions(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<Sourced<EmployeeSessions>>;
}
