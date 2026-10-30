import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLiveActivityController as createController } from '../src/live-controller.js';

// The server owns every amoCRM call. This emulates its task contract on top
// of each test's CRM fixture, so CRM reads and PATCHes stay observable.
async function serverTasks(fetchImpl, request, userId, queueMeta = () => ({})) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/v1/widget/activity/', '');
  const fail = status => { throw { status, responseJSON: { error: { code: status === 403 ? 'permission_denied' : 'unavailable', message: `HTTP ${status}` } }, getResponseHeader: () => null }; };
  const crm = async (target, options = {}) => {
    let response;
    try { response = await fetchImpl(`/api/v4/${target}`, options); } catch { fail(503); }
    if (!response.ok) fail(response.status);
    return response.status === 204 ? {} : response.json();
  };
  const types = async () => { try { return Object.fromEntries(((await crm('account?with=task_types'))._embedded?.task_types || []).map(row => [row.id, row.name])); } catch { return {}; } };
  const detail = (task, names = {}) => ({ id: task.id, responsible_user_id: task.responsible_user_id, text: task.text || '', task_type_id: task.task_type_id, task_type_name: names[task.task_type_id] || '', entity_type: task.entity_type, entity_id: task.entity_id, complete_till: task.complete_till, is_completed: !!task.is_completed, result_text: task.result?.text || '' });
  const own = async id => { const task = await crm(`tasks/${id}`); if (task.responsible_user_id !== userId) fail(403); return task; };
  let match;
  if (path === 'tasks') {
    const rows = ((await crm(`tasks?limit=250&page=1&filter[responsible_user_id]=${userId}&filter[is_completed]=0`))._embedded?.tasks || []).filter(row => row.responsible_user_id === userId && !row.is_completed);
    const names = {};
    for (const type of ['leads', 'contacts', 'companies', 'customers']) {
      const ids = [...new Set(rows.filter(row => row.entity_type === type && row.entity_id).map(row => row.entity_id))];
      if (ids.length) try { for (const entity of (await crm(`${type}?limit=50&${ids.map(id => `filter[id][]=${id}`).join('&')}`))._embedded?.[type] || []) names[`${type}:${entity.id}`] = entity.name; } catch { /* Names are best effort. */ }
    }
    const typeNames = await types();
    return { tasks: rows.map(row => ({ ...detail(row, typeNames), entity_name: names[`${row.entity_type}:${row.entity_id}`] || '', related: '' })), fetched_at: 1, fresh_until: 31, complete: true, stale: false, ...queueMeta() };
  }
  if ((match = path.match(/^tasks\/(\d+)$/))) {
    const task = await own(match[1]);
    const out = detail(task, await types());
    if (url.searchParams.get('context') === 'true' && task.entity_id) {
      const entity = await crm(`${task.entity_type}/${task.entity_id}`);
      out.entity = { id: task.entity_id, entity_type: task.entity_type, name: entity.name || '', pipeline_id: entity.pipeline_id || 0, status_id: entity.status_id || 0 };
      if (entity.pipeline_id) {
        const pipeline = await crm(`leads/pipelines/${entity.pipeline_id}`);
        const status = pipeline._embedded?.statuses?.find(row => row.id === entity.status_id);
        Object.assign(out.entity, { pipeline_name: pipeline.name, status_name: status?.name || '', status_color: status?.color || '' });
      }
    }
    return out;
  }
  if ((match = path.match(/^tasks\/(\d+)\/complete$/))) {
    const task = await own(match[1]);
    if (task.is_completed) return detail(task);
    const { result } = JSON.parse(request.data);
    await crm(`tasks/${match[1]}`, { method: 'PATCH', body: JSON.stringify({ is_completed: true, result: { text: result } }) });
    return { ...detail(task), is_completed: true, result_text: result };
  }
  if ((match = path.match(/^leads\/(\d+)$/))) {
    const lead = await crm(`leads/${match[1]}`);
    return { id: Number(match[1]), entity_type: 'leads', name: lead.name || '', pipeline_id: lead.pipeline_id || 0, status_id: lead.status_id || 0, restricted: false };
  }
  return fail(404);
}

function createLiveActivityController(options) {
  const widget = options.context.widget;
  const settings = widget.get_settings?.() || {};
  widget.get_settings = () => ({ ...settings, oauth_client_uuid: 'a0ee1dca-76a6-4720-b1dc-c6a0ba52c07e' });
  let count = 0;
  widget.$ = { ajax(request) {
    if (request.url.includes('/disposable_token')) {
      assert.equal(request.cache, false);
      const result = { done(fn) { fn({ token: `fresh-${++count}` }); return result; }, fail() { return result; }, abort() {} };
      return result;
    }
    assert.equal(request.headers['X-Auth-Token'], `fresh-${count}`);
    assert.equal(request.xhrFields.withCredentials, false);
    if (/\/api\/v1\/widget\/activity\/(tasks|leads)\b/.test(request.url)) {
      const outcome = serverTasks(options.fetchImpl || (async () => { throw Error('unexpected CRM'); }), request, Number(options.context.userId), options.queueMeta).then(value => ({ value }), xhr => ({ xhr }));
      const result = { done(fn) { outcome.then(r => { if (!r.xhr) fn(r.value); }); return result; }, fail(fn) { outcome.then(r => { if (r.xhr) fn(r.xhr); }); return result; }, abort() {} };
      return result;
    }
    return widget.$authorizedAjax(request);
  } };
  return createController(options);
}

test('the panel never calls amoCRM from the browser', async () => {
  const fixture = employeeFixture();
  const direct = [];
  const original = globalThis.fetch;
  globalThis.fetch = async url => { direct.push(url); throw Error('direct browser request'); };
  try {
    const controller = fixture.create(); await idle(controller);
    assert.equal(await controller.completeTask('19', 'Готово'), true);
    assert.deepEqual(direct, []);
    controller.dispose();
  } finally { globalThis.fetch = original; }
});

