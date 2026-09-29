import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../../widget/script.js", import.meta.url),
  "utf8"
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(options = {}) {
  const calls = {
    fetch: [],
    require: [],
    undef: [],
    register: [],
    mount: [],
    settings: [],
    unmount: [],
    errors: [],
  };
  const body = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
    },
    removeChild(node) {
      this.children.splice(this.children.indexOf(node), 1);
      node.parentNode = null;
    },
  };
  const app = {
    registerWidgetInstance: (widget) => calls.register.push(widget),
    mountPanel: (context) => calls.mount.push(context),
    openSettings: (context) => calls.settings.push(context),
    unmountAll: (widget) => calls.unmount.push(widget),
  };
  let Widget;
  const requireModule = (urls, resolve, reject) => {
    calls.require.push(urls);
    if (options.require) options.require(urls, resolve, reject, app);
    else resolve(app);
  };
  requireModule.undef = (url) => calls.undef.push(url);
  vm.runInNewContext(source, {
    define(deps, factory) {
      assert.equal(deps.length, 0);
      Widget = factory();
    },
    require: requireModule,
    fetch(url, config) {
      calls.fetch.push({ url, config });
      return options.fetch
        ? options.fetch(url, config)
        : Promise.resolve({
            ok: true,
            json: async () => ({ js: "activity.abcd.js", version: "0.1.0" }),
          });
    },
    setTimeout,
    clearTimeout,
    AbortController,
    console: { error: (...args) => calls.errors.push(args) },
    document: { body, createElement: () => ({ style: {}, setAttribute() {} }) },
    AMOCRM: {
      constant: (key) =>
        ({ account: { id: 123, subdomain: "demo" }, user: { id: 42 } }[key]),
      widgets: { system: { area: "dashboard" } },
    },
  });
  return { Widget, app, calls, body };
}

test("one release and bundle request shared across renders and instances; callbacks return true", async () => {
  const { Widget, calls } = setup();
  const first = new Widget();
  const second = new Widget();
  assert.equal(first.callbacks.init(), true);
  assert.equal(first.callbacks.render(), true);
  assert.equal(second.callbacks.init(), true);
  assert.equal(first.callbacks.bind_actions(), true);
  assert.equal(first.callbacks.onSave(), true);
  await tick();
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].config.cache, "no-cache");
  assert.equal(calls.require.length, 1);
  assert.equal(calls.register.length, 2);
  assert.equal(calls.mount.length, 3);
  assert.equal(calls.mount[0].accountId, 123);
  assert.equal(calls.mount[0].userId, 42);
  assert.equal(calls.mount[0].subdomain, "demo");
  assert.equal(calls.mount[0].area, "dashboard");
});

test("fetch failure is visible and next render retries successfully", async () => {
  let count = 0;
  const { Widget, calls, body } = setup({
    fetch: async () => {
      if (++count === 1) throw new Error("offline");
      return { ok: true, json: async () => ({ js: "panel.js" }) };
    },
  });
  const widget = new Widget();
  widget.callbacks.init();
  await tick();
  assert.equal(body.children.length, 1);
  assert.match(body.children[0].className, /^rkrs-activity-/);
  widget.callbacks.render();
  await tick();
  assert.equal(calls.fetch.length, 2);
  assert.equal(calls.mount.length, 1);
  assert.equal(body.children.length, 0);
});

test("require failure clears cached AMD failure and can retry", async () => {
  let count = 0;
  const { Widget, calls } = setup({
    require: (urls, resolve, reject, app) => {
      if (++count === 1) reject(new Error("bundle unavailable"));
      else resolve(app);
    },
  });
  const widget = new Widget();
  widget.callbacks.render();
  await tick();
  assert.equal(calls.undef.length, 1);
  widget.callbacks.render();
  await tick();
  assert.equal(calls.require.length, 2);
  assert.equal(calls.mount.length, 1);
});

test("destroy cancels pending init/render/settings without touching another widget", async () => {
  const pending = deferred();
  const { Widget, calls } = setup({ fetch: () => pending.promise });
  const first = new Widget();
  const second = new Widget();
  first.callbacks.init();
  first.callbacks.render();
  first.callbacks.settings();
  second.callbacks.init();
  assert.equal(first.callbacks.destroy(), true);
  pending.resolve({ ok: true, json: async () => ({ js: "panel.js" }) });
  await tick();
  assert.deepEqual(calls.register, [second]);
  assert.equal(calls.mount.length, 1);
  assert.equal(calls.mount[0].widget, second);
  assert.equal(calls.settings.length, 0);
  assert.equal(calls.unmount.length, 0);
});

