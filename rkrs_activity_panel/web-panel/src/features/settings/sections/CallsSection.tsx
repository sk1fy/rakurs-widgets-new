import type { CallThresholds } from "../../../settings/models";
import { EmptyState } from "../../../ui/primitives";
import { applyThresholdsToDepartment, departmentThresholds, groupEmployees, thresholdsValid } from "../draft";
import { ExtensionGate, NumInput, type EditorSectionProps } from "./fields";

/** «Звонки»: пороги Дозвон/Разговор/Превышение по отделам. */
export function CallsSection({ draft, onChange, employees, errors, extensions, disabled }: EditorSectionProps) {
  const off = disabled || !extensions.available;
  const selected = new Set(draft.core.employeeIds);
  const groups = groupEmployees(employees.filter((e) => selected.has(e.id)));
  const operatorIds = new Set(draft.ext.operators.map((o) => o.employeeId));

  const setThresholds = (groupId: string, t: CallThresholds) =>
    onChange({ ...draft, ext: { ...draft.ext, departmentThresholds: { ...draft.ext.departmentThresholds, [groupId]: t } } });

  return (
    <ExtensionGate capability={extensions}>
      {groups.length === 0 ? (
        <EmptyState title="Нет отделов" hint="Выберите сотрудников панели на вкладке «Общие»." />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Отдел</th>
                <th>Дозвон, с</th>
                <th>Разговор, с</th>
                <th>Превышение, с</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const t = departmentThresholds(draft.ext, g.groupId);
                const ops = g.employees.filter((e) => operatorIds.has(e.id)).length;
                const err = errors[`departments.${g.groupId}`];
                return (
                  <tr key={g.groupId}>
                    <td>
                      <div>{g.groupName}</div>
                      <div className="dim small">операторов: {ops}</div>
                      {err && <div className="small" style={{ color: "#ff8a8a" }}>{err}</div>}
                    </td>
                    <td>
                      <NumInput label="Дозвон, с" value={t.dialingSeconds} disabled={off} onChange={(v) => setThresholds(g.groupId, { ...t, dialingSeconds: v })} />
                    </td>
                    <td>
                      <NumInput label="Разговор, с" value={t.conversationSeconds} disabled={off} onChange={(v) => setThresholds(g.groupId, { ...t, conversationSeconds: v })} />
                    </td>
                    <td>
                      <NumInput label="Превышение, с" value={t.exceedingSeconds} disabled={off} onChange={(v) => setThresholds(g.groupId, { ...t, exceedingSeconds: v })} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="tool-btn"
                        disabled={off || ops === 0 || !thresholdsValid(t)}
                        onClick={() => onChange({ ...draft, ext: { ...draft.ext, operators: applyThresholdsToDepartment(draft.ext.operators, employees, g.groupId, t) } })}
                      >
                        Применить к операторам отдела
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ExtensionGate>
  );
}