test('live controller loads real CRM task and context, writes through SDK and restores interval', async () => {
  let current={}, written;
  const listeners=[];
  const context={userId:7,widget:{$authorizedAjax(options){const result={done(fn){queueMicrotask(()=>{let value;if(options.url.endsWith('/state'))value={current,enabled:true,settings:{consider_future_tasks:true}};else if(options.method==='GET')value={items:[]};else {written=JSON.parse(options.data);current={id:'session',kind:'work',started_at:100,context:written.context};value=current;}fn(value);});return result;},fail(){return result;}};return result;}}};
  const fetchImpl=async url=>({ok:true,status:200,json:async()=>url.includes('tasks?')?{_embedded:{tasks:[{id:19,responsible_user_id:7,text:'CRM task',task_type_id:1,complete_till:200}]}}:url.endsWith('tasks/19')?{id:19,responsible_user_id:7,text:'CRM task',task_type_id:1,entity_type:'leads',entity_id:12}:url.endsWith('leads/12')?{name:'Real deal',pipeline_id:2,status_id:3}:url.includes('pipelines')?{name:'Sales',_embedded:{statuses:[{id:3,name:'New',color:'#fff'}]}}:{_embedded:{task_types:[{id:1,name:'Call'}]}}});
  const controller=createLiveActivityController({context,apiOrigin:'https://api.example.test',appOrigin:'https://panel.example.test',fetchImpl,documentImpl:{querySelectorAll(){return[];}},locationImpl:{pathname:'/'}});
  await new Promise(resolve=>{const unsubscribe=controller.subscribe(state=>{listeners.push(state);if(!state.busy){unsubscribe();resolve();}});});
  assert.equal(controller.getSnapshot().tasks[0].title,'CRM task');
  await controller.startTask('19');assert.equal(written.context.entity_name,'Real deal');assert.equal(written.context.status_name,'New');assert.equal(written.expected_session_id,'');assert.equal(controller.getSnapshot().active.id,'19');controller.dispose();
});

test('Imbox route transition records visible dialog and only closes its own interval', async () => {
  let current={}; const commands=[]; const route={pathname:'/imbox/77'};
  const doc={hidden:false,querySelectorAll(selector){return selector.includes('notification')?[{dataset:{id:'77'},querySelector(){return null;}}]:[];}};
  const widget={$authorizedAjax(options){const request={done(fn){queueMicrotask(()=>{if(options.url.endsWith('/state'))fn({current,enabled:true,settings:{}});else if(options.method==='GET')fn({items:[]});else{const command=JSON.parse(options.data);commands.push(command);current=command.action==='stop'?{}:{id:'imbox-session',kind:'activity',started_at:100,context:command.context};fn(command.action==='stop'?{id:'imbox-session',stopped_at:200}:current);}});return request;},fail(){return request;}};return request;}};
  const controller=createLiveActivityController({context:{widget,userId:7},apiOrigin:'https://api.example.test',appOrigin:'https://panel.example.test',fetchImpl:async()=>({ok:true,status:204}),documentImpl:doc,locationImpl:route});
  const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
  await settle();controller.tick();await settle();
  assert.equal(commands[0].action,'activity');assert.equal(commands[0].context.activity_name,'Imbox 77');assert.ok(commands[0].context.client_id);
  route.pathname='/leads';controller.tick();await settle();
  assert.equal(commands[1].action,'stop');assert.equal(commands[1].session_id,'imbox-session');controller.dispose();
});

function imboxFixture({ failStarts = 0, current: initial = {} } = {}) {
  let current = initial, visible = false;
  const writes = [], route = { pathname: '/imbox/77' };
  const widget = { $authorizedAjax(options) {
    let onFailure;
    const request = { done(fn) {
      queueMicrotask(() => {
        if (options.url.endsWith('/state')) return fn({ current, enabled: true, settings: {} });
        if (options.method === 'GET') return fn({ items: [] });
        const command = JSON.parse(options.data);
        writes.push({ command, id: options.headers['Idempotency-Key'] });
        if (command.action === 'activity' && failStarts-- > 0) return onFailure({ status: 503 });
        current = command.action === 'stop' ? {} : { id: 'session-77', kind: 'activity', started_at: 100, context: command.context };
        fn(command.action === 'stop' ? { id: 'session-77', stopped_at: 200 } : current);
      });
      return request;
    }, fail(fn) { onFailure = fn; return request; } };
    return request;
  } };
  const controller = createLiveActivityController({ context: { widget, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', fetchImpl: async () => ({ ok: true, status: 204 }), documentImpl: { hidden: false, querySelectorAll(selector) { return visible && selector.includes('notification') ? [{ dataset: { id: '77' }, querySelector() { return null; } }] : []; } }, locationImpl: route });
  return { controller, writes, route, show() { visible = true; } };
}
const settleImbox = () => new Promise(resolve => setImmediate(resolve));

test('delayed Imbox DOM remains pending until the dialog appears; manual stop stays stopped', async () => {
  const fixture = imboxFixture();
  await settleImbox(); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 0);
  fixture.show(); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].command.action, 'activity');
  await fixture.controller.stop(); fixture.controller.tick(); await settleImbox();
  assert.deepEqual(fixture.writes.map(row => row.command.action), ['activity', 'stop']);
  fixture.controller.dispose();
});

test('transient Imbox start retries with backoff and the same command identity', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const fixture = imboxFixture({ failStarts: 2 });
  fixture.show(); await settleImbox(); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 1);
  for (let i = 0; i < 10; i++) fixture.controller.tick();
  await settleImbox(); assert.equal(fixture.writes.length, 1);
  t.mock.timers.tick(1000); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 2);
  t.mock.timers.tick(1000); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 2, 'second retry uses two-second backoff');
  t.mock.timers.tick(1000); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 3);
  assert.equal(new Set(fixture.writes.map(row => row.id)).size, 1);
  fixture.controller.tick(); await settleImbox(); assert.equal(fixture.writes.length, 3);
  fixture.route.pathname = '/leads'; fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes[3].command.action, 'stop'); fixture.controller.dispose();
});

