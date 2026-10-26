import type { Employee } from "../../domain/types";
import type { TaskPanelSettings } from "../../settings/models";
import { Icon } from "../../ui/Icon";
import { Switch } from "../../ui/primitives";
import { EmployeePicker } from "./EmployeePicker";
import { moveItem, priorityLabel } from "./draft";

/** Форма глобальных настроек панели задач (значение + onChange). */
export function TaskPanelForm({ value, onChange, employees }: { value: TaskPanelSettings; onChange: (next: TaskPanelSettings) => void; employees: Employee[] }) {
  const patch = (p: Partial<TaskPanelSettings>) => onChange({ ...value, ...p });
  const off = !value.enabled;

  return (
    <div className="form">
      <div className="card">
        <Switch checked={value.enabled} onChange={(v) => patch({ enabled: v })} label="Панель задач включена в аккаунте" />
        <p className="dim small" style={{ marginTop: 6 }}>
          Глобальная настройка: действует для всех панелей и всех сотрудников аккаунта.
        </p>
      </div>

      <div className="card" style={off ? { opacity: 0.6 } : undefined}>
        <h3>Сотрудники с панелью задач</h3>
        <p className="sub">Кому показывать панель задач.</p>
        <EmployeePicker employees={employees} value={value.enabledEmployees} onChange={(ids) => patch({ enabledEmployees: ids })} disabled={off} />
      </div>

      <div className="card" style={off ? { opacity: 0.6 } : undefined}>
        <h3>Подбор задач</h3>
        <div className="form">
          <Switch checked={value.considerFutureTasks} disabled={off} onChange={(v) => patch({ considerFutureTasks: v })} label="Учитывать будущие задачи" />
          <Switch checked={value.includeRelatedDeals} disabled={off} onChange={(v) => patch({ includeRelatedDeals: v })} label="Включать связанные сделки" />
        </div>
      </div>

      <div className="card" style={off ? { opacity: 0.6 } : undefined}>
        <h3>Порядок приоритетов</h3>
        <p className="sub">Задачи предлагаются в этом порядке; выключенные правила пропускаются.</p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {value.priorities.map((p, i) => (
            <li key={p.key} className="row-f" style={{ flexWrap: "nowrap", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--inset)" }}>
              <span className="dim small" style={{ width: 18, textAlign: "right" }}>
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>
                <Switch checked={p.enabled} disabled={off} onChange={(v) => patch({ priorities: value.priorities.map((x) => (x.key === p.key ? { ...x, enabled: v } : x)) })} label={priorityLabel(p.key)} />
              </span>
              <button type="button" className="icon-btn" aria-label="Выше" title="Выше" disabled={off || i === 0} onClick={() => patch({ priorities: moveItem(value.priorities, i, -1) })}>
                <span style={{ display: "grid", transform: "rotate(180deg)" }}>
                  <Icon name="chev" size={16} />
                </span>
              </button>
              <button type="button" className="icon-btn" aria-label="Ниже" title="Ниже" disabled={off || i === value.priorities.length - 1} onClick={() => patch({ priorities: moveItem(value.priorities, i, 1) })}>
                <Icon name="chev" size={16} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
