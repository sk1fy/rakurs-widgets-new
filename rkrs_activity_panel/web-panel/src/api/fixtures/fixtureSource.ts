import { dashboardActivityPercent } from "../../domain/formulas/dashboardActivity";
import { profileRatingPercent } from "../../domain/formulas/profileRating";
import { filterByPipelines } from "../../domain/formulas/pipelineFilter";
// Источник режима разработки. Все ответы помечены meta.source = "fixture".
// Сценарии состояний для проверки экранов: ?fixture=error|rating-error|empty|partial|stale|slow.

import { dayStatFromEvents, daySegmentsFromEvents } from "../../domain/formulas/period/dayStat";
import { dayStateOf, defaultHistoryFrom, emptyDayStat, periodCut, periodOf, previousPeriod, previousUpToCut, ratingOf, windowHours, type DayState, type DayStat, type EmployeePeriodDays, type EmployeePeriodStats, type PeriodStats } from "../../domain/period";
import { addDays, minutesOfDay, zoned, unixAt } from "../../domain/time";
import type { CrmEvent, DayEvents, EmployeeId, EmployeeSessions, PanelContext, ProblemLists } from "../../domain/types";
import { ApiError } from "../errors";
import { dayKeysBetween } from "../periodAdapter";
import type { ActivitySource, ActivityRatingParams, ActivityRatings, DayRange, EventCard, PeriodDaysParams, PeriodStatsParams, Sourced } from "../source";
import { FIXTURE_TZ, fixtureMeta, fixturePanel, fixtureProblemLists, generateDay } from "./generator";

export type FixtureScenario = "normal" | "error" | "rating-error" | "empty" | "partial" | "stale" | "slow" | "problems-initial" | "problems-collecting" | "problems-stopped" | "period-error" | "period-pending";

const SCENARIOS: readonly FixtureScenario[] = ["error", "rating-error", "empty", "partial", "stale", "slow", "problems-initial", "problems-collecting", "problems-stopped", "period-error", "period-pending"];

