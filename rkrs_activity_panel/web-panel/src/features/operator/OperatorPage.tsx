import { useMemo, useState } from "react";
import { AppHeader } from "../../app/AppHeader";
import { usePanelScope } from "../../app/context";
import { useNow, useResource } from "../../app/hooks";
import { href } from "../../app/router";
import { compareWithYesterday, conversionPercent, conversionTone, gaugeMax, lastCallLabel, remainingTimeLabel, speedColor, type Comparison } from "../../domain/formulas/operator";
import { dayTitle, formatDurationShort, formatDurationWithSeconds, todayKey } from "../../domain/time";
import { Icon } from "../../ui/Icon";
import { ErrorState, HelpTip, MetaBadges, NotConnected, Spinner, Switch } from "../../ui/primitives";
import { dayRange, previousDayRange, resolveWindow } from "../dashboard/model";
import { SNAPSHOT_REFRESH_MS } from "../dashboard/useDashboardData";
import { operatorSnapshot } from "./model";

const TICK_ANGLES = [180, 120, 60, 0];

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
      {TICK_ANGLES.map((deg) => {
        const a = pt(deg, 70);
        const b = pt(deg, 80);
        return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth="1.5" />;
      })}
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

/** Счётчики окрашены цветом текущей скорости, стрелки — цветом тренда (как в GaugeComponent). */
function Row({ label, today, cmp, color }: { label: string; today: number; cmp: Comparison | null | undefined; color: string }) {
  return (
    <div className="row">
      <span style={{ color }}>{label}</span>
      <span>
        <b style={{ color }}>{today}</b>
        <span className="prev">/ {cmp ? cmp.yesterday : "—"}</span>
        {cmp?.trend === "up" && <span className="up"> ↑</span>}
        {cmp?.trend === "down" && <span className="down"> ↓</span>}
      </span>
    </div>
  );
}

type PaceBar = "actual" | "forecast" | "plan";

/** «Темп выполнения плана»: факт и прогноз на одной шкале, отметка плана; наведение на легенду подсвечивает полосу. */
function PlanPace({ plan, actual, forecast, showForecast }: { plan: number; actual: number; forecast: number; showForecast: boolean }) {
  const [hl, setHl] = useState<PaceBar | null>(null);
  const max = Math.max(plan, actual, showForecast ? forecast : 0, 100);
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const cls = (bar: PaceBar) => (hl === bar ? " hl" : "");
  const legend = (bar: PaceBar, label: string, value: number) => (
    <span className={`pace-lg ${bar}${cls(bar)}`} onMouseEnter={() => setHl(bar)} onMouseLeave={() => setHl(null)}>
      <i />
      {label}: <b className="tn">{value}</b>
    </span>
  );
  return (
    <div className={`pace${hl ? " has-hl" : ""}`}>
      <div className="pace-t">Темп выполнения плана</div>
      <div className="pace-row">
        <div className="pace-bar">
          {showForecast && <span className={`fc${cls("forecast")}`} style={{ width: pos(forecast) }} />}
          <span className={`ac${cls("actual")}`} style={{ width: pos(actual) }} />
          <span className={`pl${cls("plan")}`} style={{ left: pos(plan) }} />
        </div>
        <strong className="pace-pct tn">{plan > 0 ? Math.round((actual / plan) * 100) : 0}%</strong>
      </div>
      <div className="pace-legend">
        {legend("actual", "Факт", actual)}
        {showForecast && legend("forecast", "Прогноз", forecast)}
        {legend("plan", "План", plan)}
      </div>
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
  const lastCall = s?.today.lastCallUnix ? lastCallLabel(s.today.lastCallUnix, now, tz) : "нет данных";
  const speed = s?.today.lastHourCalls ?? 0;
  const color = speedColor(speed);

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
          <HelpTip label="Об уникальных звонках">При включении учитываются только уникальные номера телефонов</HelpTip>
          {todayRes.data && <MetaBadges meta={todayRes.data.meta} timeZone={tz} />}
        </div>
        {todayRes.status === "error" && <ErrorState error={todayRes.error} onRetry={todayRes.reload} />}
        {!s && todayRes.status !== "error" && <Spinner />}
        {s && (
          <div className="op">
            <div className="card">
              <div className="gauge">
                <Gauge speed={speed} />
                <div className="gauge-sub" style={{ color }}>
                  Скорость работы: <b>{speed}</b> зв./ч
                  <HelpTip label="Подробнее о скорости" align="left">
                    <span>Текущая скорость: {speed} зв./ч</span>
                    {s.requiredSpeed > 0 && <span>Требуемая скорость: {s.requiredSpeed} зв./ч</span>}
                    <span>Последний звонок: {lastCall}</span>
                    <span>Осталось до плана: {s.remainingToPlan} зв.</span>
                    <span>До конца рабочего времени: {remainingTimeLabel(s.remainingHours)}</span>
                    {unique && <span className="hint-unique">Учитываются уникальные номера: {s.today.calls}</span>}
                  </HelpTip>
                </div>
                <div className="dim small" style={{ textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
                  {s.requiredSpeed > 0 && <>Требуемая скорость: {s.requiredSpeed} зв./ч · </>}
                  Осталось до плана: {s.remainingToPlan} зв. · До конца рабочего времени: {remainingTimeLabel(s.remainingHours)}
                  <br />
                  Последний звонок: {lastCall}
                </div>
              </div>
              <PlanPace plan={settings.plan} actual={s.actual} forecast={s.forecast} showForecast={s.showForecast} />
              <div className="dim small">Прогноз показывается, если за последний час были звонки.</div>
            </div>
            <div className="card op-stats">
              <div className="chips" style={{ marginBottom: 8 }}>
                <span className={`chip ${conversionTone(cr)}`}>
                  CR {cr}%
                  <HelpTip label="Что такое CR" align="left">CR - показывает, какой процент звонков завершился успешным дозвоном (Дозвоны / Все звонки × 100%)</HelpTip>
                </span>
                <span className="chip mut">
                  {s.today.talkSeconds < 3600 ? formatDurationWithSeconds(s.today.talkSeconds) : formatDurationShort(s.today.talkSeconds)}
                  <HelpTip label="Что считается временем разговоров" align="left">Общая продолжительность исходящих звонков</HelpTip>
                </span>
                {s.today.unknownDuration > 0 && <span className="chip warn" title="Звонки без длительности: не классифицированы (C1, F9)">{s.today.unknownDuration} без длительности</span>}
              </div>
              <Row label="Звонков" today={s.today.calls} cmp={y ? compareWithYesterday(s.today.calls, y.calls) : undefined} color={color} />
              <Row label={`Дозвоны (≥ ${settings.dialingSeconds} с)`} today={s.today.successful} cmp={y ? compareWithYesterday(s.today.successful, y.successful) : undefined} color={color} />
              <Row label={`Разговор (≥ ${settings.conversationSeconds} с)`} today={s.today.conversation} cmp={y ? compareWithYesterday(s.today.conversation, y.conversation) : undefined} color={color} />
              <Row label={`Превышение (≥ ${settings.exceedingSeconds} с)`} today={s.today.exceeding} cmp={y ? compareWithYesterday(s.today.exceeding, y.exceeding) : undefined} color={color} />
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
