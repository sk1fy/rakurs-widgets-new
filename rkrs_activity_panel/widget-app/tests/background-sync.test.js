import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveActivityController } from '../src/live-controller.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ storage = null, apiOrigin = 'https://api.example.test' } = {}) {
  const calls = [], held = [], channels = [];
  let current = null, history = [];
  const hold = new Set();
  const failures = new Map();
  const route = { pathname: '/' }, events = {};
  const widget = { get_settings: () => ({ oauth_client_uuid: 'a0ee1dca-76a6-4720-b1dc-c6a0ba52c07e' }), $: { ajax(options) {
    const path = options.url.includes('/disposable_token') ? 'token' : options.url.split('/api/v1/widget/activity/')[1];
    if (path !== 'token') calls.push(options);
    let failure;
    const result = { done(fn) {
      queueMicrotask(() => {
        const respond = () => {
          const failureKey = path.startsWith('sessions?') ? 'history' : path;
          if (failures.get(failureKey)) { const entry = failures.get(failureKey); const status = typeof entry === 'object' ? entry.status : entry === 409 ? 409 : 503; failures.set(failureKey, typeof entry === 'object' ? (entry.remaining > 1 ? { ...entry, remaining: entry.remaining - 1 } : 0) : status === 409 ? 0 : entry - 1); return failure({ status }); }
          if (path === 'token') return fn({ token: 'fresh-token' });
          if (path === 'state') return fn({ current: structuredClone(current), enabled: true, settings: { include_related_deals: true } });
          if (path.startsWith('sessions?')) return fn({ items: structuredClone(history) });
          if (/^tasks\/\d+$/.test(path)) return fn({ id: 19, responsible_user_id: 7, text: 'Task', is_completed: false });
          if (path.startsWith('tasks')) return fn({ tasks: [], complete: true });
          if (path === 'browser-session') return fn({ url: 'https://panel.example.test/settings' });
          const body = JSON.parse(options.data);
          const receipt = body.action === 'stop' ? { id: body.session_id, stopped_at: 200 } : { id: `session-${calls.length}`, kind: body.action, started_at: 100, context: body.context };
          current = receipt.stopped_at ? null : receipt;
          fn(receipt);
        };
        if (options.method === 'GET' && hold.has(path.split('?')[0])) held.push({ path, respond, fn }); else respond();
      });
      return result;
    }, fail(fn) { failure = fn; return result; }, abort() {} };
    return result;
  } } };
  class Channel { constructor() { channels.push(this); } postMessage() {} close() {} }
  const documentImpl = { hidden: false, querySelectorAll: () => [], addEventListener(name, fn) { events[name] = fn; }, removeEventListener() {}, defaultView: { addEventListener(name, fn) { events[name] = fn; }, removeEventListener() {} } };
  const controller = createLiveActivityController({ context: { widget, accountId: 42, userId: 7 }, apiOrigin, appOrigin: 'https://panel.example.test', storageImpl: storage, broadcastImpl: Channel, documentImpl, locationImpl: route });
  return { controller, calls, hold, held, failures, route, events, channels, documentImpl, setCurrent(value) { current = value; }, setHistory(value) { history = value; } };
}

test('background history leaves activity commands available and publishes their receipts immediately', async () => {
  const f = fixture();
  await flush();
  f.hold.add('sessions');
  const refresh = f.controller.refresh();
  await flush();
  assert.equal(f.held.length, 1);
  assert.equal(f.controller.getSnapshot().busy, false, 'background history never owns command busy');
  assert.equal(await f.controller.startOther('Work'), true);
  const active = f.controller.getSnapshot().active;
  assert.equal(active.title, 'Work');
  assert.equal(await f.controller.stop(), true);
  assert.equal(f.controller.getSnapshot().active, null);
  assert.equal(JSON.parse(f.calls.findLast(row => row.method === 'POST').data).session_id, active.serverId);
  f.hold.clear();
  f.held.splice(0).forEach(row => row.respond());
  await refresh;
  f.controller.dispose();
});


test('late state and history cannot replace a confirmed session or change the next CAS identity', async () => {
  const f = fixture(); await flush();
  f.hold.add('state');
  const refresh = f.controller.refresh(); await flush();
  const oldState = f.held.shift();
  assert.equal(await f.controller.startOther('First'), true);
  const first = f.controller.getSnapshot().active.serverId;
  oldState.fn({ enabled: true, current: null, settings: {} });
  await refresh;
  assert.equal(f.controller.getSnapshot().active.serverId, first);
  assert.equal(await f.controller.startOther('Second'), true);
  const writes = f.calls.filter(row => row.method === 'POST');
  assert.equal(JSON.parse(writes[1].data).expected_session_id, first);
  f.controller.dispose();
});

