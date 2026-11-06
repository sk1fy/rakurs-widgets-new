// Блоки недели/месяца §8.1–§8.4: Итоги, По часам, Сотрудники, Динамика.

import { useMemo, useState } from "react";
import { dynamicsSeries, type DynamicsMetric } from "../../domain/formulas/period/dynamics";
import { employeeBars } from "../../domain/formulas/period/employeeBars";
import { hourMatrix, type HourValue } from "../../domain/formulas/period/hourMatrix";
import { periodTotals, type Delta } from "../../domain/formulas/period/totals";
import { dayAxisLabel, periodTitle, type PeriodStats } from "../../domain/period";
import { formatMinutes, pad } from "../../domain/time";
import type { Employee } from "../../domain/types";
import { Avatar } from "../../ui/primitives";
import { deltaClass, formatPercentDelta, formatPp, formatRating, formatValue, ratingTone } from "./model";

function DeltaText({ delta, previous }: { delta: Delta; previous?: string | null }) {
  if (delta.kind === "none") return <span className="mut">нет прошлого периода</span>;
  if (delta.kind === "same") return <span>без изменений</span>;
  return (
    <span>
      <b className={deltaClass(delta)}>{formatPercentDelta(delta)}</b>
      {previous != null && <> · было {previous}</>}
    </span>
  );
}

function EmployeeName({ employee, partial }: { employee: Employee; partial?: boolean }) {
  return (
    <span className="pv-name">
      <Avatar id={employee.id} name={employee.name} url={employee.avatarUrl} />
      <span className="nm" title={employee.name}>{employee.name}</span>
      {partial && <span className="chip warn" title="Часть дней посчитана по неполной выборке событий">неполные</span>}
    </span>
  );
}

function compareLabel(stats: PeriodStats): string {
  if (!stats.previous.available) return "нет прошлого периода";
  return `сравнение с ${periodTitle(stats.previous)}${stats.previous.cut ? " до той же точки" : ", весь период"}`;
}