test("destroy cleans up only its own instance and init starts a new generation", async () => {
  const { Widget, calls } = setup();
  const first = new Widget();
  const second = new Widget();
  first.callbacks.init();
  second.callbacks.init();
  await tick();
  first.callbacks.destroy();
  first.callbacks.destroy();
  first.callbacks.render();
  await tick();
  assert.deepEqual(calls.unmount, [first]);
  assert.equal(calls.mount.length, 2);
  first.callbacks.init();
  await tick();
  assert.equal(calls.register.length, 3);
  assert.equal(calls.mount.length, 3);
  assert.equal(calls.fetch.length, 1);
});

test("reinit while load is pending discards callbacks from the old generation", async () => {
  const pending = deferred();
  const { Widget, calls } = setup({ fetch: () => pending.promise });
  const widget = new Widget();
  widget.callbacks.init();
  widget.callbacks.destroy();
  widget.callbacks.init();
  pending.resolve({ ok: true, json: async () => ({ js: "panel.js" }) });
  await tick();
  assert.equal(calls.register.length, 1);
  assert.equal(calls.mount.length, 1);
});

test("settings accepts native and jQuery-style modal roots", async () => {
  const { Widget, calls } = setup();
  const widget = new Widget();
  const modal = { nodeType: 1, appendChild() {} };
  assert.equal(widget.callbacks.settings(modal), true);
  widget.callbacks.settings({ 0: modal, length: 1 });
  await tick();
  assert.equal(calls.settings.length, 2);
  assert.equal(calls.settings[0].settingsTarget, modal);
  assert.equal(calls.settings[1].settingsTarget, modal);
});

test("release.js rejects external URLs and traversal before calling require", async () => {
  for (const js of [
    "https://evil.test/a.js",
    "//evil.test/a.js",
    "../a.js",
    "assets/../a.js",
    "/a.js",
    "a.js?x=1",
    "assets/%2e%2e/a.js",
    "assets//a.js",
  ]) {
    const { Widget, calls } = setup({
      fetch: async () => ({ ok: true, json: async () => ({ js }) }),
    });
    new Widget().callbacks.init();
    await tick();
    assert.equal(calls.require.length, 0, js);
    assert.equal(calls.errors.length, 1, js);
  }
});

test("invalid bundle API fails visibly and can reload", async () => {
  let count = 0;
  const { Widget, calls, body } = setup({
    require: (urls, resolve, reject, app) => resolve(++count === 1 ? {} : app),
  });
  const widget = new Widget();
  widget.callbacks.init();
  await tick();
  assert.equal(body.children.length, 1);
  assert.equal(calls.mount.length, 0);
  widget.callbacks.render();
  await tick();
  assert.equal(calls.mount.length, 1);
});

test("bundle method exceptions and promise rejections are contained", async () => {
  const { Widget, app, calls, body } = setup();
  app.mountPanel = () => Promise.reject(new Error("render failure"));
  const widget = new Widget();
  widget.callbacks.init();
  await tick();
  assert.equal(calls.errors.length, 1);
  assert.equal(body.children.length, 1);
  app.unmountAll = () => {
    throw new Error("cleanup failure");
  };
  assert.equal(widget.callbacks.destroy(), true);
  await tick();
  assert.equal(calls.errors.length, 2);
  assert.equal(body.children.length, 0);
});

test("asynchronous registration failure is handled and next render registers again", async () => {
  const { Widget, app, calls } = setup();
  let attempts = 0;
  app.registerWidgetInstance = () =>
    ++attempts === 1
      ? Promise.reject(new Error("register failure"))
      : Promise.resolve();
  const widget = new Widget();
  widget.callbacks.init();
  await tick();
  assert.equal(calls.errors.length, 1);
  assert.equal(calls.mount.length, 0);
  widget.callbacks.render();
  await tick();
  assert.equal(attempts, 2);
  assert.equal(calls.mount.length, 1);
});
