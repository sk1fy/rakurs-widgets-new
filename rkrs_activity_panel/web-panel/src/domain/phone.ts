// Нормализация номеров. В старом коде два правила: шапка/операторы
// (8 → 7 при ≥ 11 цифрах) и анализ событий (снять 7/8 у 11-значного).
// Оба дают одинаковые классы эквивалентности для российских номеров,
// но сохраняются раздельно, чтобы не менять поведение экранов.

export function digits(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** DashboardHeader / EmployeeSpeedWidget normalizePhoneForComparison. */
export function normalizePhoneForMissed(phone: string): string {
  const d = digits(phone);
  if (d.startsWith("8") && d.length >= 11) return `7${d.slice(1)}`;
  return d;
}

/** EmployeeActivitiesSectionV3 normalizePhoneForComparison (уникальные звонки). */
export function normalizePhoneForUnique(phone: string | null | undefined): string {
  const d = digits(phone);
  if (d.length === 11 && (d.startsWith("7") || d.startsWith("8"))) return d.slice(1);
  return d;
}

export function phoneDisplay(phone: string): string {
  const d = digits(phone);
  if ((d.startsWith("8") || d.startsWith("7")) && d.length >= 11) return `+7${d.slice(1)}`;
  return d ? `+${d}` : "";
}
