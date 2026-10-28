import { createApp } from "vue";
import WidgetPanel from "./WidgetPanel.vue";
import widgetCss from "./widget.css?inline";
import { createLiveActivityController } from "./live-controller.js";
import { createActivityController } from "./model.js";

const registered = new WeakSet();
const records = new Map();
const storagePrefix = "rkrs_activity_prototype_v1";
const fixedHosts = new Set();
// amoCRM calls destroy and render again on every area change. A detached
// controller waits briefly so its server state and in-flight command survive.
const parked = new Map();
const reuseWindow = 10000;
const layoutStyleId = "rkrs-activity-layout";
const layoutClass = "rkrs-activity-panel-active";
const heightVar = "--rkrs-activity-panel-height";
// Same screens as the previous widget: their layouts do not shift below a top bar.
const hiddenRoutes = ["/dashboard", "/events/list", "/stats", "/amo-market", "/settings"];
// amoCRM positions its page containers from top:0, so a fixed bar must push them down.
const shifted = [
  ...["dashboard-search", "dashboard-superlog", "inbox-wrapper", "list-catalogs",
    "list-contacts", "list-customers", "list-digital-pipeline", "list-events",
    "list-helpbot", "list-helpbot-dataset", "list-leads", "list-mail",
    "list-pipeline", "list-todo", "list-todo-calendar", "list-todo-line",
    "list-user_rights", "list-widget"].map((name) => `.${name} .list__body-right__top`),
  "#page_holder", "#sidebar", "#card_holder", "#widgets_block",
  "#widget_page_sidebar", ".content__card-holder-mail_thread", ".card-cf",
];
const layoutCss = `${shifted
  .map((selector) => `body.${layoutClass} ${selector}`)
  .join(",")}{top:var(${heightVar},76px) !important;}`;

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function identity(context) {
  return `${storagePrefix}:${encodeURIComponent(
    context.accountId ?? "demo"
  )}:${encodeURIComponent(context.userId ?? "demo")}`;
}

function unavailableController(message) {
  const state = {
    live: true, ready: false, enabled: false, busy: false, pending: false,
    scenario: "tasks", tasks: [], dialogs: [], selectedTaskId: null,
    active: null, history: [], settings: { compact: false },
    error: message, elapsedSeconds: 0, totalSeconds: 0, completedCount: null,
  };
  const noop = () => false;
  return {
    getSnapshot: () => structuredClone(state), subscribe: () => noop,
    selectScenario: noop, selectTask: noop, startTask: noop, startOther: noop,
    startImbox: noop, pause: noop, stop: noop, completeTask: noop,
    refresh: noop, updateSettings: noop, openManagement: noop,
    reset: noop, tick: noop, dispose: noop,
  };
}

