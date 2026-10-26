// Адаптер viewer API amocrm-pro (/api/v1/activity/view/*, Bearer <view_key>).
// Отдаёт только то, что источник действительно возвращает: проблемные
// списки (C3) и сессии (C4) — «не подключено»; адрес CRM (C2) берётся из scoped viewer DTO.
// Факты звонка: проекция call_facts (C1). Старый backend поддерживается
// через payload события и ограниченную дозагрузку карточек (enrichment).

import { panelOptionsFromAPI, type RawPanelOptions } from "./panelOptions";
import { leadsTaskFilterLink } from "../domain/crmLinks";
import { extractPipelineIds, openPipelineStatuses } from "../domain/formulas/pipelineFilter";
import type { CallFacts, CrmEvent, DataMeta, DayEvents, Employee, EmployeeId, Group, PanelContext, ProblemLists, EmployeeSessions, WorkSession } from "../domain/types";
import { ApiError } from "./errors";
import { mapLimit, requestJson } from "./http";
import type { ActivitySource, ActivityRatingParams, ActivityRatings, DayRange, EventCard, Sourced } from "./source";

interface RawUser { id: number; name: string; group_id: number; group_name: string; avatar_url?: string; avatar?: string }
interface RawEnrichment { object_kind: string; state: string; source: string; payload?: unknown; current: boolean }
interface RawEvent {
  id: string;
  created_at: number;
  created_by: number;
  type: string;
  entity_id: number;
  entity_type: string;
  value_before: unknown;
  value_after: unknown;
  enrichment?: RawEnrichment[];
  call_facts?: { duration: number | null; phone: string | null; result: string | null } | null;
  view?: {
    title?: string;
    summary?: string;
    author_label?: string;
    entity_label?: string;
    details?: { label?: string; before?: unknown; after?: unknown; text?: string }[];
  };
}
interface RawStatus { lag_seconds: number; last_success_at: number; state: string; reauth_required: boolean; error_code?: string }
interface RawData { events: RawEvent[] | null; next_cursor?: string; status: RawStatus }
interface RawPanel { task_panel_enabled?: boolean; options?: RawPanelOptions; pipelines?: { id: number; name: string; statuses: { id: number; name: string }[] }[]; crm_base_url?: string; name: string; timezone: string; display_window: { from: string; to: string }; employees: RawUser[] }
interface RawTimeline { timezone: string; data: RawData; coverage?: string; freshness?: string; empty_reason?: string }

/** Предел страниц на один день: 60 × 100 событий. Превышение — частичные данные. */
export const MAX_PAGES = 60;
/** Предел дозагрузки карточек звонков без длительности за одну загрузку. */
export const MAX_CALL_CARDS = 150;

