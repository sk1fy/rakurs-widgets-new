import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLiveActivityController } from '../src/live-controller.js';
import { createLiveSDK, apiOrigin, appOrigin, accountId, userId, viewKey } from '../fixtures/live-sdk.js';

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
const work = (id = 'captured-work') => ({ id, kind: 'work', started_at: 1800000000, context: { task_id: 19, task_name: 'Проверить предложение' } });
function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><div class="feed-note-wrapper-task" data-id="19"><div class="card-task"><div class="card-task__inner-content"></div><div class="card-task__actions"><button class="js-complete-task"><span>Выполнить</span></button></div></div></div>', { url: 'https://crm.example.test/leads/detail/12' });
  let hidden = false;
  Object.defineProperty(dom.window.document, 'hidden', { get: () => hidden });
  const sdk = createLiveSDK({ current: work(), ...options });
  const controller = createLiveActivityController({ context: { widget: sdk.widget, accountId, userId }, apiOrigin, appOrigin, documentImpl: dom.window.document, locationImpl: dom.window.location, storageImpl: dom.window.localStorage, broadcastImpl: null });
  t.after(() => { controller.dispose(); dom.window.close(); });
  return { sdk, controller, document: dom.window.document, click() { dom.window.document.querySelector('.js-complete-task span').click(); }, hide(value = true) { hidden = value; }, count(kind) { return sdk.requests.filter(r => r.kind === kind).length; } };
}

for (const cache of [false, true]) {
  test(`initial state failure stays visible and recovers with ${cache ? 'cached disabled' : 'empty'} enrollment`, async t => {
    const dom = new JSDOM('', { url: 'https://crm.example.test/' });
    if (cache) dom.window.localStorage.setItem(viewKey, JSON.stringify({ enabled: false }));
    const sdk = createLiveSDK({ failState: 1 });
    const controller = createLiveActivityController({ context: { widget: sdk.widget, accountId, userId }, apiOrigin, appOrigin, documentImpl: dom.window.document, locationImpl: dom.window.location, storageImpl: dom.window.localStorage, broadcastImpl: null });
    t.after(() => { controller.dispose(); dom.window.close(); });
    assert.equal(controller.getSnapshot().hidden, true, 'no loading flash');
    await flush();
    assert.equal(controller.getSnapshot().ready, false);
    assert.match(controller.getSnapshot().error, /Fixture state unavailable/);
    assert.equal(controller.getSnapshot().hidden, false, 'the initialization error exposes recovery');
    assert.equal(sdk.requests.some(r => r.kind === 'tasks'), false);
    sdk.setEnabled(!cache);
    assert.equal(await controller.refresh(), true);
    assert.equal(controller.getSnapshot().hidden, cache);
    assert.equal(controller.getSnapshot().error, '');
  });
}

test('native completion starts no observation while hidden and resumes when visible', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.click(); f.sdk.task.is_completed = true;
  f.hide(); t.mock.timers.tick(2000); f.controller.tick(); await flush();
  assert.equal(f.count('detail'), 0);
  assert.equal(f.sdk.commands.length, 0);
  f.hide(false); f.controller.tick(); await flush();
  assert.equal(f.sdk.commands.length, 1);
  assert.equal(f.sdk.commands[0].session_id, 'captured-work');
});

test('native and queue completion share one held observation per captured interval', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.hold('detail'); f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  assert.equal(f.count('detail'), 1);
  t.mock.timers.tick(5000); f.controller.tick(); await flush();
  assert.equal(f.count('detail'), 1, 'several native ticks share the pending detail');
  f.sdk.setQueueContainsTask(false);
  const refresh = f.controller.refresh(); await flush();
  assert.equal(f.count('detail'), 1, 'queue absence shares the same observation');
  f.sdk.task.is_completed = true; f.sdk.release('detail');
  await refresh; await flush();
  assert.equal(f.sdk.commands.length, 1);
  assert.equal(f.sdk.commands[0].session_id, 'captured-work');
});

test('hiding during a held detail read preserves intent until a visible confirmed stop', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.hold('detail'); f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  const states = f.count('state');
  f.hide(); f.sdk.task.is_completed = true; f.sdk.hold('detail', false); f.sdk.release('detail'); await flush();
  assert.equal(f.count('state'), states, 'hidden completion does not enter automatic command ownership');
  assert.equal(f.sdk.commands.length, 0);
  f.hide(false); t.mock.timers.tick(5000); f.controller.tick(); await flush();
  assert.equal(f.sdk.commands.length, 1);
});

