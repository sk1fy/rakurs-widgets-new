import { usePanelScope } from "../../app/context";
import { entityLink, phoneSearchLink } from "../../domain/crmLinks";
import type { MissedCallsResult } from "../../domain/formulas/missedCalls";

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
          <div className="row" key={m.normalizedPhone}>
            <div>
              <div>
                {search ? (
                  <a href={search} target="_blank" rel="noreferrer noopener">
                    {m.displayPhone}
                  </a>
                ) : (
                  m.displayPhone
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
              <b>{m.count > 1 ? `${m.count} раза` : m.firstCallTime}</b>
              {m.count > 1 && <div className="dim small">{m.callTimes.join(", ")}</div>}
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
