import { useMemo } from "react";
import { AppHeader } from "../../app/AppHeader";
import { usePanelScope } from "../../app/context";
import { useNow } from "../../app/hooks";
import { navigate } from "../../app/router";
import { computeMissedCalls } from "../../domain/formulas/missedCalls";
import { addMonths, dayShort, hhmm, minutesToHHMM, minutesOfDay, todayKey, addDays } from "../../domain/time";
import { ErrorState, MetaBadges, NotConnected, Spinner } from "../../ui/primitives";
import { DateNav, PeriodSwitch } from "./DateNav";
import { EmployeeCard } from "./EmployeeCard";
import { GroupSection } from "./GroupSection";
import { HeaderIndicators } from "./HeaderIndicators";
import { buildRows, groupRows, resolveWindow, dayRange } from "./model";
import { PlanFactStrip } from "./PlanFactStrip";
import { Sidebar } from "./Sidebar";
import { useDashboardData } from "./useDashboardData";
import { useExternalSessions } from "./useExternalSessions";

export function DashboardPage({ date }: { date: string | null }) {
  const { panel, prefs, setPrefs, source, viewKey } = usePanelScope();
  const now = useNow();
  const tz = panel.timezone;
  const today = todayKey(tz, now * 1000);
  const min = addMonths(today, -1);
  const dayKey = date && date >= min && date <= today ? date : today;
  const win = useMemo(() => resolveWindow(panel, prefs, dayKey, now), [panel, prefs, dayKey, now]);
  const currentWin = useMemo(() => resolveWindow(panel, prefs, today, now), [panel, prefs, today, now]);
  // Стабильные по ключу окна, чтобы тик часов не перезапускал загрузки.
  const winKey = `${win.dayKey}:${win.startMinutes}:${win.endMinutes}:${win.isToday}`;
  const stableWin = useMemo(() => win, [winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const curKey = `${currentWin.dayKey}:${currentWin.startMinutes}:${currentWin.endMinutes}`;
  const stableCur = useMemo(() => currentWin, [curKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useDashboardData(source, panel, stableWin, now, stableCur);

  const rows = useMemo(() => {
    if (!data.today.data) return null;
    return buildRows({
      panel,
      win,
      today: data.today.data,
      yesterday: data.yesterday.data,
      problems: data.problems.data?.kind === "ok" ? data.problems.data.data : null,
      nowUnix: now,
      cutoffUnix: data.today.data.meta.snapshotAt,
    });
  }, [panel, win, data.today.data, data.yesterday.data, data.problems.data, now]);

  const groups = rows ? groupRows(rows, panel, prefs) : [];
  const visibleIds = groups.flatMap((g) => g.rows.map((r) => r.employee.id));
  const currentEvents = win.isToday ? data.today.data : data.current?.data ?? null;
  const missed = useMemo(() => (currentEvents ? computeMissedCalls(currentEvents.byEmployee, tz) : null), [currentEvents, tz]);
  const showExternal = prefs.showTaskPanelEvents && panel.taskPanelEnabled !== false;
  const external = useExternalSessions(source, panel.employees.map((e) => e.id), dayRange(stableWin, tz), showExternal);

  const nowLabel = win.isToday ? `сегодня · ${hhmm(now, tz)}` : `рабочий день ${minutesToHHMM(win.startMinutes)}–${minutesToHHMM(win.endMinutes)}`;
  const cmpLabel = win.isToday ? (
    <>
      сравнение: <b>{dayShort(addDays(dayKey, -1))}</b> до {minutesToHHMM(Math.min(minutesOfDay(now, tz), win.endMinutes))}
    </>
  ) : (
    <>
      сравнение: <b>{dayShort(addDays(dayKey, -1))}</b>, весь рабочий день
    </>
  );
  const problemsState = data.problems.data;

  return (
    <>
      <AppHeader mode={source.mode} panelName={panel.name} viewKey={viewKey} actions={<HeaderIndicators missed={missed} problems={problemsState} visibleIds={visibleIds} />} />
      <div className="wrap">
        <div className="secrow">
          <div className="sect">Активность по группам</div>
          <PeriodSwitch />
          <DateNav dayKey={dayKey} today={today} sub={nowLabel} onChange={(d) => navigate({ name: "dashboard", viewKey, date: d === today ? null : d })} />
          <div className="cmp" title="Показатели «/ N» — значение предыдущего дня до той же точки">
            {cmpLabel}
            {data.yesterday.status === "error" && <span className="chip bad" title="Вчерашние данные не загрузились, сравнение недоступно">нет данных</span>}
          </div>
          <div className="sp" />
          {data.today.refreshing && (
            <span className="refreshing">
              <span className="spin" /> обновление
            </span>
          )}
          {data.today.data && <MetaBadges meta={data.today.data.meta} timeZone={tz} />}
          {data.today.error !== null && data.today.data && <span className="chip bad" title="Последнее обновление не удалось, показаны прежние данные">обновление не удалось</span>}
        </div>
        <div className={`lay${prefs.sidebarCollapsed ? " collapsed" : ""}`}>
          <Sidebar rows={rows} />
          <button type="button" className="side-open" onClick={() => setPrefs((p) => ({ ...p, sidebarCollapsed: false }))}>
            Сотрудники
          </button>
          <div className="mainc">
            {prefs.showPlanFact && <PlanFactStrip events={currentEvents} yesterday={win.isToday ? data.yesterday.data : null} win={currentWin} nowUnix={now} />}
            {showExternal && external.kind === "unavailable" && (
              <div style={{ marginBottom: 10 }}>
                <NotConnected contract={external.contract} reason={`События панели задач на таймлайне: ${external.reason}`} compact />
              </div>
            )}
            {data.today.status === "error" && <ErrorState error={data.today.error} onRetry={data.today.reload} />}
            {data.today.status === "loading" && <Spinner label="Загрузка событий дня…" />}
            {rows && groups.length === 0 && <div className="state empty">Нет сотрудников для показа: проверьте фильтр отделов и сотрудников.</div>}
            {rows && data.today.data && rows.every((r) => r.events.length === 0) && (
              <div className="state empty" style={{ marginBottom: 10 }}>
                За {win.isToday ? "сегодня" : "этот день"} нет зарегистрированных событий
                {data.today.data.meta.coverage !== "verified" && data.today.data.meta.source !== "fixture" ? " — полнота истории не подтверждена источником" : ""}.
              </div>
            )}
            {groups.map((g, i) => (
              <GroupSection
                key={g.id}
                group={g}
                legend={i === 0}
                renderRow={(row, compact) => {
                  const ext = external.kind === "ready" ? external.byEmployee.get(row.employee.id) : undefined;
                  return (
                    <EmployeeCard
                      key={row.employee.id}
                      row={row}
                      dayKey={dayKey}
                      startMinutes={win.startMinutes}
                      endMinutes={win.endMinutes}
                      isToday={win.isToday}
                      compact={compact}
                      problemsAvailable={problemsState?.kind === "ok"}
                      problemsSynthetic={problemsState?.kind === "ok" && problemsState.data.meta.source === "fixture"}
                      yesterdayLoaded={data.yesterday.status === "ready"}
                      external={ext === "error" ? null : ext}
                      extra={ext === "error" ? <div className="dim small" style={{ marginTop: 4 }}>События панели задач не загрузились</div> : undefined}
                    />
                  );
                }}
              />
            ))}
            {rows && (
              <div className="note">
                Процент — доля 2-минутных отрезков с событием или звонком в рабочем окне {minutesToHHMM(win.startMinutes)}–{minutesToHHMM(win.endMinutes)} ({tz}).
                {win.isToday && " Обновляется каждые 4 минуты до конца рабочего окна."}
                {problemsState?.kind === "ok" && " Проблемные списки — текущий срез, не зависят от даты."}
                {!win.isToday && " Пропущенные звонки и план/факт показаны за сегодня."}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
