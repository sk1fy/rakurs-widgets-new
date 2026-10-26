import type { ReactNode } from "react";
import type { SummaryRow } from "../../domain/formulas/sessions";
import { formatDurationShort, minutesToHHMM } from "../../domain/time";

export function MetricTile({ title, value, prev, color, synthetic, hint }: { title: string; value: ReactNode; prev?: ReactNode; color?: string; synthetic?: boolean; hint?: string }) {
  return (
    <div className={`mt${synthetic ? " syn" : ""}`} title={hint}>
      <div className="k">
        {color && <i style={{ width: 8, height: 8, borderRadius: 4, background: color, display: "inline-block" }} />}
        {title}
        {synthetic && <span className="chip warn" style={{ height: 16, fontSize: 10, padding: "0 5px" }}>синтетика</span>}
      </div>
      <div className="v">{value}</div>
      {prev !== undefined && <div className="s">вчера: {prev}</div>}
    </div>
  );
}

export function BarList({ rows, limit = 7, empty }: { rows: SummaryRow[]; limit?: number; empty: string }) {
  const top = rows.slice(0, limit);
  const max = Math.max(1, ...top.map((r) => r.seconds));
  if (!top.length) return <div className="dim small">{empty}</div>;
  return (
    <div className="bars">
      {top.map((r) => (
        <div className="br" key={r.id} title={r.tooltip}>
          <span className="lb">
            {r.href ? (
              <a href={r.href} target="_blank" rel="noreferrer noopener">
                {r.label}
              </a>
            ) : (
              r.label
            )}
          </span>
          <span className="vl">
            {formatDurationShort(r.seconds)}
            {r.includesFallback && <span title="Включает условные 10 с за завершённую задачу без сессии (F10)"> · условно</span>}
          </span>
          <span className="tr">
            <i style={{ width: `${(r.seconds / max) * 100}%`, background: r.color }} />
          </span>
        </div>
      ))}
      {rows.length > limit && <div className="dim small" style={{ marginTop: 6 }}>Ещё {rows.length - limit}</div>}
    </div>
  );
}

/** Ползунок диапазона времени (минуты суток) для историй задач и Imbox. */
export function RangeFilter({ min, max, value, onChange }: { min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [a, b] = value;
  return (
    <div className="range">
      <span>Период:</span>
      <input type="range" min={min} max={max} step={15} value={a} aria-label="Начало периода" onChange={(e) => onChange([Math.min(Number(e.target.value), b - 15), b])} />
      <b className="tn">
        {minutesToHHMM(a)}–{minutesToHHMM(b)}
      </b>
      <input type="range" min={min} max={max} step={15} value={b} aria-label="Конец периода" onChange={(e) => onChange([a, Math.max(Number(e.target.value), a + 15)])} />
      {(a !== min || b !== max) && (
        <button type="button" className="link-btn small" onClick={() => onChange([min, max])}>
          весь день
        </button>
      )}
    </div>
  );
}

export function SessionStrip({ items, min, max, selected, onSelect }: { items: { id: string; startMinutes: number; endMinutes: number; color: string; title: string }[]; min: number; max: number; selected: string | null; onSelect: (id: string | null) => void }) {
  const span = Math.max(1, max - min);
  return (
    <div className="strip" role="list">
      {items
        .filter((i) => i.endMinutes > min && i.startMinutes < max)
        .map((i) => (
          <button
            key={i.id}
            type="button"
            role="listitem"
            className={selected === i.id ? "on" : ""}
            title={i.title}
            aria-label={i.title}
            style={{ left: `${((Math.max(i.startMinutes, min) - min) / span) * 100}%`, width: `${((Math.min(i.endMinutes, max) - Math.max(i.startMinutes, min)) / span) * 100}%`, background: i.color }}
            onClick={() => onSelect(selected === i.id ? null : i.id)}
          />
        ))}
    </div>
  );
}
