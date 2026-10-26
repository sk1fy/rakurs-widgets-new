// Пропущенные звонки (DashboardHeader.vue fetchMissedCallsData, MissedCallsWidget.vue).
// Пропущенный — входящий с длительностью 0. Снимается исходящим (в т.ч. с
// нулевой длительностью) или принятым входящим на тот же номер в ту же
// минуту либо позже. Повторы группируются по номеру.
// F9: звонок без известной длительности не считается пропущенным —
// он учитывается отдельно как «без данных».

import { hhmm } from "../time";
import { normalizePhoneForMissed, phoneDisplay } from "../phone";
import type { CrmEvent, EmployeeId } from "../types";

export interface MissedCallItem {
  normalizedPhone: string;
  phone: string;
  displayPhone: string;
  count: number;
  firstCallTime: string;
  callTimes: string[];
  entityType: string | null;
  entityId: number | null;
  employeeIds: EmployeeId[];
}

export interface MissedCallsResult {
  items: MissedCallItem[];
  /** Входящие без длительности: нельзя отличить пропущенный от принятого. */
  unknownDurationIncoming: number;
}

interface Call {
  type: string;
  phone: string;
  normalized: string;
  ts: number;
  duration: number | null;
  employeeId: EmployeeId;
  entityType: string | null;
  entityId: number | null;
}

export function computeMissedCalls(
  byEmployee: Map<EmployeeId, CrmEvent[]>,
  timeZone: string,
): MissedCallsResult {
  const calls: Call[] = [];
  let unknownDurationIncoming = 0;
  for (const [employeeId, events] of byEmployee) {
    for (const e of events) {
      if (e.type !== "incoming_call" && e.type !== "outgoing_call") continue;
      const phone = e.call?.phone;
      if (!phone) continue;
      const duration = e.call?.durationSeconds ?? null;
      if (e.type === "incoming_call" && duration === null) unknownDurationIncoming += 1;
      calls.push({
        type: e.type,
        phone,
        normalized: normalizePhoneForMissed(phone),
        ts: e.createdAt,
        duration,
        employeeId,
        entityType: e.call?.entityType ?? null,
        entityId: e.call?.entityId ?? null,
      });
    }
  }
  calls.sort((a, b) => a.ts - b.ts);

  const byPhone = new Map<string, Call[]>();
  for (const call of calls) {
    if (!call.normalized) continue;
    const list = byPhone.get(call.normalized) ?? [];
    list.push(call);
    byPhone.set(call.normalized, list);
  }

  const result: MissedCallItem[] = [];
  for (const [normalized, list] of byPhone) {
    const missed = list.filter((c) => c.type === "incoming_call" && c.duration === 0);
    const shown = missed.filter((m) => {
      const minute = Math.floor(m.ts / 60);
      return !list.some((other) => {
        if (other === m) return false;
        const answered = other.type === "outgoing_call" || (other.type === "incoming_call" && (other.duration ?? 0) > 0);
        if (!answered) return false;
        return Math.floor(other.ts / 60) === minute || other.ts > m.ts;
      });
    });
    if (!shown.length) continue;
    // Как в старом коде: внутри одной сущности считаются все попытки,
    // при слиянии нескольких сущностей одного номера — уникальные минуты.
    const contacts = new Set(shown.map((c) => `${c.entityType}_${c.entityId}`));
    const allTimes = shown.map((c) => hhmm(c.ts, timeZone));
    const times = contacts.size > 1 ? [...new Set(allTimes)].sort() : allTimes;
    const first = shown[0] as Call;
    result.push({
      normalizedPhone: normalized,
      phone: first.phone,
      displayPhone: phoneDisplay(first.phone),
      count: times.length,
      firstCallTime: times[0] ?? hhmm(first.ts, timeZone),
      callTimes: times,
      entityType: first.entityType,
      entityId: first.entityId,
      employeeIds: [...new Set(shown.map((c) => c.employeeId))],
    });
  }
  result.sort((a, b) => a.firstCallTime.localeCompare(b.firstCallTime));
  return { items: result, unknownDurationIncoming };
}
