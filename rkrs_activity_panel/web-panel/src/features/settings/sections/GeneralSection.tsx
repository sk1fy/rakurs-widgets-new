import { useState } from "react";
import { NotConnected, Switch } from "../../../ui/primitives";
import { EmployeePicker } from "../EmployeePicker";
import { parsePipelines, setDraftEmployees } from "../draft";
import type { EditorSectionProps } from "./fields";

/** «Общие»: ядро панели (amocrm-pro) + воронки (расширение C5). */
export function GeneralSection({ draft, onChange, employees, errors, extensions, disabled, pipelineCatalog = [] }: EditorSectionProps) {
  const { core } = draft;
  const [pipelinesText, setPipelinesText] = useState(() => draft.ext.pipelines.join(", "));
  const setCore = (p: Partial<typeof core>) => onChange({ ...draft, core: { ...core, ...p } });

  return (
    <div className="form">
      <label className="field">
        <span>Название панели</span>
        <input className="inp" value={core.name} maxLength={120} disabled={disabled} onChange={(e) => setCore({ name: e.target.value })} />
        {errors.name && <div className="err">{errors.name}</div>}
      </label>

      <div className="field">
        <span>Сотрудники панели</span>
        <EmployeePicker employees={employees} value={core.employeeIds} disabled={disabled} onChange={(ids) => onChange(setDraftEmployees(draft, ids))} />
        {errors.employeeIds && <div className="err">{errors.employeeIds}</div>}
      </div>

      <div className="field">
        <span>Рабочее окно панели</span>
        <div className="row-f">
          <input className="inp" type="time" aria-label="С" style={{ width: 120 }} value={core.displayWindow.from} disabled={disabled} onChange={(e) => setCore({ displayWindow: { ...core.displayWindow, from: e.target.value } })} />
          <span className="dim">—</span>
          <input className="inp" type="time" aria-label="До" style={{ width: 120 }} value={core.displayWindow.to} disabled={disabled} onChange={(e) => setCore({ displayWindow: { ...core.displayWindow, to: e.target.value } })} />
        </div>
        {errors.displayWindow && <div className="err">{errors.displayWindow}</div>}
      </div>

      <Switch checked={core.enabled} disabled={disabled} onChange={(v) => setCore({ enabled: v })} label="Панель включена (выключенная панель не открывается по ссылке)" />

      <div className="field">
        <span>Воронки (пусто — все)</span>
        {!extensions.available && <NotConnected compact contract={extensions.contract} reason={extensions.reason} />}
        {pipelineCatalog.length > 0 ? <div className="form">{pipelineCatalog.map((p) => <label key={p.id} className="chk"><input type="checkbox" checked={draft.ext.pipelines.includes(p.id)} disabled={disabled || !extensions.available} onChange={(e) => onChange({ ...draft, ext: { ...draft.ext, pipelines: e.target.checked ? [...draft.ext.pipelines, p.id] : draft.ext.pipelines.filter((id) => id !== p.id) } })} />{p.name}</label>)}</div> : <input
          className="inp"
          placeholder="ID воронок через запятую"
          value={pipelinesText}
          disabled={disabled || !extensions.available}
          onChange={(e) => {
            setPipelinesText(e.target.value);
            onChange({ ...draft, ext: { ...draft.ext, pipelines: parsePipelines(e.target.value) } });
          }}
        />}
        {draft.ext.pipelines.length > 0 && extensions.available && (
          <div className="chips">
            {draft.ext.pipelines.map((p) => (
              <span key={p} className="chip mut">
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
