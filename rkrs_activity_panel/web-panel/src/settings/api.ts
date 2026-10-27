// API настроек. Экран управления знает только SettingsBackend; что именно
// доступно — в capabilities (с номером недостающего контракта).
//  - FixtureSettingsBackend: синтетика режима разработки, хранится в
//    localStorage этого браузера с пометкой dev и ни с кем не делится;
//  - ManagementProxyBackend: amocrm-pro management API через dev-proxy Vite,
//    который добавляет серверный токен (в браузер токен не попадает);
//  - UnavailableSettingsBackend: production-сборка без браузерной
//    авторизации администратора (C7) — управление закрыто.

import { consumeBrowserSession } from "./browserSession";
import { panelOptionsFromAPI, panelOptionsToAPI, type RawPanelOptions } from "../api/panelOptions";
import { FIXTURE_EMPLOYEES, FIXTURE_OPERATORS, FIXTURE_TZ } from "../api/fixtures/generator";
import { ApiError } from "../api/errors";
import { requestJson } from "../api/http";
import type { ContractId } from "../api/source";
import type { Employee, PipelineCatalogItem } from "../domain/types";
import {
  defaultExtensions,
  defaultTaskPanel,
  type PanelCore,
  type PanelExtensions,
  type PanelSettings,
  type TaskPanelSettings,
} from "./models";

export type Capability = { available: true } | { available: false; contract: ContractId; reason: string };

export interface SettingsCapabilities {
  managePanels: Capability;
  extensions: Capability;
  telegram: Capability;
  taskPanel: Capability;
}

export interface TelegramChat {
  id: string;
  title: string;
}

export interface SettingsBackend {
  readonly kind: "fixture" | "amocrm-pro" | "unavailable";
  readonly capabilities: SettingsCapabilities;
  listPanels(): Promise<PanelSettings[]>;
  listEmployees(): Promise<Employee[]>;
  listPipelines?(): Promise<PipelineCatalogItem[]>;
  createPanel(core: PanelCore, ext: PanelExtensions | null): Promise<PanelSettings & { shareUrl: string | null }>;
  updatePanel(id: string, revision: number, core: Partial<PanelCore>, ext: PanelExtensions | null): Promise<PanelSettings>;
  rotateShareLink(id: string): Promise<{ shareUrl: string | null; panel: PanelSettings }>;
  getTaskPanel(): Promise<TaskPanelSettings>;
  saveTaskPanel(value: TaskPanelSettings): Promise<TaskPanelSettings>;
  /** Telegram: токен уходит на сервер и обратно не возвращается. */
  setTelegramToken(panelId: string, token: string): Promise<{ botName: string }>;
  discoverTelegramChats(panelId: string): Promise<TelegramChat[]>;
}

const yes: Capability = { available: true };
const no = (contract: ContractId, reason: string): Capability => ({ available: false, contract, reason });

// ---------- fixtures ----------

const DEV_STORE = "rkrs_activity_web_dev_settings_v1";

interface DevStore {
  panels: PanelSettings[];
  taskPanel: TaskPanelSettings;
  telegramTokens: Record<string, string>;
}

function readStore(): DevStore {
  try {
    const raw = localStorage.getItem(DEV_STORE);
    if (raw) return JSON.parse(raw) as DevStore;
  } catch {
    // Хранилище недоступно (приватный режим) — работаем в памяти.
  }
  return {
    panels: [
      {
        id: "demo",
        name: "Демо-панель (синтетика)",
        employeeIds: FIXTURE_EMPLOYEES.map((e) => e.id),
        displayWindow: { from: "09:00", to: "18:00" },
        enabled: true,
        timezone: FIXTURE_TZ,
        revision: 1,
        updatedAt: new Date().toISOString(),
        shareUrlIssued: true,
        extensions: { ...defaultExtensions(), operators: FIXTURE_OPERATORS },
      },
    ],
    taskPanel: { ...defaultTaskPanel(), enabled: true, enabledEmployees: FIXTURE_EMPLOYEES.slice(0, 4).map((e) => e.id) },
    telegramTokens: {},
  };
}

