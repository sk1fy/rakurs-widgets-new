/** Pure working-time, status and metrics. No DOM. */

export const CHANNELS = ["Звонок", "Чат", "Email", "Примечание"];

export const SPEED_GROUPS = [
  { id: "within", label: "В нормативе", tone: "green" },
  { id: "slight", label: "Немного позже", tone: "amber" },
  { id: "severe", label: "Значительно позже", tone: "red" },
  { id: "unanswered", label: "Без ответа", tone: "neutral" },
];

export const WEEKDAY_LABELS = [
  null,
  { short: "Пн", long: "понедельник" },
  { short: "Вт", long: "вторник" },
  { short: "Ср", long: "среда" },
  { short: "Чт", long: "четверг" },
  { short: "Пт", long: "пятница" },
  { short: "Сб", long: "суббота" },
  { short: "Вс", long: "воскресенье" },
];

const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export const CALC_NOTES = [
  "Рабочее время — сумма пересечений интервала от назначения текущей эпохи до касания или демо-часов с окнами графика. Моменты хранятся в миллисекундах, календарь читается в часовом поясе кабинета.",
  "На границе норматив ещё соблюдён: прошедшее время меньше либо равно цели. Нарушение — строго больше цели.",
  "Границы скорости — решение демо: ≤ норматив, (норматив; 2× норматива], > 2×. «Без ответа» — отдельная группа ожиданий.",
  "Период и heatmap привязаны к моменту назначения текущей эпохи в часовом поясе кабинета.",
  "Пока касания нет, канал неизвестен и не подставляется.",
  "Среднее и доля в SLA считаются только по сделкам с подтверждённым касанием. Рядом видны размер выборки и число ожидающих. Пустая выборка — это «нет данных», а не 0 минут.",
  "Нарушение учитывается один раз на сделку: поздний ответ или просроченное ожидание. Если в прошлом периоде нет сопоставимой выборки, процентная дельта не строится.",
  "Примечание останавливает таймер только при включённой настройке и только если его автор — ответственный на этот момент. Входящие сообщения, звонок нулевой длительности, постановка задачи, бот и система таймер не останавливают.",
  "Переназначение в ожидании по политике «сброс» открывает новую эпоху и оставляет старую в истории. «Сохранить обязательство» оставляет исходный старт. После подтверждённого касания обычное переназначение итог не переписывает.",
  "«Скрывать подсветку сделок, созданных вне рабочего времени» меняет только маркер. Рабочие секунды считаются в любом случае.",
  "Праздники — явный список дат выбранного демокалендаря, а не заявленный календарь поставщика.",
  "Пре-алерт отправляется один раз на сделку, даже после переназначения, и не является первым касанием. Если рабочий возраст ожидания уже больше 2× норматива, предупреждение пропускается.",
  "Критическая задача появляется у сделки без ответа после нарушения норматива и только если достигнут множитель или бюджет выше необязательного порога. Бюджет до нарушения задачу не создаёт. Повтор того же условия вторую задачу не создаёт. Задача — эскалация, не касание.",
];

