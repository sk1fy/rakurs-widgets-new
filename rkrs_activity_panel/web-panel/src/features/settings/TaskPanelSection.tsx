import { useCallback, useEffect, useRef, useState } from "react";
import { useResource } from "../../app/hooks";
import type { Employee } from "../../domain/types";
import type { SettingsBackend } from "../../settings/api";
import type { TaskPanelSettings } from "../../settings/models";
import { ErrorState, NotConnected, Spinner } from "../../ui/primitives";
import { normalizePriorities } from "./draft";
import { TaskPanelForm } from "./TaskPanelForm";

/** Как в старом UI: изменения сохраняются автоматически через 700 мс тишины. */
export const TASK_PANEL_SAVE_DEBOUNCE_MS = 700;

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** «Панель задач»: глобальные настройки аккаунта (контракт C6). */
export function TaskPanelSection({ backend }: { backend: SettingsBackend }) {
  const cap = backend.capabilities.taskPanel;
  if (!cap.available) return <NotConnected contract={cap.contract} reason={cap.reason} />;
  return <TaskPanelLoader backend={backend} />;
}

function TaskPanelLoader({ backend }: { backend: SettingsBackend }) {
  const res = useResource(`settings:task-panel:${backend.kind}`, async () => {
    const [settings, employees] = await Promise.all([backend.getTaskPanel(), backend.listEmployees()]);
    return { settings: { ...settings, priorities: normalizePriorities(settings.priorities) }, employees };
  });
  if (res.status === "error") return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Spinner label="Загрузка настроек панели задач…" />;
  return <TaskPanelEditor backend={backend} initial={res.data.settings} employees={res.data.employees} />;
}

interface SaveQueue {
  timer: ReturnType<typeof setTimeout> | null;
  pending: TaskPanelSettings | null;
  seq: number;
  mounted: boolean;
}

function TaskPanelEditor({ backend, initial, employees }: { backend: SettingsBackend; initial: TaskPanelSettings; employees: Employee[] }) {
  const [value, setValue] = useState<TaskPanelSettings>(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const queue = useRef<SaveQueue>({ timer: null, pending: null, seq: 0, mounted: true });

  const flush = useCallback(() => {
    const q = queue.current;
    if (q.timer) clearTimeout(q.timer);
    q.timer = null;
    const next = q.pending;
    if (!next) return;
    q.pending = null;
    const id = ++q.seq;
    if (q.mounted) setStatus("saving");
    backend.saveTaskPanel(next).then(
      () => {
        if (q.mounted && id === q.seq) {
          setStatus("saved");
          setError(null);
        }
      },
      (e: unknown) => {
        if (q.mounted && id === q.seq) {
          setStatus("error");
          setError(e);
        }
      },
    );
  }, [backend]);

  useEffect(() => {
    const q = queue.current;
    q.mounted = true;
    return () => {
      q.mounted = false;
      // Уход со вкладки не теряет последнее изменение.
      if (q.pending) flush();
    };
  }, [flush]);

  const change = (next: TaskPanelSettings) => {
    setValue(next);
    const q = queue.current;
    q.pending = next;
    setStatus("pending");
    if (q.timer) clearTimeout(q.timer);
    q.timer = setTimeout(flush, TASK_PANEL_SAVE_DEBOUNCE_MS);
  };

  const retry = () => {
    queue.current.pending = value;
    flush();
  };

  return (
    <div className="form">
      <div className="row-f" aria-live="polite">
        <SaveIndicator status={status} />
        {status === "error" && (
          <button type="button" className="tool-btn" onClick={retry}>
            Повторить сохранение
          </button>
        )}
      </div>
      {status === "error" && error !== null && <ErrorState compact error={error} />}
      <TaskPanelForm value={value} onChange={change} employees={employees} />
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  switch (status) {
    case "pending":
      return <span className="chip mut">изменения ждут сохранения…</span>;
    case "saving":
      return <span className="chip info">сохранение…</span>;
    case "saved":
      return <span className="chip ok">сохранено</span>;
    case "error":
      return <span className="chip bad">не сохранено</span>;
    default:
      return <span className="dim small">Изменения сохраняются автоматически.</span>;
  }
}
