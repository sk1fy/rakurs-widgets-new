// Сборка показателей оператора на «сегодня» (F5: план/факт всегда за текущий день).

import { countOperatorCalls, operatorForecast, remainingWorkHours, requiredSpeed, type CallCounts } from "../../domain/formulas/operator";
import { addDays, minutesOfDay, unixAt } from "../../domain/time";
import type { CrmEvent, OperatorSettings } from "../../domain/types";

export interface OperatorSnapshot {
  settings: OperatorSettings;
  today: CallCounts;
  yesterday: CallCounts | null;
  actual: number;
  forecast: number;
  showForecast: boolean;
  remainingToPlan: number;
  remainingHours: number;
  requiredSpeed: number;
}

export function operatorSnapshot(params: {
  settings: OperatorSettings;
  events: CrmEvent[];
  yesterdayEvents: CrmEvent[] | null;
  dayKey: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  nowUnix: number;
  unique: boolean;
}): OperatorSnapshot {
  const { settings, dayKey, timeZone, startMinutes, endMinutes, nowUnix, unique } = params;
  const today = countOperatorCalls({ events: params.events, thresholds: settings, unique, nowUnix });
  // Вчера — до того же времени на часах (как в старом виджете).
  const yCut = unixAt(addDays(dayKey, -1), minutesOfDay(nowUnix, timeZone), timeZone) + (nowUnix % 60);
  const yesterday = params.yesterdayEvents ? countOperatorCalls({ events: params.yesterdayEvents, thresholds: settings, unique, untilUnix: yCut }) : null;
  const actual = today.calls;
  const forecast = operatorForecast({
    actual,
    lastCallUnix: today.lastCallUnix,
    nowUnix,
    workStartUnix: unixAt(dayKey, startMinutes, timeZone),
    workEndUnix: unixAt(dayKey, endMinutes, timeZone),
  });
  const remainingToPlan = Math.max(settings.plan - actual, 0);
  const remainingHours = remainingWorkHours(minutesOfDay(nowUnix, timeZone), startMinutes, endMinutes);
  return {
    settings,
    today,
    yesterday,
    actual,
    forecast,
    showForecast: today.lastHourCalls > 0,
    remainingToPlan,
    remainingHours,
    requiredSpeed: requiredSpeed(remainingToPlan, remainingHours),
  };
}
