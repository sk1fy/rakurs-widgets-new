import { useEffect, useState } from "react";
import type { ActivitySource } from "../../api/source";
import { useResource } from "../../app/hooks";
import { problemRefreshDelay } from "../../domain/problemRefresh";

/** Clock injection keeps lifecycle checks deterministic without replacing browser timers. */
export interface ProblemPollClock {
  now: () => number;
  isVisible?: () => boolean;
  subscribeVisibility?: (callback: () => void) => () => void;
  schedule: (callback: () => void, delay: number) => () => void;
}
const documentVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
const subscribeDocumentVisibility = (callback: () => void) => {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
};
const browserClock: ProblemPollClock = {
  now: () => Date.now(),
  schedule: (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
};

export function useProblemLists(source: ActivitySource, key: string, managers: number[], pipelines: string[], clock: ProblemPollClock = browserClock) {
  const [visible, setVisible] = useState(() => (clock.isVisible ?? documentVisible)());
  useEffect(() => {
    const changed = () => setVisible((clock.isVisible ?? documentVisible)());
    const unsubscribe = (clock.subscribeVisibility ?? subscribeDocumentVisibility)(changed);
    changed();
    return unsubscribe;
  }, [clock]);
  const resource = useResource(key, (signal) => source.loadProblemLists({ managers, pipelines }, signal), { enabled: visible });
  const { data, error, status, refreshing, updatedAt, reload } = resource;
  useEffect(() => {
    if (!visible || status === "idle" || status === "loading" || refreshing) return;
    const delay = problemRefreshDelay(data, error, clock.now());
    if (delay === null) return;
    return clock.schedule(reload, delay);
  }, [key, data, error, status, refreshing, updatedAt, reload, clock, visible]);
  return resource;
}