test('Imbox observation neither replaces nor stops another tab interval', async () => {
  const fixture = imboxFixture({ current: { id: 'foreign', kind: 'activity', started_at: 100, context: { activity_type: 'imbox', activity_name: 'Imbox 88', client_id: 'another-tab' } } });
  fixture.show(); await settleImbox(); fixture.controller.tick(); await settleImbox();
  fixture.route.pathname = '/leads'; fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 0); fixture.controller.dispose();
});

function employeeFixture({ enabled = true, failState = 0, failStop = 0, failPatchBeforeCommit = 0, failPatchAfterCommit = 0, rejectPatch = 0, initial, rows, storage } = {}) {
  const task = { id: 19, responsible_user_id: 7, text: 'Real task', task_type_id: 1, complete_till: 200, is_completed: false, ...initial };
  let current = { id: 'server-work', kind: 'work', started_at: 100, context: { task_id: 19, task_name: task.text, client_id: 'another-tab' } };
  const writes = [], patches = [], reads = [];
  const values = new Map();
  storage ||= { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const widget = { get_settings: () => ({ widget_code: 'rkrs_activity_panel' }), $authorizedAjax(options) {
    let onFailure;
    const request = { done(fn) { queueMicrotask(() => {
      if (options.url.endsWith('/state')) { if (failState-- > 0) return onFailure({ status: 503 }); return fn({ current, enabled, settings: { consider_future_tasks: true } }); }
      if (options.method === 'GET') return fn({ items: [{ id: 'history', kind: 'work', stopped_at: 200, work_time_seconds: 100, context: { task_result: 'comment is not completion' } }] });
      const command = JSON.parse(options.data); writes.push({ command, id: options.headers['Idempotency-Key'] });
      if (command.action === 'stop' && failStop-- > 0) return onFailure({ status: 503 });
      if (command.action === 'stop') { current = {}; return fn({ id: command.session_id, stopped_at: 200 }); }
      current = { id: 'new-session', kind: command.action, started_at: 200, context: command.context };
      fn(current);
    }); return request; }, fail(fn) { onFailure = fn; return request; }, abort() {} };
    return request;
  } };
  const fetchImpl = async (url, options = {}) => {
    reads.push(url);
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body); patches.push(body);
      if (rejectPatch) return { ok: false, status: rejectPatch };
      if (failPatchBeforeCommit-- > 0) return { ok: false, status: 503 };
      Object.assign(task, body);
      if (failPatchAfterCommit-- > 0) throw Error('CRM response lost');
      return { ok: true, status: 200, json: async () => ({ ...task }) };
    }
    return { ok: true, status: 200, json: async () => url.includes('tasks?') ? { _embedded: { tasks: rows || (task.is_completed ? [] : [{ ...task }]) } } : url.endsWith('tasks/19') ? { ...task } : { _embedded: { task_types: [{ id: 1, name: 'Call' }] } } };
  };
  const create = (extra = {}) => createLiveActivityController({ context: { widget, accountId: 42, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', fetchImpl, storageImpl: storage, documentImpl: { hidden: false, querySelectorAll: () => [] }, locationImpl: { pathname: '/' }, broadcastImpl: null, ...extra });
  return { create, task, writes, patches, reads, setEnabled(value) { enabled = value; }, failNextState() { failState = 1; }, replaceCurrent(value) { current = value; } };
}
async function idle(controller) {
  if (!controller.getSnapshot().busy) return;
  await new Promise(resolve => { const unsubscribe = controller.subscribe(state => { if (!state.busy) { unsubscribe(); resolve(); } }); });
}

test('disabled panel blocks every new mutation and CRM completion, but allows stopping an existing interval', async () => {
  const fixture = employeeFixture({ enabled: false }); const controller = fixture.create(); await idle(controller);
  assert.equal(controller.getSnapshot().active.serverId, 'server-work');
  for (const action of [() => controller.startTask('19'), () => controller.startOther('Work'), () => controller.startImbox('77'), () => controller.pause(), () => controller.completeTask('19', 'Done')]) assert.equal(await action(), false);
  assert.equal(fixture.writes.length, 0); assert.equal(fixture.patches.length, 0); assert.equal(fixture.reads.length, 0);
  assert.equal(await controller.stop(), true);
  assert.equal(fixture.writes[0].command.action, 'stop');
  assert.equal(controller.getSnapshot().active, null); controller.dispose();
});

test('own queue and task preflight reject other responsible users; comments are not a completed counter', async () => {
  const fixture = employeeFixture({ initial: { responsible_user_id: 8 }, rows: [{ id: 19, responsible_user_id: 8 }, { id: 20, responsible_user_id: 7, complete_till: 200 }, { id: 21, responsible_user_id: 7, is_completed: true }] });
  const controller = fixture.create(); await idle(controller);
  assert.deepEqual(controller.getSnapshot().tasks.map(row => row.id), ['20']);
  assert.equal(controller.getSnapshot().completedCount, null);
  assert.equal(await controller.startTask('19'), false);
  await controller.refresh(); assert.equal(await controller.completeTask('19', 'Done'), false);
  assert.equal(fixture.writes.length, 0); assert.equal(fixture.patches.length, 0); controller.dispose();
});

test('CRM completion records the result and stops the captured interval', async () => {
  for (const result of ['Решено']) {
    const fixture = employeeFixture(); const controller = fixture.create(); await idle(controller);
    assert.equal(await controller.completeTask('19', result), true);
    assert.deepEqual(fixture.patches, [{ is_completed: true, result: { text: result } }]);
    assert.equal(fixture.writes.at(-1).command.context.task_result, result);
    assert.equal(fixture.writes.at(-1).command.session_id, 'server-work');
    assert.equal(controller.getSnapshot().active, null); assert.equal(controller.getSnapshot().completion, null); controller.dispose();
  }
});

test('empty CRM completion result is rejected before recording an intent or changing the task', async () => {
  const fixture = employeeFixture(); const controller = fixture.create(); await idle(controller);
  assert.equal(await controller.completeTask('19', ''), false);
  assert.equal(controller.getSnapshot().completion, null);
  assert.match(controller.getSnapshot().error, /укажите результат/);
  assert.equal(fixture.patches.length, 0); assert.equal(fixture.writes.length, 0);
  controller.dispose();
});

test('completion rejects results over 2000 UTF-8 bytes before any CRM mutation', async () => {
  const fixture = employeeFixture(); const controller = fixture.create(); await idle(controller);
  assert.equal(await controller.completeTask('19', 'я'.repeat(1001)), false);
  assert.equal(fixture.patches.length, 0); assert.equal(fixture.writes.length, 0); controller.dispose();
});

test('partial CRM success survives reload and explicitly retries one captured stop command', async () => {
  const fixture = employeeFixture({ failStop: 1 }); let controller = fixture.create(); await idle(controller);
  assert.equal(await controller.completeTask('19', 'Сделано'), false);
  assert.equal(fixture.patches.length, 1);
  assert.equal(controller.getSnapshot().completion.phase, 'stop_pending'); assert.equal(controller.getSnapshot().pending, true);
  assert.match(controller.getSnapshot().error, /Задача завершена в amoCRM/);
  assert.equal(await controller.startOther('Another action'), false);
  fixture.setEnabled(false);
  controller.dispose(); controller = fixture.create(); await idle(controller);
  assert.equal(controller.getSnapshot().enabled, false);
  assert.equal(fixture.writes.length, 1, 'reload only reads, without silently resending');
  assert.equal(controller.getSnapshot().pending, true);
  assert.equal(await controller.refresh(), true);
  assert.equal(fixture.patches.length, 1, 'successful CRM PATCH is not repeated');
  assert.equal(fixture.writes[0].id, fixture.writes[1].id);
  assert.deepEqual(fixture.writes[0].command, fixture.writes[1].command);
  assert.equal(controller.getSnapshot().active, null); assert.equal(controller.getSnapshot().completion, null); controller.dispose();
});

test('unknown CRM PATCH response is reconciled by reading completion instead of repeating PATCH', async () => {
  const fixture = employeeFixture({ failPatchAfterCommit: 1 }); let controller = fixture.create(); await idle(controller);
  assert.equal(await controller.completeTask('19', 'Сделано'), false);
  assert.equal(controller.getSnapshot().completion.phase, 'crm_pending');
  controller.dispose(); controller = fixture.create(); await idle(controller);
  assert.equal(fixture.patches.length, 1); assert.equal(fixture.writes.length, 0);
  assert.equal(await controller.refresh(), true);
  assert.equal(fixture.patches.length, 1);
  assert.equal(fixture.writes[0].command.session_id, 'server-work'); controller.dispose();
});

test('CRM validation rejection clears the completion intent and leaves the active timer intact', async () => {
  const fixture = employeeFixture({ rejectPatch: 400 }); const controller = fixture.create(); await idle(controller);
  assert.equal(await controller.completeTask('19', 'Результат'), false);
  assert.equal(fixture.task.is_completed, false);
  assert.equal(controller.getSnapshot().completion, null);
  assert.equal(controller.getSnapshot().active.serverId, 'server-work');
  assert.match(controller.getSnapshot().error, /amoCRM отклонила завершение задачи/);
  assert.equal(await controller.refresh(), true);
  assert.equal(fixture.patches.length, 1, 'refresh does not replay a rejected completion');
  assert.equal(await controller.stop(), true);
  controller.dispose();
});

test('a stored completion rejected by CRM is released without changing the task or timer', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  storage.setItem('rkrs-activity-completion:https://api.example.test:rkrs_activity_panel:42:7', JSON.stringify({ taskId: 19, result: '', sessionId: '', phase: 'crm_pending' }));
  const fixture = employeeFixture({ storage, rejectPatch: 400 }); const controller = fixture.create(); await idle(controller);
  assert.equal(await controller.refresh(), false);
  assert.equal(controller.getSnapshot().completion, null);
  assert.equal(fixture.task.is_completed, false); assert.equal(fixture.writes.length, 0);
  assert.equal(await controller.refresh(), true); assert.equal(fixture.patches.length, 0);
  controller.dispose();
});

test('completion recovery never closes a different session started by another tab', async () => {
  const fixture = employeeFixture({ failPatchAfterCommit: 1 }); const controller = fixture.create(); await idle(controller);
  await controller.completeTask('19', 'Сделано');
  fixture.replaceCurrent({ id: 'foreign-new', kind: 'activity', started_at: 200, context: { activity_type: 'other', activity_name: 'Other' } });
  assert.equal(await controller.refresh(), true);
  assert.equal(fixture.patches.length, 1); assert.equal(fixture.writes.length, 0);
  assert.equal(controller.getSnapshot().active.serverId, 'foreign-new'); assert.equal(controller.getSnapshot().completion, null); controller.dispose();
});

test('disposing a pending SDK read prevents late callbacks from issuing more reads or mutations', async () => {
  let resolve;
  const calls = [];
  const widget = { $authorizedAjax(options) { calls.push(options); const request = { done(fn) { resolve = fn; return request; }, fail() { return request; }, abort() {} }; return request; } };
  const controller = createLiveActivityController({ context: { widget, accountId: 42, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', storageImpl: null, documentImpl: { querySelectorAll: () => [] }, locationImpl: { pathname: '/' }, fetchImpl: async () => { throw Error('unexpected CRM request'); } });
  let emitted = 0; controller.subscribe(() => emitted++);
  controller.dispose(); resolve({ enabled: true, current: {}, settings: {} }); await settleImbox();
  assert.equal(calls.length, 1); assert.equal(emitted, 0); assert.equal(controller.getSnapshot().ready, false);
});


test('failed fresh server state blocks new commands instead of using previously healthy state', async () => {
  const fixture = employeeFixture(); const controller = fixture.create(); await idle(controller);
  assert.equal(controller.getSnapshot().ready, true);
  fixture.failNextState(); assert.equal(await controller.refresh(), false);
  assert.equal(controller.getSnapshot().ready, false);
  assert.equal(await controller.startOther('Must not start'), false);
  assert.equal(fixture.writes.length, 0);
  assert.equal(await controller.refresh(), true);
  assert.equal(await controller.startOther('Available again'), true);
  assert.equal(fixture.writes.length, 1); controller.dispose();
});

test('initial server failure does not load a CRM queue or permit writes', async () => {
  const fixture = employeeFixture({ failState: 1 }); const controller = fixture.create(); await idle(controller);
  assert.equal(controller.getSnapshot().ready, false); assert.equal(fixture.reads.length, 0);
  assert.equal(await controller.completeTask('19', 'Must not close'), false);
  assert.equal(fixture.patches.length, 0); assert.equal(fixture.writes.length, 0); controller.dispose();
});


test('disabled CRM completion recovery makes no new PATCH and an explicit stop abandons the intent', async () => {
  const fixture = employeeFixture({ failPatchBeforeCommit: 1 }); const controller = fixture.create(); await idle(controller);
  assert.equal(await controller.completeTask('19', 'Сделано'), false);
  assert.equal(controller.getSnapshot().completion.phase, 'crm_pending');
  fixture.setEnabled(false);
  assert.equal(await controller.refresh(), false);
  assert.equal(fixture.patches.length, 1); assert.equal(fixture.task.is_completed, false);
  assert.equal(await controller.stop(), true);
  assert.equal(controller.getSnapshot().completion, null);
  assert.equal(controller.getSnapshot().active, null); controller.dispose();
});

test('reloading an owned Imbox interval keeps it whole until the visible dialog changes', async () => {
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const identity = 'https://api.example.test:rkrs_activity_panel:42:7';
  const clientId = '11111111-1111-4111-8111-111111111111';
  storage.setItem(`rkrs-activity-client:${identity}`, clientId);
  // The controller's observer sees a real numeric dialog from the CRM DOM.
  let current = { id: 'restored-imbox', kind: 'activity', started_at: 100, context: { activity_type: 'imbox', activity_name: 'Imbox 77', client_id: clientId } };
  const writes = [], route = { pathname: '/imbox/77' };
  const widget = { $authorizedAjax(options) { const request = { done(fn) { queueMicrotask(() => {
    if (options.url.endsWith('/state')) return fn({ current, enabled: true, settings: {} });
    if (options.method === 'GET') return fn({ items: [] });
    const command = JSON.parse(options.data); writes.push(command); current = { id: 'next', kind: command.action, started_at: 200, context: command.context }; fn(current);
  }); return request; }, fail() { return request; } }; return request; } };
  const controller = createLiveActivityController({ context: { widget, accountId: 42, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', storageImpl: storage, documentImpl: { hidden: false, querySelectorAll: selector => selector.includes('notification') ? ['77', '88'].map(id => ({ dataset: { id }, querySelector: () => null })) : [] }, locationImpl: route, fetchImpl: async () => ({ ok: true, status: 204 }) });
  await idle(controller); controller.tick(); await settleImbox();
  assert.equal(writes.length, 0);
  assert.equal(controller.getSnapshot().active.serverId, 'restored-imbox');
  route.pathname = '/imbox/88'; controller.tick(); await settleImbox();
  assert.equal(writes.length, 1); assert.equal(writes[0].context.activity_name, 'Imbox 88'); controller.dispose();
});


test('missing OAuth metadata fails closed without using cached SDK credentials', async () => {
  let calls = 0;
  const controller = createController({ context: { widget: { $authorizedAjax() { calls++; }, $: { ajax() { calls++; } } }, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', documentImpl: { querySelectorAll: () => [] }, locationImpl: { pathname: '/' }, fetchImpl: async () => { throw Error('unexpected CRM'); } });
  await settleImbox();
  assert.equal(calls, 0); assert.equal(controller.getSnapshot().ready, false); assert.match(controller.getSnapshot().error, /OAuth UUID/); controller.dispose();
});

test('disposal aborts pending token and ignores its late result', async () => {
  let callback, aborted = 0, calls = 0;
  const pending = { done(fn) { callback = fn; return pending; }, fail() { return pending; }, abort() { aborted++; } };
  const widget = { get_settings: () => ({ oauth_client_uuid: 'a0ee1dca-76a6-4720-b1dc-c6a0ba52c07e' }), $: { ajax() { calls++; return pending; } } };
  const controller = createController({ context: { widget, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', documentImpl: { querySelectorAll: () => [] }, locationImpl: { pathname: '/' } });
  controller.dispose(); callback({ token: 'late-proof' }); await settleImbox();
  assert.equal(aborted, 1); assert.equal(calls, 1); assert.equal(controller.getSnapshot().ready, false);
});

function stateWidget(state, urls = []) {
  return { $authorizedAjax(options) {
    urls.push(options.url);
    const request = { done(fn) { queueMicrotask(() => fn(options.url.endsWith('/state') ? state() : state.history?.() || { items: [] })); return request; }, fail() { return request; } };
    return request;
  } };
}
const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const base = { apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', documentImpl: { hidden: false, querySelectorAll: () => [] }, locationImpl: { pathname: '/' } };

test('unenrolled employee without work is hidden, skips history and remembers enrolment', async () => {
  let enabled = false; const urls = []; const storage = memoryStorage();
  const widget = stateWidget(() => ({ current: {}, enabled, settings: {} }), urls);
  const make = () => createLiveActivityController({ ...base, context: { widget, accountId: 42, userId: 7 }, storageImpl: storage, fetchImpl: async () => ({ ok: true, status: 204 }) });
  let controller = make(); await idle(controller);
  assert.equal(controller.getSnapshot().hidden, true);
  assert.equal(urls.some(url => url.includes('/sessions')), false);
  controller.dispose();
  enabled = true; controller = make();
  assert.equal(controller.getSnapshot().hidden, true, 'the last known state applies before the first read');
  await idle(controller);
  assert.equal(controller.getSnapshot().hidden, false);
  controller.dispose();
  controller = make();
  assert.equal(controller.getSnapshot().hidden, false, 'an enrolled employee sees the panel immediately');
  await idle(controller); controller.dispose();
});

test('queue shows server-provided task type and entity names and falls back when a name is unavailable', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 28, 12) });
  const due = Date.UTC(2026, 9, 28, 12) / 1000 + 60;
  const reads = [];
  const fetchImpl = async url => {
    reads.push(url);
    if (url.includes('contacts?')) return { ok: false, status: 403 };
    const body = url.includes('tasks?') ? { _embedded: { tasks: [
      { id: 1, responsible_user_id: 7, text: 'Позвонить', task_type_id: 1, entity_type: 'leads', entity_id: 12, complete_till: due },
      { id: 2, responsible_user_id: 7, text: 'Написать', task_type_id: 3, entity_type: 'contacts', entity_id: 5, complete_till: due + 60 },
    ] } } : url.includes('leads?') ? { _embedded: { leads: [{ id: 12, name: 'Крупная сделка' }] } } : { _embedded: { task_types: [{ id: 1, name: 'Звонок' }, { id: 3, name: 'Письмо' }] } };
    return { ok: true, status: 200, json: async () => body };
  };
  const widget = stateWidget(() => ({ current: {}, enabled: true, settings: { consider_future_tasks: true } }));
  const controller = createLiveActivityController({ ...base, context: { widget, accountId: 42, userId: 7 }, storageImpl: null, fetchImpl });
  await idle(controller);
  const { tasks, ready } = controller.getSnapshot();
  assert.equal(ready, true);
  assert.deepEqual(tasks.map(task => [task.type, task.entityName]), [['Звонок', 'Крупная сделка'], ['Письмо', 'Контакт #5']]);
  assert.match(tasks[0].dueLabel, /^Сегодня, \d\d:\d\d$/);
  assert.equal(await controller.refresh(), true);
  assert.equal(controller.getSnapshot().tasks[0].entityName, 'Крупная сделка');
  controller.dispose();
});

test('queue completeness and freshness are shown with the list without blocking the panel', async t => {
  const now = Date.UTC(2026, 9, 28, 12);
  t.mock.timers.enable({ apis: ['Date'], now });
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ _embedded: { tasks: [{ id: 1, responsible_user_id: 7, text: 'Позвонить', entity_type: 'leads', entity_id: 12, complete_till: now / 1000 - 60 }], leads: [], task_types: [] } }) });
  let meta = { complete: false, stale: false, fetched_at: now / 1000 - 90 }, limited = null;
  const widget = stateWidget(() => ({ current: {}, enabled: true, settings: {} }));
  const controller = createLiveActivityController({ ...base, context: { widget, accountId: 42, userId: 7 }, storageImpl: null, fetchImpl, queueMeta: () => { if (limited) throw limited; return meta; } });
  await idle(controller);
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.ready, true); assert.equal(snapshot.error, ''); assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.queue.warning, true);
  assert.match(snapshot.queue.note, /^Показаны не все задачи · обновлено \d\d:\d\d$/);
  meta = { complete: true, stale: true, fetched_at: now / 1000 - 600 };
  assert.equal(await controller.refresh(), true);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.error, '', 'stale data is a notice, not a blocking error');
  assert.match(snapshot.queue.note, /^Данные могут быть устаревшими · обновлено/);
  meta = { complete: true, stale: false, fetched_at: now / 1000 };
  assert.equal(await controller.refresh(), true);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.queue.warning, false);
  assert.match(snapshot.queue.note, /^обновлено \d\d:\d\d$/);
  // A rejected reload keeps the last snapshot and marks it as old.
  limited = { status: 429, responseJSON: { error: { code: 'resource_exhausted', message: 'later' } }, getResponseHeader: () => '20' };
  assert.equal(await controller.refresh(), false);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.ready, true); assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.queue.warning, true);
  assert.match(snapshot.queue.note, /^Данные могут быть устаревшими: amoCRM временно ограничила запросы · обновлено/);
  controller.dispose();
});

