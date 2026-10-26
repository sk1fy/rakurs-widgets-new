// Справочник типов событий. Подписи, коды фильтров amoCRM и классификация
// перенесены из EmployeeActivitiesSectionV3.vue; whitelist — из utils/activityTimeline.js.

import type { CrmEvent } from "./types";

export const EVENT_LABELS: Record<string, string> = {
  lead_added: "Новая сделка",
  lead_deleted: "Сделка удалена",
  lead_restored: "Сделка восстановлена",
  lead_status_changed: "Изменение этапа продажи",
  lead_linked: "Прикрепление сделки",
  lead_unlinked: "Открепление сделки",
  contact_added: "Новый контакт",
  contact_deleted: "Контакт удален",
  contact_restored: "Контакт восстановлен",
  contact_linked: "Прикрепление контакта",
  contact_unlinked: "Открепление контакта",
  company_added: "Новая компания",
  company_deleted: "Компания удалена",
  company_restored: "Компания восстановлена",
  company_linked: "Прикрепление компании",
  company_unlinked: "Открепление компании",
  customer_added: "Новый покупатель",
  customer_deleted: "Покупатель удален",
  customer_status_changed: "Изменение этапа покупателя",
  customer_linked: "Прикрепление покупателя",
  customer_unlinked: "Открепление покупателя",
  task_added: "Новая задача",
  task_deleted: "Задача удалена",
  task_completed: "Завершение задачи",
  task_result_added: "Результат по задаче",
  task_type_changed: "Изменение типа задачи",
  task_text_changed: "Изменение текста задачи",
  task_deadline_changed: "Изменение даты исполнения задачи",
  incoming_call: "Входящий звонок",
  outgoing_call: "Исходящий звонок",
  incoming_mail: "Входящее письмо",
  outgoing_mail: "Исходящее письмо",
  incoming_chat_message: "Входящее сообщение",
  outgoing_chat_message: "Исходящее сообщение",
  entity_direct_message: "Сообщение внутреннего чата",
  incoming_sms: "Входящее SMS",
  outgoing_sms: "Исходящее SMS",
  entity_tag_added: "Теги добавлены",
  entity_tag_deleted: "Теги убраны",
  entity_linked: "Прикрепление",
  entity_unlinked: "Открепление",
  sale_field_changed: "Изменение поля «Бюджет»",
  name_field_changed: "Изменение поля «Название»",
  ltv_field_changed: "Сумма покупок",
  custom_field_value_changed: "Изменение поля",
  entity_responsible_changed: "Ответственный изменен",
  robot_replied: "Ответ робота",
  intent_identified: "Тема вопроса определена",
  nps_rate_added: "Новая оценка NPS",
  link_followed: "Переход по ссылке",
  transaction_added: "Добавлена покупка",
  common_note_added: "Новое примечание",
  common_note_deleted: "Примечание удалено",
  attachment_note_added: "Добавлен новый файл",
  targeting_in_note_added: "Добавление в ретаргетинг",
  targeting_out_note_added: "Удаление из ретаргетинга",
  geo_note_added: "Новое примечание с гео-меткой",
  service_note_added: "Новое системное примечание",
  site_visit_note_added: "Заход на сайт",
  message_to_cashier_note_added: "LifePay: Сообщение кассиру",
  key_action_completed: "Ключевое действие",
  entity_merged: "Выполнено объединение",
};

/** Коды filter[event_type] списка событий amoCRM. */
export const AMO_EVENT_TYPE_IDS: Record<string, number> = {
  lead_added: 1, lead_deleted: 7, lead_restored: 10, lead_status_changed: 14,
  lead_linked: 80, lead_unlinked: 84, contact_added: 2, contact_deleted: 8,
  contact_restored: 11, contact_linked: 81, contact_unlinked: 85, company_added: 3,
  company_deleted: 9, company_restored: 12, company_linked: 82, company_unlinked: 86,
  customer_added: 20, customer_deleted: 53, customer_status_changed: 57,
  customer_linked: 83, customer_unlinked: 87, task_added: 49, task_deleted: 51,
  task_completed: 29, task_type_changed: 76, task_text_changed: 77,
  task_deadline_changed: 78, task_result_added: 33, incoming_call: 17,
  outgoing_call: 30, incoming_mail: 16, outgoing_mail: 152,
  incoming_chat_message: 89, outgoing_chat_message: 90, entity_direct_message: 150,
  incoming_sms: 41, outgoing_sms: 42, entity_tag_added: 63, entity_tag_deleted: 64,
  entity_linked: 72, entity_unlinked: 73, sale_field_changed: 69,
  name_field_changed: 70, ltv_field_changed: 88, custom_field_value_changed: 24,
  entity_responsible_changed: 25, robot_replied: 74, intent_identified: 75,
  nps_rate_added: 91, link_followed: 59, transaction_added: 26,
  common_note_added: 27, common_note_deleted: 79, attachment_note_added: 28,
  targeting_in_note_added: 31, targeting_out_note_added: 32, geo_note_added: 38,
  service_note_added: 39, site_visit_note_added: 18, message_to_cashier_note_added: 60,
  key_action_completed: 116, entity_merged: 92,
};

const LABEL_KEYS = Object.keys(EVENT_LABELS);

/**
 * Тип события по правилу старого UI: точное совпадение либо вхождение ключа
 * (custom_field_{id}_value_changed → custom_field_value_changed).
 */
export function matchEventType(type: string): string | null {
  if (EVENT_LABELS[type]) return type;
  if (type.includes("custom_field")) return "custom_field_value_changed";
  return LABEL_KEYS.find((key) => type.includes(key)) ?? null;
}

