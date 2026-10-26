import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../../ui/Icon";
import { Skeleton } from "../../ui/primitives";
import type { SummaryRow } from "../../domain/formulas/sessions";
import { formatDurationShort, formatDurationWithSeconds, minutesOfDay, minutesToHHMM, zoned } from "../../domain/time";

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

/** Пустое состояние карточки с иконкой, как в старых секциях профиля. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="empty-note">
      <Icon name="info" />
      <span>{children}</span>
    </div>
  );
}

/** Крупное число над списком — «N уникальных сделок посещено» (центр кольца V2DealsOverviewCard). */
export function CardTotal({ value, label }: { value: number; label: string }) {
  return (
    <div className="card-total">
      <b>{value}</b> {label}
    </div>
  );
}

export function BarList({ rows, limit = 7, empty, columns }: { rows: SummaryRow[]; limit?: number; empty: string; columns?: [string, string] }) {
  const top = rows.slice(0, limit);
  const max = Math.max(1, ...top.map((r) => r.seconds));
  if (!top.length) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <div className="bars linked">
      {columns && (
        <div className="br head">
          <span className="lb">{columns[1]}</span>
          <span className="vl">{columns[0]}</span>
        </div>
      )}
      {top.map((r) => (
        <div className="br" key={r.id} title={r.tooltip}>
          <span className="lb">
            {r.href ? (
              <a href={r.href} target="_blank" rel="noreferrer noopener">
                {r.label} <Icon name="ext" className="ext-i" />
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
  const pct = (m: number) => `${((m - min) / Math.max(1, max - min)) * 100}%`;
  const ticks = Array.from({ length: Math.floor((max - min) / 60) + 1 }, (_, i) => min + i * 60);
  return (
    <div className="history-range">
      <div className="range-values"><b>{minutesToHHMM(a)}</b>{(a !== min || b !== max) && <button className="link-btn small" onClick={() => onChange([min, max])}>Весь день</button>}<b>{minutesToHHMM(b)}</b></div>
      <div className="range-track">
        <div className="range-track-base" /><div className="range-track-active" style={{ left: pct(a), right: pct(max - b + min) }} />
        <input type="range" min={min} max={max} step={1} value={a} aria-label="Начало периода" style={{ zIndex: a >= max - 1 ? 4 : 2 }} onChange={(e) => onChange([Math.min(Number(e.target.value), b - 1), b])} />
        <input type="range" min={min} max={max} step={1} value={b} aria-label="Конец периода" onChange={(e) => onChange([a, Math.max(Number(e.target.value), a + 1)])} />
        <div className="range-ticks" aria-hidden="true">{ticks.map((m) => <span key={m} style={{ left: pct(m) }}><i /><em>{minutesToHHMM(m)}</em></span>)}</div>
      </div>
    </div>
  );
}

/** Полоса сессий: фон прошедшего и будущего (сегодня), отрезки, ось часов под полосой. */
export function SessionStrip({ items, min, max, selected, onSelect, nowMinutes = null }: { items: { id: string; startMinutes: number; endMinutes: number; color: string; title: string }[]; min: number; max: number; selected: string | null; onSelect: (id: string | null) => void; nowMinutes?: number | null }) {
  const span = Math.max(1, max - min);
  const at = (m: number) => `${((Math.max(min, Math.min(max, m)) - min) / span) * 100}%`;
  const hours: number[] = [];
  for (let h = Math.ceil(min / 60); h * 60 <= max; h++) hours.push(h * 60);
  return (
    <>
      <div className="strip" role="list">
        {nowMinutes !== null && nowMinutes > min && <span className="past" style={{ left: 0, width: at(nowMinutes) }} />}
        {nowMinutes !== null && nowMinutes < max && <span className="fut" style={{ left: at(nowMinutes), right: 0 }} />}
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
      <div className="axis small strip-axis" aria-hidden="true">
        {hours.map((m) => (
          <span key={m} style={m === max ? { right: 0, transform: "none" } : { left: at(m) }}>
            {minutesToHHMM(m)}
          </span>
        ))}
      </div>
    </>
  );
}

/** Выделение строки по клику на отрезок: строка плавно по центру, подсветка гаснет через 2 с. */
export function useFlashSelection(): [string | null, (id: string | null) => void, (el: HTMLElement | null, id: string) => void] {
  const [selected, setSelected] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolled = useRef<string | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const select = useCallback((id: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    scrolled.current = null;
    setSelected(id);
    if (id) timer.current = setTimeout(() => setSelected(null), 2000);
  }, []);
  const rowRef = useCallback(
    (el: HTMLElement | null, id: string) => {
      if (!el || id !== selected || scrolled.current === id) return;
      scrolled.current = id;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [selected],
  );
  return [selected, select, rowRef];
}

/** Плашка сводки с иконкой (сводки истории задач и Imbox). */
export function SumCard({ icon, label, value, sub }: { icon: IconName; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="sum-card">
      <div className="k">
        <Icon name={icon} className="sum-i" />
        <span className="sum-label">{label}</span>
      </div>
      <div className="v">{value}</div>
      {sub !== undefined && <div className="s">{sub}</div>}
    </div>
  );
}

/** Минута «сейчас» для сегодняшнего дня, иначе null. */
export const nowMinutesFor = (nowUnix: number, dayKey: string, timeZone: string): number | null => (zoned(nowUnix, timeZone).dayKey === dayKey ? minutesOfDay(nowUnix, timeZone) : null);

/** Заглушка «— Не указан —» и подобные — приглушённым цветом. */
export const isPlaceholder = (text: string) => /^—.*—$/.test(text.trim());

/**
 * Секция при выключенной панели задач (V2TaskPanelGate): затемнённая
 * заглушка с шестерёнкой и подсказкой, где включить сбор статистики.
 */
export function TaskPanelGate({ title }: { title: string }) {
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>{title}</h2>
      </div>
      <div className="tp-gate">
        <div className="tp-gate-bg" aria-hidden="true" />
        <div className="tp-gate-msg">
          <Icon name="gear" />
          <span>
            Чтобы по работе менеджера велась статистика, <b>включите панель задач в настройках виджета</b>
          </span>
        </div>
      </div>
    </section>
  );
}

/** Секция профиля во время загрузки: заголовок, плашки и таблица-заглушка. */
export function SectionSkeleton({ title, tiles = 4, rows = 4 }: { title: string; tiles?: number; rows?: number }) {
  return (
    <section className="sec" aria-busy="true">
      <div className="sec-h">
        <h2>{title}</h2>
      </div>
      {tiles > 0 && (
        <div className="sum-row">
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="sum-card">
              <Skeleton width="60%" height={12} />
              <div style={{ height: 10 }} />
              <Skeleton width="40%" height={24} />
            </div>
          ))}
        </div>
      )}
      <div className="card skel-card">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} height={18} />
        ))}
      </div>
    </section>
  );
}