test('today total excludes pauses and the part of an interval before midnight', async t => {
  const now = Date.UTC(2026, 9, 28, 12);
  t.mock.timers.enable({ apis: ['Date'], now });
  const midnight = new Date(now).setHours(0, 0, 0, 0) / 1000, at = now / 1000;
  const state = () => ({ current: {}, enabled: true, settings: {} });
  state.history = () => ({ items: [
    { id: 'night', kind: 'work', started_at: midnight - 600, stopped_at: midnight + 600, work_time_seconds: 1200, context: { task_name: 'Ночная задача' } },
    { id: 'pause', kind: 'pause', started_at: at - 3000, stopped_at: at - 2400, work_time_seconds: 0, context: {} },
    { id: 'call', kind: 'work', started_at: at - 2400, stopped_at: at - 1800, work_time_seconds: 600, context: { task_name: 'Звонок' } },
  ] });
  const controller = createLiveActivityController({ ...base, context: { widget: stateWidget(state), accountId: 42, userId: 7 }, storageImpl: null, fetchImpl: async () => ({ ok: true, status: 204 }) });
  await idle(controller);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.totalSeconds, 1200);
  assert.deepEqual(snapshot.history.find(row => row.id === 'pause'), { id: 'pause', kind: 'pause', title: 'Пауза', seconds: 600, finishedAt: (at - 2400) * 1000 });
  controller.dispose();
});