test('hiding during owned state read skips stop without consuming native intent', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.sdk.hold('state'); f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  assert.equal(f.sdk.held.filter(r => r.kind === 'state').length, 1);
  f.hide(); f.sdk.hold('state', false); f.sdk.release('state'); await flush();
  assert.equal(f.sdk.commands.length, 0, 'visibility is checked after ownedState resolves');
  assert.equal(f.controller.getSnapshot().busy, false);
  f.hide(false); t.mock.timers.tick(5000); f.controller.tick(); await flush();
  assert.equal(f.sdk.commands.length, 1, 'the skipped action retains intent and eventually stops');
  assert.equal(f.sdk.commands[0].session_id, 'captured-work');
});

test('failed native detail observation releases its slot for retry', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.hold('detail'); f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  f.sdk.release('detail', true); await flush();
  f.sdk.task.is_completed = true;
  t.mock.timers.tick(5000); f.controller.tick(); await flush();
  assert.equal(f.count('detail'), 2);
  f.sdk.release('detail'); await flush();
  assert.equal(f.sdk.commands.length, 1);
});

test('stale observation cannot stop a replacement interval or delete its observation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.hold('detail'); f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  f.sdk.setCurrent(work('replacement-work')); await f.controller.refresh();
  t.mock.timers.tick(5000); f.controller.tick(); await flush();
  assert.equal(f.count('detail'), 2, 'the replacement owns a distinct observation');
  f.sdk.task.is_completed = true; f.sdk.release('detail'); await flush();
  assert.equal(f.sdk.commands.length, 0, 'the captured old interval no longer owns the current state');
  t.mock.timers.tick(5000); f.controller.tick(); await flush();
  assert.equal(f.count('detail'), 2, 'old cleanup does not release the replacement observation');
  f.sdk.release('detail'); await flush();
  assert.deepEqual(f.sdk.commands.map(c => c.session_id), ['replacement-work']);
});

test('disposed controller ignores held native detail responses and removes DOM actions', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.hold('detail'); f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  const states = f.count('state');
  f.controller.dispose(); f.sdk.task.is_completed = true; f.sdk.release('detail'); await flush();
  f.controller.tick();
  assert.equal(f.count('state'), states);
  assert.equal(f.sdk.commands.length, 0);
  assert.equal(f.sdk.requests.find(r => r.kind === 'detail').aborted, true);
  assert.equal(f.document.querySelector('[data-rkrs-ap-card-action]'), null);
});


for (const failStop of [false, true]) {
  test(`confirmed native completion removes next-task eligibility despite ${failStop ? 'failed' : 'successful'} stop`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
    const f = fixture(t, { extraTasks: [{ id: 20, text: 'Next task', complete_till: 1800000600 }] });
    await flush();
    if (failStop) f.sdk.hold('sessions');
    f.sdk.task.is_completed = true; f.click();
    t.mock.timers.tick(2000); f.controller.tick(); await flush();
    if (failStop) { f.sdk.release('sessions', true); await flush(); }
    let state = f.controller.getSnapshot();
    assert.equal(state.tasks.find(task => task.id === '19').completed, true);
    assert.equal(state.selectedTaskId, '20');
    if (!failStop) {
      await f.controller.refresh();
      state = f.controller.getSnapshot();
      assert.equal(state.tasks.find(task => task.id === '19').completed, true, 'a fresh but stale shared queue retains definitive CRM completion');
      assert.equal(state.selectedTaskId, '20');
    }
  });
}

test('late pre-completion queue cannot reoffer a confirmed native task', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t, { extraTasks: [{ id: 20, text: 'Next task', complete_till: 1800000600 }] });
  await flush(); f.sdk.hold('tasks');
  const refresh = f.controller.refresh(); await flush();
  assert.equal(f.sdk.held.filter(r => r.kind === 'tasks').length, 1);
  f.sdk.task.is_completed = true; f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  assert.equal(f.sdk.commands.length, 1);
  f.sdk.release('tasks'); await refresh; await flush();
  const state = f.controller.getSnapshot();
  assert.equal(state.tasks.find(task => task.id === '19').completed, true);
  assert.equal(state.selectedTaskId, '20');
});


for (const fetched_at of [1800000010, 1800000030]) {
  test(`cached queue timestamp ${fetched_at} cannot reopen a CRM-completed task`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1800000020000 });
    const f = fixture(t); f.sdk.setQueueMeta({ fetched_at: 1800000000 }); await flush();
    f.sdk.task.is_completed = true; f.click();
    t.mock.timers.tick(2000); f.controller.tick(); await flush();
    const details = f.count('detail');
    f.sdk.setQueueMeta({ fetched_at, complete: true, stale: false }); await f.controller.refresh();
    assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
    assert.equal(f.controller.getSnapshot().selectedTaskId, null);
    assert.equal(f.document.querySelector('[data-rkrs-ap-card-action]'), null);
    assert.equal(f.count('detail'), details + 1, 'queue inclusion checks the live task');
    assert.deepEqual(f.sdk.commands.map(command => command.action), ['stop']);
  });
}

