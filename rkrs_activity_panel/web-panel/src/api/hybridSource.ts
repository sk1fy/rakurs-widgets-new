// hybrid: всё, что умеет amocrm-pro, — живое; неготовые контракты
// (C3 проблемные списки, C4 сессии) — синтетика с meta.source = "fixture",
// которую экран обязан пометить. Используется только в разработке.

import type { DayEvents, EmployeeId, EmployeeSessions, PanelContext, ProblemLists } from "../domain/types";
import { AmocrmProViewerSource } from "./amocrmPro";
import { fixtureMeta, fixtureProblemLists, generateDay } from "./fixtures/generator";
import type { ActivitySource, DayRange, EventCard, Sourced } from "./source";

export class HybridSource implements ActivitySource {
  readonly mode = "hybrid" as const;
  private readonly live: AmocrmProViewerSource;

  constructor(viewKey: string) {
    this.live = new AmocrmProViewerSource(viewKey);
  }

  loadPanel(signal?: AbortSignal): Promise<PanelContext> {
    return this.live.loadPanel(signal);
  }

  loadDayEvents(range: DayRange, signal?: AbortSignal): Promise<DayEvents> {
    return this.live.loadDayEvents(range, signal);
  }

  loadEmployeeEvents(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<DayEvents> {
    return this.live.loadEmployeeEvents(employeeId, range, signal);
  }

  loadEventCard(eventId: string, signal?: AbortSignal): Promise<EventCard> {
    return this.live.loadEventCard(eventId, signal);
  }

  async loadProblemLists(params: { managers: EmployeeId[] }): Promise<Sourced<ProblemLists>> {
    const now = Math.floor(Date.now() / 1000);
    // Ссылки не строятся: адрес CRM живого аккаунта неизвестен (C2).
    return { kind: "ok", data: { ...fixtureProblemLists(params.managers, now, null), meta: fixtureMeta(now, { note: "синтетика вместо C3" }) } };
  }

  async loadSessions(employeeId: EmployeeId, range: DayRange): Promise<Sourced<EmployeeSessions>> {
    const now = Math.floor(Date.now() / 1000);
    const day = generateDay(employeeId, range.dayKey, now);
    return { kind: "ok", data: { employeeId, day: range.dayKey, items: day.sessions, meta: fixtureMeta(now, { note: "синтетика вместо C4" }) } };
  }
}