test('local validation errors keep the panel usable', async () => {
  const fixture = employeeFixture(); const controller = fixture.create(); await idle(controller);
  assert.equal(await controller.startOther('  '), false);
  assert.match(controller.getSnapshot().error, /заполните поле/);
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal(await controller.startOther('Подготовка отчёта'), true);
  assert.equal(fixture.writes.length, 1); controller.dispose();
});

test('compact view survives a new controller and a busy controller opens no management window', async () => {
  const storage = memoryStorage();
  const fixture = employeeFixture({ storage }); let controller = fixture.create();
  assert.equal(controller.openManagement(), false);
  await idle(controller);
  controller.updateSettings({ compact: true }); controller.dispose();
  controller = fixture.create();
  assert.equal(controller.getSnapshot().settings.compact, true);
  await idle(controller); controller.dispose();
});

const settled = controller => new Promise(resolve => { const check = () => controller.getSnapshot().busy ? setImmediate(check) : resolve(); setImmediate(check); });

test('a task completed in amoCRM outside the panel closes exactly its interval on queue refresh', async () => {
  const fixture = employeeFixture();
  const controller = fixture.create(); await settled(controller);
  assert.equal(controller.getSnapshot().active.id, '19');
  Object.assign(fixture.task, { is_completed: true, result: { text: 'Done in CRM' } });
  assert.equal(await controller.refresh(), true);
  assert.deepEqual(fixture.writes.map(row => row.command), [{ action: 'stop', session_id: 'server-work', context: { task_result: 'Done in CRM' } }]);
  assert.equal(controller.getSnapshot().active, null);
  controller.dispose();
});