test('obsolete history pagination stops and a new command can launch fresh history without waiting', async () => {
  const f = fixture(); await flush();
  f.hold.add('sessions');
  const refresh = f.controller.refresh(); await flush();
  const old = f.held.shift();
  assert.equal(await f.controller.startOther('Work'), true); await flush();
  assert.equal(f.held.length, 1, 'the new generation has its own history request');
  old.fn({ items: [{ id: 'obsolete', kind: 'activity', started_at: 1, stopped_at: 2, context: {} }], next_cursor: 'old-page-2' });
  await refresh;
  assert.equal(f.calls.some(row => row.url.includes('old-page-2')), false);
  assert.deepEqual(f.controller.getSnapshot().history, []);
  f.held.shift().fn({ items: [] }); await flush();
  assert.equal(f.controller.getSnapshot().historyStale, false);
  f.controller.dispose();
});

test('history failure after a confirmed command is a read warning and leaves further commands available', async () => {
  const f = fixture(); await flush();
  f.failures.set('history', 1);
  assert.equal(await f.controller.startOther('Confirmed'), true); await flush();
  assert.equal(f.controller.getSnapshot().error, '');
  assert.ok(f.controller.getSnapshot().readWarning);
  assert.equal(f.controller.getSnapshot().ready, true);
  assert.equal(f.controller.getSnapshot().active.title, 'Confirmed');
  assert.equal(await f.controller.pause(), true);
  f.controller.dispose();
});

test('replay confirms the original command but failed mandatory state reconciliation gates new mutations', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const f = fixture({ storage }); await flush();
  f.failures.set('sessions', 1);
  assert.equal(await f.controller.startOther('Original'), false);
  assert.equal(f.controller.getSnapshot().pending, true);
  f.failures.set('state', 1);
  assert.equal(await f.controller.refresh(), false);
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.equal(f.controller.getSnapshot().recoveryRequired, true);
  assert.equal(f.controller.getSnapshot().active.title, 'Original');
  assert.equal(f.controller.getSnapshot().error, '', 'the confirmed replay is not reported as a command failure');
  assert.ok(f.controller.getSnapshot().readWarning);
  assert.equal(await f.controller.pause(), false);
  assert.equal(await f.controller.stop(), false);
  const writes = f.calls.filter(row => row.method === 'POST');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].headers['Idempotency-Key'], writes[1].headers['Idempotency-Key']);
  assert.equal(writes[0].data, writes[1].data);
  assert.ok([...values.keys()].some(key => key.startsWith('rkrs-activity-reconcile:')));
  f.setCurrent({ id: 'foreign', kind: 'activity', started_at: 100, context: { activity_type: 'other', activity_name: 'Other tab' } });
  assert.equal(await f.controller.refresh(), true);
  assert.equal(f.controller.getSnapshot().active.serverId, 'foreign');
  assert.equal(f.controller.getSnapshot().recoveryRequired, false);
  assert.equal(await f.controller.pause(), true);
  assert.equal(JSON.parse(f.calls.findLast(row => row.method === 'POST').data).expected_session_id, 'foreign');
  f.controller.dispose();
});

test('definitive CAS conflict requires fresh state before another mutation', async () => {
  const f = fixture(); await flush();
  f.failures.set('sessions', 409); f.failures.set('state', 1);
  assert.equal(await f.controller.startOther('Conflict'), false);
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.equal(f.controller.getSnapshot().recoveryRequired, true);
  assert.equal(await f.controller.pause(), false);
  assert.equal(await f.controller.refresh(), true);
  assert.equal(await f.controller.pause(), true);
  f.controller.dispose();
});

test('focus and visibility keep the 90-second state baseline and card changes read only their queue', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(); await flush();
  const count = suffix => f.calls.filter(row => row.url.includes(suffix)).length;
  const stateReads = count('/state'), historyReads = count('/sessions?'), queueReads = count('/tasks');
  for (let i = 0; i < 5; i++) { f.events.focus(); f.events.visibilitychange(); }
  f.route.pathname = '/leads/detail/1'; f.controller.tick(); await flush();
  assert.equal(count('/state'), stateReads); assert.equal(count('/sessions?'), historyReads);
  assert.equal(count('/tasks'), queueReads + 1);
  t.mock.timers.tick(89999); f.controller.tick(); await flush();
  assert.equal(count('/state'), stateReads);
  t.mock.timers.tick(1); f.controller.tick(); await flush();
  assert.equal(count('/state'), stateReads + 1);
  assert.equal(count('/sessions?'), historyReads + 1, 'history has its own bounded periodic refresh');
  f.controller.dispose();
});

