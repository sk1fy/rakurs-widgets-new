// Экран «Неделя»/«Месяц» (period-v1). Шапка, боковая панель, выбор
// сотрудников и рабочее окно — общие с дневным экраном.

import { useMemo } from "react";
import { AppHeader } from "../../app/AppHeader";
import { usePanelScope } from "../../app/context";
import { useNow } from "../../app/hooks";
import { navigate } from "../../app/router";
import { defaultHistoryFrom, periodTitle, previousPeriod, ratingPercent, weekdayShort, type PeriodKind, type PeriodStats } from "../../domain/period";
import { hhmm, minutesToHHMM, todayKey, zoned } from "../../domain/time";
import { Icon } from "../../ui/Icon";
import { LoadingFeedback } from "../../ui/LoadingFeedback";
import { ErrorState, MetaBadges } from "../../ui/primitives";
import { PeriodSwitch } from "../dashboard/DateNav";
import { resolveWindow } from "../dashboard/model";
import { Sidebar } from "../dashboard/Sidebar";
import { hasPendingDays, hasUnavailableDays, periodMeta, periodNav, periodRouteDate, resolvePeriod, selectedEmployees } from "./model";
import { DynamicsCard, EmployeeBarsCard, HourMatrixCard, TotalsCard } from "./PeriodBlocks";
import { PERIOD_REFRESH_MS, usePeriodStats } from "./usePeriodData";
import { WorkdaysSection } from "./Workdays";

function compareText(stats: PeriodStats | null, prevTitle: string) {
  if (!stats) return <>сравнение: <b>{prevTitle}</b></>;
  if (!stats.previous.available) {
    return <span title="Сырые события хранятся 33 дня: прошлый период доступен, только если все его дни в пределах этого срока">нет прошлого периода</span>;
  }
  return <>сравнение: <b>{prevTitle}</b>{stats.previous.cut ? " до той же точки" : ", весь период"}</>;
}

