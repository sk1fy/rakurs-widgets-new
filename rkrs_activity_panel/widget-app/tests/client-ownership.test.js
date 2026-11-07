import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveActivityController } from '../src/live-controller.js';
import { createLiveSDK, apiOrigin, appOrigin, accountId, userId } from '../fixtures/live-sdk.js';
import { LockManager, memoryStorage } from './helpers/locks.js';

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
const clientKey = `rkrs-activity-client:${apiOrigin}:rkrs_activity_panel:${accountId}:${userId}`;
function create(t, sdk, storage, locks, pathname = '/imbox/77') {
  const route = { pathname };
  const controller = createLiveActivityController({
    context: { widget: sdk.widget, accountId, userId }, apiOrigin, appOrigin,
    storageImpl: storage, locksImpl: locks, broadcastImpl: null, locationImpl: route,
    documentImpl: { hidden: false, querySelectorAll: selector => selector.includes('notification') ? ['77', '88'].map(id => ({ dataset: { id }, querySelector: () => null })) : [] },
  });
  t.after(() => controller.dispose());
  return { controller, route };
}

test('copied sessionStorage cannot stop the original tab interval; reload retains ownership', async t => {
  const sdk = createLiveSDK(), locks = new LockManager(), storage = memoryStorage();
  const original = create(t, sdk, storage, locks);
  await flush(); original.controller.tick(); await flush();
  const owner = sdk.state().current.context.client_id;
  const copied = storage.clone();
  const duplicate = create(t, sdk, copied, locks);
  await flush(); duplicate.controller.tick(); await flush();
  duplicate.route.pathname = '/leads'; duplicate.controller.tick(); await flush();
  assert.equal(sdk.commands.length, 1, 'duplicate exit must leave original interval running');
  assert.notEqual(copied.getItem(clientKey), owner);
  original.controller.dispose(); await flush();
  const reload = create(t, sdk, storage, locks);
  await flush(); reload.controller.tick(); await flush();
  assert.equal(storage.getItem(clientKey), owner);
  assert.equal(sdk.commands.length, 1, 'reload keeps the owned interval whole');
  reload.route.pathname = '/imbox/88'; reload.controller.tick(); await flush();
  assert.equal(sdk.commands.length, 2);
  assert.equal(sdk.commands[1].context.client_id, owner);
  reload.route.pathname = '/leads'; reload.controller.tick(); await flush();
  assert.equal(sdk.commands[2].action, 'stop');
});

test('identity acquisition leaves reads available and gates explicit and automatic writes', async t => {
  const sdk = createLiveSDK(), locks = new LockManager(); locks.paused = true;
  const { controller } = create(t, sdk, memoryStorage(), locks);
  await flush(); controller.tick(); await flush();
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal(sdk.commands.length, 0);
  const pending = controller.startOther('Explicit activity');
  await flush(); assert.equal(sdk.commands.length, 0);
  locks.resume();
  assert.equal(await pending, true);
  assert.equal(sdk.commands.length, 1);
  assert.ok(sdk.commands[0].context.client_id);
});

test('disposal during identity acquisition neither writes nor leaks a lease', async t => {
  const sdk = createLiveSDK(), locks = new LockManager(); locks.paused = true;
  const storage = memoryStorage();
  const { controller } = create(t, sdk, storage, locks);
  await flush();
  const pending = controller.startOther('Abandoned');
  controller.dispose(); locks.resume(); await flush();
  assert.equal(await pending, false);
  assert.equal(sdk.commands.length, 0);
  assert.equal(storage.getItem(clientKey), null);
  assert.equal(locks.held.size, 0);
});

test('without Web Locks a fresh identity leaves stored ownership alone', async t => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const storage = memoryStorage([[clientKey, owner]]);
  const sdk = createLiveSDK({ current: { id: 'original', kind: 'activity', started_at: 100, context: { activity_type: 'imbox', activity_name: 'Imbox 77', client_id: owner } } });
  const { controller, route } = create(t, sdk, storage, null);
  await flush(); controller.tick(); route.pathname = '/leads'; controller.tick(); await flush();
  assert.equal(sdk.commands.length, 0);
  assert.equal(storage.getItem(clientKey), owner);
  assert.match(controller.getSnapshot().readWarning, /перезагруз/);
  assert.equal(await controller.startImbox('88'), true);
  assert.notEqual(sdk.commands[0].context.client_id, owner);
  controller.tick(); await flush();
  assert.equal(sdk.commands.at(-1).action, 'stop', 'ephemeral owner still controls its own interval');
});

test('a copied pending command retains its captured body and ID without transferring ownership', async t => {
  const sdk = createLiveSDK(), locks = new LockManager(), storage = memoryStorage();
  const original = create(t, sdk, storage, locks);
  await flush(); original.controller.tick(); await flush();
  const current = sdk.state().current;
  const pending = { id: '22222222-2222-4222-8222-222222222222', body: {
    action: 'activity', expected_session_id: current.id,
    context: { client_id: current.context.client_id, activity_type: 'imbox', activity_name: 'Imbox 88' },
  } };
  const copied = storage.clone();
  copied.setItem(`rkrs-activity-command:${apiOrigin}:rkrs_activity_panel:${accountId}:${userId}`, JSON.stringify(pending));
  const posts = [], ajax = sdk.widget.$.ajax;
  sdk.widget.$.ajax = options => {
    if (options.method === 'POST' && options.url.endsWith('/sessions')) posts.push({ id: options.headers['Idempotency-Key'], body: JSON.parse(options.data) });
    return ajax(options);
  };
  locks.paused = true;
  const duplicate = create(t, sdk, copied, locks, '/leads');
  await flush();
  const recovery = duplicate.controller.refresh();
  await flush(); assert.equal(posts.length, 0);
  locks.resume(); assert.equal(await recovery, true);
  assert.deepEqual(posts, [pending]);
  duplicate.controller.tick(); await flush();
  assert.equal(posts.length, 1, 'replayed receipt belongs to the captured original identity');
  assert.notEqual(copied.getItem(clientKey), pending.body.context.client_id);
});
