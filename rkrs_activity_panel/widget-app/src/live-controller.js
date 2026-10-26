import { createActivitySessionClient } from './session-client.js';

// The widget SDK signs every request; credentials never leave its transport.
export function createLiveActivityController({ context, apiOrigin, appOrigin, fetchImpl = fetch, documentImpl = document, locationImpl = location }) {
  const listeners = new Set();
  const abort = new AbortController();
  let clientId = crypto.randomUUID();
  try { const key = `rkrs-activity-client:${context.accountId}:${context.userId}`; const stored = globalThis.sessionStorage?.getItem(key); if (/^[0-9a-f-]{36}$/.test(stored || '')) clientId = stored; else globalThis.sessionStorage?.setItem(key, clientId); } catch { /* Storage may be disabled; CAS still guards other tabs. */ }
  const state = { live: true, enabled: false, busy: false, scenario: 'tasks', tasks: [], dialogs: [], selectedTaskId: null, active: null, history: [], settings: { compact: false }, error: '', elapsedSeconds: 0, totalSeconds: 0, completedCount: 0 };
  let disposed = false, lastSync = 0, lastTasks = 0, serverSettings = {}, client, lastDialog = null, dialogTransition = null;
  const buttons = new Set();
  const dialogEntities = new Map();
  const zone = globalThis.APP?.constant?.('account')?.timezone;
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { formatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  const parts = timestamp => Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  const dayKey = value => `${value.year}-${value.month}-${value.day}`;
  const snapshot = () => structuredClone(state);
  const emit = () => { if (!disposed) listeners.forEach(fn => fn(snapshot())); };
  const sdkRequest = options => new Promise((resolve, reject) => {
    const request = context.widget.$authorizedAjax({ ...options, type: options.method });
    request.done(resolve).fail(xhr => { const error = new Error(xhr.responseJSON?.error?.message || 'Не удалось получить данные Activity'); error.status = xhr.status; reject(error); });
  });
  try { client = createActivitySessionClient({ baseURL: apiOrigin, authorizedRequest: sdkRequest }); }
  catch { state.error = 'Не настроен адрес API Activity (VITE_ACTIVITY_API_ORIGIN)'; }
  async function crm(path, options = {}) {
    const response = await fetchImpl(`/api/v4/${path}`, { credentials: 'same-origin', signal: abort.signal, ...options, headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error(`Ошибка amoCRM: ${response.status}`);
    return response.status === 204 ? {} : response.json();
  }
  function applyCurrent(raw) {
    state.active = raw?.id ? { kind: raw.kind === 'work' ? 'tasks' : raw.context.activity_type === 'imbox' ? 'imbox' : 'other', id: raw.kind === 'work' ? String(raw.context.task_id) : raw.context.activity_name?.replace(/^Imbox /, '') || raw.id, title: raw.context.task_name || raw.context.activity_name || 'Пауза', entityName: raw.context.entity_name, startedAt: raw.started_at * 1000, serverId: raw.id, clientId: raw.context.client_id } : null;
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
    state.history = items.filter(row => row.stopped_at).map(row => ({ id: row.id, kind: row.kind === 'work' ? 'tasks' : row.context.activity_type || 'other', title: row.context.task_name || row.context.activity_name || 'Пауза', seconds: row.work_time_seconds, finishedAt: row.stopped_at * 1000 }));
    state.totalSeconds = state.history.reduce((sum, row) => sum + row.seconds, 0);
    state.completedCount = items.filter(row => row.context.task_result).length;
    lastSync = Date.now();
  }
  async function loadTasks() {
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
    state.tasks = rows.filter(row => serverSettings.consider_future_tasks || dayKey(parts(row.complete_till * 1000)) <= dayKey(parts(Date.now()))).sort((a,b) => priority(a)-priority(b) || a.complete_till-b.complete_till).map(row => ({ id: String(row.id), title: row.text || `Задача ${row.id}`, entityName: row.entity_id ? `${row.entity_type} #${row.entity_id}` : '', related: related.get(`${row.entity_type}:${row.entity_id}`) || '', type: String(row.task_type_id), dueLabel: new Date(row.complete_till * 1000).toLocaleString('ru-RU'), overdue: row.complete_till * 1000 < Date.now(), completed: false }));
    if (!state.tasks.some(row => row.id === state.selectedTaskId)) state.selectedTaskId = state.tasks[0]?.id || null;
    lastTasks = Date.now();
  }
  async function run(action) {
    if (disposed || state.busy || !client) return;
    state.busy = true; state.error = ''; emit();
    try { await action(); return true; } catch (error) { state.error = error.message; return false; } finally { state.busy = false; emit(); }
  }
  async function taskContext(id) {
    const task = await crm(`tasks/${Number(id)}`);
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
    state.dialogs = [...documentImpl.querySelectorAll('.notification--talk[data-id]')].map(node => { const link = node.querySelector('a[href*="/leads/detail/"]'); const entityId = link?.getAttribute('href')?.match(/\/leads\/detail\/(\d+)/)?.[1]; if (entityId) dialogEntities.set(node.dataset.id, Number(entityId)); return ({ id: node.dataset.id, name: node.querySelector('.notification-inner__title_message_title, .notification__title, .notification__name')?.textContent?.trim() || `Imbox ${node.dataset.id}`, preview: '', channel: 'Imbox' }); }).filter(row => /^\d+$/.test(row.id));
    documentImpl.querySelectorAll('.feed-note-wrapper-task[data-id]').forEach(node => {
      if (node.querySelector('[data-rkrs-live-start]') || !/^\d+$/.test(node.dataset.id)) return;
      const button = documentImpl.createElement('button'); button.type = 'button'; button.dataset.rkrsLiveStart = ''; button.textContent = 'Начать учёт времени';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); controller.startTask(node.dataset.id); });
      node.append(button); buttons.add(button);
    });
  }
  async function startImboxSession(id) {
    if (!state.dialogs.some(row => row.id === String(id))) throw new Error('Откройте диалог Imbox'); const details = { client_id: clientId }; const entityId = dialogEntities.get(String(id)); if (entityId) { const entity = await crm(`leads/${entityId}`); Object.assign(details, { entity_type: 'leads', entity_id: entityId, entity_name: entity.name, pipeline_id: entity.pipeline_id || 0, status_id: entity.status_id || 0 }); } await client.startImbox(id, details);
  }
  const controller = {
    getSnapshot: snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    selectScenario(value) { state.scenario = value; emit(); }, selectTask(id) { state.selectedTaskId = id; emit(); },
    startTask(id = state.selectedTaskId) { return run(async () => { if (!state.enabled) throw new Error('Панель задач отключена'); await client.startTask(await taskContext(id)); await sync(); }); },
    startOther(name) { return run(async () => { await client.startActivity(name, { client_id: clientId }); await sync(); }); },
    startImbox(id) { return run(async () => { await startImboxSession(id); lastDialog = String(id); await sync(); }); },
    pause() { return run(async () => { await client.startPause(); await sync(); }); },
    stop() { return run(async () => { await client.stop(); await sync(); }); },
    completeTask(id) { return run(async () => { const task = await crm(`tasks/${Number(id)}`); if (!task.is_completed) await crm(`tasks/${Number(id)}`, { method: 'PATCH', body: JSON.stringify({ is_completed: true }) }); if (state.active?.kind === 'tasks' && state.active.id === String(id)) await client.stop(task.result?.text || ''); await sync(); await loadTasks(); }); },
    refresh() { return run(async () => { if (client.getState().pending) await client.retryPending(); await sync(); await loadTasks(); }); },
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
      if (!state.busy && state.enabled && !documentImpl.hidden) {
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
      if (!state.busy && Date.now()-lastSync > 15000) run(async () => { await sync(); if (Date.now()-lastTasks > 60000) await loadTasks(); });
    },
    dispose() { disposed = true; abort.abort(); client?.dispose(); buttons.forEach(button => button.remove()); listeners.clear(); },
  };
  if (client) controller.refresh();
  return controller;
}
