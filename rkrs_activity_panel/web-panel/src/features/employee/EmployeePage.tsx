import { useMemo } from "react";
import { AppHeader } from "../../app/AppHeader";
import { usePanelScope } from "../../app/context";
import { useNow } from "../../app/hooks";
import { href, navigate } from "../../app/router";
import { addMonths, todayKey } from "../../domain/time";
import { Icon } from "../../ui/Icon";
import { Avatar, EmptyState, ErrorState, MetaBadges, Spinner } from "../../ui/primitives";
import { DateNav } from "../dashboard/DateNav";
import { resolveWindow } from "../dashboard/model";
import { DAY_REFRESH_MS } from "../dashboard/useDashboardData";
import { EventAnalysis } from "./EventAnalysis";
import { GeneralInfo } from "./GeneralInfo";
import { ImboxHistory } from "./ImboxHistory";
import { TaskHistory } from "./TaskHistory";
import { TotalTime } from "./TotalTime";
import { useEmployeeData } from "./useEmployeeData";

/** Профиль сотрудника (EmployeeStatsScreenV2): события CRM + сессии виджета (C4). */
export function EmployeePage({ employeeId, date }: { employeeId: number; date: string | null }) {
  const { panel, prefs, source, viewKey } = usePanelScope();
  const now = useNow();
  const tz = panel.timezone;
  const today = todayKey(tz, now * 1000);
  const dayKey = date && date >= addMonths(today, -1) && date <= today ? date : today;
  const win = resolveWindow(panel, prefs, dayKey, now);
  const employee = panel.employees.find((e) => e.id === employeeId);
  const data = useEmployeeData(source, employeeId, dayKey, tz, win.isToday ? DAY_REFRESH_MS : null);
  const events = data.events.data?.byEmployee.get(employeeId) ?? null;
  const prevEvents = data.prevEvents.data?.byEmployee.get(employeeId) ?? null;
  const crmBase = panel.crmBaseUrl;
  const sessions = data.sessions.data ?? null;
  const filtered = useMemo(() => events ?? [], [events]);

  if (!employee) {
    return (
      <>
        <AppHeader mode={source.mode} panelName={panel.name} viewKey={viewKey} />
        <div className="page-state">
          <EmptyState title="Сотрудника нет в этой панели" hint={<a href={href({ name: "dashboard", viewKey, date: null })}>К панели</a>} />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader mode={source.mode} panelName={panel.name} viewKey={viewKey} />
      <div className="page">
        <div className="crumbs">
          <a href={href({ name: "dashboard", viewKey, date: win.isToday ? null : dayKey })}>
            <Icon name="back" /> К панели
          </a>
        </div>
        <div className="prof-h">
          <Avatar id={employee.id} name={employee.name} />
          <div>
            <h1>{employee.name}</h1>
            <div className="dep">{employee.groupName}</div>
          </div>
          <div className="sp" />
          <DateNav dayKey={dayKey} today={today} sub={win.isToday ? "сегодня" : "сравнение: предыдущий день целиком"} onChange={(d) => navigate({ name: "employee", viewKey, employeeId, date: d === today ? null : d })} />
          {data.events.refreshing && (
            <span className="refreshing">
              <span className="spin" /> обновление
            </span>
          )}
          {data.events.data && <MetaBadges meta={data.events.data.meta} timeZone={tz} />}
        </div>
        {data.events.status === "error" && <ErrorState error={data.events.error} onRetry={data.events.reload} />}
        {data.events.status === "loading" && <Spinner label="Загрузка событий сотрудника…" />}
        {events && (
          <>
            <GeneralInfo
              today={{ events, sessions, dayKey }}
              yesterday={{ events: data.prevEvents.status === "ready" ? prevEvents ?? [] : null, sessions: data.prevSessions.data ?? null, dayKey: data.prev.dayKey }}
              timeZone={tz}
              startMinutes={win.startMinutes}
              endMinutes={win.endMinutes}
              workEndMinutes={win.endMinutes}
              nowUnix={now}
              isToday={win.isToday}
            />
            <EventAnalysis events={filtered} dayKey={dayKey} timeZone={tz} startMinutes={win.startMinutes} endMinutes={win.endMinutes} nowUnix={now} crmBase={crmBase} employeeId={employeeId} />
          </>
        )}
        {data.sessions.status === "error" && <ErrorState error={data.sessions.error} onRetry={data.sessions.reload} compact />}
        {events && (
          <>
            <TotalTime sessions={sessions} events={filtered} dayKey={dayKey} timeZone={tz} nowUnix={now} crmBase={crmBase} employeeId={employeeId} />
            <TaskHistory sessions={sessions} dayKey={dayKey} timeZone={tz} nowUnix={now} startMinutes={win.startMinutes} endMinutes={win.endMinutes} taskPanelEnabled={panel.taskPanelEnabled} />
            <ImboxHistory sessions={sessions} dayKey={dayKey} timeZone={tz} nowUnix={now} startMinutes={win.startMinutes} endMinutes={win.endMinutes} crmBase={crmBase} />
          </>
        )}
      </div>
    </>
  );
}
