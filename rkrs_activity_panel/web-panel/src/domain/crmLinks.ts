// Ссылки в amoCRM. Базовый адрес приходит от источника (контракт C2);
// без него ссылки не строятся. Фильтр group_id из старых ссылок статистики
// звонков содержал ID конкретного аккаунта и не переносится.

import { AMO_EVENT_TYPE_IDS, matchEventType } from "./eventCatalog";
import { dayDotted } from "./time";
import { phoneDisplay } from "./phone";
import type { EmployeeId } from "./types";

export type CrmBase = string | null;

const ENTITY_PATH: Record<string, string> = {
  lead: "leads", leads: "leads", contact: "contacts", contacts: "contacts",
  company: "companies", companies: "companies", customer: "customers", customers: "customers",
};

export function entityPath(entityType: string | null | undefined): string | null {
  return ENTITY_PATH[String(entityType ?? "").toLowerCase()] ?? null;
}

export function entityLink(base: CrmBase, entityType: string | null | undefined, entityId: number | null | undefined): string | null {
  const path = entityPath(entityType);
  if (!base || !path || !entityId) return null;
  return `${base}/${path}/detail/${entityId}`;
}

/** Список событий сотрудника за день, при наличии — по типу события. */
export function eventsListLink(base: CrmBase, employeeId: EmployeeId, dayKey: string, eventType?: string): string | null {
  if (!base) return null;
  const hash = new URLSearchParams();
  hash.append("filter[main_user][]", String(employeeId));
  hash.append("filter_date_switch", "created");
  hash.append("filter_date_from", dayDotted(dayKey));
  hash.append("filter_date_to", dayDotted(dayKey));
  hash.append("useFilter", "y");
  if (eventType) {
    const key = matchEventType(eventType);
    const id = key ? AMO_EVENT_TYPE_IDS[key] : undefined;
    if (!id) return null;
    hash.append("filter[event_type][]", String(id));
  }
  return `${base}/events/list/?with_filter=y#${hash.toString()}`;
}

export function callsStatsLink(base: CrmBase, employeeId: EmployeeId, dayKey: string): string | null {
  if (!base) return null;
  const hash = new URLSearchParams();
  for (let i = 1; i <= 8; i++) hash.append("call_status[]", String(i));
  hash.append("call_type[]", "10");
  hash.append("call_type[]", "11");
  ["1", "12", "2", "3"].forEach((entity) => hash.append("entity[]", entity));
  hash.append("filter[main_user][]", String(employeeId));
  hash.append("filter_date_switch", "created");
  hash.append("filter_date_from", dayDotted(dayKey));
  hash.append("filter_date_to", dayDotted(dayKey));
  hash.append("useFilter", "y");
  return `${base}/stats/calls/?with_filter=y#${hash.toString()}`;
}

export function closedTasksLink(base: CrmBase, employeeId: EmployeeId, dayKey: string): string | null {
  if (!base) return null;
  const params = new URLSearchParams();
  params.append("filter[main_user][]", String(employeeId));
  params.append("filter_date_switch", "closed");
  params.append("filter_date_from", dayDotted(dayKey));
  params.append("filter_date_to", dayDotted(dayKey));
  params.append("useFilter", "y");
  return `${base}/todo/list/?${params.toString()}`;
}

export function phoneSearchLink(base: CrmBase, phone: string): string | null {
  if (!base) return null;
  const formatted = phoneDisplay(phone).replace(/^\+/, "");
  if (!formatted) return null;
  return `${base}/contacts/list/contacts/?skip_filter=Y&term=${encodeURIComponent(formatted)}`;
}

/** Ссылка на список сделок с фильтром задач (шапка, если источник не дал filter_link). */
export function leadsTaskFilterLink(
  base: CrmBase,
  taskFilter: "no_tasks" | "failed_tasks",
  managers: EmployeeId[],
  pipelineStatuses: { pipelineId: string; statusIds: string[] }[] = [],
): string | null {
  if (!base) return null;
  const params = new URLSearchParams();
  params.append("filter[tasks][]", taskFilter);
  managers.forEach((id) => params.append("filter[main_user][]", String(id)));
  pipelineStatuses.forEach(({ pipelineId, statusIds }) =>
    statusIds.forEach((statusId) => params.append(`filter[pipe][${pipelineId}][]`, statusId)),
  );
  params.append("useFilter", "y");
  if (!pipelineStatuses.length) {
    params.append("sel", taskFilter === "no_tasks" ? "leads_without_tasks" : "leads_with_failed_tasks");
  }
  return `${base}/leads/list/?${params.toString()}`;
}

export function stageLink(base: CrmBase, pipelineId: number | string, statusId: number | string, employeeId: EmployeeId): string | null {
  if (!base) return null;
  return `${base}/leads/list/?filter%5Bpipe%5D%5B${pipelineId}%5D%5B%5D=${statusId}&filter%5Bmain_user%5D%5B%5D=${employeeId}&useFilter=y`;
}

export const NO_CRM_BASE_HINT = "Адрес amoCRM не передан источником (контракт C2)";
