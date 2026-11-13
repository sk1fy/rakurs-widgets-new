export const apiOrigin = 'https://activity-fixture.invalid';
export const appOrigin = 'https://panel-fixture.invalid';
export const accountId = 42;
export const userId = 7;
export const viewKey = `rkrs-activity-view:${apiOrigin}:rkrs_activity_panel:${accountId}:${userId}`;

function disposableToken(sequence) {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60, jti: sequence })).replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.Zml4dHVyZQ`;
}

export function createLiveSDK({ failState = 0, failToken = 0, enabled = true, current = null, extraTasks = [], settings = {}, onChange = () => {}, tokenFor = disposableToken } = {}) {
  const task = { id: 19, responsible_user_id: userId, text: 'Проверить предложение', task_type_id: 1, task_type_name: 'Звонок', entity_type: 'leads', entity_id: 12, entity_name: 'Тестовая сделка', complete_till: Math.floor(Date.now() / 1000) + 300, is_completed: false, result_text: '' };
  const requests = [], commands = [], held = [], history = [];
  const holds = new Set();
  let sequence = 0, queueContainsTask = true;
  let queueMeta = { fetched_at: Math.floor(Date.now() / 1000) };
  const state = () => ({ enabled, current: structuredClone(current), settings: { consider_future_tasks: true, include_related_deals: true, ...settings } });
  const error = (status, message) => ({ status, responseJSON: { error: { message } } });
  const widget = {
    get_settings: () => ({ widget_code: 'rkrs_activity_panel', oauth_client_uuid: 'a0ee1dca-76a6-4720-b1dc-c6a0ba52c07e' }),
    $authorizedAjax() { throw new Error('Fixture must use fresh-token SDK ajax'); },
    $: { ajax(options) {
      const url = new URL(options.url, 'http://fixture.invalid');
      if (url.origin !== 'http://fixture.invalid' && url.origin !== apiOrigin) throw new Error(`Unexpected fixture origin ${url.origin}`);
      const path = url.pathname.replace('/api/v1/widget/activity/', '');
      const body = options.data ? JSON.parse(options.data) : null;
      const kind = url.pathname.endsWith('/disposable_token') ? 'token' : path === 'tasks/19' ? 'detail' : path === 'sessions' && body?.action === 'start_task' ? 'start' : path;
      const entry = { kind, method: options.method, body, aborted: false, token: options.headers?.['X-Auth-Token'], commandId: options.headers?.['Idempotency-Key'] };
      requests.push(entry);
      let done, fail;
      const request = { done(fn) { done = fn; return request; }, fail(fn) { fail = fn; return request; }, abort() { entry.aborted = true; } };
      const respond = rejection => {
        if (rejection) { fail(error(503, 'Fixture request failed')); onChange(); return; }
        if (kind === 'token') {
          if (failToken-- > 0) fail(error(401, 'Fixture authorization failed'));
          else {
            entry.token = tokenFor(++sequence);
            done({ token: entry.token });
          }
        } else if (kind === 'state') {
          if (failState-- > 0) fail(error(503, 'Fixture state unavailable'));
          else done(state());
        } else if (kind === 'tasks') {
          const { responsible_user_id, is_completed, result_text, ...row } = task;
          done({ tasks: [...(queueContainsTask ? [row] : []), ...extraTasks], complete: true, stale: false, ...queueMeta });
        } else if (kind === 'detail') done({ ...task, ...(url.searchParams.has('context') ? { entity: { id: 12, entity_type: 'leads', name: 'Тестовая сделка' } } : {}) });
        else if (kind === 'tasks/19/complete') { Object.assign(task, { is_completed: true, result_text: entry.body.result }); queueContainsTask = false; done({ ...task }); }
        else if (kind === 'leads/12') done({ id: 12, name: 'Тестовая сделка' });
        else if (kind === 'sessions' && options.method === 'GET') done({ items: structuredClone(history) });
        else if ((kind === 'sessions' || kind === 'start') && options.method === 'POST') {
          const command = entry.body;
          commands.push(structuredClone(command));
          if ((command.action === 'stop' ? command.session_id : command.expected_session_id) !== (current?.id || '')) {
            fail(error(409, 'Fixture session changed')); onChange(); return;
          }
          if (kind === 'start' && (command.context.task_id !== task.id || task.responsible_user_id !== userId || task.is_completed)) {
            fail(error(422, 'Fixture task is unavailable')); onChange(); return;
          }
          const stopped = current ? { ...current, stopped_at: Math.floor(Date.now() / 1000) } : null;
          if (stopped) history.push(stopped);
          const sessionContext = kind === 'start' ? {
            client_id: command.context.client_id, task_id: task.id, task_name: task.text, task_type_id: task.task_type_id,
            task_type_name: task.task_type_name, entity_type: task.entity_type, entity_id: task.entity_id, entity_name: task.entity_name,
          } : command.context;
          current = command.action === 'stop' ? null : { id: `fixture-session-${++sequence}`, kind: kind === 'start' || command.action === 'work' ? 'work' : command.action === 'pause' ? 'pause' : 'activity', started_at: Math.floor(Date.now() / 1000), context: sessionContext };
          done(command.action === 'stop' ? stopped : structuredClone(current));
        } else fail(error(404, `Unsupported fixture request ${path}`));
        onChange();
      };
      queueMicrotask(() => {
        if (holds.has(kind)) { held.push({ kind, respond }); onChange(); }
        else respond();
      });
      return request;
    } },
  };
  return {
    widget, task, requests, commands, held,
    state,
    setEnabled(value) { enabled = value; },
    setCurrent(value) { current = value; },
    setQueueMeta(value) { queueMeta = value; },
    setQueueContainsTask(value) { queueContainsTask = value; },
    hold(kind, value = true) { if (value) holds.add(kind); else holds.delete(kind); },
    release(kind, reject = false) {
      const index = held.findIndex(entry => entry.kind === kind);
      if (index < 0) throw new Error(`No held ${kind} request`);
      held.splice(index, 1)[0].respond(reject);
    },
  };
}
