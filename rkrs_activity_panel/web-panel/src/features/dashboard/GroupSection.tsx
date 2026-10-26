import { useState, type ReactNode } from "react";
import { usePanelScope } from "../../app/context";
import { Icon } from "../../ui/Icon";
import { matchesSearch, type GroupBlock, type EmployeeRow } from "./model";
import type { SortOrder } from "../../settings/models";

const SORT_NEXT: Record<SortOrder, SortOrder> = { desc: "asc", asc: "name", name: "desc" };
const SORT_LABEL: Record<SortOrder, string> = { desc: "по активности ↓", asc: "по активности ↑", name: "по имени" };

export function Legend() {
  return (
    <div className="legend">
      <span><i style={{ background: "var(--tl-crm)" }} />активность в amoCRM</span>
      <span><i style={{ background: "var(--tl-call)" }} />звонок</span>
      <span><i style={{ background: "var(--tl-idle)" }} />нет активности</span>
      <span><i style={{ background: "var(--tl-future)" }} />ещё не наступило</span>
    </div>
  );
}

export function GroupSection({ group, renderRow, legend }: { group: GroupBlock; renderRow: (row: EmployeeRow, compact: boolean) => ReactNode; legend: boolean }) {
  const { prefs, setPrefs } = usePanelScope();
  const [query, setQuery] = useState("");
  const closed = prefs.collapsedGroups.includes(group.id);
  const compact = prefs.compactGroups.includes(group.id);
  const toggle = (key: "collapsedGroups" | "compactGroups") =>
    setPrefs((p) => ({ ...p, [key]: p[key].includes(group.id) ? p[key].filter((x) => x !== group.id) : [...p[key], group.id] }));
  const rows = group.rows.filter((r) => matchesSearch(r, query));
  return (
    <section className={`grp${closed ? " closed" : ""}`}>
      <button type="button" className="grp-h" aria-expanded={!closed} onClick={() => toggle("collapsedGroups")}>
        <span>
          {group.name}
          <span className="cnt">
            ({group.rows.length}/{group.total})
          </span>
        </span>
        <Icon name="chev" />
      </button>
      <div className="grp-b">
        <div className="tools">
          {legend && <Legend />}
          <div className="sp" />
          <label className="srch">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Начните ввод..." aria-label={`Поиск в группе ${group.name}`} />
            <Icon name="search" />
          </label>
          <button type="button" className={`ti${compact ? " on" : ""}`} title={compact ? "Обычный вид" : "Компактный вид"} aria-pressed={compact} onClick={() => toggle("compactGroups")}>
            <Icon name="collapse" />
          </button>
          <button type="button" className="ti" title={`Сортировка: ${SORT_LABEL[prefs.sort]}`} onClick={() => setPrefs((p) => ({ ...p, sort: SORT_NEXT[p.sort] }))}>
            <Icon name="sort" />
          </button>
        </div>
        {rows.length ? rows.map((r) => renderRow(r, compact)) : <div className="dim small" style={{ padding: 8 }}>{query ? "Никого не найдено" : "Все сотрудники группы скрыты фильтром"}</div>}
      </div>
    </section>
  );
}
