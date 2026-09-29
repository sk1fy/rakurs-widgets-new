export const demoTasks = [
  {
    id: "task-call",
    title: "Обсудить предложение",
    entityName: "Север · новая сделка",
    type: "call",
    dueLabel: "Сегодня, 10:30",
    overdue: true,
    completed: false,
  },
  {
    id: "task-meeting",
    title: "Провести встречу",
    entityName: "Вектор · согласование",
    type: "meeting",
    dueLabel: "Сегодня, 14:00",
    overdue: false,
    completed: false,
  },
  {
    id: "task-email",
    title: "Отправить презентацию",
    entityName: "Маяк · первый контакт",
    type: "email",
    dueLabel: "Сегодня, 15:30",
    overdue: false,
    completed: false,
  },
  {
    id: "task-followup",
    title: "Уточнить обратную связь",
    entityName: "Горизонт · предложение",
    type: "call",
    dueLabel: "Сегодня, 17:00",
    overdue: false,
    completed: false,
  },
];

export const demoDialogs = [
  {
    id: "dialog-anna",
    name: "Анна",
    preview: "Спасибо! Когда сможем обсудить детали?",
    channel: "Telegram",
  },
  {
    id: "dialog-maxim",
    name: "Максим",
    preview: "Пришлите, пожалуйста, презентацию.",
    channel: "WhatsApp",
  },
  {
    id: "dialog-maria",
    name: "Мария",
    preview: "Подтверждаю встречу на сегодня.",
    channel: "Онлайн-чат",
  },
];
