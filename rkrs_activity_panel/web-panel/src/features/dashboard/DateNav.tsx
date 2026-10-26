import { addDays, addMonths, dayTitle } from "../../domain/time";
import { Icon } from "../../ui/Icon";

/** Навигация по дням. F8: глубина истории — один месяц назад от сегодня. */
export function DateNav({ dayKey, today, sub, onChange }: { dayKey: string; today: string; sub: string; onChange: (day: string) => void }) {
  const min = addMonths(today, -1);
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

/** День / Неделя / Месяц: неделя и месяц не реализуются на этом этапе. */
export function PeriodSwitch() {
  return (
    <div className="seg" role="tablist" aria-label="Период">
      <button type="button" role="tab" aria-selected className="on">
        День
      </button>
      <button type="button" role="tab" aria-selected={false} disabled title="Недельный режим появится позже">
        Неделя
      </button>
      <button type="button" role="tab" aria-selected={false} disabled title="Месячный режим появится позже">
        Месяц
      </button>
    </div>
  );
}
