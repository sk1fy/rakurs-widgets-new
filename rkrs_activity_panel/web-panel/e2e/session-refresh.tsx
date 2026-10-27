// Controlled observations for the production hooks; never included in app entry.
import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ActivitySource, Sourced } from "../src/api/source";
import { dayEndInclusive, dayStart, unixAt } from "../src/domain/time";
import type { DataMeta, EmployeeSessions, WorkSession } from "../src/domain/types";
import { useExternalSessions } from "../src/features/dashboard/useExternalSessions";
import { useEmployeeData } from "../src/features/employee/useEmployeeData";

const params = new URLSearchParams(location.search);
const profile = params.get("mode") === "profile";
const historical = params.has("historical");
const day = historical ? "2026-10-26" : "2026-10-27";
if (params.has("hidden")) Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });

function SessionRefreshAudit() {
  const [employee, setEmployee] = useState(7);
  const [sourceIndex, setSourceIndex] = useState(1);
  const [zone, setZone] = useState("Europe/Moscow");
  const [offset, setOffset] = useState(0);
  const calls = useRef(0);
  const pending = useRef<{ resolve: () => void; reject: () => void }[]>([]);
  const source = useMemo(() => {
    const meta: DataMeta = { source: "fixture", snapshotAt: unixAt(day, 720, "Europe/Moscow"), coverage: "verified", partial: false, stale: false };
    return {
      mode: "fixtures",
      loadSessions(id, range) {
        if (range.dayKey !== day) return Promise.resolve({ kind: "ok", data: { employeeId: id, day: range.dayKey, items: [], meta } });
        const request = ++calls.current;
        const taskName = `source${sourceIndex}-employee${id}-request${request}`;
        return new Promise<Sourced<EmployeeSessions>>((resolve, reject) => {
          const session: WorkSession = { kind: "work", startedAt: new Date(range.from * 1000).toISOString(), stoppedAt: new Date((range.from + 60) * 1000).toISOString(), workTimeSeconds: 60, taskName };
          pending.current.push({ resolve: () => resolve({ kind: "ok", data: { employeeId: id, day: range.dayKey, items: [session], meta } }), reject: () => reject(Error("controlled session failure")) });
        });
      },
      loadEmployeeEvents: async (_id, range) => ({ byEmployee: new Map(), range, meta }),
      loadActivityRatings: async (range) => ({ formulaVersion: "profile-v1", dayKey: range.dayKey, timeZone: "Europe/Moscow", startMinutes: range.startMinutes, endMinutes: range.endMinutes, cutoffUnix: range.cutoffUnix, snapshotAt: meta.snapshotAt, partial: false, byEmployee: new Map() }),
    } as ActivitySource;
  }, [sourceIndex]);
  const range = { dayKey: day, from: dayStart(day, zone) + offset, to: dayEndInclusive(day, zone) };
  const refreshMs = historical ? null : 240000;
  const visibility = (value: string) => { Object.defineProperty(document, "visibilityState", { configurable: true, value }); document.dispatchEvent(new Event("visibilitychange")); };
  return <main>
    {profile ? <ProfileObservation source={source} employee={employee} zone={zone} refreshMs={refreshMs} requests={() => calls.current} /> : <ExternalObservation source={source} employee={employee} range={range} refreshMs={refreshMs} requests={() => calls.current} />}
    <button onClick={() => pending.current.shift()?.resolve()}>Resolve oldest</button>
    <button onClick={() => pending.current.pop()?.resolve()}>Resolve latest</button>
    <button onClick={() => pending.current.pop()?.reject()}>Reject latest</button>
    <button onClick={() => visibility("hidden")}>Hide tab</button>
    <button onClick={() => visibility("visible")}>Show tab</button>
    <button onClick={() => window.dispatchEvent(new Event("focus"))}>Focus</button>
    <button onClick={() => setEmployee((id) => id + 1)}>Change employee</button>
    <button onClick={() => setSourceIndex((id) => id + 1)}>Change source</button>
    <button onClick={() => { setZone((value) => value === "UTC" ? "Europe/Moscow" : "UTC"); setOffset((value) => value + 3600); }}>Change range</button>
  </main>;
}

interface ObservationProps { source: ActivitySource; employee: number; refreshMs: number | null; requests: () => number }
function Readout({ items, requests, refreshing, failed, kind }: { items: WorkSession[] | null; requests: () => number; refreshing: boolean; failed: boolean; kind: string }) {
  return <section>
    <p data-testid="data">{items ? items.map((row) => row.taskName).join(",") : "empty"}</p>
    <p data-testid="requests">{requests()}</p>
    <p data-testid="refreshing">{String(refreshing)}</p>
    <p data-testid="error">{failed ? "failed" : "none"}</p>
    <p data-testid="kind">{kind}</p>
  </section>;
}
function ExternalObservation({ source, employee, range, refreshMs, requests }: ObservationProps & { range: { dayKey: string; from: number; to: number } }) {
  const resource = useExternalSessions(source, [employee], range, true, refreshMs);
  const data = resource.kind === "ready" ? resource.byEmployee.get(employee) : null;
  return <Readout items={Array.isArray(data) ? data : null} requests={requests} refreshing={resource.kind === "ready" && resource.refreshing} failed={resource.kind === "error" || (resource.kind === "ready" && (Boolean(resource.error) || resource.failedEmployeeIds.size > 0))} kind={resource.kind} />;
}
function ProfileObservation({ source, employee, zone, refreshMs, requests }: ObservationProps & { zone: string }) {
  const resource = useEmployeeData(source, employee, day, zone, refreshMs, 540, 1080, unixAt("2026-10-27", 720, "Europe/Moscow")).sessions;
  const data = resource.data?.kind === "ok" ? resource.data.data.items : null;
  return <Readout items={data} requests={requests} refreshing={resource.refreshing} failed={Boolean(resource.error)} kind={resource.status} />;
}

createRoot(document.getElementById("root")!).render(<SessionRefreshAudit />);
