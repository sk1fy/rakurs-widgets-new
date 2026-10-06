/**
 * Демоправило расписания. Это не формула amoCRM.
 *
 * Длительность задачи и шаг — разные величины. Шаг = доступные минуты окна / n,
 * где n = min(дневной лимит, хвост очереди менеджера). Задача j начинается в
 * windowStart + j × step, срок = начало + длительность.
 * Если срок выходит за конец окна, в этот день ставится только помещающийся
 * префикс, а остаток пересчитывается в следующем рабочем окне.
 * Если длительность больше шага, это перегрузка: пересечения не обещаются.
 * Если длительность больше полного окна, запуск запрещён.
 * Все даты считаются в одном календаре кабинета (смещение UTC), без чужой
 * локальной зоны браузера.
 */

const MINUTE = 60_000;

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const WEEKDAYS = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function parseInstant(value) {
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error("Некорректный момент времени");
  return ms;
}

export function parseHm(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatHm(minutes) {
  const whole = Math.max(0, Math.round(minutes));
  return `${pad(Math.floor(whole / 60) % 24)}:${pad(whole % 60)}`;
}

export function formatMinutes(value) {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

export function addCalendarDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function weekdayOf(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function zonedParts(utcMs, offsetMinutes) {
  const date = new Date(utcMs + offsetMinutes * MINUTE);
  const weekdayJs = date.getUTCDay();
  return {
    dateKey: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    isoWeekday: weekdayJs === 0 ? 7 : weekdayJs,
    minutes:
      date.getUTCHours() * 60 +
      date.getUTCMinutes() +
      date.getUTCSeconds() / 60 +
      date.getUTCMilliseconds() / 60000,
  };
}

export function utcFromDateAndMinutes(dateKey, minutesOfDay, offsetMinutes) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const whole = Math.floor(minutesOfDay);
  const extra = Math.round((minutesOfDay - whole) * MINUTE);
  const utc = Date.UTC(year, month - 1, day, Math.floor(whole / 60), whole % 60, 0, 0);
  return utc - offsetMinutes * MINUTE + extra;
}

export function formatClock(utcMs, offsetMinutes) {
  const date = new Date(utcMs + offsetMinutes * MINUTE);
  const clock = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  if (date.getUTCSeconds() === 0) return clock;
  return `${clock}:${pad(date.getUTCSeconds())}`;
}

export function formatDayLabel(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}, ${WEEKDAYS[weekdayOf(dateKey)]}`;
}

export function uniqueInOrder(contacts) {
  const seen = new Set();
  const result = [];
  for (const contact of contacts || []) {
    const id = typeof contact === "string" ? contact : contact.id;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(typeof contact === "string" ? { id } : contact);
  }
  return result;
}

function normalizeCabinet(cabinet) {
  return {
    workingDays: Array.isArray(cabinet?.workingDays) ? cabinet.workingDays.map(Number) : [],
    startMinutes: Number(cabinet?.startMinutes),
    endMinutes: Number(cabinet?.endMinutes),
    offsetMinutes: Number(cabinet?.offsetMinutes ?? 180),
    holidays: Array.isArray(cabinet?.holidays) ? cabinet.holidays : [],
  };
}

function isWorkingDate(dateKey, cabinet) {
  if (!cabinet.workingDays.includes(weekdayOf(dateKey))) return false;
  return !cabinet.holidays.includes(dateKey);
}

function nextWorkingDate(dateKey, cabinet) {
  let cursor = addCalendarDays(dateKey, 1);
  for (let guard = 0; guard < 370; guard += 1) {
    if (isWorkingDate(cursor, cabinet)) return cursor;
    cursor = addCalendarDays(cursor, 1);
  }
  throw new Error("Не найден следующий рабочий день");
}

function windowOn(dateKey, cabinet, startMinutes) {
  return {
    dateKey,
    startMs: utcFromDateAndMinutes(dateKey, startMinutes, cabinet.offsetMinutes),
    endMs: utcFromDateAndMinutes(dateKey, cabinet.endMinutes, cabinet.offsetMinutes),
    availableMinutes: cabinet.endMinutes - startMinutes,
  };
}

export function firstWindow(nowMs, cabinet) {
  const zoned = zonedParts(nowMs, cabinet.offsetMinutes);
  const inside =
    isWorkingDate(zoned.dateKey, cabinet) &&
    zoned.minutes >= cabinet.startMinutes &&
    zoned.minutes < cabinet.endMinutes;
  if (inside) return windowOn(zoned.dateKey, cabinet, zoned.minutes);
  let dateKey = zoned.dateKey;
  if (!isWorkingDate(dateKey, cabinet) || zoned.minutes >= cabinet.endMinutes) {
    dateKey = nextWorkingDate(dateKey, cabinet);
  }
  return windowOn(dateKey, cabinet, cabinet.startMinutes);
}

function nextWindow(current, cabinet) {
  return windowOn(nextWorkingDate(current.dateKey, cabinet), cabinet, cabinet.startMinutes);
}

function blankPlan(reason, message, forbidden = false) {
  return {
    ok: false,
    forbidden,
    reason,
    message,
    items: [],
    warnings: [],
    countsByManager: {},
    byManagerDay: {},
    days: [],
    lastTaskDate: null,
    fullWindowMinutes: null,
    duplicateIgnored: 0,
  };
}

export function buildPlan(input) {
  const cabinet = normalizeCabinet(input.cabinet);
  const fullWindow = cabinet.endMinutes - cabinet.startMinutes;
  const contacts = uniqueInOrder(input.contacts);
  const managers = input.managers || [];
  const duration = Number(input.durationMinutes);
  const dailyLimit = Number(input.dailyLimit);
  const duplicateIgnored = (input.contacts?.length || 0) - contacts.length;

  if (!(fullWindow > 0) || cabinet.workingDays.length === 0) {
    return {
      ...blankPlan(
        "invalid_schedule",
        "Конец рабочего окна должен быть позже начала, и нужен хотя бы один рабочий день.",
        true
      ),
      duplicateIgnored,
    };
  }
  if (!contacts.length || !managers.length) {
    return { ...blankPlan("empty_input", "Нужны контакты и менеджеры."), duplicateIgnored };
  }
  if (!(duration > 0) || !(dailyLimit > 0)) {
    return {
      ...blankPlan("invalid_limits", "Длительность и дневной лимит должны быть положительными числами."),
      duplicateIgnored,
    };
  }
  const slotsPerDay = Math.floor(dailyLimit);
  if (slotsPerDay < 1) {
    return {
      ...blankPlan("invalid_limits", "Дневной лимит должен позволять хотя бы одну задачу."),
      duplicateIgnored,
    };
  }
  if (duration > fullWindow) {
    return {
      ...blankPlan(
        "duration_exceeds_window",
        "Длительность задачи больше рабочего окна. Одну задачу нельзя поставить в смену, запуск запрещён.",
        true
      ),
      fullWindowMinutes: fullWindow,
      duplicateIgnored,
    };
  }

  const nowMs = parseInstant(input.now);
  const assignments = contacts.map((contact, index) => ({
    contact,
    manager: managers[index % managers.length],
  }));
  const queues = managers.map((manager) => ({
    manager,
    contacts: assignments
      .filter((item) => item.manager.id === manager.id)
      .map((item) => item.contact),
  }));
  const startWindow = firstWindow(nowMs, cabinet);
  const scheduled = new Map();
  const warnings = [];

  for (const queue of queues) {
    let window = startWindow;
    let index = 0;
    let guard = 0;
    while (index < queue.contacts.length) {
      guard += 1;
      if (guard > 5000) throw new Error("Слишком длинное расписание");
      if (window.availableMinutes + 1e-6 < duration) {
        window = nextWindow(window, cabinet);
        continue;
      }
      const remaining = queue.contacts.length - index;
      const count = Math.min(slotsPerDay, remaining);
      const step = window.availableMinutes / count;
      const overloaded = duration > step + 1e-9;
      if (overloaded) {
        warnings.push({
          code: "overload",
          managerId: queue.manager.id,
          day: window.dateKey,
          stepMinutes: step,
          durationMinutes: duration,
          planned: count,
        });
      }
      let placed = 0;
      for (let slot = 0; slot < count; slot += 1) {
        const startMs = window.startMs + slot * step * MINUTE;
        const dueMs = startMs + duration * MINUTE;
        if (dueMs > window.endMs + 1) break;
        const contact = queue.contacts[index];
        scheduled.set(contact.id, {
          contactId: contact.id,
          managerId: queue.manager.id,
          day: window.dateKey,
          startMs,
          dueMs,
          stepMinutes: step,
          overloaded,
        });
        index += 1;
        placed += 1;
      }
      if (placed === 0) {
        window = nextWindow(window, cabinet);
        continue;
      }
      if (index < queue.contacts.length) window = nextWindow(window, cabinet);
    }
  }

  const items = contacts.map((contact) => scheduled.get(contact.id));
  const countsByManager = {};
  const byManagerDay = {};
  for (const manager of managers) {
    countsByManager[manager.id] = 0;
    byManagerDay[manager.id] = {};
  }
  for (const item of items) {
    countsByManager[item.managerId] += 1;
    const bucket = byManagerDay[item.managerId];
    bucket[item.day] = (bucket[item.day] || 0) + 1;
  }
  const days = [...new Set(items.map((item) => item.day))].sort();
  return {
    ok: true,
    forbidden: false,
    reason: null,
    message: null,
    items,
    warnings,
    countsByManager,
    byManagerDay,
    days,
    lastTaskDate: days.at(-1) ?? null,
    fullWindowMinutes: fullWindow,
    duplicateIgnored,
  };
}
