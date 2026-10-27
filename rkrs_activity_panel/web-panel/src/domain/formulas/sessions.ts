// Расчёты по сессиям виджета: метрики профиля, суммарное время (топ-7),
// история задач и Imbox. Источник — сессии work/activity/pause
// (контракт C4). События CRM сессии не заменяют; единственное
// исключение старого UI — условные 10 секунд для завершённой задачи без
// найденной сессии (F10: сохраняется, но помечается как «условно»).

import { hhmm, isoToUnix, minutesOfDay, zoned } from "../time";
import type { CrmEvent, WorkSession } from "../types";
import { sessionWindow } from "./sessionWindow";

export const FALLBACK_COMPLETED_TASK_SECONDS = 10;

export function isImbox(s: WorkSession): boolean {
  return String(s.activityType ?? "").toLowerCase() === "imbox";
}

/** Время завершённых сессий панели задач без Imbox — подпись у «Завершённых» в анализе событий. */
export function completedTaskSeconds(sessions: WorkSession[], params: { dayKey: string; timeZone: string; nowUnix: number }): number {
  return sessions.reduce((sum, s) => (s.kind !== "pause" && s.stoppedAt && !isImbox(s) ? sum + (sessionWindow(s, params.dayKey, params.timeZone, params.nowUnix)?.seconds ?? 0) : sum), 0);
}

/** Реальный интервал внутри выбранного дня; открытый растёт от серверного start. */
export function clippedSeconds(s: WorkSession, dayKey: string, timeZone: string, nowUnix: number, dayBounds: { start: number; end: number }): number {
  return sessionWindow(s, dayKey, timeZone, nowUnix, dayBounds)?.seconds ?? 0;
}

export interface ProfileSessionMetrics {
  dayStart: string | null;
  dayFinish: string | null;
  workSeconds: number;
  taskSwitches: number;
}

/** Метрики профиля по сессиям (EmployeeGeneralInfoSectionV2). */
export function profileSessionMetrics(params: {
  sessions: WorkSession[];
  dayKey: string;
  timeZone: string;
  isToday: boolean;
  nowUnix: number;
  workEndMinutes: number;
}): ProfileSessionMetrics {
  const sorted = params.sessions.filter((s) => sessionWindow(s, params.dayKey, params.timeZone, params.nowUnix)).sort((a, b) => (isoToUnix(a.startedAt) ?? 0) - (isoToUnix(b.startedAt) ?? 0));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstAt = first ? sessionWindow(first, params.dayKey, params.timeZone, params.nowUnix)?.start ?? null : null;
  const lastInterval = last?.stoppedAt ? sessionWindow(last, params.dayKey, params.timeZone, params.nowUnix) : null;
  let finish = lastInterval?.endLabel ?? null;
  // «Финиш дня» сегодня показывается только за 2 часа до конца рабочего окна.
  if (finish && params.isToday && minutesOfDay(params.nowUnix, params.timeZone) < params.workEndMinutes - 120) {
    finish = null;
  }
  return {
    dayStart: firstAt !== null ? hhmm(firstAt, params.timeZone) : null,
    dayFinish: finish,
    workSeconds: sorted.reduce((sum, s) => sum + (sessionWindow(s, params.dayKey, params.timeZone, params.nowUnix)?.seconds ?? 0), 0),
    taskSwitches: sorted.filter((s) => s.kind === "work" && zoned(isoToUnix(s.startedAt)!, params.timeZone).dayKey === params.dayKey).length,
  };
}

export interface SummaryRow {
  id: string;
  label: string;
  tooltip: string;
  seconds: number;
  href: string | null;
  color: string;
  /** Строка содержит условное время fallback. */
  includesFallback: boolean;
}

export interface SummaryCards {
  deals: SummaryRow[];
  stages: SummaryRow[];
  taskTypes: SummaryRow[];
  fallbackTasks: number;
  /** Уникальные задачи с временем (включая условные) — «N задач выполнено» у старой карточки. */
  uniqueTasks: number;
}

const DEAL_PALETTE = ["#1f8d28", "#319a32", "#4fb94b", "#63c95f", "#7be67c", "#bcebbf", "#d7f2db"];
const STAGE_PALETTE = ["#2f6fbf", "#3f82d6", "#5a98e6", "#78afef", "#99c4f4", "#bcd9f8", "#dcebfb"];

interface SummaryItem {
  session: WorkSession;
  seconds: number;
  fallback: boolean;
}

/**
 * «Суммарное время (задачи + imbox)» (EmployeeDealsSnapshotSectionV2).
 * Завершённая задача из CRM без сессии с тем же task_id получает 10 с.
 */
