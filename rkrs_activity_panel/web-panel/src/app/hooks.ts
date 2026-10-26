import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";

/** Текущее время, тикает раз в tickMs (по умолчанию 30 с). */
export function useNow(tickMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}

export interface Resource<T> {
  data: T | null;
  error: unknown;
  status: "idle" | "loading" | "ready" | "error";
  /** Фоновое обновление поверх уже показанных данных. */
  refreshing: boolean;
  updatedAt: number | null;
  reload: () => void;
}

/**
 * Загрузка с отменой и автообновлением. Первое автообновление — через
 * refreshMs после загрузки (F1), скрытая вкладка пропускает тик.
 * Ошибка фонового обновления не стирает данные: они помечаются как устаревшие.
 */
export function useResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, options: { refreshMs?: number | null; refreshKey?: string | number | null; enabled?: boolean } = {}): Resource<T> {
  const [state, setState] = useState<Omit<Resource<T>, "reload">>({ data: null, error: null, status: "idle", refreshing: false, updatedAt: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const [nonce, setNonce] = useState(0);
  const keyRef = useRef<string | null>(null);

  const run = useCallback((background: boolean, signal: AbortSignal) => {
    setState((s) => (background && s.data !== null ? { ...s, refreshing: true } : { data: null, error: null, status: "loading", refreshing: false, updatedAt: s.updatedAt }));
    loadRef.current(signal).then(
      (data) => {
        if (signal.aborted) return;
        setState({ data, error: null, status: "ready", refreshing: false, updatedAt: Math.floor(Date.now() / 1000) });
      },
      (error) => {
        if (signal.aborted || (error instanceof ApiError && error.code === "aborted")) return;
        setState((s) => (background && s.data !== null ? { ...s, refreshing: false, error } : { data: null, error, status: "error", refreshing: false, updatedAt: s.updatedAt }));
      },
    );
  }, []);

  const refreshKey = options.refreshKey;
  const enabled = options.enabled ?? true;
  useEffect(() => {
    if (key === null) {
      keyRef.current = null;
      setState({ data: null, error: null, status: "idle", refreshing: false, updatedAt: null });
      return;
    }
    if (!enabled) {
      if (keyRef.current !== key) {
        keyRef.current = key;
        setState({ data: null, error: null, status: "idle", refreshing: false, updatedAt: null });
      } else {
        setState((s) => ({ ...s, refreshing: false, status: s.data !== null ? "ready" : s.error ? "error" : "idle" }));
      }
      return;
    }
    const controller = new AbortController();
    const background = keyRef.current === key;
    keyRef.current = key;
    run(background, controller.signal);
    return () => controller.abort();
  }, [key, nonce, refreshKey, enabled, run]);

  const refreshMs = options.refreshMs ?? null;
  useEffect(() => {
    if (key === null || !refreshMs || !enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setNonce((n) => n + 1);
    }, refreshMs);
    return () => clearInterval(t);
  }, [key, refreshMs, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Значение с задержкой: обновляется, когда value не меняется delayMs. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