export function parseHm(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function isScheduleValid(settings) {
  const start = parseHm(settings?.workStart);
  const end = parseHm(settings?.workEnd);
  return start != null && end != null && end > start;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function parts(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const bag = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  let day = Number(bag.day);
  let month = Number(bag.month);
  let year = Number(bag.year);
  if (hour === 24) hour = 0;
  return {
    year,
    month,
    day,
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: bag.weekday,
  };
}

function offsetMs(epoch, timeZone) {
  const part = parts(epoch, timeZone);
  const asUtc = Date.UTC(
    part.year,
    part.month - 1,
    part.day,
    part.hour,
    part.minute,
    part.second
  );
  return asUtc - epoch;
}

export function zonedToEpoch(year, month, day, hour, minute, second, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const corrected = guess - offsetMs(guess, timeZone);
  return guess - offsetMs(corrected, timeZone);
}

export function localDateKey(ms, timeZone) {
  const part = parts(ms, timeZone);
  return `${part.year}-${pad(part.month)}-${pad(part.day)}`;
}

export function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function startOfDay(dateKey, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return zonedToEpoch(year, month, day, 0, 0, 0, timeZone);
}

export function weekdayOfDateKey(dateKey, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const noon = zonedToEpoch(year, month, day, 12, 0, 0, timeZone);
  return WEEKDAY_INDEX[parts(noon, timeZone).weekday];
}

function timeZoneOf(settings) {
  return settings?.timezone || "Europe/Moscow";
}

function holidaySet(settings) {
  return new Set(
    (settings?.holidays || []).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
  );
}

function weekdaySet(settings) {
  return new Set((settings?.weekdays || []).map(Number));
}

export function isWorkingDate(dateKey, settings) {
  const timeZone = timeZoneOf(settings);
  if (!weekdaySet(settings).has(weekdayOfDateKey(dateKey, timeZone))) return false;
  return !holidaySet(settings).has(dateKey);
}

function windowBounds(dateKey, settings) {
  const timeZone = timeZoneOf(settings);
  const startMin = parseHm(settings.workStart);
  const endMin = parseHm(settings.workEnd);
  const [year, month, day] = dateKey.split("-").map(Number);
  return {
    start: zonedToEpoch(
      year,
      month,
      day,
      Math.floor(startMin / 60),
      startMin % 60,
      0,
      timeZone
    ),
    end: zonedToEpoch(
      year,
      month,
      day,
      Math.floor(endMin / 60),
      endMin % 60,
      0,
      timeZone
    ),
  };
}

export function isInsideWorkingWindow(ms, settings) {
  if (!isScheduleValid(settings) || !Number.isFinite(ms)) return false;
  const day = localDateKey(ms, timeZoneOf(settings));
  if (!isWorkingDate(day, settings)) return false;
  const bounds = windowBounds(day, settings);
  return ms >= bounds.start && ms < bounds.end;
}

export function workingMilliseconds(startMs, endMs, settings) {
  if (!isScheduleValid(settings)) {
    const error = new Error("invalid-schedule");
    error.code = "invalid-schedule";
    throw error;
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const timeZone = timeZoneOf(settings);
  let day = localDateKey(startMs, timeZone);
  const last = localDateKey(endMs, timeZone);
  let total = 0;
  for (let guard = 0; guard < 800; guard += 1) {
    if (isWorkingDate(day, settings)) {
      const bounds = windowBounds(day, settings);
      const from = Math.max(startMs, bounds.start);
      const to = Math.min(endMs, bounds.end);
      if (to > from) total += to - from;
    }
    if (day === last) break;
    day = addDays(day, 1);
  }
  return total;
}

export function timestampWhenWorkingReaches(startMs, neededMs, settings, horizonMs) {
  if (!isScheduleValid(settings)) return null;
  if (!(neededMs > 0)) return startMs;
  const timeZone = timeZoneOf(settings);
  let day = localDateKey(startMs, timeZone);
  const horizon = Number.isFinite(horizonMs) ? horizonMs : startMs + 120 * 86400000;
  let left = neededMs;
  for (let guard = 0; guard < 800; guard += 1) {
    if (isWorkingDate(day, settings)) {
      const bounds = windowBounds(day, settings);
      const from = Math.max(startMs, bounds.start);
      if (from < bounds.end && from <= horizon) {
        const available = Math.min(bounds.end, horizon) - from;
        if (available > 0) {
          if (left <= available && from + left <= horizon) return from + left;
          if (bounds.end <= horizon) left -= bounds.end - from;
        }
      }
    }
    const [year, month, dayNum] = day.split("-").map(Number);
    const dayEnd = zonedToEpoch(year, month, dayNum, 23, 59, 59, timeZone);
    if (dayEnd >= horizon) return null;
    day = addDays(day, 1);
  }
  return null;
}

export function nextWorkingDayStart(now, settings) {
  if (!isScheduleValid(settings) || !Number.isFinite(now)) return null;
  const timeZone = timeZoneOf(settings);
  let day = addDays(localDateKey(now, timeZone), 1);
  const startMin = parseHm(settings.workStart);
  for (let guard = 0; guard < 21; guard += 1) {
    if (isWorkingDate(day, settings)) {
      const [year, month, date] = day.split("-").map(Number);
      return zonedToEpoch(
        year,
        month,
        date,
        Math.floor(startMin / 60),
        startMin % 60,
        0,
        timeZone
      );
    }
    day = addDays(day, 1);
  }
  return null;
}

export function targetMilliseconds(settings) {
  return Number(settings.targetMinutes) * 60000;
}

export function channelLabel(event) {
  if (!event) return null;
  if (event.type === "call") return "Звонок";
  if (event.type === "message") return "Чат";
  if (event.type === "email") return "Email";
  if (event.type === "note") return "Примечание";
  return null;
}

function ignoreReason(event, settings, managerId, timerStart) {
  if (!event || event.at < timerStart) return "Событие раньше старта текущей эпохи";
  if (event.actorKind === "bot" || event.actorKind === "system" || event.type === "task") {
    return event.type === "task"
      ? "Постановка задачи не останавливает таймер"
      : "Событие бота или системы не останавливает таймер";
  }
  if (event.type === "message" && event.direction !== "out")
    return "Входящее сообщение не останавливает таймер";
  if (event.type === "email" && event.direction !== "out")
    return "Входящее письмо не останавливает таймер";
  if (event.type === "call" && !(event.direction === "out" && Number(event.durationSec) > 0))
    return "Звонок без положительной длительности не останавливает таймер";
  if (event.type === "note" && !settings.noteCounts)
    return "Ручное примечание не учитывается: настройка выключена";
  if (event.actorId !== managerId) return "Событие не от текущего ответственного";
  if (!channelLabel(event)) return "Событие не является первым касанием";
  return null;
}

function classifyStatus({ elapsedMs, targetMs, percent, inside, answered, future }) {
  if (future) return { id: "scheduled", label: "ожидает назначения", tone: "neutral" };
  if (answered) {
    if (elapsedMs <= targetMs)
      return { id: "on_time", label: "отвечено вовремя", tone: "green" };
    return { id: "late", label: "отвечено позже норматива", tone: "red" };
  }
  if (elapsedMs > targetMs)
    return { id: "overdue", label: "просрочено без ответа", tone: "red" };
  if (!inside) return { id: "paused", label: "пауза вне графика", tone: "neutral" };
  const threshold = Math.round((targetMs * Number(percent)) / 100);
  if (elapsedMs >= threshold) return { id: "risk", label: "риск", tone: "amber" };
  return { id: "waiting", label: "ожидание", tone: "neutral" };
}

export function speedGroup(elapsedMs, targetMs, answered) {
  if (!answered) return "unanswered";
  if (elapsedMs <= targetMs) return "within";
  if (elapsedMs <= 2 * targetMs) return "slight";
  return "severe";
}

export function buildPauseText(now, settings, alreadyBreach) {
  const timeZone = timeZoneOf(settings);
  const day = localDateKey(now, timeZone);
  const next = nextWorkingDayStart(now, settings);
  const holiday = holidaySet(settings).has(day)
    ? ` ${day} входит в выбранный демокалендарь праздников.`
    : "";
  const nextText = next ? ` Следующее окно: ${formatDateTime(next, timeZone)}.` : "";
  const breach = alreadyBreach
    ? " Норматив уже превышен; вне графика новые секунды не добавляются."
    : " Таймер стоит до начала рабочего окна.";
  return `Пауза вне графика ${settings.workStart}–${settings.workEnd} (${timeZone}).${holiday}${breach}${nextText}`;
}

export function projectDeal(deal, settings, now) {
  if (!deal || !isScheduleValid(settings) || !(Number(settings.targetMinutes) > 0)) {
    return { id: deal?.id ?? null, invalid: true };
  }
  const assignments = [...(deal.assignments || [])].sort((a, b) => a.at - b.at);
  if (!assignments.length || !Number.isFinite(assignments[0].at)) {
    return { id: deal.id, invalid: true };
  }
  const timeZone = timeZoneOf(settings);
  const targetMs = targetMilliseconds(settings);
  const policy = settings.reassignmentPolicy === "keep" ? "keep" : "reset";
  const createdAt = Number.isFinite(deal.createdAt) ? deal.createdAt : assignments[0].at;

  if (assignments[0].at > now) {
    return baseView(deal, {
      invalid: false,
      future: true,
      managerId: assignments[0].managerId,
      assignedAt: assignments[0].at,
      createdAt,
      elapsedMs: 0,
      overrunMs: 0,
      channel: null,
      touch: null,
      answered: false,
      status: classifyStatus({
        elapsedMs: 0,
        targetMs,
        percent: settings.preAlertPercent,
        inside: false,
        answered: false,
        future: true,
      }),
      speed: null,
      isBreach: false,
      breachAt: null,
      suppressHighlight:
        Boolean(settings.hideOffHoursHighlight) &&
        !isInsideWorkingWindow(createdAt, settings),
      pauseText: null,
      timeline: [
        {
          at: assignments[0].at,
          kind: "future",
          label: "Назначение ещё впереди по демо-часам",
        },
      ],
      epochs: [],
      weekday: weekdayOfDateKey(localDateKey(assignments[0].at, timeZone), timeZone),
      hour: parts(assignments[0].at, timeZone).hour,
    });
  }

  const events = [...(deal.events || [])].sort(
    (a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id))
  );
  const points = [
    ...assignments.map((assignment) => ({ kind: "assign", at: assignment.at, assignment })),
    ...events.map((event) => ({ kind: "event", at: event.at, event })),
  ].sort((a, b) => a.at - b.at || (a.kind === "assign" ? -1 : 1));

  let timerStart = assignments[0].at;
  let managerId = assignments[0].managerId;
  let touch = null;
  let seenAssign = false;
  const epochs = [{ managerId, assignedAt: timerStart, endedAt: null }];
  const timeline = [];

  for (const point of points) {
    if (point.at > now) continue;
    if (point.kind === "assign") {
      if (!seenAssign) {
        seenAssign = true;
        timeline.push({
          at: point.at,
          kind: "assign",
          managerId,
          label: "Назначение ответственному",
        });
        continue;
      }
      if (touch) {
        managerId = point.assignment.managerId;
        timeline.push({
          at: point.at,
          kind: "assign-after",
          managerId,
          label: "Переназначение после касания: итог не изменён",
        });
        continue;
      }
      epochs[epochs.length - 1].endedAt = point.at;
      if (policy === "reset") {
        timerStart = point.at;
        managerId = point.assignment.managerId;
        epochs.push({ managerId, assignedAt: timerStart, endedAt: null });
        timeline.push({
          at: point.at,
          kind: "reset",
          managerId,
          label: "Переназначение: новая эпоха таймера, прежняя остаётся в истории",
        });
      } else {
        managerId = point.assignment.managerId;
        epochs.push({ managerId, assignedAt: timerStart, endedAt: null, kept: true });
        timeline.push({
          at: point.at,
          kind: "keep",
          managerId,
          label: "Переназначение: обязательство сохранено, старт прежний",
        });
      }
      continue;
    }

    const reason = ignoreReason(point.event, settings, managerId, timerStart);
    if (reason) {
      timeline.push({
        at: point.event.at,
        kind: "ignored",
        eventId: point.event.id,
        label: reason,
      });
      continue;
    }
    if (!touch) {
      const elapsedMs = workingMilliseconds(timerStart, point.event.at, settings);
      touch = {
        at: point.event.at,
        eventId: point.event.id,
        channel: channelLabel(point.event),
        managerId,
        elapsedMs,
      };
      timeline.push({
        at: point.event.at,
        kind: "touch",
        eventId: point.event.id,
        label: `Первое касание · ${touch.channel}`,
      });
    } else {
      timeline.push({
        at: point.event.at,
        kind: "after-touch",
        eventId: point.event.id,
        label: "Событие после зафиксированного касания",
      });
    }
  }

  if (deal.preAlertSent) {
    timeline.push({
      at: deal.preAlertAt || now,
      kind: "pre-alert",
      label: "Пре-алерт отправлен один раз. Это не первое касание",
    });
  } else if (deal.preAlertSkipped) {
    timeline.push({
      at: now,
      kind: "pre-alert-skip",
      label: "Пре-алерт пропущен: рабочий возраст больше 2× норматива",
    });
  }
  if (deal.criticalTask) {
    timeline.push({
      at: deal.criticalTask.at,
      kind: "critical",
      label: "Критическая задача — эскалация, не первое касание",
    });
  }

  const elapsedMs = touch
    ? touch.elapsedMs
    : workingMilliseconds(timerStart, Math.max(now, timerStart), settings);
  const answered = Boolean(touch);
  const inside = isInsideWorkingWindow(now, settings);
  const status = classifyStatus({
    elapsedMs,
    targetMs,
    percent: settings.preAlertPercent,
    inside,
    answered,
    future: false,
  });
  const isBreach = elapsedMs > targetMs;
  const overrunMs = isBreach ? elapsedMs - targetMs : 0;
  const breachAt = isBreach
    ? timestampWhenWorkingReaches(timerStart, targetMs + 1, settings, (touch ? touch.at : now) + 1)
    : null;
  const assignedAt = timerStart;
  const dayKey = localDateKey(assignedAt, timeZone);

  return baseView(deal, {
    invalid: false,
    future: false,
    managerId,
    assignedAt,
    createdAt,
    elapsedMs,
    overrunMs,
    channel: touch ? touch.channel : null,
    touch,
    answered,
    status,
    speed: speedGroup(elapsedMs, targetMs, answered),
    isBreach,
    breachAt,
    suppressHighlight:
      Boolean(settings.hideOffHoursHighlight) &&
      !isInsideWorkingWindow(createdAt, settings),
    pauseText:
      !answered && !inside ? buildPauseText(now, settings, isBreach) : null,
    timeline,
    epochs,
    weekday: weekdayOfDateKey(dayKey, timeZone),
    hour: parts(assignedAt, timeZone).hour,
    timerStart,
  });
}

function baseView(deal, extra) {
  return {
    id: deal.id,
    title: deal.title,
    budget: deal.budget,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    criticalTask: deal.criticalTask || null,
    preAlertSent: Boolean(deal.preAlertSent),
    ...extra,
  };
}

export function preAlertDecision({
  elapsedMs,
  targetMs,
  percent,
  answered,
  alreadySent,
  alreadySkipped,
}) {
  if (answered || alreadySent || alreadySkipped) return { action: "none" };
  if (!(targetMs > 0)) return { action: "none" };
  if (elapsedMs > 2 * targetMs) return { action: "skip" };
  const threshold = Math.round((targetMs * Number(percent)) / 100);
  if (elapsedMs >= threshold) return { action: "fire" };
  return { action: "none" };
}

export function criticalDecision({
  elapsedMs,
  targetMs,
  multiplier,
  budget,
  threshold,
  answered,
  alreadyCreated,
}) {
  if (answered || alreadyCreated) return { create: false, reason: null };
  if (!(elapsedMs > targetMs)) return { create: false, reason: null };
  const overMultiple = elapsedMs >= Number(multiplier) * targetMs;
  const overBudget =
    threshold != null && Number.isFinite(Number(threshold)) && Number(budget) > Number(threshold);
  if (overMultiple && overBudget) return { create: true, reason: "both" };
  if (overMultiple) return { create: true, reason: "multiplier" };
  if (overBudget) return { create: true, reason: "budget" };
  return { create: false, reason: null };
}

export function periodBounds(preset, now, timeZone, custom) {
  const day = localDateKey(now, timeZone);
  if (preset === "today") {
    return {
      from: startOfDay(day, timeZone),
      to: startOfDay(addDays(day, 1), timeZone),
      label: "Сегодня",
    };
  }
  if (preset === "week") {
    const monday = addDays(day, 1 - weekdayOfDateKey(day, timeZone));
    return {
      from: startOfDay(monday, timeZone),
      to: startOfDay(addDays(monday, 7), timeZone),
      label: "Неделя",
    };
  }
  if (preset === "month") {
    const [year, month] = day.split("-").map(Number);
    const startKey = `${year}-${pad(month)}-01`;
    const nextKey = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
    return {
      from: startOfDay(startKey, timeZone),
      to: startOfDay(nextKey, timeZone),
      label: "Месяц",
    };
  }
  if (!custom?.from || !custom?.to) return { invalid: true, label: "Период" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(custom.from) || !/^\d{4}-\d{2}-\d{2}$/.test(custom.to))
    return { invalid: true, label: "Период" };
  const from = startOfDay(custom.from, timeZone);
  const to = startOfDay(addDays(custom.to, 1), timeZone);
  if (!(to > from)) return { invalid: true, label: "Период" };
  return { from, to, label: `${custom.from} — ${custom.to}` };
}

export function previousBounds(bounds) {
  const length = bounds.to - bounds.from;
  return { from: bounds.from - length, to: bounds.from, label: "Предыдущий период" };
}

export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "нет данных";
  if (ms > 0 && ms < 500) return "< 1 с";
  const sign = ms < 0 ? "−" : "";
  let rest = Math.abs(Math.round(ms / 1000));
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  const seconds = rest - minutes * 60;
  if (hours && minutes) return `${sign}${hours} ч ${minutes} мин`;
  if (hours) return `${sign}${hours} ч`;
  if (minutes && seconds) return `${sign}${minutes} мин ${seconds} с`;
  if (minutes) return `${sign}${minutes} мин`;
  return `${sign}${seconds} с`;
}

export function formatPercent(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return "нет данных";
  return `${Math.round(ratio * 1000) / 10}%`.replace(".0%", "%");
}

export function formatDateTime(ms, timeZone = "Europe/Moscow") {
  if (!Number.isFinite(ms)) return "нет данных";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

export function formatWindow(weekday, hour) {
  const label = WEEKDAY_LABELS[weekday]?.short || "—";
  return `${label}, ${pad(hour)}:00`;
}

export function percentDelta(current, previous) {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous))
    return { state: "absent" };
  if (previous === 0) return { state: "absent" };
  const value = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(value)) return { state: "absent" };
  return { state: "value", value };
}

