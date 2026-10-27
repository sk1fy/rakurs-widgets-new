import { createActivitySessionClient } from './session-client.js';

// authorizedAjax caches tokens; Core requires a fresh disposable JWT for each call.
export function createLiveActivityController({ context, apiOrigin, appOrigin, fetchImpl = fetch, documentImpl = document, locationImpl = location, storageImpl }) {
  const listeners = new Set();
  const abort = new AbortController();
  let storage = storageImpl;
  try { if (storage === undefined && Number(context.accountId) > 0 && Number(context.userId) > 0) storage = globalThis.sessionStorage; } catch { /* Browser storage can be disabled. */ }
  let widgetCode = context.widgetCode || 'rkrs_activity_panel';
  try { widgetCode = context.widget.get_settings?.().widget_code || widgetCode; } catch { /* SDK metadata is optional. */ }
  const identity = `${apiOrigin}:${widgetCode}:${context.accountId}:${context.userId}`;
  const completionKey = `rkrs-activity-completion:${identity}`;
  let clientId = crypto.randomUUID();
  try { const key = `rkrs-activity-client:${identity}`; const stored = storage?.getItem(key); if (/^[0-9a-f-]{36}$/.test(stored || '')) clientId = stored; else storage?.setItem(key, clientId); } catch { /* CAS still guards other tabs. */ }
  const state = { live: true, enabled: false, ready: false, completion: null, busy: false, scenario: 'tasks', tasks: [], dialogs: [], selectedTaskId: null, active: null, history: [], settings: { compact: false }, error: '', elapsedSeconds: 0, totalSeconds: 0, completedCount: null };
  let disposed = false, lastSync = 0, lastTasks = 0, serverSettings = {}, client, lastDialog = null, dialogTransition = null;
  const buttons = new Set();
  const requests = new Set();
  try {
    const saved = JSON.parse(storage?.getItem(completionKey) || 'null');
    if (saved && Number.isSafeInteger(saved.taskId) && saved.taskId > 0 && ['crm_pending', 'stop_pending'].includes(saved.phase) && typeof saved.result === 'string' && typeof saved.sessionId === 'string') state.completion = saved;
  } catch { /* Ignore malformed local recovery data. */ }
  function rememberCompletion(value) {
    if (disposed) throw new Error('Виджет закрыт');
    state.completion = value;
    try { if (value) storage?.setItem(completionKey, JSON.stringify(value)); else storage?.removeItem(completionKey); } catch { /* Server/CRM reads still recover the current task. */ }
  }
  const dialogEntities = new Map();
  const zone = globalThis.APP?.constant?.('account')?.timezone;
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { formatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  const parts = timestamp => Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  const dayKey = value => `${value.year}-${value.month}-${value.day}`;
  const snapshot = () => structuredClone({ ...state, pending: client?.getState().pending || false });
  const emit = () => { if (!disposed) listeners.forEach(fn => fn(snapshot())); };
  const sdkRequest = options => new Promise((resolve, reject) => {
    if (disposed) return reject(new Error('Виджет закрыт'));
    const ajax = context.widget.$?.ajax || globalThis.jQuery?.ajax || globalThis.$?.ajax;
    const clientUUID = context.widget.get_settings?.().oauth_client_uuid;
    if (typeof ajax !== 'function' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientUUID || '')) return reject(new Error('Недоступна авторизация amoCRM: нет OAuth UUID интеграции'));
    const fail = xhr => {
      const error = new Error(xhr?.responseJSON?.error?.message || 'Не удалось получить данные Activity');
      error.status = xhr?.status;
      error.code = xhr?.responseJSON?.error?.code;
      reject(error);
    };
    const tokenRequest = ajax({ url: `/ajax/v2/integrations/${encodeURIComponent(clientUUID)}/disposable_token`, method: 'GET', dataType: 'json', cache: false, timeout: 20000 });
    requests.add(tokenRequest);
    tokenRequest.done(value => {
      requests.delete(tokenRequest);
      if (disposed) return reject(new Error('Виджет закрыт'));
      if (typeof value?.token !== 'string' || !value.token) return reject(new Error('Не получен токен amoCRM'));
      let request;
      try { request = ajax({ ...options, type: options.method, timeout: 20000, processData: false, xhrFields: { withCredentials: false }, headers: { ...options.headers, 'X-Auth-Token': value.token } }); }
      catch { return reject(new Error('Не удалось отправить запрос Activity')); }
      requests.add(request);
      request.done(result => { requests.delete(request); if (disposed) reject(new Error('Виджет закрыт')); else resolve(result); }).fail(xhr => { requests.delete(request); fail(xhr); });
    }).fail(xhr => { requests.delete(tokenRequest); fail(xhr); });
  });
  try { client = createActivitySessionClient({ baseURL: apiOrigin, authorizedRequest: sdkRequest, storage, storageKey: `rkrs-activity-command:${identity}` }); }
  catch { state.error = 'Не настроен адрес API Activity (VITE_ACTIVITY_API_ORIGIN)'; }
  async function crm(path, options = {}) {
    if (disposed) throw new Error('Виджет закрыт');
    const response = await fetchImpl(`/api/v4/${path}`, { credentials: 'same-origin', signal: abort.signal, ...options, headers: { 'Content-Type': 'application/json' } });
    if (disposed) throw new Error('Виджет закрыт');
    if (!response.ok) { const error = new Error(`Ошибка amoCRM: ${response.status}`); error.status = response.status; throw error; }
    const result = response.status === 204 ? {} : await response.json();
    if (disposed) throw new Error('Виджет закрыт');
    return result;
  }
  function assertAvailable() {
    if (!state.ready) throw new Error('Обновите данные перед действием');
    if (!state.enabled) throw new Error('Панель задач отключена');
    if (client.getState().pending || state.completion) throw new Error('Сначала восстановите незавершённое действие кнопкой обновления');
  }
  function assertOwnedTask(task, id) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0 || task.id !== Number(id)) throw new Error('Некорректная задача amoCRM');
    if (task.responsible_user_id !== Number(context.userId)) throw new Error('Задача назначена другому сотруднику');
  }
  function validateText(value, label, required = false) {
    if (typeof value !== 'string' || (required && !value.trim()) || new TextEncoder().encode(value).length > 2000) throw new Error(`${label}: максимум 2000 байт`);
    return value.trim();
  }
  function applyCurrent(raw) {
    state.active = raw?.id ? { kind: raw.kind === 'work' ? 'tasks' : raw.kind === 'pause' ? 'pause' : raw.context.activity_type === 'imbox' ? 'imbox' : 'other', id: raw.kind === 'work' ? String(raw.context.task_id) : raw.context.activity_name?.replace(/^Imbox /, '') || raw.id, title: raw.context.task_name || raw.context.activity_name || 'Пауза', entityName: raw.context.entity_name, startedAt: raw.started_at * 1000, serverId: raw.id, clientId: raw.context.client_id } : null;
  }
  async function sync() {
    lastSync = Date.now();
    const own = await client.loadState();
    if (disposed) return;
    serverSettings = own.settings;
    state.enabled = own.enabled;
    applyCurrent(own.current);
    if (!own.enabled) state.error = 'Панель задач отключена для сотрудника в общих настройках';
    const today = dayKey(parts(Date.now())); let low = Math.floor(Date.now()/1000)-48*3600, high = Math.floor(Date.now()/1000); while (low < high) { const mid = Math.floor((low+high)/2); if (dayKey(parts(mid*1000)) < today) low=mid+1; else high=mid; } const midnight = new Date(low*1000);
    const from = Math.floor(midnight.getTime() / 1000), to = Math.floor(Date.now() / 1000);
    let cursor = '', items = [];
    do { const page = await client.loadHistory({ from, to, ...(cursor ? { cursor } : {}) }); items.push(...(page.items || [])); cursor = page.next_cursor || ''; } while (cursor && !disposed);
    state.history = items.filter(row => row.stopped_at).map(row => ({ id: row.id, kind: row.kind === 'work' ? 'tasks' : row.kind === 'pause' ? 'pause' : row.context.activity_type || 'other', title: row.context.task_name || row.context.activity_name || 'Пауза', seconds: row.work_time_seconds, finishedAt: row.stopped_at * 1000 }));
    state.totalSeconds = state.history.reduce((sum, row) => sum + row.seconds, 0);
    // Session history has no explicit completion fact. A result comment is not
    // proof of CRM completion, and an empty result is a valid completion.
    state.completedCount = null;
    state.ready = true;
    lastSync = Date.now();
  }
  async function loadTasks() {
    if (!Number.isSafeInteger(Number(context.userId)) || Number(context.userId) <= 0) throw new Error('Не определён сотрудник amoCRM');
    if (!state.enabled) { state.tasks = []; state.selectedTaskId = null; return; }
    let page = 1, rows = [];
    while (!disposed) {
      const result = await crm(`tasks?limit=250&page=${page}&filter[responsible_user_id]=${Number(context.userId)}&filter[is_completed]=0`);
      rows.push(...(result._embedded?.tasks || []));
      if (!result._links?.next) break;
      page++;
    }
    const related = new Map();
    const leadId = locationImpl.pathname.match(/\/leads\/detail\/(\d+)/)?.[1];
    if (serverSettings.include_related_deals && leadId) {
      const lead = await crm(`leads/${leadId}?with=contacts`);
      for (const type of ['contacts', 'companies']) for (const ref of lead._embedded?.[type] || []) {
        const entity = await crm(`${type}/${ref.id}?with=leads`);
        const label = entity.name || `${type} #${ref.id}`;
        related.set(`${type}:${ref.id}`, label);
        for (const linked of entity._embedded?.leads || []) if (String(linked.id) !== leadId) related.set(`leads:${linked.id}`, label);
      }
    }
    const priorities = serverSettings.priority_keys || ['urgent','overdue','overdue_no_time','today_no_time','today_timed','future'];
    const priority = row => { const due = new Date(row.complete_till * 1000), now = new Date(), dueParts = parts(due.getTime()), today = dayKey(dueParts) === dayKey(parts(now.getTime())), allDay = dueParts.hour === '23' && dueParts.minute === '59', overdue = due < now; const key = !allDay && today && (overdue || due-now <= 600000) ? 'urgent' : !allDay && overdue && !today ? 'overdue' : allDay && overdue && !today ? 'overdue_no_time' : allDay && today ? 'today_no_time' : !allDay && today ? 'today_timed' : 'future'; const index = priorities.indexOf(key); return index < 0 ? 99 : index; };
    state.tasks = rows.filter(row => row.responsible_user_id === Number(context.userId) && !row.is_completed).filter(row => serverSettings.consider_future_tasks || dayKey(parts(row.complete_till * 1000)) <= dayKey(parts(Date.now()))).sort((a,b) => priority(a)-priority(b) || a.complete_till-b.complete_till).map(row => ({ id: String(row.id), title: row.text || `Задача ${row.id}`, entityName: row.entity_id ? `${row.entity_type} #${row.entity_id}` : '', related: related.get(`${row.entity_type}:${row.entity_id}`) || '', type: String(row.task_type_id), dueLabel: new Date(row.complete_till * 1000).toLocaleString('ru-RU'), overdue: row.complete_till * 1000 < Date.now(), completed: false }));
    if (!state.tasks.some(row => row.id === state.selectedTaskId)) state.selectedTaskId = state.tasks[0]?.id || null;
    lastTasks = Date.now();
  }
  async function run(action) {
    if (disposed || state.busy || !client) return;
    state.busy = true; state.error = ''; emit();
    try { await action(); return !disposed; } catch (error) { if (!disposed) { state.error = state.completion?.phase === 'stop_pending' ? `Задача завершена в amoCRM; остановка учёта времени не подтверждена. Нажмите обновление для восстановления. ${error.message}` : state.completion ? `Завершение задачи не подтверждено. Обновление проверит amoCRM и восстановит учёт времени. ${error.message}` : error.message; state.ready = false; } return false; } finally { if (!disposed) { state.busy = false; emit(); } }
  }
  async function taskContext(id) {
    const task = await crm(`tasks/${Number(id)}`);
    assertOwnedTask(task, id);
    if (task.is_completed) throw new Error('Задача уже завершена');
    const value = { client_id: clientId, task_id: task.id, task_name: task.text || '', task_type_id: task.task_type_id, entity_id: task.entity_id, entity_type: task.entity_type };
    if (['leads','contacts','companies','customers'].includes(task.entity_type) && task.entity_id) {
      const entity = await crm(`${task.entity_type}/${task.entity_id}`);
      Object.assign(value, { entity_name: entity.name, pipeline_id: entity.pipeline_id || 0, status_id: entity.status_id || 0 });
      if (entity.pipeline_id) {
        const pipeline = await crm(`leads/pipelines/${entity.pipeline_id}`);
        const status = pipeline._embedded?.statuses?.find(row => row.id === entity.status_id);
        Object.assign(value, { pipeline_name: pipeline.name, status_name: status?.name || '', status_color: status?.color || '' });
      }
    }
    const account = await crm('account?with=task_types');
    value.task_type_name = account._embedded?.task_types?.find(row => row.id === task.task_type_id)?.name || '';
    return value;
  }
  function scanDOM() {
    if (disposed) return;
    for (const button of buttons) if (!button.isConnected) buttons.delete(button);
    state.dialogs = [...documentImpl.querySelectorAll('.notification--talk[data-id]')].map(node => { const link = node.querySelector('a[href*="/leads/detail/"]'); const entityId = link?.getAttribute('href')?.match(/\/leads\/detail\/(\d+)/)?.[1]; if (entityId) dialogEntities.set(node.dataset.id, Number(entityId)); return ({ id: node.dataset.id, name: node.querySelector('.notification-inner__title_message_title, .notification__title, .notification__name')?.textContent?.trim() || `Imbox ${node.dataset.id}`, preview: '', channel: 'Imbox' }); }).filter(row => /^\d+$/.test(row.id));
    documentImpl.querySelectorAll('.feed-note-wrapper-task[data-id]').forEach(node => {
      const existing = node.querySelector('[data-rkrs-live-start]');
      if (!state.enabled || !state.ready || state.completion || client?.getState().pending) { existing?.remove(); return; }
      if (existing || !/^\d+$/.test(node.dataset.id)) return;
      const button = documentImpl.createElement('button'); button.type = 'button'; button.dataset.rkrsLiveStart = ''; button.textContent = 'Начать учёт времени';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); controller.startTask(node.dataset.id); });
      node.append(button); buttons.add(button);
    });
  }
  async function startImboxSession(id) {
    if (!state.dialogs.some(row => row.id === String(id))) throw new Error('Откройте диалог Imbox'); const details = { client_id: clientId }; const entityId = dialogEntities.get(String(id)); if (entityId) { const entity = await crm(`leads/${entityId}`); Object.assign(details, { entity_type: 'leads', entity_id: entityId, entity_name: entity.name, pipeline_id: entity.pipeline_id || 0, status_id: entity.status_id || 0 }); } await client.startImbox(id, details);
  }
  async function resumeCompletion() {
    const intent = state.completion;
    if (!intent) return;
    if (intent.phase === 'crm_pending') {
      const task = await crm(`tasks/${intent.taskId}`);
      assertOwnedTask(task, intent.taskId);
      if (!task.is_completed) {
        const own = await client.loadState();
        if (disposed) return;
        state.enabled = own.enabled;
        applyCurrent(own.current);
        if (!state.ready || !state.enabled) throw new Error('Панель отключена: задача не была завершена');
        await crm(`tasks/${intent.taskId}`, { method: 'PATCH', body: JSON.stringify({ is_completed: true, result: { text: intent.result } }) });
      }
      rememberCompletion({ ...intent, phase: 'stop_pending' });
    }
    const completed = state.completion;
    if (completed.sessionId) {
      const own = await client.loadState();
      if (disposed) return;
      applyCurrent(own.current);
      // The captured interval may already have been stopped/replaced in another
      // tab. Never stop whichever different interval is current now.
      if (own.current?.id === completed.sessionId) await client.stopSession(completed.sessionId, completed.result);
    }
    rememberCompletion(null);
  }
  async function refresh() {
    if (client.getState().pending) {
      try { await client.retryPending(); }
      catch (error) { if (error.status !== 409) throw error; }
    }
    await sync();
    if (state.completion) { await resumeCompletion(); await sync(); }
    await loadTasks();
  }
  const controller = {
    getSnapshot: snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    selectScenario(value) { state.scenario = value; emit(); }, selectTask(id) { state.selectedTaskId = id; emit(); },
    startTask(id = state.selectedTaskId) { return run(async () => { assertAvailable(); await client.startTask(await taskContext(id)); await sync(); }); },
    startOther(name) { return run(async () => { assertAvailable(); name = validateText(name, 'Название активности', true); await client.startActivity(name, { client_id: clientId }); await sync(); }); },
    startImbox(id) { return run(async () => { assertAvailable(); await startImboxSession(id); lastDialog = String(id); await sync(); }); },
    pause() { return run(async () => { assertAvailable(); await client.startPause(); await sync(); }); },
    stop() { return run(async () => {
      if (client.getState().pending) throw new Error('Сначала восстановите незавершённую команду кнопкой обновления');
      // An explicit stop may abandon an unconfirmed CRM completion; it never
      // retries the CRM write and still closes only the acknowledged interval.
      await client.stop();
      rememberCompletion(null);
      await sync();
    }); },
    completeTask(id, result = '') { return run(async () => {
      assertAvailable();
      result = validateText(result, 'Результат задачи');
      const task = await crm(`tasks/${Number(id)}`);
      assertOwnedTask(task, id);
      const own = await client.loadState();
      if (disposed) return;
      applyCurrent(own.current);
      state.enabled = own.enabled;
      if (!state.enabled) throw new Error('Панель задач отключена');
      const sessionId = state.active?.kind === 'tasks' && state.active.id === String(id) ? state.active.serverId : '';
      if (task.is_completed && !sessionId) throw new Error('Задача уже завершена');
      // Persist intent before the first CRM mutation. Reload/retry first reads
      // the task, so a lost PATCH response does not blindly repeat completion.
      rememberCompletion({ taskId: Number(id), result: task.is_completed ? task.result?.text || result : result, sessionId, phase: 'crm_pending' });
      await resumeCompletion();
      await sync();
      await loadTasks();
    }); },
    refresh() { return run(refresh); },
    updateSettings(patch) { state.settings = { ...state.settings, ...patch }; emit(); }, reset() {},
    openManagement() {
      const popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null;
      return run(async () => { try { const result = await client.createManagementLink(appOrigin); const url = new URL(result.url); if (url.origin !== new URL(appOrigin).origin) throw new Error('Некорректный адрес настроек'); if (!popup) throw new Error('Разрешите открытие окна настроек'); popup.location.replace(url.href); } catch (error) { popup?.close(); throw error; } });
    },
    tick() {
      if (disposed) return;
      state.elapsedSeconds = state.active ? Math.max(0, (Date.now() - state.active.startedAt) / 1000) : 0;
      scanDOM(); emit();
      const dialog = locationImpl.pathname.match(/\/imbox\/(\d+)/)?.[1];
      if (lastDialog === null && state.active?.kind === 'imbox' && state.active.clientId === clientId && state.active.id === dialog) lastDialog = dialog;
      if (!state.busy && (state.ready || dialogTransition?.pending) && state.enabled && !state.completion && !documentImpl.hidden) {
        // A failed automatic write keeps its original command identity even if
        // navigation changes while its response is missing. Resolve it first.
        if (!dialogTransition && !client.getState().pending && dialog !== lastDialog) {
          const ownsImbox = state.active?.kind === 'imbox' && state.active.clientId === clientId;
          if (dialog && (!state.active || ownsImbox) && state.dialogs.some(row => row.id === dialog))
            dialogTransition = { target: dialog, action: 'start', failures: 0, retryAt: 0, pending: false };
          else if (!dialog && ownsImbox)
            dialogTransition = { target: dialog, action: 'stop', failures: 0, retryAt: 0, pending: false };
          else if (!dialog) lastDialog = dialog; // No owned interval needs a write.
        }
        const transition = dialogTransition;
        if (transition && Date.now() >= transition.retryAt) {
          // If no command was submitted, a route change supersedes the retry.
          const ownsCurrent = state.active?.kind === 'imbox' && state.active.clientId === clientId;
          if (!transition.pending && (transition.target !== dialog || (state.active && !ownsCurrent))) dialogTransition = null;
          else run(async () => {
            try {
              if (transition.pending) await client.retryPending();
              else if (transition.action === 'start') await startImboxSession(transition.target);
              else await client.stop();
              // Acknowledge only the successful server write, not DOM discovery
              // or a subsequent read. Manual stop on this route stays stopped.
              lastDialog = transition.target;
              dialogTransition = null;
              await sync();
            } catch (error) {
              if (dialogTransition === transition) {
                transition.pending = client.getState().pending;
                transition.failures++;
                transition.retryAt = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(transition.failures - 1, 5));
              }
              throw error;
            }
          });
        }
      }
      if (!state.busy && !documentImpl.hidden && Date.now()-lastSync > 15000) run(async () => { await sync(); if (!client.getState().pending && !state.completion && Date.now()-lastTasks > 60000) await loadTasks(); });
    },
    dispose() { disposed = true; abort.abort(); requests.forEach(request => { try { request.abort?.(); } catch { /* Continue disposing other SDK requests. */ } }); requests.clear(); client?.dispose(); buttons.forEach(button => button.remove()); listeners.clear(); },
  };
  if (client) run(async () => { await sync(); await loadTasks(); });
  return controller;
}
