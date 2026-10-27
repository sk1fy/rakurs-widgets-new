/** Employee session transport. Every request obtains a fresh disposable JWT. */
export function createActivitySessionClient({ baseURL, getToken, authorizedRequest, fetchImpl = fetch, storage, storageKey }) {
  const base = new URL(baseURL);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) throw new Error('Activity API requires HTTPS');
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid Activity API origin');
  if (typeof getToken !== 'function' && typeof authorizedRequest !== 'function') throw new Error('Fresh widget token provider is required');
  const origin = base.origin;
  let active = null;
  let pending = null;
  let running = false;
  let disposed = false;
  const abort = new AbortController();
  if (storage && storageKey) {
    try {
      const saved = JSON.parse(storage.getItem(storageKey) || 'null');
      if (saved && /^[0-9a-f-]{36}$/i.test(saved.id) && ['work', 'activity', 'pause', 'stop'].includes(saved.body?.action)) pending = saved;
    } catch { /* Storage is optional; server state remains authoritative. */ }
  }
  function remember() {
    if (!storage || !storageKey) return;
    try { if (pending) storage.setItem(storageKey, JSON.stringify(pending)); else storage.removeItem(storageKey); }
    catch { /* A storage failure must not erase the in-memory command. */ }
  }
  function assertAlive() { if (disposed) throw new Error('Activity client is disposed'); }
  async function request(path, body, commandId, method = 'POST') {
    assertAlive();
    if (authorizedRequest) {
      const result = await authorizedRequest({ url: `${origin}/api/v1/widget/activity/${path}`, method, data: body === undefined ? undefined : JSON.stringify(body), contentType: 'application/json', dataType: 'json', headers: commandId ? { 'Idempotency-Key': commandId } : {} });
      assertAlive();
      return result;
    }
    const token = await getToken();
    assertAlive();
    if (typeof token !== 'string' || !token) throw new Error('Widget authentication unavailable');
    const response = await fetchImpl(`${origin}/api/v1/widget/activity/${path}`, {
      method, credentials: 'omit', referrerPolicy: 'no-referrer', signal: abort.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(commandId ? { 'Idempotency-Key': commandId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assertAlive();
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const error = new Error(failure.error?.message || 'Activity request failed');
      error.code = failure.error?.code;
      error.status = response.status;
      throw error;
    }
    const result = await response.json();
    assertAlive();
    return result;
  }
  async function sendPending() {
    assertAlive();
    if (running) throw new Error('Activity command is already in progress');
    if (!pending) throw new Error('No pending command');
    running = true;
    try {
      const result = await request('sessions', pending.body, pending.id);
      active = result.stopped_at ? null : result;
      pending = null;
      remember();
      return result;
    } catch (error) {
      if ([400, 401, 403, 404, 409, 422].includes(error.status)) { pending = null; remember(); }
      throw error;
    } finally { running = false; }
  }
  function command(body) {
    assertAlive();
    if (pending) return Promise.reject(new Error('Retry the pending command before starting another operation'));
    pending = { id: crypto.randomUUID(), body: structuredClone({ ...body, ...(body.action !== 'stop' ? { expected_session_id: active?.id || '' } : {}) }) };
    remember();
    return sendPending();
  }
  function stopSession(sessionId, result = '') {
    if (typeof sessionId !== 'string' || !sessionId) return Promise.reject(new Error('No active server session'));
    return command({ action: 'stop', session_id: sessionId, context: { task_result: result } });
  }
  return {
    startTask(context) {
      if (!Number.isSafeInteger(context?.task_id) || context.task_id <= 0) return Promise.reject(new Error('Real CRM task_id required'));
      return command({ action: 'work', context });
    },
    startImbox(dialogId, context = {}) {
      if (!String(dialogId).match(/^\d+$/)) return Promise.reject(new Error('Real Imbox dialog ID required'));
      return command({ action: 'activity', context: { ...context, activity_type: 'imbox', activity_name: `Imbox ${dialogId}` } });
    },
    startActivity(name, context = {}) { return command({ action: 'activity', context: { ...context, activity_type: 'other', activity_name: name } }); },
    startPause() { return command({ action: 'pause', context: {} }); },
    stop(result = '') { return stopSession(active?.id, result); },
    stopSession,
    retryPending: sendPending,
    async loadState() { const state = await request('state', undefined, undefined, 'GET'); active = state.current?.id ? state.current : null; return state; },
    loadHistory(query) { return request(`sessions?${new URLSearchParams(query)}`, undefined, undefined, 'GET'); },
    getState() { return { active: active ? structuredClone(active) : null, pending: !!pending, running }; },
    createManagementLink(appOrigin) { return request('browser-session', { app_origin: appOrigin }); },
    dispose() { disposed = true; abort.abort(); },
  };
}
