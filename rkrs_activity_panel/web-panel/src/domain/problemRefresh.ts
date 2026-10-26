import type { Sourced } from "../api/source";
import type { ProblemLists } from "./types";

export const PROBLEM_REFRESH_MS = 7 * 60_000;
export const PROBLEM_COLLECTING_POLL_MS = 10_000;
export const PROBLEM_ERROR_RETRY_MS = 30_000;
export const PROBLEM_MIN_POLL_MS = 10_000;

export const hasProblemSnapshot = (data: Sourced<ProblemLists> | null): boolean => data?.kind === "ok" && data.data.meta.snapshotAt > 0;

/** Poll status only during collection; the server decides whether a new scan is due. */
export function problemRefreshDelay(data: Sourced<ProblemLists> | null, error: unknown, nowMs: number): number | null {
  if (error !== null) return PROBLEM_ERROR_RETRY_MS;
  if (!data || data.kind !== "ok") return null;
  if (data.data.collecting || (!hasProblemSnapshot(data) && !data.data.errorCode)) {
    const due = data.data.refreshAfter;
    return due === undefined ? PROBLEM_COLLECTING_POLL_MS : Math.max(PROBLEM_MIN_POLL_MS, Math.min(2_147_483_647, due * 1000 - nowMs));
  }
  const due = data.data.refreshAfter ?? data.data.meta.snapshotAt + PROBLEM_REFRESH_MS / 1000;
  // Bound delays for old servers and client/server clock skew; do not busy-loop.
  return Math.max(PROBLEM_MIN_POLL_MS, Math.min(PROBLEM_REFRESH_MS, due * 1000 - nowMs));
}
