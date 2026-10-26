import { afterEach, describe, expect, it, vi } from "vitest";
import { AmocrmProViewerSource, mapEvent } from "../src/api/amocrmPro";
import { computeMissedCalls } from "../src/domain/formulas/missedCalls";

const range = { dayKey: "2026-10-23", from: 1792702800, to: 1792789199 };
const event = (id: string, extra = {}) => ({
  id, type: "incoming_call", created_at: range.from + 3600, created_by: 7,
  entity_type: "leads", entity_id: 31, value_before: [], value_after: [{ note: { id: 51 } }], ...extra,
});
const facts = (duration: number | null) => ({ duration, phone: "+70000000001", direction: "incoming", result: "4", source: "notes_api", current: true });
const timeline = (events: ReturnType<typeof event>[] | null, cursor?: string) => ({
  data: { events, next_cursor: cursor, status: { state: "ready" } }, timezone: "Europe/Moscow", coverage: "verified", freshness: "current",
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("viewer C1", () => {
  it.each(["day", "employee"] as const)("loads a null %s event page while retaining unverified coverage", async (surface) => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      ...timeline(null), coverage: "partial", empty_reason: "unverified_empty",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const source = new AmocrmProViewerSource("synthetic-key", "");
    const data = await (surface === "day" ? source.loadDayEvents(range) : source.loadEmployeeEvents(7, range));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...data.byEmployee.values()].flat()).toEqual([]);
    expect(data.meta.coverage).toBe("partial");
    expect(data.meta.partial).toBe(true);
    expect(data.meta.note).toContain("unverified_empty");
  });

  it("uses the page projection: known zero is missed, null remains unknown", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(timeline([
      event("zero", { call_facts: facts(0) }),
      event("unknown", { call_facts: { ...facts(null), phone: "+70000000002" } }),
    ])));
    vi.stubGlobal("fetch", fetchMock);
    const data = await new AmocrmProViewerSource("synthetic-key", "").loadDayEvents(range);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = computeMissedCalls(data.byEmployee, "Europe/Moscow");
    expect(calls.items).toHaveLength(1);
    expect(calls.unknownDurationIncoming).toBe(1);
    expect(data.meta.note).toContain("у 1 звонков нет длительности");
  });

  it("loads 250 projected calls in three pages without any detail requests", async () => {
    let page = 0;
    const fetchMock = vi.fn(async () => {
      const start = page++ * 100;
      return json(timeline(Array.from({ length: Math.min(100, 250 - start) }, (_, n) => event(`call-${start + n}`, { call_facts: facts(n % 2 ? 120 : null) })), page < 3 ? `cursor-${page}` : undefined));
    });
    vi.stubGlobal("fetch", fetchMock);
    const data = await new AmocrmProViewerSource("synthetic-key", "").loadDayEvents(range);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(data.byEmployee.get(7)).toHaveLength(250);
  });

  it("takes refreshed facts from the next page read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(timeline([event("call", { call_facts: facts(null) })])))
      .mockResolvedValueOnce(json(timeline([event("call", { call_facts: facts(120) })])));
    vi.stubGlobal("fetch", fetchMock);
    const source = new AmocrmProViewerSource("synthetic-key", "");
    expect((await source.loadDayEvents(range)).byEmployee.get(7)?.[0]?.call?.durationSeconds).toBeNull();
    expect((await source.loadDayEvents(range)).byEmployee.get(7)?.[0]?.call?.durationSeconds).toBe(120);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("supports the old backend and retries cards while enrichment is pending", async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes("/events/") ? json(event("call")) : json(timeline([event("call")])));
    vi.stubGlobal("fetch", fetchMock);
    const source = new AmocrmProViewerSource("synthetic-key", "");
    await source.loadDayEvents(range);
    await source.loadDayEvents(range);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mockImplementation(async (url: string) => url.includes("/events/") ? json(event("call", {
      enrichment: [{ object_kind: "note", state: "ready", source: "notes_api", payload: { facts: { duration: 120, phone: "+70000000001" } } }],
    })) : json(timeline([event("call")])));
    expect((await source.loadDayEvents(range)).byEmployee.get(7)?.[0]?.call?.durationSeconds).toBe(120);
    await source.loadDayEvents(range);
    expect(fetchMock).toHaveBeenCalledTimes(7); // last read reuses a known card
  });

  it("does not turn cancelled fallback requests into a successful load", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/events/")) {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }
      return json(timeline([event("call")]));
    }));
    await expect(new AmocrmProViewerSource("synthetic-key", "").loadDayEvents(range, controller.signal)).rejects.toMatchObject({ code: "aborted" });
  });

  it("expires known legacy card facts so a later refresh can read changes", async () => {
    vi.useFakeTimers();
    let duration = 0;
    const fetchMock = vi.fn(async (url: string) => url.includes("/events/") ? json(event("call", {
      enrichment: [{ object_kind: "note", state: "ready", source: "notes_api", payload: { facts: { duration } } }],
    })) : json(timeline([event("call")])));
    vi.stubGlobal("fetch", fetchMock);
    const source = new AmocrmProViewerSource("synthetic-key", "");
    expect((await source.loadDayEvents(range)).byEmployee.get(7)?.[0]?.call?.durationSeconds).toBe(0);
    duration = 120;
    await vi.advanceTimersByTimeAsync(60_001);
    expect((await source.loadDayEvents(range)).byEmployee.get(7)?.[0]?.call?.durationSeconds).toBe(120);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not invent durations or infer a call from a non-call event", () => {
    expect(mapEvent(event("bad", { call_facts: facts(-1) })).call?.durationSeconds).toBeNull();
    expect(mapEvent(event("task", { type: "task_completed", call_facts: facts(120) })).call).toBeNull();
  });
});

