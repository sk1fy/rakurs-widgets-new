/** Фиксированный список. Сборка один раз при загрузке модуля, без Math.random. */

export const DEFAULT_NOW = "2026-10-06T09:00:00+03:00";
export const FRIDAY_NOW = "2026-10-02T16:00:00+03:00";
export const QUOTA_LIMIT = 250;

const MEN = ["Иван", "Павел", "Сергей", "Никита", "Роман", "Илья", "Кирилл", "Андрей", "Михаил", "Артём", "Денис", "Глеб", "Егор"];
const WOMEN = ["Мария", "Ольга", "Екатерина", "Алина", "Татьяна", "Дарья", "Полина", "Софья", "Вера", "Юлия", "Ксения", "Наталья", "Инна"];
const MEN_LAST = ["Кузнецов", "Белов", "Волков", "Лебедев", "Новиков"];
const WOMEN_LAST = ["Орлова", "Морозова", "Соколова", "Козлова", "Павлова"];

function personName(index) {
  const male = index % 2 === 1;
  const bucket = Math.floor((index - 1) / 2);
  if (male) {
    return `${MEN[bucket % MEN.length]} ${MEN_LAST[Math.floor(bucket / MEN.length) % MEN_LAST.length]}`;
  }
  return `${WOMEN[bucket % WOMEN.length]} ${WOMEN_LAST[Math.floor(bucket / WOMEN.length) % WOMEN_LAST.length]}`;
}

const COMPANIES = [
  "Северная верфь",
  "Луч-сервис",
  "Поле и колос",
  "Тихий двор",
  "Мост и кран",
  "Янтарный цех",
  "Речной рынок",
  "Белая соль",
  "Клён-групп",
  "Новая полка",
  "Степной путь",
  "Городской двор",
];

export const TAGS = ["опт", "розница", "сайт", "выставка", "рекомендация"];
export const SOURCES = ["Сайт", "Входящий звонок", "Партнёр", "Выставка", "Реклама"];

function phone(index) {
  const digits = String(index).padStart(4, "0");
  return `+7 900 000-${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function buildContacts() {
  const list = [];
  for (let index = 1; index <= 130; index += 1) {
    const tags = [TAGS[(index - 1) % TAGS.length]];
    if (index % 4 === 0) tags.push(TAGS[index % TAGS.length]);
    list.push({
      id: `c${String(index).padStart(3, "0")}`,
      name: personName(index),
      phones: [phone(index)],
      company: COMPANIES[(index - 1) % COMPANIES.length],
      tags,
      source: SOURCES[(index * 3) % SOURCES.length],
      activeDeal: index % 5 === 0,
    });
  }
  list[0].phones = [];
  list[0].tags = ["розница"];
  list[1].phones = [phone(2), "+7 900 000-99-02"];
  return list;
}

export const demoContacts = buildContacts();

export const demoUsers = [
  { id: "u1", name: "Анна Соколова", active: true, vacation: "" },
  {
    id: "u2",
    name: "Борис Лебедев",
    active: true,
    vacation: "Отпуск до 12 октября. Задачи сами не переназначаются.",
  },
  { id: "u3", name: "Виктория Орлова", active: true, vacation: "" },
  { id: "u4", name: "Григорий Панов", active: true, vacation: "" },
  { id: "u5", name: "Елена Миронова", active: true, vacation: "" },
  { id: "u6", name: "Архип Смирнов", active: false, vacation: "" },
];

export const demoPipelines = [
  {
    id: "pipe-sales",
    name: "Продажи",
    stages: [
      { id: "st-new", name: "Новая заявка", type: "working" },
      { id: "st-talk", name: "Переговоры", type: "working" },
      { id: "st-won", name: "Успешно реализовано", type: "won" },
    ],
  },
  {
    id: "pipe-care",
    name: "Сопровождение",
    stages: [
      { id: "st-care", name: "Взято в работу", type: "working" },
      { id: "st-care-won", name: "Закрыто", type: "won" },
    ],
  },
];

export function firstWorkingStage(pipeline) {
  return pipeline?.stages.find((stage) => stage.type === "working") || pipeline?.stages[0] || null;
}

export function dealTitle(contactName, tag) {
  return `${contactName} — ${String(tag || "").trim() || "без тега"}`;
}

export function taskLabel(text, phone) {
  const body = String(text || "").trim();
  return body ? `${body} · ${phone}` : phone;
}

export function contactsWithPhone(limit, { single = false } = {}) {
  return demoContacts
    .filter((contact) => (single ? contact.phones.length === 1 : contact.phones.length > 0))
    .slice(0, limit)
    .map((contact) => contact.id);
}