const asObject = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const asNumber = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const asString = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
const asDuration = (v: unknown): number | null => {
  const n = asNumber(v);
  return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

function firstValue(raw: unknown): Record<string, unknown> | null {
  return Array.isArray(raw) ? asObject(raw[0]) : asObject(raw);
}

function callFromObject(source: Record<string, unknown> | null): CallFacts | null {
  if (!source) return null;
  const params = asObject(source.params) ?? source;
  const duration = asDuration(params.duration);
  const phone = asString(params.phone);
  if (duration === null && !phone) return null;
  return {
    durationSeconds: duration,
    phone,
    entityType: asString(source.entity_type),
    entityId: asNumber(source.entity_id),
    result: asString(params.result),
    link: asString(params.link),
  };
}

/** Факты звонка из payload события (value_after[0].note) — тот же источник, что у CallFacts в crmevents. */
export function callFactsFromPayload(e: Pick<RawEvent, "value_after" | "entity_type" | "entity_id">): CallFacts | null {
  const note = asObject(firstValue(e.value_after)?.note);
  const facts = callFromObject(note);
  if (!facts) return null;
  return { ...facts, entityType: facts.entityType ?? e.entity_type, entityId: facts.entityId ?? e.entity_id };
}

function callFactsFromEnrichment(e: RawEvent): CallFacts | null {
  for (const item of e.enrichment ?? []) {
    if (item.object_kind !== "note" || item.state !== "ready") continue;
    const payload = asObject(item.payload);
    const facts = asObject(payload?.facts);
    if (!facts || (facts.duration === undefined && facts.phone === undefined)) continue;
    return {
      durationSeconds: asDuration(facts.duration),
      phone: asString(facts.phone),
      entityType: asString(payload?.entity_type) ?? e.entity_type,
      entityId: asNumber(payload?.entity_id) ?? e.entity_id,
      result: asString(facts.result),
      link: asString(facts.link),
    };
  }
  return null;
}

function relatedEntity(e: RawEvent): CrmEvent["related"] {
  if (e.entity_type !== "task" && e.entity_type !== "tasks") return { entityType: e.entity_type, entityId: e.entity_id };
  for (const key of ["value_after", "value_before"] as const) {
    const values = Array.isArray(e[key]) ? (e[key] as unknown[]) : [];
    for (const v of values) {
      const o = asObject(v);
      const task = asObject(o?.task) ?? o;
      const type = asString(task?.entity_type);
      const id = asNumber(task?.entity_id);
      if (type && id) return { entityType: type, entityId: id };
    }
  }
  return null;
}

function statusId(e: RawEvent): number | null {
  const after = firstValue(e.value_after);
  return asNumber(asObject(after?.lead_status)?.id) ?? asNumber(asObject(after?.status)?.id);
}

export function mapEvent(e: RawEvent): CrmEvent {
  const isCall = e.type === "incoming_call" || e.type === "outgoing_call";
  const isTask = e.entity_type === "task" || e.entity_type === "tasks";
  const taskValue = asObject(firstValue(e.value_after)?.task);
  return {
    id: String(e.id),
    type: e.type,
    createdAt: e.created_at,
    createdBy: e.created_by,
    entityId: e.entity_id,
    entityType: e.entity_type,
    call: isCall ? e.call_facts ? {
      durationSeconds: asDuration(e.call_facts.duration),
      phone: asString(e.call_facts.phone),
      result: asString(e.call_facts.result),
      entityType: e.entity_type,
      entityId: e.entity_id,
      link: null,
    } : callFactsFromEnrichment(e) ?? callFactsFromPayload(e) ?? { durationSeconds: null, phone: null, entityType: e.entity_type, entityId: e.entity_id, result: null, link: null } : null,
    pipelineIds: extractPipelineIds(e as unknown as Record<string, unknown>),
    taskId: isTask ? e.entity_id : asNumber(taskValue?.id),
    taskTypeId: asNumber(taskValue?.task_type_id),
    statusId: statusId(e),
    related: relatedEntity(e),
  };
}

function metaFrom(t: RawTimeline, snapshotAt: number, partial: boolean, note?: string): DataMeta {
  const coverage = t.coverage === "verified" || t.coverage === "partial" ? t.coverage : "unknown";
  return {
    source: "amocrm-pro",
    snapshotAt,
    coverage,
    partial: partial || coverage === "partial",
    stale: t.freshness === "lagging" || t.freshness === "error" || t.freshness === "reauth_required",
    note: [t.freshness && t.freshness !== "current" ? `сбор: ${t.freshness}` : null, t.empty_reason ? `пусто: ${t.empty_reason}` : null, note]
      .filter(Boolean)
      .join("; ") || undefined,
  };
}

export function safeCrmBase(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return null;
    if (!/^[a-z0-9][a-z0-9-]*\.(amocrm\.ru|amocrm\.com|kommo\.com)$/.test(u.hostname)) return null;
    return u.origin;
  } catch { return null; }
}

export class AmocrmProViewerSource implements ActivitySource {
  readonly mode = "live" as const;
  private readonly base: string;
  private readonly viewKey: string;
  private panelContext: PanelContext | null = null;
  private readonly cards = new Map<string, { card: EventCard; expiresAt: number }>();

  constructor(viewKey: string, apiBase: string = import.meta.env.VITE_ACTIVITY_API_BASE ?? "") {
    this.viewKey = viewKey;
    this.base = apiBase.replace(/\/$/, "");
  }

