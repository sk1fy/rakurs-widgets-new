import type { ActivityRatings } from "../api/source";
import { zoned } from "./time";
import type { EmployeeId } from "./types";

/** Select a server-calculated value; this does not calculate a percentage. */
export function profileActivityPercent(ratings: ActivityRatings | null, employeeId: EmployeeId, nowUnix: number): number | null {
  if (!ratings || ratings.formulaVersion !== "profile-v1") return null;
  const row = ratings.byEmployee.get(employeeId);
  if (!row) return null;
  const now = zoned(nowUnix, ratings.timeZone);
  if (now.dayKey !== ratings.dayKey) return row.percent;
  return row.minutePercentages?.[now.hour * 60 + now.minute] ?? null;
}
