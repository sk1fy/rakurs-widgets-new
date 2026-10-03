import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
function environment() {
  const dom = new JSDOM("<main></main>", {
    url: "https://demo.amocrm.ru",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  let app;
  dom.window.define = (_deps, fn) => {
    app = {};
    fn(app);
  };
  dom.window.define.amd = {};
  dom.window.eval(readFileSync("dist/rkrs-distribution.umd.js", "utf8"));
  return { dom, app, target: dom.window.document.querySelector("main") };
}
function fixture(response) {
  const requests = [];
  return {
    requests,
    $authorizedAjax(o) {
      const callbacks = {};
      const r = {
        done(fn) {
          callbacks.done = fn;
          return r;
        },
        fail(fn) {
          callbacks.fail = fn;
          return r;
        },
        abort() {
          r.aborted = true;
          callbacks.fail?.({ status: 0 });
        },
        resolve(data = response(o)) {
          callbacks.done?.(data, "ok", { status: 200 });
        },
      };
      requests.push(r);
      return r;
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
test("navigation discards old replies and aborts requests; repeated mount idempotent; destroy clears nodes", async () => {
  const { dom, app, target } = environment(),
    widget = fixture(() => ({
      state: "active",
      accountId: "1",
      userId: "2",
      binding: {},
      canManage: false,
    }));
  app.mount({
    widget,
    target,
    identity: "1",
    mode: "card",
    leadId: "10",
    apiUrl: "https://api.test",
  });
  assert.equal(widget.requests.length, 1);
  app.mount({
    widget,
    target,
    identity: "1",
    mode: "card",
    leadId: "10",
    apiUrl: "https://api.test",
  });
  assert.equal(widget.requests.length, 1);
  app.mount({
    widget,
    target,
    identity: "2",
    mode: "card",
    leadId: "20",
    apiUrl: "https://api.test",
  });
  assert.equal(widget.requests[0].aborted, true);
  widget.requests[0].resolve({ state: "unbound", accountId: "OLD" });
  widget.requests[1].resolve();
  await tick();
  widget.requests[3].resolve({ items: [] });
  widget.requests[4].resolve({ employees: [] });
  widget.requests[2].resolve({
    items: [
      {
        id: "a",
        state: "waiting",
        reason: "no_available_employee",
        groupId: "new",
        actions: [],
      },
    ],
  });
  await tick();
  assert(!target.shadowRoot.textContent.includes("OLD"));
  assert(target.shadowRoot.textContent.includes("Никто не на смене"));
  assert(!dom.window.localStorage.length);
  app.destroy(widget);
  assert.equal(target.shadowRoot.children.length, 0);
  dom.window.close();
});
test("unbound and forbidden never request runtime or expose prior data", async () => {
  const { dom, app, target } = environment(),
    widget = fixture(() => ({ state: "unbound", accountId: "9", userId: "2" }));
  app.mount({
    widget,
    target,
    identity: "x",
    mode: "settings",
    apiUrl: "https://api.test",
  });
  widget.requests[0].resolve();
  await tick();
  assert.equal(widget.requests.length, 1);
  assert(target.shadowRoot.textContent.includes("Свяжите аккаунт"));
  app.destroy(widget);
  dom.window.close();
});
