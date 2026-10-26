import { useState } from "react";
import type { OperatorSettings } from "../../../domain/types";
import { Icon } from "../../../ui/Icon";
import { Avatar, EmptyState, Switch } from "../../../ui/primitives";
import { departmentThresholds, toggleOperator } from "../draft";
import { ExtensionGate, NumInput, type EditorSectionProps } from "./fields";

/** «Операторы»: кто из сотрудников панели — оператор, его план и пороги звонков. */
export function OperatorsSection({ draft, onChange, employees, errors, extensions, disabled }: EditorSectionProps) {
  const off = disabled || !extensions.available;
  const selected = new Set(draft.core.employeeIds);
  const candidates = employees.filter((e) => selected.has(e.id)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const byId = new Map(employees.map((e) => [e.id, e]));
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? candidates.filter((e) => e.name.toLowerCase().includes(q)) : candidates;
  const operators = draft.ext.operators;
  const isOperator = new Set(operators.map((o) => o.employeeId));

  const setOperators = (next: OperatorSettings[]) => onChange({ ...draft, ext: { ...draft.ext, operators: next } });
  const patchOp = (id: number, p: Partial<OperatorSettings>) => setOperators(operators.map((o) => (o.employeeId === id ? { ...o, ...p } : o)));

  return (
    <ExtensionGate capability={extensions}>
      <div className="form">
        <div className="field">
          <span>Операторы среди сотрудников панели</span>
          {candidates.length === 0 ? (
            <EmptyState title="Сначала выберите сотрудников" hint="Операторов можно назначить только из сотрудников панели (вкладка «Общие»)." />
          ) : (
            <>
              <div className="inline-srch" style={{ marginBottom: 4 }}>
                <Icon name="search" />
                <input type="search" placeholder="Поиск сотрудника" aria-label="Поиск сотрудника" value={query} onChange={(e) => setQuery(e.target.value)} />
                {query && (
                  <button type="button" className="srch-x" aria-label="Очистить поиск" onClick={() => setQuery("")}>
                    <Icon name="close" />
                  </button>
                )}
              </div>
              <div className="checks">
                {shown.length === 0 && <div className="dim small" style={{ padding: 6 }}>Никого не найдено</div>}
                {shown.map((e) => (
                  <label key={e.id} className="chk pick-e">
                    <input
                      type="checkbox"
                      checked={isOperator.has(e.id)}
                      disabled={off}
                      onChange={(ev) => setOperators(toggleOperator(operators, e.id, ev.target.checked, departmentThresholds(draft.ext, e.groupId)))}
                    />
                    <Avatar id={e.id} name={e.name} url={e.avatarUrl} />
                    <span className="pick-n">{e.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {operators.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Оператор</th>
                  <th>Учитывать</th>
                  <th>План, звонков</th>
                  <th>Дозвон, с</th>
                  <th>Разговор, с</th>
                  <th>Превышение, с</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((o) => {
                  const e = byId.get(o.employeeId);
                  const err = errors[`operators.${o.employeeId}.plan`] ?? errors[`operators.${o.employeeId}.thresholds`];
                  return (
                    <tr key={o.employeeId} className={o.enabled ? "" : "dim"}>
                      <td>
                        <div className="op-who">
                          <Avatar id={o.employeeId} name={e?.name ?? `#${o.employeeId}`} url={e?.avatarUrl} />
                          <div>
                            <div>{e?.name ?? `#${o.employeeId}`}</div>
                            {e && <div className="dim small">{e.groupName}</div>}
                          </div>
                        </div>
                        {err && <div className="small" style={{ color: "#ff8a8a" }}>{err}</div>}
                      </td>
                      <td>
                        <Switch checked={o.enabled} disabled={off} onChange={(v) => patchOp(o.employeeId, { enabled: v })} label={o.enabled ? "да" : "нет"} />
                      </td>
                      <td>
                        <NumInput label="План" min={1} value={o.plan} disabled={off} onChange={(v) => patchOp(o.employeeId, { plan: v })} />
                      </td>
                      <td>
                        <NumInput label="Дозвон, с" value={o.dialingSeconds} disabled={off} onChange={(v) => patchOp(o.employeeId, { dialingSeconds: v })} />
                      </td>
                      <td>
                        <NumInput label="Разговор, с" value={o.conversationSeconds} disabled={off} onChange={(v) => patchOp(o.employeeId, { conversationSeconds: v })} />
                      </td>
                      <td>
                        <NumInput label="Превышение, с" value={o.exceedingSeconds} disabled={off} onChange={(v) => patchOp(o.employeeId, { exceedingSeconds: v })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="dim small">Пороги в секундах: дозвон &lt; разговор &lt; превышение. Новый оператор получает пороги своего отдела (вкладка «Звонки»).</div>
      </div>
    </ExtensionGate>
  );
}
