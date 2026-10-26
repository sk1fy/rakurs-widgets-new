import { dashboardActivityPercent } from "../../domain/formulas/dashboardActivity";
import { profileRatingPercent } from "../../domain/formulas/profileRating";
import { filterByPipelines } from "../../domain/formulas/pipelineFilter";
// Источник режима разработки. Все ответы помечены meta.source = "fixture".
// Сценарии состояний для проверки экранов: ?fixture=error|rating-error|empty|partial|stale|slow.

import { addDays, zoned, unixAt } from "../../domain/time";
import type { CrmEvent, DayEvents, EmployeeId, EmployeeSessions, PanelContext, ProblemLists } from "../../domain/types";
import { ApiError } from "../errors";
import type { ActivitySource, ActivityRatingParams, ActivityRatings, DayRange, EventCard, Sourced } from "../source";
import { FIXTURE_TZ, fixtureMeta, fixturePanel, fixtureProblemLists, generateDay } from "./generator";

export type FixtureScenario = "normal" | "error" | "rating-error" | "empty" | "partial" | "stale" | "slow";

export function fixtureScenario(): FixtureScenario {
  const value = new URLSearchParams(globalThis.location?.search ?? "").get("fixture");
  return value === "error" || value === "rating-error" || value === "empty" || value === "partial" || value === "stale" || value === "slow" ? value : "normal";
}

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ApiError({ code: "aborted", message: "aborted" }));
    });
  });

/** Дни (в TZ фикстур), пересекающие диапазон. */
function daysIn(range: DayRange): string[] {
  const first = zoned(range.from, FIXTURE_TZ).dayKey;
  const last = zoned(range.to, FIXTURE_TZ).dayKey;
  const out = [first];
  while (out[out.length - 1] !== last && out.length < 40) out.push(addDays(out[out.length - 1] as string, 1));
  return out;
}

export class FixtureSource implements ActivitySource {
  readonly mode = "fixtures" as const;
  private readonly scenario: FixtureScenario;
  private readonly now: () => number;

  constructor(scenario: FixtureScenario = fixtureScenario(), now: () => number = () => Math.floor(Date.now() / 1000)) {
    this.scenario = scenario;
    this.now = now;
  }

  private async wait(signal?: AbortSignal) {
    await delay(this.scenario === "slow" ? 2500 : 120 + Math.random() * 180, signal);
    if (this.scenario === "error") {
      throw new ApiError({ code: "unavailable", message: "fixture: источник недоступен", status: 503, requestId: "fixture-request", retryable: true });
    }
  }

  private meta() {
    return fixtureMeta(this.now(), {
      partial: this.scenario === "partial",
      stale: this.scenario === "stale",
      coverage: this.scenario === "partial" ? "partial" : "verified",
      note: this.scenario === "partial" ? "fixture: часть страниц не получена" : this.scenario === "stale" ? "fixture: сбор отстаёт" : undefined,
    });
  }

  async loadActivityRatings(params: ActivityRatingParams, signal?: AbortSignal): Promise<ActivityRatings> {
    await this.wait(signal);
    if (this.scenario === "rating-error") throw new ApiError({ code: "unavailable", message: "fixture: calculation unavailable", retryable: true });
    const panel = fixturePanel(this.now());
    const ids = params.employeeIds ?? panel.employees.map((e) => e.id);
    const byEmployee = new Map(ids.map((employeeId) => {
      const allEvents = this.eventsFor(employeeId, params);
      const input = { events: params.surface === "dashboard" ? filterByPipelines(allEvents, panel.pipelines) : allEvents, dayKey: params.dayKey, timeZone: panel.timezone, startMinutes: params.startMinutes, endMinutes: params.endMinutes };
      const percent = params.surface === "dashboard" ? dashboardActivityPercent({ ...input, cutoffUnix: params.cutoffUnix }) : profileRatingPercent({ ...input, nowUnix: params.cutoffUnix });
      const minutePercentages = params.surface === "profile" ? Array.from({ length: 1441 }, (_, m) => profileRatingPercent({ ...input, nowUnix: unixAt(params.dayKey, m, panel.timezone) })) : undefined;
      return [employeeId, { employeeId, percent, minutePercentages }] as const;
    }));
    return { formulaVersion: `${params.surface}-v1`, dayKey: params.dayKey, timeZone: panel.timezone, startMinutes: params.startMinutes, endMinutes: params.endMinutes, cutoffUnix: params.cutoffUnix, snapshotAt: this.now(), partial: this.scenario === "partial", byEmployee };
  }

  async loadPanel(signal?: AbortSignal): Promise<PanelContext> {
    await this.wait(signal);
    return fixturePanel(this.now());
  }

  private eventsFor(employeeId: EmployeeId, range: DayRange): CrmEvent[] {
    if (this.scenario === "empty") return [];
    const now = this.now();
    return daysIn(range)
      .flatMap((day) => generateDay(employeeId, day, now).events)
      .filter((e) => e.createdAt >= range.from && e.createdAt <= range.to);
  }

  async loadDayEvents(range: DayRange, signal?: AbortSignal): Promise<DayEvents> {
    await this.wait(signal);
    const panel = fixturePanel(this.now());
    const byEmployee = new Map(panel.employees.map((e) => [e.id, this.eventsFor(e.id, range)] as const));
    return { byEmployee, from: range.from, to: range.to, meta: this.meta() };
  }

  async loadEmployeeEvents(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<DayEvents> {
    await this.wait(signal);
    return { byEmployee: new Map([[employeeId, this.eventsFor(employeeId, range)]]), from: range.from, to: range.to, meta: this.meta() };
  }

  async loadEventCard(eventId: string, signal?: AbortSignal): Promise<EventCard> {
    await this.wait(signal);
    return syntheticCard(eventId);
  }

  async loadProblemLists(params: { managers: EmployeeId[] }, signal?: AbortSignal): Promise<Sourced<ProblemLists>> {
    await this.wait(signal);
    return { kind: "ok", data: fixtureProblemLists(params.managers, this.now(), fixturePanel(this.now()).crmBaseUrl) };
  }

  async loadSessions(employeeId: EmployeeId, range: DayRange, signal?: AbortSignal): Promise<Sourced<EmployeeSessions>> {
    await this.wait(signal);
    const items = this.scenario === "empty" ? [] : generateDay(employeeId, range.dayKey, this.now()).sessions;
    return { kind: "ok", data: { employeeId, day: range.dayKey, items, meta: this.meta() } };
  }
}

export function syntheticCard(eventId: string): EventCard {
  return {
    id: eventId,
    title: "Синтетическое событие",
    summary: "Карточка сгенерирована в режиме разработки",
    authorLabel: null,
    entityLabel: null,
    details: [],
    call: null,
    source: "fixture",
  };
}
