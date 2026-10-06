/** Deterministic demo fixtures. Instants are epoch milliseconds. */

export const FROZEN_NOW = Date.parse("2026-10-06T11:00:00+03:00");

export const EMPLOYEES = [
  { id: "m1", name: "Марина Соколова", short: "МС" },
  { id: "m2", name: "Илья Воронов", short: "ИВ" },
  { id: "m3", name: "Ольга Черных", short: "ОЧ" },
  { id: "m4", name: "Павел Ершов", short: "ПЕ" },
];

export const PIPELINES = [
  {
    id: "sales",
    name: "Продажи",
    stages: [
      { id: "new", name: "Новая" },
      { id: "work", name: "В работе" },
      { id: "invoice", name: "Счёт" },
    ],
  },
  {
    id: "care",
    name: "Сопровождение",
    stages: [
      { id: "inbox", name: "Входящие" },
      { id: "diag", name: "Диагностика" },
      { id: "renew", name: "Продление" },
    ],
  },
];

export const DEFAULT_SETTINGS = {
  targetMinutes: 30,
  workStart: "09:00",
  workEnd: "18:00",
  weekdays: [1, 2, 3, 4, 5],
  timezone: "Europe/Moscow",
  pipelineIds: ["sales", "care"],
  reassignmentPolicy: "reset",
  noteCounts: true,
  hideOffHoursHighlight: false,
  holidays: ["2026-10-07"],
  preAlertPercent: 75,
  criticalMultiplier: 2,
  budgetThreshold: 500000,
  digestHour: 18,
  eodHour: 19,
};

export const SCENARIOS = [
  { id: "default", label: "Базовый вторник, 11:00" },
  { id: "holiday", label: "Четверг после праздника" },
  { id: "prealert", label: "Порог пре-алерта (+5 мин)" },
  { id: "empty-period", label: "Пустой период" },
  { id: "empty", label: "Пустые данные" },
  { id: "loading", label: "Загрузка" },
  { id: "error", label: "Ошибка данных" },
];

export const SUBSCRIBERS = [
  { id: "s1", name: "Марина Соколова", channel: "личный чат", status: "Макет, сообщения не уходят" },
  { id: "s2", name: "Илья Воронов", channel: "личный чат", status: "Макет, сообщения не уходят" },
  { id: "s3", name: "Группа «Отдел продаж»", channel: "групповой чат", status: "Макет, бот не создан" },
];

export const BOT_MOCK = {
  title: "Бот не создан",
  status: "Локальный макет: подключение не выполнялось",
};

export const LINK_MOCK = {
  label: "Подписанная ссылка",
  value: "https://demo.local/sla/mock-signature",
  status: "Макет, ключ подписи не выпускался",
};

const at = (iso) => Date.parse(iso);

function event(id, type, actorId, when, extra = {}) {
  return {
    id,
    type,
    direction: extra.direction || "out",
    durationSec: extra.durationSec ?? 0,
    actorId,
    actorKind: extra.actorKind || "user",
    at: when,
  };
}

function deal(spec) {
  const createdAt = spec.createdAt;
  return {
    id: spec.id,
    title: spec.title,
    pipelineId: spec.pipelineId,
    stageId: spec.stageId,
    budget: spec.budget,
    createdAt,
    assignments: spec.assignments || [{ managerId: spec.managerId, at: createdAt }],
    events: spec.events || [],
    preAlertSent: false,
    preAlertSkipped: false,
    preAlertAt: null,
    criticalTask: null,
  };
}

