import { useMemo, useState } from "react";
import { entityLink, eventsListLink, phoneSearchLink } from "../../domain/crmLinks";
import { CATEGORY_META, type EventCategory } from "../../domain/eventCatalog";
import { analyzeEvents, CALL_DIRECTION_LABEL, correctnessColor, uniqueCalls } from "../../domain/formulas/eventAnalysis";
import { phoneDisplay } from "../../domain/phone";
import { formatCallDuration, formatMinutes, hhmm, minutesToHHMM } from "../../domain/time";
import type { CrmEvent } from "../../domain/types";
import { Switch } from "../../ui/primitives";

/** «Анализ событий» (EmployeeActivitiesSectionV3): 2-минутные корзины, простой, категории, задачи, звонки. */
export function EventAnalysis({ events, dayKey, timeZone, startMinutes, endMinutes, nowUnix, crmBase, employeeId }: { events: CrmEvent[]; dayKey: string; timeZone: string; startMinutes: number; endMinutes: number; nowUnix: number; crmBase: string | null; employeeId: number }) {
  const a = useMemo(() => analyzeEvents({ events, dayKey, timeZone, startMinutes, endMinutes, nowUnix }), [events, dayKey, timeZone, startMinutes, endMinutes, nowUnix]);
  const [unique, setUnique] = useState(false);
  const calls = unique ? uniqueCalls(a.calls) : a.calls;
  const unknown = a.calls.filter((c) => !c.durationKnown).length;
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>Анализ событий</h2>
        <span className="dim small">
          {minutesToHHMM(startMinutes)}–{minutesToHHMM(endMinutes)} · первое {a.firstEventUnix ? hhmm(a.firstEventUnix, timeZone) : "--:--"} · последнее {a.lastEventUnix ? hhmm(a.lastEventUnix, timeZone) : "--:--"}
        </span>
        <div className="sp" />
        {eventsListLink(crmBase, employeeId, dayKey) && (
          <a className="small" href={eventsListLink(crmBase, employeeId, dayKey) as string} target="_blank" rel="noreferrer noopener">
            события в amoCRM
          </a>
        )}
      </div>
      <div className="card">
        <div className="ch">
          <div>
            <h3>Активность по 2 минуты</h3>
            <div className="sub">
              Событий в окне: <b>{a.events.length}</b> · простой (пустые прошедшие отрезки): <b>{formatMinutes(a.idleMinutes)}</b>
            </div>
          </div>
        </div>
        <div className="hist" aria-label="Количество событий по 2-минутным отрезкам">
          {a.bins.map((b) => {
            const future = b.endMinutes > a.visibleEndMinutes;
            const h = b.events.length ? Math.max(6, (b.events.length / a.maxBinCount) * 100) : 0;
            return <i key={b.index} className={future ? "fut" : b.events.length ? "" : "idle"} style={{ height: future ? "100%" : b.events.length ? `${h}%` : undefined }} title={`${minutesToHHMM(b.startMinutes)}–${minutesToHHMM(b.endMinutes)}: ${b.events.length}`} />;
          })}
        </div>
        <div className="axis small" style={{ position: "relative" }}>
          {Array.from({ length: Math.floor((endMinutes - startMinutes) / 60) + 1 }, (_, i) => startMinutes + i * 60)
            .filter((m) => m < endMinutes)
            .map((m) => (
              <span key={m} style={{ left: `${((m - startMinutes) / (endMinutes - startMinutes)) * 100}%` }}>
                {minutesToHHMM(m)}
              </span>
            ))}
        </div>
      </div>
      <div className="cat-row" style={{ marginBottom: 16 }}>
        {(Object.keys(CATEGORY_META) as EventCategory[]).map((k) => (
          <div key={k} className="cat" style={{ borderLeftColor: CATEGORY_META[k].color }} title={CATEGORY_META[k].description}>
            <div className="v">{a.categoryCounts[k]}</div>
            <div className="k">{CATEGORY_META[k].label}</div>
          </div>
        ))}
      </div>
      <div className="g3">
        <div className="card">
          <h3>События по типам</h3>
          <div className="sub">Без событий задач</div>
          <div className="bars">
            {a.typeCounts.length === 0 && <div className="dim small">Нет событий</div>}
            {a.typeCounts.map((t) => (
              <div className="br" key={t.key}>
                <span className="lb">{t.label}</span>
                <span className="vl">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Задачи</h3>
          <div className="sub">
            Корректность: <b style={{ color: correctnessColor(a.correctnessPercent) }}>{a.correctnessPercent}%</b> — доля завершённых задач с результатом
          </div>
          <div className="bars">
            {a.taskCounts.map((t) => (
              <div className="br" key={t.key}>
                <span className="lb">{t.label}</span>
                <span className="vl">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="ch">
            <div>
              <h3>Звонки</h3>
              <div className="sub">
                {calls.length} {unique ? "уникальных" : "всего"}
                {unknown > 0 && ` · ${unknown} без длительности (C1)`}
              </div>
            </div>
            <Switch checked={unique} onChange={setUnique} label="уникальные" />
          </div>
          <div className="bars" style={{ maxHeight: 320, overflow: "auto" }}>
            {calls.length === 0 && <div className="dim small">Звонков нет</div>}
            {calls.map((c) => {
              const phone = c.event.call?.phone ?? null;
              const link = phone ? phoneSearchLink(crmBase, phone) : null;
              const card = entityLink(crmBase, c.event.call?.entityType, c.event.call?.entityId);
              return (
                <div className="br" key={c.event.id}>
                  <span className="lb">
                    {hhmm(c.event.createdAt, timeZone)} · {CALL_DIRECTION_LABEL[c.direction]}
                    {phone && (
                      <>
                        {" · "}
                        {link ? <a href={link} target="_blank" rel="noreferrer noopener">{phoneDisplay(phone)}</a> : phoneDisplay(phone)}
                      </>
                    )}
                    {card && (
                      <>
                        {" · "}
                        <a href={card} target="_blank" rel="noreferrer noopener">карточка</a>
                      </>
                    )}
                  </span>
                  <span className="vl">{c.durationKnown ? formatCallDuration(c.displaySeconds) : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
