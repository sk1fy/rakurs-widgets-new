import { useMemo } from "react";
import { useResource } from "../../app/hooks";
import type { ActivitySource, DayRange } from "../../api/source";
import { sourceIdentity } from "../../api/sourceIdentity";
import { addDays, dayEndInclusive, dayStart } from "../../domain/time";
import type { EmployeeId } from "../../domain/types";

/** Профиль грузит события всего календарного дня и такого же предыдущего дня. */
export function useEmployeeData(source: ActivitySource, employeeId: EmployeeId, dayKey: string, timeZone: string, refreshMs: number | null, startMinutes: number, endMinutes: number, nowUnix: number) {
  const range = useMemo<DayRange>(() => ({ dayKey, from: dayStart(dayKey, timeZone), to: dayEndInclusive(dayKey, timeZone) }), [dayKey, timeZone]);
  const prev = useMemo<DayRange>(() => {
    const d = addDays(dayKey, -1);
    return { dayKey: d, from: dayStart(d, timeZone), to: dayEndInclusive(d, timeZone) };
  }, [dayKey, timeZone]);
  const scope = sourceIdentity(source);
  const events = useResource(`emp:${scope}:${employeeId}:${range.from}`, (s) => source.loadEmployeeEvents(employeeId, range, s), { refreshMs });
  const prevEvents = useResource(`emp-prev:${scope}:${employeeId}:${prev.from}`, (s) => source.loadEmployeeEvents(employeeId, prev, s));
  const ratings = useResource(events.data ? `emp-rating:${scope}:${employeeId}:${range.from}:${startMinutes}:${endMinutes}` : null,
    (s) => source.loadActivityRatings({ ...range, surface: "profile", employeeIds: [employeeId], startMinutes, endMinutes, cutoffUnix: nowUnix }, s),
    { refreshKey: events.updatedAt });
  const prevRatings = useResource(prevEvents.data ? `emp-prev-rating:${scope}:${employeeId}:${prev.from}:${startMinutes}:${endMinutes}` : null,
    (s) => source.loadActivityRatings({ ...prev, surface: "profile", employeeIds: [employeeId], startMinutes, endMinutes, cutoffUnix: nowUnix }, s),
    { refreshKey: prevEvents.updatedAt });
  const sessions = useResource(`ses:${scope}:${employeeId}:${range.from}:${range.to}`, (s) => source.loadSessions(employeeId, range, s), { refreshMs });
  const prevSessions = useResource(`ses-prev:${scope}:${employeeId}:${prev.from}:${prev.to}`, (s) => source.loadSessions(employeeId, prev, s));
  return { range, prev, events, prevEvents, ratings, prevRatings, sessions, prevSessions };
}
