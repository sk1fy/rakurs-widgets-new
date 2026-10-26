// Browser regression harness for the real hook. Not an application build entry.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useResource } from "../src/app/hooks";

function ResourceRefreshAudit() {
  const [scope, setScope] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const pending = useRef<{ resolve: (value: string) => void; reject: (error: Error) => void } | null>(null);
  const resource = useResource(`scope-${scope}`, () => new Promise<string>((resolve, reject) => {
    pending.current = { resolve, reject };
  }), { refreshKey });
  return <main>
    <p data-testid="data">{resource.data ?? "empty"}</p>
    <p data-testid="status">{resource.status}</p>
    <p data-testid="refreshing">{String(resource.refreshing)}</p>
    <p data-testid="error">{resource.error ? "failed" : "none"}</p>
    <button onClick={() => pending.current?.resolve(`${scope}:${refreshKey}`)}>Resolve</button>
    <button onClick={() => pending.current?.reject(new Error("controlled failure"))}>Reject</button>
    <button onClick={() => setRefreshKey((key) => key + 1)}>Refresh</button>
    <button onClick={() => setScope((key) => key + 1)}>Change scope</button>
  </main>;
}

createRoot(document.getElementById("root")!).render(<ResourceRefreshAudit />);