export function DonutSummary({ rows, value, label, columns, empty }: { rows: SummaryRow[]; value: number; label: string; columns: [string, string]; empty: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selected = hovered ?? pinned;
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.seconds), 0);
  const active = rows.find((r) => r.id === selected);
  const percent = (seconds: number) => total ? `${Number((seconds / total * 100).toFixed(1))}%` : "0%";
  const toggle = (id: string) => setPinned((old) => old === id ? null : id);
  const colors = ["#9b5de5", "#c28bfa", "#7644bf", "#dfb7ff", "#af72d4", "#8060b5", "#d4a2ef"];
  const monochrome = rows.length > 1 && new Set(rows.map((r) => r.color)).size === 1;
  const color = (r: SummaryRow, index: number) => monochrome ? colors[index % colors.length] : r.color;
  let offset = 0;
  const segments = rows.map((r, index) => {
    const share = total ? Math.max(0, r.seconds) / total * 100 : 0;
    const segment = { row: r, share, offset, color: color(r, index) };
    offset += share;
    return segment;
  });
  return <div className="donut-summary improved">
    <div className="donut-visual">
      <div className="donut-chart">
        <svg viewBox="0 0 180 180" aria-label={`${value} ${label}`}>
          <circle cx="90" cy="90" r="73" fill="none" stroke="var(--inset)" strokeWidth="22" />
          {segments.filter((s) => s.share > 0).map(({ row: r, share, offset: start, color: fill }) => {
            const arc = Math.max(share * .65, share - (rows.length > 1 ? .7 : 0));
            return <circle key={r.id} className="donut-segment" cx="90" cy="90" r="73" fill="none" stroke={fill} strokeWidth={selected === r.id ? 27 : 22} opacity={active && selected !== r.id ? .35 : 1} pathLength="100" strokeDasharray={`${arc} ${100 - arc}`} strokeDashoffset={-start} transform="rotate(-90 90 90)" role="button" tabIndex={0} aria-label={`${r.label}: ${formatDurationWithSeconds(r.seconds)}, ${percent(r.seconds)}`} aria-pressed={pinned === r.id}
              onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(r.id)} onBlur={() => setHovered(null)} onClick={() => toggle(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(r.id); } if (e.key === "Escape") { setPinned(null); setHovered(null); } }}><title>{r.label}: {formatDurationWithSeconds(r.seconds)} · {percent(r.seconds)}</title></circle>;
          })}
        </svg>
        <div className={`donut-center${active ? " active" : ""}`}><b>{active ? percent(active.seconds) : value}</b><span>{active ? "от общего времени" : label}</span></div>
      </div>
      <div className="donut-caption" title={active?.label}><strong>{active ? formatDurationWithSeconds(active.seconds) : formatDurationShort(total)}</strong><span>{active?.label ?? "общее время"}</span></div>
      {pinned && <button className="link-btn small" onClick={() => { setPinned(null); setHovered(null); }}>Снять выделение</button>}
    </div>
    <div className="donut-legend">
      {rows.length ? <><div className="donut-legend-head"><span>{columns[1]}</span><span>{columns[0]}</span></div>{(expanded ? rows : rows.slice(0, 7)).map((r, index) => <div key={r.id} className={`donut-row${selected === r.id ? " selected" : ""}`} onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)}>
        <button type="button" className="donut-select" aria-pressed={pinned === r.id} onClick={() => toggle(r.id)} onFocus={() => setHovered(r.id)} onBlur={() => setHovered(null)} title={`${r.label} · ${formatDurationWithSeconds(r.seconds)} · ${percent(r.seconds)}`}>
          <i style={{ background: color(r, index) }} /><span className="donut-label">{r.label}</span>
          <span className="donut-amount">{formatDurationWithSeconds(r.seconds)}{r.includesFallback && <small title="Включает условное время за задачи без сессии">*</small>}</span>
        </button>
        {r.href && <a className="donut-link" href={r.href} target="_blank" rel="noreferrer noopener" aria-label={`Открыть ${r.label} в CRM`}><Icon name="ext" size={12} /></a>}
      </div>)}{rows.length > 7 && <button className="link-btn small donut-expand" onClick={() => setExpanded((v) => !v)}>{expanded ? "Свернуть до топ-7" : `Показать ещё ${rows.length - 7}`}</button>}</> : <EmptyNote>{empty}</EmptyNote>}
    </div>
  </div>;
}