export function summaryCards(params: {
  sessions: WorkSession[];
  completedTaskEvents: CrmEvent[];
  dayKey: string;
  timeZone: string;
  nowUnix: number;
  dayBounds: { start: number; end: number };
  links: {
    entity: (type: string | null | undefined, id: number | null | undefined) => string | null;
    stage: (pipelineId: number, statusId: number) => string | null;
  };
}): SummaryCards {
  const { dayKey, timeZone, nowUnix, dayBounds } = params;
  const items: SummaryItem[] = params.sessions
    .filter((s) => s.kind !== "pause")
    .map((s) => ({ session: s, seconds: clippedSeconds(s, dayKey, timeZone, nowUnix, dayBounds), fallback: false }))
    .filter((i) => i.seconds > 0);

  const knownTasks = new Set(params.sessions.map((s) => s.taskId).filter((id): id is number => !!id));
  let fallbackTasks = 0;
  const seenFallback = new Set<number>();
  for (const e of params.completedTaskEvents) {
    const taskId = e.taskId ?? e.entityId;
    if (knownTasks.has(taskId) || seenFallback.has(taskId)) continue;
    seenFallback.add(taskId);
    fallbackTasks += 1;
    items.push({
      session: {
        kind: "work",
        startedAt: new Date(e.createdAt * 1000).toISOString(),
        stoppedAt: new Date((e.createdAt + FALLBACK_COMPLETED_TASK_SECONDS) * 1000).toISOString(),
        workTimeSeconds: FALLBACK_COMPLETED_TASK_SECONDS,
        taskId,
        entityId: e.related?.entityId ?? null,
        entityType: e.related?.entityType ?? null,
        statusId: e.statusId,
      },
      seconds: FALLBACK_COMPLETED_TASK_SECONDS,
      fallback: true,
    });
  }

  const deals = new Map<string, SummaryRow>();
  const stages = new Map<string, SummaryRow>();
  const types = new Map<string, SummaryRow>();
  for (const { session: s, seconds, fallback } of items) {
    const isLead = ["lead", "leads"].includes(String(s.entityType ?? "").toLowerCase());
    if (s.entityId && isLead) {
      const key = `leads-${s.entityId}`;
      const row = deals.get(key) ?? {
        id: key,
        label: s.entityName || `Сделка #${s.entityId}`,
        tooltip: s.entityName || `Сделка #${s.entityId}`,
        seconds: 0,
        href: params.links.entity("leads", s.entityId) ?? s.taskUrl ?? null,
        color: DEAL_PALETTE[deals.size % DEAL_PALETTE.length] as string,
        includesFallback: false,
      };
      row.seconds += seconds;
      row.includesFallback ||= fallback;
      deals.set(key, row);
    }
    if (s.statusId && s.pipelineId) {
      const key = `${s.pipelineId}-${s.statusId}`;
      const name = s.statusName || `Этап #${s.statusId}`;
      const row = stages.get(key) ?? {
        id: key,
        label: name,
        tooltip: s.pipelineName ? `${s.pipelineName}: ${name}` : name,
        seconds: 0,
        href: params.links.stage(s.pipelineId, s.statusId),
        color: s.statusColor || (STAGE_PALETTE[stages.size % STAGE_PALETTE.length] as string),
        includesFallback: false,
      };
      row.seconds += seconds;
      row.includesFallback ||= fallback;
      stages.set(key, row);
    }
    if (!fallback && !isImbox(s)) {
      const name = s.taskTypeName || (s.kind === "activity" ? "Другое" : "Задача");
      const key = String(s.taskTypeId || name);
      const row = types.get(key) ?? { id: key, label: name, tooltip: name, seconds: 0, href: null, color: "#ba81f3", includesFallback: false };
      row.seconds += seconds;
      types.set(key, row);
    }
  }
  const sort = (m: Map<string, SummaryRow>) => [...m.values()].sort((a, b) => b.seconds - a.seconds);
  const uniqueTasks = new Set(items.map((i) => i.session.taskId).filter((id): id is number => !!id)).size;
  return { deals: sort(deals), stages: sort(stages), taskTypes: sort(types), fallbackTasks, uniqueTasks };
}

export interface HistoryRow {
  id: string;
  title: string;
  href: string | null;
  typeLabel: string;
  start: string;
  end: string;
  inProgress: boolean;
  startMinutes: number;
  endMinutes: number;
  seconds: number;
  text: string;
  result: string;
  color: string;
  session: WorkSession;
}

/**
 * «История выполненных задач» (EmployeeTaskBoardSectionV2).
 * F7: pause-сессии исключены — в старом UI они попадали в таблицу как «Задача».
 */
