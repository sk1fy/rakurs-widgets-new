import { createActivitySessionClient } from './session-client.js';

const playIcon = '<svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true"><path d="M1.5 2v10l9-5-9-5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const stopIcon = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill="currentColor"/></svg>';
const cardActions = {
  start: { icon: playIcon, label: 'Взять в работу' },
  switch: { icon: playIcon, label: 'Переключиться на задачу' },
  stop: { icon: stopIcon, label: 'Остановить задачу' },
  blocked: { icon: '', label: 'Завершите Imbox' },
};
const entityUrl = (type, id) => (['leads', 'contacts', 'companies', 'customers'].includes(type) && id ? `/${type}/detail/${id}` : '');

// authorizedAjax caches tokens; Core requires a fresh disposable JWT for each call.
export function createLiveActivityController({ context, apiOrigin, appOrigin, documentImpl = document, locationImpl = location, storageImpl, broadcastImpl = globalThis.BroadcastChannel }) {
  const listeners = new Set();
  let storage = storageImpl;
  try { if (storage === undefined && Number(context.accountId) > 0 && Number(context.userId) > 0) storage = globalThis.sessionStorage; } catch { /* Browser storage can be disabled. */ }
  let widgetCode = context.widgetCode || 'rkrs_activity_panel';
  try { widgetCode = context.widget.get_settings?.().widget_code || widgetCode; } catch { /* SDK metadata is optional. */ }
  const identity = `${apiOrigin}:${widgetCode}:${context.accountId}:${context.userId}`;
  const completionKey = `rkrs-activity-completion:${identity}`;
  let clientId = crypto.randomUUID();
  try { const key = `rkrs-activity-client:${identity}`; const stored = storage?.getItem(key); if (/^[0-9a-f-]{36}$/.test(stored || '')) clientId = stored; else storage?.setItem(key, clientId); } catch { /* CAS still guards other tabs. */ }
  // View preferences and the last known enrolment outlive the tab; server state stays authoritative.
  let prefs = storageImpl;
  try { if (prefs === undefined) prefs = globalThis.localStorage; } catch { /* Preferences are optional. */ }
  const viewKey = `rkrs-activity-view:${identity}`;
  let view = {};
  try { view = JSON.parse(prefs?.getItem(viewKey) || '{}') || {}; } catch { /* Ignore malformed preferences. */ }
  function rememberView(patch) {
    view = { ...view, ...patch };
    try { prefs?.setItem(viewKey, JSON.stringify(view)); } catch { /* Preferences stay in memory. */ }
  }
  const state = { live: true, enabled: view.enabled === true, ready: false, completion: null, busy: false, scenario: 'tasks', tasks: [], dialogs: [], selectedTaskId: null, active: null, history: [], settings: { compact: view.compact === true }, error: '', readWarning: '', historyStale: true, recoveryRequired: false, queue: { complete: true, stale: false, fetchedAt: 0, warning: false, note: '' }, elapsedSeconds: 0, totalSeconds: 0, completedCount: null };
  let ownTaskIds = new Set(), disposed = false, lastSync = 0, lastTasks = 0, tasksRetryAt = 0, serverSettings = {}, client, lastDialog = null, dialogTransition = null, queueLead = '', closedSeconds = 0, dayStart = 0;
  let revision = 0, managementPending = false, stateInvalidated = false, invalidationQueued = false;
  const reads = Object.fromEntries(['state', 'history', 'queue'].map(name => [name, { token: 0, current: null }]));
  reads.history.nextAt = 0;
  const reconciliationKey = `rkrs-activity-reconcile:${identity}`;
  try { state.recoveryRequired = storage?.getItem(reconciliationKey) === 'true'; } catch {}
  function requireReconciliation(value) {
    state.recoveryRequired = value;
    try { if (value) storage?.setItem(reconciliationKey, 'true'); else storage?.removeItem(reconciliationKey); } catch {}
  }
  function invalidateReads() { revision++; }
  function readCurrent(name, ticket) {
    return !disposed && revision === ticket.revision && reads[name].current === ticket && reads[name].token === ticket.token && !state.busy && (ticket.metadata || (!client.getState().pending && !state.recoveryRequired));
  }
  function read(name, scope, action, metadata = false) {
    if (disposed || state.busy || (!metadata && (client.getState().pending || state.recoveryRequired))) return Promise.resolve(false);
    const slot = reads[name];
    if (slot.current?.revision === revision && slot.current.scope === scope) return slot.current.promise;
    const ticket = { revision, token: ++slot.token, scope, metadata };
    slot.current = ticket;
    ticket.promise = (async () => {
      try { return await action(ticket); }
      catch (error) { if (readCurrent(name, ticket)) { state.readWarning = error.message; if (!state.ready) state.error = error.message; emit(); } return false; }
      finally { if (slot.current === ticket) slot.current = null; }
    })();
    return ticket.promise;
  }
  let channel = null;
  try {
    if (typeof broadcastImpl === 'function') {
      channel = new broadcastImpl(`rkrs-activity:${identity}`);
      channel.onmessage = event => {
        if (disposed || !['session-changed', 'changed'].includes(event.data?.type)) return;
        stateInvalidated = true;
        for (const name of ['state', 'history']) { reads[name].token++; reads[name].current = null; }
        state.historyStale = true;
        emit();
        if (!invalidationQueued) {
          invalidationQueued = true;
          queueMicrotask(() => { invalidationQueued = false; if (!disposed && !state.busy) void refreshBackground(false); });
        }
      };
    }
  } catch { channel = null; }
  const announce = () => { try { if (!disposed) channel?.postMessage({ type: 'session-changed' }); } catch { /* Other tabs still poll. */ } };
  const onVisible = () => { if (!disposed && !documentImpl.hidden) controller.tick(); };
  const windowRef = documentImpl.defaultView;
  documentImpl.addEventListener?.('visibilitychange', onVisible);
  windowRef?.addEventListener?.('focus', onVisible);
  // amoCRM's own completion button: a click is only intent, CRM confirms it.
  const nativeCompletion = '.card-task__actions .js-complete-task, .feed-note-wrapper-task .js-switcher-complete, .js-task-result-button, .card-task__button';
  const completionChecks = new Map();
  const onNativeComplete = event => {
    const target = event.target?.nodeType === 3 ? event.target.parentNode : event.target;
    const id = target?.closest?.(nativeCompletion)?.closest?.('.feed-note-wrapper-task[data-id]')?.dataset?.id;
    if (!disposed && state.active?.kind === 'tasks' && state.active.id === id) completionChecks.set(id, { until: Date.now() + 180000, next: Date.now() + 2000 });
  };
  documentImpl.addEventListener?.('click', onNativeComplete, true);
  const entityLabels = { leads: 'Сделка', contacts: 'Контакт', companies: 'Компания', customers: 'Покупатель' };
  const errorMessages = { permission_denied: 'Нет доступа: задача другого сотрудника или панель отключена', not_found: 'Задача или карточка не найдена в amoCRM', resource_exhausted: 'amoCRM временно ограничила запросы, повторите позже', reauth_required: 'Интеграции нужна повторная авторизация в amoCRM' };
  // Local validation failures are not uncertain writes: the panel stays usable.
  const invalid = message => Object.assign(new Error(message), { keepReady: true });
  const requests = new Set();
  try {
    const saved = JSON.parse(storage?.getItem(completionKey) || 'null');
    if (saved && Number.isSafeInteger(saved.taskId) && saved.taskId > 0 && ['crm_pending', 'stop_pending'].includes(saved.phase) && typeof saved.result === 'string' && typeof saved.sessionId === 'string') state.completion = saved;
  } catch { /* Ignore malformed local recovery data. */ }
  function rememberCompletion(value) {
    if (disposed) throw new Error('Виджет закрыт');
    if (state.completion && !value) lastTasks = 0;
    state.completion = value;
    try { if (value) storage?.setItem(completionKey, JSON.stringify(value)); else storage?.removeItem(completionKey); } catch { /* Server/CRM reads still recover the current task. */ }
  }
  const dialogEntities = new Map();
  const zone = globalThis.APP?.constant?.('account')?.timezone;
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { formatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  const parts = timestamp => Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  const dayKey = value => `${value.year}-${value.month}-${value.day}`;
  // Employees outside the panel settings get no bar unless they still own unfinished work.
  const hidden = () => Boolean(client) && !state.enabled && !state.active && !state.completion && !client.getState().pending && !state.recoveryRequired;
  const snapshot = () => structuredClone({ ...state, invalidated: stateInvalidated, pending: client?.getState().pending || false, hidden: hidden() });
  const emit = () => { if (!disposed) listeners.forEach(fn => fn(snapshot())); };
  const sdkRequest = options => new Promise((resolve, reject) => {
    if (disposed) return reject(new Error('Виджет закрыт'));
    const ajax = context.widget.$?.ajax || globalThis.jQuery?.ajax || globalThis.$?.ajax;
    const clientUUID = context.widget.get_settings?.().oauth_client_uuid;
    if (typeof ajax !== 'function' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientUUID || '')) return reject(new Error('Недоступна авторизация amoCRM: нет OAuth UUID интеграции'));
    const fail = xhr => {
      const code = xhr?.responseJSON?.error?.code;
      const error = new Error(errorMessages[code] || xhr?.responseJSON?.error?.message || 'Не удалось получить данные Activity');
      error.status = xhr?.status;
      error.code = code;
      error.retryAfter = Number(xhr?.getResponseHeader?.('Retry-After')) || 0;
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
  try { client = createActivitySessionClient({ baseURL: apiOrigin, authorizedRequest: sdkRequest, storage, storageKey: `rkrs-activity-command:${identity}`, onCommand: announce }); }
  catch { state.error = 'Не настроен адрес API Activity (VITE_ACTIVITY_API_ORIGIN)'; }
  function assertAvailable() {
    if (state.recoveryRequired || stateInvalidated) throw invalid('Обновите состояние перед действием');
    if (!state.ready) throw new Error('Обновите данные перед действием');
    if (!state.enabled) throw invalid('Панель задач отключена');
    if (client.getState().pending || state.completion) throw invalid('Сначала восстановите незавершённое действие кнопкой обновления');
  }
  function assertOwnedTask(task, id) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0 || task.id !== Number(id)) throw invalid('Некорректная задача amoCRM');
    if (task.responsible_user_id !== Number(context.userId)) throw invalid('Задача назначена другому сотруднику');
  }
  function validateText(value, label, required = false) {
    if (typeof value !== 'string' || (required && !value.trim())) throw invalid(`${label}: заполните поле`);
    if (new TextEncoder().encode(value).length > 2000) throw invalid(`${label}: максимум 2000 байт`);
    return value.trim();
  }
  // The server names cards best effort; an unresolved name keeps the card label.
  function entityName(row) {
    if (!row.entity_id || !entityLabels[row.entity_type]) return '';
    return row.entity_name || `${entityLabels[row.entity_type]} #${row.entity_id}`;
  }
  // Completeness and freshness come from the shared server snapshot and are
  // shown with the list, never as a blocking error.
  function describeQueue(meta) {
    const notes = [];
    if (!meta.complete) notes.push('Показаны не все задачи');
    if (meta.stale) notes.push(meta.errorCode === 'resource_exhausted' ? 'Данные могут быть устаревшими: amoCRM временно ограничила запросы' : 'Данные могут быть устаревшими');
    if (meta.fetchedAt) { const at = parts(meta.fetchedAt); notes.push(`обновлено ${dayKey(at) === dayKey(parts(Date.now())) ? '' : `${at.day}.${at.month} `}${at.hour}:${at.minute}`); }
    state.queue = { ...meta, warning: !meta.complete || meta.stale, note: notes.join(' · ') };
  }
  function dueLabel(timestamp) {
    const due = parts(timestamp), now = parts(Date.now());
    const day = dayKey(due) === dayKey(now) ? 'Сегодня' : `${due.day}.${due.month}${due.year === now.year ? '' : `.${due.year}`}`;
    return due.hour === '23' && due.minute === '59' ? day : `${day}, ${due.hour}:${due.minute}`;
  }
  function dueDate(timestamp) {
    const due = parts(timestamp);
    return `${due.day}.${due.month}.${due.year}`;
  }
  function dueTime(row) {
    const due = parts(row.complete_till * 1000);
    if (due.hour === '23' && due.minute === '59') return 'Весь день';
    const start = `${due.hour}:${due.minute}`;
    if (!(row.duration > 0)) return start;
    const end = parts((row.complete_till + row.duration) * 1000);
    return `${start}-${end.hour}:${end.minute}`;
  }
  function applyCurrent(raw) {
    const previous = state.active?.serverId;
    state.active = raw?.id ? { kind: raw.kind === 'work' ? 'tasks' : raw.kind === 'pause' ? 'pause' : raw.context.activity_type === 'imbox' ? 'imbox' : 'other', id: raw.kind === 'work' ? String(raw.context.task_id) : raw.context.activity_name?.replace(/^Imbox /, '') || raw.id, title: raw.context.task_name || raw.context.activity_name || 'Пауза', entityName: raw.context.entity_name, url: entityUrl(raw.context.entity_type, raw.context.entity_id), startedAt: raw.started_at * 1000, serverId: raw.id, clientId: raw.context.client_id } : null;
    // A newly started task (here, from a card or in another tab) becomes the
    // selection; a later different selection is the user's next task.
    if (state.active?.kind === 'tasks' && state.active.serverId !== previous) state.selectedTaskId = state.active.id;
  }
  function applyState(own) {
    if (!state.ready) state.error = '';
    const previous = state.active?.serverId;
    serverSettings = own.settings || {};
    state.enabled = own.enabled;
    if (view.enabled !== own.enabled) rememberView({ enabled: own.enabled });
    applyCurrent(own.current);
    if (previous !== state.active?.serverId) state.historyStale = true;
    state.ready = true;
    stateInvalidated = false;
    updateTotal();
    scanDOM(); emit();
  }
  function publishReceipt(receipt) {
    if (disposed) return;
    if (!receipt.stopped_at) applyCurrent(receipt);
    else if (state.active?.serverId === receipt.id) applyCurrent(null);
    state.historyStale = true;
    updateTotal();
    emit();
  }
  async function ownedState() {
    const owner = revision, token = reads.state.token;
    const own = await client.loadState();
    if (disposed || !state.busy || owner !== revision || token !== reads.state.token) throw invalid('Действие уже завершено');
    applyState(own);
    lastSync = Date.now();
    return own;
  }
  function sync(metadata = false) {
    return read('state', '', async ticket => {
      lastSync = Date.now();
      const own = await client.loadState();
      if (!readCurrent('state', ticket)) return false;
      if (client.getState().pending || state.recoveryRequired) {
        state.enabled = own.enabled; serverSettings = own.settings || {}; emit();
      } else { applyState(own); state.readWarning = ''; }
      return true;
    }, metadata);
  }
  function loadHistory() {
    const today = dayKey(parts(Date.now()));
    return read('history', today, async ticket => {
      reads.history.nextAt = Date.now() + 90000;
      state.historyStale = true; emit();
      if (!state.enabled && !state.active) {
        state.history = []; closedSeconds = 0; state.historyStale = false; updateTotal(); emit();
        return true;
      }
      let low = Math.floor(Date.now()/1000)-48*3600, high = Math.floor(Date.now()/1000);
      while (low < high) { const mid = Math.floor((low+high)/2); if (dayKey(parts(mid*1000)) < today) low=mid+1; else high=mid; }
      const from = low, to = Math.floor(Date.now()/1000);
      let cursor = '', items = [];
      do {
        const page = await client.loadHistory({ from, to, ...(cursor ? { cursor } : {}) });
        if (!readCurrent('history', ticket) || dayKey(parts(Date.now())) !== today) return false;
        items.push(...(page.items || [])); cursor = page.next_cursor || '';
      } while (cursor);
      const closed = items.filter(row => row.stopped_at);
      state.history = closed.map(row => ({ id: row.id, kind: row.kind === 'work' ? 'tasks' : row.kind === 'pause' ? 'pause' : row.context.activity_type || 'other', title: row.context.task_name || row.context.activity_name || 'Пауза', seconds: Math.max(0, row.stopped_at - row.started_at), finishedAt: row.stopped_at * 1000 }));
      closedSeconds = closed.filter(row => row.kind !== 'pause').reduce((sum, row) => sum + Math.max(0, Math.min(row.stopped_at, to) - Math.max(row.started_at, from)), 0);
      dayStart = from * 1000;
      state.historyStale = false;
      state.completedCount = null;
      updateTotal(); emit();
      return true;
    });
  }
  async function refreshBackground(includeQueue = true) {
    if (!await sync() || disposed) return false;
    const results = await Promise.all([...(includeQueue || state.historyStale || Date.now() >= reads.history.nextAt ? [loadHistory()] : []), ...(includeQueue && Date.now() >= tasksRetryAt ? [loadTasks()] : [])]);
    return results.every(Boolean);
  }
  function refreshProjections() {
    if (disposed || !state.ready || client.getState().pending || state.recoveryRequired) return;
    if (state.historyStale) void loadHistory();
    if ((!lastTasks || Date.now() - lastTasks >= 60000) && Date.now() >= tasksRetryAt) void loadTasks();
  }
  // Today's total includes the running interval from midnight on; pauses are not work.
  function updateTotal() {
    const running = state.active && state.active.kind !== 'pause' ? Math.max(0, Date.now() - Math.max(state.active.startedAt, dayStart)) / 1000 : 0;
    state.totalSeconds = closedSeconds + Math.floor(running);
  }
  // Stops the interval of a task completed outside the panel (amoCRM's own
  // button, another device). Only CRM's record proves the completion, and only
  // the very interval observed for that task is closed.
  async function reconcileCompletedTask(id) {
    const active = state.active, observed = revision;
    if (active?.kind !== 'tasks' || active.id !== id || state.busy || client.getState().pending || state.completion || state.recoveryRequired) return false;
    let task;
    try { task = await client.loadTask(Number(id)); } catch { return false; }
    if (disposed || revision !== observed || !task.is_completed || state.active?.serverId !== active.serverId) return false;
    return run(async () => {
      const own = await ownedState();
      if (own.current?.id !== active.serverId) return;
      const result = typeof task.result_text === 'string' && new TextEncoder().encode(task.result_text).length <= 2000 ? task.result_text : '';
      publishReceipt(await client.stopSession(active.serverId, result));
    });
  }
  function loadTasks() {
    const leadId = locationImpl.pathname.match(/\/leads\/detail\/(\d+)/)?.[1] || '';
    return read('queue', `${serverSettings.include_related_deals ? leadId : ''}`, ticket => loadQueue(leadId, ticket));
  }
  async function loadQueue(leadId, ticket) {
    if (!Number.isSafeInteger(Number(context.userId)) || Number(context.userId) <= 0) throw new Error('Не определён сотрудник amoCRM');
    if (!state.enabled) { state.tasks = []; ownTaskIds = new Set(); state.selectedTaskId = null; describeQueue({ complete: true, stale: false, errorCode: '', fetchedAt: 0 }); emit(); return true; }
    let queue;
    // The server shares one snapshot per employee across tabs and labels tasks
    // related to the open lead itself.
    try { queue = await client.loadTasks(serverSettings.include_related_deals ? leadId : undefined); }
    catch (error) {
      // amoCRM is busy: keep the last queue and wait for the server's delay.
      if (readCurrent('queue', ticket) && [429, 503].includes(error.status)) { tasksRetryAt = Date.now() + Math.max(error.retryAfter, 5) * 1000; if (lastTasks) { error.keepReady = true; describeQueue({ ...state.queue, stale: true, errorCode: error.code || '' }); } }
      throw error;
    }
    if (!readCurrent('queue', ticket) || (serverSettings.include_related_deals && (locationImpl.pathname.match(/\/leads\/detail\/(\d+)/)?.[1] || '') !== leadId)) return false;
    queueLead = leadId;
    state.relatedEnabled = Boolean(serverSettings.include_related_deals && queueLead);
    tasksRetryAt = queue.retry_after_seconds > 0 ? Date.now() + queue.retry_after_seconds * 1000 : 0;
    const rows = queue.tasks || [];
    // The server returns only this employee's unfinished tasks; a queue row carries no owner field.
    ownTaskIds = new Set(rows.map(row => String(row.id)));
    const priorities = serverSettings.priority_keys || ['urgent','overdue','overdue_no_time','today_no_time','today_timed','future'];
    const priority = row => { const due = new Date(row.complete_till * 1000), now = new Date(), dueParts = parts(due.getTime()), today = dayKey(dueParts) === dayKey(parts(now.getTime())), allDay = dueParts.hour === '23' && dueParts.minute === '59', overdue = due < now; const key = !allDay && today && (overdue || due-now <= 600000) ? 'urgent' : !allDay && overdue && !today ? 'overdue' : allDay && overdue && !today ? 'overdue_no_time' : allDay && today ? 'today_no_time' : !allDay && today ? 'today_timed' : 'future'; const index = priorities.indexOf(key); return index < 0 ? 99 : index; };
    const visible = rows.filter(row => serverSettings.consider_future_tasks || dayKey(parts(row.complete_till * 1000)) <= dayKey(parts(Date.now())));
    state.tasks = visible.sort((a,b) => priority(a)-priority(b) || a.complete_till-b.complete_till).map(row => ({ id: String(row.id), title: row.text || `Задача ${row.id}`, entityName: entityName(row), related: row.related || '', type: row.task_type_name || '', url: entityUrl(row.entity_type, row.entity_id), dueLabel: dueLabel(row.complete_till * 1000), dueDate: dueDate(row.complete_till * 1000), dueTime: dueTime(row), overdue: row.complete_till * 1000 < Date.now(), completed: false }));
    // An older server omits the metadata: its queue is a complete live read.
    describeQueue({ complete: queue.complete !== false, stale: queue.stale === true, errorCode: queue.error_code || '', fetchedAt: queue.fetched_at > 0 ? queue.fetched_at * 1000 : 0 });
    if (!state.tasks.some(row => row.id === state.selectedTaskId)) state.selectedTaskId = state.tasks[0]?.id || null;
    lastTasks = Date.now();
    scanDOM(); emit();
    if (state.active?.kind === 'tasks' && !rows.some(row => String(row.id) === state.active.id)) await reconcileCompletedTask(state.active.id);
    return true;
  }
  async function run(action) {
    if (disposed || state.busy || !client) return false;
    invalidateReads();
    state.busy = true; state.error = ''; emit();
    try { return await action() !== false && !disposed; }
    catch (error) {
      if (!disposed) {
        if (error.status === 409) {
          requireReconciliation(true);
          try { await ownedState(); requireReconciliation(false); } catch (readError) { state.readWarning = readError.message; }
        }
        state.error = state.completion?.phase === 'stop_pending' ? `Задача завершена в amoCRM; остановка учёта времени не подтверждена. Нажмите обновление для восстановления. ${error.message}` : state.completion ? `Завершение задачи не подтверждено. Обновление проверит amoCRM и восстановит учёт времени. ${error.message}` : error.message;
      }
      return false;
    } finally {
      invalidateReads();
      if (!disposed) { state.busy = false; scanDOM(); emit(); refreshProjections(); if (stateInvalidated) void refreshBackground(false); }
    }
  }
  async function taskContext(id) {
    const task = await client.loadTask(Number(id), { context: true });
    assertOwnedTask(task, id);
    if (task.is_completed) { lastTasks = 0; throw invalid('Задача уже завершена. Обновите очередь.'); }
    const value = { client_id: clientId, task_id: task.id, task_name: task.text || '', task_type_id: task.task_type_id, entity_id: task.entity_id, entity_type: task.entity_type };
    const entity = task.entity;
    // The card summary is best effort on the server; without it only IDs are recorded.
    if (['leads','contacts','companies','customers'].includes(task.entity_type) && task.entity_id && entity?.id === task.entity_id) {
      Object.assign(value, { entity_name: entity.name, pipeline_id: entity.pipeline_id || 0, status_id: entity.status_id || 0 });
      if (entity.pipeline_id) Object.assign(value, { pipeline_name: entity.pipeline_name || '', status_name: entity.status_name || '', status_color: entity.status_color || '' });
    }
    value.task_type_name = task.task_type_name || '';
    return value;
  }
  function scanDOM() {
    if (disposed) return;
    state.dialogs = [...documentImpl.querySelectorAll('.notification--talk[data-id]')].map(node => { const link = node.querySelector('a[href*="/leads/detail/"]'); const entityId = link?.getAttribute('href')?.match(/\/leads\/detail\/(\d+)/)?.[1]; if (entityId) dialogEntities.set(node.dataset.id, Number(entityId)); return ({ id: node.dataset.id, name: node.querySelector('.notification-inner__title_message_title, .notification__title, .notification__name')?.textContent?.trim() || `Imbox ${node.dataset.id}`, preview: '', channel: 'Imbox' }); }).filter(row => /^\d+$/.test(row.id));
    documentImpl.querySelectorAll('.feed-note-wrapper-task[data-id]').forEach(renderCardAction);
  }
  function clearCardAction(node) {
    node.querySelector('[data-rkrs-ap-card-action]')?.remove();
    node.querySelector('.rkrs-ap-task-card-content')?.classList.remove('rkrs-ap-task-card-content');
    node.querySelector('.rkrs-ap-active-task-card')?.classList.remove('rkrs-ap-active-task-card');
  }
  function cardMode(id) {
    if (state.active?.kind === 'tasks' && state.active.id === id) return 'stop';
    if (state.active?.kind === 'imbox') return 'blocked';
    return state.active && state.active.kind !== 'pause' ? 'switch' : 'start';
  }
  // rkrs-ap DOM hooks are separate from rkrs_activity's legacy card cleanup.
  // Runs every second on amoCRM's own DOM: an unchanged card must not be written
  // to at all, and a button pressed right now must survive until the click lands.
  function renderCardAction(node) {
    const id = node.dataset.id;
    const mode = cardMode(id);
    // Feed blocks also cover completed and other employees' tasks: only the server's queue knows which are ours.
    const target = node.querySelector('.card-task__inner-content') || node.querySelector('.card-task__inner-header') || node.querySelector('.card-task');
    if (!state.enabled || !target || !(mode === 'stop' || ownTaskIds.has(id))) { clearCardAction(node); return; }
    node.querySelector('.card-task')?.classList.toggle('rkrs-ap-active-task-card', mode === 'stop');
    let slot = node.querySelector('[data-rkrs-ap-card-action]');
    if (slot && slot.parentNode !== target) { slot.remove(); slot = null; }
    if (!slot) {
      target.classList.add('rkrs-ap-task-card-content');
      slot = documentImpl.createElement('div'); slot.className = 'rkrs-ap-card-action'; slot.dataset.rkrsApCardAction = '';
      const created = documentImpl.createElement('button'); created.type = 'button'; created.className = 'rkrs-ap-card-btn';
      slot.append(created); target.append(slot);
    }
    const button = slot.firstChild;
    if (slot.dataset.rkrsApCardAction !== mode) {
      slot.dataset.rkrsApCardAction = mode;
      button.innerHTML = cardActions[mode].icon; button.append(cardActions[mode].label);
      button.title = mode === 'blocked' ? 'Сначала завершите Imbox-активность' : '';
    }
    const locked = mode === 'blocked' || state.busy || state.recoveryRequired || stateInvalidated || !state.ready || Boolean(state.completion) || Boolean(client?.getState().pending);
    if (button.disabled !== locked) button.disabled = locked;
  }
  // Delegated, as amoCRM may stop a click before it reaches a node inside its card.
  const onCardClick = event => {
    const target = event.target?.nodeType === 3 ? event.target.parentNode : event.target;
    const button = target?.closest?.('.rkrs-ap-card-action .rkrs-ap-card-btn');
    if (!button || disposed) return;
    event.preventDefault(); event.stopPropagation();
    if (button.disabled) return;
    const id = button.closest('.feed-note-wrapper-task[data-id]')?.dataset?.id;
    if (id) { if (button.parentNode.dataset.rkrsApCardAction === 'stop') controller.stop(); else controller.startTask(id); }
  };
  documentImpl.addEventListener?.('click', onCardClick, true);
  async function startImboxSession(id) {
    if (!state.dialogs.some(row => row.id === String(id))) throw invalid('Откройте диалог Imbox'); const details = { client_id: clientId }; const entityId = dialogEntities.get(String(id)); if (entityId) { const entity = await client.loadLead(entityId); Object.assign(details, { entity_type: 'leads', entity_id: entityId }, entity.restricted ? {} : { entity_name: entity.name, pipeline_id: entity.pipeline_id || 0, status_id: entity.status_id || 0 }); } publishReceipt(await client.startImbox(id, details, state.active?.serverId || ''));
  }
  async function resumeCompletion() {
    const intent = state.completion;
    if (!intent) return;
    if (intent.phase === 'crm_pending') {
      const task = await client.loadTask(intent.taskId);
      assertOwnedTask(task, intent.taskId);
      if (!task.is_completed) {
        if (!intent.result.trim()) {
          rememberCompletion(null);
          throw new Error('Для завершения задачи укажите результат. Задача остаётся открытой.');
        }
        await ownedState();
        if (!state.ready || !state.enabled) throw new Error('Панель отключена: задача не была завершена');
        try {
          await client.completeTask(intent.taskId, intent.result);
          announce();
        } catch (error) {
          // A rejection (validation, access, missing task) definitively means the
          // server did not complete the task. Keep uncertain failures for
          // reconciliation, but do not trap the user in a retry loop.
          if ([400, 403, 404, 422].includes(error.status)) {
            rememberCompletion(null);
            throw new Error(`amoCRM отклонила завершение задачи (${error.status}). Проверьте задачу и результат, затем повторите действие.`);
          }
          throw error;
        }
      }
      rememberCompletion({ ...intent, phase: 'stop_pending' });
    }
    const completed = state.completion;
    if (completed.sessionId) {
      const own = await ownedState();
      // The captured interval may already have been stopped/replaced in another
      // tab. Never stop whichever different interval is current now.
      if (own.current?.id === completed.sessionId) publishReceipt(await client.stopSession(completed.sessionId, completed.result));
    }
    rememberCompletion(null);
  }
  async function recover() {
    if (client.getState().pending) {
      requireReconciliation(true);
      try { publishReceipt(await client.retryPending()); }
      catch (error) { if (error.status !== 409) throw error; }
    }
    try { await ownedState(); requireReconciliation(false); state.readWarning = ''; }
    catch (error) { state.readWarning = `Обновите состояние перед следующим действием. ${error.message}`; return false; }
    if (state.completion) await resumeCompletion();
  }
  const controller = {
    getSnapshot: snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    selectScenario(value) { state.scenario = value; emit(); }, selectTask(id) { state.selectedTaskId = id; emit(); },
    startTask(id = state.selectedTaskId) { return run(async () => { assertAvailable(); publishReceipt(await client.startTask(await taskContext(id), state.active?.serverId || '')); }); },
    startOther(name) { return run(async () => { assertAvailable(); name = validateText(name, 'Название активности', true); publishReceipt(await client.startActivity(name, { client_id: clientId }, state.active?.serverId || '')); }); },
    startImbox(id) { return run(async () => { assertAvailable(); await startImboxSession(id); lastDialog = String(id); }); },
    pause() { return run(async () => { assertAvailable(); publishReceipt(await client.startPause(state.active?.serverId || '')); }); },
    stop() { return run(async () => {
      if (client.getState().pending) throw new Error('Сначала восстановите незавершённую команду кнопкой обновления');
      // An explicit stop may abandon an unconfirmed CRM completion; it never
      // retries the CRM write and still closes only the acknowledged interval.
      if (state.recoveryRequired || stateInvalidated || !state.ready) throw invalid('Обновите состояние перед действием');
      publishReceipt(await client.stopSession(state.active?.serverId));
      rememberCompletion(null);
    }); },
    completeTask(id, result = '') { return run(async () => {
      assertAvailable();
      result = validateText(result, 'Результат задачи');
      if (!result) throw invalid('Для завершения задачи укажите результат.');
      const task = await client.loadTask(Number(id));
      assertOwnedTask(task, id);
      await ownedState();
      if (!state.enabled) throw new Error('Панель задач отключена');
      const sessionId = state.active?.kind === 'tasks' && state.active.id === String(id) ? state.active.serverId : '';
      if (task.is_completed && !sessionId) throw new Error('Задача уже завершена');
      // Persist intent before the first CRM mutation. Reload/retry first reads
      // the task, so a lost PATCH response does not blindly repeat completion.
      rememberCompletion({ taskId: Number(id), result: task.is_completed ? task.result_text || result : result, sessionId, phase: 'crm_pending' });
      await resumeCompletion();
    }); },
    refresh() { return client && (client.getState().pending || state.completion || state.recoveryRequired) ? run(recover) : refreshBackground(); },
    updateSettings(patch) { state.settings = { ...state.settings, ...patch }; rememberView({ compact: state.settings.compact === true }); emit(); }, reset() {},
    openManagement() {
      if (disposed || managementPending || !client) return false;
      const popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null;
      managementPending = true;
      return (async () => {
        try {
          const result = await client.createManagementLink(appOrigin);
          if (disposed) { popup?.close(); return false; }
          const url = new URL(result.url);
          if (url.origin !== new URL(appOrigin).origin) throw new Error('Некорректный адрес настроек');
          if (!popup) throw new Error('Разрешите открытие окна настроек');
          popup.location.replace(url.href);
          return true;
        } catch (error) { popup?.close(); if (!disposed) { state.error = error.message; emit(); } return false; }
        finally { managementPending = false; }
      })();
    },
    tick() {
      if (disposed) return;
      state.elapsedSeconds = state.active ? Math.max(0, (Date.now() - state.active.startedAt) / 1000) : 0;
      updateTotal();
      scanDOM(); emit();
      for (const [id, check] of completionChecks) {
        if (state.active?.kind !== 'tasks' || state.active.id !== id || Date.now() > check.until) completionChecks.delete(id);
        else if (!state.busy && state.ready && Date.now() >= check.next) {
          // Each check is a live amoCRM read inside the shared budget.
          check.next = Date.now() + 5000;
          void reconcileCompletedTask(id).then(completed => { if (completed) completionChecks.delete(id); });
        }
      }
      // The controller outlives navigation: related deals follow the opened lead card.
      const lead = locationImpl.pathname.match(/\/leads\/detail\/(\d+)/)?.[1] || '';
      if (serverSettings.include_related_deals && state.ready && lead !== queueLead && Date.now() >= tasksRetryAt) { void loadTasks(); }
      const dialog = locationImpl.pathname.match(/\/imbox\/(\d+)/)?.[1];
      if (lastDialog === null && state.active?.kind === 'imbox' && state.active.clientId === clientId && state.active.id === dialog) lastDialog = dialog;
      if (!state.busy && (!state.recoveryRequired || (dialogTransition?.pending && client.getState().pending)) && !stateInvalidated && (state.ready || dialogTransition?.pending) && state.enabled && !state.completion && !documentImpl.hidden) {
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
              if (transition.pending) {
                requireReconciliation(true);
                publishReceipt(await client.retryPending());
                lastDialog = transition.target;
                dialogTransition = null;
                try { await ownedState(); requireReconciliation(false); } catch (error) { state.readWarning = error.message; }
              }
              else if (transition.action === 'start') await startImboxSession(transition.target);
              else publishReceipt(await client.stopSession(state.active?.serverId));
              // Acknowledge only the successful server write, not DOM discovery
              // or a subsequent read. Manual stop on this route stays stopped.
              lastDialog = transition.target;
              dialogTransition = null;
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
      if (!state.busy && !documentImpl.hidden && !client.getState().pending && !state.recoveryRequired) {
        if (Date.now()-lastSync >= 90000) void refreshBackground(false);
        if (state.ready && !state.completion && Date.now()-lastTasks >= 60000 && Date.now() >= tasksRetryAt) void loadTasks();
        if (state.ready && Date.now() >= reads.history.nextAt && dayKey(parts(dayStart || Date.now())) !== dayKey(parts(Date.now()))) void loadHistory();
      }
    },
    dispose() { disposed = true; invalidateReads(); try { channel?.close(); } catch { /* Already closed. */ } documentImpl.removeEventListener?.('visibilitychange', onVisible); windowRef?.removeEventListener?.('focus', onVisible); documentImpl.removeEventListener?.('click', onNativeComplete, true); documentImpl.removeEventListener?.('click', onCardClick, true); requests.forEach(request => { try { request.abort?.(); } catch { /* Continue disposing other SDK requests. */ } }); requests.clear(); client?.dispose(); documentImpl.querySelectorAll?.('.feed-note-wrapper-task[data-id]').forEach(clearCardAction); listeners.clear(); },
  };
  if (client) void sync(true).then(ok => { if (ok && !disposed) refreshProjections(); });
  return controller;
}
