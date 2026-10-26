import type { ReactNode } from "react";
import type { Employee, PipelineCatalogItem } from "../../../domain/types";
import type { Capability } from "../../../settings/api";
import { NotConnected } from "../../../ui/primitives";
import { toInt, type FieldErrors, type PanelDraft } from "../draft";

/** Общие пропсы вкладок редактора панели: значение + onChange, без вызовов бэкенда. */
export interface EditorSectionProps {
  draft: PanelDraft;
  onChange: (next: PanelDraft) => void;
  employees: Employee[];
  pipelineCatalog?: PipelineCatalogItem[];
  errors: FieldErrors;
  extensions: Capability;
  disabled?: boolean;
}

export function NumInput({ value, onChange, label, min = 0, width = 90, disabled }: { value: number; onChange: (v: number) => void; label: string; min?: number; width?: number; disabled?: boolean }) {
  return (
    <input
      className="inp sm"
      type="number"
      inputMode="numeric"
      aria-label={label}
      title={label}
      min={min}
      style={{ width }}
      value={Number.isNaN(value) ? "" : String(value)}
      disabled={disabled}
      onChange={(e) => onChange(toInt(e.target.value))}
    />
  );
}

/** Заглушка раздела, когда расширения панели (C5) не поддерживаются бэкендом. */
export function ExtensionGate({ capability, children }: { capability: Capability; children: ReactNode }) {
  if (capability.available) return <>{children}</>;
  return (
    <div className="form">
      <NotConnected contract={capability.contract} reason={capability.reason} />
      <div aria-disabled="true" style={{ opacity: 0.45, pointerEvents: "none" }}>
        {children}
      </div>
    </div>
  );
}
