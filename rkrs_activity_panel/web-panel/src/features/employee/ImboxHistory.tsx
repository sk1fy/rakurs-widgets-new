import { useMemo, useState } from "react";
import type { Sourced } from "../../api/source";
import { entityLink } from "../../domain/crmLinks";
import { imboxHistory } from "../../domain/formulas/sessions";
import { dayEndInclusive, dayStart, formatDurationShort, formatDurationWithSeconds } from "../../domain/time";
import type { EmployeeSessions } from "../../domain/types";
import { NotConnected } from "../../ui/primitives";
import { BarList, RangeFilter, SessionStrip } from "./parts";

/** «История посещений в Imbox» (EmployeeInboxSectionV2). */
export function ImboxHistory({ sessions, dayKey, timeZone, nowUnix, startMinutes, endMinutes, crmBase }: { sessions: Sourced<EmployeeSessions> | null; dayKey: string; timeZone: string; nowUnix: number; startMinutes: number; endMinutes: number; crmBase: string | null }) {
  const lo = Math.floor(startMinutes / 60) * 60;
  const hi = Math.ceil(endMinutes / 60) * 60;
  const [range, setRange] = useState<[number, number]>([lo, hi]);
  const [selected, setSelected] = useState<string | null>(null);
  const data = useMemo(
    () =>
      sessions?.kind === "ok"
        ? imboxHistory({ sessions: sessions.data.items, dayKey, timeZone, nowUnix, dayBounds: { start: dayStart(dayKey, timeZone), end: dayEndInclusive(dayKey, timeZone) }, entityLink: (t, id) => entityLink(crmBase, t, id) })
        : null,
    [sessions, dayKey, timeZone, nowUnix, crmBase],
  );
  if (!sessions) return null;
  const header = (
    <div className="sec-h">
      <h2>История посещений в Imbox</h2>
      {sessions.kind === "ok" && sessions.data.meta.source === "fixture" && <span className="chip warn">синтетика (C4)</span>}
    </div>
  );
  if (sessions.kind === "unavailable" || !data) {
    return (
      <section className="sec">
        {header}
        {sessions.kind === "unavailable" && <NotConnected contract={sessions.contract} reason={sessions.reason} />}
      </section>
    );
  }
  const rows = data.rows.filter((r) => r.endMinutes >= range[0] && r.startMinutes <= range[1]);
  return (
    <section className="sec">
      {header}
      <div className="sum-row">
        <div className="sum-card"><div className="k">Всего в Imbox</div><div className="v">{formatDurationShort(data.totalSeconds)}</div><div className="s">{data.rows.length} посещений</div></div>
        <div className="sum-card"><div className="k">Среднее посещение</div><div className="v">{formatDurationShort(data.averageSeconds)}</div></div>
        <div className="sum-card"><div className="k">Уникальных диалогов</div><div className="v">{data.uniqueConversations}</div></div>
        <div className="sum-card"><div className="k">Сущностей</div><div className="v">{data.uniqueEntities}</div>{data.hasNonLeadEntities && <div className="s">есть контакты/компании</div>}</div>
      </div>
      <div className="g21">
        <div className="card">
          <RangeFilter min={lo} max={hi} value={range} onChange={setRange} />
          <SessionStrip items={data.rows.map((r) => ({ id: r.id, startMinutes: r.startMinutes, endMinutes: Math.max(r.endMinutes, r.startMinutes + 1), color: "#54b5b5", title: `${r.title} ${r.start}–${r.end}` }))} min={range[0]} max={range[1]} selected={selected} onSelect={setSelected} />
          {rows.length === 0 ? (
            <div className="dim small">В выбранном периоде посещений нет</div>
          ) : (
            <div className="tbl-wrap" style={{ marginTop: 10 }}>
              <table className="tbl" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Сущность</th>
                    <th>Диалог</th>
                    <th>Старт</th>
                    <th>Финиш</th>
                    <th>Время</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={selected === r.id ? "hl" : ""} ref={(el) => { if (el && selected === r.id) el.scrollIntoView({ block: "nearest" }); }}>
                      <td>{r.href ? <a href={r.href} target="_blank" rel="noreferrer noopener">{r.title}</a> : r.title}</td>
                      <td className="dim">{r.subtitle}</td>
                      <td className="num">{r.start}</td>
                      <td className="num">{r.end}</td>
                      <td className="num">{formatDurationWithSeconds(r.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <h3>Топ сущностей по времени</h3>
          <BarList rows={data.entities} empty="Нет посещений" />
        </div>
      </div>
    </section>
  );
}
