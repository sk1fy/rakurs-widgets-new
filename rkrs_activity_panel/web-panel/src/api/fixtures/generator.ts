// Синтетические данные режима разработки. Ничего не взято из реальных
// аккаунтов: имена, номера, сделки и ссылки сгенерированы; домен ссылок
// .invalid. Генерация детерминирована по (день, сотрудник), чтобы
// перезагрузка давала те же числа.

import { leadsTaskFilterLink } from "../../domain/crmLinks";
import { parseHHMM, unixAt, zoned } from "../../domain/time";
import type { CrmEvent, DataMeta, Employee, EmployeeId, OperatorSettings, PanelContext, ProblemLists, WorkSession } from "../../domain/types";

export const FIXTURE_TZ = "Europe/Moscow";
export const FIXTURE_CRM_BASE = "https://demo-account.amocrm.invalid";

export const FIXTURE_EMPLOYEES: Employee[] = [
  { id: 9001, name: "Алина Демидова", groupId: "1", groupName: "Отдел продаж" },
  { id: 9002, name: "Борис Тестов", groupId: "1", groupName: "Отдел продаж" },
  { id: 9003, name: "Вера Образцова", groupId: "1", groupName: "Отдел продаж" },
  { id: 9004, name: "Глеб Примеров", groupId: "1", groupName: "Отдел продаж" },
  { id: 9005, name: "Дарья Макетова", groupId: "2", groupName: "Сервис" },
  { id: 9006, name: "Егор Шаблонов", groupId: "2", groupName: "Сервис" },
  { id: 9007, name: "Жанна Пробная", groupId: "3", groupName: "Операторы" },
  { id: 9008, name: "Захар Условный", groupId: "3", groupName: "Операторы" },
  { id: 9009, name: "Ирина Синтетова", groupId: "3", groupName: "Операторы" },
];

export const FIXTURE_OPERATORS: OperatorSettings[] = [9007, 9008, 9009].map((employeeId, i) => ({
  employeeId,
  enabled: true,
  plan: [100, 80, 120][i] as number,
  dialingSeconds: 10,
  conversationSeconds: 30,
  exceedingSeconds: 180,
}));

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)] as T;
}

function weighted<T extends string>(r: () => number, table: readonly (readonly [T, number])[]): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [value, w] of table) {
    x -= w;
    if (x <= 0) return value;
  }
  return table[table.length - 1]?.[0] as T;
}

const SALES_MIX = [
  ["outgoing_call", 22], ["incoming_call", 8], ["lead_status_changed", 10], ["outgoing_chat_message", 10],
  ["incoming_chat_message", 6], ["entity_direct_message", 3], ["task_completed", 8], ["task_result_added", 6],
  ["task_added", 6], ["common_note_added", 6], ["custom_field_value_changed", 6], ["sale_field_changed", 3],
  ["outgoing_mail", 3], ["incoming_mail", 2], ["entity_tag_added", 2], ["task_deadline_changed", 2],
] as const;
const OPERATOR_MIX = [["outgoing_call", 70], ["incoming_call", 6], ["common_note_added", 8], ["lead_status_changed", 6], ["task_completed", 5], ["task_result_added", 5]] as const;

const PIPELINES = [
  { id: 501, name: "Продажи", stages: [{ id: 7001, name: "Первичный контакт", color: "#99ccff" }, { id: 7002, name: "Переговоры", color: "#ffcc66" }, { id: 7003, name: "Счёт выставлен", color: "#ccff66" }] },
  { id: 502, name: "Сервис", stages: [{ id: 7101, name: "Новая заявка", color: "#ff99cc" }, { id: 7102, name: "В работе", color: "#66ccff" }] },
];
const TASK_TYPES = [{ id: 1, name: "Связаться" }, { id: 2, name: "Встреча" }, { id: 3, name: "Отправить КП" }];

export function fixturePhone(seed: number): string {
  return `7900${String(seed % 10_000_000).padStart(7, "0")}`;
}

export interface FixtureDay {
  events: CrmEvent[];
  sessions: WorkSession[];
}

function activityLevel(employeeId: EmployeeId): number {
  return 0.25 + ((employeeId * 37) % 60) / 100;
}

