import type { Sourced } from "../../api/source";
import { isProfileActivityEvent } from "../../domain/eventCatalog";
import { profileRatingPercent, RATING_LEGEND, ratingColor } from "../../domain/formulas/profileRating";
import { profileSessionMetrics } from "../../domain/formulas/sessions";
import { formatDurationShort, hhmm } from "../../domain/time";
import type { CrmEvent, EmployeeSessions } from "../../domain/types";
import { NotConnected } from "../../ui/primitives";
import { MetricTile } from "./parts";

interface DaySide {
  events: CrmEvent[] | null;
  sessions: Sourced<EmployeeSessions> | null;
  dayKey: string;
}

const fmtPct = (v: number) => `${v.toFixed(1).replace(".0", "")}%`;

/** «Общая информация» (EmployeeGeneralInfoSectionV2). Вчера без ответа — «—» (F3). */
export function GeneralInfo({ today, yesterday, timeZone, startMinutes, endMinutes, workEndMinutes, nowUnix, isToday }: { today: DaySide; yesterday: DaySide; timeZone: string; startMinutes: number; endMinutes: number; workEndMinutes: number; nowUnix: number; isToday: boolean }) {
  const rating = (side: DaySide) => (side.events ? profileRatingPercent({ events: side.events, dayKey: side.dayKey, timeZone, startMinutes, endMinutes, nowUnix }) : null);
  const r = rating(today);
  const ry = rating(yesterday);
  const evEdge = (side: DaySide, edge: "first" | "last") => {
    const list = (side.events ?? []).filter(isProfileActivityEvent).sort((a, b) => a.createdAt - b.createdAt);
    const e = edge === "first" ? list[0] : list[list.length - 1];
    return side.events ? (e ? hhmm(e.createdAt, timeZone) : "--:--") : "—";
  };
  const count = (side: DaySide, type: string) => (side.events ? String(side.events.filter((e) => e.type === type).length) : "—");
  const ses = (side: DaySide, isTodaySide: boolean) =>
    side.sessions?.kind === "ok" ? profileSessionMetrics({ sessions: side.sessions.data.items, timeZone, isToday: isTodaySide, nowUnix, workEndMinutes }) : null;
  const s = ses(today, isToday);
  const sy = ses(yesterday, false);
  const sessionsSynthetic = today.sessions?.kind === "ok" && today.sessions.data.meta.source === "fixture";
  const unavailable = today.sessions?.kind === "unavailable" ? today.sessions : null;

  return (
    <section className="sec">
      <div className="sec-h">
        <h2>Общая информация</h2>
      </div>
      <div className="grid-m">
        <div className="mt" style={{ gridColumn: "span 2" }}>
          <div className="k">Рейтинг активности</div>
          <div className="v" style={{ color: r === null ? undefined : ratingColor(r) }}>{r === null ? "—" : fmtPct(r)}</div>
          <div className="s">вчера: {ry === null ? "—" : fmtPct(ry)}</div>
          <div className="chips" style={{ marginTop: 8 }}>
            {RATING_LEGEND.map((l) => (
              <span key={l.label} className="chip mut" title={l.description} style={{ height: 20, fontSize: 10 }}>
                <i style={{ width: 8, height: 8, borderRadius: 4, background: l.color, display: "inline-block" }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
        {unavailable ? (
          <div style={{ gridColumn: "span 2" }}>
            <NotConnected contract={unavailable.contract} reason={`Старт и финиш дня, рабочее время, переходы в задачи: ${unavailable.reason}`} />
          </div>
        ) : (
          <>
            <MetricTile title="Старт дня" color="#2792ff" value={s?.dayStart ?? "--:--"} prev={sy ? sy.dayStart ?? "--:--" : "—"} synthetic={sessionsSynthetic} />
            <MetricTile title="Рабочее время" color="#5cd16a" value={s ? formatDurationShort(s.workSeconds) : "—"} prev={sy ? formatDurationShort(sy.workSeconds) : "—"} synthetic={sessionsSynthetic} />
            <MetricTile title="Переходов в задачи" color="#9654f1" value={s ? s.taskSwitches : "—"} prev={sy ? sy.taskSwitches : "—"} synthetic={sessionsSynthetic} />
            <MetricTile title="Финиш дня" color="#ff5454" value={s?.dayFinish ?? "--:--"} prev={sy ? sy.dayFinish ?? "--:--" : "—"} synthetic={sessionsSynthetic} hint="Сегодня показывается не раньше чем за 2 часа до конца рабочего окна" />
          </>
        )}
        <MetricTile title="Первое событие" color="#2792ff" value={evEdge(today, "first")} prev={evEdge(yesterday, "first")} />
        <MetricTile title="Смен этапов" color="#5cd16a" value={count(today, "lead_status_changed")} prev={count(yesterday, "lead_status_changed")} />
        <MetricTile title="Выполнено в очереди" color="#9654f1" value={count(today, "task_completed")} prev={count(yesterday, "task_completed")} />
        <MetricTile title="Последнее событие" color="#e4494d" value={evEdge(today, "last")} prev={evEdge(yesterday, "last")} />
      </div>
    </section>
  );
}
