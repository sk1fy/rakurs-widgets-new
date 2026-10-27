import { useContext, useMemo } from "react";
import { AppHeader } from "../../app/AppHeader";
import { PanelScopeContext, type PanelScope } from "../../app/context";
import { href } from "../../app/router";
import { createSettingsBackend, type SettingsBackend } from "../../settings/api";
import type { LocalPreferences } from "../../settings/models";
import { Icon } from "../../ui/Icon";
import { PanelsSection } from "./PanelsSection";
import { TaskPanelSection } from "./TaskPanelSection";
import { useToast } from "./useToast";
import { ViewPreferencesForm } from "./ViewPreferencesForm";

type SettingsTab = "view" | "panels" | "task-panel";

const BACKEND_LABEL: Record<SettingsBackend["kind"], { text: string; tone: string; title: string }> = {
  fixture: { text: "синтетика (dev)", tone: "warn", title: "Настройки хранятся только в этом браузере, в amoCRM ничего не уходит" },
  "amocrm-pro": { text: "amocrm-pro", tone: "info", title: "Серверные настройки аккаунта" },
  unavailable: { text: "управление недоступно", tone: "mut", title: "Откройте общие настройки из виджета amoCRM с правами администратора" },
};

/** Экран настроек: «Мой вид» (локально), «Панели» и «Панель задач» (общие). */
export function SettingsPage({ tab, standalone }: { tab: string | null; standalone?: boolean }) {
  const contextScope = useContext(PanelScopeContext);
  const scope = standalone ? null : contextScope;
  const backend = useMemo(() => createSettingsBackend(), []);
  const toast = useToast();

  const tabs: { value: SettingsTab; label: string; group: string }[] = [
    ...(scope ? [{ value: "view" as const, label: "Мой вид", group: "Только для меня" }] : []),
    ...(!scope ? [{ value: "panels" as const, label: "Панели", group: "Общие настройки" }, { value: "task-panel" as const, label: "Панель задач", group: "Общие настройки" }] : []),
  ];
  const active: SettingsTab = tabs.find((t) => t.value === tab)?.value ?? tabs[0]?.value ?? "panels";
  const viewKey = scope?.viewKey ?? null;
  const label = BACKEND_LABEL[backend.kind];

  return (
    <>
      <AppHeader mode={__DATA_MODE__} panelName={scope?.panel.name} viewKey={viewKey} showSettings={false} />
      <div className="page">
        {scope && backend.capabilities.managePanels.available && <a className="tool-btn" href={href({ name: "settings", viewKey: null, tab: "panels" })}>Общие настройки аккаунта</a>}
        <div className="row-f" style={{ justifyContent: "space-between", margin: "12px 8px 16px" }}>
          <div className="row-f">
            {viewKey && (
              <a className="tool-btn" href={href({ name: "dashboard", viewKey, date: null })}>
                <Icon name="back" />К панели
              </a>
            )}
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Настройки</h1>
          </div>
          <span className={`chip ${label.tone}`} title={label.title}>
            {label.text}
          </span>
        </div>
        <div className="set-layout">
          <nav className="set-nav" aria-label="Разделы настроек">
            {tabs.map((t, i) => (
              <div key={t.value}>
                {tabs[i - 1]?.group !== t.group && <div className="grp-t">{t.group}</div>}
                <a className={active === t.value ? "on" : ""} aria-current={active === t.value ? "page" : undefined} href={href({ name: "settings", viewKey, tab: t.value })}>
                  {t.label}
                </a>
              </div>
            ))}
          </nav>
          <main>
            {active === "view" && scope && <ViewSection scope={scope} notify={toast.show} />}
            {active === "panels" && <PanelsSection backend={backend} notify={toast.show} />}
            {active === "task-panel" && <TaskPanelSection backend={backend} />}
          </main>
        </div>
      </div>
      {toast.message && (
        <div className="toast" role="status">
          {toast.message}
        </div>
      )}
    </>
  );
}

function ViewSection({ scope, notify }: { scope: PanelScope; notify: (message: string) => void }) {
  const onChange = (next: LocalPreferences) => {
    scope.setPrefs(() => next);
    notify("Сохранено в этом браузере");
  };
  return (
    <div className="form">
      <div className="state compact">
        <Icon name="info" />
        <div>
          <b>Хранится только в этом браузере, другие зрители не видят.</b>
          <div className="dim small">Общие настройки панели меняются в разделе «Панели».</div>
        </div>
      </div>
      <ViewPreferencesForm key={scope.viewKey} value={scope.prefs} onChange={onChange} panel={scope.panel} />
    </div>
  );
}