function recordFor(context) {
  if (!context?.widget || typeof context.widget !== "object")
    throw new Error("Widget instance is required");
  const key = identity(context);
  // Only the explicit simulator context may create local tasks or timers.
  // A missing SDK in amoCRM is an unavailable integration, never a demo.
  const demo = context.mode === "demo";
  const authenticated = typeof context.widget.$authorizedAjax === "function" &&
    Number.isSafeInteger(Number(context.accountId)) && Number(context.accountId) > 0 &&
    Number.isSafeInteger(Number(context.userId)) && Number(context.userId) > 0;
  const mode = demo ? "demo" : authenticated ? "live" : "unavailable";
  let record = records.get(context.widget);
  if (record && (record.storageKey !== key || record.mode !== mode)) {
    release(context.widget, false);
    record = null;
  }
  if (!record) {
    record = parked.get(`${mode}:${key}`);
    if (record) {
      parked.delete(`${mode}:${key}`);
      window.clearTimeout(record.disposeTimer);
      record.disposeTimer = null;
    }
  }
  if (!record) {
    record = {
      storageKey: key,
      mode,
      controller: demo ? createActivityController({
        storage: safeStorage(),
        storageKey: key,
      }) : authenticated ? createLiveActivityController({ context, apiOrigin: import.meta.env.VITE_ACTIVITY_API_ORIGIN, appOrigin: import.meta.env.VITE_ACTIVITY_APP_ORIGIN }) : unavailableController("Виджет не подключён: недоступны авторизация amoCRM или данные сотрудника. Обновите страницу CRM."),
      panel: null,
      panelWanted: false,
      settings: null,
      timer: null,
      bridgeTarget: null,
      bridgeHandler: null,
      previewUnsubscribe: null,
      disposeTimer: null,
      hidden: false,
    };
    const created = record;
    created.hidden = created.controller.getSnapshot().hidden === true;
    created.controller.subscribe((snapshot) => {
      created.hidden = snapshot?.hidden === true;
    });
  }
  if (!records.has(context.widget)) {
    records.set(context.widget, record);
    const current = record;
    // One clock for both the panel and its settings; display time derives from a timestamp.
    // The same clock restores the panel after amoCRM rebuilds the page on navigation.
    current.timer = window.setInterval(() => {
      current.controller.tick();
      placePanel(current);
    }, 1000);
  }
  return record;
}

function hiddenRoute() {
  const path = window.location.pathname;
  return hiddenRoutes.some((route) => path === route || path.startsWith(`${route}/`));
}

function syncLayout() {
  for (const host of fixedHosts) if (!host.isConnected) fixedHosts.delete(host);
  const style = document.getElementById(layoutStyleId);
  if (!fixedHosts.size) {
    style?.remove();
    document.body.classList.remove(layoutClass);
    document.documentElement.style.removeProperty(heightVar);
    return;
  }
  if (!style) {
    const node = document.createElement("style");
    node.id = layoutStyleId;
    node.textContent = layoutCss;
    document.head.append(node);
  }
  document.body.classList.add(layoutClass);
}

function fixPanel(view) {
  const { host } = view;
  host.style.cssText = "display:block;position:fixed;top:0;left:64px;right:0;z-index:200;";
  fixedHosts.add(host);
  const measure = () => {
    if (host.isConnected && host.offsetHeight)
      document.documentElement.style.setProperty(heightVar, `${host.offsetHeight}px`);
  };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
  observer?.observe(host);
  measure();
  view.cleanup = () => {
    observer?.disconnect();
    fixedHosts.delete(host);
  };
  syncLayout();
}

function removePanel(record) {
  removeSurface(record.panel);
  record.panel = null;
  syncLayout();
}

function surface(target, controller, settingsOnly = false) {
  const host = document.createElement("div");
  host.setAttribute(
    "data-rkrs-prototype-surface",
    settingsOnly ? "settings" : "panel"
  );
  // Shows which commit the installed bundle came from (see release.json).
  host.setAttribute("data-rkrs-build", import.meta.env.VITE_RKRS_BUILD || "dev");
  host.style.cssText = settingsOnly
    ? "display:block;width:100%;"
    : "display:block;position:relative;z-index:200;width:100%;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = widgetCss;
  const root = document.createElement("div");
  shadow.append(style, root);
  if (settingsOnly) target.append(host);
  else target.prepend(host);
  const app = createApp(WidgetPanel, { controller, settingsOnly });
  app.mount(root);
  return { host, app, dialog: null, cleanup: null };
}

function removeSurface(view) {
  if (!view) return;
  view.cleanup?.();
  view.app.unmount();
  view.host.remove();
  view.dialog?.remove();
}

export function registerWidgetInstance(widget) {
  if (!widget || typeof widget !== "object")
    throw new Error("Widget instance is required");
  registered.add(widget);
}

export function mountPanel(context) {
  const record = recordFor(context);
  record.panelWanted = true;
  placePanel(record);
}

