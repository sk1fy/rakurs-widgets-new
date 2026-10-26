import { useMemo } from "react";
import { useResource } from "../../app/hooks";
import type { ActivitySource, DayRange } from "../../api/source";
import { addDays, dayEndInclusive, dayStart } from "../../domain/time";
import type { EmployeeId } from "../../domain/types";

/** Профиль грузит события всего календарного дня и такого же предыдущего дня. */
export function useEmployeeData(source: ActivitySource, employeeId: EmployeeId, dayKey: string, timeZone: string, refreshMs: number | null) {
  const range = useMemo<DayRange>(() => ({ dayKey, from: dayStart(dayKey, timeZone), to: dayEndInclusive(dayKey, timeZone) }), [dayKey, timeZone]);
  const prev = useMemo<DayRange>(() => {
    const d = addDays(dayKey, -1);
    return { dayKey: d, from: dayStart(d, timeZone), to: dayEndInclusive(d, timeZone) };
  }, [dayKey, timeZone]);
  const events = useResource(`emp:${employeeId}:${range.from}`, (s) => source.loadEmployeeEvents(employeeId, range, s), { refreshMs });
  const prevEvents = useResource(`emp-prev:${employeeId}:${prev.from}`, (s) => source.loadEmployeeEvents(employeeId, prev, s));
  const sessions = useResource(`ses:${employeeId}:${range.dayKey}`, (s) => source.loadSessions(employeeId, range, s), { refreshMs });
  const prevSessions = useResource(`ses-prev:${employeeId}:${prev.dayKey}`, (s) => source.loadSessions(employeeId, prev, s));
  return { range, prev, events, prevEvents, sessions, prevSessions };
}