test('an active task that only left the queue (reassigned, still open) keeps its interval', async () => {
  const fixture = employeeFixture({ rows: [] });
  const controller = fixture.create(); await settled(controller);
  assert.equal(await controller.refresh(), true);
  assert.equal(fixture.writes.length, 0);
  assert.equal(controller.getSnapshot().active.id, '19');
  controller.dispose();
});

test('amoCRM completion button is only intent: the interval stops after CRM confirms completion', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const clicks = [];
  const documentImpl = { hidden: false, querySelectorAll: () => [], addEventListener(type, fn) { if (type === 'click') clicks.push(fn); }, removeEventListener() {} };
  const fixture = employeeFixture();
  const controller = fixture.create({ documentImpl }); await settled(controller);
  const card = { dataset: { id: '19' } };
  // A native amoCRM button matches the completion selector, not the panel's own card action.
  const event = { target: { closest: selector => (selector.includes('rkrs-card-btn') ? null : { closest: () => card }) } };
  clicks.forEach(fn => fn(event));
  t.mock.timers.tick(2000); controller.tick(); await settled(controller);
  assert.equal(fixture.writes.length, 0, 'task still open in CRM: the click alone stops nothing');
  assert.equal(controller.getSnapshot().active.id, '19');
  Object.assign(fixture.task, { is_completed: true });
  t.mock.timers.tick(4000); controller.tick(); await settled(controller);
  assert.equal(fixture.writes.length, 0, 'rechecks are spaced to save the shared amoCRM budget');
  t.mock.timers.tick(1000); controller.tick(); await settled(controller);
  assert.deepEqual(fixture.writes.map(row => [row.command.action, row.command.session_id]), [['stop', 'server-work']]);
  assert.equal(controller.getSnapshot().active, null);
  controller.dispose();
});

