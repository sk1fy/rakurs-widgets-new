import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../../app/AppHeader";
import { usePanelScope } from "../../app/context";
import { useNow } from "../../app/hooks";
import { href, navigate } from "../../app/router";
import { avatarSrc } from "../../domain/crmLinks";
import { profileRatingPercent, ratingTheme } from "../../domain/formulas/profileRating";
import { addMonths, todayKey } from "../../domain/time";
import { Icon } from "../../ui/Icon";
import { Avatar, EmptyState, ErrorState, MetaBadges } from "../../ui/primitives";
import { DateNav } from "../dashboard/DateNav";
import { resolveWindow } from "../dashboard/model";
import { DAY_REFRESH_MS } from "../dashboard/useDashboardData";
import { EventAnalysis } from "./EventAnalysis";
import { profilePreview, previewNeeds } from "./previewData";
import { SectionSkeleton } from "./parts";
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
  const [previewEnabled, setPreviewEnabled] = useState(import.meta.env.DEV && source.mode !== "fixtures");
  const sample = useMemo(() => profilePreview(employeeId, dayKey, tz, win.startMinutes, win.endMinutes), [employeeId, dayKey, tz, win.startMinutes, win.endMinutes]);
  const needs = previewNeeds(events, sessions);
  const canPreview = import.meta.env.DEV && source.mode !== "fixtures";
  const preview = {
    analysis: canPreview && previewEnabled && needs.analysis,
    totals: canPreview && previewEnabled && needs.totals,
    tasks: canPreview && previewEnabled && needs.tasks,
    imbox: canPreview && previewEnabled && needs.imbox,
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [employeeId]);
  const rating = useMemo(
    () => (events ? profileRatingPercent({ events, dayKey, timeZone: tz, startMinutes: win.startMinutes, endMinutes: win.endMinutes, nowUnix: now }) : null),
    [events, dayKey, tz, win.startMinutes, win.endMinutes, now],
  );

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
          <Avatar id={employee.id} name={employee.name} url={avatarSrc(employee.avatarUrl, crmBase)} accent={rating === null ? undefined : ratingTheme(rating).accent} />
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
        {canPreview && (
          <div className="banner fixture profile-demo">
            <Icon name="info" />
            <span><b>{previewEnabled ? "Тестовые примеры включены." : "Тестовые примеры выключены."}</b> {previewEnabled ? "Пустые блоки показаны на примере полного дня. Если звонков нет, анализ событий целиком заменяется примером. Это не статистика сотрудника." : "Показаны только данные источника. Можно включить примеры для просмотра пустых блоков."}</span>
            <button className="tool-btn" type="button" onClick={() => setPreviewEnabled((v) => !v)}>{previewEnabled ? "Только реальные данные" : "Показать тестовые примеры"}</button>
          </div>
        )}
        {data.events.status === "error" && <ErrorState error={data.events.error} onRetry={data.events.reload} />}
        {data.events.status === "loading" && (
          <>
            <SectionSkeleton title="Общая информация" tiles={4} rows={0} />
            <SectionSkeleton title="Анализ событий" tiles={0} rows={6} />
          </>
        )}
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
            <EventAnalysis events={preview.analysis ? sample.events : filtered} sessions={preview.analysis ? sample.sessions : sessions} dayKey={dayKey} timeZone={tz} startMinutes={win.startMinutes} endMinutes={win.endMinutes} nowUnix={preview.analysis ? sample.now : now} crmBase={preview.analysis ? null : crmBase} employeeId={employeeId} demo={preview.analysis} />
          </>
        )}
        {data.sessions.status === "error" && <ErrorState error={data.sessions.error} onRetry={data.sessions.reload} compact />}
        {events && data.sessions.status === "loading" && (
          <>
            <SectionSkeleton title="Суммарное время" tiles={0} rows={5} />
            <SectionSkeleton title="История выполненных задач" />
            <SectionSkeleton title="История посещений в Imbox" />
          </>
        )}
        {events && data.sessions.status !== "loading" && (
          <>
            <TotalTime sessions={preview.totals ? sample.sessions : sessions} events={preview.totals ? sample.events : filtered} dayKey={dayKey} timeZone={tz} nowUnix={preview.totals ? sample.now : now} crmBase={preview.totals ? null : crmBase} employeeId={employeeId} taskPanelEnabled={preview.totals ? true : panel.taskPanelEnabled} />
            <TaskHistory sessions={preview.tasks ? sample.sessions : sessions} dayKey={dayKey} timeZone={tz} nowUnix={preview.tasks ? sample.now : now} startMinutes={win.startMinutes} endMinutes={win.endMinutes} taskPanelEnabled={preview.tasks ? true : panel.taskPanelEnabled} />
            <ImboxHistory sessions={preview.imbox ? sample.sessions : sessions} dayKey={dayKey} timeZone={tz} nowUnix={preview.imbox ? sample.now : now} startMinutes={win.startMinutes} endMinutes={win.endMinutes} crmBase={preview.imbox ? null : crmBase} taskPanelEnabled={preview.imbox ? true : panel.taskPanelEnabled} />
          </>
        )}
      </div>
    </>
  );
}