/**
 * События и сессии сотрудника за день. Для сегодняшнего дня всё, что
 * позже nowUnix, отбрасывается.
 */
export function generateDay(employeeId: EmployeeId, dayKey: string, nowUnix: number, window = { from: "09:00", to: "18:00" }): FixtureDay {
  const r = rng(hashString(`${dayKey}:${employeeId}`));
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const start = (parseHHMM(window.from) ?? 540) + Math.floor(r() * 25) - 10;
  const end = (parseHHMM(window.to) ?? 1080) - Math.floor(r() * 20);
  const level = weekday === 0 || weekday === 6 ? activityLevel(employeeId) * 0.15 : activityLevel(employeeId);
  const isOperator = employeeId >= 9007 && employeeId <= 9009;
  const mix = isOperator ? OPERATOR_MIX : SALES_MIX;
  const events: CrmEvent[] = [];
  const leads = Array.from({ length: 12 }, (_, i) => 300000 + (employeeId % 100) * 100 + i);
  let seq = 0;
  const lunch = 13 * 60 + Math.floor(r() * 40);
  for (let minute = start; minute < end; minute++) {
    if (minute >= lunch && minute < lunch + 45) continue;
    // Окна простоя: эпизодически «выпадает» до 25 минут.
    if (r() < 0.006) {
      minute += 10 + Math.floor(r() * 15);
      continue;
    }
    if (r() > level) continue;
    const burst = 1 + (r() < 0.2 ? 1 : 0);
    for (let b = 0; b < burst; b++) {
      const type = weighted(r, mix);
      const second = Math.floor(r() * 60);
      const createdAt = unixAt(dayKey, minute, FIXTURE_TZ) + second;
      if (createdAt > nowUnix) continue;
      const lead = pick(r, leads);
      const pipeline = pick(r, PIPELINES);
      const stage = pick(r, pipeline.stages);
      const isCall = type === "incoming_call" || type === "outgoing_call";
      const phoneSeed = Math.floor(r() * (isOperator ? 400 : 40)) + employeeId * 7;
      let duration: number | null = null;
      if (isCall) {
        const roll = r();
        duration = roll < 0.25 ? 0 : roll < 0.45 ? 5 + Math.floor(r() * 20) : roll < 0.9 ? 30 + Math.floor(r() * 150) : 180 + Math.floor(r() * 600);
        if (r() < 0.03) duration = null; // F9: длительность не пришла
      }
      const isTask = type.startsWith("task_");
      const taskId = isTask ? 800000 + (lead % 1000) * 10 + Math.floor(r() * 3) : null;
      events.push({
        id: `fx-${dayKey}-${employeeId}-${seq++}`,
        type,
        createdAt,
        createdBy: employeeId,
        entityId: isTask ? (taskId as number) : lead,
        entityType: isTask ? "task" : "leads",
        call: isCall ? { durationSeconds: duration, phone: fixturePhone(phoneSeed), entityType: "contacts", entityId: 400000 + phoneSeed, result: null, link: null } : null,
        pipelineIds: type === "lead_status_changed" ? [String(pipeline.id)] : [],
        taskId,
        taskTypeId: isTask ? pick(r, TASK_TYPES).id : null,
        statusId: type === "lead_status_changed" ? stage.id : null,
        related: isTask ? { entityType: "leads", entityId: lead } : { entityType: "leads", entityId: lead },
      });
    }
  }
  events.sort((a, b) => a.createdAt - b.createdAt);

  const sessions = generateSessions(dayKey, nowUnix, start, end, r, leads, events);
  return { events, sessions };
}

