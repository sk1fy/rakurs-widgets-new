import { useRef } from "react";
import { useResource } from "../../app/hooks";
import type { ActivitySource, ContractId, DayRange } from "../../api/source";
import { sourceIdentity } from "../../api/sourceIdentity";
import type { EmployeeId } from "../../domain/types";
import { loadExternalSessions, SessionsUnavailable, type ExternalSnapshot } from "./externalSessions";

export type ExternalState =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "unavailable"; contract: ContractId; reason: string; reload: () => void }
  | { kind: "error"; error: unknown; reload: () => void }
  | ({ kind: "ready"; refreshing: boolean; error: unknown; reload: () => void } & ExternalSnapshot);

export function useExternalSessions(source: ActivitySource, employeeIds: EmployeeId[], range: DayRange, enabled: boolean, refreshMs: number | null = null): ExternalState {
  const key = enabled ? `external:${sourceIdentity(source)}:${range.dayKey}:${range.from}:${range.to}:${employeeIds.join(",")}` : null;
  const previous = useRef<{ key: string | null; data: ExternalSnapshot } | null>(null);
  const resource = useResource(key, async (signal) => {
    const data = await loadExternalSessions(source, employeeIds, range, signal, previous.current?.key === key ? previous.current.data : null);
    if (!signal.aborted) previous.current = { key, data };
    return { key, data };
  }, { refreshMs });
  if (!enabled) return { kind: "off" };
  if (resource.data && resource.data.key !== key) return { kind: "loading" };
  if (resource.data) return { ...resource.data.data, kind: "ready", refreshing: resource.refreshing, error: resource.error, stale: resource.data.data.stale || resource.error !== null, reload: resource.reload };
  if (resource.error instanceof SessionsUnavailable) return { kind: "unavailable", contract: resource.error.contract, reason: resource.error.reason, reload: resource.reload };
  if (resource.status === "error") return { kind: "error", error: resource.error, reload: resource.reload };
  return { kind: "loading" };
}
