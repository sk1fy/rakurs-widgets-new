import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundle = await build({
  root, configFile: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [vue(), {
    name: 'queued-navigation-fixture',
    resolveId(id) { if (id === 'fixture' || id.endsWith('/fixture')) return '\0fixture'; },
    load(id) { if (id === '\0fixture') return `import { createApp, h } from 'vue'; import Panel from ${JSON.stringify(`${root}/src/WidgetPanel.vue`)}; export const mount = controller => { const app = createApp({ render: () => h(Panel, { controller }) }); app.mount('#app'); return app; };`; },
  }],
  build: { write: false, minify: false, lib: { entry: 'fixture', name: 'QueuedFixture', formats: ['iife'] } },
});
const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(item => item.type === 'chunk').code;
const flush = () => new Promise(setImmediate);

function fixture(t) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://crm.test/leads/detail/1', runScripts: 'outside-only', pretendToBeVisual: true });
  const state = { live: true, enabled: true, ready: true, scenario: 'tasks', tasks: [{ id: '19', title: 'Task', url: '#task', dueTime: '10:00' }], dialogs: [], active: null, history: [], settings: {}, elapsedSeconds: 0, totalSeconds: 0 };
  const pending = [];
  let listener;
  const controller = { getSnapshot: () => state, subscribe(fn) { listener = fn; return () => {}; }, selectScenario() {}, startTask(id) { return new Promise(resolve => pending.push({ id, resolve })); } };
  dom.window.TextEncoder = TextEncoder;
  dom.window.eval(code);
  const app = dom.window.QueuedFixture.mount(controller);
  t.after(() => { app.unmount(); dom.window.close(); });
  return { dom, app, state, pending,
    click() { dom.window.document.querySelector('.rkrs-smart-action').click(); },
    update() { listener({ ...state }); },
    confirm(index, url = '#confirmed') {
      const command = pending[index];
      state.active = { id: command.id, kind: 'tasks', url };
      listener({ ...state });
      command.resolve(true);
    },
  };
}

test('queued start cannot redirect after route change', async t => {
  const f = fixture(t); f.click();
  f.dom.window.history.pushState({}, '', '/audit-other-card?tab=2#note');
  f.confirm(0); await flush();
  assert.equal(f.dom.window.location.href, 'https://crm.test/audit-other-card?tab=2#note');
});

test('queued start cannot redirect after component unmount', async t => {
  const f = fixture(t); f.click(); f.app.unmount();
  f.confirm(0); await flush();
  assert.equal(f.dom.window.location.href, 'https://crm.test/leads/detail/1');
});

test('current successful queued start opens the confirmed card even with a stale queue URL', async t => {
  const f = fixture(t); f.click();
  f.state.tasks[0].url = '#changed';
  f.confirm(0); await flush();
  assert.equal(f.dom.window.location.hash, '#confirmed');
});

test('a newer queued start supersedes the earlier one', async t => {
  const f = fixture(t); f.click();
  f.state.tasks = [{ id: '20', title: 'Next', url: '#next', dueTime: '10:00' }]; f.update(); await flush(); f.click();
  f.confirm(0); await flush();
  assert.equal(f.dom.window.location.hash, '');
  f.confirm(1, '#next-confirmed'); await flush();
  assert.equal(f.dom.window.location.hash, '#next-confirmed');
});

test('failed queued start leaves the route untouched', async t => {
  const f = fixture(t); f.click(); f.pending[0].resolve(false); await flush();
  assert.equal(f.dom.window.location.hash, '');
});

test('a confirmed start with no card stays on the current route', async t => {
  const f = fixture(t); f.click(); f.confirm(0, ''); await flush();
  assert.equal(f.dom.window.location.hash, '');
});

test('only task start renders the start spinner while commands are busy', async t => {
  const f = fixture(t);
  const document = f.dom.window.document;
  f.state.busy = true;
  f.state.operation = 'command';
  f.update(); await flush();
  assert.equal(document.querySelector('.rkrs-task-spinner'), null);
  f.state.operation = 'start_task';
  f.update(); await flush();
  assert.match(document.querySelector('.rkrs-task-starting').textContent, /Запускаем…/);
  assert.ok(document.querySelector('.rkrs-task-spinner'));
  assert.equal(document.querySelector('.rkrs-smart-action').disabled, true);
  assert.equal(f.dom.window.location.hash, '');
});
