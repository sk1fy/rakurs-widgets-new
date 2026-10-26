import { usePanelScope } from "../../app/context";
import { entityLink, phoneSearchLink } from "../../domain/crmLinks";
import type { MissedCallsResult } from "../../domain/formulas/missedCalls";
import { plural } from "../../domain/plural";
import { dayDotted, hhmm, zoned } from "../../domain/time";

/** «Обновлено: 24.09.2026, 15:10» (MissedCallsDropdown). */
export function updatedLabel(unix: number, timeZone: string): string {
  return `Обновлено: ${dayDotted(zoned(unix, timeZone).dayKey)}, ${hhmm(unix, timeZone)}`;
}

export function MissedCallsList({ result, limit }: { result: MissedCallsResult; limit?: number }) {
  const { panel } = usePanelScope();
  const names = new Map(panel.employees.map((e) => [e.id, e.name]));
  const items = limit ? result.items.slice(0, limit) : result.items;
  if (!result.items.length) {
    return (
      <div className="dim small">
        Пропущенных без перезвона нет.
        {result.unknownDurationIncoming > 0 && <> У {result.unknownDurationIncoming} входящих нет длительности — их нельзя проверить (C1).</>}
      </div>
    );
  }
  return (
    <div>
      {items.map((m) => {
        const search = phoneSearchLink(panel.crmBaseUrl, m.phone);
        const entity = entityLink(panel.crmBaseUrl, m.entityType, m.entityId);
        return (
          <div className={`row mc${m.count > 1 ? " multi" : ""}`} key={m.normalizedPhone}>
            <div>
              <div>
                {search ? (
                  <a className="mc-phone" href={search} target="_blank" rel="noreferrer noopener">
                    {m.displayPhone}
                  </a>
                ) : (
                  <span className="mc-phone">{m.displayPhone}</span>
                )}
                {entity && (
                  <>
                    {" · "}
                    <a href={entity} target="_blank" rel="noreferrer noopener">
                      карточка
                    </a>
                  </>
                )}
              </div>
              <div className="dim small">{m.employeeIds.map((id) => names.get(id) ?? `#${id}`).join(", ")}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <b>{m.count > 1 ? `${m.count} ${plural(m.count, "раз", "раза", "раз")}` : m.firstCallTime}</b>
              {m.count > 1 && <div className="mc-times dim small">{m.callTimes.join(", ")}</div>}
            </div>
          </div>
        );
      })}
      {result.unknownDurationIncoming > 0 && (
        <div className="dim small" style={{ marginTop: 8 }}>
          Ещё {result.unknownDurationIncoming} входящих без длительности не проверены (C1).
        </div>
      )}
    </div>
  );
}