export function fixtureScenario(): FixtureScenario {
  const value = new URLSearchParams(globalThis.location?.search ?? "").get("fixture");
  return SCENARIOS.find((s) => s === value) ?? "normal";
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
    const data = fixtureProblemLists(params.managers, this.now(), fixturePanel(this.now()).crmBaseUrl);
    if (this.scenario === "problems-stopped") return { kind: "ok", data: { ...data, collecting: false, errorCode: "permission_denied", refreshAfter: this.now() + 420, leadsNoTasks: [], leadsWithFailedTasks: [], overdueTasks: [], meta: { ...data.meta, snapshotAt: 0, coverage: "unknown", stale: true, note: "Сбор остановлен из-за ошибки доступа. Следующая проверка — после серверной паузы." } } };
    if (this.scenario === "problems-initial") return { kind: "ok", data: { ...data, collecting: true, leadsNoTasks: [], leadsWithFailedTasks: [], overdueTasks: [], meta: { ...data.meta, snapshotAt: 0, coverage: "unknown" } } };
    return { kind: "ok", data: { ...data, collecting: this.scenario === "problems-collecting" } };
  }

  /** Синтетика period-v1: дни считаются из событий фикстур тем же правилом, что у Activity (§2–§4). */
  private periodDay(employeeId: EmployeeId, day: string, state: DayState, win: { startMinutes: number; endMinutes: number; hours: number[] }, cutoffUnix: number | null, partial = false): DayStat {
    if (state !== "ready" && state !== "today") return emptyDayStat(day, state);
    const panel = fixturePanel(this.now());
    const events = this.scenario === "empty" ? [] : filterByPipelines(generateDay(employeeId, day, this.now()).events, panel.pipelines);
    return dayStatFromEvents(events, { dayKey: day, timeZone: panel.timezone, ...win }, cutoffUnix, { state, partial, coverage: "verified" });
  }

  /** История фикстур — 33 суток; в сценарии period-pending два последних прошедших дня ещё «считаются». */
  private periodState(day: string, today: string, historyFrom: string): DayState {
    const state = dayStateOf(day, today, historyFrom);
    if (this.scenario === "period-pending" && state === "ready" && day >= addDays(today, -2)) return "pending";
    return state;
  }

  async loadPeriodStats(params: PeriodStatsParams, signal?: AbortSignal): Promise<PeriodStats> {
    await this.wait(signal);
    if (this.scenario === "period-error") throw new ApiError({ code: "unavailable", message: "fixture: расчёт периода недоступен", status: 503, retryable: true });
    const now = this.now();
    const panel = fixturePanel(now);
    const tz = panel.timezone;
    const cutoffUnix = params.cutoffUnix ?? now;
    const today = zoned(now, tz).dayKey;
    const historyFrom = defaultHistoryFrom(today);
    const current = periodOf(params.kind, params.anchor);
    const previous = previousPeriod(current);
    const cut = periodCut(current, today, minutesOfDay(cutoffUnix, tz));
    const available = previous.days.every((d) => this.periodState(d, today, historyFrom) === "ready");
    const win = { startMinutes: params.startMinutes, endMinutes: params.endMinutes, hours: windowHours(params.startMinutes, params.endMinutes) };
    const ids = params.employeeIds ?? panel.employees.map((e) => e.id);
    const byEmployee = new Map<EmployeeId, EmployeePeriodStats>(ids.map((employeeId) => {
      const days = current.days.map((d) => {
        const state = this.periodState(d, today, historyFrom);
        return this.periodDay(employeeId, d, state, win, state === "today" ? cutoffUnix : null, state === "today" && this.scenario === "partial");
      });
      let prev: EmployeePeriodStats["previous"] = null;
      if (available) {
        const prevDays = previous.days.map((d) => this.periodDay(employeeId, d, "ready", win, null));
        const cutDayKey = cut ? previous.days[cut.dayIndex] : undefined;
        const cutDay = cut && cutDayKey ? this.periodDay(employeeId, cutDayKey, "ready", win, unixAt(cutDayKey, cut.minute, tz)) : null;
        prev = { rating: ratingOf(previousUpToCut(prevDays, cut, cutDay)), ratingFull: ratingOf(prevDays), days: prevDays, cutDay };
      }
      const partial = days.some((d) => d.partial);
      return [employeeId, { employeeId, partial, current: { rating: ratingOf(days), days }, previous: prev }] as const;
    }));
    const pending = current.days.some((d) => this.periodState(d, today, historyFrom) === "pending");
    return {
      kind: params.kind,
      timeZone: tz,
      startMinutes: params.startMinutes,
      endMinutes: params.endMinutes,
      cutoffUnix,
      snapshotAt: now,
      historyFrom,
      refreshAfter: pending ? now + 60 : null,
      hours: win.hours,
      current,
      previous: { ...previous, available, cut },
      byEmployee,
      partial: [...byEmployee.values()].some((e) => e.partial),
      source: "fixture",
    };
  }

  async loadEmployeePeriodDays(employeeId: EmployeeId, params: PeriodDaysParams, signal?: AbortSignal): Promise<EmployeePeriodDays> {
    await this.wait(signal);
    if (this.scenario === "period-error") throw new ApiError({ code: "unavailable", message: "fixture: расчёт периода недоступен", status: 503, retryable: true });
    const now = this.now();
    const panel = fixturePanel(now);
    const tz = panel.timezone;
    const today = zoned(now, tz).dayKey;
    const historyFrom = defaultHistoryFrom(today);
    const cutoffUnix = params.cutoffUnix ?? now;
    const win = { timeZone: tz, startMinutes: params.startMinutes, endMinutes: params.endMinutes };
    const days = dayKeysBetween(params.fromDay, params.toDay).map((day) => {
      const state = this.periodState(day, today, historyFrom);
      if (state !== "ready" && state !== "today") return { day, state, first: null, last: null, kinds: "", zones: "" };
      const events = this.scenario === "empty" ? [] : filterByPipelines(generateDay(employeeId, day, now).events, panel.pipelines);
      return daySegmentsFromEvents(events, { ...win, dayKey: day }, state === "today" ? cutoffUnix : null, state);
    });
    return { employeeId, timeZone: tz, startMinutes: params.startMinutes, endMinutes: params.endMinutes, segmentMinutes: 2, days };
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
