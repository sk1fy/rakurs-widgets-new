// Блок «По часам» (контракт period-v1 §8.2, R10).

import { comparablePreviousDays, type DayStat, type PeriodStats } from "../../period";
import type { EmployeeId } from "../../types";

export interface HourValue {
  /** Доля активного времени часа 0..1; null — в часе не было прошедшего времени. */
  level: number | null;
  /** Доля времени звонков. */
  calls: number | null;
  /** Уровень текущего − уровень прошлого периода до той же точки, доля; null — сравнивать не с чем. */
  delta: number | null;
}

export interface HourMatrixRow {
  employeeId: EmployeeId;
  cells: HourValue[];
  /** Индекс лучшего часа (▲) по уровню среди всех часов окна. */
  best: number | null;
  /** Индекс худшего часа (▼) среди часов с прошедшим временем. */
  worst: number | null;
  rating: number | null;
  /** Рейтинг − рейтинг прошлого периода до той же точки, доля. */
  ratingDelta: number | null;
}

export interface HourMatrix {
  hours: number[];
  rows: HourMatrixRow[];
  /** Среднее по сотрудникам; рейтинг — среднее рейтингов. */
  footer: { cells: HourValue[]; rating: number | null };
}

const mean = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

/** Среднее по counted дням с elapsed_h > 0 от min(1, x_h / elapsed_h). */
export function hourLevels(days: readonly DayStat[], hourCount: number): { level: (number | null)[]; calls: (number | null)[] } {
  const level: (number | null)[] = [];
  const calls: (number | null)[] = [];
  for (let i = 0; i < hourCount; i++) {
    const a: number[] = [];
    const c: number[] = [];
    for (const d of days) {
      const cell = d.hours[i];
      if (!d.counted || !cell || cell[2] <= 0) continue;
      a.push(Math.min(1, cell[0] / cell[2]));
      c.push(Math.min(1, cell[1] / cell[2]));
    }
    level.push(mean(a));
    calls.push(mean(c));
  }
  return { level, calls };
}

function extremes(levels: (number | null)[]): { best: number | null; worst: number | null } {
  let best: number | null = null;
  let worst: number | null = null;
  levels.forEach((v, i) => {
    if (v === null) return;
    if (best === null || v > (levels[best] as number)) best = i;
    if (worst === null || v < (levels[worst] as number)) worst = i;
  });
  return { best, worst: worst === best ? null : worst };
}

export function hourMatrix(stats: PeriodStats, employeeIds: readonly EmployeeId[]): HourMatrix {
  const n = stats.hours.length;
  const rows: HourMatrixRow[] = [];
  for (const id of employeeIds) {
    const e = stats.byEmployee.get(id);
    if (!e) continue;
    const cur = hourLevels(e.current.days, n);
    const previous = stats.previous.available ? comparablePreviousDays(e, stats.previous.cut) : null;
    const prev = previous ? hourLevels(previous, n) : null;
    const cells = cur.level.map((level, i) => {
      const before = prev?.level[i] ?? null;
      return { level, calls: cur.calls[i] ?? null, delta: level !== null && before !== null ? level - before : null };
    });
    const rating = e.current.rating;
    const prevRating = stats.previous.available ? e.previous?.rating ?? null : null;
    rows.push({ employeeId: id, cells, ...extremes(cur.level), rating, ratingDelta: rating !== null && prevRating !== null ? rating - prevRating : null });
  }
  rows.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  const footerCells = Array.from({ length: n }, (_, i) => ({
    level: mean(rows.map((r) => r.cells[i]?.level ?? null)),
    calls: mean(rows.map((r) => r.cells[i]?.calls ?? null)),
    delta: mean(rows.map((r) => r.cells[i]?.delta ?? null)),
  }));
  return { hours: stats.hours, rows, footer: { cells: footerCells, rating: mean(rows.map((r) => r.rating)) } };
}
