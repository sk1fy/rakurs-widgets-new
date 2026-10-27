import { addDays, dayStart, isoToUnix, minutesOfDay, minutesToHHMM } from "../time";
import type { WorkSession } from "../types";

/** Calendar-day intersection; Unix bounds preserve the account's DST rules. */
export function sessionWindow(session: WorkSession, dayKey: string, timeZone: string, nowUnix: number, bounds?: { start: number; end: number }) {
  const started = isoToUnix(session.startedAt);
  const stopped = isoToUnix(session.stoppedAt);
  if (started === null || (session.stoppedAt !== null && stopped === null)) return null;
  const dayFrom = dayStart(dayKey, timeZone);
  const dayTo = dayStart(addDays(dayKey, 1), timeZone);
  const start = Math.max(started, dayFrom, bounds?.start ?? dayFrom);
  const end = Math.min(stopped ?? nowUnix, nowUnix, dayTo, bounds ? bounds.end + 1 : dayTo);
  if (end <= start) return null;
  const elapsed = Math.max(0, end - start);
  const seconds = session.kind === "pause" ? 0 : stopped === null ? elapsed : Math.min(Math.max(0, session.workTimeSeconds || 0), elapsed);
  const startMinutes = start === dayFrom ? 0 : minutesOfDay(start, timeZone);
  const endMinutes = end === dayTo ? 1440 : minutesOfDay(end, timeZone);
  return { start, end, seconds, startMinutes, endMinutes: Math.max(startMinutes, endMinutes), startLabel: minutesToHHMM(startMinutes), endLabel: minutesToHHMM(endMinutes) };
}