export function TotalsCard({ stats, employees }: { stats: PeriodStats; employees: Employee[] }) {
  const totals = useMemo(() => periodTotals(stats, employees.map((e) => e.id)), [stats, employees]);
  return (
    <section className="card">
      <div className="ch">
        <div>
          <h3>Итоги · {periodTitle(stats.current)}</h3>
          <div className="sub">
            по выбранным сотрудникам ({employees.length}) · {compareLabel(stats)}
            {totals.daysPassed > 0 && ` · прошло дней: ${totals.daysPassed}`}
          </div>
        </div>
      </div>
      <div className="grid-m">
        {totals.tiles.map((t) => {
          const value = formatValue(t.value, t.format);
          return (
            <div key={t.key} className="mt">
              <div className="k">{t.label}</div>
              <div className={`v${value.length > 9 ? " pv-long" : ""}`}>{value}</div>
              <div className="s pv-delta">
                <DeltaText delta={t.delta} previous={t.previous === null ? null : formatValue(t.previous, t.format)} />
              </div>
              {t.hint && <div className="s">{t.hint}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type MatrixMode = "level" | "calls" | "delta";

const pct0 = (v: number) => `${Math.round(v * 100)}`;
/** Заливка ячейки: те же цвета, что у таймлайна дня (CRM — зелёный, звонки — синий). */
function cellStyle(mode: MatrixMode, v: number): { background: string } {
  if (mode === "delta") {
    const a = Math.min(0.75, Math.abs(v) * 2.2);
    return { background: v >= 0 ? `rgba(82,196,26,${a.toFixed(3)})` : `rgba(255,77,79,${a.toFixed(3)})` };
  }
  const a = 0.06 + 0.74 * Math.max(0, Math.min(1, v));
  return { background: mode === "calls" ? `rgba(24,144,255,${a.toFixed(3)})` : `rgba(82,196,26,${a.toFixed(3)})` };
}

function MatrixCell({ mode, value, hour, mark }: { mode: MatrixMode; value: HourValue | undefined; hour: number; mark: "best" | "worst" | null }) {
  const v = mode === "level" ? value?.level : mode === "calls" ? value?.calls : value?.delta;
  if (v === null || v === undefined) return <td className="hm-na">·</td>;
  const span = `${pad(hour)}:00–${pad(hour + 1)}:00`;
  const title = mode === "delta" ? `${span} · ${formatPp(v)} к прошлому периоду` : mode === "calls" ? `${span} · звонки ${pct0(v)}% времени` : `${span} · активно ${pct0(v)}% времени (звонки ${pct0(value?.calls ?? 0)}%)`;
  const text = mode === "delta" ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}` : pct0(v);
  return (
    <td className="hm-c" style={cellStyle(mode, v)} title={title}>
      {text}
      {mark && <span className={`hm-mk ${mark === "best" ? "up" : "down"}`}>{mark === "best" ? "▲" : "▼"}</span>}
    </td>
  );
}

export function HourMatrixCard({ stats, employees }: { stats: PeriodStats; employees: Employee[] }) {
  const [mode, setMode] = useState<MatrixMode>("level");
  const matrix = useMemo(() => hourMatrix(stats, employees.map((e) => e.id)), [stats, employees]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const comparison = stats.previous.cut ? "до той же точки прошлого периода" : "к прошлому периоду целиком";
  const effective: MatrixMode = mode === "delta" && !stats.previous.available ? "level" : mode;
  const modes: { value: MatrixMode; label: string; disabled?: boolean }[] = [
    { value: "level", label: "Уровень" },
    { value: "calls", label: "Звонки" },
    { value: "delta", label: "Δ к прошлому периоду", disabled: !stats.previous.available },
  ];
  return (
    <section className="card">
      <div className="ch">
        <div>
          <h3>По часам · {periodTitle(stats.current)}</h3>
          <div className="sub">ячейка — средняя доля активного времени (CRM и звонки) в этот час за учтённые дни · ▲ лучший час · ▼ худший час · Δ {comparison}</div>
        </div>
        <div className="mini" role="tablist" aria-label="Показатель матрицы">
          {modes.map((m) => (
            <button key={m.value} type="button" role="tab" aria-selected={effective === m.value} className={effective === m.value ? "on" : undefined} disabled={m.disabled} title={m.disabled ? "Нет прошлого периода" : undefined} onClick={() => setMode(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="tbl-wrap pv-tbl">
        <table className="tbl hm">
          <thead>
            <tr>
              <th>Сотрудник</th>
              {matrix.hours.map((h) => <th key={h} className="num">{pad(h)}:00</th>)}
              <th className="num">Рейтинг</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r) => {
              const e = byId.get(r.employeeId);
              if (!e) return null;
              return (
                <tr key={r.employeeId}>
                  <td><EmployeeName employee={e} partial={stats.byEmployee.get(r.employeeId)?.partial} /></td>
                  {matrix.hours.map((h, i) => <MatrixCell key={h} mode={effective} value={r.cells[i]} hour={h} mark={effective === "delta" ? null : i === r.best ? "best" : i === r.worst ? "worst" : null} />)}
                  <td className="num hm-rt">
                    <span className={ratingTone(r.rating)}>{formatRating(r.rating)}</span>
                    {r.ratingDelta !== null && <span className={`hm-d ${r.ratingDelta >= 0 ? "up" : "down"}`}>{formatPp(r.ratingDelta)}</span>}
                  </td>
                </tr>
              );
            })}
            <tr className="hm-total">
              <td>Выбранные (среднее)</td>
              {matrix.hours.map((h, i) => <MatrixCell key={h} mode={effective} value={matrix.footer.cells[i]} hour={h} mark={null} />)}
              <td className="num hm-rt">{formatRating(matrix.footer.rating)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="legend pv-scale">
        <span>{effective === "delta" ? `уровень часа ${comparison}, п.п.` : `доля ${effective === "calls" ? "времени звонков" : "активного времени"} в часе:`}</span>
        {effective === "delta" ? (
          <>
            <span><i style={cellStyle("delta", -0.3)} />хуже</span>
            <span><i style={cellStyle("delta", 0.3)} />лучше</span>
          </>
        ) : (
          [0, 0.3, 0.6, 0.9].map((v) => <span key={v}><i style={cellStyle(effective, v)} />{Math.round(v * 100)}%</span>)
        )}
      </div>
    </section>
  );
}

export function EmployeeBarsCard({ stats, employees }: { stats: PeriodStats; employees: Employee[] }) {
  const rows = useMemo(() => employeeBars(stats, employees.map((e) => e.id)), [stats, employees]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const delta = (d: Delta) => (d.kind === "pct" ? <span className={`pv-dl ${deltaClass(d)}`}>{formatPercentDelta(d)}</span> : null);
  return (
    <section className="card">
      <div className="ch">
        <div>
          <h3>Сотрудники · {periodTitle(stats.current)}</h3>
          <div className="sub">активное время (интервалы активности в CRM и на звонках) и число зарегистрированных событий · процент — к прошлому периоду до той же точки</div>
        </div>
      </div>
      <div className="tbl-wrap pv-tbl">
        <table className="tbl">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Активное время</th>
              <th>События</th>
              <th className="num">Рейтинг</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = byId.get(r.employeeId);
              if (!e) return null;
              return (
                <tr key={r.employeeId}>
                  <td><EmployeeName employee={e} partial={stats.byEmployee.get(r.employeeId)?.partial} /></td>
                  <td className="pv-barcell">
                    <span className="pv-bar"><i style={{ width: `${Math.max(2, r.activeShare * 100).toFixed(1)}%`, background: "var(--tl-crm)" }} /></span>
                    <span className="num">{formatMinutes(r.active)}</span>
                    {delta(r.activeDelta)}
                  </td>
                  <td className="pv-barcell">
                    <span className="pv-bar"><i style={{ width: `${Math.max(2, r.eventsShare * 100).toFixed(1)}%`, background: "var(--tl-call)" }} /></span>
                    <span className="num">{r.events}</span>
                    {delta(r.eventsDelta)}
                  </td>
                  <td className="num"><span className={ratingTone(r.rating)}>{formatRating(r.rating)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const CHART = { w: 640, h: 200, l: 38, r: 12, t: 16, b: 30 };

/** Шаг сетки ≈ max/4, округлённый до 1·2·5 × 10ⁿ (целые подписи). */
function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((k) => k * mag).find((v) => v >= raw) ?? 10 * mag;
  return Math.max(1, nice);
}

function LineChart({ stats, employeeIds, today, metric, color, label }: { stats: PeriodStats; employeeIds: number[]; today: string; metric: DynamicsMetric; color: string; label: string }) {
  const series = useMemo(() => dynamicsSeries(stats, employeeIds, metric), [stats, employeeIds, metric]);
  const n = Math.max(series.current.length, series.previous?.length ?? 0);
  const pw = CHART.w - CHART.l - CHART.r;
  const ph = CHART.h - CHART.t - CHART.b;
  const step = niceStep(Math.max(1, series.max));
  const max = Math.max(step, Math.ceil(series.max / step) * step);
  const x = (i: number) => CHART.l + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v: number) => CHART.t + ph - (v / max) * ph;
  const path = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const days = stats.current.days;
  const todayIndex = days.indexOf(today);
  // Месяц: 1-е, каждое 5-е и сегодня; соседние с сегодняшним подписи не рисуются, чтобы не слипались.
  const showLabel = (i: number) => stats.kind === "week" || i === todayIndex || ((i === 0 || (i + 1) % 5 === 0) && Math.abs(i - todayIndex) > 1);
  const grid: number[] = [];
  for (let v = 0; v <= max; v += step) grid.push(v);
  return (
    <svg className="pv-chart" viewBox={`0 0 ${CHART.w} ${CHART.h}`} role="img" aria-label={label}>
      {grid.map((v) => (
        <g key={v}>
          <line x1={CHART.l} x2={CHART.w - CHART.r} y1={y(v)} y2={y(v)} className="gl" />
          <text x={CHART.l - 6} y={y(v) + 3} textAnchor="end" className="ay">{v}</text>
        </g>
      ))}
      {series.previous && <path d={path(series.previous)} fill="none" stroke="var(--tx2)" strokeWidth={1.5} strokeDasharray="4 3" />}
      <path d={path(series.current)} fill="none" stroke={color} strokeWidth={2.2} />
      {series.current.map((v, i) =>
        v === null ? null : (
          <g key={days[i]}>
            <circle cx={x(i)} cy={y(v)} r={days[i] === today ? 4.5 : 3.5} fill={color} stroke="var(--card)" strokeWidth={1.5}>
              <title>{`${dayAxisLabel(days[i] as string, "week")}: ${v}${series.previous?.[i] != null ? ` · прошлый период ${series.previous[i]}` : ""}`}</title>
            </circle>
            {showLabel(i) && <text x={x(i)} y={y(v) - 9} textAnchor="middle" className="vl">{v}</text>}
          </g>
        ),
      )}
      {days.map((d, i) =>
        showLabel(i) ? (
          <text key={d} x={x(i)} y={CHART.h - 10} textAnchor="middle" className={`ax${d === today ? " today" : ""}`}>{dayAxisLabel(d, stats.kind)}</text>
        ) : null,
      )}
    </svg>
  );
}

export function DynamicsCard({ stats, employees, today, metric, title, color }: { stats: PeriodStats; employees: Employee[]; today: string; metric: DynamicsMetric; title: string; color: string }) {
  const ids = useMemo(() => employees.map((e) => e.id), [employees]);
  return (
    <section className="card">
      <div className="ch">
        <div>
          <h3>{title}</h3>
          <div className="sub">{stats.kind === "week" ? "по дням недели (Пн–Вс)" : "по дням месяца"} · сумма по выбранным сотрудникам</div>
        </div>
      </div>
      <LineChart stats={stats} employeeIds={ids} today={today} metric={metric} color={color} label={title} />
      <div className="legend">
        <span><i className="pv-ln" style={{ borderColor: color }} />{periodTitle(stats.current)}</span>
        {stats.previous.available ? <span><i className="pv-ln dashed" />{periodTitle(stats.previous)} (целиком)</span> : <span className="mut">нет прошлого периода</span>}
      </div>
    </section>
  );
}