for (const fetched_at of [0, 1799999999, 1800000000]) {
  test(`live reopening restores eligibility with queue timestamp ${fetched_at}`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
    const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
    t.mock.timers.tick(2000); f.controller.tick(); await flush();
    f.sdk.task.is_completed = false;
    f.sdk.setQueueMeta({ fetched_at }); await f.controller.refresh();
    assert.equal(f.controller.getSnapshot().tasks[0].completed, false);
    assert.equal(f.controller.getSnapshot().selectedTaskId, '19');
    assert.match(f.document.querySelector('[data-rkrs-ap-card-action]').textContent, /Взять в работу/);
    assert.equal(await f.controller.startTask('19'), true);
  });
}

for (const meta of [{ complete: false }, { stale: true }]) {
  test(`a ${Object.keys(meta)[0]} queue cannot release completion proof`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
    const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
    t.mock.timers.tick(2000); f.controller.tick(); await flush();
    const details = f.count('detail');
    f.sdk.task.is_completed = false;
    f.sdk.setQueueMeta({ fetched_at: 1800000001, ...meta }); await f.controller.refresh();
    assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
    assert.equal(f.controller.getSnapshot().selectedTaskId, null);
    assert.equal(f.count('detail'), details);
    f.sdk.setQueueMeta({ fetched_at: 1800000001 }); await f.controller.refresh();
    assert.equal(f.controller.getSnapshot().selectedTaskId, '19');
  });
}

for (const omission of [{ complete: false }, { stale: true }]) {
  test(`confirmed completion survives ${Object.keys(omission)[0]} queue omission and stale reappearance`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
    const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
    t.mock.timers.tick(2000); f.controller.tick(); await flush();
    f.sdk.setQueueContainsTask(false);
    f.sdk.setQueueMeta({ fetched_at: 1800000001, ...omission }); await f.controller.refresh();
    assert.equal(f.controller.getSnapshot().tasks.length, 0);
    f.sdk.setQueueContainsTask(true);
    f.sdk.setQueueMeta({ fetched_at: 1800000000, stale: true }); await f.controller.refresh();
    const state = f.controller.getSnapshot();
    assert.equal(state.tasks[0].completed, true);
    assert.equal(state.selectedTaskId, null, 'the confirmed task is not offered as next work');
    assert.equal(await f.controller.startTask('19'), false);
    assert.deepEqual(f.sdk.commands.map(command => command.action), ['stop']);
  });
}

test('queue omission preserves completion until live detail proves reopening', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  const details = f.count('detail');
  f.sdk.setQueueContainsTask(false);
  f.sdk.setQueueMeta({ fetched_at: 1800000002 }); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().tasks.length, 0);
  assert.equal(f.count('detail'), details);
  f.sdk.setQueueContainsTask(true);
  f.sdk.setQueueMeta({ fetched_at: 1800000001, stale: true }); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
  assert.equal(f.controller.getSnapshot().selectedTaskId, null);
  f.sdk.task.is_completed = false;
  f.sdk.setQueueMeta({ fetched_at: 1800000001 }); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().tasks[0].completed, false);
  assert.equal(await f.controller.startTask('19'), true);
});

test('future visibility filtering cannot erase confirmed completion', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t, { settings: { consider_future_tasks: false } }); await flush();
  f.sdk.task.is_completed = true; f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  const due = f.sdk.task.complete_till;
  f.sdk.task.complete_till += 86400;
  f.sdk.task.is_completed = false;
  const details = f.count('detail');
  await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().tasks.length, 0);
  assert.equal(f.count('detail'), details, 'filtered rows do not trigger reopening checks');
  f.sdk.task.complete_till = due;
  f.sdk.setQueueMeta({ fetched_at: 1800000000, stale: true }); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
  assert.equal(f.controller.getSnapshot().selectedTaskId, null);
});

test('native confirmation while the task is absent still prevents a stale reoffer', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush();
  f.sdk.setQueueContainsTask(false);
  f.sdk.setQueueMeta({ fetched_at: 1800000000, complete: false });
  await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().tasks.length, 0);
  f.sdk.task.is_completed = true; f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  assert.equal(f.sdk.commands.length, 1);
  f.sdk.setQueueContainsTask(true);
  f.sdk.setQueueMeta({ fetched_at: 1800000000, stale: true }); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
  assert.equal(f.controller.getSnapshot().selectedTaskId, null);
});

