import type { ReactNode } from "react";
import { usePanelScope } from "../../app/context";
import { href } from "../../app/router";
import { callsStatsLink, closedTasksLink, eventsListLink, NO_CRM_BASE_HINT } from "../../domain/crmLinks";
import type { KpiValue } from "../../domain/formulas/kpi";
import { formatDurationShort } from "../../domain/time";
import type { ProblemCount, WorkSession } from "../../domain/types";
import { Icon, type IconName } from "../../ui/Icon";
import type { EmployeeRow } from "./model";
import { TimeAxis, TimelineBar } from "./Timeline";

function Metric({ icon, value, title, href: link }: { icon: IconName; value: KpiValue | null; title: string; href: string | null }) {
  const body = (
    <>
      <Icon name={icon} />
      <span className={`v ${value?.trend === "up" ? "up" : value?.trend === "down" ? "down" : ""}`}>{value ? value.today : "—"}</span>
      {/* F3: вчерашние данные не загружены — «—», а не 0 */}
      <span className="prev">/ {value?.yesterday ?? "—"}</span>
      {value?.trend === "up" && <span className="arr up">↑</span>}
      {value?.trend === "down" && <span className="arr down">↓</span>}
    </>
  );
  return (
    <span className="m" title={`${title} · сегодня / вчера${link ? "" : ` · ${NO_CRM_BASE_HINT}`}`}>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer noopener" style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
          {body}
        </a>
      ) : (
        body
      )}
    </span>
  );
}

function Problem({ icon, dot, value, title, synthetic }: { icon: IconName; dot?: "y" | "r"; value: ProblemCount | null; title: string; synthetic: boolean }) {
  const inner = (
    <>
      <span className="ic">
        <Icon name={icon} />
        {dot && <i className={`dot ${dot}`} />}
      </span>
      <span className={`v${value ? "" : " na"}`}>{value ? value.count : "—"}</span>
    </>
  );
  return (
    <span className={`m prob${synthetic ? " syn" : ""}`} title={`${title}${synthetic ? " · синтетика (C3)" : ""}`}>
      {value?.filterLink ? (
        <a href={value.filterLink} target="_blank" rel="noreferrer noopener">
          {inner}
        </a>
      ) : (
        inner
      )}
    </span>
  );
}

export function EmployeeCard({
  row,
  dayKey,
  startMinutes,
  endMinutes,
  isToday,
  compact,
  problemsSynthetic,
  problemsAvailable,
  yesterdayLoaded,
  external,
  extra,
}: {
  row: EmployeeRow;
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  isToday: boolean;
  compact: boolean;
  problemsSynthetic: boolean;
  problemsAvailable: boolean;
  yesterdayLoaded: boolean;
  external?: WorkSession[] | null;
  extra?: ReactNode;
}) {
  const { panel, prefs, viewKey } = usePanelScope();
  const base = panel.crmBaseUrl;
  const k = prefs.kpi;
  const e = row.employee;
  const c = row.kpis.counts;
  const val = (v: KpiValue): KpiValue => (yesterdayLoaded ? v : { ...v, yesterday: null, trend: null });
  const profile = href({ name: "employee", viewKey, employeeId: e.id, date: isToday ? null : dayKey });
  const callTitle = `Общее время звонков${row.kpis.callsWithoutDuration ? ` · у ${row.kpis.callsWithoutDuration} звонков нет длительности` : ""}`;
  return (
    <div className={`emp${compact ? " compact" : ""}`} data-emp={e.id}>
      <div className="erow">
        <div className="who">
          <a href={profile} aria-label={`Профиль: ${e.name}`} className="ava-live">
            <Icon name="user" />
          </a>
          <div className="ename" title={e.name}>
            <a href={profile}>{e.name}</a>
          </div>
        </div>
        <div className="metrics">
          {k.totalCallsTime && (
            <span className="m dur" title={callTitle}>
              <Icon name="clock" />
              <span className="v">{formatDurationShort(row.kpis.totalCallSeconds)}</span>
              {row.kpis.callsWithoutDuration > 0 && <span className="prev" title="без длительности">+{row.kpis.callsWithoutDuration}?</span>}
            </span>
          )}
          {k.outgoingCalls && <Metric icon="phone" value={val(c.outgoingCalls)} title="Исходящие звонки" href={callsStatsLink(base, e.id, dayKey)} />}
          {k.messages && <Metric icon="msg" value={val(c.messages)} title="Сообщения" href={eventsListLink(base, e.id, dayKey)} />}
          {k.outgoingMail && <Metric icon="mail" value={val(c.outgoingMail)} title="Исходящие письма" href={eventsListLink(base, e.id, dayKey, "outgoing_mail")} />}
          {k.completedTasks && <Metric icon="task" value={val(c.completedTasks)} title="Выполненные задачи" href={closedTasksLink(base, e.id, dayKey)} />}
          {k.leadStatusChanges && <Metric icon="deal" value={val(c.leadStatusChanges)} title="Смена этапов сделок" href={eventsListLink(base, e.id, dayKey, "lead_status_changed")} />}
          {problemsAvailable && k.leadsNoTasks && <Problem icon="dollar" dot="y" value={row.problems.noTasks} title="Сделки без задач · текущий срез" synthetic={problemsSynthetic} />}
          {problemsAvailable && k.leadsFailedTasks && <Problem icon="dollar" dot="r" value={row.problems.failed} title="Сделки с просроченными задачами · текущий срез" synthetic={problemsSynthetic} />}
          {problemsAvailable && k.overdueTasks && <Problem icon="cal" value={row.problems.overdue} title="Личные просроченные задачи · текущий срез" synthetic={problemsSynthetic} />}
        </div>
        <div className="rating" title="Доля активного времени от прошедшего рабочего окна (2-минутные отрезки)">
          <Icon name="chart" />
          <span className="pct">
            {row.percent.toFixed(1).replace(".0", "")}%
          </span>
        </div>
      </div>
      <TimelineBar row={row.timeline} startMinutes={startMinutes} endMinutes={endMinutes} isToday={isToday} external={external} emptyLabel="Нет зарегистрированных событий" />
      <TimeAxis startMinutes={startMinutes} endMinutes={endMinutes} />
      {extra}
    </div>
  );
}
