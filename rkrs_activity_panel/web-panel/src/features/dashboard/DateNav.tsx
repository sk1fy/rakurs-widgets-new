import { defaultHistoryFrom, type PeriodKind } from "../../domain/period";
import { addDays, dayTitle } from "../../domain/time";
import { Icon } from "../../ui/Icon";

/** Навигация по дням. F8: глубина истории — 33 календарных дня с учётом сегодня. */
export function DateNav({ dayKey, today, sub, onChange }: { dayKey: string; today: string; sub: string; onChange: (day: string) => void }) {
  const min = defaultHistoryFrom(today);
  return (
    <div className="pnav">
      <button type="button" className="nb" aria-label="Предыдущий день" disabled={dayKey <= min} onClick={() => onChange(addDays(dayKey, -1))}>
        <Icon name="left" size={16} />
      </button>
      <label className="lbl" style={{ position: "relative", cursor: "pointer" }}>
        {dayTitle(dayKey)}
        <span className="sub">{sub}</span>
        <input
          type="date"
          aria-label="Выбрать дату"
          min={min}
          max={today}
          value={dayKey}
          onChange={(e) => e.target.value && onChange(e.target.value < min ? min : e.target.value > today ? today : e.target.value)}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", colorScheme: "dark" }}
        />
      </label>
      <button type="button" className="nb" aria-label="Следующий день" disabled={dayKey >= today} onClick={() => onChange(addDays(dayKey, 1))}>
        <Icon name="right" size={16} />
      </button>
    </div>
  );
}

export type PeriodView = "day" | PeriodKind;

const PERIOD_VIEWS: { value: PeriodView; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
];

/** День / Неделя / Месяц. */
export function PeriodSwitch({ value, onChange }: { value: PeriodView; onChange: (view: PeriodView) => void }) {
  return (
    <div className="seg" role="tablist" aria-label="Период">
      {PERIOD_VIEWS.map((v) => (
        <button key={v.value} type="button" role="tab" aria-selected={value === v.value} className={value === v.value ? "on" : undefined} onClick={() => value !== v.value && onChange(v.value)}>
          {v.label}
        </button>
      ))}
    </div>
  );
}
