import { useState } from "react";
import type { DisplayWindow, PanelContext } from "../../domain/types";
import { KPI_KEYS, KPI_LABELS, type LocalPreferences, type SortOrder } from "../../settings/models";
import { Switch } from "../../ui/primitives";
import { resetViewPreferences, toggleId, windowError } from "./draft";

const NOTIFICATIONS: { key: keyof LocalPreferences["notifications"]; label: string }[] = [
  { key: "missedCalls", label: "Пропущенные звонки" },
  { key: "leadsNoTasks", label: "Сделки без задач" },
  { key: "leadsFailedTasks", label: "Сделки с просроченными задачами" },
];

const SORTS: { value: SortOrder; label: string }[] = [
  { value: "desc", label: "По активности ↓" },
  { value: "asc", label: "По активности ↑" },
  { value: "name", label: "По имени" },
];

/** Форма «Мой вид»: личные предпочтения зрителя, применяются сразу. */
export function ViewPreferencesForm({ value, onChange, panel }: { value: LocalPreferences; onChange: (next: LocalPreferences) => void; panel: PanelContext }) {
  const [windowDraft, setWindowDraft] = useState<DisplayWindow>(() => value.workWindow ?? panel.displayWindow);
  const winErr = windowError(windowDraft);
  const patch = (p: Partial<LocalPreferences>) => onChange({ ...value, ...p });

  const editWindow = (next: DisplayWindow) => {
    setWindowDraft(next);
    if (!windowError(next)) patch({ workWindow: next.from === panel.displayWindow.from && next.to === panel.displayWindow.to ? null : next });
  };

  const allDepartments = value.selectedDepartments.length === 0;

  return (
    <div className="form">
      <div className="card">
        <h3>Окно просмотра</h3>
        <p className="sub">
          Окно панели: {panel.displayWindow.from}–{panel.displayWindow.to} ({panel.timezone}). Можно сузить или расширить его только для себя.
        </p>
        <div className="field">
          <span>Рабочее окно {value.workWindow ? "(своё)" : "(как у панели)"}</span>
          <div className="row-f">
            <input className="inp sm" type="time" aria-label="С" value={windowDraft.from} onChange={(e) => editWindow({ ...windowDraft, from: e.target.value })} style={{ width: 120 }} />
            <span className="dim">—</span>
            <input className="inp sm" type="time" aria-label="До" value={windowDraft.to} onChange={(e) => editWindow({ ...windowDraft, to: e.target.value })} style={{ width: 120 }} />
            <button
              type="button"
              className="tool-btn"
              disabled={!value.workWindow && !winErr}
              onClick={() => {
                setWindowDraft(panel.displayWindow);
                patch({ workWindow: null });
              }}
            >
              Как у панели
            </button>
          </div>
          {winErr && <div className="err">{winErr}</div>}
        </div>
      </div>

      <div className="card">
        <h3>Отделы</h3>
        <div className="form">
          <Switch checked={value.groupByDepartments} onChange={(v) => patch({ groupByDepartments: v })} label="Группировать по отделам" />
          <div className="field">
            <span>Показывать отделы {allDepartments && "(сейчас — все)"}</span>
            {panel.groups.length === 0 ? (
              <div className="dim small">В панели нет отделов</div>
            ) : (
              <div className="checks">
                {panel.groups.map((g) => (
                  <label key={g.id} className="chk">
                    <input type="checkbox" checked={value.selectedDepartments.includes(g.id)} onChange={(e) => patch({ selectedDepartments: toggleId(value.selectedDepartments, g.id, e.target.checked) })} />
                    {g.name}
                  </label>
                ))}
              </div>
            )}
            <div className="row-f">
              <span className="dim small">Ничего не отмечено — показываются все отделы.</span>
              {!allDepartments && (
                <button type="button" className="tool-btn" onClick={() => patch({ selectedDepartments: [] })}>
                  Показать все
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Уведомления</h3>
        <div className="form">
          {NOTIFICATIONS.map((n) => (
            <Switch key={n.key} checked={value.notifications[n.key]} onChange={(v) => patch({ notifications: { ...value.notifications, [n.key]: v } })} label={n.label} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="ch">
          <div>
            <h3>Показатели</h3>
            <p className="sub">Какие KPI показывать в карточках сотрудников.</p>
          </div>
          <Switch
            checked={KPI_KEYS.every((k) => value.kpi[k])}
            onChange={(v) => patch({ kpi: Object.fromEntries(KPI_KEYS.map((k) => [k, v])) as typeof value.kpi })}
            label="Все показатели"
          />
        </div>
        <div className="checks" style={{ maxHeight: "none" }}>
          {KPI_KEYS.map((k) => (
            <label key={k} className="chk">
              <input type="checkbox" checked={value.kpi[k]} onChange={(e) => patch({ kpi: { ...value.kpi, [k]: e.target.checked } })} />
              {KPI_LABELS[k]}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Отображение</h3>
        <div className="form">
          <Switch checked={value.showPlanFact} onChange={(v) => patch({ showPlanFact: v })} label="План/факт операторов" />
          <div>
            <Switch
              checked={value.showTaskPanelEvents}
              onChange={(v) => patch({ showTaskPanelEvents: v })}
              label="События панели задач на таймлайне"
            />
            <div className="dim small" style={{ marginTop: 4 }}>
              {panel.taskPanelEnabled === false ? "Сбор новых интервалов отключён. Записанную историю можно показать на таймлайне." : "По умолчанию выключено. Показывает записанные интервалы виджета сотрудников."}
            </div>
          </div>
          <label className="field" style={{ maxWidth: 280 }}>
            <span>Сортировка сотрудников</span>
            <select className="sel" value={value.sort} onChange={(e) => patch({ sort: e.target.value as SortOrder })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="row-f">
        <button
          type="button"
          className="tool-btn danger"
          onClick={() => {
            setWindowDraft(panel.displayWindow);
            onChange(resetViewPreferences(value));
          }}
        >
          Сбросить к настройкам по умолчанию
        </button>
      </div>
    </div>
  );
}