function iso(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

function generateSessions(dayKey: string, nowUnix: number, start: number, end: number, r: () => number, leads: number[], events: CrmEvent[]): WorkSession[] {
  const sessions: WorkSession[] = [];
  const completed = events.filter((e) => e.type === "task_completed");
  let cursor = unixAt(dayKey, start + 2, FIXTURE_TZ);
  const stop = Math.min(unixAt(dayKey, end, FIXTURE_TZ), nowUnix);
  let i = 0;
  while (cursor < stop - 60) {
    const roll = r();
    const lead = pick(r, leads);
    const pipeline = pick(r, PIPELINES);
    const stage = pick(r, pipeline.stages);
    const length = roll < 0.12 ? 300 + Math.floor(r() * 900) : 120 + Math.floor(r() * 1200);
    const startedAt = cursor;
    const stoppedAt = Math.min(startedAt + length, stop);
    const open = stoppedAt >= nowUnix - 30 && stop === nowUnix;
    const base = {
      startedAt: iso(startedAt),
      stoppedAt: open ? null : iso(stoppedAt),
      workTimeSeconds: stoppedAt - startedAt,
      entityId: lead,
      entityType: "leads",
      entityName: `Демо-сделка №${lead % 1000}`,
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      statusId: stage.id,
      statusName: stage.name,
      statusColor: stage.color,
    } satisfies Partial<WorkSession>;
    if (roll < 0.12) {
      sessions.push({ ...base, kind: "pause", entityId: null, entityType: null, entityName: null, pauseTimeSeconds: stoppedAt - startedAt, workTimeSeconds: 0 });
    } else if (roll < 0.35) {
      sessions.push({ ...base, kind: "activity", activityType: "imbox", activityName: `Диалог ${(lead % 97) + 1}` });
    } else if (roll < 0.45) {
      sessions.push({ ...base, kind: "activity", activityType: "other", activityName: "Работа в карточке" });
    } else {
      const task = completed[i % Math.max(1, completed.length)];
      const taskType = pick(r, TASK_TYPES);
      // Часть завершённых задач остаётся без сессии — для условного fallback 10 с.
      const taskId = task && r() < 0.7 ? task.taskId : 900000 + i;
      sessions.push({
        ...base,
        kind: "work",
        taskId,
        taskName: `${taskType.name} по сделке №${lead % 1000}`,
        taskUrl: `${FIXTURE_CRM_BASE}/leads/detail/${lead}`,
        taskTypeId: taskType.id,
        taskTypeName: taskType.name,
        taskResult: r() < 0.6 ? "Клиент подтвердил интерес" : null,
      });
    }
    i += 1;
    cursor = stoppedAt + 30 + Math.floor(r() * 240);
    if (open) break;
  }
  return sessions;
}

export function fixtureMeta(nowUnix: number, overrides: Partial<DataMeta> = {}): DataMeta {
  return { source: "fixture", snapshotAt: nowUnix, coverage: "verified", partial: false, stale: false, ...overrides };
}

export function fixturePanel(nowUnix: number): PanelContext {
  return {
    name: "Демо-панель (синтетика)",
    timezone: FIXTURE_TZ,
    displayWindow: { from: "09:00", to: "18:00" },
    employees: FIXTURE_EMPLOYEES,
    groups: [...new Map(FIXTURE_EMPLOYEES.map((e) => [e.groupId, { id: e.groupId, name: e.groupName }])).values()],
    crmBaseUrl: FIXTURE_CRM_BASE,
    pipelines: [],
    operators: FIXTURE_OPERATORS,
    taskPanelEnabled: true,
    meta: fixtureMeta(nowUnix),
  };
}

export function fixtureProblemLists(managers: EmployeeId[], nowUnix: number, base: string | null): ProblemLists {
  const hour = zoned(nowUnix, FIXTURE_TZ).hour;
  const row = (kind: string, id: EmployeeId) => {
    const r = rng(hashString(`${kind}:${id}:${hour}`));
    return Math.floor(r() * (kind === "overdue" ? 9 : 6));
  };
  return {
    leadsNoTasks: managers.map((id) => ({ managerId: id, count: row("none", id), filterLink: leadsTaskFilterLink(base, "no_tasks", [id]) })),
    leadsWithFailedTasks: managers.map((id) => ({ managerId: id, count: row("failed", id), filterLink: leadsTaskFilterLink(base, "failed_tasks", [id]) })),
    overdueTasks: managers.map((id) => ({ managerId: id, count: row("overdue", id), filterLink: base ? `${base}/todo/line/?filter[main_user][]=${id}&filter[date_preset]=overdue` : null })),
    meta: fixtureMeta(nowUnix),
  };
}
