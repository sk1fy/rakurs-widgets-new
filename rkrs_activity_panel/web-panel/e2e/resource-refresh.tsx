// Browser regression harness for the real hook. Not an application build entry.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useResource } from "../src/app/hooks";

if (new URLSearchParams(location.search).has("hidden")) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
}

function ResourceRefreshAudit() {
  const [scope, setScope] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const requests = useRef(0);
  const refreshMs = Number(new URLSearchParams(location.search).get("refreshMs")) || undefined;
  const pending = useRef<{ resolve: (value: string) => void; reject: (error: Error) => void } | null>(null);
  const resource = useResource(`scope-${scope}`, () => new Promise<string>((resolve, reject) => {
    requests.current++;
    pending.current = { resolve, reject };
  }), { refreshKey, refreshMs });
  const visibility = (value: string) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  return <main>
    <p data-testid="data">{resource.data ?? "empty"}</p>
    <p data-testid="status">{resource.status}</p>
    <p data-testid="refreshing">{String(resource.refreshing)}</p>
    <p data-testid="error">{resource.error ? "failed" : "none"}</p>
    <p data-testid="requests">{requests.current}</p>
    <button onClick={() => pending.current?.resolve(`${scope}:${refreshMs ? requests.current : refreshKey}`)}>Resolve</button>
    <button onClick={() => pending.current?.reject(new Error("controlled failure"))}>Reject</button>
    <button onClick={() => setRefreshKey((key) => key + 1)}>Refresh</button>
    <button onClick={() => setScope((key) => key + 1)}>Change scope</button>
    <button onClick={() => visibility("hidden")}>Hide tab</button>
    <button onClick={() => visibility("visible")}>Show tab</button>
    <button onClick={() => window.dispatchEvent(new Event("focus"))}>Focus</button>
  </main>;
}

createRoot(document.getElementById("root")!).render(<ResourceRefreshAudit />);