export function taskHistory(params: {
  sessions: WorkSession[];
  dayKey: string;
  timeZone: string;
  nowUnix: number;
  dayEnd: number;
}): { rows: HistoryRow[]; summary: { closed: number; averageSeconds: number; withResult: number; total: number; types: number; other: number } } {
  const { dayKey, timeZone, nowUnix } = params;
  const isToday = zoned(nowUnix, timeZone).dayKey === dayKey;
  const rows = params.sessions
    .filter((s) => s.kind !== "pause" && !isImbox(s))
    .flatMap((s, index): HistoryRow[] => {
      const interval = sessionWindow(s, dayKey, timeZone, nowUnix);
      if (!interval) return [];
      const typeLabel = s.taskTypeName || (s.kind === "activity" ? "Другое" : "Задача");
      return [{
        id: String(s.taskId ?? `session-${index}`) + `-${index}`,
        title: s.entityName || s.taskName || `Задача #${s.taskId ?? index + 1}`,
        href: s.taskUrl ?? null,
        typeLabel,
        start: interval.startLabel,
        end: !s.stoppedAt && isToday ? "В процессе" : interval.endLabel,
        inProgress: !s.stoppedAt,
        startMinutes: interval.startMinutes,
        endMinutes: interval.endMinutes,
        seconds: interval.seconds,
        text: s.taskName || s.groupName || s.activityName || "— Не указан —",
        result: s.taskResult || "— Не указан —",
        color: s.statusColor || (s.kind === "activity" ? "#f0a33a" : "#9654f1"),
        session: s,
      }];
    });
  const total = rows.length;
  const sum = rows.reduce((acc, r) => acc + r.seconds, 0);
  return {
    rows,
    summary: {
      closed: rows.filter((r) => !r.inProgress).length,
      averageSeconds: total ? Math.round(sum / total) : 0,
      withResult: rows.filter((r) => !!r.session.taskResult).length,
      total,
      types: new Set(rows.map((r) => r.session.taskTypeId || r.typeLabel)).size,
      other: rows.filter((r) => r.session.kind === "activity").length,
    },
  };
}

/** «История посещений в Imbox» (EmployeeInboxSectionV2). */
export function imboxHistory(params: {
  sessions: WorkSession[];
  dayKey: string;
  timeZone: string;
  nowUnix: number;
  dayBounds: { start: number; end: number };
  entityLink: (type: string | null | undefined, id: number | null | undefined) => string | null;
}) {
  const { dayKey, timeZone, nowUnix, dayBounds } = params;
  const rows = params.sessions
    .filter(isImbox)
    .map((s, index) => ({ s, index, seconds: clippedSeconds(s, dayKey, timeZone, nowUnix, dayBounds) }))
    .filter((r) => r.seconds > 0)
    .map(({ s, index, seconds }) => {
      const interval = sessionWindow(s, dayKey, timeZone, nowUnix, dayBounds)!;
      return {
        id: `${s.entityType ?? "entity"}-${s.entityId ?? "na"}-${s.startedAt}-${index}`,
        title: imboxEntityLabel(s),
        subtitle: s.pipelineName || s.activityName || (s.entityId ? `Диалог #${s.entityId}` : "Диалог Imbox"),
        href: params.entityLink(s.entityType, s.entityId),
        start: interval.startLabel,
        end: interval.endLabel,
        startMinutes: interval.startMinutes,
        endMinutes: interval.endMinutes,
        seconds,
        conversationKey: String(s.activityName ?? "").trim() || `${s.entityType ?? "entity"}-${s.entityId ?? "unknown"}`,
        session: s,
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const groups = new Map<string, SummaryRow>();
  for (const r of rows) {
    if (!r.session.entityId) continue;
    const key = `${r.session.entityType ?? "leads"}-${r.session.entityId}`;
    const row = groups.get(key) ?? {
      id: key,
      label: r.title,
      tooltip: r.title,
      seconds: 0,
      href: r.href,
      color: DEAL_PALETTE[groups.size % DEAL_PALETTE.length] as string,
      includesFallback: false,
    };
    row.seconds += r.seconds;
    groups.set(key, row);
  }
  const total = rows.reduce((sum, r) => sum + r.seconds, 0);
  return {
    rows,
    totalSeconds: total,
    averageSeconds: rows.length ? Math.round(total / rows.length) : 0,
    uniqueConversations: new Set(rows.map((r) => r.conversationKey)).size,
    entities: [...groups.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 7),
    uniqueEntities: groups.size,
    hasNonLeadEntities: rows.some((r) => r.session.entityType && !["lead", "leads"].includes(String(r.session.entityType).toLowerCase())),
  };
}

function imboxEntityLabel(s: WorkSession): string {
  if (s.entityName) return s.entityName;
  if (!s.entityId) return s.activityName || "Сущность не указана";
  const type = String(s.entityType ?? "").toLowerCase();
  if (type.startsWith("contact")) return `Контакт #${s.entityId}`;
  if (type.startsWith("compan")) return `Компания #${s.entityId}`;
  if (type.startsWith("customer")) return `Покупатель #${s.entityId}`;
  return `Сделка #${s.entityId}`;
}