test('a write in one tab makes the other tabs reread state and queue at once', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const channels = [];
  class FakeChannel {
    constructor(name) { this.name = name; channels.push(this); }
    postMessage(data) { for (const peer of channels) if (peer !== this && peer.name === this.name) peer.onmessage?.({ data }); }
    close() { channels.splice(channels.indexOf(this), 1); }
  }
  const fixture = employeeFixture();
  const first = fixture.create({ broadcastImpl: FakeChannel }), second = fixture.create({ broadcastImpl: FakeChannel });
  await settled(first); await settled(second);
  assert.equal(new Set(channels.map(channel => channel.name)).size, 1);
  const queueReads = () => fixture.reads.filter(url => url.includes('tasks?')).length;
  const before = queueReads();
  second.tick(); await settled(second);
  assert.equal(queueReads(), before, 'no reread without a change');
  await first.stop();
  const afterStop = queueReads();
  second.tick(); await settled(second);
  assert.equal(queueReads(), afterStop + 1);
  assert.equal(second.getSnapshot().active, null);
  first.dispose(); second.dispose();
  assert.equal(channels.length, 0);
});

test('today total includes the running interval but not pauses', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const now = 1800000000;
  let current = { id: 'run', kind: 'work', started_at: now - 600, context: { task_id: 19, task_name: 'Task' } };
  const widget = { $authorizedAjax(options) { const request = { done(fn) { queueMicrotask(() => fn(options.url.endsWith('/state') ? { current, enabled: true, settings: {} } : { items: [{ id: 'h', kind: 'work', started_at: now - 1000, stopped_at: now - 900, context: {} }] })); return request; }, fail() { return request; } }; return request; } };
  const controller = createLiveActivityController({ context: { widget, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ _embedded: { tasks: [], task_types: [] } }) }), documentImpl: { hidden: false, querySelectorAll: () => [] }, locationImpl: { pathname: '/' }, broadcastImpl: null });
  await settled(controller);
  controller.tick();
  assert.equal(controller.getSnapshot().totalSeconds, 700);
  current = { id: 'p', kind: 'pause', started_at: now - 300, context: {} };
  await controller.refresh(); controller.tick();
  assert.equal(controller.getSnapshot().totalSeconds, 100);
  controller.dispose();
});