export function eventLabel(type: string): string {
  const key = matchEventType(type);
  return key ? (EVENT_LABELS[key] ?? type) : type || "Событие";
}

/** Цвет точки типа события в окне отрезка (палитра TimelineActivityGroup.vue). */
const EVENT_COLORS: Record<string, string> = {
  incoming_call: "#006ed4", outgoing_call: "#096dd9",
  task_added: "#52c41a", task_completed: "#73d13d", task_deleted: "#ff4d4f", task_result_added: "#389e0d",
  incoming_chat_message: "#13c2c2", outgoing_chat_message: "#08979c", entity_direct_message: "#006d75",
  lead_added: "#faad14", lead_status_changed: "#d48806", lead_linked: "#ad8b00",
  contact_added: "#722ed1", contact_linked: "#531dab", company_added: "#eb2f96", company_linked: "#c41d7f",
  common_note_added: "#d4b106", attachment_note_added: "#ad8b00",
  incoming_sms: "#389e0d", outgoing_sms: "#5b8c00",
  entity_tag_added: "#d46b08", custom_field_value_changed: "#874d00",
};

export function eventColor(type: string): string {
  return EVENT_COLORS[type] ?? EVENT_COLORS[matchEventType(type) ?? ""] ?? "#d9d9d9";
}

/** isActivityTimelineEvent: whitelist профиля и анализа событий. */
export function isProfileActivityEvent(event: Pick<CrmEvent, "type">): boolean {
  return matchEventType(event.type) !== null;
}

export function isCall(event: Pick<CrmEvent, "type">): boolean {
  return event.type === "incoming_call" || event.type === "outgoing_call";
}

/** Строка dashboard считает звонком любой тип, содержащий "call" (DashboardView). */
export function isDashboardCall(event: Pick<CrmEvent, "type">): boolean {
  return event.type.includes("call");
}

export type EventCategory = "negative" | "neutral" | "positive" | "context";

const NEGATIVE = new Set([
  "lead_deleted", "contact_deleted", "company_deleted", "customer_deleted", "task_deleted",
  "task_type_changed", "task_deadline_changed", "lead_unlinked", "contact_unlinked",
  "company_unlinked", "customer_unlinked", "entity_unlinked", "common_note_deleted",
  "targeting_out_note_added",
]);
const POSITIVE = new Set([
  "lead_added", "lead_status_changed", "contact_added", "company_added", "customer_added",
  "customer_status_changed", "task_completed", "outgoing_call", "outgoing_mail",
  "outgoing_chat_message", "outgoing_sms",
]);
const CONTEXT = new Set([
  "lead_restored", "lead_linked", "contact_restored", "contact_linked", "company_restored",
  "company_linked", "customer_linked", "entity_responsible_changed", "robot_replied",
  "nps_rate_added", "transaction_added", "entity_merged", "incoming_call", "incoming_mail",
  "incoming_chat_message", "incoming_sms", "site_visit_note_added",
]);

export function eventCategory(type: string): EventCategory {
  const key = matchEventType(type);
  if (key && NEGATIVE.has(key)) return "negative";
  if (key && POSITIVE.has(key)) return "positive";
  if (key && CONTEXT.has(key)) return "context";
  return "neutral";
}

export const CATEGORY_META: Record<EventCategory, { label: string; title: string; description: string; color: string }> = {
  negative: {
    label: "Негатив",
    title: "Негативные события — требуют внимания",
    description: "Потери, удаления, отказы, пропущенные обращения",
    color: "#f04438",
  },
  neutral: {
    label: "Нейтрально",
    title: "Нейтральные события — информационный фон",
    description: "Фиксация активности и изменений без явной оценки",
    color: "#78a9f5",
  },
  positive: {
    label: "Позитив",
    title: "Позитивные события — результат",
    description: "Завершённые действия, движение вперёд, покупки и успешные реакции",
    color: "#78d84f",
  },
  context: {
    label: "Контекст",
    title: "Контекстные события — дополнительный контекст",
    description: "Некоторые события зависят от контекста и требуют дополнительной оценки",
    color: "#ffd43b",
  },
};

export const TASK_EVENT_TYPES = [
  "task_added", "task_text_changed", "task_type_changed", "task_deleted",
  "task_deadline_changed", "task_completed", "task_result_added",
] as const;

export const TASK_EVENT_LABELS: Record<string, string> = {
  task_added: "Новые",
  task_completed: "Завершённые",
  task_result_added: "Завершённые с результатом",
  task_text_changed: "Изменение текста задачи",
  task_type_changed: "Изменение типа задачи",
  task_deleted: "Удалённые",
  task_deadline_changed: "Перенос срока",
};

/** KPI строки dashboard (EmployeeTimelineStatistics.vue). */
export const KPI_PREDICATES = {
  outgoingCalls: (e: Pick<CrmEvent, "type">) => e.type === "outgoing_call",
  messages: (e: Pick<CrmEvent, "type">) =>
    e.type === "entity_direct_message" || e.type.includes("chat_message") || e.type.includes("sms"),
  outgoingMail: (e: Pick<CrmEvent, "type">) => e.type === "outgoing_mail",
  completedTasks: (e: Pick<CrmEvent, "type">) => e.type === "task_completed",
  leadStatusChanges: (e: Pick<CrmEvent, "type">) => e.type === "lead_status_changed",
} as const;

export type CountKpi = keyof typeof KPI_PREDICATES;
