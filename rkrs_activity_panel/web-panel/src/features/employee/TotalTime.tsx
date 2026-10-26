import type { Sourced } from "../../api/source";
import { entityLink, stageLink } from "../../domain/crmLinks";
import { summaryCards } from "../../domain/formulas/sessions";
import { dayEndInclusive, dayStart, formatDurationShort } from "../../domain/time";
import type { CrmEvent, EmployeeSessions } from "../../domain/types";
import { NotConnected } from "../../ui/primitives";
import { DonutSummary, TaskPanelGate } from "./parts";

/** «Суммарное время (задачи + Imbox)»: топ-7 сделок, этапов и типов задач (EmployeeDealsSnapshotSectionV2). */
export function TotalTime({ sessions, events, dayKey, timeZone, nowUnix, crmBase, employeeId, taskPanelEnabled }: { sessions: Sourced<EmployeeSessions> | null; events: CrmEvent[]; dayKey: string; timeZone: string; nowUnix: number; crmBase: string | null; employeeId: number; taskPanelEnabled: boolean | null }) {
  if (taskPanelEnabled === false) return <TaskPanelGate title="Суммарное время" />;
  if (!sessions) return null;
  if (sessions.kind === "unavailable") {
    return (
      <section className="sec total-time">
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
    <section className="sec total-time">
      <div className="sec-h">
        <h2>Суммарное время (задачи + Imbox)</h2>
        {sessions.data.meta.source === "fixture" && <span className="chip warn">Тестовые данные</span>}
        <div className="sp" />
        <span className="dim small">по сделкам: {formatDurationShort(total)}</span>
      </div>
      <div className="g3">
        <div className="card">
          <h3>Топ-7 сделок по времени</h3>
          <DonutSummary value={cards.deals.length} label="уникальных сделок посещено" rows={cards.deals} empty="Нет данных по сделкам" columns={["Время в сделке", "Сделка"]} />
        </div>
        <div className="card">
          <h3>Топ-7 этапов в воронках</h3>
          <DonutSummary value={cards.stages.length} label="этапов изменено" rows={cards.stages} empty="Нет данных по этапам воронок" columns={["Время в сделке", "Этап"]} />
        </div>
        <div className="card">
          <h3>Топ-7 типов задач</h3>
          <DonutSummary value={cards.uniqueTasks} label="задач выполнено" rows={cards.taskTypes} empty="Нет данных по типам задач" columns={["Время в задаче", "Тип задачи"]} />
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
