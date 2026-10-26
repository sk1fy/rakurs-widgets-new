// Адаптер viewer API amocrm-pro (/api/v1/activity/view/*, Bearer <view_key>).
// Отдаёт только то, что источник действительно возвращает: проблемные
// списки (C3) и сессии (C4) — «не подключено»; адрес CRM (C2) — null.
// Факты звонка: проекция call_facts (C1). Старый backend поддерживается
// через payload события и ограниченную дозагрузку карточек (enrichment).

import { extractPipelineIds } from "../domain/formulas/pipelineFilter";
import type { CallFacts, CrmEvent, DataMeta, DayEvents, Employee, EmployeeId, Group, PanelContext } from "../domain/types";
import { ApiError } from "./errors";
import { mapLimit, requestJson } from "./http";
import type { ActivitySource, DayRange, EventCard, Sourced } from "./source";

interface RawUser { id: number; name: string; group_id: number; group_name: string }
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
interface RawPanel { name: string; timezone: string; display_window: { from: string; to: string }; employees: RawUser[] }
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

export class AmocrmProViewerSource implements ActivitySource {
  readonly mode = "live" as const;
  private readonly base: string;
  private readonly viewKey: string;
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
    const employees: Employee[] = raw.employees.map((u) => ({ id: u.id, name: u.name, groupId: String(u.group_id), groupName: u.group_name || "Без отдела" }));
    const groups = new Map<string, Group>();
    for (const e of employees) if (!groups.has(e.groupId)) groups.set(e.groupId, { id: e.groupId, name: e.groupName });
    return {
      name: raw.name,
      timezone: raw.timezone,
      displayWindow: raw.display_window,
      employees,
      groups: [...groups.values()],
      crmBaseUrl: null,
      pipelines: [],
      operators: [],
      taskPanelEnabled: null,
      meta: { source: "amocrm-pro", snapshotAt: Math.floor(Date.now() / 1000), coverage: "unknown", partial: false, stale: false },
    };
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

  async loadProblemLists(): Promise<Sourced<never>> {
    return { kind: "unavailable", contract: "C3", reason: "amocrm-pro не отдаёт текущий срез сделок и задач для панели" };
  }

  async loadSessions(): Promise<Sourced<never>> {
    return { kind: "unavailable", contract: "C4", reason: "Сессии задач и Imbox пишет устанавливаемый виджет; чтение в amocrm-pro не реализовано" };
  }
}
