// Совместимое имя dev-режима: все чтения идут к amocrm-pro.
// Ошибки и недоступные контракты не подменяются синтетическими данными.

import type { DayEvents, EmployeeId, EmployeeSessions, PanelContext, ProblemLists } from "../domain/types";
import { AmocrmProViewerSource } from "./amocrmPro";
import type { ActivitySource, ActivityRatingParams, ActivityRatings, DayRange, EventCard, Sourced } from "./source";

export class HybridSource implements ActivitySource {
  readonly mode = "hybrid" as const;
  private readonly live: AmocrmProViewerSource;

  constructor(viewKey: string) {
    this.live = new AmocrmProViewerSource(viewKey);
  }

  loadActivityRatings(params: ActivityRatingParams, signal?: AbortSignal): Promise<ActivityRatings> {
    return this.live.loadActivityRatings(params, signal);
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

  loadProblemLists(params: { managers: EmployeeId[]; pipelines: string[] }, signal?: AbortSignal): Promise<Sourced<ProblemLists>> {
    return this.live.loadProblemLists(params, signal);
  }

  loadSessions(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<Sourced<EmployeeSessions>> {
    return this.live.loadSessions(employeeId, range, signal);
  }
}