test('meaningful cross-tab invalidation replaces an outstanding state ticket and coalesces; noise is ignored', async () => {
  const f = fixture(); await flush();
  f.hold.add('state');
  const refresh = f.controller.refresh(); await flush();
  const old = f.held.shift();
  const before = f.calls.length;
  for (let i = 0; i < 10; i++) f.channels[0].onmessage({ data: { type: 'ping' } });
  await flush(); assert.equal(f.calls.length, before);
  for (let i = 0; i < 10; i++) f.channels[0].onmessage({ data: { type: 'session-changed' } });
  await flush(); assert.equal(f.calls.length, before + 1);
  const replacement = f.held.shift();
  old.fn({ enabled: true, current: { id: 'stale', kind: 'activity', started_at: 100, context: {} }, settings: {} });
  await refresh;
  assert.equal(f.controller.getSnapshot().active, null);
  replacement.fn({ enabled: true, current: { id: 'fresh', kind: 'activity', started_at: 100, context: {} }, settings: {} });
  await flush(); assert.equal(f.controller.getSnapshot().active.serverId, 'fresh');
  f.controller.dispose();
});

test('lead-scoped queue responses cannot replace the newly opened card and backoff is respected', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(); await flush();
  f.hold.add('tasks');
  f.route.pathname = '/leads/detail/1'; f.controller.tick(); await flush();
  const first = f.held.shift();
  f.route.pathname = '/leads/detail/2'; f.controller.tick(); await flush();
  const second = f.held.shift();
  second.fn({ tasks: [{ id: 2, text: 'Second lead', complete_till: 1800000000 }], retry_after_seconds: 10 }); await flush();
  first.fn({ tasks: [{ id: 1, text: 'Old lead', complete_till: 1800000000 }] }); await flush();
  assert.deepEqual(f.controller.getSnapshot().tasks.map(row => row.id), ['2']);
  const before = f.calls.length;
  f.route.pathname = '/leads/detail/3'; f.controller.tick(); await flush();
  assert.equal(f.calls.length, before);
  t.mock.timers.tick(10000); f.controller.tick(); await flush();
  assert.equal(f.calls.length, before + 1);
  assert.ok(f.calls.at(-1).url.endsWith('tasks?lead_id=3'));
  f.controller.dispose();
});

test('settings navigation has its own request slot while background history is pending', async () => {
  const f = fixture(); await flush();
  const original = globalThis.window;
  let navigated;
  globalThis.window = { open: () => ({ location: { replace(value) { navigated = value; } }, close() {} }) };
  try {
    f.hold.add('sessions');
    const refresh = f.controller.refresh(); await flush();
    assert.equal(await f.controller.openManagement(), true);
    assert.equal(navigated, 'https://panel.example.test/settings');
    assert.equal(f.controller.getSnapshot().busy, false);
    assert.equal(await f.controller.startOther('Work'), true);
    f.held.splice(0).forEach(row => row.fn({ items: [] })); await refresh;
  } finally { globalThis.window = original; f.controller.dispose(); }
});


test('a newer meaningful signal invalidates a targeted read already in flight', async () => {
  const f = fixture(); await flush();
  f.hold.add('state');
  f.channels[0].onmessage({ data: { type: 'session-changed' } }); await flush();
  const first = f.held.shift();
  f.channels[0].onmessage({ data: { type: 'session-changed' } }); await flush();
  const latest = f.held.shift();
  assert.ok(latest);
  first.fn({ current: { id: 'old-signal', kind: 'activity', started_at: 100, context: {} }, enabled: true, settings: {} }); await flush();
  assert.equal(f.controller.getSnapshot().active, null);
  latest.fn({ current: { id: 'latest-signal', kind: 'activity', started_at: 100, context: {} }, enabled: true, settings: {} }); await flush();
  assert.equal(f.controller.getSnapshot().active.serverId, 'latest-signal');
  f.controller.dispose();
});

