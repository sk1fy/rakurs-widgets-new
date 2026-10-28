import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const code = readFileSync(
  new URL("../dist/rkrs-activity.umd.js", import.meta.url),
  "utf8"
);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(url = "http://localhost/") {
  const dom = new JSDOM(
    '<!doctype html><html><body><main id="app"><div data-rkrs-activity-panel-slot></div><div id="settings"></div></main></body></html>',
    {
      url,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    }
  );
  const { window } = dom;
  window.structuredClone = structuredClone;
  window.TextEncoder = TextEncoder;
  const intervals = new Set();
  const createInterval = window.setInterval.bind(window);
  const clearInterval = window.clearInterval.bind(window);
  window.setInterval = (...args) => {
    const id = createInterval(...args);
    intervals.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    intervals.delete(id);
    clearInterval(id);
  };
  window.eval(code);
  const app = window.RkrsActivityPrototype;
  const widget = {};
  const context = { widget, accountId: 1, userId: 2, mode: "demo" };
  const slot = window.document.querySelector("[data-rkrs-activity-panel-slot]");
  return { dom, window, app, context, widget, intervals, slot };
}

test("repeated mounting keeps one panel and one clock; destroy removes both surfaces and styles", async () => {
  const { dom, window, app, context, widget, intervals } = setup();
  try {
    app.registerWidgetInstance(widget);
    app.mountPanel(context);
    app.mountPanel(context);
    const panels = window.document.querySelectorAll(
      '[data-rkrs-prototype-surface="panel"]'
    );
    assert.equal(panels.length, 1);
    assert.ok(panels[0].shadowRoot.querySelector("style"));
    assert.equal(window.document.head.querySelectorAll("style").length, 0);
    assert.equal(intervals.size, 1);
    app.openSettings({
      ...context,
      settingsTarget: window.document.getElementById("settings"),
    });
    app.openSettings({
      ...context,
      settingsTarget: window.document.getElementById("settings"),
    });
    assert.equal(
      window.document.querySelectorAll(
        '[data-rkrs-prototype-surface="settings"]'
      ).length,
      1
    );
    app.unmountAll(widget);
    app.unmountAll(widget);
    await settle();
    assert.equal(intervals.size, 0);
    assert.equal(
      window.document.querySelectorAll("[data-rkrs-prototype-surface]").length,
      0
    );
  } finally {
    dom.window.close();
  }
});

test("demo task bridge persists only in prototype storage and is removed on destroy", async () => {
  const { dom, window, app, context, widget, slot } = setup();
  try {
    window.localStorage.setItem("rkrs_activity_state_2", '{"legacy":true}');
    app.mountPanel(context);
    slot.dispatchEvent(
      new window.CustomEvent("rkrs-activity-demo-action", {
        detail: { type: "task", id: "task-call" },
      })
    );
    await settle();
    const key = "rkrs_activity_prototype_v1:1:2";
    assert.equal(
      JSON.parse(window.localStorage.getItem(key)).active.id,
      "task-call"
    );
    app.unmountAll(widget);
    const before = window.localStorage.getItem(key);
    slot.dispatchEvent(
      new window.CustomEvent("rkrs-activity-demo-action", {
        detail: { type: "imbox", id: "dialog-anna" },
      })
    );
    assert.equal(window.localStorage.getItem(key), before);
    assert.equal(
      window.localStorage.getItem("rkrs_activity_state_2"),
      '{"legacy":true}'
    );
    app.mountPanel(context);
    await settle();
    const text = slot.querySelector("[data-rkrs-prototype-surface]").shadowRoot
      .textContent;
    assert.ok(text.includes("Обсудить предложение"));
  } finally {
    app.unmountAll(widget);
    dom.window.close();
  }
});

test("changing user identity reinitializes state instead of sharing an active session", () => {
  const { dom, window, app, context, widget, slot, intervals } = setup();
  try {
    app.mountPanel(context);
    slot.dispatchEvent(
      new window.CustomEvent("rkrs-activity-demo-action", {
        detail: { type: "task", id: "task-call" },
      })
    );
    app.mountPanel({ ...context, userId: 3 });
    assert.equal(intervals.size, 1);
    assert.equal(
      window.document.querySelectorAll('[data-rkrs-prototype-surface="panel"]')
        .length,
      1
    );
    assert.equal(
      window.localStorage.getItem("rkrs_activity_prototype_v1:1:3"),
      null
    );
    assert.equal(
      JSON.parse(window.localStorage.getItem("rkrs_activity_prototype_v1:1:2"))
        .active.id,
      "task-call"
    );
  } finally {
    app.unmountAll(widget);
    dom.window.close();
  }
});

