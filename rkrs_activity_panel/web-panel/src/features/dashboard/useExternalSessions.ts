// Сессии панели задач для таймлайна (тумблер «События панели задач»).
// Очередь по 5 сотрудников, как в старой панели. F2: ошибка загрузки —
// отдельное состояние, а не «пусто».

import { useEffect, useState } from "react";
import { mapLimit } from "../../api/http";
import type { ActivitySource, ContractId, DayRange } from "../../api/source";
import type { EmployeeId, WorkSession } from "../../domain/types";

export type ExternalState =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "unavailable"; contract: ContractId; reason: string }
  | { kind: "ready"; byEmployee: Map<EmployeeId, WorkSession[] | "error">; synthetic: boolean };

export function useExternalSessions(source: ActivitySource, employeeIds: EmployeeId[], range: DayRange, enabled: boolean): ExternalState {
  const [state, setState] = useState<ExternalState>({ kind: "off" });
  const key = `${enabled}:${range.dayKey}:${employeeIds.join(",")}`;
  useEffect(() => {
    if (!enabled) {
      setState({ kind: "off" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    const byEmployee = new Map<EmployeeId, WorkSession[] | "error">();
    let unavailable: ExternalState | null = null;
    let synthetic = false;
    mapLimit(employeeIds, 5, async (id) => {
      if (unavailable) return;
      try {
        const r = await source.loadSessions(id, range, controller.signal);
        if (r.kind === "unavailable") unavailable = { kind: "unavailable", contract: r.contract, reason: r.reason };
        else {
          byEmployee.set(id, r.data.items.filter((s) => s.kind !== "pause"));
          synthetic ||= r.data.meta.source === "fixture";
        }
      } catch {
        byEmployee.set(id, "error");
      }
    }).then(() => {
      if (controller.signal.aborted) return;
      setState(unavailable ?? { kind: "ready", byEmployee, synthetic });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, source]);
  return state;
}
