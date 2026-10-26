import { useCallback, useEffect, useRef, useState } from "react";

/** Короткое уведомление внизу экрана (класс .toast). */
export function useToast(durationMs = 1800): { message: string | null; show: (message: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<{ id: ReturnType<typeof setTimeout> | null }>({ id: null });
  const show = useCallback(
    (text: string) => {
      setMessage(text);
      const t = timer.current;
      if (t.id) clearTimeout(t.id);
      t.id = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );
  useEffect(() => {
    const t = timer.current;
    return () => {
      if (t.id) clearTimeout(t.id);
    };
  }, []);
  return { message, show };
}