  private get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return requestJson<T>(`${this.base}/api/v1/activity/view${path}`, { bearer: this.viewKey, signal });
  }

  async loadPanel(signal?: AbortSignal): Promise<PanelContext> {
    const raw = await this.get<RawPanel>("/panel", signal);
    const options = panelOptionsFromAPI(raw.options);
    const employees: Employee[] = raw.employees.map((u) => ({ id: u.id, name: u.name, groupId: String(u.group_id), groupName: u.group_name || "Без отдела", avatarUrl: u.avatar_url || u.avatar || undefined }));
    const groups = new Map<string, Group>();
    for (const e of employees) if (!groups.has(e.groupId)) groups.set(e.groupId, { id: e.groupId, name: e.groupName });
    const panel: PanelContext = {
      name: raw.name,
      timezone: raw.timezone,
      displayWindow: raw.display_window,
      employees,
      groups: [...groups.values()],
      crmBaseUrl: safeCrmBase(raw.crm_base_url),
      pipelines: options?.pipelines ?? [],
      pipelineCatalog: (raw.pipelines ?? []).map((p) => ({ id: String(p.id), name: p.name, statuses: (p.statuses ?? []).map((v) => ({ id: String(v.id), name: v.name })) })),
      operators: options?.operators ?? [],
      taskPanelEnabled: raw.task_panel_enabled ?? null,
      meta: { source: "amocrm-pro", snapshotAt: Math.floor(Date.now() / 1000), coverage: "unknown", partial: false, stale: false },
    };
    this.panelContext = panel;
    return panel;
  }

  private async paginate(path: string, range: DayRange, signal?: AbortSignal): Promise<{ events: CrmEvent[]; meta: DataMeta }> {
    const events: CrmEvent[] = [];
    const legacyCalls = new Set<string>();
    let cursor: string | undefined;
    let last: RawTimeline | undefined;
    let pages = 0;
    do {
      const q = new URLSearchParams({ from: String(range.from), to: String(range.to), limit: "100" });
      if (cursor) q.set("cursor", cursor);
      last = await this.get<RawTimeline>(`${path}?${q.toString()}`, signal);
      // Go encodes an empty nil slice as null. Coverage still decides whether
      // the empty result is verified; normalizing the list must not hide it.
      const pageEvents = last.data.events ?? [];
      for (const event of pageEvents) {
        if (event.call_facts == null) legacyCalls.add(String(event.id));
      }
      events.push(...pageEvents.map(mapEvent));
      cursor = last.data.next_cursor || undefined;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);
    const capped = Boolean(cursor);
    const snapshotAt = Math.floor(Date.now() / 1000);
    const resolved = await this.resolveCallFacts(events, legacyCalls, signal);
    if (signal?.aborted) throw new ApiError({ code: "aborted", message: "aborted" });
    const notes = [capped ? `загружено ${pages} стр. из-за предела, часть событий не получена` : null, resolved.unresolved ? `у ${resolved.unresolved} звонков нет длительности` : null]
      .filter(Boolean)
      .join("; ");
    return { events, meta: metaFrom(last as RawTimeline, snapshotAt, capped, notes || undefined) };
  }

  /**
   * Совместимость со старым backend без C1: ≤ 4 карточек параллельно,
   * ≤ MAX_CALL_CARDS за загрузку. call_facts с null — явное «неизвестно»;
   * карточки для таких событий не запрашиваются. Следующий опрос обновит факты.
   */
  private async resolveCallFacts(events: CrmEvent[], legacyCalls: Set<string>, signal?: AbortSignal): Promise<{ unresolved: number }> {
    const todo = events.filter((e) => e.call && e.call.durationSeconds === null && legacyCalls.has(e.id)).slice(0, MAX_CALL_CARDS);
    let stopped = false;
    await mapLimit(todo, 4, async (e) => {
      if (stopped) return;
      try {
        const card = await this.loadEventCard(e.id, signal);
        if (card.call && card.call.durationSeconds !== null) {
          e.call = card.call;
        }
      } catch (err) {
        if (signal?.aborted || (err instanceof ApiError && err.code === "aborted")) throw err;
        if (err instanceof ApiError && err.code === "resource_exhausted") stopped = true;
      }
    });
    return { unresolved: events.filter((e) => e.call && e.call.durationSeconds === null).length };
  }

  async loadActivityRatings(params: ActivityRatingParams, signal?: AbortSignal): Promise<ActivityRatings> {
    const query = new URLSearchParams({ from: String(params.from), to: String(params.to), day: params.dayKey, surface: params.surface, start_minutes: String(params.startMinutes), end_minutes: String(params.endMinutes) });
    if (params.cutoffUnix !== null) query.set("cutoff_unix", String(params.cutoffUnix));
    if (params.employeeIds?.length) query.set("employee_ids", params.employeeIds.join(","));
    const raw = await this.get<{ formula_version: string; day: string; timezone: string; start_minutes: number; end_minutes: number; cutoff_unix?: number; snapshot_at: number; partial: boolean; employees: { employee_id: number; percent: number; minute_percentages?: number[] }[] }>(`/activity?${query}`, signal);
    const expectedVersion = `${params.surface}-v1` as ActivityRatings["formulaVersion"];
    const validPercent = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
    if (raw.formula_version !== expectedVersion || raw.day !== params.dayKey || raw.start_minutes !== params.startMinutes || raw.end_minutes !== params.endMinutes || (raw.cutoff_unix ?? null) !== params.cutoffUnix || !Array.isArray(raw.employees) || raw.employees.some((r) => !validPercent(r.percent) || (params.surface === "profile" && (!Array.isArray(r.minute_percentages) || r.minute_percentages.length !== 1441 || !r.minute_percentages.every(validPercent))))) {
      throw new ApiError({ code: "unavailable", message: "Некорректный ответ расчёта активности", retryable: true });
    }
    const byEmployee = new Map(raw.employees.map((r) => [r.employee_id, { employeeId: r.employee_id, percent: r.percent, minutePercentages: r.minute_percentages }]));
    const expectedIds = params.employeeIds ?? this.panelContext?.employees.map((e) => e.id) ?? [];
    if (expectedIds.some((id) => !byEmployee.has(id))) throw new ApiError({ code: "unavailable", message: "Расчёт активности вернул не всех сотрудников", retryable: true });
    return { formulaVersion: expectedVersion, dayKey: raw.day, timeZone: raw.timezone, startMinutes: raw.start_minutes, endMinutes: raw.end_minutes, cutoffUnix: raw.cutoff_unix ?? null, snapshotAt: raw.snapshot_at, partial: raw.partial, byEmployee };
  }

  async loadDayEvents(range: DayRange, signal?: AbortSignal): Promise<DayEvents> {
    const { events, meta } = await this.paginate("/timeline", range, signal);
    const byEmployee = new Map<EmployeeId, CrmEvent[]>();
    for (const e of events) {
      const list = byEmployee.get(e.createdBy) ?? [];
      list.push(e);
      byEmployee.set(e.createdBy, list);
    }
    return { byEmployee, from: range.from, to: range.to, meta };
  }

  async loadEmployeeEvents(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<DayEvents> {
    const { events, meta } = await this.paginate(`/employees/${employeeId}`, range, signal);
    return { byEmployee: new Map([[employeeId, events]]), from: range.from, to: range.to, meta };
  }

  async loadEventCard(eventId: string, signal?: AbortSignal): Promise<EventCard> {
    const cached = this.cards.get(eventId);
    if (cached && cached.expiresAt > Date.now()) return cached.card;
    const raw = await this.get<RawEvent>(`/events/${encodeURIComponent(eventId)}`, signal);
    const text = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v));
    const card: EventCard = {
      id: String(raw.id),
      title: raw.view?.title ?? null,
      summary: raw.view?.summary ?? null,
      authorLabel: raw.view?.author_label ?? null,
      entityLabel: raw.view?.entity_label ?? null,
      details: (raw.view?.details ?? []).map((d) => ({ label: d.label ?? "", before: text(d.before), after: text(d.after), text: d.text ?? null })),
      call: mapEvent(raw).call,
      source: "amocrm-pro",
    };
    // Pending enrichment must be retried on refresh; even ready Notes can change.
    if (!card.call || card.call.durationSeconds !== null) {
      if (this.cards.size >= 500) this.cards.clear();
      this.cards.set(eventId, { card, expiresAt: Date.now() + 60_000 });
    }
    return card;
  }

  async loadProblemLists(params: { managers: EmployeeId[]; pipelines: string[] }, signal?: AbortSignal): Promise<Sourced<ProblemLists>> {
    const snapshot = await this.get<{ snapshot_at: number; stale?: boolean; state?: string; error_code?: string; collecting?: boolean; refresh_after?: number; counts: { employee_id: number; leads_no_tasks: number; leads_overdue_tasks: number; overdue_tasks: number }[] | null }>("/problems", signal);
    const base = this.panelContext?.crmBaseUrl ?? null;
    const selected = new Set(params.managers);
    const pipelineStatuses = openPipelineStatuses(this.panelContext?.pipelineCatalog ?? [], params.pipelines);
    const collecting = snapshot.collecting ?? (snapshot.state === "leads" || snapshot.state === "tasks");
    const rows = (snapshot.counts ?? []).filter((r) => selected.has(r.employee_id));
    return { kind: "ok", data: {
      collecting,
      errorCode: snapshot.error_code,
      refreshAfter: snapshot.refresh_after,
      leadsNoTasks: rows.map((r) => ({ managerId: r.employee_id, count: r.leads_no_tasks, filterLink: leadsTaskFilterLink(base, "no_tasks", [r.employee_id], pipelineStatuses) })),
      leadsWithFailedTasks: rows.map((r) => ({ managerId: r.employee_id, count: r.leads_overdue_tasks, filterLink: leadsTaskFilterLink(base, "failed_tasks", [r.employee_id], pipelineStatuses) })),
      overdueTasks: rows.map((r) => ({ managerId: r.employee_id, count: r.overdue_tasks, filterLink: base ? `${base}/todo/list/?filter[status][]=failed&filter[main_user][]=${r.employee_id}&useFilter=y` : null })),
      meta: { source: "amocrm-pro", snapshotAt: snapshot.snapshot_at, coverage: snapshot.snapshot_at > 0 ? "verified" : "unknown", partial: false, stale: snapshot.stale === true || snapshot.snapshot_at <= 0 || Date.now() / 1000 - snapshot.snapshot_at >= 7 * 60, note: snapshot.error_code ? (!collecting ? (snapshot.snapshot_at > 0 ? "Сбор остановлен из-за ошибки; показан последний полный срез. Следующая проверка — после серверной паузы." : "Сбор остановлен из-за ошибки. Следующая проверка — после серверной паузы.") : snapshot.snapshot_at > 0 ? "Обновление среза временно недоступно; показан последний полный срез" : "Сбор среза временно недоступен; повтор выполняется автоматически") : collecting ? "Срез обновляется" : undefined },
    } };
  }

  async loadSessions(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<Sourced<EmployeeSessions>> {
    const items: WorkSession[] = [];
    const seen = new Set<string>();
    let cursor = "";
    let snapshotAt: number;
    do {
      const page = await this.get<{ snapshot_at: number; items: RawSession[] | null; next_cursor?: string }>(`/employees/${employeeId}/sessions?from=${range.from}&to=${range.to}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, signal);
      items.push(...(page.items ?? []).map(sessionFromAPI));
      snapshotAt = page.snapshot_at;
      cursor = page.next_cursor ?? "";
      if (cursor && seen.has(cursor)) throw new ApiError({ code: "unavailable", message: "Повторяющаяся страница истории сессий" });
      if (cursor) seen.add(cursor);
    } while (cursor);
    return { kind: "ok", data: { employeeId, day: range.dayKey, items, meta: { source: "amocrm-pro", snapshotAt, coverage: "verified", partial: false, stale: false } } };
  }
}

interface RawSession {
  kind: "work" | "activity" | "pause"; started_at: number; stopped_at: number; work_time_seconds: number;
  context: { task_id: number; task_name: string; task_type_id: number; task_type_name: string; task_result: string; activity_name: string; activity_type: string; entity_id: number; entity_type: string; entity_name: string; pipeline_id: number; pipeline_name: string; status_id: number; status_name: string; status_color: string };
}
function sessionFromAPI(s: RawSession): WorkSession {
  const c = s.context;
  return { kind: s.kind, startedAt: new Date(s.started_at * 1000).toISOString(), stoppedAt: s.stopped_at ? new Date(s.stopped_at * 1000).toISOString() : null, workTimeSeconds: s.work_time_seconds,
    pauseTimeSeconds: s.kind === "pause" && s.stopped_at ? s.stopped_at - s.started_at : 0,
    taskId: c.task_id || null, taskName: c.task_name, taskTypeId: c.task_type_id || null, taskTypeName: c.task_type_name, taskResult: c.task_result,
    activityName: c.activity_name, activityType: c.activity_type, entityId: c.entity_id || null, entityType: c.entity_type, entityName: c.entity_name,
    pipelineId: c.pipeline_id || null, pipelineName: c.pipeline_name, statusId: c.status_id || null, statusName: c.status_name, statusColor: c.status_color,
  };
}
