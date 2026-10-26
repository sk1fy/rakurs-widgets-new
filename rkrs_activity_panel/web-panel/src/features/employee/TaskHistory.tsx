import { useMemo, useState } from "react";
import type { Sourced } from "../../api/source";
import { taskHistory, type HistoryRow } from "../../domain/formulas/sessions";
import { dayEndInclusive, formatDurationWithSeconds, formatDurationShort, minutesToHHMM } from "../../domain/time";
import type { EmployeeSessions } from "../../domain/types";
import { NotConnected } from "../../ui/primitives";
import { RangeFilter, SessionStrip } from "./parts";

type SortKey = "start" | "end" | "duration";

/** «История выполненных задач» (EmployeeTaskBoardSectionV2). F7: паузы не попадают в таблицу. */
export function TaskHistory({ sessions, dayKey, timeZone, nowUnix, startMinutes, endMinutes, taskPanelEnabled }: { sessions: Sourced<EmployeeSessions> | null; dayKey: string; timeZone: string; nowUnix: number; startMinutes: number; endMinutes: number; taskPanelEnabled: boolean | null }) {
  const [range, setRange] = useState<[number, number]>([Math.floor(startMinutes / 60) * 60, Math.ceil(endMinutes / 60) * 60]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "start", dir: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const data = useMemo(() => (sessions?.kind === "ok" ? taskHistory({ sessions: sessions.data.items, dayKey, timeZone, nowUnix, dayEnd: dayEndInclusive(dayKey, timeZone) }) : null), [sessions, dayKey, timeZone, nowUnix]);
  if (!sessions) return null;
  const header = (
    <div className="sec-h">
      <h2>История выполненных задач</h2>
      {sessions.kind === "ok" && sessions.data.meta.source === "fixture" && <span className="chip warn">синтетика (C4)</span>}
    </div>
  );
  if (taskPanelEnabled === false) {
    return (
      <section className="sec">
        {header}
        <div className="state empty">Панель задач отключена для аккаунта — история задач не ведётся.</div>
      </section>
    );
  }
  if (sessions.kind === "unavailable" || !data) {
    return (
      <section className="sec">
        {header}
        {sessions.kind === "unavailable" && <NotConnected contract={sessions.contract} reason={sessions.reason} />}
      </section>
    );
  }
  const inRange = (r: HistoryRow) => r.endMinutes >= range[0] && r.startMinutes <= range[1];
  const rows = data.rows.filter(inRange).sort((a, b) => {
    const v = sort.key === "start" ? a.startMinutes - b.startMinutes : sort.key === "end" ? a.endMinutes - b.endMinutes : a.seconds - b.seconds;
    return v * sort.dir;
  });
  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className={sort.key === key ? "on" : ""} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label} {sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : ""}
      </button>
    </th>
  );
  const s = data.summary;
  return (
    <section className="sec">
      {header}
      <div className="sum-row">
        <div className="sum-card"><div className="k">Закрыто</div><div className="v">{s.closed}</div><div className="s">из {s.total} сессий</div></div>
        <div className="sum-card"><div className="k">Среднее время</div><div className="v">{formatDurationShort(s.averageSeconds)}</div></div>
        <div className="sum-card"><div className="k">С результатом</div><div className="v">{s.withResult}</div></div>
        <div className="sum-card"><div className="k">Типов задач</div><div className="v">{s.types}</div><div className="s">другое: {s.other}</div></div>
      </div>
      <div className="card">
        <RangeFilter min={Math.floor(startMinutes / 60) * 60} max={Math.ceil(endMinutes / 60) * 60} value={range} onChange={setRange} />
        <SessionStrip items={data.rows.map((r) => ({ id: r.id, startMinutes: r.startMinutes, endMinutes: Math.max(r.endMinutes, r.startMinutes + 1), color: r.color, title: `${r.title} ${r.start}–${r.end}` }))} min={range[0]} max={range[1]} selected={selected} onSelect={setSelected} />
        <div className="dim small" style={{ marginBottom: 10 }}>
          {minutesToHHMM(range[0])} — {minutesToHHMM(range[1])} · клик по отрезку выделяет строку
        </div>
        {rows.length === 0 ? (
          <div className="dim small">В выбранном периоде задач нет</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Название</th>
                  {th("start", "Старт")}
                  {th("end", "Финиш")}
                  {th("duration", "Время в задаче")}
                  <th>Текст</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={selected === r.id ? "hl" : ""} ref={(el) => { if (el && selected === r.id) el.scrollIntoView({ block: "nearest" }); }}>
                    <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: r.color, marginRight: 6 }} />{r.typeLabel}</td>
                    <td>{r.href ? <a href={r.href} target="_blank" rel="noreferrer noopener">{r.title}</a> : r.title}</td>
                    <td className="num">{r.start}</td>
                    <td className="num">{r.end}</td>
                    <td className="num">{formatDurationWithSeconds(r.seconds)}</td>
                    <td>{r.text}</td>
                    <td>{r.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
