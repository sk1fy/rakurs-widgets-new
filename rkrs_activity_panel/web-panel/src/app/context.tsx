import { createContext, useContext } from "react";
import type { ActivitySource } from "../api/source";
import type { PanelContext } from "../domain/types";
import type { LocalPreferences } from "../settings/models";

export interface PanelScope {
  viewKey: string;
  source: ActivitySource;
  panel: PanelContext;
  prefs: LocalPreferences;
  setPrefs: (update: (prev: LocalPreferences) => LocalPreferences) => void;
}

export const PanelScopeContext = createContext<PanelScope | null>(null);

export function usePanelScope(): PanelScope {
  const scope = useContext(PanelScopeContext);
  if (!scope) throw new Error("PanelScopeContext is missing");
  return scope;
}
