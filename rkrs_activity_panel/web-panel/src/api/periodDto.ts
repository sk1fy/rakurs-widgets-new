// DTO контракта period-v1 (amocrm-pro docs/proposals/activity-period-v1.md §5).
// Зеркалят JSON ответа как есть; экраны работают с моделями src/domain/period.ts.

export type RawDayState = "future" | "today" | "ready" | "pending" | "unavailable";

/** §3/§5.1. Для future/pending/unavailable — только day, state, counted:false. */
export interface RawDayStat {
  day: string;
  state: RawDayState;
  counted: boolean;
  coverage?: "verified" | "partial" | "unknown";
  partial?: boolean;
  /** [outgoing_calls, messages, outgoing_mail, completed_tasks, lead_status_changes] */
  kpi?: [number, number, number, number, number];
  events?: number;
  active?: number;
  call?: number;
  elapsed?: number;
  idle_inside?: number;
  first?: number | null;
  last?: number | null;
  /** [active_h, call_h, elapsed_h] на каждый час из RawPeriodResponse.hours. */
  hours?: [number, number, number][];
}

export interface RawPeriodRange {
  start: string;
  end: string;
  days?: string[];
}

export interface RawPeriodEmployee {
  employee_id: number;
  /** Этап 1 backend: сотрудник посчитан по неполной выборке (бюджет сканирования). */
  partial?: boolean;
  current: { rating: number | null; days: RawDayStat[] };
  /** null, если previous.available == false. */
  previous: { rating: number | null; rating_full: number | null; days: RawDayStat[]; cut_day: RawDayStat | null } | null;
}

/** GET /api/v1/activity/view/period */
export interface RawPeriodResponse {
  formula_version: string;
  kind: "week" | "month";
  timezone: string;
  start_minutes: number;
  end_minutes: number;
  cutoff_unix: number;
  snapshot_at: number;
  history_from: string;
  /** Есть, только если хоть один день pending. */
  refresh_after?: number;
  hours: number[];
  current: RawPeriodRange & { days: string[] };
  previous: RawPeriodRange & { available: boolean; cut: { day_index: number; minute: number } | null };
  employees: RawPeriodEmployee[];
}

export interface RawPeriodDay {
  day: string;
  state: RawDayState;
  coverage?: string;
  partial?: boolean;
  first?: number | null;
  last?: number | null;
  /** 0 пауза, 1 CRM, 2 звонок, . ещё не наступило — символ на 2-минутный отрезок окна. */
  kinds?: string;
  /** - нет событий, C/T/I/D/O, . ещё не наступило. */
  zones?: string;
}

/** GET /api/v1/activity/view/employees/{employeeId}/period-days */
export interface RawPeriodDaysResponse {
  formula_version: string;
  timezone: string;
  employee_id: number;
  cutoff_unix: number;
  start_minutes: number;
  end_minutes: number;
  segment_minutes: number;
  days: RawPeriodDay[];
}
