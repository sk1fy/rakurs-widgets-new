import { createActivitySessionClient } from './session-client.js';

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
  const state = { live: true, enabled: view.enabled === true, ready: false, completion: null, busy: false, scenario: 'tasks', tasks: [], dialogs: [], selectedTaskId: null, active: null, history: [], settings: { compact: view.compact === true }, error: '', queue: { complete: true, stale: false, fetchedAt: 0, warning: false, note: '' }, elapsedSeconds: 0, totalSeconds: 0, completedCount: null };
  let disposed = false, lastSync = 0, lastTasks = 0, tasksRetryAt = 0, serverSettings = {}, client, lastDialog = null, dialogTransition = null, queueLead = '', closedSeconds = 0, dayStart = 0;
  // Other tabs of the same employee only hear that something changed; each one
  // rereads the server, which stays the source of truth.
  let channel = null;
  try { if (typeof broadcastImpl === 'function') { channel = new broadcastImpl(`rkrs-activity:${identity}`); channel.onmessage = () => { if (!disposed) { lastSync = 0; lastTasks = 0; } }; } } catch { channel = null; }
  const announce = () => { try { if (!disposed) channel?.postMessage({ type: 'changed' }); } catch { /* Other tabs still poll. */ } };
  // Returning to the tab rereads state at once; hidden tabs do not poll at all.
  const onVisible = () => { if (disposed || documentImpl.hidden) return; if (Date.now() - lastSync > 3000) lastSync = 0; if (Date.now() - lastTasks > 10000) lastTasks = 0; };
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
  // Employees outside the panel settings get no bar unless they still own unfinished work.
  const hidden = () => Boolean(client) && !state.enabled && !state.active && !state.completion && !client.getState().pending;
  const snapshot = () => structuredClone({ ...state, pending: client?.getState().pending || false, hidden: hidden() });
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
  function applyCurrent(raw) {
    const previous = state.active?.serverId;
    state.active = raw?.id ? { kind: raw.kind === 'work' ? 'tasks' : raw.kind === 'pause' ? 'pause' : raw.context.activity_type === 'imbox' ? 'imbox' : 'other', id: raw.kind === 'work' ? String(raw.context.task_id) : raw.context.activity_name?.replace(/^Imbox /, '') || raw.id, title: raw.context.task_name || raw.context.activity_name || 'Пауза', entityName: raw.context.entity_name, startedAt: raw.started_at * 1000, serverId: raw.id, clientId: raw.context.client_id } : null;
    // A newly started task (here, from a card or in another tab) becomes the
    // selection; a later different selection is the user's next task.
    if (state.active?.kind === 'tasks' && state.active.serverId !== previous) state.selectedTaskId = state.active.id;
  }
  async function sync() {
    lastSync = Date.now();
    const own = await client.loadState();
    if (disposed) return;
    serverSettings = own.settings;
    state.enabled = own.enabled;
    if (view.enabled !== own.enabled) rememberView({ enabled: own.enabled });
    applyCurrent(own.current);
    if (!own.enabled) state.error = 'Панель задач отключена для сотрудника в общих настройках';
    if (!own.enabled && !state.active) {
      // A hidden panel has nothing to show: skip the history pages entirely.
      state.history = []; closedSeconds = 0; updateTotal(); state.ready = true; lastSync = Date.now();
      return;
    }
    const today = dayKey(parts(Date.now())); let low = Math.floor(Date.now()/1000)-48*3600, high = Math.floor(Date.now()/1000); while (low < high) { const mid = Math.floor((low+high)/2); if (dayKey(parts(mid*1000)) < today) low=mid+1; else high=mid; } const midnight = new Date(low*1000);
    const from = Math.floor(midnight.getTime() / 1000), to = Math.floor(Date.now() / 1000);
    let cursor = '', items = [];
    do { const page = await client.loadHistory({ from, to, ...(cursor ? { cursor } : {}) }); items.push(...(page.items || [])); cursor = page.next_cursor || ''; } while (cursor && !disposed);
    const closed = items.filter(row => row.stopped_at);
    state.history = closed.map(row => ({ id: row.id, kind: row.kind === 'work' ? 'tasks' : row.kind === 'pause' ? 'pause' : row.context.activity_type || 'other', title: row.context.task_name || row.context.activity_name || 'Пауза', seconds: Math.max(0, row.stopped_at - row.started_at), finishedAt: row.stopped_at * 1000 }));
    // Pauses are not work, and an interval that began yesterday counts only from midnight.
    closedSeconds = closed.filter(row => row.kind !== 'pause').reduce((sum, row) => sum + Math.max(0, Math.min(row.stopped_at, to) - Math.max(row.started_at, from)), 0);
    dayStart = from * 1000;
    updateTotal();
    // Session history has no explicit completion fact. A result comment is not
    // proof of CRM completion, and an empty result is a valid completion.
    state.completedCount = null;
    state.ready = true;
    lastSync = Date.now();
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
    const active = state.active;
    if (active?.kind !== 'tasks' || active.id !== id || client.getState().pending || state.completion) return false;
    let task;
    try { task = await client.loadTask(Number(id)); } catch (error) { if (disposed) throw error; return false; }
    if (!task.is_completed) return false;
    const own = await client.loadState();
    if (disposed) return false;
    applyCurrent(own.current);
    if (own.current?.id !== active.serverId) return false;
    const result = typeof task.result_text === 'string' && new TextEncoder().encode(task.result_text).length <= 2000 ? task.result_text : '';
    await client.stopSession(active.serverId, result);
    await sync();
    return true;
  }
  async function loadTasks() {
    if (!Number.isSafeInteger(Number(context.userId)) || Number(context.userId) <= 0) throw new Error('Не определён сотрудник amoCRM');
    if (!state.enabled) { state.tasks = []; state.selectedTaskId = null; describeQueue({ complete: true, stale: false, errorCode: '', fetchedAt: 0 }); return; }
    const leadId = locationImpl.pathname.match(/\/leads\/detail\/(\d+)/)?.[1];
    queueLead = leadId || '';
    let queue;
    // The server shares one snapshot per employee across tabs and labels tasks
    // related to the open lead itself.
    try { queue = await client.loadTasks(serverSettings.include_related_deals ? leadId : undefined); }
    catch (error) {
      // amoCRM is busy: keep the last queue and wait for the server's delay.
      if ([429, 503].includes(error.status)) { tasksRetryAt = Date.now() + Math.max(error.retryAfter, 5) * 1000; if (lastTasks) { error.keepReady = true; describeQueue({ ...state.queue, stale: true, errorCode: error.code || '' }); } }
      throw error;
    }
    if (disposed) return;
    tasksRetryAt = queue.retry_after_seconds > 0 ? Date.now() + queue.retry_after_seconds * 1000 : 0;
    const rows = queue.tasks || [];
    if (state.active?.kind === 'tasks' && !rows.some(row => String(row.id) === state.active.id)) await reconcileCompletedTask(state.active.id);
    const priorities = serverSettings.priority_keys || ['urgent','overdue','overdue_no_time','today_no_time','today_timed','future'];
    const priority = row => { const due = new Date(row.complete_till * 1000), now = new Date(), dueParts = parts(due.getTime()), today = dayKey(dueParts) === dayKey(parts(now.getTime())), allDay = dueParts.hour === '23' && dueParts.minute === '59', overdue = due < now; const key = !allDay && today && (overdue || due-now <= 600000) ? 'urgent' : !allDay && overdue && !today ? 'overdue' : allDay && overdue && !today ? 'overdue_no_time' : allDay && today ? 'today_no_time' : !allDay && today ? 'today_timed' : 'future'; const index = priorities.indexOf(key); return index < 0 ? 99 : index; };
    const visible = rows.filter(row => serverSettings.consider_future_tasks || dayKey(parts(row.complete_till * 1000)) <= dayKey(parts(Date.now())));
    state.tasks = visible.sort((a,b) => priority(a)-priority(b) || a.complete_till-b.complete_till).map(row => ({ id: String(row.id), title: row.text || `Задача ${row.id}`, entityName: entityName(row), related: row.related || '', type: row.task_type_name || '', dueLabel: dueLabel(row.complete_till * 1000), overdue: row.complete_till * 1000 < Date.now(), completed: false }));
    // An older server omits the metadata: its queue is a complete live read.
    describeQueue({ complete: queue.complete !== false, stale: queue.stale === true, errorCode: queue.error_code || '', fetchedAt: queue.fetched_at > 0 ? queue.fetched_at * 1000 : 0 });
    if (!state.tasks.some(row => row.id === state.selectedTaskId)) state.selectedTaskId = state.tasks[0]?.id || null;
    lastTasks = Date.now();
  }
  async function run(action) {
    if (disposed || state.busy || !client) return;
    state.busy = true; state.error = ''; emit();
    try { await action(); return !disposed; } catch (error) { if (!disposed) { state.error = state.completion?.phase === 'stop_pending' ? `Задача завершена в amoCRM; остановка учёта времени не подтверждена. Нажмите обновление для восстановления. ${error.message}` : state.completion ? `Завершение задачи не подтверждено. Обновление проверит amoCRM и восстановит учёт времени. ${error.message}` : error.message; if (!error.keepReady) state.ready = false; } return false; } finally { if (!disposed) { state.busy = false; emit(); } }
  }
  async function taskContext(id) {
    const task = await client.loadTask(Number(id), { context: true });
    assertOwnedTask(task, id);
    if (task.is_completed) throw new Error('Задача уже завершена. Обновите очередь.');
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
    for (const button of buttons) if (!button.isConnected) buttons.delete(button);
    state.dialogs = [...documentImpl.querySelectorAll('.notification--talk[data-id]')].map(node => { const link = node.querySelector('a[href*="/leads/detail/"]'); const entityId = link?.getAttribute('href')?.match(/\/leads\/detail\/(\d+)/)?.[1]; if (entityId) dialogEntities.set(node.dataset.id, Number(entityId)); return ({ id: node.dataset.id, name: node.querySelector('.notification-inner__title_message_title, .notification__title, .notification__name')?.textContent?.trim() || `Imbox ${node.dataset.id}`, preview: '', channel: 'Imbox' }); }).filter(row => /^\d+$/.test(row.id));
    documentImpl.querySelectorAll('.feed-note-wrapper-task[data-id]').forEach(node => {
      const existing = node.querySelector('[data-rkrs-live-start]');
      if (!state.enabled || !state.ready || state.completion || client?.getState().pending) { existing?.remove(); return; }
      if (state.active?.kind === 'tasks' && state.active.id === node.dataset.id) { existing?.remove(); return; }
      if (existing || !/^\d+$/.test(node.dataset.id)) return;
      const button = documentImpl.createElement('button'); button.type = 'button'; button.dataset.rkrsLiveStart = ''; button.textContent = 'Начать учёт времени';
      button.style.cssText = 'display:inline-block;margin:6px 0 0;padding:3px 10px;border:1px solid #1890ff;border-radius:4px;background:transparent;color:#1890ff;font:inherit;font-size:13px;cursor:pointer;';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); controller.startTask(node.dataset.id); });
      node.append(button); buttons.add(button);
    });
  }
  async function startImboxSession(id) {
    if (!state.dialogs.some(row => row.id === String(id))) throw invalid('Откройте диалог Imbox'); const details = { client_id: clientId }; const entityId = dialogEntities.get(String(id)); if (entityId) { const entity = await client.loadLead(entityId); Object.assign(details, { entity_type: 'leads', entity_id: entityId }, entity.restricted ? {} : { entity_name: entity.name, pipeline_id: entity.pipeline_id || 0, status_id: entity.status_id || 0 }); } await client.startImbox(id, details);
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
        const own = await client.loadState();
        if (disposed) return;
        state.enabled = own.enabled;
        applyCurrent(own.current);
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
      if (!result) throw invalid('Для завершения задачи укажите результат.');
      const task = await client.loadTask(Number(id));
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
      rememberCompletion({ taskId: Number(id), result: task.is_completed ? task.result_text || result : result, sessionId, phase: 'crm_pending' });
      await resumeCompletion();
      await sync();
      await loadTasks();
    }); },
    refresh() { return run(refresh); },
    updateSettings(patch) { state.settings = { ...state.settings, ...patch }; rememberView({ compact: state.settings.compact === true }); emit(); }, reset() {},
    openManagement() {
      // run() would skip a busy controller and leave the blank window behind.
      if (disposed || state.busy || !client) return false;
      const popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null;
      return run(async () => { try { const result = await client.createManagementLink(appOrigin); const url = new URL(result.url); if (url.origin !== new URL(appOrigin).origin) throw new Error('Некорректный адрес настроек'); if (!popup) throw new Error('Разрешите открытие окна настроек'); popup.location.replace(url.href); } catch (error) { popup?.close(); error.keepReady = true; throw error; } });
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
          run(async () => { if (await reconcileCompletedTask(id)) { completionChecks.delete(id); await loadTasks(); } });
        }
      }
      // The controller outlives navigation: related deals follow the opened lead card.
      const lead = locationImpl.pathname.match(/\/leads\/detail\/(\d+)/)?.[1] || '';
      if (serverSettings.include_related_deals && state.ready && lead !== queueLead) { queueLead = lead; lastSync = 0; lastTasks = 0; }
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
      // Unenrolled employees only need to notice being enabled; poll them rarely.
      if (!state.busy && !documentImpl.hidden && Date.now()-lastSync > (hidden() ? 120000 : 15000)) run(async () => { await sync(); if (!client.getState().pending && !state.completion && Date.now()-lastTasks > 60000 && Date.now() >= tasksRetryAt) await loadTasks(); });
    },
    dispose() { disposed = true; try { channel?.close(); } catch { /* Already closed. */ } documentImpl.removeEventListener?.('visibilitychange', onVisible); windowRef?.removeEventListener?.('focus', onVisible); documentImpl.removeEventListener?.('click', onNativeComplete, true); requests.forEach(request => { try { request.abort?.(); } catch { /* Continue disposing other SDK requests. */ } }); requests.clear(); client?.dispose(); buttons.forEach(button => button.remove()); listeners.clear(); },
  };
  if (client) run(async () => { await sync(); await loadTasks(); });
  return controller;
}
