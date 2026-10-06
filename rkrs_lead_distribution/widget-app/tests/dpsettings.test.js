import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const SCRIPT = readFileSync("../widget/script.js", "utf8");

function loadWidget() {
  const dom = new JSDOM(
    `<div class="digital-pipeline__short-task_widget-style_dpcode">
       <div><div data-action="send_widget_hook">
         <input name="groupId" value="" />
       </div></div>
     </div>`,
    { url: "https://demo.amocrm.ru", runScripts: "outside-only" },
  );
  let factory;
  dom.window.define = (_deps, fn) => {
    factory = fn;
  };
  dom.window.define.amd = {};
  dom.window.eval(SCRIPT);
  const Widget = factory();
  const self = new Widget();
  self.get_settings = () => ({ widget_code: "dpcode" });
  return { dom, self };
}

test("dpSettings writes the selected group name's UUID into amoCRM's groupId field", async () => {
  const { dom, self } = loadWidget();
  const calls = [];
  self.$authorizedAjax = (options) => {
    calls.push(options);
    const handlers = {};
    const req = {
      done(fn) {
        handlers.done = fn;
        return req;
      },
      fail(fn) {
        handlers.fail = fn;
        return req;
      },
      abort() {},
    };
    setTimeout(
      () =>
        handlers.done?.({
          items: [{ id: "group-uuid-1", name: "Группа Продаж" }],
        }),
      0,
    );
    return req;
  };
  self.callbacks.dpSettings();
  await new Promise((r) => setTimeout(r, 5));
  const field = dom.window.document.querySelector('input[name="groupId"]');
  const select = dom.window.document.querySelector(
    '[data-rkrs-dp-groups="ready"]',
  );
  assert(select, "group picker rendered inside the DP action settings");
  assert.equal(calls.length, 1, "groups are read through the signed SDK");
  assert.equal(calls[0].url, "__RKRS_DISTRIBUTION_API_URL__/runtime");
  assert.deepEqual(
    [...select.options].map((o) => o.textContent),
    ["Выберите группу", "Группа Продаж"],
  );
  let changed = 0;
  field.addEventListener("change", () => {
    changed += 1;
  });
  select.value = "group-uuid-1";
  select.dispatchEvent(new dom.window.Event("change"));
  assert.equal(field.value, "group-uuid-1", "UUID lands in the amo form field");
  assert.equal(changed, 1, "amoCRM is notified through the change event");
});

test("dpSettings shows an honest manual fallback when the SDK is unavailable", async () => {
  const { dom, self } = loadWidget();
  self.callbacks.dpSettings();
  await new Promise((r) => setTimeout(r, 5));
  const status = dom.window.document.querySelector(
    '[data-rkrs-dp-groups="fallback"]',
  );
  assert(status, "fallback status is shown");
  assert.match(status.textContent, /вручную/);
});
