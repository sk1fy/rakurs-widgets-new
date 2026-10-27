import { useCallback, useEffect, useRef, useState } from "react";
import { useResource } from "../../app/hooks";
import { ApiError } from "../../api/errors";
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
  const readSequence = useRef(0);
  const res = useResource(`settings:task-panel:${backend.kind}`, async () => {
    const [settings, employees] = await Promise.all([backend.getTaskPanel(), backend.listEmployees()]);
    return { settings: { ...settings, priorities: normalizePriorities(settings.priorities) }, employees, readId: ++readSequence.current };
  });
  if (res.status === "error") return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Spinner label="Загрузка настроек панели задач…" />;
  return <>{res.error !== null && <ErrorState compact error={res.error} onRetry={res.reload} />}<TaskPanelEditor key={res.data.readId} backend={backend} initial={res.data.settings} employees={res.data.employees} onReload={res.reload} /></>;
}

interface SaveQueue {
  timer: ReturnType<typeof setTimeout> | null;
  pending: TaskPanelSettings | null;
  seq: number;
  mounted: boolean;
  version: number;
  blocked: boolean;
}

function TaskPanelEditor({ backend, initial, employees, onReload }: { backend: SettingsBackend; initial: TaskPanelSettings; employees: Employee[]; onReload: () => void }) {
  const [value, setValue] = useState<TaskPanelSettings>(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const queue = useRef<SaveQueue>({ timer: null, pending: null, seq: 0, mounted: true, version: 0, blocked: false });
  const blocked = error instanceof ApiError && ["conflict", "permission_denied", "unauthenticated", "management_session_expired", "reauth_required"].includes(error.code);

  const flush = useCallback(() => {
    const q = queue.current;
    if (q.timer) clearTimeout(q.timer);
    q.timer = null;
    const next = q.pending;
    if (!next || q.blocked) return;
    q.pending = null;
    const id = ++q.seq;
    const version = q.version;
    if (q.mounted) setStatus("saving");
    backend.saveTaskPanel(next).then(
      (saved) => {
        if (q.mounted && id === q.seq && version === q.version) {
          setValue(saved);
          setStatus("saved");
          setError(null);
        }
      },
      (e: unknown) => {
        const terminal = e instanceof ApiError && ["conflict", "permission_denied", "unauthenticated", "management_session_expired", "reauth_required"].includes(e.code);
        if (terminal) {
          q.blocked = true;
          q.pending = null;
          if (q.timer) clearTimeout(q.timer);
          q.timer = null;
        }
        if (q.mounted && (terminal || id === q.seq && version === q.version)) {
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
    if (queue.current.blocked) return;
    setValue(next);
    const q = queue.current;
    q.pending = next;
    q.version++;
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
        {status === "error" && !blocked && (
          <button type="button" className="tool-btn" onClick={retry}>
            Повторить сохранение
          </button>
        )}
      </div>
      {status === "error" && error !== null && <ErrorState compact error={error} />}
      {blocked && <div className="state compact"><div><b>{error.code === "conflict" ? "Настройки изменены в другом окне." : "Доступ к общим настройкам изменился."}</b><p>Загрузите актуальные настройки. Несохранённые изменения будут заменены данными сервера. Если вход истёк, откройте настройки заново из виджета amoCRM.</p><button type="button" className="tool-btn" onClick={onReload}>Загрузить актуальные настройки</button></div></div>}
      <fieldset disabled={blocked} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><TaskPanelForm value={value} onChange={change} employees={employees} /></fieldset>
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
