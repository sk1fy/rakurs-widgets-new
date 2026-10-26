import { usePanelScope } from "../../app/context";
import { href } from "../../app/router";
import type { Sourced } from "../../api/source";
import type { MissedCallsResult } from "../../domain/formulas/missedCalls";
import { leadsTaskFilterLink } from "../../domain/crmLinks";
import { hhmm } from "../../domain/time";
import type { ProblemCount, ProblemLists } from "../../domain/types";
import { Icon } from "../../ui/Icon";
import { NotConnected, Popover } from "../../ui/primitives";
import { MissedCallsList } from "../missed/MissedCallsList";

function ProblemPopover({ title, dot, rows, link, snapshotAt, synthetic }: { title: string; dot: "y" | "r"; rows: ProblemCount[]; link: string | null; snapshotAt: number; synthetic: boolean }) {
  const { panel } = usePanelScope();
  const total = rows.reduce((s, r) => s + r.count, 0);
  const names = new Map(panel.employees.map((e) => [e.id, e.name]));
  return (
    <Popover
      align="right"
      label={title}
      trigger={() => (
        <span className="hic" title={title}>
          <Icon name="dollar" />
          <i className={`dot ${dot}`} />
          {total > 0 && <span className="cnt">{total}</span>}
        </span>
      )}
    >
      <h4>
        <span>{title}</span>
        {synthetic && <span className="chip warn">синтетика</span>}
      </h4>
      {/* F6: это текущий срез CRM, а не значение на выбранную дату */}
      <div className="dim small" style={{ marginBottom: 8 }}>
        Текущий срез на {hhmm(snapshotAt, panel.timezone)}, не зависит от выбранной даты.
      </div>
      {rows
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((r) => (
          <div className="row" key={r.managerId}>
            <span>{names.get(r.managerId) ?? `#${r.managerId}`}</span>
            {r.filterLink ? (
              <a href={r.filterLink} target="_blank" rel="noreferrer noopener">
                {r.count}
              </a>
            ) : (
              <b>{r.count}</b>
            )}
          </div>
        ))}
      {total === 0 && <div className="dim small">Нет</div>}
      {link && (
        <div style={{ marginTop: 8 }}>
          <a href={link} target="_blank" rel="noreferrer noopener">
            Открыть список в amoCRM
          </a>
        </div>
      )}
    </Popover>
  );
}

export function HeaderIndicators({ missed, problems, visibleIds }: { missed: MissedCallsResult | null; problems: Sourced<ProblemLists> | null; visibleIds: number[] }) {
  const { panel, prefs, viewKey } = usePanelScope();
  const n = prefs.notifications;
  const visible = new Set(visibleIds);
  const pick = (list: ProblemCount[]) => list.filter((r) => visible.has(r.managerId));
  return (
    <>
      {n.missedCalls && (
        <Popover
          align="right"
          label="Пропущенные звонки"
          trigger={() => (
            <span className={`hic${missed?.items.length ? " red" : ""}`} title="Пропущенные звонки за сегодня">
              <Icon name="phoneIn" />
              {missed && missed.items.length > 0 && <span className="cnt">{missed.items.length}</span>}
            </span>
          )}
        >
          <h4>
            <span>Пропущенные сегодня</span>
            <a href={href({ name: "missed", viewKey })}>все</a>
          </h4>
          {missed ? <MissedCallsList result={missed} limit={8} /> : <div className="dim small">Загрузка…</div>}
        </Popover>
      )}
      {(n.leadsNoTasks || n.leadsFailedTasks) && problems?.kind === "unavailable" && (
        <Popover align="right" label="Проблемные списки" trigger={() => <span className="hic" title="Проблемные списки не подключены"><Icon name="dollar" /></span>}>
          <NotConnected contract={problems.contract} reason={problems.reason} compact />
        </Popover>
      )}
      {problems?.kind === "ok" && n.leadsNoTasks && (
        <ProblemPopover title="Сделки без задач" dot="y" rows={pick(problems.data.leadsNoTasks)} link={leadsTaskFilterLink(panel.crmBaseUrl, "no_tasks", visibleIds)} snapshotAt={problems.data.meta.snapshotAt} synthetic={problems.data.meta.source === "fixture"} />
      )}
      {problems?.kind === "ok" && n.leadsFailedTasks && (
        <ProblemPopover title="Сделки с просроченными задачами" dot="r" rows={pick(problems.data.leadsWithFailedTasks)} link={leadsTaskFilterLink(panel.crmBaseUrl, "failed_tasks", visibleIds)} snapshotAt={problems.data.meta.snapshotAt} synthetic={problems.data.meta.source === "fixture"} />
      )}
    </>
  );
}