export function formatDelta(delta) {
  if (!delta || delta.state !== "value" || !Number.isFinite(delta.value))
    return "сравнение отсутствует";
  const rounded = Math.round(delta.value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}% к предыдущему периоду`;
}

function sliceDeals(deals, bounds, settings, filters, now) {
  return deals.filter((deal) => {
    if (!deal || deal.invalid || deal.future) return false;
    if (!(deal.assignedAt <= now)) return false;
    if (bounds && (deal.assignedAt < bounds.from || deal.assignedAt >= bounds.to)) return false;
    if (settings?.pipelineIds && !settings.pipelineIds.includes(deal.pipelineId)) return false;
    if (filters?.managerId && deal.managerId !== filters.managerId) return false;
    if (filters?.pipelineId && deal.pipelineId !== filters.pipelineId) return false;
    return true;
  });
}

function averageOf(rows) {
  if (!rows.length) return null;
  return rows.reduce((sum, row) => sum + row.elapsedMs, 0) / rows.length;
}

function share(part, whole) {
  if (!whole) return null;
  return part / whole;
}

function summarize(rows, targetMs) {
  const touched = rows.filter((row) => row.answered);
  const waiting = rows.filter((row) => !row.answered);
  const onTime = touched.filter((row) => row.elapsedMs <= targetMs);
  const breaches = rows.filter((row) => row.isBreach);
  return {
    rows,
    touched,
    waiting,
    averageMs: averageOf(touched),
    averageSample: touched.length,
    waitingCount: waiting.length,
    onTimeShare: share(onTime.length, touched.length),
    onTimeSample: touched.length,
    breaches: breaches.length,
    controlled: rows.length,
    breachShare: share(breaches.length, rows.length),
  };
}

function channelStats(rows, targetMs) {
  return CHANNELS.map((label) => {
    const matched = rows.filter((row) => row.answered && row.channel === label);
    const onTime = matched.filter((row) => row.elapsedMs <= targetMs);
    return {
      id: label,
      label,
      count: matched.length,
      averageMs: averageOf(matched),
      averageLabel: matched.length ? formatDuration(averageOf(matched)) : "нет данных",
      shareLabel: matched.length ? formatPercent(onTime.length / matched.length) : "нет данных",
    };
  });
}

function speedStats(rows) {
  return SPEED_GROUPS.map((group) => ({
    ...group,
    count: rows.filter((row) => row.speed === group.id).length,
  }));
}

function managerStats(rows, employees, targetMs) {
  const source = employees?.length
    ? employees
    : [...new Map(rows.map((row) => [row.managerId, { id: row.managerId, name: row.managerName }])).values()];
  return source.map((employee) => {
    const mine = rows.filter((row) => row.managerId === employee.id);
    const touched = mine.filter((row) => row.answered);
    const onTime = touched.filter((row) => row.elapsedMs <= targetMs);
    const averageMs = averageOf(touched);
    return {
      id: employee.id,
      name: employee.name,
      averageMs,
      averageLabel: touched.length ? formatDuration(averageMs) : "нет данных",
      onTimeRatio: share(onTime.length, touched.length),
      onTimeLabel: touched.length ? formatPercent(onTime.length / touched.length) : "нет данных",
      breaches: mine.filter((row) => row.isBreach).length,
      deals: mine.length,
      sample: touched.length,
    };
  });
}

function heatmapStats(rows) {
  const cells = [];
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const matched = rows.filter((row) => row.weekday === weekday && row.hour === hour);
      const averageMs = averageOf(matched);
      cells.push({
        weekday,
        hour,
        count: matched.length,
        averageMs,
        breachCount: matched.filter((row) => row.isBreach).length,
      });
    }
  }
  const filled = cells.filter((cell) => cell.count > 0 && cell.averageMs != null);
  const max = filled.reduce((peak, cell) => Math.max(peak, cell.averageMs), 0);
  for (const cell of cells) {
    cell.level = cell.count && max > 0 ? Math.max(1, Math.ceil((cell.averageMs / max) * 4)) : 0;
  }
  const worst = filled.reduce((best, cell) => {
    if (!best) return cell;
    if (cell.averageMs > best.averageMs) return cell;
    if (cell.averageMs === best.averageMs && cell.breachCount > best.breachCount) return cell;
    return best;
  }, null);
  return {
    cells,
    worst: worst
      ? {
          weekday: worst.weekday,
          hour: worst.hour,
          label: formatWindow(worst.weekday, worst.hour),
          averageMs: worst.averageMs,
          averageLabel: formatDuration(worst.averageMs),
          count: worst.count,
        }
      : null,
  };
}

function kpiBundle(current, previous) {
  const averageDelta = percentDelta(
    current.averageSample ? current.averageMs : null,
    previous.averageSample ? previous.averageMs : null
  );
  const onTimeDelta = percentDelta(
    current.onTimeSample ? current.onTimeShare : null,
    previous.onTimeSample ? previous.onTimeShare : null
  );
  const breachDelta = percentDelta(
    current.controlled ? current.breachShare : null,
    previous.controlled ? previous.breachShare : null
  );
  return {
    average: {
      label: current.averageSample ? formatDuration(current.averageMs) : "нет данных",
      sample: current.averageSample,
      waiting: current.waitingCount,
      delta: averageDelta,
      deltaLabel: formatDelta(averageDelta),
    },
    onTime: {
      label: current.onTimeSample ? formatPercent(current.onTimeShare) : "нет данных",
      sample: current.onTimeSample,
      delta: onTimeDelta,
      deltaLabel: formatDelta(onTimeDelta),
    },
    breaches: {
      count: current.breaches,
      controlled: current.controlled,
      label: current.controlled ? `${current.breaches} из ${current.controlled}` : "нет данных",
      shareLabel: current.controlled ? formatPercent(current.breachShare) : "нет данных",
      delta: breachDelta,
      deltaLabel: formatDelta(breachDelta),
    },
  };
}

export function buildMetrics({ deals, bounds, settings, filters, employees, now }) {
  if (!bounds || bounds.invalid || !isScheduleValid(settings)) {
    return { invalid: true, notes: CALC_NOTES };
  }
  const targetMs = targetMilliseconds(settings);
  const header = {
    managerId: filters?.managerId || "",
    pipelineId: filters?.pipelineId || "",
  };
  const currentRows = sliceDeals(deals, bounds, settings, header, now);
  const previousRows = sliceDeals(deals, previousBounds(bounds), settings, header, now);
  const current = summarize(currentRows, targetMs);
  const previous = summarize(previousRows, targetMs);
  const kpis = kpiBundle(current, previous);
  const heat = heatmapStats(currentRows);
  const previousWorst = heatmapStats(previousRows).worst;
  const worstDelta = percentDelta(
    heat.worst ? heat.worst.averageMs : null,
    previousWorst ? previousWorst.averageMs : null
  );
  kpis.worst = {
    label: heat.worst ? heat.worst.label : "нет данных",
    averageLabel: heat.worst ? heat.worst.averageLabel : "нет данных",
    count: heat.worst ? heat.worst.count : 0,
    delta: worstDelta,
    deltaLabel: formatDelta(worstDelta),
  };
  const cohort = currentRows.filter((row) => {
    if (filters?.channel && row.channel !== filters.channel) return false;
    if (filters?.speed && row.speed !== filters.speed) return false;
    if (filters?.weekday != null && filters.weekday !== "" && row.weekday !== Number(filters.weekday))
      return false;
    if (filters?.hour != null && filters.hour !== "" && row.hour !== Number(filters.hour))
      return false;
    return true;
  });
  return {
    invalid: false,
    kpis,
    channels: channelStats(currentRows, targetMs),
    speed: speedStats(currentRows),
    managers: managerStats(currentRows, employees, targetMs),
    heatmap: heat,
    hypothesis: heatmapHypothesis(heat.worst),
    cohort,
    controlled: current.controlled,
    notes: CALC_NOTES,
  };
}

export function heatmapHypothesis(worst) {
  if (!worst) return null;
  return `Гипотеза: назначения около ${worst.label} ждут дольше, потому что ответ часто переносится на следующее рабочее окно. Это предположение, его нельзя подтвердить одной картой.`;
}

export function selectDigestBreaches(views, lastDigestAt, at) {
  const since = lastDigestAt || 0;
  return views.filter(
    (view) =>
      view &&
      !view.invalid &&
      !view.future &&
      view.isBreach &&
      view.breachAt != null &&
      view.breachAt > since &&
      view.breachAt <= at
  );
}

export function composeDigest(breaches, settings) {
  if (!breaches.length) return null;
  const worst = [...breaches].sort((a, b) => b.overrunMs - a.overrunMs).slice(0, 20);
  return {
    title: "Дайджест нарушений",
    breachCount: breaches.length,
    shown: worst.length,
    lines: worst.map(
      (deal) =>
        `${deal.managerName || deal.managerId}: превышение ${formatDuration(deal.overrunMs)}, норматив ${settings.targetMinutes} мин — ${deal.title}`
    ),
  };
}

export function selectEodDeals(views, dayKey, timeZone) {
  return views.filter(
    (view) =>
      view &&
      !view.invalid &&
      !view.future &&
      localDateKey(view.assignedAt, timeZone) === dayKey
  );
}

export function composeEod(deals, employees, settings) {
  if (!deals.length) return null;
  const targetMs = targetMilliseconds(settings);
  const groups = (employees || []).map((employee) => {
    const mine = deals.filter((deal) => deal.managerId === employee.id);
    const touched = mine.filter((deal) => deal.answered);
    return {
      id: employee.id,
      name: employee.name,
      deals: mine.length,
      breaches: mine.filter((deal) => deal.isBreach).length,
      averageLabel: touched.length ? formatDuration(averageOf(touched)) : "нет данных",
      averageMs: averageOf(touched),
    };
  });
  const present = groups.filter((group) => group.deals > 0);
  const breachCount = deals.filter((deal) => deal.isBreach).length;
  return {
    title: "Итог дня",
    managers: present,
    total: deals.length,
    breaches: breachCount,
    breachPercentLabel: formatPercent(breachCount / deals.length),
    targetMs,
  };
}

export function scheduledInstants(prev, next, hour, timeZone) {
  if (!(next > prev) || !Number.isInteger(hour)) return [];
  const found = [];
  let day = localDateKey(prev, timeZone);
  const endDay = addDays(localDateKey(next, timeZone), 1);
  for (let guard = 0; guard < 40 && day !== endDay; guard += 1) {
    const [year, month, date] = day.split("-").map(Number);
    const at = zonedToEpoch(year, month, date, hour, 0, 0, timeZone);
    if (at > prev && at <= next) found.push(at);
    day = addDays(day, 1);
  }
  return found;
}

export function cohortToCsv(rows, timeZone) {
  const header = [
    "Сделка",
    "Менеджер",
    "Воронка",
    "Назначение",
    "Канал",
    "Рабочее ожидание",
    "Статус",
    "Превышение",
  ];
  const lines = [header, ...rows.map((row) => [
    row.title,
    row.managerName || row.managerId,
    row.pipelineName || row.pipelineId,
    formatDateTime(row.assignedAt, timeZone),
    row.channel || "не определён",
    formatDuration(row.elapsedMs),
    row.status?.label || "",
    row.overrunMs > 0 ? formatDuration(row.overrunMs) : "—",
  ])];
  return lines
    .map((columns) => columns.map(csvCell).join(";"))
    .join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[";\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function normalizeSettings(input) {
  const settings = { ...input };
  settings.targetMinutes = Number(settings.targetMinutes);
  settings.preAlertPercent = Number(settings.preAlertPercent);
  settings.criticalMultiplier = Number(settings.criticalMultiplier);
  settings.digestHour = Math.trunc(Number(settings.digestHour));
  settings.eodHour = Math.trunc(Number(settings.eodHour));
  settings.weekdays = [...new Set((settings.weekdays || []).map(Number))].filter(
    (day) => day >= 1 && day <= 7
  );
  settings.holidays = [
    ...new Set((settings.holidays || []).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))),
  ].sort();
  if (settings.budgetThreshold === "" || settings.budgetThreshold == null)
    settings.budgetThreshold = null;
  else settings.budgetThreshold = Number(settings.budgetThreshold);
  settings.noteCounts = Boolean(settings.noteCounts);
  settings.hideOffHoursHighlight = Boolean(settings.hideOffHoursHighlight);
  settings.reassignmentPolicy = settings.reassignmentPolicy === "keep" ? "keep" : "reset";
  settings.pipelineIds = [...(settings.pipelineIds || [])];
  settings.workStart = String(settings.workStart || "");
  settings.workEnd = String(settings.workEnd || "");
  settings.timezone = String(settings.timezone || "Europe/Moscow");
  return settings;
}

export function validateSettings(settings) {
  const errors = [];
  if (!isScheduleValid(settings))
    errors.push("Конец рабочего окна должен быть позже начала. Показатели не рассчитаны.");
  if (!(settings.targetMinutes > 0)) errors.push("Норматив должен быть больше нуля.");
  if (!(settings.preAlertPercent >= 0 && settings.preAlertPercent <= 100))
    errors.push("Пре-алерт задаётся процентом от 0 до 100.");
  if (!(settings.criticalMultiplier > 0))
    errors.push("Множитель критической задачи должен быть больше нуля.");
  if (settings.budgetThreshold != null && !(settings.budgetThreshold >= 0))
    errors.push("Порог бюджета задан неверно.");
  if (settings.digestHour < 0 || settings.digestHour > 23)
    errors.push("Час дайджеста должен быть от 0 до 23.");
  if (settings.eodHour < 0 || settings.eodHour > 23)
    errors.push("Час итога дня должен быть от 0 до 23.");
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: settings.timezone }).format(0);
  } catch {
    errors.push("Часовой пояс не распознан.");
  }
  return errors;
}

export function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}
