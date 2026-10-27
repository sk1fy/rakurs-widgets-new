import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementProxyBackend, UnavailableSettingsBackend } from "../src/settings/api";

afterEach(() => vi.unstubAllGlobals());
const raw = (revision = 3) => ({ enabled: true, employee_ids: [7], consider_future_tasks: false, include_related_deals: true, priority_keys: ["today_timed", "urgent"], revision });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("MVP shared task panel settings", () => {
  it("restores server order and disabled priorities, sends only the browser credential", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (init.method === "PATCH") return response({ ...JSON.parse(String(init.body)), revision: 4 });
      return response(raw());
    });
    const backend = new ManagementProxyBackend("https://api.example.invalid/api/v1/activity", "opaque-browser-fixture");
    const settings = await backend.getTaskPanel();
    expect(settings.priorities.slice(0, 2)).toEqual([{ key: "today_timed", enabled: true }, { key: "urgent", enabled: true }]);
    expect(settings.priorities.slice(2).every((p) => !p.enabled)).toBe(true);
    const saved = await backend.saveTaskPanel({ ...settings, enabledEmployees: [7, 8] });
    expect(saved.revision).toBe(4);
    expect(JSON.parse(String(requests[1]!.init.body))).toMatchObject({ employee_ids: [7, 8], priority_keys: ["today_timed", "urgent"], revision: 3 });
    expect(requests.every((r) => (r.init.headers as Record<string, string>).Authorization === "Bearer opaque-browser-fixture")).toBe(true);
    expect(requests.every((r) => r.init.credentials === "omit" && r.init.referrerPolicy === "no-referrer")).toBe(true);
  });

  it("serializes rapid saves with acknowledged server revisions", async () => {
    let finishFirst: (() => void) | undefined;
    const revisions: number[] = [];
    vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
      if (init.method !== "PATCH") return response(raw());
      const body = JSON.parse(String(init.body)) as { revision: number };
      revisions.push(body.revision);
      if (revisions.length === 1) await new Promise<void>((resolve) => { finishFirst = resolve; });
      return response({ ...raw(body.revision + 1), ...body, revision: body.revision + 1 });
    });
    const backend = new ManagementProxyBackend("/api/v1/activity");
    const settings = await backend.getTaskPanel();
    const first = backend.saveTaskPanel({ ...settings, enabled: false });
    const second = backend.saveTaskPanel({ ...settings, enabledEmployees: [8] });
    await vi.waitFor(() => expect(revisions).toEqual([3]));
    finishFirst!();
    await Promise.all([first, second]);
    expect(revisions).toEqual([3, 4]);
  });

  it.each([[409, "conflict"], [403, "permission_denied"], [401, "unauthenticated"]] as const)("blocks queued writes after %s until an explicit fresh read", async (status, code) => {
    let patches = 0;
    let refuse = true;
    vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
      if (init.method !== "PATCH") return response(raw(refuse ? 3 : 9));
      patches++;
      return refuse ? response({ error: { code, message: "fixture refusal" } }, status) : response(raw(10));
    });
    const backend = new ManagementProxyBackend("/api/v1/activity");
    const settings = await backend.getTaskPanel();
    const results = await Promise.allSettled([backend.saveTaskPanel(settings), backend.saveTaskPanel(settings)]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(patches).toBe(1);
    refuse = false;
    await backend.getTaskPanel();
    expect((await backend.saveTaskPanel(settings)).revision).toBe(10);
    expect(patches).toBe(2);
  });

  it("keeps missing administrator access unavailable rather than editable fixture settings", () => {
    const backend = new UnavailableSettingsBackend();
    expect(backend.capabilities.taskPanel).toMatchObject({ available: false, contract: "C7" });
  });
});


it("maps expired browser management credentials separately and blocks queued saves", async () => {
  const { describeError } = await import("../src/api/errors");
  const removeItem = vi.fn();
  vi.stubGlobal("window", { sessionStorage: { removeItem } });
  let patches = 0;
  vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
    if (init.method !== "PATCH") return response(raw());
    patches++;
    return response({ error: { code: "unauthenticated", request_id: "fixture-request" } }, 401);
  });
  const backend = new ManagementProxyBackend("/api/v1/activity", "expired-fixture");
  const settings = await backend.getTaskPanel();
  const results = await Promise.allSettled([backend.saveTaskPanel(settings), backend.saveTaskPanel(settings)]);
  expect(patches).toBe(1);
  for (const result of results) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toMatchObject({ code: "management_session_expired", requestId: "fixture-request" });
      expect(describeError(result.reason)).toMatchObject({ title: "Войдите в настройки из amoCRM", retryable: false });
    }
  }
  expect(removeItem).toHaveBeenCalled();
});
