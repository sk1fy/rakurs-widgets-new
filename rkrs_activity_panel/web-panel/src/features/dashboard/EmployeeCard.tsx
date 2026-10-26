import { useState, type ReactNode } from "react";
import { usePanelScope } from "../../app/context";
import { href } from "../../app/router";
import { allCallsStatsLink, avatarSrc, callsStatsLink, closedTasksLink, eventsListLink, NO_CRM_BASE_HINT } from "../../domain/crmLinks";
import type { KpiValue } from "../../domain/formulas/kpi";
import { addDays, formatDurationShort } from "../../domain/time";
import type { ProblemCount, WorkSession } from "../../domain/types";
import { Icon, type IconName } from "../../ui/Icon";
import type { EmployeeRow } from "./model";
import { rememberReturn } from "./returnTarget";
import { TimeAxis, TimelineBar } from "./Timeline";

interface MetricLinks {
  today: string | null;
  yesterday: string | null;
}

/** Ссылка на список в amoCRM; без адреса CRM (C2) — просто текст. */
function MaybeLink({ href: link, className, title, children }: { href: string | null; className: string; title?: string; children: ReactNode }) {
  return link ? (
    <a href={link} target="_blank" rel="noreferrer noopener" className={`${className} lnk`} title={title}>
      {children}
    </a>
  ) : (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

function Metric({ icon, value, title, links, loadingPrev }: { icon: IconName; value: KpiValue | null; title: string; links: MetricLinks; loadingPrev: boolean }) {
  const trend = value?.trend === "up" ? "up" : value?.trend === "down" ? "down" : "";
  return (
    <span className="m" title={`${title} · сегодня / вчера${links.today ? "" : ` · ${NO_CRM_BASE_HINT}`}`}>
      <Icon name={icon} />
      <MaybeLink href={links.today} className={`v ${trend}`} title={links.today ? `${title}: открыть список за день` : undefined}>
        {value ? value.today : "—"}
      </MaybeLink>
      {/* F3: вчерашние данные не загружены — «—», а не 0 */}
      {loadingPrev ? (
        <span className="spin sm" aria-label="Загрузка вчерашних данных" />
      ) : (
        <MaybeLink href={value?.yesterday != null ? links.yesterday : null} className="prev" title={links.yesterday ? `${title}: открыть список за вчера` : undefined}>
          / {value?.yesterday ?? "—"}
        </MaybeLink>
      )}
      {value?.trend === "up" && <span className="arr up">↑</span>}
      {value?.trend === "down" && <span className="arr down">↓</span>}
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
  yesterdayLoading,
  problemsLoading,
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
  yesterdayLoading: boolean;
  problemsLoading: boolean;
  external?: WorkSession[] | null;
  extra?: ReactNode;
}) {
  const { panel, prefs, viewKey } = usePanelScope();
  const base = panel.crmBaseUrl;
  const k = prefs.kpi;
  const e = row.employee;
  const c = row.kpis.counts;
  const val = (v: KpiValue): KpiValue => (yesterdayLoaded ? v : { ...v, yesterday: null, trend: null });
  const [photoBroken, setPhotoBroken] = useState(false);
  const photo = photoBroken ? null : avatarSrc(e.avatarUrl, base);
  const byDay = (link: (day: string) => string | null): MetricLinks => ({ today: link(dayKey), yesterday: link(addDays(dayKey, -1)) });
  const profile = href({ name: "employee", viewKey, employeeId: e.id, date: isToday ? null : dayKey });
  const callTitle = `Общее время звонков${row.kpis.callsWithoutDuration ? ` · у ${row.kpis.callsWithoutDuration} звонков нет длительности` : ""}`;
  return (
    <div className={`emp${compact ? " compact" : ""}`} data-emp={e.id}>
      <div className="erow">
        <div className="who">
          <a href={profile} aria-label={`Профиль: ${e.name}`} className="ava-live" onClick={() => rememberReturn(e.id)}>
            {photo ? <img src={photo} alt="" loading="lazy" onError={() => setPhotoBroken(true)} /> : <Icon name="user" />}
          </a>
          <div className="ename" title={e.name}>
            <a href={profile} onClick={() => rememberReturn(e.id)}>
              {e.name}
            </a>
          </div>
        </div>
        <div className="metrics">
          {k.totalCallsTime && (
            <span className="m dur" title={callTitle}>
              <Icon name="clock" />
              <MaybeLink href={allCallsStatsLink(base, e.id, dayKey)} className="v" title={base ? "Статистика звонков amoCRM за день" : undefined}>
                {formatDurationShort(row.kpis.totalCallSeconds)}
              </MaybeLink>
              {row.kpis.callsWithoutDuration > 0 && <span className="prev" title="без длительности">+{row.kpis.callsWithoutDuration}?</span>}
            </span>
          )}
          {k.outgoingCalls && <Metric icon="phone" value={val(c.outgoingCalls)} title="Исходящие звонки" loadingPrev={yesterdayLoading} links={byDay((d) => callsStatsLink(base, e.id, d))} />}
          {k.messages && <Metric icon="msg" value={val(c.messages)} title="Сообщения" loadingPrev={yesterdayLoading} links={byDay((d) => eventsListLink(base, e.id, d, "outgoing_chat_message"))} />}
          {k.outgoingMail && <Metric icon="mail" value={val(c.outgoingMail)} title="Исходящие письма" loadingPrev={yesterdayLoading} links={byDay((d) => eventsListLink(base, e.id, d, "outgoing_mail"))} />}
          {k.completedTasks && <Metric icon="task" value={val(c.completedTasks)} title="Выполненные задачи" loadingPrev={yesterdayLoading} links={byDay((d) => closedTasksLink(base, e.id, d))} />}
          {k.leadStatusChanges && <Metric icon="deal" value={val(c.leadStatusChanges)} title="Смена этапов сделок" loadingPrev={yesterdayLoading} links={byDay((d) => eventsListLink(base, e.id, d, "lead_status_changed"))} />}
          {problemsLoading && (k.leadsNoTasks || k.leadsFailedTasks || k.overdueTasks) && <span className="spin sm" aria-label="Загрузка проблемных сделок" />}
          {problemsAvailable && k.leadsNoTasks && <Problem icon="dollar" dot="y" value={row.problems.noTasks} title="Сделки без задач · текущий срез" synthetic={problemsSynthetic} />}
          {problemsAvailable && k.leadsFailedTasks && <Problem icon="dollar" dot="r" value={row.problems.failed} title="Сделки с просроченными задачами · текущий срез" synthetic={problemsSynthetic} />}
          {problemsAvailable && k.overdueTasks && <Problem icon="cal" dot="r" value={row.problems.overdue} title="Личные просроченные задачи · текущий срез" synthetic={problemsSynthetic} />}
        </div>
        <div className="rating" title="Доля активного времени от прошедшего рабочего окна (2-минутные отрезки)">
          <Icon name="chart" />
          <span className="pct">
            {row.percent.toFixed(1).replace(".0", "")}%
          </span>
        </div>
      </div>
      {/* Компактный режим, как в старой панели: только показатели и сравнение, без таймлайна. */}
      {!compact && (
        <>
          <TimelineBar row={row.timeline} startMinutes={startMinutes} endMinutes={endMinutes} isToday={isToday} dayKey={dayKey} external={external} emptyLabel="Нет зарегистрированных событий" />
          <TimeAxis startMinutes={startMinutes} endMinutes={endMinutes} />
          {extra}
        </>
      )}
    </div>
  );
}
