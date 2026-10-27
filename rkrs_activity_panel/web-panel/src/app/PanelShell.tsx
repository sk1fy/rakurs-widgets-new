import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createSource } from "../api";
import { ApiError } from "../api/errors";
import { loadPreferences, savePreferences } from "../settings/preferences";
import type { LocalPreferences } from "../settings/models";
import { ErrorState, Spinner } from "../ui/primitives";
import { PanelScopeContext } from "./context";
import { AppHeader } from "./AppHeader";
import { ACTIVE_REFRESH_MS, useResource } from "./hooks";

/** Загружает панель по ключу просмотра и даёт экранам источник, панель и личные предпочтения. */
export function PanelShell({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const source = useMemo(() => createSource(viewKey), [viewKey]);
  const panel = useResource(`panel:${viewKey}`, (signal) => source.loadPanel(signal), { refreshMs: ACTIVE_REFRESH_MS });
  const [prefsState, setPrefsState] = useState<{ key: string; value: LocalPreferences }>(() => ({ key: viewKey, value: loadPreferences(viewKey) }));
  const prefs = prefsState.key === viewKey ? prefsState.value : loadPreferences(viewKey);
  const setPrefs = useCallback(
    (update: (prev: LocalPreferences) => LocalPreferences) => {
      setPrefsState((s) => {
        const next = update(s.key === viewKey ? s.value : loadPreferences(viewKey));
        savePreferences(viewKey, next);
        return { key: viewKey, value: next };
      });
    },
    [viewKey],
  );

  const denied = panel.error instanceof ApiError && ["unauthenticated", "permission_denied", "not_found", "reauth_required"].includes(panel.error.code);
  if (panel.status === "error" || denied) {
    return (
      <>
        <AppHeader mode={source.mode} viewKey={null} showSettings={false} />
        <div className="page-state">
          <ErrorState error={panel.error} onRetry={panel.reload} />
        </div>
      </>
    );
  }
  if (!panel.data) return <Spinner label="Загрузка панели…" />;
  return (
    <PanelScopeContext.Provider value={{ viewKey, source, panel: panel.data, prefs, setPrefs }}>
      {panel.error !== null && <div className="banner">Настройки панели не обновились; показаны последние доступные данные. <button className="tool-btn" onClick={panel.reload}>Повторить</button></div>}
      {children}
    </PanelScopeContext.Provider>
  );
}
