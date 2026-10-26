import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { describeError } from "../api/errors";
import { CONTRACTS, type ContractId } from "../api/source";
import type { DataMeta } from "../domain/types";
import { hhmm } from "../domain/time";
import { Icon } from "./Icon";

const AVATAR_TONES = ["b", "p", "g", "o", "t", "r", "y"] as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Avatar({ id, name }: { id: number; name: string }) {
  return <div className={`ava ${AVATAR_TONES[id % AVATAR_TONES.length]}`}>{initials(name)}</div>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`sw${checked ? " on" : ""}`} disabled={disabled} onClick={() => onChange(!checked)}>
      <i />
      <span>{label}</span>
    </button>
  );
}

/** Выпадающая панель по клику; закрывается кликом снаружи и Esc. */
export function Popover({ trigger, children, align = "left", className = "", label }: { trigger: (open: boolean) => ReactNode; children: ReactNode | ((close: () => void) => ReactNode); align?: "left" | "right"; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className={`pop-wrap ${className}`} ref={ref}>
      <button type="button" className="pop-trigger" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {trigger(open)}
      </button>
      {open && (
        <div className={`pop pop-${align}`} id={id} role="dialog">
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-h">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="state loading" role="status">
      <span className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const d = describeError(error);
  return (
    <div className={`state error${compact ? " compact" : ""}`} role="alert">
      <Icon name="alert" />
      <div>
        <b>{d.title}</b>
        <div className="dim small">
          {d.hint}
          {d.requestId && <> · request id: <code>{d.requestId}</code></>}
        </div>
      </div>
      {onRetry && d.retryable && (
        <button type="button" className="tool-btn" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="state empty">
      <Icon name="info" />
      <div>
        <b>{title}</b>
        {hint && <div className="dim small">{hint}</div>}
      </div>
    </div>
  );
}

/** Блок без источника: явно называет недостающий контракт. */
export function NotConnected({ contract, reason, compact }: { contract: ContractId; reason?: string; compact?: boolean }) {
  return (
    <div className={`state nc${compact ? " compact" : ""}`}>
      <Icon name="link" />
      <div>
        <b>Источник не подключён · {contract}</b>
        <div className="dim small">{reason ?? CONTRACTS[contract]}</div>
      </div>
    </div>
  );
}

/** Метка происхождения данных: синтетика, частичные, устаревшие. */
export function MetaBadges({ meta, timeZone }: { meta: DataMeta | null | undefined; timeZone: string }) {
  if (!meta) return null;
  return (
    <span className="chips meta">
      {meta.source === "fixture" && (
        <span className="chip warn" title="Синтетические данные режима разработки, не из amoCRM">
          синтетика
        </span>
      )}
      {meta.partial && (
        <span className="chip warn" title={meta.note ?? "Часть данных не получена"}>
          неполные данные
        </span>
      )}
      {meta.stale && (
        <span className="chip bad" title={meta.note ?? "Сбор событий отстаёт"}>
          данные устарели
        </span>
      )}
      {meta.coverage === "unknown" && meta.source !== "fixture" && (
        <span className="chip mut" title="amocrm-pro не подтвердил полноту истории за период">
          покрытие не подтверждено
        </span>
      )}
      <span className="chip mut" title="Момент среза данных">
        срез {hhmm(meta.snapshotAt, timeZone)}
      </span>
    </span>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; disabled?: boolean; title?: string }[] }) {
  return (
    <div className="seg" role="tablist">
      {items.map((it) => (
        <button key={it.value} type="button" role="tab" aria-selected={value === it.value} className={value === it.value ? "on" : ""} disabled={it.disabled} title={it.title} onClick={() => onChange(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