describe("viewer CRM origin", () => {
  it.each(["https://alpha.amocrm.ru", "https://bravo.kommo.com"])('uses the account origin %s', async (origin) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ name: "Panel", timezone: "Europe/Moscow", display_window: { from: "09:00", to: "18:00" }, employees: [], crm_base_url: origin })));
    expect((await new AmocrmProViewerSource("synthetic-key", "").loadPanel()).crmBaseUrl).toBe(origin);
  });
  it.each([undefined, "javascript:alert(1)", "https://alpha.amocrm.ru.attacker.test", "https://user:password@alpha.amocrm.ru", "https://alpha.amocrm.ru/untrusted", "http://alpha.amocrm.ru"])('does not create links from an invalid or absent origin', async (origin) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ name: "Panel", timezone: "Europe/Moscow", display_window: { from: "09:00", to: "18:00" }, employees: [], crm_base_url: origin })));
    expect((await new AmocrmProViewerSource("synthetic-key", "").loadPanel()).crmBaseUrl).toBeNull();
  });
});

describe("viewer product metadata and current problems", () => {
  it("loads saved operators, pipelines and current counts without fixture fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ name: "Panel", timezone: "Europe/Moscow", display_window: { from: "09:00", to: "18:00" }, employees: [], crm_base_url: "https://alpha.amocrm.ru", options: { pipeline_ids: [10], operators: [{ employee_id: 7, enabled: true, plan: 80, thresholds: { dialing_seconds: 10, conversation_seconds: 30, exceeding_seconds: 180 } }], departments: [] }, pipelines: [{ id: 10, name: "Sales", statuses: [{ id: 11, name: "Open" }] }] })).mockResolvedValueOnce(json({ snapshot_at: 1793000000, counts: [{ employee_id: 7, leads_no_tasks: 3, leads_overdue_tasks: 2, overdue_tasks: 4 }, { employee_id: 9, leads_no_tasks: 1, leads_overdue_tasks: 0, overdue_tasks: 0 }] }));
    vi.stubGlobal("fetch", fetchMock);
    const source = new AmocrmProViewerSource("synthetic-key", "");
    const panel = await source.loadPanel();
    expect(panel.operators[0]?.plan).toBe(80);
    expect(panel.pipelines).toEqual(["10"]);
    const got = await source.loadProblemLists({ managers: [7], pipelines: ["10"] });
    expect(got.kind).toBe("ok");
    if (got.kind !== "ok") throw Error("unavailable");
    expect(got.data.leadsNoTasks).toHaveLength(1);
    expect(got.data.leadsNoTasks[0]?.count).toBe(3);
    expect(got.data.leadsNoTasks[0]?.filterLink).toContain("alpha.amocrm.ru");
    expect(got.data.meta.source).toBe("amocrm-pro");
    expect(got.data.meta.snapshotAt).toBe(1793000000);
  });
  it("propagates a failed current snapshot rather than reporting zero counts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "resource_exhausted", message: "snapshot limit" } }), { status: 429 })));
    await expect(new AmocrmProViewerSource("synthetic-key", "").loadProblemLists({ managers: [7], pipelines: [] })).rejects.toMatchObject({ code: "resource_exhausted" });
  });
});

it("loads actual session context separately from CRM events", async () => {
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ snapshot_at: range.to, items: [{ kind: "activity", started_at: range.from + 100, stopped_at: range.from + 160, work_time_seconds: 60, context: { task_id: 0, task_name: "", task_type_id: 0, task_type_name: "", task_result: "", activity_name: "Imbox 123", activity_type: "imbox", entity_id: 31, entity_type: "leads", entity_name: "Synthetic deal", pipeline_id: 10, pipeline_name: "Sales", status_id: 11, status_name: "Open", status_color: "#00ff00" } }] })));
 const got=await new AmocrmProViewerSource("synthetic-key","").loadSessions(7,range);
 expect(got.kind).toBe("ok");if(got.kind!=="ok")throw Error("unavailable");
 expect(got.data.meta.source).toBe("amocrm-pro");expect(got.data.items[0]).toMatchObject({activityType:"imbox",entityId:31,workTimeSeconds:60,taskId:null,startedAt:new Date((range.from+100)*1000).toISOString()});
});
