/** Live transport port. The demo controller is deliberately not connected:
 * callers must pass real CRM context and obtain a fresh disposable widget JWT.
 */
export function createActivitySessionClient({ baseURL, getToken, authorizedRequest, fetchImpl = fetch }) {
  const base = new URL(baseURL);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname))) throw new Error("Activity API requires HTTPS");
  if (base.username || base.password || base.search || base.hash) throw new Error("Invalid Activity API origin");
  if (typeof getToken !== "function" && typeof authorizedRequest !== "function") throw new Error("Fresh widget token provider is required");
  const origin = base.origin;
  let active = null;
  let pending = null;
  let running = false;
  let disposed = false;
  const abort = new AbortController();

  async function request(path, body, commandId, method = "POST") {
    if (disposed) throw new Error("Activity client is disposed");
    if (authorizedRequest) return authorizedRequest({ url: `${origin}/api/v1/widget/activity/${path}`, method, data: body === undefined ? undefined : JSON.stringify(body), contentType: "application/json", dataType: "json", headers: commandId ? { "Idempotency-Key": commandId } : {} });
    if (disposed) throw new Error("Activity client is disposed");
    const token = await getToken();
    if (typeof token !== "string" || !token) throw new Error("Widget authentication unavailable");
    const response = await fetchImpl(`${origin}/api/v1/widget/activity/${path}`, {
      method, credentials: "omit", referrerPolicy: "no-referrer", signal: abort.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(commandId ? { "Idempotency-Key": commandId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const error = new Error(failure.error?.message || "Activity request failed");
      error.code = failure.error?.code;
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async function sendPending() {
    if (running) throw new Error("Activity command is already in progress");
    if (!pending) throw new Error("No pending command");
    running = true;
    try {
      const result = await request("sessions", pending.body, pending.id);
      active = result.stopped_at ? null : result;
      pending = null;
      return result;
    } catch (error) {
      if ([400, 401, 403, 404, 409, 422].includes(error.status)) pending = null;
      throw error;
    } finally { running = false; }
  }
  function command(body) {
    if (pending) return Promise.reject(new Error("Retry the pending command before starting another operation"));
    pending = { id: crypto.randomUUID(), body: structuredClone({ ...body, ...(body.action !== "stop" ? { expected_session_id: active?.id || "" } : {}) }) };
    return sendPending();
  }
  return {
    startTask(context) {
      if (!Number.isSafeInteger(context?.task_id) || context.task_id <= 0) return Promise.reject(new Error("Real CRM task_id required"));
      return command({ action: "work", context });
    },
    startImbox(dialogId, context = {}) {
      if (!String(dialogId).match(/^\d+$/)) return Promise.reject(new Error("Real Imbox dialog ID required"));
      return command({ action: "activity", context: { ...context, activity_type: "imbox", activity_name: `Imbox ${dialogId}` } });
    },
    startActivity(name, context = {}) { return command({ action: "activity", context: { ...context, activity_type: "other", activity_name: name } }); },
    startPause() { return command({ action: "pause", context: {} }); },
    stop(result = "") {
      if (!active) return Promise.reject(new Error("No active server session"));
      return command({ action: "stop", session_id: active.id, context: { task_result: result } });
    },
    retryPending: sendPending,
    async loadState() { const state = await request("state", undefined, undefined, "GET"); active = state.current?.id ? state.current : null; return state; },
    loadHistory(query) { return request(`sessions?${new URLSearchParams(query)}`, undefined, undefined, "GET"); },
    getState() { return { active: active ? structuredClone(active) : null, pending: !!pending, running }; },
    createManagementLink(appOrigin) { return request("browser-session", { app_origin: appOrigin }); },
    dispose() { disposed = true; abort.abort(); },
  };
}
