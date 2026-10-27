import type { Sourced } from "../../api/source";
import type { EmployeeSessions } from "../../domain/types";

/** Disabling collection must preserve observations and contract errors. */
export function shouldGateSessionHistory(enabled: boolean | null, sessions: Sourced<EmployeeSessions> | null): boolean {
  return enabled === false && sessions?.kind === "ok" && sessions.data.items.length === 0;
}