test('disposal during a held history page prevents cursor reads and late publication', async () => {
  const f = fixture(); await flush();
  f.hold.add('sessions');
  const refresh = f.controller.refresh(); await flush();
  const held = f.held.shift();
  f.controller.dispose();
  const before = f.calls.length;
  held.fn({ items: [], next_cursor: 'next-after-dispose' });
  await refresh;
  assert.equal(f.calls.length, before);
  assert.equal(f.calls.some(row => row.url.includes('next-after-dispose')), false);
});


test('a cross-tab command invalidates history started before its notification', async () => {
  const f = fixture(); await flush();
  f.hold.add('sessions');
  const refresh = f.controller.refresh(); await flush();
  const old = f.held.shift();
  f.channels[0].onmessage({ data: { type: 'session-changed' } }); await flush();
  const fresh = f.held.shift();
  assert.ok(fresh);
  old.fn({ items: [{ id: 'obsolete', kind: 'activity', started_at: 1, stopped_at: 2, context: {} }] }); await refresh;
  assert.deepEqual(f.controller.getSnapshot().history, []);
  assert.equal(f.controller.getSnapshot().historyStale, true);
  fresh.fn({ items: [] }); await flush();
  assert.equal(f.controller.getSnapshot().historyStale, false);
  f.controller.dispose();
});

test('failed cross-tab reconciliation is retried on the baseline or explicit refresh, not focus noise', async () => {
  const f = fixture(); await flush();
  f.failures.set('state', 1);
  f.channels[0].onmessage({ data: { type: 'session-changed' } }); await flush();
  const before = f.calls.filter(row => row.url.endsWith('/state')).length;
  for (let i = 0; i < 10; i++) { f.events.focus(); f.events.visibilitychange(); f.controller.tick(); }
  await flush();
  assert.equal(f.calls.filter(row => row.url.endsWith('/state')).length, before);
  assert.equal(f.controller.getSnapshot().invalidated, true);
  assert.equal(await f.controller.startOther('Wait for state'), false);
  assert.equal(await f.controller.refresh(), true);
  assert.equal(f.controller.getSnapshot().invalidated, false);
  assert.equal(f.controller.getSnapshot().error, '');
  f.controller.dispose();
});


test('periodic history finds a remote interval completed entirely between state polls', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(); await flush();
  f.setHistory([{ id: 'remote-closed', kind: 'activity', started_at: 1799999990, stopped_at: 1799999999, context: { activity_name: 'Remote work' } }]);
  t.mock.timers.tick(90000); f.controller.tick(); await flush();
  assert.equal(f.controller.getSnapshot().active, null);
  assert.deepEqual(f.controller.getSnapshot().history.map(row => row.id), ['remote-closed']);
  assert.equal(f.controller.getSnapshot().totalSeconds, 9);
  f.controller.dispose();
});


test('every queue failure backs off and hidden lead navigation sends no queue requests', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(); await flush();
  const count = () => f.calls.filter(row => row.url.includes('/tasks')).length;
  f.failures.set('tasks?lead_id=1', { status: 500, remaining: 3 });
  f.route.pathname = '/leads/detail/1'; f.controller.tick(); await flush();
  const before = count();
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(1000); f.controller.tick(); await flush(); }
  assert.equal(count(), before, 'HTTP500 must not trigger one queue request per tick');
  t.mock.timers.tick(1000); f.controller.tick(); await flush();
  assert.equal(count(), before + 1, 'the first retry is eligible after five seconds');
  for (let i = 0; i < 9; i++) { t.mock.timers.tick(1000); f.controller.tick(); await flush(); }
  assert.equal(count(), before + 1, 'repeated failures extend the delay');
  f.documentImpl.hidden = true;
  f.route.pathname = '/leads/detail/2';
  t.mock.timers.tick(30000); f.controller.tick(); await flush();
  assert.equal(count(), before + 1, 'a hidden new card cannot bypass the retry schedule');
  f.documentImpl.hidden = false; f.controller.tick(); await flush();
  assert.equal(count(), before + 2);
  f.controller.dispose();
});

test('missing API configuration keeps tick and explicit refresh safe', async () => {
  const invalid = fixture({ apiOrigin: 'invalid-api-origin' });
  await flush();
  assert.match(invalid.controller.getSnapshot().error, /API Activity/);
  assert.doesNotThrow(() => invalid.controller.tick());
  assert.equal(await invalid.controller.refresh(), false);
  assert.deepEqual(invalid.calls, []);
  invalid.controller.dispose();
});

