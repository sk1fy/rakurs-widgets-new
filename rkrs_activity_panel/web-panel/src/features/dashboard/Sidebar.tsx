import { usePanelScope } from "../../app/context";
import { Icon } from "../../ui/Icon";
import { Avatar } from "../../ui/primitives";
import type { EmployeeRow } from "./model";

/** Боковая панель макета: отделы и сотрудники (личный фильтр зрителя). */
export function Sidebar({ rows }: { rows: EmployeeRow[] | null }) {
  const { panel, prefs, setPrefs } = usePanelScope();
  const hidden = new Set(prefs.hiddenEmployees);
  const selectedDepts = prefs.selectedDepartments;
  const deptOn = (id: string) => !selectedDepts.length || selectedDepts.includes(id);
  const visibleCount = panel.employees.filter((e) => !hidden.has(e.id) && deptOn(e.groupId)).length;
  const percentOf = (id: number) => rows?.find((r) => r.employee.id === id)?.percent ?? null;

  const toggleDept = (id: string) =>
    setPrefs((p) => {
      const all = panel.groups.map((g) => g.id);
      const current = p.selectedDepartments.length ? p.selectedDepartments : all;
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...p, selectedDepartments: next.length === all.length ? [] : next };
    });
  const toggleEmployee = (id: number) =>
    setPrefs((p) => ({ ...p, hiddenEmployees: p.hiddenEmployees.includes(id) ? p.hiddenEmployees.filter((x) => x !== id) : [...p.hiddenEmployees, id] }));

  return (
    <aside className="side" aria-label="Сотрудники">
      <div className="side-h">
        <span>
          Сотрудники<span className="cnt">{visibleCount} из {panel.employees.length}</span>
        </span>
        <button type="button" className="side-x" title="Скрыть панель" aria-label="Скрыть панель" onClick={() => setPrefs((p) => ({ ...p, sidebarCollapsed: true }))}>
          <Icon name="left" />
        </button>
      </div>
      {panel.groups.map((g) => {
        const members = panel.employees.filter((e) => e.groupId === g.id);
        const on = deptOn(g.id);
        return (
          <div key={g.id}>
            <div className="side-g">
              <label className="chk">
                <input type="checkbox" checked={on} onChange={() => toggleDept(g.id)} />
                <span>{g.name}</span>
              </label>
              <span className="mut">
                {members.filter((m) => !hidden.has(m.id)).length}/{members.length}
              </span>
            </div>
            <div className={`side-list${on ? "" : " dim"}`}>
              {members.map((m) => {
                const p = percentOf(m.id);
                return (
                  <label key={m.id} className={`chk${hidden.has(m.id) ? " off" : ""}`}>
                    <input type="checkbox" checked={!hidden.has(m.id)} disabled={!on} onChange={() => toggleEmployee(m.id)} />
                    <Avatar id={m.id} name={m.name} />
                    <span className="nm" title={m.name}>{m.name}</span>
                    <span className="rt">{p === null ? "—" : `${Math.round(p)}%`}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="side-tools">
        <button type="button" onClick={() => setPrefs((p) => ({ ...p, hiddenEmployees: [], selectedDepartments: [] }))}>
          Все
        </button>
        <button type="button" onClick={() => setPrefs((p) => ({ ...p, hiddenEmployees: panel.employees.map((e) => e.id) }))}>
          Никого
        </button>
      </div>
      <div className="side-note">Выбор хранится в этом браузере и не меняет панель для других.</div>
    </aside>
  );
}
