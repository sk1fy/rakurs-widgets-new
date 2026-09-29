// Calendar navigation only. Weekly/monthly activity is intentionally not calculated here.
export const DEMO_DATE = "2026-09-24";
export const DEMO_TIME = "15:40";

export function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(value, amount) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function periodBounds(kind, anchor) {
  const date = parseDate(anchor);
  if (kind === "day") return { start: anchor, end: anchor };
  if (kind === "week") {
    const start = addDays(anchor, -((date.getDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  return {
    start: dateKey(new Date(date.getFullYear(), date.getMonth(), 1, 12)),
    end: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)),
  };
}

export function shiftPeriod(kind, anchor, direction) {
  if (kind === "day") return addDays(anchor, direction);
  if (kind === "week") return addDays(anchor, 7 * direction);
  const date = parseDate(anchor);
  return dateKey(
    new Date(date.getFullYear(), date.getMonth() + direction, 1, 12)
  );
}

const shortDate = (value) =>
  parseDate(value)
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    .replace(/\.$/, "");

export function periodLabel(kind, anchor) {
  if (kind === "day")
    return parseDate(anchor)
      .toLocaleDateString("ru-RU", {
        weekday: "long",
        day: "numeric",
        month: "short",
      })
      .replace(/\.$/, "");
  if (kind === "month")
    return parseDate(anchor)
      .toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
      .replace(/ г\.$/, "");
  const { start, end } = periodBounds(kind, anchor);
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  return crossesYear
    ? `${shortDate(start)} ${start.slice(0, 4)} — ${shortDate(end)} ${end.slice(
        0,
        4
      )}`
    : `${shortDate(start)} — ${shortDate(end)}`;
}

export function canGoForward(kind, anchor, today = DEMO_DATE) {
  return periodBounds(kind, anchor).start < periodBounds(kind, today).start;
}

export function readPreferences(storage) {
  try {
    const data = JSON.parse(
      storage.getItem("rkrs_activity_frontend_preferences") || "{}"
    );
    return {
      sidebar: typeof data?.sidebar === "boolean" ? data.sidebar : true,
      comparisons:
        typeof data?.comparisons === "boolean" ? data.comparisons : true,
      selected: Array.isArray(data?.selected)
        ? data.selected.filter((id) => typeof id === "string")
        : null,
    };
  } catch {
    return { sidebar: true, comparisons: true, selected: null };
  }
}
