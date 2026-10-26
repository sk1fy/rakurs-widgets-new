import type { Sourced } from "../../api/source";
import { entityLink, stageLink } from "../../domain/crmLinks";
import { summaryCards } from "../../domain/formulas/sessions";
import { dayEndInclusive, dayStart, formatDurationShort } from "../../domain/time";
import type { CrmEvent, EmployeeSessions } from "../../domain/types";
import { NotConnected } from "../../ui/primitives";
import { BarList } from "./parts";

/** «Суммарное время (задачи + Imbox)»: топ-7 сделок, этапов и типов задач (EmployeeDealsSnapshotSectionV2). */
export function TotalTime({ sessions, events, dayKey, timeZone, nowUnix, crmBase, employeeId }: { sessions: Sourced<EmployeeSessions> | null; events: CrmEvent[]; dayKey: string; timeZone: string; nowUnix: number; crmBase: string | null; employeeId: number }) {
  if (!sessions) return null;
  if (sessions.kind === "unavailable") {
    return (
      <section className="sec">
        <div className="sec-h">
          <h2>Суммарное время</h2>
        </div>
        <NotConnected contract={sessions.contract} reason={sessions.reason} />
      </section>
    );
  }
  const cards = summaryCards({
    sessions: sessions.data.items,
    completedTaskEvents: events.filter((e) => e.type === "task_completed"),
    dayKey,
    timeZone,
    nowUnix,
    dayBounds: { start: dayStart(dayKey, timeZone), end: dayEndInclusive(dayKey, timeZone) },
    links: { entity: (t, id) => entityLink(crmBase, t, id), stage: (p, s) => stageLink(crmBase, p, s, employeeId) },
  });
  const total = cards.deals.reduce((s, r) => s + r.seconds, 0);
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>Суммарное время (задачи + Imbox)</h2>
        {sessions.data.meta.source === "fixture" && <span className="chip warn">синтетика (C4)</span>}
        <div className="sp" />
        <span className="dim small">по сделкам: {formatDurationShort(total)}</span>
      </div>
      <div className="g3">
        <div className="card">
          <h3>Топ сделок</h3>
          <BarList rows={cards.deals} empty="Нет сессий по сделкам" />
        </div>
        <div className="card">
          <h3>Топ этапов</h3>
          <BarList rows={cards.stages} empty="Нет данных об этапах" />
        </div>
        <div className="card">
          <h3>Топ типов задач</h3>
          <BarList rows={cards.taskTypes} empty="Нет задач" />
        </div>
      </div>
      {cards.fallbackTasks > 0 && (
        <div className="note">
          {cards.fallbackTasks} завершённых задач без найденной сессии учтены условно по 10 с (правило старой панели, F10).
        </div>
      )}
    </section>
  );
}
