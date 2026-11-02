import { useMemo } from "react";
import { AppHeader } from "../../app/AppHeader";
import { usePanelScope } from "../../app/context";
import { ACTIVE_REFRESH_MS, useNow, useResource } from "../../app/hooks";
import { href } from "../../app/router";
import { computeMissedCalls } from "../../domain/formulas/missedCalls";
import { todayKey, dayTitle } from "../../domain/time";
import { LoadingFeedback } from "../../ui/LoadingFeedback";
import { Icon } from "../../ui/Icon";
import { ErrorState, MetaBadges } from "../../ui/primitives";
import { dayRange, resolveWindow } from "../dashboard/model";
import { MissedCallsList } from "./MissedCallsList";

export function MissedCallsPage() {
  const { panel, panelRefreshing, prefs, source, viewKey } = usePanelScope();
  const now = useNow();
  const today = todayKey(panel.timezone, now * 1000);
  const range = useMemo(() => dayRange(resolveWindow(panel, prefs, today, now), panel.timezone), [panel, prefs, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useResource(`missed:${range.from}:${range.to}`, (signal) => source.loadDayEvents(range, signal), { refreshMs: ACTIVE_REFRESH_MS });
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
          <h2>
            Пропущенные звонки{result ? ` (${result.items.length})` : ""} · {dayTitle(today)}
          </h2>
          <div className="sp" />
          {res.data && <MetaBadges meta={res.data.meta} timeZone={panel.timezone} />}
        </div>
        <div className="card pop data-region" style={{ position: "relative", maxWidth: "none", maxHeight: "none", boxShadow: "none" }}>
          <LoadingFeedback loading={res.status === "loading"} refreshing={panelRefreshing || res.refreshing} />
          {res.error !== null && <ErrorState error={res.error} onRetry={res.reload} />}
          {res.error !== null && res.data !== null && <div className="banner">Последнее обновление не удалось. Показаны ранее загруженные данные.</div>}
          {result && <MissedCallsList result={result} />}
        </div>
        <div className="note">Пропущенный — входящий с нулевой длительностью, если после него на этот номер не было исходящего или принятого входящего. Обновляется каждые 90 секунд.</div>
      </div>
    </>
  );
}