test('the running task is the initial selection, so no switch is offered until the user picks another task', async () => {
  const fixture = employeeFixture({ rows: [{ id: 5, responsible_user_id: 7, text: 'Earlier task', task_type_id: 1, complete_till: 100, is_completed: false }, { id: 19, responsible_user_id: 7, text: 'Real task', task_type_id: 1, complete_till: 200, is_completed: false }] });
  const controller = fixture.create(); await settled(controller);
  assert.equal(controller.getSnapshot().tasks[0].id, '5');
  assert.equal(controller.getSnapshot().selectedTaskId, '19');
  controller.selectTask('5');
  await controller.refresh();
  assert.equal(controller.getSnapshot().selectedTaskId, '5', 'a resync keeps the explicit selection');
  assert.equal(controller.getSnapshot().active.id, '19');
  controller.dispose();
});

test('task cards get the action matching the running task and lose it on dispose', async () => {
  const dom = new JSDOM('<!doctype html><body>' + [19, 20].map(id => `<div class="feed-note-wrapper-task" data-id="${id}"><div class="card-task"><div class="card-task__inner-content"><p>Task</p></div></div></div>`).join('') + '</body>');
  const doc = dom.window.document;
  const card = id => doc.querySelector(`[data-id="${id}"]`);
  const label = id => card(id).querySelector('.card-task__inner-content .rkrs-card-btn')?.textContent;
  const fixture = employeeFixture({ rows: [{ id: 19, responsible_user_id: 7, text: 'Real task', task_type_id: 1, complete_till: 200 }, { id: 20, responsible_user_id: 7, text: 'Next', task_type_id: 1, complete_till: 300 }] });
  const controller = fixture.create({ documentImpl: doc }); await idle(controller);
  controller.tick();
  assert.equal(label(19), 'Остановить задачу');
  assert.equal(label(20), 'Переключиться на задачу');
  assert.ok(card(19).querySelector('.card-task').classList.contains('rkrs-active-task-card'));
  assert.equal(card(20).querySelector('.card-task').classList.contains('rkrs-active-task-card'), false);
  card(19).querySelector('.rkrs-card-btn').click();
  await idle(controller);
  assert.equal(controller.getSnapshot().active, null);
  assert.equal(label(19), 'Взять в работу', 'the card follows a stop without waiting for the clock');
  assert.equal(card(19).querySelector('.card-task').classList.contains('rkrs-active-task-card'), false);
  controller.dispose();
  assert.equal(doc.querySelector('.rkrs-card-action'), null);
  assert.equal(doc.querySelector('.rkrs-task-card-content'), null);
  dom.window.close();
});

function cardsDom(ids) {
  const dom = new JSDOM('<!doctype html><body>' + ids.map(id => `<div class="feed-note-wrapper-task" data-id="${id}"><div class="card-task"><div class="card-task__inner-content"><p>Task</p></div></div></div>`).join('') + '</body>', { pretendToBeVisual: true });
  return { dom, doc: dom.window.document, card: id => dom.window.document.querySelector(`[data-id="${id}"]`) };
}

test('only the employee\'s own open tasks get a card action', async () => {
  const { dom, doc, card } = cardsDom([19, 20, 30, 31]);
  // 30 is another employee's task, 31 is completed or a note: neither is in the own queue.
  const fixture = employeeFixture({ rows: [{ id: 19, responsible_user_id: 7, text: 'Real task', task_type_id: 1, complete_till: 200 }, { id: 20, responsible_user_id: 7, text: 'Next', task_type_id: 1, complete_till: 300 }, { id: 30, responsible_user_id: 8, text: 'Foreign', task_type_id: 1, complete_till: 300 }] });
  const controller = fixture.create({ documentImpl: doc }); await idle(controller);
  controller.tick();
  assert.ok(card(19).querySelector('.rkrs-card-btn'));
  assert.ok(card(20).querySelector('.rkrs-card-btn'));
  assert.equal(card(30).querySelector('.rkrs-card-btn'), null);
  assert.equal(card(31).querySelector('.rkrs-card-btn'), null);
  assert.equal(card(31).querySelector('.rkrs-task-card-content'), null);
  controller.dispose(); dom.window.close();
});

test('an unchanged card is never written to and a click goes through a re-rendered feed', async () => {
  const { dom, doc, card } = cardsDom([19, 20]);
  const fixture = employeeFixture({ rows: [{ id: 19, responsible_user_id: 7, text: 'Real task', task_type_id: 1, complete_till: 200 }, { id: 20, responsible_user_id: 7, text: 'Next', task_type_id: 1, complete_till: 300 }] });
  const controller = fixture.create({ documentImpl: doc }); await idle(controller);
  controller.tick();
  const button = card(20).querySelector('.rkrs-card-btn');
  const records = [];
  const observer = new dom.window.MutationObserver(list => records.push(...list));
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
  for (let i = 0; i < 5; i++) controller.tick();
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(records.length, 0, 'an idle clock must not touch amoCRM\'s DOM');
  observer.disconnect();
  assert.equal(card(20).querySelector('.rkrs-card-btn'), button);
  card(19).querySelector('.rkrs-card-btn').click();
  await idle(controller);
  assert.equal(controller.getSnapshot().active, null);
  assert.equal(button.textContent, 'Взять в работу', 'the same button follows the new state');
  assert.equal(card(20).querySelector('.rkrs-card-btn'), button);
  controller.dispose(); dom.window.close();
});

test('a failed start keeps the card actions in place instead of removing them', async () => {
  const { dom, doc, card } = cardsDom([19, 20]);
  const fixture = employeeFixture({ rows: [{ id: 19, responsible_user_id: 7, text: 'Real task', task_type_id: 1, complete_till: 200 }, { id: 20, responsible_user_id: 7, text: 'Next', task_type_id: 1, complete_till: 300 }] });
  const controller = fixture.create({ documentImpl: doc }); await idle(controller);
  controller.tick();
  const button = card(20).querySelector('.rkrs-card-btn');
  // Task 20 has no CRM record in this fixture, so starting it fails.
  button.click();
  await idle(controller);
  assert.ok(controller.getSnapshot().error);
  assert.equal(card(20).querySelector('.rkrs-card-btn'), button);
  controller.dispose(); dom.window.close();
});
