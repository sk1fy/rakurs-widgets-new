import { mapLimit } from "../../api/http";
import type { ActivitySource, ContractId, DayRange } from "../../api/source";
import type { EmployeeId, WorkSession } from "../../domain/types";

export class SessionsUnavailable extends Error {
  constructor(readonly contract: ContractId, readonly reason: string) { super(reason); }
}

export interface ExternalSnapshot {
  byEmployee: Map<EmployeeId, WorkSession[] | "error">;
  failedEmployeeIds: Set<EmployeeId>;
  synthetic: boolean;
  stale: boolean;
}

/** Preserve failed employees' previous observations with an explicit stale flag. */
export async function loadExternalSessions(source: ActivitySource, employeeIds: EmployeeId[], range: DayRange, signal: AbortSignal, previous: ExternalSnapshot | null): Promise<ExternalSnapshot> {
  const byEmployee = new Map<EmployeeId, WorkSession[] | "error">();
  const failedEmployeeIds = new Set<EmployeeId>();
  let synthetic = false;
  let stale = false;
  let unavailable: SessionsUnavailable | null = null;
  await mapLimit(employeeIds, 5, async (id) => {
    if (signal.aborted || unavailable) return;
    try {
      const result = await source.loadSessions(id, range, signal);
      if (result.kind === "unavailable") unavailable = new SessionsUnavailable(result.contract, result.reason);
      else {
        byEmployee.set(id, result.data.items.filter((session) => session.kind !== "pause"));
        synthetic ||= result.data.meta.source === "fixture";
        stale ||= result.data.meta.stale || result.data.meta.partial;
      }
    } catch (error) {
      if (signal.aborted) throw error;
      const old = previous?.byEmployee.get(id);
      byEmployee.set(id, Array.isArray(old) ? old : "error");
      failedEmployeeIds.add(id);
      synthetic ||= previous?.synthetic === true;
      stale = true;
    }
  });
  if (unavailable) throw unavailable;
  return { byEmployee, failedEmployeeIds, synthetic, stale };
}