test('a cross-tab signal during a completion preflight asks for retry without claiming the action finished', async () => {
  const f = fixture(); await flush();
  f.hold.add('state');
  const complete = f.controller.completeTask('19', 'Done'); await flush();
  const owned = f.held.shift(); assert.ok(owned);
  f.channels[0].onmessage({ data: { type: 'session-changed' } });
  owned.fn({ current: null, enabled: true, settings: {} });
  assert.equal(await complete, false);
  assert.match(f.controller.getSnapshot().error, /Состояние изменилось/);
  assert.equal(f.controller.getSnapshot().completion, null);
  assert.equal(f.calls.some(row => row.method === 'POST'), false);
  f.controller.dispose();
});


test('routine invalidation is pending state knowledge, not uncertain command recovery', async () => {
  const f = fixture(); await flush();
  f.hold.add('state');
  f.channels[0].onmessage({ data: { type: 'session-changed' } }); await flush();
  const snapshot = f.controller.getSnapshot();
  assert.equal(snapshot.invalidated, true);
  assert.equal(snapshot.pending, false);
  assert.equal(snapshot.recoveryRequired, false);
  assert.equal(snapshot.error, '');
  assert.equal(snapshot.readWarning, '');
  f.controller.dispose();
});

test('targeted state refresh warns only after failure and clears the warning after success', async () => {
  const f = fixture(); await flush();
  f.hold.add('state');
  f.channels[0].onmessage({ data: { type: 'session-changed' } }); await flush();
  assert.equal(f.controller.getSnapshot().readWarning, '');
  assert.equal(f.controller.getSnapshot().error, '');
  f.hold.clear(); f.failures.set('state', 1); f.held.shift().respond(); await flush();
  assert.ok(f.controller.getSnapshot().readWarning);
  assert.equal(f.controller.getSnapshot().error, '');
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.equal(await f.controller.refresh(), true);
  assert.equal(f.controller.getSnapshot().invalidated, false);
  assert.equal(f.controller.getSnapshot().readWarning, '');
  f.controller.dispose();
});

test('accepted state clears a superseded preflight error but preserves a genuine action rejection', async () => {
  const f = fixture(); await flush();
  f.hold.add('state');
  const complete = f.controller.completeTask('19', 'Done'); await flush();
  const owned = f.held.shift();
  f.channels[0].onmessage({ data: { type: 'session-changed' } });
  owned.fn({ current: null, enabled: true, settings: {} });
  assert.equal(await complete, false);
  assert.match(f.controller.getSnapshot().error, /Состояние изменилось/);
  await flush();
  const recovery = f.controller.refresh();
  f.hold.clear(); f.held.shift().respond();
  assert.equal(await recovery, true);
  assert.equal(f.controller.getSnapshot().error, '');
  assert.equal(await f.controller.startOther(''), false);
  const actionError = f.controller.getSnapshot().error;
  assert.ok(actionError);
  assert.equal(await f.controller.refresh(), true);
  assert.equal(f.controller.getSnapshot().error, actionError);
  f.controller.dispose();
});


test('accepted background state preserves the CRM-completed stop-unconfirmed recovery message', async () => {
  const f = fixture();
  f.setCurrent({ id: 'task-session', kind: 'work', started_at: 100, context: { task_id: 19, task_name: 'Task' } });
  await flush(); f.hold.add('state');
  const complete = f.controller.completeTask('19', 'Done'); await flush();
  f.held.shift().respond(); await flush();
  f.held.shift().respond(); await flush();
  const stopCheck = f.held.shift(); assert.ok(stopCheck);
  f.channels[0].onmessage({ data: { type: 'session-changed' } });
  stopCheck.respond();
  assert.equal(await complete, false);
  assert.equal(f.controller.getSnapshot().completion.phase, 'stop_pending');
  assert.match(f.controller.getSnapshot().error, /Задача завершена в amoCRM; остановка учёта времени не подтверждена/);
  await flush();
  f.hold.clear(); f.held.shift().respond(); await flush();
  assert.equal(f.controller.getSnapshot().invalidated, false);
  assert.equal(f.controller.getSnapshot().completion.phase, 'stop_pending');
  assert.match(f.controller.getSnapshot().error, /Задача завершена в amoCRM; остановка учёта времени не подтверждена/);
  assert.equal(f.calls.filter(row => row.method === 'POST' && row.url.endsWith('/sessions')).length, 0);
  f.controller.dispose();
});