export function PeriodPage({ kind, date }: { kind: PeriodKind; date: string | null }) {
  const { panel, panelRefreshing, prefs, setPrefs, source, viewKey } = usePanelScope();
  const now = useNow();
  const tz = panel.timezone;
  const today = todayKey(tz, now * 1000);
  const period = useMemo(() => resolvePeriod(kind, date, today), [kind, date, today]);
  const win = useMemo(() => resolveWindow(panel, prefs, today, now), [panel, prefs, today, now]);
  const winKey = `${win.startMinutes}:${win.endMinutes}`;
  const stableWin = useMemo(() => win, [winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const nav = periodNav(period, today, defaultHistoryFrom(today));
  const stats = usePeriodStats(source, panel, period, stableWin, nav.isCurrent);
  const data = stats.data;
  const historyFrom = data?.historyFrom ?? defaultHistoryFrom(today);
  const { prev, next, isCurrent } = periodNav(period, today, historyFrom);
  const employees = useMemo(() => selectedEmployees(panel, prefs), [panel, prefs]);
  const ratings = useMemo(() => (data ? new Map([...data.byEmployee].map(([id, e]) => [id, ratingPercent(e.current.rating)])) : null), [data]);
  const go = (to: { kind?: PeriodKind; date: string | null }) => navigate({ name: "dashboard", viewKey, date: to.date, period: to.kind ?? kind });
  const cutoff = data ? zoned(data.cutoffUnix, tz) : null;
  const sub = isCurrent
    ? `текущий период${cutoff ? ` · сейчас ${weekdayShort(cutoff.dayKey)} ${hhmm(data?.cutoffUnix ?? now, tz)}` : ""}`
    : `рабочее окно ${minutesToHHMM(win.startMinutes)}–${minutesToHHMM(win.endMinutes)}`;
  const empty = data && employees.length > 0 && employees.every((e) => (data.byEmployee.get(e.id)?.current.days ?? []).every((d) => d.events === 0 && d.first === null));

  return (
    <>
      <AppHeader mode={source.mode} panelName={panel.name} viewKey={viewKey} />
      <div className="wrap">
        <div className="secrow">
          <div className="sect">Статистика отдела · {kind === "week" ? "неделя" : "месяц"}</div>
          <PeriodSwitch value={kind} onChange={(view) => (view === "day" ? navigate({ name: "dashboard", viewKey, date: isCurrent ? null : period.start }) : go({ kind: view, date: isCurrent ? null : period.start }))} />
          <div className="pnav">
            <button type="button" className="nb" aria-label={kind === "week" ? "Предыдущая неделя" : "Предыдущий месяц"} disabled={!prev} title={prev ? undefined : "Раньше истории (33 дня) данных нет"} onClick={() => prev && go({ date: periodRouteDate(prev, today) })}>
              <Icon name="left" size={16} />
            </button>
            <div className="lbl">
              {periodTitle(period)}
              <span className="sub">{sub}</span>
            </div>
            <button type="button" className="nb" aria-label={kind === "week" ? "Следующая неделя" : "Следующий месяц"} disabled={!next} onClick={() => next && go({ date: periodRouteDate(next, today) })}>
              <Icon name="right" size={16} />
            </button>
          </div>
          <div className="cmp">{compareText(data, periodTitle(previousPeriod(period)))}</div>
          <div className="sp" />
          {data && <MetaBadges meta={periodMeta(data)} timeZone={tz} />}
          {stats.error !== null && data && <span className="chip bad" title="Последнее обновление не удалось, показаны прежние данные">обновление не удалось</span>}
        </div>
        <div className={`lay${prefs.sidebarCollapsed ? " collapsed" : ""}`}>
          <Sidebar rows={null} ratings={ratings} />
          <button type="button" className="side-open" onClick={() => setPrefs((p) => ({ ...p, sidebarCollapsed: false }))}>
            Сотрудники
          </button>
          <div className="mainc data-region pv">
            <LoadingFeedback loading={stats.status === "loading"} refreshing={panelRefreshing || stats.refreshing} />
            {stats.status === "error" && <ErrorState error={stats.error} onRetry={stats.reload} />}
            {data && employees.length === 0 && <div className="state empty">Никто не выбран — отметьте сотрудников слева.</div>}
            {data && hasPendingDays(data) && <div className="banner">Часть дней ещё считается — данные обновятся автоматически.</div>}
            {data?.partial && <div className="banner">Часть дней посчитана по неполной выборке событий (предел загрузки): такие дни отмечены «неполные».</div>}
            {data && hasUnavailableDays(data) && <div className="banner">Дни раньше {data.historyFrom.split("-").reverse().join(".")} недоступны: история событий хранится 33 дня.</div>}
            {empty && <div className="state empty" style={{ marginBottom: 10 }}>За выбранный период нет зарегистрированных событий.</div>}
            {data && employees.length > 0 && (
              <>
                <TotalsCard stats={data} employees={employees} />
                <HourMatrixCard stats={data} employees={employees} />
                <EmployeeBarsCard stats={data} employees={employees} />
                <div className="pv-g2">
                  <DynamicsCard stats={data} employees={employees} today={today} metric="outgoingCalls" title="Динамика по звонкам" color="var(--tl-call)" />
                  <DynamicsCard stats={data} employees={employees} today={today} metric="completedTasks" title="Динамика по закрытым задачам" color="var(--tl-crm)" />
                </div>
                <WorkdaysSection key={`${data.current.start}:${data.startMinutes}:${data.endMinutes}`} stats={data} employees={employees} today={today} />
              </>
            )}
            {data && (
              <div className="note">
                Рейтинг периода — сумма активных минут, делённая на сумму прошедших минут окна {minutesToHHMM(data.startMinutes)}–{minutesToHHMM(data.endMinutes)} ({data.timeZone}) по учтённым дням: будни учитываются всегда, выходные — только с активностью. Отрезки по 2 минуты, как на дневном экране.
                {isCurrent && ` Текущий период обновляется каждые ${Math.round(PERIOD_REFRESH_MS / 1000)} секунд.`}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

