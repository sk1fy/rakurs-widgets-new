import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createLiveSDK, apiOrigin, appOrigin, accountId, userId, viewKey } from '../fixtures/live-sdk.js';

const bundle = await build({ mode: 'widget', logLevel: 'silent', define: { 'import.meta.env.VITE_ACTIVITY_API_ORIGIN': JSON.stringify(apiOrigin), 'import.meta.env.VITE_ACTIVITY_APP_ORIGIN': JSON.stringify(appOrigin) }, build: { write: false } });
const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(file => file.type === 'chunk').code;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
function mount(t, { cachedDisabled = false, pending = false, hidden = false, pathname = '/leads/detail/12', settingsOnly = false, ...options } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: `https://crm.example.test${pathname}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  Object.defineProperty(document, 'hidden', { get: () => hidden });
  window.structuredClone = structuredClone; window.TextEncoder = TextEncoder;
  window.fetch = () => { throw new Error('Unexpected browser transport'); };
  const clocks = new Map(), disposalTimers = new Map();
  let timerId = 0;
  window.setInterval = fn => { clocks.set(++timerId, fn); return timerId; };
  window.clearInterval = id => clocks.delete(id);
  const { setTimeout, clearTimeout } = window;
  window.setTimeout = (fn, delay) => {
    if (delay !== 10000) return setTimeout(fn, delay);
    disposalTimers.set(++timerId, fn);
    return timerId;
  };
  window.clearTimeout = id => { if (!disposalTimers.delete(id)) clearTimeout(id); };
  if (cachedDisabled) window.localStorage.setItem(viewKey, JSON.stringify({ enabled: false }));
  if (pending) window.sessionStorage.setItem(`rkrs-activity-command:${apiOrigin}:rkrs_activity_panel:${accountId}:${userId}`, JSON.stringify({ id: '64d8752b-070b-410a-8b4b-811e029ee676', body: { action: 'stop', session_id: 'unconfirmed-work', context: {} } }));
  const sdk = createLiveSDK(options);
  window.eval(code);
  const app = window.RkrsActivityPrototype;
  const context = { widget: sdk.widget, accountId, userId };
  if (settingsOnly) app.openSettings({ ...context, settingsTarget: document.body });
  else app.mountPanel(context);
  t.after(() => { app.unmountAll(sdk.widget); dom.window.close(); });
  return {
    sdk,
    document,
    panel: () => document.querySelector('[data-rkrs-prototype-surface="panel"]')?.shadowRoot,
    navigate: path => window.history.replaceState(null, '', path),
    show: () => { hidden = false; document.dispatchEvent(new window.Event('visibilitychange')); },
    mount: () => app.mountPanel(context),
    unmount: () => app.unmountAll(sdk.widget),
    dispose: () => { disposalTimers.forEach(fn => fn()); disposalTimers.clear(); },
    place: () => [...clocks.values()].forEach(fn => fn()),
    afterTransition: () => new Promise(resolve => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    }),
  };
}

function unusedTokens(sdk) {
  const sent = new Set(sdk.requests.filter(r => r.kind !== 'token').map(r => r.token));
  return sdk.requests.filter(r => r.kind === 'token' && !sent.has(r.token));
}

test('first foreground show prefetches once and a remount after disposal uses the same token', async t => {
  const f = mount(t, { hidden: true, pathname: '/settings/widgets' });
  await flush(); f.place(); await flush();
  assert.equal(f.panel(), undefined);
  assert.deepEqual(unusedTokens(f.sdk), []);

  f.navigate('/leads/detail/12'); f.place(); await flush();
  assert.ok(f.panel(), 'the panel is mounted in the background');
  assert.deepEqual(unusedTokens(f.sdk), []);

  f.show(); await flush();
  const [prefetched, ...extra] = unusedTokens(f.sdk);
  assert.ok(prefetched?.token);
  assert.deepEqual(extra, []);
  f.unmount(); f.dispose(); f.mount(); await flush(); f.place(); await flush();
  f.show(); f.mount(); await flush();
  assert.deepEqual(unusedTokens(f.sdk), [prefetched]);

  f.panel().querySelector('.rkrs-smart-action').click();
  await flush();
  const start = f.sdk.requests.find(r => r.kind === 'start');
  assert.equal(start.token, prefetched.token);
  assert.match(start.commandId, /^[0-9a-f-]{36}$/);
  f.panel().querySelector('.rkrs-summary-stop').click();
  await flush();
  const stop = f.sdk.requests.find(r => r.body?.action === 'stop');
  assert.ok(stop.token);
  assert.notEqual(stop.token, start.token);
  assert.deepEqual(unusedTokens(f.sdk), []);
});

test('settings and an accepted disabled idle employee do not prefetch', async t => {
  for (const options of [{ settingsOnly: true }, { enabled: false }]) {
    const f = mount(t, options);
    await flush(); f.place(); f.show(); await flush();
    assert.equal(f.panel(), undefined);
    assert.deepEqual(unusedTokens(f.sdk), []);
  }
});

test('a manual task start waits for the pending prefetch without a second token request', async t => {
  const f = mount(t);
  await flush();
  f.sdk.hold('token');
  f.place(); await flush();
  assert.equal(f.sdk.held.length, 1);
  f.panel().querySelector('.rkrs-smart-action').click();
  await flush();
  assert.equal(f.sdk.held.length, 1);
  assert.equal(f.sdk.commands.length, 0);
  f.sdk.hold('token', false);
  f.sdk.release('token');
  await flush();
  assert.equal(f.sdk.requests.find(r => r.kind === 'start').token, f.sdk.requests.filter(r => r.kind === 'token').at(-1).token);
  assert.equal(f.sdk.commands.length, 1);
});

for (const failure of ['expired', 'malformed', 'failed']) {
  test(`${failure} prefetch falls back to one new token on click`, async t => {
    let override;
    const f = mount(t, { tokenFor: n => override?.() || `fresh-fixture-token-${n}` });
    await flush();
    f.sdk.hold('token'); f.place(); await flush();
    const prefetched = f.sdk.requests.at(-1);
    if (failure === 'expired') override = () => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 1 })).replace(/=+$/, '')}.Zml4dHVyZQ`;
    if (failure === 'malformed') override = () => 'not-a-jwt';
    f.sdk.hold('token', false); f.sdk.release('token', failure === 'failed');
    await flush(); override = null;
    const offset = f.sdk.requests.length;
    f.panel().querySelector('.rkrs-smart-action').click();
    await flush();
    const [token, start] = f.sdk.requests.slice(offset);
    assert.deepEqual(f.sdk.requests.slice(offset).map(r => r.kind), ['token', 'start']);
    assert.equal(start.token, token.token);
    assert.notEqual(start.token, prefetched.token);
    f.mount(); f.show(); await flush();
    const [unused] = unusedTokens(f.sdk);
    assert.equal(unused, prefetched, 'subsequent visibility adds no unused token');
    assert.equal(unusedTokens(f.sdk).length, 1);
  });
}