let memoryStore: DevStore | null = null;

function load(): DevStore {
  memoryStore ??= readStore();
  return memoryStore;
}

function save(store: DevStore) {
  memoryStore = store;
  try {
    localStorage.setItem(DEV_STORE, JSON.stringify(store));
  } catch {
    // см. readStore
  }
}

const later = <T,>(value: T): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(value)), 150));

export class FixtureSettingsBackend implements SettingsBackend {
  readonly kind = "fixture" as const;
  readonly capabilities: SettingsCapabilities = { managePanels: yes, extensions: yes, telegram: yes, taskPanel: yes };

  listPanels() {
    return later(load().panels);
  }

  listEmployees() {
    return later(FIXTURE_EMPLOYEES);
  }

  createPanel(core: PanelCore, ext: PanelExtensions | null) {
    const store = load();
    const panel: PanelSettings = {
      ...core,
      id: `dev-${Date.now().toString(36)}`,
      timezone: FIXTURE_TZ,
      revision: 1,
      updatedAt: new Date().toISOString(),
      shareUrlIssued: true,
      extensions: ext ?? defaultExtensions(),
    };
    save({ ...store, panels: [...store.panels, panel] });
    return later({ ...panel, shareUrl: `${location.origin}${location.pathname}#/p/demo` });
  }

  updatePanel(id: string, revision: number, core: Partial<PanelCore>, ext: PanelExtensions | null) {
    const store = load();
    const current = store.panels.find((p) => p.id === id);
    if (!current) return Promise.reject(new ApiError({ code: "not_found", message: "panel not found", status: 404 }));
    if (current.revision !== revision) {
      return Promise.reject(new ApiError({ code: "conflict", message: "revision mismatch", status: 409 }));
    }
    const next: PanelSettings = { ...current, ...core, extensions: ext ?? current.extensions, revision: revision + 1, updatedAt: new Date().toISOString() };
    save({ ...store, panels: store.panels.map((p) => (p.id === id ? next : p)) });
    return later(next);
  }

  rotateShareLink(id: string) {
    const store = load();
    const panel = store.panels.find((p) => p.id === id);
    if (!panel) return Promise.reject(new ApiError({ code: "not_found", message: "panel not found", status: 404 }));
    const next = { ...panel, revision: panel.revision + 1 };
    save({ ...store, panels: store.panels.map((p) => (p.id === id ? next : p)) });
    return later({ shareUrl: `${location.origin}${location.pathname}#/p/demo`, panel: next });
  }

  getTaskPanel() {
    return later(load().taskPanel);
  }

  saveTaskPanel(value: TaskPanelSettings) {
    save({ ...load(), taskPanel: value });
    return later(value);
  }

  setTelegramToken(panelId: string, token: string) {
    if (!/^\d+:[\w-]{20,}$/.test(token.trim())) {
      return Promise.reject(new ApiError({ code: "invalid_argument", message: "Неверный формат токена", status: 400 }));
    }
    const store = load();
    // В dev-хранилище кладётся только признак, не сам токен.
    save({ ...store, telegramTokens: { ...store.telegramTokens, [panelId]: "set" } });
    return later({ botName: "demo_activity_bot" });
  }

  discoverTelegramChats() {
    return later([{ id: "-100000000001", title: "Демо-чат руководителей" }]);
  }
}

// ---------- amocrm-pro management через dev-proxy ----------

interface RawManaged {
  options?: RawPanelOptions;
  id: string;
  name: string;
  employee_ids: number[];
  display_window: { from: string; to: string };
  timezone: string;
  enabled: boolean;
  revision: number;
  updated_at: string;
  share_url_issued: boolean;
  share_url?: string;
}