test('reopening detail errors preserve proof and the next refresh retries', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  f.sdk.task.is_completed = false; f.sdk.hold('detail');
  const refresh = f.controller.refresh(); await flush();
  assert.equal(f.sdk.held.filter(row => row.kind === 'detail').length, 1);
  f.sdk.release('detail', true); await refresh;
  assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
  assert.equal(f.controller.getSnapshot().selectedTaskId, null);
  f.sdk.hold('detail', false); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().selectedTaskId, '19');
});

test('hidden queue refresh cannot start reopening detail checks', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  const details = f.count('detail');
  f.hide(); f.sdk.task.is_completed = false;
  f.sdk.setQueueMeta({ fetched_at: 1800000001 }); await f.controller.refresh();
  assert.equal(f.count('detail'), details);
  assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
  f.hide(false); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().selectedTaskId, '19');
});

test('held reopening read cannot block a command or publish after command invalidation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  f.sdk.hold('detail');
  const refresh = f.controller.refresh(); await flush();
  assert.equal(f.sdk.held.filter(row => row.kind === 'detail').length, 1);
  assert.equal(f.controller.getSnapshot().busy, false);
  assert.equal(await f.controller.startOther('Independent work'), true, 'commands do not await queue detail');
  f.sdk.task.is_completed = false; f.sdk.release('detail'); await refresh;
  assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
  assert.equal(f.controller.getSnapshot().selectedTaskId, null);
  assert.equal(f.document.querySelector('[data-rkrs-ap-card-action]'), null);
});

test('held reopening detail cannot erase a newer native completion', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
  t.mock.timers.tick(2000); f.controller.tick(); await flush();
  f.sdk.setCurrent(work('replacement-work')); await f.controller.refresh();
  f.sdk.hold('detail');
  const refresh = f.controller.refresh(); await flush();
  f.click(); t.mock.timers.tick(2000); f.controller.tick(); await flush();
  assert.equal(f.sdk.held.filter(row => row.kind === 'detail').length, 2);
  f.sdk.held.splice(1, 1)[0].respond(); await flush();
  assert.deepEqual(f.sdk.commands.map(command => command.session_id), ['captured-work', 'replacement-work']);
  f.sdk.task.is_completed = false; f.sdk.release('detail');
  f.sdk.task.is_completed = true;
  await refresh; await flush();
  assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
  assert.equal(f.controller.getSnapshot().selectedTaskId, null);
  assert.equal(f.document.querySelector('[data-rkrs-ap-card-action]'), null);
  f.sdk.hold('detail', false);
  while (f.sdk.held.some(row => row.kind === 'detail')) f.sdk.release('detail');
  await flush();
});

for (const invalid of ['missing completion', 'foreign owner', 'wrong identity']) {
  test(`${invalid} detail cannot prove reopening`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
    const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
    t.mock.timers.tick(2000); f.controller.tick(); await flush();
    f.sdk.hold('detail');
    const refresh = f.controller.refresh(); await flush();
    if (invalid === 'missing completion') delete f.sdk.task.is_completed;
    else if (invalid === 'foreign owner') Object.assign(f.sdk.task, { is_completed: false, responsible_user_id: 8 });
    else Object.assign(f.sdk.task, { id: 20, is_completed: false });
    f.sdk.release('detail'); await refresh;
    assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
    assert.equal(f.controller.getSnapshot().selectedTaskId, null);
    Object.assign(f.sdk.task, { id: 19, is_completed: false, responsible_user_id: userId });
    f.sdk.hold('detail', false); await f.controller.refresh();
    assert.equal(f.controller.getSnapshot().selectedTaskId, '19');
  });
}

for (const obsolete of ['hidden', 'disposed']) {
  test(`${obsolete} controller cannot publish held reopening detail`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
    const f = fixture(t); await flush(); f.sdk.task.is_completed = true; f.click();
    t.mock.timers.tick(2000); f.controller.tick(); await flush();
    f.sdk.hold('detail');
    const refresh = f.controller.refresh(); await flush();
    assert.equal(f.sdk.held.filter(row => row.kind === 'detail').length, 1);
    if (obsolete === 'hidden') f.hide(); else f.controller.dispose();
    f.sdk.task.is_completed = false; f.sdk.release('detail'); await refresh;
    assert.equal(f.controller.getSnapshot().tasks[0].completed, true);
    assert.equal(f.controller.getSnapshot().selectedTaskId, null);
    assert.deepEqual(f.sdk.commands.map(command => command.action), ['stop']);
  });
}
