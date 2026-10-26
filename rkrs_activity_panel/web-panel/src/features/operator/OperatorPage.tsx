import { useMemo, useState } from "react";
import { AppHeader } from "../../app/AppHeader";
import { usePanelScope } from "../../app/context";
import { useNow, useResource } from "../../app/hooks";
import { href } from "../../app/router";
import { compareWithYesterday, conversionPercent, conversionTone, gaugeMax, remainingTimeLabel, speedColor, type Comparison } from "../../domain/formulas/operator";
import { dayTitle, formatDurationShort, hhmm, todayKey } from "../../domain/time";
import { Icon } from "../../ui/Icon";
import { ErrorState, MetaBadges, NotConnected, Spinner, Switch } from "../../ui/primitives";
import { dayRange, previousDayRange, resolveWindow } from "../dashboard/model";
import { SNAPSHOT_REFRESH_MS } from "../dashboard/useDashboardData";
import { operatorSnapshot } from "./model";

function Gauge({ speed }: { speed: number }) {
  const max = gaugeMax(speed);
  const angle = (Math.min(speed, max) / max) * (max < speed ? 185 : 180);
  const pt = (deg: number, r: number) => ({ x: 100 + r * Math.cos((deg * Math.PI) / 180), y: 100 - r * Math.sin((deg * Math.PI) / 180) });
  const tip = pt(180 - angle, 70);
  const third = Math.round(max / 3);
  const labels = [...new Set(["0", String(Math.max(1, third)), String(Math.max(third + 1, Math.round((max * 2) / 3))), String(max)])];
  return (
    <svg viewBox="0 0 200 130" role="img" aria-label={`Скорость ${speed} звонков в час`}>
      <defs>
        <linearGradient id="gauge-g" x1="0%" x2="100%">
          <stop offset="0%" stopColor="#e74c3c" />
          <stop offset="50%" stopColor="#f39c12" />
          <stop offset="100%" stopColor="#2ecc71" />
        </linearGradient>
      </defs>
      <path d="M 20 100 A 80 80 0 0 1 180 100" stroke="url(#gauge-g)" strokeWidth="16" fill="none" strokeLinecap="round" />
      {labels.map((l, i) => {
        const p = pt(180 - (i * 180) / (labels.length - 1), 52);
        return (
          <text key={l} x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fill="#fff" opacity=".8">
            {l}
          </text>
        );
      })}
      <line x1="100" y1="100" x2={tip.x} y2={tip.y} stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="100" cy="100" r="8" fill="#fff" />
    </svg>
  );
}

function Row({ label, today, cmp }: { label: string; today: number; cmp: Comparison | null | undefined }) {
  return (
    <div className="row">
      <span className="dim">{label}</span>
      <span>
        <b className={cmp?.trend === "up" ? "up" : cmp?.trend === "down" ? "down" : ""}>{today}</b>
        <span className="prev">/ {cmp ? cmp.yesterday : "—"}</span>
        {cmp?.trend === "up" && <span className="up"> ↑</span>}
        {cmp?.trend === "down" && <span className="down"> ↓</span>}
      </span>
    </div>
  );
}