const fromManaged = (p: RawManaged): PanelSettings => ({
  id: p.id,
  name: p.name,
  employeeIds: p.employee_ids,
  displayWindow: p.display_window,
  enabled: p.enabled,
  timezone: p.timezone,
  revision: p.revision,
  updatedAt: p.updated_at,
  shareUrlIssued: p.share_url_issued,
  extensions: panelOptionsFromAPI(p.options),
});

export class ManagementProxyBackend implements SettingsBackend {
  readonly kind = "amocrm-pro" as const;
  readonly capabilities: SettingsCapabilities = {
    managePanels: yes,
    extensions: yes,
    telegram: no("C5", "Telegram-уведомления не реализованы в amocrm-pro"),
    taskPanel: yes,
  };
  private taskRevision: number | null = null;
  private taskSaveQueue: Promise<unknown> = Promise.resolve();
  private taskSaveError: ApiError | null = null;
  constructor(private readonly base = "/dev-management/api/v1/activity", private readonly bearer?: string) {}

  private call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (method === "POST") headers["Idempotency-Key"] = crypto.randomUUID();
    return requestJson<T>(`${this.base}${path}`, { method, body, headers, bearer: this.bearer });
  }

  async listPanels() {
    const page = await this.call<{ panels: RawManaged[] }>("/panels");
    return page.panels.map(fromManaged);
  }

  async listEmployees() {
    const dir = await this.call<{ users: { id: number; name: string; group_id: number; group_name: string }[] }>("/employees");
    return dir.users.map((u) => ({ id: u.id, name: u.name, groupId: String(u.group_id), groupName: u.group_name || "Без отдела" }));
  }

  async listPipelines(): Promise<PipelineCatalogItem[]> {
    const dir = await this.call<{ pipelines?: { id: number; name: string; statuses: { id: number; name: string }[] }[] }>("/employees");
    return (dir.pipelines ?? []).map((p) => ({ id: String(p.id), name: p.name, statuses: (p.statuses ?? []).map((s) => ({ id: String(s.id), name: s.name })) }));
  }

  async createPanel(core: PanelCore, ext: PanelExtensions | null) {
    const p = await this.call<RawManaged>("/panels", "POST", { name: core.name.trim(), employee_ids: core.employeeIds, display_window: core.displayWindow, enabled: core.enabled, ...(ext ? { options: panelOptionsToAPI(ext) } : {}) });
    return { ...fromManaged(p), shareUrl: p.share_url ?? null };
  }

  async updatePanel(id: string, revision: number, core: Partial<PanelCore>, ext: PanelExtensions | null) {
    const body: Record<string, unknown> = { revision };
    if (ext) body.options = panelOptionsToAPI(ext);
    if (core.name !== undefined) body.name = core.name.trim();
    if (core.employeeIds !== undefined) body.employee_ids = core.employeeIds;
    if (core.displayWindow !== undefined) body.display_window = core.displayWindow;
    if (core.enabled !== undefined) body.enabled = core.enabled;
    return fromManaged(await this.call<RawManaged>(`/panels/${encodeURIComponent(id)}`, "PATCH", body));
  }

  async rotateShareLink(id: string) {
    const p = await this.call<RawManaged>(`/panels/${encodeURIComponent(id)}/share-link`, "POST", {});
    return { shareUrl: p.share_url ?? null, panel: fromManaged(p) };
  }

  async getTaskPanel(): Promise<TaskPanelSettings> {
    // A reload observes the result of earlier queued saves before resetting CAS.
    await this.taskSaveQueue.catch(() => undefined);
    const raw = await this.call<RawTaskPanel>("/task-panel");
    this.taskRevision = raw.revision;
    this.taskSaveError = null;
    return taskPanelFromAPI(raw);
  }

  saveTaskPanel(value: TaskPanelSettings): Promise<TaskPanelSettings> {
    const save = async () => {
      if (this.taskSaveError) throw this.taskSaveError;
      if (this.taskRevision === null) throw new ApiError({ code: "conflict", message: "Сначала загрузите актуальные настройки" });
      try {
        const raw = await this.call<RawTaskPanel>("/task-panel", "PATCH", { enabled: value.enabled, employee_ids: value.enabledEmployees, consider_future_tasks: value.considerFutureTasks, include_related_deals: value.includeRelatedDeals, priority_keys: value.priorities.filter((p) => p.enabled).map((p) => p.key), revision: this.taskRevision });
        this.taskRevision = raw.revision;
        return taskPanelFromAPI(raw);
      } catch (error) {
        if (error instanceof ApiError && ["conflict", "permission_denied", "unauthenticated", "reauth_required"].includes(error.code)) this.taskSaveError = error;
        throw error;
      }
    };
    const pending = this.taskSaveQueue.then(save, save);
    this.taskSaveQueue = pending;
    return pending;
  }

  setTelegramToken(): Promise<{ botName: string }> {
    return Promise.reject(new ApiError({ code: "unavailable", message: "C5" }));
  }

  discoverTelegramChats(): Promise<TelegramChat[]> {
    return Promise.reject(new ApiError({ code: "unavailable", message: "C5" }));
  }
}

