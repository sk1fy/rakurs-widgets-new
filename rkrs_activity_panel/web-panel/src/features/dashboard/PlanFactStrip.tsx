import { usePanelScope } from "../../app/context";
import { href } from "../../app/router";
import { speedColor } from "../../domain/formulas/operator";
import type { DayEvents } from "../../domain/types";
import { NotConnected } from "../../ui/primitives";
import { operatorSnapshot } from "../operator/model";
import type { DayWindow } from "./model";

/** Карусель план/факт операторов — всегда «сегодня» (F5), по настройкам операторов панели (C5). */
export function PlanFactStrip({ events, yesterday, win, nowUnix }: { events: DayEvents | null; yesterday: DayEvents | null; win: DayWindow; nowUnix: number }) {
  const { panel, viewKey } = usePanelScope();
  const operators = panel.operators.filter((o) => o.enabled);
  if (!operators.length) {
    return panel.meta.source === "amocrm-pro" ? (
      <div style={{ marginBottom: 10 }}>
        <NotConnected contract="C5" reason="План/факт операторов: настройки операторов (план, пороги) не хранятся в amocrm-pro" compact />
      </div>
    ) : null;
  }
  const names = new Map(panel.employees.map((e) => [e.id, e.name]));
  return (
    <div className="pf-strip" aria-label="План/факт операторов за сегодня">
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
  );
}
