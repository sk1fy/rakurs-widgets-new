import { useMemo, useState } from "react";
import type { Employee, EmployeeId } from "../../domain/types";
import { groupEmployees, toggleId } from "./draft";

/** Мультивыбор сотрудников, сгруппированных по отделам. */
export function EmployeePicker({ employees, value, onChange, disabled }: { employees: Employee[]; value: EmployeeId[]; onChange: (ids: EmployeeId[]) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupEmployees(employees), [employees]);
  const q = query.trim().toLowerCase();
  const selected = new Set(value);
  const visible = groups
    .map((g) => ({ ...g, employees: q ? g.employees.filter((e) => e.name.toLowerCase().includes(q) || g.groupName.toLowerCase().includes(q)) : g.employees }))
    .filter((g) => g.employees.length > 0);

  const setGroup = (ids: EmployeeId[], on: boolean) => {
    let next = value;
    for (const id of ids) next = toggleId(next, id, on);
    onChange(next);
  };

  return (
    <div className="form" style={{ gap: 8 }}>
      <div className="row-f">
        <input className="inp" style={{ maxWidth: 280 }} type="search" placeholder="Поиск сотрудника или отдела" value={query} onChange={(e) => setQuery(e.target.value)} disabled={disabled} />
        <span className="dim small">
          Выбрано {value.length} из {employees.length}
        </span>
        <button type="button" className="tool-btn" disabled={disabled || !employees.length} onClick={() => onChange(employees.map((e) => e.id))}>
          Выбрать всех
        </button>
        <button type="button" className="tool-btn" disabled={disabled || !value.length} onClick={() => onChange([])}>
          Снять все
        </button>
      </div>
      <div className="checks" style={{ display: "block" }}>
        {visible.length === 0 && <div className="dim small" style={{ padding: 6 }}>Никого не найдено</div>}
        {visible.map((g) => {
          const ids = g.employees.map((e) => e.id);
          const all = ids.every((id) => selected.has(id));
          return (
            <div key={g.groupId} style={{ marginBottom: 6 }}>
              <label className="chk" style={{ fontWeight: 600, height: 30 }}>
                <input type="checkbox" checked={all} disabled={disabled} onChange={(e) => setGroup(ids, e.target.checked)} />
                {g.groupName}
                <span className="dim small">{ids.filter((id) => selected.has(id)).length}/{ids.length}</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "0 12px", paddingLeft: 22 }}>
                {g.employees.map((e) => (
                  <label key={e.id} className="chk" style={{ height: 30, fontSize: 13 }}>
                    <input type="checkbox" checked={selected.has(e.id)} disabled={disabled} onChange={(ev) => onChange(toggleId(value, e.id, ev.target.checked))} />
                    {e.name}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
