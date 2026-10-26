import { useEffect, useState, type ReactNode } from "react";
import { usePanelScope } from "../../app/context";
import { useDebounced } from "../../app/hooks";
import { Icon, type IconName } from "../../ui/Icon";
import { hasActivity, matchesSearch, type GroupBlock, type EmployeeRow } from "./model";
import { groupSearch, saveGroupSearch } from "./returnTarget";
import type { SortOrder } from "../../settings/models";

const SORT_NEXT: Record<SortOrder, SortOrder> = { desc: "asc", asc: "name", name: "desc" };
const SORT_LABEL: Record<SortOrder, string> = { desc: "по активности ↓", asc: "по активности ↑", name: "по имени" };
const SORT_ICON: Record<SortOrder, IconName> = { desc: "sort", asc: "sortUp", name: "sortName" };

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
  const [input, setInput] = useState(() => groupSearch(group.id));
  const query = useDebounced(input, 300);
  useEffect(() => {
    saveGroupSearch(group.id, query);
  }, [group.id, query]);
  const closed = prefs.collapsedGroups.includes(group.id);
  const compact = prefs.compactGroups.includes(group.id);
  const toggle = (key: "collapsedGroups" | "compactGroups") =>
    setPrefs((p) => ({ ...p, [key]: p[key].includes(group.id) ? p[key].filter((x) => x !== group.id) : [...p[key], group.id] }));
  const rows = group.rows.filter((r) => hasActivity(r) && matchesSearch(r, query));
  const empty = query ? "Никого не найдено" : group.rows.length ? "Нет сотрудников с активностью за период" : "Все сотрудники группы скрыты фильтром";
  return (
    <section className={`grp${closed ? " closed" : ""}`}>
      <button type="button" className="grp-h" aria-expanded={!closed} onClick={() => toggle("collapsedGroups")}>
        <span>
          {group.name}
          <span className="cnt" title="Сотрудники с активностью / всего в группе">
            ({group.active}/{group.total})
          </span>
        </span>
        <Icon name="chev" />
      </button>
      <div className="grp-b">
        <div className="tools">
          {legend && <Legend />}
          <div className="sp" />
          <label className="srch">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Начните ввод..." aria-label={`Поиск в группе ${group.name}`} />
            {input ? (
              <button type="button" className="srch-x" aria-label="Очистить поиск" title="Очистить" onClick={() => setInput("")}>
                <Icon name="close" />
              </button>
            ) : (
              <Icon name="search" />
            )}
          </label>
          <button type="button" className={`ti${compact ? " on" : ""}`} title={compact ? "Обычный режим: показать таймлайн" : "Компактный режим: только показатели"} aria-pressed={compact} onClick={() => toggle("compactGroups")}>
            <Icon name={compact ? "expand" : "collapse"} />
          </button>
          <button type="button" className="ti" title={`Сортировка: ${SORT_LABEL[prefs.sort]}`} onClick={() => setPrefs((p) => ({ ...p, sort: SORT_NEXT[p.sort] }))}>
            <Icon name={SORT_ICON[prefs.sort]} />
          </button>
        </div>
        {rows.length ? rows.map((r) => renderRow(r, compact)) : <div className="dim small" style={{ padding: 8 }}>{empty}</div>}
      </div>
    </section>
  );
}