test("external Imbox action updates the visible dialog and outside clicks dismiss menus", async () => {
  const { dom, window, app, context, widget, slot } = setup();
  try {
    app.mountPanel(context);
    slot.dispatchEvent(
      new window.CustomEvent("rkrs-activity-demo-action", {
        detail: { type: "imbox", id: "dialog-maxim" },
      })
    );
    await settle();
    const shadow = slot.querySelector(
      "[data-rkrs-prototype-surface]"
    ).shadowRoot;
    assert.equal(
      shadow.querySelector(".rkrs-task-title").textContent.trim(),
      "Максим"
    );
    shadow.querySelector('[aria-label="История активности"]').click();
    await settle();
    assert.ok(shadow.querySelector(".rkrs-popover"));
    window.document.body.dispatchEvent(
      new window.Event("pointerdown", { bubbles: true, composed: true })
    );
    await settle();
    assert.equal(shadow.querySelector(".rkrs-popover"), null);
  } finally {
    app.unmountAll(widget);
    dom.window.close();
  }
});

test("missing SDK stays unavailable even beside a simulator slot; demo must be explicit", async () => {
  const { dom, window, app, context, widget, slot } = setup();
  try {
    delete context.mode;
    app.mountPanel(context);
    await settle();
    const shadow = window.document.querySelector('[data-rkrs-prototype-surface="panel"]').shadowRoot;
    assert.match(shadow.textContent, /Виджет не подключён/);
    assert.equal(shadow.querySelector('.rkrs-demo'), null);
    assert.equal(shadow.querySelector('.rkrs-start').disabled, true);
    assert.equal(shadow.querySelector('.rkrs-complete').disabled, true);
    slot.dispatchEvent(new window.CustomEvent('rkrs-activity-demo-action', { detail: { type: 'task', id: 'task-call' } }));
    assert.equal(window.localStorage.length, 0);
    app.mountPanel({ ...context, mode: 'demo' });
    await settle();
    const demo = slot.querySelector('[data-rkrs-prototype-surface="panel"]').shadowRoot;
    assert.ok(demo.querySelector('.rkrs-demo'));
    assert.equal(demo.querySelector('.rkrs-start').disabled, false);
  } finally {
    app.unmountAll(widget);
    dom.window.close();
  }
});

test("task completion requests a result, validates UTF-8 limit and accepts an empty result", async () => {
  const { dom, window, app, context, widget, slot } = setup();
  try {
    app.mountPanel(context);
    await settle();
    const shadow = slot.querySelector('[data-rkrs-prototype-surface="panel"]').shadowRoot;
    shadow.querySelector('.rkrs-complete').click();
    await settle();
    const form = shadow.querySelector('.rkrs-completion-form');
    assert.ok(form, 'completion requires an explicit form submission');
    const textarea = form.querySelector('textarea');
    textarea.value = 'я'.repeat(1001);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    await settle();
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    textarea.value = '';
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    await settle();
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    assert.equal(shadow.querySelector('.rkrs-completion-form'), null);
    assert.equal(JSON.parse(window.localStorage.getItem('rkrs_activity_prototype_v1:1:2')).completedTaskIds.length, 1);
  } finally {
    app.unmountAll(widget);
    dom.window.close();
  }
});

test("CRM panel is fixed in body, shifts amoCRM layout and returns after the page drops it", async () => {
  const { dom, window, app, context, widget } = setup("http://localhost/leads/pipeline/1");
  try {
    delete context.mode;
    app.mountPanel(context);
    const host = window.document.querySelector('[data-rkrs-prototype-surface="panel"]');
    assert.equal(host.parentNode, window.document.body);
    assert.equal(host.style.position, "fixed");
    assert.ok(window.document.body.classList.contains("rkrs-activity-panel-active"));
    assert.match(window.document.getElementById("rkrs-activity-layout").textContent, /#page_holder/);
    host.remove();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const restored = window.document.querySelectorAll('[data-rkrs-prototype-surface="panel"]');
    assert.equal(restored.length, 1);
    assert.notEqual(restored[0], host);
    app.unmountAll(widget);
    assert.equal(window.document.getElementById("rkrs-activity-layout"), null);
    assert.equal(window.document.body.classList.contains("rkrs-activity-panel-active"), false);
  } finally {
    app.unmountAll(widget);
    dom.window.close();
  }
});

test("CRM panel stays hidden on screens without a shifted layout", () => {
  const { dom, window, app, context, widget } = setup("http://localhost/amo-market/");
  try {
    delete context.mode;
    app.mountPanel(context);
    assert.equal(window.document.querySelector('[data-rkrs-prototype-surface="panel"]'), null);
    assert.equal(window.document.getElementById("rkrs-activity-layout"), null);
  } finally {
    app.unmountAll(widget);
    dom.window.close();
  }
});

test("a re-render right after destroy reuses the detached controller", async () => {
  const { dom, window, app, context, widget, slot } = setup();
  try {
    app.mountPanel(context);
    slot.dispatchEvent(new window.CustomEvent("rkrs-activity-demo-action", { detail: { type: "task", id: "task-call" } }));
    await settle();
    app.unmountAll(widget);
    // A fresh controller would read this empty storage and show a stopped timer.
    window.localStorage.removeItem("rkrs_activity_prototype_v1:1:2");
    const next = {};
    app.mountPanel({ ...context, widget: next });
    await settle();
    const shadow = slot.querySelector('[data-rkrs-prototype-surface="panel"]').shadowRoot;
    assert.match(shadow.querySelector(".rkrs-timer-status").textContent, /Идёт учёт/);
    app.unmountAll(next);
  } finally {
    dom.window.close();
  }
});
