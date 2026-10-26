import { useMemo, useState } from "react";
import type { Employee, EmployeeId } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { Avatar } from "../../ui/primitives";
import { groupEmployees, toggleId } from "./draft";

const TAGS_MAX = 12;

/** Мультивыбор сотрудников, сгруппированных по отделам: выбранные — тегами с ×, отделы сворачиваются. */
export function EmployeePicker({ employees, value, onChange, disabled }: { employees: Employee[]; value: EmployeeId[]; onChange: (ids: EmployeeId[]) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [allTags, setAllTags] = useState(false);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
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

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const tags = allTags ? value : value.slice(0, TAGS_MAX);

  return (
    <div className="form" style={{ gap: 8 }}>
      {value.length > 0 && (
        <div className="emp-tags">
          {tags.map((id) => (
            <span key={id} className="emp-tag">
              {byId.get(id)?.name ?? `#${id}`}
              <button type="button" aria-label={`Убрать ${byId.get(id)?.name ?? id}`} disabled={disabled} onClick={() => onChange(toggleId(value, id, false))}>
                ×
              </button>
            </span>
          ))}
          {value.length > TAGS_MAX && (
            <button type="button" className="emp-tag more" onClick={() => setAllTags((v) => !v)}>
              {allTags ? "Свернуть" : `+${value.length - TAGS_MAX}`}
            </button>
          )}
        </div>
      )}
      <div className="row-f">
        <div className="inline-srch" style={{ marginBottom: 0 }}>
          <Icon name="search" />
          <input type="search" placeholder="Поиск сотрудника или отдела" aria-label="Поиск сотрудника или отдела" value={query} onChange={(e) => setQuery(e.target.value)} disabled={disabled} />
          {query && (
            <button type="button" className="srch-x" aria-label="Очистить поиск" onClick={() => setQuery("")}>
              <Icon name="close" />
            </button>
          )}
        </div>
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
          // При поиске отделы раскрыты, иначе совпадения не видны.
          const open = !!q || !collapsed.has(g.groupId);
          return (
            <div key={g.groupId} style={{ marginBottom: 6 }}>
              <div className="pick-g">
                <button type="button" className={`pick-tg${open ? " open" : ""}`} aria-expanded={open} aria-label={open ? "Свернуть отдел" : "Развернуть отдел"} onClick={() => toggleGroup(g.groupId)}>
                  ▾
                </button>
                <label className="chk" style={{ fontWeight: 600, height: 30 }}>
                  <input type="checkbox" checked={all} disabled={disabled} onChange={(e) => setGroup(ids, e.target.checked)} />
                  {g.groupName}
                  <span className="dim small">{ids.filter((id) => selected.has(id)).length}/{ids.length}</span>
                </label>
              </div>
              {open && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "0 12px", paddingLeft: 22 }}>
                  {g.employees.map((e) => (
                    <label key={e.id} className={`chk pick-e${selected.has(e.id) ? " on" : ""}`} style={{ height: 30, fontSize: 13 }}>
                      <input type="checkbox" checked={selected.has(e.id)} disabled={disabled} onChange={(ev) => onChange(toggleId(value, e.id, ev.target.checked))} />
                      <Avatar id={e.id} name={e.name} url={e.avatarUrl} />
                      <span className="pick-n">{e.name}</span>
                      {selected.has(e.id) && <span className="pick-ok">✓</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