function placePanel(record) {
  if (!record.panelWanted) return;
  const slot = record.mode === "demo" && document.querySelector("[data-rkrs-activity-panel-slot]");
  if (!slot && (record.hidden || hiddenRoute())) {
    if (record.panel) removePanel(record);
    return;
  }
  if (record.panel?.host.isConnected) return;
  removePanel(record);
  // amoCRM replaces page containers on navigation; body survives it.
  const target = slot || document.body;
  record.panel = surface(target, record.controller);
  if (!slot) fixPanel(record.panel);
  if (record.bridgeTarget)
    record.bridgeTarget.removeEventListener(
      "rkrs-activity-demo-action",
      record.bridgeHandler
    );
  record.previewUnsubscribe?.();
  // Explicit simulator-only bridge. No selectors or writes into real amoCRM task cards.
  if (record.mode === "demo" && target.hasAttribute("data-rkrs-activity-panel-slot")) {
    record.bridgeTarget = target;
    record.bridgeHandler = (event) => {
      if (event.detail?.type === "task")
        record.controller.startTask(event.detail.id);
      if (event.detail?.type === "imbox")
        record.controller.startImbox(event.detail.id);
    };
    target.addEventListener("rkrs-activity-demo-action", record.bridgeHandler);
    const publishPreview = (snapshot) =>
      target.dispatchEvent(
        new CustomEvent("rkrs-activity-demo-state", { detail: snapshot })
      );
    record.previewUnsubscribe = record.controller.subscribe(publishPreview);
    publishPreview(record.controller.getSnapshot());
  }
}

export function openSettings(context) {
  const record = recordFor(context);
  const target = context.settingsTarget;
  removeSurface(record.settings);
  record.settings = null;
  if (target?.nodeType === 1 && target.isConnected) {
    record.settings = surface(target, record.controller, true);
    return;
  }
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Настройки виджета активности");
  dialog.style.cssText =
    "padding:0;border:1px solid #2b435e;border-radius:12px;background:#0e273e;color:white;width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 40px);";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Закрыть";
  close.style.cssText =
    "display:block;margin:12px 16px 12px auto;padding:8px 16px;background:#213855;color:white;border:1px solid #2b435e;border-radius:6px;cursor:pointer;";
  const content = document.createElement("div");
  dialog.append(close, content);
  document.body.append(dialog);
  const view = surface(content, record.controller, true);
  view.dialog = dialog;
  const dismiss = () => {
    if (record.settings === view) record.settings = null;
    removeSurface(view);
  };
  const cancel = (event) => {
    event.preventDefault();
    dismiss();
  };
  close.addEventListener("click", dismiss);
  dialog.addEventListener("cancel", cancel);
  view.cleanup = () => {
    close.removeEventListener("click", dismiss);
    dialog.removeEventListener("cancel", cancel);
  };
  record.settings = view;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function release(widget, keep) {
  const record = records.get(widget);
  if (!record) return;
  window.clearInterval(record.timer);
  record.timer = null;
  record.previewUnsubscribe?.();
  record.previewUnsubscribe = null;
  record.bridgeTarget?.removeEventListener(
    "rkrs-activity-demo-action",
    record.bridgeHandler
  );
  record.bridgeTarget = null;
  removePanel(record);
  removeSurface(record.settings);
  record.settings = null;
  record.panelWanted = false;
  records.delete(widget);
  registered.delete(widget);
  const key = `${record.mode}:${record.storageKey}`;
  const previous = parked.get(key);
  if (previous) {
    parked.delete(key);
    window.clearTimeout(previous.disposeTimer);
    previous.controller.dispose();
  }
  if (!keep) {
    record.controller.dispose();
    return;
  }
  parked.set(key, record);
  record.disposeTimer = window.setTimeout(() => {
    if (parked.get(key) !== record) return;
    parked.delete(key);
    record.controller.dispose();
  }, reuseWindow);
}

export function unmountAll(widget) {
  release(widget, true);
}
