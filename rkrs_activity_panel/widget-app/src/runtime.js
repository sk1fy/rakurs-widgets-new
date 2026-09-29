import { createApp } from "vue";
import WidgetPanel from "./WidgetPanel.vue";
import widgetCss from "./widget.css?inline";
import { createActivityController } from "./model.js";

const registered = new WeakSet();
const records = new Map();
const storagePrefix = "rkrs_activity_prototype_v1";

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

function recordFor(context) {
  if (!context?.widget || typeof context.widget !== "object")
    throw new Error("Widget instance is required");
  const key = identity(context);
  let record = records.get(context.widget);
  if (record && record.storageKey !== key) {
    unmountAll(context.widget);
    record = null;
  }
  if (!record) {
    record = {
      storageKey: key,
      controller: createActivityController({
        storage: safeStorage(),
        storageKey: key,
      }),
      panel: null,
      settings: null,
      timer: null,
      bridgeTarget: null,
      bridgeHandler: null,
      previewUnsubscribe: null,
    };
    records.set(context.widget, record);
    // One clock for both the panel and its settings; display time derives from a timestamp.
    record.timer = window.setInterval(() => record.controller.tick(), 1000);
  }
  return record;
}

function surface(target, controller, settingsOnly = false) {
  const host = document.createElement("div");
  host.setAttribute(
    "data-rkrs-prototype-surface",
    settingsOnly ? "settings" : "panel"
  );
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
  if (record.panel?.host.isConnected) return;
  removeSurface(record.panel);
  const target =
    document.querySelector("[data-rkrs-activity-panel-slot]") ||
    document.querySelector("#app") ||
    document.body;
  record.panel = surface(target, record.controller);
  if (record.bridgeTarget)
    record.bridgeTarget.removeEventListener(
      "rkrs-activity-demo-action",
      record.bridgeHandler
    );
  record.previewUnsubscribe?.();
  // Explicit simulator-only bridge. No selectors or writes into real amoCRM task cards.
  if (target.hasAttribute("data-rkrs-activity-panel-slot")) {
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

export function unmountAll(widget) {
  const record = records.get(widget);
  if (!record) return;
  window.clearInterval(record.timer);
  record.previewUnsubscribe?.();
  record.bridgeTarget?.removeEventListener(
    "rkrs-activity-demo-action",
    record.bridgeHandler
  );
  removeSurface(record.panel);
  removeSurface(record.settings);
  record.controller.dispose();
  records.delete(widget);
  registered.delete(widget);
}
