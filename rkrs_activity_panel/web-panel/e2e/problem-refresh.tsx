// The production polling hook, real React lifecycle, controlled source and clock.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FixtureSource } from "../src/api/fixtures/fixtureSource";
import { fixtureProblemLists } from "../src/api/fixtures/generator";
import type { Sourced } from "../src/api/source";
import type { ProblemLists } from "../src/domain/types";
import { useProblemLists, type ProblemPollClock } from "../src/features/dashboard/useProblemLists";

let now = 1793000000000;
let nextTimer = 0;
const timers = new Map<number, { at: number; callback: () => void }>();
let visible = !new URLSearchParams(location.search).has("hidden");
const visibilityListeners = new Set<() => void>();
const clock: ProblemPollClock = {
  isVisible: () => visible,
  subscribeVisibility: (callback) => { visibilityListeners.add(callback); return () => { visibilityListeners.delete(callback); }; },
  now: () => now,
  schedule: (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { at: now + delay, callback });
    return () => { timers.delete(id); };
  },
};
let requests = 0;
let aborted = 0;
let pending: { resolve: (value: Sourced<ProblemLists>) => void; reject: (error: Error) => void } | null = null;
class ControlledSource extends FixtureSource {
  override loadProblemLists(_params: { managers: number[] }, signal?: AbortSignal): Promise<Sourced<ProblemLists>> {
    requests++;
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      signal?.addEventListener("abort", () => { aborted++; pending = null; });
    });
  }
}
const source = new ControlledSource();
function snapshot(initial: boolean, collecting: boolean, pauseSeconds = 0): Sourced<ProblemLists> {
  const data = fixtureProblemLists([9007], Math.floor(now / 1000), null);
  return { kind: "ok", data: { ...data, collecting, refreshAfter: Math.floor(now / 1000) + (collecting ? pauseSeconds : 420),
    leadsNoTasks: initial ? [] : [{ managerId: 9007, count: 82, filterLink: null }],
    meta: { ...data.meta, snapshotAt: initial ? 0 : Math.floor(now / 1000) },
  } };
}
function Resource() {
  const resource = useProblemLists(source, "account-1", [9007], [], clock);
  return <section>
    <p data-testid="status">{resource.status}</p>
    <p data-testid="refreshing">{String(resource.refreshing)}</p>
    <p data-testid="error">{resource.error ? "failed" : "none"}</p>
    <p data-testid="collecting">{resource.data?.kind === "ok" ? String(resource.data.data.collecting) : "empty"}</p>
    <p data-testid="count">{resource.data?.kind === "ok" ? resource.data.data.leadsNoTasks[0]?.count ?? "empty" : "empty"}</p>
  </section>;
}
function App() {
  const [mounted, setMounted] = useState(true);
  const [, redraw] = useState(0);
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
    redraw((n) => n + 1);
  };
  return <main>
    <p data-testid="requests">{requests}</p>
    <p data-testid="timers">{timers.size}</p>
    <p data-testid="aborted">{aborted}</p>
    <button onClick={() => { pending?.resolve(snapshot(true, true)); redraw((n) => n + 1); }}>Resolve initial</button>
    <button onClick={() => { pending?.resolve(snapshot(false, false)); redraw((n) => n + 1); }}>Resolve complete</button>
    <button onClick={() => { pending?.resolve(snapshot(false, true)); redraw((n) => n + 1); }}>Resolve collecting</button>
    <button onClick={() => { pending?.resolve(snapshot(false, true, 60)); redraw((n) => n + 1); }}>Resolve paused</button>
    <button onClick={() => { pending?.reject(new Error("controlled failure")); redraw((n) => n + 1); }}>Reject</button>
    <button onClick={() => advance(10_000)}>Advance 10 seconds</button>
    <button onClick={() => advance(30_000)}>Advance 30 seconds</button>
    <button onClick={() => advance(410_000)}>Advance 410 seconds</button>
    <button onClick={() => advance(420_000)}>Advance 7 minutes</button>
    <button onClick={() => { visible = false; visibilityListeners.forEach((cb) => cb()); redraw((n) => n + 1); }}>Hide tab</button>
    <button onClick={() => { visible = true; visibilityListeners.forEach((cb) => cb()); redraw((n) => n + 1); }}>Show tab</button>
    <button onClick={() => setMounted(false)}>Unmount</button>
    <button onClick={() => redraw((n) => n + 1)}>Inspect</button>
    {mounted && <Resource />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
