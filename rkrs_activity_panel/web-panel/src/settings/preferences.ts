// Личные предпочтения зрителя: localStorage этого браузера.
// Ключ строится из хэша ключа просмотра — сам секрет ссылки в хранилище не пишется.

import { hashString } from "../api/fixtures/generator";
import { defaultPreferences, KPI_KEYS, type LocalPreferences } from "./models";

export function preferencesKey(viewKey: string): string {
  return `rkrs_activity_web_prefs_${hashString(viewKey).toString(36)}`;
}

export function loadPreferences(viewKey: string): LocalPreferences {
  const base = defaultPreferences();
  try {
    const raw = localStorage.getItem(preferencesKey(viewKey));
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<LocalPreferences>;
    if (parsed.version !== 1) return base;
    return {
      ...base,
      ...parsed,
      notifications: { ...base.notifications, ...parsed.notifications },
      kpi: { ...base.kpi, ...Object.fromEntries(KPI_KEYS.filter((k) => typeof parsed.kpi?.[k] === "boolean").map((k) => [k, parsed.kpi?.[k]])) },
    };
  } catch {
    return base;
  }
}

export function savePreferences(viewKey: string, prefs: LocalPreferences): void {
  try {
    localStorage.setItem(preferencesKey(viewKey), JSON.stringify(prefs));
  } catch {
    // Хранилище недоступно — предпочтения живут до перезагрузки.
  }
}
