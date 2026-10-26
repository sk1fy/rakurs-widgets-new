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
export function useResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, options: { refreshMs?: number | null } = {}): Resource<T> {
  const [state, setState] = useState<Omit<Resource<T>, "reload">>({ data: null, error: null, status: "idle", refreshing: false, updatedAt: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const [nonce, setNonce] = useState(0);
  const keyRef = useRef<string | null>(null);

  const run = useCallback((background: boolean, signal: AbortSignal) => {
    setState((s) => (background ? { ...s, refreshing: true } : { data: null, error: null, status: "loading", refreshing: false, updatedAt: s.updatedAt }));
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

  useEffect(() => {
    if (key === null) {
      setState({ data: null, error: null, status: "idle", refreshing: false, updatedAt: null });
      return;
    }
    const controller = new AbortController();
    const background = keyRef.current === key && nonce > 0;
    keyRef.current = key;
    run(background, controller.signal);
    return () => controller.abort();
  }, [key, nonce, run]);

  const refreshMs = options.refreshMs ?? null;
  useEffect(() => {
    if (key === null || !refreshMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setNonce((n) => n + 1);
    }, refreshMs);
    return () => clearInterval(t);
  }, [key, refreshMs]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
