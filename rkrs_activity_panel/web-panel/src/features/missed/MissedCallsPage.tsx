import { useMemo } from "react";
import { AppHeader } from "../../app/AppHeader";
import { usePanelScope } from "../../app/context";
import { useNow, useResource } from "../../app/hooks";
import { href } from "../../app/router";
import { computeMissedCalls } from "../../domain/formulas/missedCalls";
import { todayKey, dayTitle } from "../../domain/time";
import { Icon } from "../../ui/Icon";
import { ErrorState, MetaBadges, Spinner } from "../../ui/primitives";
import { dayRange, resolveWindow } from "../dashboard/model";
import { SNAPSHOT_REFRESH_MS } from "../dashboard/useDashboardData";
import { MissedCallsList } from "./MissedCallsList";

/** Пропущенные звонки за сегодня (MissedCallsWidget): обновление раз в 10 минут. */
export function MissedCallsPage() {
  const { panel, prefs, source, viewKey } = usePanelScope();
  const now = useNow();
  const today = todayKey(panel.timezone, now * 1000);
  const range = useMemo(() => dayRange(resolveWindow(panel, prefs, today, now), panel.timezone), [panel, prefs, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useResource(`missed:${range.from}:${range.to}`, (signal) => source.loadDayEvents(range, signal), { refreshMs: SNAPSHOT_REFRESH_MS });
  const result = useMemo(() => (res.data ? computeMissedCalls(res.data.byEmployee, panel.timezone) : null), [res.data, panel.timezone]);
  return (
    <>
      <AppHeader mode={source.mode} panelName={panel.name} viewKey={viewKey} />
      <div className="page">
        <div className="crumbs">
          <a href={href({ name: "dashboard", viewKey, date: null })}>
            <Icon name="back" /> К панели
          </a>
        </div>
        <div className="sec-h">
          <h2>Пропущенные звонки · {dayTitle(today)}</h2>
          <div className="sp" />
          {res.data && <MetaBadges meta={res.data.meta} timeZone={panel.timezone} />}
        </div>
        <div className="card pop" style={{ position: "static", maxWidth: "none", maxHeight: "none", boxShadow: "none" }}>
          {res.status === "error" && <ErrorState error={res.error} onRetry={res.reload} />}
          {!result && res.status !== "error" && <Spinner />}
          {result && <MissedCallsList result={result} />}
        </div>
        <div className="note">Пропущенный — входящий с нулевой длительностью, если после него на этот номер не было исходящего или принятого входящего. Обновляется каждые 10 минут.</div>
      </div>
    </>
  );
}
