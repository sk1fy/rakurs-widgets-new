import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveActivityController } from '../src/live-controller.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const calls = [], held = [], channels = [];
  let current = null;
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
          if (failures.get(path)) { failures.set(path, failures.get(path) - 1); return failure({ status: 503 }); }
          if (path === 'token') return fn({ token: 'fresh-token' });
          if (path === 'state') return fn({ current: structuredClone(current), enabled: true, settings: { include_related_deals: true } });
          if (path.startsWith('sessions?')) return fn({ items: [] });
          if (path.startsWith('tasks')) return fn({ tasks: [], complete: true });
          if (path === 'browser-session') return fn({ url: 'https://panel.example.test/settings' });
          const body = JSON.parse(options.data);
          const receipt = body.action === 'stop' ? { id: body.session_id, stopped_at: 200 } : { id: `session-${calls.length}`, kind: body.action, started_at: 100, context: body.context };
          current = receipt.stopped_at ? null : receipt;
          fn(receipt);
        };
        if (hold.has(path.split('?')[0])) held.push({ path, respond, fn }); else respond();
      });
      return result;
    }, fail(fn) { failure = fn; return result; }, abort() {} };
    return result;
  } } };
  class Channel { constructor() { channels.push(this); } postMessage() {} close() {} }
  const documentImpl = { hidden: false, querySelectorAll: () => [], addEventListener(name, fn) { events[name] = fn; }, removeEventListener() {}, defaultView: { addEventListener(name, fn) { events[name] = fn; }, removeEventListener() {} } };
  const controller = createLiveActivityController({ context: { widget, accountId: 42, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', storageImpl: null, broadcastImpl: Channel, documentImpl, locationImpl: route });
  return { controller, calls, hold, held, failures, route, events, channels, documentImpl, setCurrent(value) { current = value; } };
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
