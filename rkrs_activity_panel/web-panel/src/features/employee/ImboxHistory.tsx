import { shouldGateSessionHistory } from "./sessionHistoryState";
import { useMemo, useState } from "react";
import type { Sourced } from "../../api/source";
import { entityLink } from "../../domain/crmLinks";
import { imboxHistory } from "../../domain/formulas/sessions";
import { dayEndInclusive, dayStart, formatDurationShort, formatDurationWithSeconds } from "../../domain/time";
import type { EmployeeSessions } from "../../domain/types";
import { NotConnected } from "../../ui/primitives";
import { DonutSummary, EmptyNote, nowMinutesFor, RangeFilter, SessionStrip, SumCard, TaskPanelGate, useFlashSelection } from "./parts";

/** «История посещений в Imbox» (EmployeeInboxSectionV2). */
export function ImboxHistory({ sessions, dayKey, timeZone, nowUnix, startMinutes, endMinutes, crmBase, taskPanelEnabled }: { sessions: Sourced<EmployeeSessions> | null; dayKey: string; timeZone: string; nowUnix: number; startMinutes: number; endMinutes: number; crmBase: string | null; taskPanelEnabled: boolean | null }) {
  const lo = Math.floor(startMinutes / 60) * 60;
  const hi = Math.ceil(endMinutes / 60) * 60;
  const [range, setRange] = useState<[number, number]>([lo, hi]);
  const [selected, setSelected, rowRef] = useFlashSelection();
  const data = useMemo(
    () =>
      sessions?.kind === "ok"
        ? imboxHistory({ sessions: sessions.data.items, dayKey, timeZone, nowUnix, dayBounds: { start: dayStart(dayKey, timeZone), end: dayEndInclusive(dayKey, timeZone) }, entityLink: (t, id) => entityLink(crmBase, t, id) })
        : null,
    [sessions, dayKey, timeZone, nowUnix, crmBase],
  );
  if (shouldGateSessionHistory(taskPanelEnabled, sessions)) return <TaskPanelGate title="История посещений в Imbox" />;
  if (!sessions) return null;
  const header = (
    <div className="sec-h">
      <h2>История посещений в Imbox</h2>
      {taskPanelEnabled === false && <span className="chip warn">Сбор отключён</span>}
      {sessions.kind === "ok" && sessions.data.meta.source === "fixture" && <span className="chip warn">Тестовые данные</span>}
    </div>
  );
  if (sessions.kind === "unavailable" || !data) {
    return (
      <section className="sec history-section imbox-history">
        {header}
        {sessions.kind === "unavailable" && <NotConnected contract={sessions.contract} reason={sessions.reason} />}
      </section>
    );
  }
  const rows = data.rows.filter((r) => r.endMinutes >= range[0] && r.startMinutes <= range[1]);
  return (
    <section className="sec history-section imbox-history">
      {header}
      <div className="card history-range-card">
          <RangeFilter min={lo} max={hi} value={range} onChange={setRange} />
      </div>
      <div className="card history-timeline-card">
          <SessionStrip items={data.rows.map((r) => ({ id: r.id, startMinutes: r.startMinutes, endMinutes: Math.max(r.endMinutes, r.startMinutes + 1), color: "#54b5b5", title: `${r.title}\n${r.start}–${r.end} · ${formatDurationWithSeconds(r.seconds)}` }))} min={range[0]} max={range[1]} selected={selected} onSelect={setSelected} nowMinutes={nowMinutesFor(nowUnix, dayKey, timeZone)} />
      </div>
      <div className="g21">
        <div className="card history-table-card">
          <div className="history-card-head">
            <h3>События</h3>
            <div className="history-summary">
              <SumCard icon="clock" label="Всего в Imbox" value={formatDurationWithSeconds(data.totalSeconds)} />
              <SumCard icon="refresh" label="Среднее" value={formatDurationWithSeconds(data.averageSeconds)} />
              <SumCard icon="msg" label="Уникальных бесед" value={data.uniqueConversations} />
            </div>
          </div>
          {data.rows.length === 0 ? (
            <EmptyNote>Нет посещений Imbox за день</EmptyNote>
          ) : rows.length === 0 ? (
            <EmptyNote>В выбранном периоде посещений нет</EmptyNote>
          ) : (
            <div className="tbl-wrap" style={{ marginTop: 10 }}>
              <table className="tbl" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Старт — финиш</th>
                    <th>Время в Imbox</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={selected === r.id ? "hl" : ""} ref={(el) => rowRef(el, r.id)}>
                      <td>{r.href ? <a href={r.href} target="_blank" rel="noreferrer noopener">{r.title}</a> : r.title}<span className="imbox-subtitle">{r.subtitle}</span></td>
                      <td className="num">{r.start} — {r.end}</td>
                      <td className="num">{formatDurationWithSeconds(r.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <h3>{data.hasNonLeadEntities ? "Топ-7 сущностей по времени" : "Топ-7 сделок по времени"}</h3>
          <div className="card-total">
            <b>{formatDurationShort(data.totalSeconds)}</b> общее время
          </div>
          <DonutSummary value={data.uniqueEntities} label={data.hasNonLeadEntities ? "сущностей посещено" : "уникальных сделок посещено"} rows={data.entities} empty="Нет посещений" columns={["Время", "Сущность"]} />
        </div>
      </div>
    </section>
  );
}
