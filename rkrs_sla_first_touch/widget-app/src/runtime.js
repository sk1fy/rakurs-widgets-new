import { createApp } from "vue";
import WidgetApp from "./WidgetApp.vue";
import widgetCss from "./widget.css?inline";
import { createSlaController } from "./model.js";

const registered = new WeakSet();
const records = new Map();
const storagePrefix = "rkrs_sla_prototype_v1";

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
      controller: createSlaController({
        storage: safeStorage(),
        storageKey: key,
      }),
      panel: null,
      settings: null,
      timer: null,
    };
    records.set(context.widget, record);
    record.timer = window.setInterval(() => record.controller.tick(), 1000);
  }
  return record;
}

function surface(target, controller, settingsOnly = false) {
  const host = document.createElement("div");
  host.setAttribute("data-rkrs-prototype-surface", settingsOnly ? "settings" : "panel");
  host.style.cssText = "display:block;width:100%;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = widgetCss;
  const root = document.createElement("div");
  shadow.append(style, root);
  target.append(host);
  const app = createApp(WidgetApp, { controller, settingsOnly });
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
    document.querySelector("[data-rkrs-sla-slot]") ||
    document.querySelector("#app") ||
    document.body;
  record.panel = surface(target, record.controller);
}

export function openSettings(context) {
  const record = recordFor(context);
  if (record.panel?.host.isConnected) {
    record.controller.focusSettings();
    return;
  }
  const target = context.settingsTarget;
  removeSurface(record.settings);
  record.settings = null;
  if (target?.nodeType === 1 && target.isConnected) {
    record.settings = surface(target, record.controller, true);
    return;
  }
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Настройки SLA");
  dialog.style.cssText =
    "padding:16px;border:1px solid #e5eaf0;border-radius:12px;background:#f5f7fa;color:#38455a;width:min(640px,calc(100vw - 32px));max-height:calc(100vh - 40px);";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Закрыть";
  close.style.cssText =
    "display:block;margin:0 0 12px auto;padding:8px 16px;background:#fff;color:#38455a;border:1px solid #d5e0ea;border-radius:8px;cursor:pointer;";
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
  removeSurface(record.panel);
  removeSurface(record.settings);
  record.controller.dispose();
  records.delete(widget);
  registered.delete(widget);
}