// ---------- production без C7 ----------

export class UnavailableSettingsBackend implements SettingsBackend {
  readonly kind = "unavailable" as const;
  readonly capabilities: SettingsCapabilities = {
    managePanels: no("C7", "Откройте общие настройки из виджета amoCRM с правами администратора"),
    extensions: no("C7", "Для общих настроек нужен вход администратора из виджета amoCRM"),
    telegram: no("C5", "Telegram-уведомления не реализованы в amocrm-pro"),
    taskPanel: no("C7", "Для настроек панели задач нужен вход администратора из виджета amoCRM"),
  };
  private fail<T>(): Promise<T> {
    return Promise.reject(new ApiError({ code: "permission_denied", message: "C7" }));
  }
  listPanels() { return this.fail<PanelSettings[]>(); }
  listEmployees() { return this.fail<Employee[]>(); }
  createPanel() { return this.fail<PanelSettings & { shareUrl: string | null }>(); }
  updatePanel() { return this.fail<PanelSettings>(); }
  rotateShareLink() { return this.fail<{ shareUrl: string | null; panel: PanelSettings }>(); }
  getTaskPanel() { return this.fail<TaskPanelSettings>(); }
  saveTaskPanel() { return this.fail<TaskPanelSettings>(); }
  setTelegramToken() { return this.fail<{ botName: string }>(); }
  discoverTelegramChats() { return this.fail<TelegramChat[]>(); }
}

export function createSettingsBackend(mode: "live" | "hybrid" | "fixtures" = __DATA_MODE__): SettingsBackend {
  const session = consumeBrowserSession();
  if (mode === "fixtures") return new FixtureSettingsBackend();
  if (session) return new ManagementProxyBackend(`${import.meta.env.VITE_ACTIVITY_API_BASE ?? ""}/api/v1/activity`, session);
  if (__DEV_MANAGEMENT__) return new ManagementProxyBackend();
  return new UnavailableSettingsBackend();
}

interface RawTaskPanel { enabled: boolean; employee_ids: number[] | null; consider_future_tasks: boolean; include_related_deals: boolean; priority_keys: string[] | null; revision: number }
function taskPanelFromAPI(raw: RawTaskPanel): TaskPanelSettings {
  const defaults = defaultTaskPanel().priorities;
  const ordered = [...new Set(raw.priority_keys ?? [])].flatMap((key) => {
    const rule = defaults.find((p) => p.key === key);
    return rule ? [{ ...rule, enabled: true }] : [];
  });
  return { ...defaultTaskPanel(), revision: raw.revision, enabled: raw.enabled, enabledEmployees: raw.employee_ids ?? [], considerFutureTasks: raw.consider_future_tasks, includeRelatedDeals: raw.include_related_deals, priorities: [...ordered, ...defaults.filter((p) => !ordered.some((r) => r.key === p.key)).map((p) => ({ ...p, enabled: false }))] };
}
