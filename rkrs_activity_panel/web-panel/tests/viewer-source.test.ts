import { afterEach, describe, expect, it, vi } from "vitest";
import { AmocrmProViewerSource, mapEvent } from "../src/api/amocrmPro";
import { computeMissedCalls } from "../src/domain/formulas/missedCalls";

const range = { dayKey: "2026-10-23", from: 1792702800, to: 1792789199 };
const event = (id: string, extra = {}) => ({
  id, type: "incoming_call", created_at: range.from + 3600, created_by: 7,
  entity_type: "leads", entity_id: 31, value_before: [], value_after: [{ note: { id: 51 } }], ...extra,
});
const facts = (duration: number | null) => ({ duration, phone: "+70000000001", direction: "incoming", result: "4", source: "notes_api", current: true });
const timeline = (events: ReturnType<typeof event>[], cursor?: string) => ({
  data: { events, next_cursor: cursor, status: { state: "ready" } }, timezone: "Europe/Moscow", coverage: "verified", freshness: "current",
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("viewer C1", () => {
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
