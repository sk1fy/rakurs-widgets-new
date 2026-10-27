import { shouldGateSessionHistory } from "./sessionHistoryState";
import { useMemo, useState } from "react";
import type { Sourced } from "../../api/source";
import { taskHistory, type HistoryRow } from "../../domain/formulas/sessions";
import { dayEndInclusive, formatDurationWithSeconds } from "../../domain/time";
import type { EmployeeSessions } from "../../domain/types";
import { NotConnected } from "../../ui/primitives";
import { EmptyNote, isPlaceholder, nowMinutesFor, RangeFilter, SessionStrip, SumCard, TaskPanelGate, useFlashSelection } from "./parts";

type SortKey = "start" | "end" | "duration";

/** «История задач» (EmployeeTaskBoardSectionV2). F7: паузы не попадают в таблицу. */
export function TaskHistory({ sessions, dayKey, timeZone, nowUnix, startMinutes, endMinutes, taskPanelEnabled }: { sessions: Sourced<EmployeeSessions> | null; dayKey: string; timeZone: string; nowUnix: number; startMinutes: number; endMinutes: number; taskPanelEnabled: boolean | null }) {
  const [range, setRange] = useState<[number, number]>([Math.floor(startMinutes / 60) * 60, Math.ceil(endMinutes / 60) * 60]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "start", dir: 1 });
  const [selected, setSelected, rowRef] = useFlashSelection();
  const data = useMemo(() => (sessions?.kind === "ok" ? taskHistory({ sessions: sessions.data.items, dayKey, timeZone, nowUnix, dayEnd: dayEndInclusive(dayKey, timeZone) }) : null), [sessions, dayKey, timeZone, nowUnix]);
  if (!sessions) return null;
  const header = (
    <div className="sec-h">
      <h2>История задач</h2>
      {taskPanelEnabled === false && <span className="chip warn">Сбор отключён</span>}
      {sessions.kind === "ok" && sessions.data.meta.source === "fixture" && <span className="chip warn">Тестовые данные</span>}
    </div>
  );
  if (shouldGateSessionHistory(taskPanelEnabled, sessions)) return <TaskPanelGate title="История задач" />;
  if (sessions.kind === "unavailable" || !data) {
    return (
      <section className="sec history-section task-history">
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
        {label} <span className="sort-i">{sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
  const s = data.summary;
  return (
    <section className="sec history-section task-history">
      {header}
      <div className="card history-range-card">
        <RangeFilter min={Math.floor(startMinutes / 60) * 60} max={Math.ceil(endMinutes / 60) * 60} value={range} onChange={setRange} />
      </div>
      <div className="card history-timeline-card">
        <SessionStrip items={data.rows.map((r) => ({ id: r.id, startMinutes: r.startMinutes, endMinutes: Math.max(r.endMinutes, r.startMinutes + 1), color: r.color, title: `${r.title}\n${r.start}–${r.end} · ${formatDurationWithSeconds(r.seconds)}` }))} min={range[0]} max={range[1]} selected={selected} onSelect={setSelected} nowMinutes={nowMinutesFor(nowUnix, dayKey, timeZone)} />
      </div>
      <div className="card history-table-card">
        <div className="history-card-head">
          <h3>Список задач</h3>
          <div className="history-summary">
            <SumCard icon="task" label="Завершено интервалов" value={s.closed} />
            <SumCard icon="clock" label="Среднее" value={formatDurationWithSeconds(s.averageSeconds)} />
            <SumCard icon="ok" label="С результатом" value={`${s.withResult} / ${s.total}`} />
            <SumCard icon="chart" label="Типов" value={s.types} />
            <SumCard icon="edit" label="Другое" value={s.other} />
          </div>
        </div>
        {data.rows.length === 0 ? (
          <EmptyNote>Нет данных по работе с панелью задач</EmptyNote>
        ) : rows.length === 0 ? (
          <EmptyNote>В выбранном периоде задач нет</EmptyNote>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Тип</th>
                  {th("start", "Старт")}
                  {th("end", "Финиш")}
                  {th("duration", "Время в задаче")}
                  <th>Текст задачи</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={selected === r.id ? "hl" : ""} ref={(el) => rowRef(el, r.id)}>
                    <td>{r.href ? <a href={r.href} target="_blank" rel="noreferrer noopener">{r.title}</a> : r.title}</td>
                    <td><span className="type-badge"><i style={{ background: r.color }} />{r.typeLabel}</span></td>
                    <td className="num">{r.start}</td>
                    <td className="num">{r.end}</td>
                    <td className="num">{formatDurationWithSeconds(r.seconds)}</td>
                    <td className={isPlaceholder(r.text) ? "muted" : ""}>{r.text}</td>
                    <td className={isPlaceholder(r.result) ? "muted" : ""}>{r.result}</td>
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
