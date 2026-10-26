import { useCallback, useEffect, useRef, useState } from "react";
import { usePanelScope } from "../../app/context";
import { href } from "../../app/router";
import { speedColor } from "../../domain/formulas/operator";
import type { DayEvents, EmployeeId } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { NotConnected } from "../../ui/primitives";
import { operatorSnapshot } from "../operator/model";
import type { DayWindow } from "./model";

/** Шаг прокрутки кнопками ← →, как в старой карусели. */
const SCROLL_STEP = 450;

/** Карусель план/факт операторов — всегда «сегодня» (F5), по настройкам операторов панели (C5). */
export function PlanFactStrip({ events, yesterday, win, nowUnix, percentById }: { events: DayEvents | null; yesterday: DayEvents | null; win: DayWindow; nowUnix: number; percentById: Map<EmployeeId, number | null> }) {
  const { panel, viewKey } = usePanelScope();
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  // Как в старой карусели: операторы по % активности, по убыванию.
  const operators = panel.operators.filter((o) => o.enabled).sort((a, b) => (percentById.get(b.employeeId) ?? -1) - (percentById.get(a.employeeId) ?? -1));
  const updateEdges = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 0, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges, operators.length]);
  const scroll = (dir: -1 | 1) => stripRef.current?.scrollBy({ left: dir * SCROLL_STEP, behavior: "smooth" });
  if (!operators.length) {
    return panel.meta.source === "amocrm-pro" ? (
      <div style={{ marginBottom: 10 }}>
        <NotConnected contract="C5" reason="План/факт операторов: настройки операторов (план, пороги) не хранятся в amocrm-pro" compact />
      </div>
    ) : null;
  }
  const names = new Map(panel.employees.map((e) => [e.id, e.name]));
  return (
    <div className="pf">
      <div className="pf-h">
        <span className="pf-title">План / факт по операторам ({operators.length})</span>
        {(edges.left || edges.right) && (
          <span className="pf-nav">
            <button type="button" className="ti" aria-label="Прокрутить влево" disabled={!edges.left} onClick={() => scroll(-1)}>
              <Icon name="left" />
            </button>
            <button type="button" className="ti" aria-label="Прокрутить вправо" disabled={!edges.right} onClick={() => scroll(1)}>
              <Icon name="right" />
            </button>
          </span>
        )}
      </div>
      <div className="pf-strip" ref={stripRef} onScroll={updateEdges} aria-label="План/факт операторов за сегодня">
        {operators.map((op) => {
          const s = events
            ? operatorSnapshot({ settings: op, events: events.byEmployee.get(op.employeeId) ?? [], yesterdayEvents: yesterday?.byEmployee.get(op.employeeId) ?? null, dayKey: win.dayKey, timeZone: panel.timezone, startMinutes: win.startMinutes, endMinutes: win.endMinutes, nowUnix, unique: false })
            : null;
          const max = s ? Math.max(op.plan, s.actual, s.showForecast ? s.forecast : 0, 1) : 1;
          return (
            <a key={op.employeeId} className="pf-card" href={href({ name: "operator", viewKey, employeeId: op.employeeId })}>
              <div className="nm">
                <span>{names.get(op.employeeId) ?? `#${op.employeeId}`}</span>
                <span style={{ color: s ? speedColor(s.today.lastHourCalls) : undefined }}>{s ? `${s.today.lastHourCalls} зв./ч` : "—"}</span>
              </div>
              <div className="pf-bar">
                {s?.showForecast && <i className="f" style={{ width: `${(s.forecast / max) * 100}%` }} />}
                <i className="a" style={{ width: `${((s?.actual ?? 0) / max) * 100}%` }} />
              </div>
              <div className="dim small">
                факт <b style={{ color: "#fff" }}>{s?.actual ?? "—"}</b> из {op.plan}
                {s?.showForecast && <> · прогноз {s.forecast}</>}
                {s && s.today.unknownDuration > 0 && <> · {s.today.unknownDuration} без длительности</>}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