/** План/факт оператора (EmployeeSpeedWidget, type=employee). Всегда за сегодня, обновление раз в 10 минут. */
export function OperatorPage({ employeeId }: { employeeId: number }) {
  const { panel, prefs, source, viewKey } = usePanelScope();
  const now = useNow();
  const tz = panel.timezone;
  const today = todayKey(tz, now * 1000);
  const win = resolveWindow(panel, prefs, today, now);
  const range = useMemo(() => dayRange(win, tz), [win.dayKey, win.startMinutes, win.endMinutes, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => previousDayRange(win, tz), [win.dayKey, win.startMinutes, win.endMinutes, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const [unique, setUnique] = useState(false);
  const employee = panel.employees.find((e) => e.id === employeeId);
  const settings = panel.operators.find((o) => o.employeeId === employeeId);
  const todayRes = useResource(settings ? `op:${employeeId}:${range.from}` : null, (s) => source.loadEmployeeEvents(employeeId, range, s), { refreshMs: SNAPSHOT_REFRESH_MS });
  const prevRes = useResource(settings ? `op-prev:${employeeId}:${prev.from}` : null, (s) => source.loadEmployeeEvents(employeeId, prev, s));

  const header = <AppHeader mode={source.mode} panelName={panel.name} viewKey={viewKey} />;
  const back = (
    <div className="crumbs">
      <a href={href({ name: "dashboard", viewKey, date: null })}>
        <Icon name="back" /> К панели
      </a>
    </div>
  );
  if (!employee || !settings) {
    return (
      <>
        {header}
        <div className="page">
          {back}
          <div className="page-state">
            {panel.meta.source === "amocrm-pro" ? (
              <NotConnected contract="C5" reason="Настройки оператора (план и пороги звонков) не хранятся в amocrm-pro" />
            ) : (
              <div className="state empty">Настройки оператора не найдены в панели</div>
            )}
          </div>
        </div>
      </>
    );
  }
  const s = todayRes.data
    ? operatorSnapshot({ settings, events: todayRes.data.byEmployee.get(employeeId) ?? [], yesterdayEvents: prevRes.status === "ready" ? prevRes.data?.byEmployee.get(employeeId) ?? [] : null, dayKey: today, timeZone: tz, startMinutes: win.startMinutes, endMinutes: win.endMinutes, nowUnix: now, unique })
    : null;
  const y = s?.yesterday ?? null;
  const cr = s ? conversionPercent(s.today.successful, s.today.calls) : 0;
  const max = s ? Math.max(settings.plan, s.actual, s.showForecast ? s.forecast : 0, 100) : 100;
  const bar = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const sinceLast = s?.today.lastCallUnix ? Math.floor((now - s.today.lastCallUnix) / 60) : null;

  return (
    <>
      {header}
      <div className="page">
        {back}
        <div className="sec-h">
          <h2>
            {employee.name} · план/факт · {dayTitle(today)}
          </h2>
          <div className="sp" />
          <Switch checked={unique} onChange={setUnique} label="Учитывать уникальные звонки" />
          {todayRes.data && <MetaBadges meta={todayRes.data.meta} timeZone={tz} />}
        </div>
        {todayRes.status === "error" && <ErrorState error={todayRes.error} onRetry={todayRes.reload} />}
        {!s && todayRes.status !== "error" && <Spinner />}
        {s && (
          <div className="op">
            <div className="card">
              <div className="gauge">
                <Gauge speed={s.today.lastHourCalls} />
                <div style={{ color: speedColor(s.today.lastHourCalls), fontWeight: 600 }}>Скорость работы: {s.today.lastHourCalls} зв./ч</div>
                <div className="dim small" style={{ textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
                  {s.requiredSpeed > 0 && <>Требуемая скорость: {s.requiredSpeed} зв./ч · </>}
                  Осталось до плана: {s.remainingToPlan} зв. · До конца рабочего времени: {remainingTimeLabel(s.remainingHours)}
                  <br />
                  Последний звонок: {s.today.lastCallUnix ? `${hhmm(s.today.lastCallUnix, tz)}${sinceLast !== null ? ` (${sinceLast} мин назад)` : ""}` : "нет данных"}
                </div>
              </div>
              <div className="plan-bars" style={{ marginTop: 14 }}>
                <div className="pb"><span>План</span><span className="tr"><i style={{ width: bar(settings.plan), background: "rgba(255,255,255,.35)" }} /></span><b className="tn">{settings.plan}</b></div>
                <div className="pb"><span>Факт</span><span className="tr"><i style={{ width: bar(s.actual), background: "var(--accent2)" }} /></span><b className="tn">{s.actual}</b></div>
                {s.showForecast && <div className="pb"><span>Прогноз</span><span className="tr"><i style={{ width: bar(s.forecast), background: "#ae88e4" }} /></span><b className="tn">{s.forecast}</b></div>}
              </div>
              <div className="dim small">Выполнено {settings.plan > 0 ? Math.round((s.actual / settings.plan) * 100) : 0}% плана. Прогноз показывается, если за последний час были звонки.</div>
            </div>
            <div className="card op-stats">
              <div className="chips" style={{ marginBottom: 8 }}>
                <span className={`chip ${conversionTone(cr)}`} title="Дозвоны / все звонки × 100%">CR {cr}%</span>
                <span className="chip mut" title="Общая продолжительность дозвонов">{formatDurationShort(s.today.talkSeconds)}</span>
                {s.today.unknownDuration > 0 && <span className="chip warn" title="Звонки без длительности: не классифицированы (C1, F9)">{s.today.unknownDuration} без длительности</span>}
              </div>
              <Row label="Звонков" today={s.today.calls} cmp={y ? compareWithYesterday(s.today.calls, y.calls) : undefined} />
              <Row label={`Дозвоны (≥ ${settings.dialingSeconds} с)`} today={s.today.successful} cmp={y ? compareWithYesterday(s.today.successful, y.successful) : undefined} />
              <Row label={`Разговор (≥ ${settings.conversationSeconds} с)`} today={s.today.conversation} cmp={y ? compareWithYesterday(s.today.conversation, y.conversation) : undefined} />
              <Row label={`Превышение (≥ ${settings.exceedingSeconds} с)`} today={s.today.exceeding} cmp={y ? compareWithYesterday(s.today.exceeding, y.exceeding) : undefined} />
              <div className="dim small" style={{ marginTop: 10 }}>
                «/ N» — вчера до того же времени{prevRes.status === "error" ? " (вчерашние данные не загрузились)" : ""}. Обновляется каждые 10 минут.
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