const DEALS = [
  deal({
    id: "d-sep-01",
    title: "Северный контур — датчики",
    pipelineId: "sales",
    stageId: "invoice",
    managerId: "m1",
    budget: 120000,
    createdAt: at("2026-09-03T10:00:00+03:00"),
    events: [event("sep01-call", "call", "m1", at("2026-09-03T10:12:00+03:00"), { durationSec: 80 })],
  }),
  deal({
    id: "d-sep-02",
    title: "Лампа и К — освещение склада",
    pipelineId: "sales",
    stageId: "work",
    managerId: "m2",
    budget: 260000,
    createdAt: at("2026-09-08T11:10:00+03:00"),
    events: [event("sep02-mail", "email", "m2", at("2026-09-08T11:55:00+03:00"))],
  }),
  deal({
    id: "d-sep-03",
    title: "Речной сервис — осмотр причала",
    pipelineId: "care",
    stageId: "renew",
    managerId: "m3",
    budget: 90000,
    createdAt: at("2026-09-10T15:00:00+03:00"),
    events: [event("sep03-chat", "message", "m3", at("2026-09-10T15:16:00+03:00"))],
  }),
  deal({
    id: "d-sep-04",
    title: "Булочная на Лесной — касса",
    pipelineId: "sales",
    stageId: "invoice",
    managerId: "m4",
    budget: 70000,
    createdAt: at("2026-09-15T09:20:00+03:00"),
    events: [event("sep04-note", "note", "m4", at("2026-09-15T09:29:00+03:00"))],
  }),
  deal({
    id: "d-sep-05",
    title: "Ателье Лист — форма для смены",
    pipelineId: "care",
    stageId: "diag",
    managerId: "m1",
    budget: 54000,
    createdAt: at("2026-09-17T16:10:00+03:00"),
    events: [event("sep05-call", "call", "m1", at("2026-09-17T16:30:00+03:00"), { durationSec: 140 })],
  }),
  deal({
    id: "d-sep-06",
    title: "Типография Знак — осенний тираж",
    pipelineId: "sales",
    stageId: "work",
    managerId: "m2",
    budget: 340000,
    createdAt: at("2026-09-22T09:00:00+03:00"),
    events: [event("sep06-mail", "email", "m2", at("2026-09-22T12:40:00+03:00"))],
  }),
  deal({
    id: "d-sep-07",
    title: "Кафе Берёзка — поставка сиропов",
    pipelineId: "sales",
    stageId: "invoice",
    managerId: "m3",
    budget: 48000,
    createdAt: at("2026-09-24T13:30:00+03:00"),
    events: [event("sep07-call", "call", "m3", at("2026-09-24T13:44:00+03:00"), { durationSec: 60 })],
  }),
  deal({
    id: "d-sep-08",
    title: "Мастерская Дуб — фурнитура",
    pipelineId: "care",
    stageId: "renew",
    managerId: "m4",
    budget: 86000,
    createdAt: at("2026-09-29T10:40:00+03:00"),
    events: [event("sep08-mail", "email", "m4", at("2026-09-29T10:58:00+03:00"))],
  }),
  deal({
    id: "d-pw-01",
    title: "Склад 12 — стеллажи",
    pipelineId: "sales",
    stageId: "work",
    managerId: "m1",
    budget: 410000,
    createdAt: at("2026-10-01T10:30:00+03:00"),
    events: [event("pw01-chat", "message", "m1", at("2026-10-01T10:52:00+03:00"))],
  }),
  deal({
    id: "d-pw-02",
    title: "Клиника Рассвет — расходники",
    pipelineId: "care",
    stageId: "diag",
    managerId: "m2",
    budget: 190000,
    createdAt: at("2026-10-01T17:20:00+03:00"),
    events: [event("pw02-call", "call", "m2", at("2026-10-02T09:25:00+03:00"), { durationSec: 200 })],
  }),
  // Friday 17:50 → Monday 09:20 = 30 working minutes, on the SLA boundary.
  deal({
    id: "d-boundary",
    title: "Северсталь-сервис — датчики ворот",
    pipelineId: "sales",
    stageId: "invoice",
    managerId: "m1",
    budget: 180000,
    createdAt: at("2026-10-02T17:50:00+03:00"),
    events: [event("boundary-call", "call", "m1", at("2026-10-05T09:20:00+03:00"), { durationSec: 95 })],
  }),
  deal({
    id: "d-pw-04",
    title: "Пекарня Мост — витрина",
    pipelineId: "care",
    stageId: "inbox",
    managerId: "m4",
    budget: 64000,
    createdAt: at("2026-10-02T11:00:00+03:00"),
    events: [event("pw04-note", "note", "m4", at("2026-10-02T11:08:00+03:00"))],
  }),
  // Saturday assignment: weekend does not count, answer Monday morning.
  deal({
    id: "d-pw-03",
    title: "Прокат Лыж — сезонная заявка",
    pipelineId: "sales",
    stageId: "new",
    managerId: "m3",
    budget: 99000,
    createdAt: at("2026-10-03T11:00:00+03:00"),
    events: [event("pw03-mail", "email", "m3", at("2026-10-05T09:40:00+03:00"))],
  }),
  // Manual note: counts only while the setting is on.
  deal({
    id: "d-note",
    title: "Офис Кедр — кресла",
    pipelineId: "care",
    stageId: "diag",
    managerId: "m3",
    budget: 150000,
    createdAt: at("2026-10-05T10:00:00+03:00"),
    events: [event("note-touch", "note", "m3", at("2026-10-05T10:12:00+03:00"))],
  }),
  deal({
    id: "d-late-slight",
    title: "Веломастерская Луч — партии",
    pipelineId: "sales",
    stageId: "work",
    managerId: "m2",
    budget: 128000,
    createdAt: at("2026-10-05T14:00:00+03:00"),
    events: [event("slight-call", "call", "m2", at("2026-10-05T14:50:00+03:00"), { durationSec: 70 })],
  }),
  deal({
    id: "d-late-severe",
    title: "Типография Знак — допечатка",
    pipelineId: "sales",
    stageId: "work",
    managerId: "m3",
    budget: 210000,
    createdAt: at("2026-10-05T11:00:00+03:00"),
    events: [event("severe-mail", "email", "m3", at("2026-10-05T15:30:00+03:00"))],
  }),
  // Created in the evening: highlight can be hidden, working time still runs next morning.
  deal({
    id: "d-evening",
    title: "Галерея Нить — свет для зала",
    pipelineId: "care",
    stageId: "inbox",
    managerId: "m4",
    budget: 76000,
    createdAt: at("2026-10-05T19:40:00+03:00"),
    events: [event("evening-mail", "email", "m4", at("2026-10-06T09:15:00+03:00"))],
  }),
  deal({
    id: "d-y-wait",
    title: "Сад на Крыше — полив",
    pipelineId: "sales",
    stageId: "new",
    managerId: "m1",
    budget: 88000,
    createdAt: at("2026-10-05T16:30:00+03:00"),
  }),
  deal({
    id: "d-y-chat",
    title: "Книжный Двор — полки",
    pipelineId: "sales",
    stageId: "invoice",
    managerId: "m2",
    budget: 43000,
    createdAt: at("2026-10-05T09:10:00+03:00"),
    events: [event("ychat", "message", "m2", at("2026-10-05T09:28:00+03:00"))],
  }),
  deal({
    id: "d-y-call",
    title: "Автомойка Искра — химия",
    pipelineId: "care",
    stageId: "renew",
    managerId: "m3",
    budget: 37000,
    createdAt: at("2026-10-05T12:00:00+03:00"),
    events: [event("ycall", "call", "m3", at("2026-10-05T12:20:00+03:00"), { durationSec: 110 })],
  }),
  deal({
    id: "d-call-fixed",
    title: "Лампа и К — повторный счёт",
    pipelineId: "sales",
    stageId: "invoice",
    managerId: "m2",
    budget: 320000,
    createdAt: at("2026-10-06T09:30:00+03:00"),
    events: [event("fixed-call", "call", "m2", at("2026-10-06T09:48:00+03:00"), { durationSec: 180 })],
  }),
  deal({
    id: "d-chat",
    title: "Булочная на Лесной — доставка",
    pipelineId: "sales",
    stageId: "work",
    managerId: "m1",
    budget: 56000,
    createdAt: at("2026-10-06T09:05:00+03:00"),
    events: [event("chat-out", "message", "m1", at("2026-10-06T09:22:00+03:00"))],
  }),
  deal({
    id: "d-email",
    title: "Мастерская Дуб — повтор",
    pipelineId: "care",
    stageId: "diag",
    managerId: "m4",
    budget: 91000,
    createdAt: at("2026-10-06T09:40:00+03:00"),
    events: [event("email-out", "email", "m4", at("2026-10-06T10:05:00+03:00"))],
  }),
  deal({
    id: "d-critical-2x",
    title: "Склад 12 — срочный довоз",
    pipelineId: "sales",
    stageId: "new",
    managerId: "m2",
    budget: 80000,
    createdAt: at("2026-10-06T09:40:00+03:00"),
  }),
  deal({
    id: "d-reassign",
    title: "Ателье Лист — вторая смена",
    pipelineId: "sales",
    stageId: "work",
    managerId: "m1",
    budget: 240000,
    createdAt: at("2026-10-06T10:30:00+03:00"),
    assignments: [
      { managerId: "m4", at: at("2026-10-06T10:30:00+03:00") },
      { managerId: "m1", at: at("2026-10-06T10:45:00+03:00") },
    ],
  }),
  deal({
    id: "d-zero-call",
    title: "Кафе Берёзка — дегустация",
    pipelineId: "sales",
    stageId: "new",
    managerId: "m4",
    budget: 70000,
    createdAt: at("2026-10-06T10:15:00+03:00"),
    events: [event("zero-call", "call", "m4", at("2026-10-06T10:20:00+03:00"), { durationSec: 0 })],
  }),
  deal({
    id: "d-inbound",
    title: "Книжный Двор — заказ гостя",
    pipelineId: "care",
    stageId: "inbox",
    managerId: "m1",
    budget: 60000,
    createdAt: at("2026-10-06T10:50:00+03:00"),
    events: [
      event("inbound-msg", "message", "client", at("2026-10-06T10:55:00+03:00"), {
        direction: "in",
      }),
    ],
  }),
  // 20 working minutes at 11:00; +5 min crosses the 22:30 pre-alert.
  deal({
    id: "d-prealert",
    title: "Клиника Рассвет — лицензионный пакет",
    pipelineId: "sales",
    stageId: "new",
    managerId: "m3",
    budget: 210000,
    createdAt: at("2026-10-06T10:40:00+03:00"),
  }),
  deal({
    id: "d-critical-budget",
    title: "Северный контур — линия цеха",
    pipelineId: "care",
    stageId: "diag",
    managerId: "m1",
    budget: 1500000,
    createdAt: at("2026-10-06T10:20:00+03:00"),
  }),
  deal({
    id: "d-budget-safe",
    title: "Речной сервис — годовой контракт",
    pipelineId: "sales",
    stageId: "work",
    managerId: "m3",
    budget: 2000000,
    createdAt: at("2026-10-06T10:50:00+03:00"),
  }),
  deal({
    id: "d-task-noise",
    title: "Прокат Лыж — бронь групп",
    pipelineId: "sales",
    stageId: "new",
    managerId: "m2",
    budget: 115000,
    createdAt: at("2026-10-06T10:35:00+03:00"),
    events: [event("task-noise", "task", "system", at("2026-10-06T10:40:00+03:00"), { actorKind: "system", direction: "out" })],
  }),
  deal({
    id: "d-bot",
    title: "Галерея Нить — открытки",
    pipelineId: "care",
    stageId: "inbox",
    managerId: "m1",
    budget: 25000,
    createdAt: at("2026-10-06T10:55:00+03:00"),
    events: [
      event("bot-msg", "message", "bot", at("2026-10-06T10:58:00+03:00"), {
        actorKind: "bot",
      }),
    ],
  }),
  // Tuesday 18:10, Wednesday holiday, Thursday 09:10 → 10 working minutes.
  deal({
    id: "d-holiday",
    title: "Пекарня Мост — ночная заявка",
    pipelineId: "care",
    stageId: "inbox",
    managerId: "m2",
    budget: 90000,
    createdAt: at("2026-10-06T18:10:00+03:00"),
    events: [event("holiday-call", "call", "m2", at("2026-10-08T09:10:00+03:00"), { durationSec: 40 })],
  }),
  deal({
    id: "d-on-holiday",
    title: "Сад на Крыше — праздничная пауза",
    pipelineId: "sales",
    stageId: "new",
    managerId: "m3",
    budget: 45000,
    createdAt: at("2026-10-07T12:00:00+03:00"),
  }),
];

export function createDemoDeals() {
  return structuredClone(DEALS);
}

export function employeeById(id) {
  return EMPLOYEES.find((employee) => employee.id === id) || null;
}

export function pipelineById(id) {
  return PIPELINES.find((pipeline) => pipeline.id === id) || null;
}

export function stageName(pipelineId, stageId) {
  const stage = pipelineById(pipelineId)?.stages.find((item) => item.id === stageId);
  return stage?.name || "Без этапа";
}