test('automatic Imbox start leaves the prefetched token for a manual stop', async t => {
  const f = mount(t);
  f.document.body.insertAdjacentHTML('beforeend', '<div class="notification--talk" data-id="77"><a href="/leads/detail/12">Imbox 77</a></div>');
  await flush(); f.place(); await flush();
  const [prefetched] = unusedTokens(f.sdk);
  assert.ok(prefetched?.token);
  f.navigate('/imbox/77'); f.place(); await flush();
  const start = f.sdk.requests.find(r => r.body?.context?.activity_type === 'imbox');
  assert.ok(start?.token);
  assert.notEqual(start.token, prefetched.token);
  assert.notEqual(f.sdk.requests.find(r => r.kind === 'leads/12').token, prefetched.token);
  assert.deepEqual(unusedTokens(f.sdk), [prefetched]);
  f.panel().querySelector('.rkrs-btn-stopred').click();
  await flush();
  assert.equal(f.sdk.requests.find(r => r.body?.action === 'stop').token, prefetched.token);
});

for (const cachedDisabled of [false, true]) for (const failure of ['state', 'authorization']) {
  test(`mounted live ${failure} error exposes Refresh with ${cachedDisabled ? 'cached disabled' : 'empty'} enrollment`, async t => {
    const f = mount(t, { cachedDisabled, ...(failure === 'state' ? { failState: 1 } : { failToken: 1 }) });
    assert.equal(f.panel(), undefined, 'no flash before accepted state');
    await flush(); f.place(); await flush();
    const error = f.panel()?.querySelector('[role="alert"]');
    assert.ok(error, 'failed initialization restores the real Vue panel');
    assert.match(error.textContent, failure === 'state' ? /Fixture state unavailable/ : /Fixture authorization failed/);
    assert.equal(error.closest('.rkrs-widget'), null, 'notifications stay outside the measured panel');
    const retry = error.closest('.rkrs-toast').querySelector('button');
    assert.equal(retry.textContent.trim(), 'Обновить данные');
    assert.equal(retry.disabled, false);
    f.sdk.setEnabled(!cachedDisabled); retry.click(); await flush(); f.place(); await flush();
    if (cachedDisabled) assert.equal(f.panel(), undefined, 'accepted disabled idle state removes the panel');
    else {
      assert.ok(f.panel());
      await f.afterTransition();
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
  const recovery = f.panel().querySelector('.rkrs-toast button');
  assert.ok(recovery);
  assert.equal(recovery.textContent.trim(), 'Восстановить операцию');
  assert.equal(recovery.disabled, false);
  assert.equal(f.sdk.commands.length, 0, 'initial metadata read never replays an uncertain command');
});
