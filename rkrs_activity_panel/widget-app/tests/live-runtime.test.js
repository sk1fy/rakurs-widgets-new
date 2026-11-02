import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createLiveSDK, apiOrigin, appOrigin, accountId, userId, viewKey } from '../fixtures/live-sdk.js';

const bundle = await build({ mode: 'widget', logLevel: 'silent', define: { 'import.meta.env.VITE_ACTIVITY_API_ORIGIN': JSON.stringify(apiOrigin), 'import.meta.env.VITE_ACTIVITY_APP_ORIGIN': JSON.stringify(appOrigin) }, build: { write: false } });
const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(file => file.type === 'chunk').code;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
function mount(t, { cachedDisabled = false, pending = false, ...options } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://crm.example.test/leads/detail/12', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.structuredClone = structuredClone; window.TextEncoder = TextEncoder;
  window.fetch = () => { throw new Error('Unexpected browser transport'); };
  const clocks = [];
  window.setInterval = fn => { clocks.push(fn); return clocks.length; };
  window.clearInterval = () => {};
  if (cachedDisabled) window.localStorage.setItem(viewKey, JSON.stringify({ enabled: false }));
  if (pending) window.sessionStorage.setItem(`rkrs-activity-command:${apiOrigin}:rkrs_activity_panel:${accountId}:${userId}`, JSON.stringify({ id: '64d8752b-070b-410a-8b4b-811e029ee676', body: { action: 'stop', session_id: 'unconfirmed-work', context: {} } }));
  const sdk = createLiveSDK(options);
  window.eval(code);
  const app = window.RkrsActivityPrototype;
  app.mountPanel({ widget: sdk.widget, accountId, userId });
  t.after(() => { app.unmountAll(sdk.widget); dom.window.close(); });
  return { sdk, panel: () => window.document.querySelector('[data-rkrs-prototype-surface="panel"]')?.shadowRoot, place: () => clocks.forEach(fn => fn()) };
}

for (const cachedDisabled of [false, true]) for (const failure of ['state', 'authorization']) {
  test(`mounted live ${failure} error exposes Refresh with ${cachedDisabled ? 'cached disabled' : 'empty'} enrollment`, async t => {
    const f = mount(t, { cachedDisabled, ...(failure === 'state' ? { failState: 1 } : { failToken: 1 }) });
    assert.equal(f.panel(), undefined, 'no flash before accepted state');
    await flush(); f.place(); await flush();
    const error = f.panel()?.querySelector('[role="alert"]');
    assert.ok(error, 'failed initialization restores the real Vue panel');
    assert.match(error.textContent, failure === 'state' ? /Fixture state unavailable/ : /Fixture authorization failed/);
    const retry = error.querySelector('button');
    assert.equal(retry.textContent.trim(), 'Обновить данные');
    assert.equal(retry.disabled, false);
    f.sdk.setEnabled(!cachedDisabled); retry.click(); await flush(); f.place(); await flush();
    if (cachedDisabled) assert.equal(f.panel(), undefined, 'accepted disabled idle state removes the panel');
    else {
      assert.ok(f.panel());
      assert.equal(f.panel().querySelector('[role="alert"]'), null);
      assert.match(f.panel().textContent, /Проверить предложение/);
    }
  });
}

test('accepted disabled employee with active work keeps the mounted stop action', async t => {
  const f = mount(t, { enabled: false, current: { id: 'existing-work', kind: 'work', started_at: 1800000000, context: { task_id: 19, task_name: 'Existing work' } } });
  await flush(); f.place(); await flush();
  assert.ok(f.panel());
  const stop = f.panel().querySelector('.rkrs-summary-stop');
  assert.ok(stop); assert.equal(stop.disabled, false);
  stop.click(); await flush(); f.place(); await flush();
  assert.equal(f.sdk.commands[0].session_id, 'existing-work');
  assert.equal(f.panel(), undefined);
});

test('accepted disabled employee with a pending command keeps the mounted recovery action', async t => {
  const f = mount(t, { enabled: false, pending: true });
  await flush(); f.place(); await flush();
  assert.ok(f.panel());
  const recovery = f.panel().querySelector('[role="alert"] button');
  assert.ok(recovery);
  assert.equal(recovery.textContent.trim(), 'Восстановить операцию');
  assert.equal(recovery.disabled, false);
  assert.equal(f.sdk.commands.length, 0, 'initial metadata read never replays an uncertain command');
});
