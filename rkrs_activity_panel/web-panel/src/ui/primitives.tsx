import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { describeError } from "../api/errors";
import { CONTRACTS, type ContractId } from "../api/source";
import type { DataMeta } from "../domain/types";
import { hhmm } from "../domain/time";
import { Icon, type IconName } from "./Icon";

const AVATAR_TONES = ["b", "p", "g", "o", "t", "r", "y"] as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Фото сотрудника из amoCRM; без фото или при ошибке загрузки — инициалы. */
export function Avatar({ id, name, url, accent }: { id: number; name: string; url?: string | null; accent?: string }) {
  const [broken, setBroken] = useState(false);
  const style = accent ? { boxShadow: `0 0 0 2px ${accent}` } : undefined;
  if (url && !broken) {
    return (
      <div className="ava photo" style={style}>
        <img src={url} alt={name} loading="lazy" onError={() => setBroken(true)} />
      </div>
    );
  }
  return (
    <div className={`ava ${AVATAR_TONES[id % AVATAR_TONES.length]}`} style={style}>
      {initials(name)}
    </div>
  );
}

/** Значок «?» с подсказкой по наведению и фокусу (вместо нативного title). */
export function HelpTip({ label, children, align = "right", className = "" }: { label: string; children: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <span className={`help ${className}`} tabIndex={0} role="button" aria-label={label}>
      ?
      <span className={`help-pop help-${align}`} role="tooltip">
        {children}
      </span>
    </span>
  );
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

export function EmptyState({ title, hint, icon = "info" }: { title: string; hint?: ReactNode; icon?: IconName }) {
  return (
    <div className="state empty">
      <Icon name={icon} />
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

/** Иконка ↗ — переход в amoCRM; без адреса не рисуется. */
export function ExtLink({ href, title }: { href: string | null; title: string }) {
  if (!href) return null;
  return (
    <a className="ext-link" href={href} target="_blank" rel="noreferrer noopener" title={title} aria-label={title} onClick={(e) => e.stopPropagation()}>
      <Icon name="ext" />
    </a>
  );
}

/** Позиция окна у элемента: относительно контейнера-якоря, не шире него. */
export function anchorAt(e: { currentTarget: EventTarget }, hostSelector: string, width = 340): { x: number; y: number } {
  const el = e.currentTarget as HTMLElement;
  const seg = el.getBoundingClientRect();
  const host = el.closest(hostSelector)?.getBoundingClientRect();
  const hostWidth = host?.width ?? window.innerWidth;
  return { x: Math.max(0, Math.min(seg.left - (host?.left ?? 0), hostWidth - Math.min(width, hostWidth))), y: seg.bottom - (host?.top ?? 0) + 6 };
}

/** Окно у отрезка графика: заголовок, ×, закрытие кликом снаружи и Esc. */
export function AnchoredPop({ x, y, title, onClose, children }: { x: number; y: number; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="tl-pop" ref={ref} style={{ left: x, top: y }} role="dialog" aria-label={typeof title === "string" ? title : undefined}>
      <h4>
        <span>{title}</span>
        <button type="button" className="link-btn" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={14} />
        </button>
      </h4>
      {children}
    </div>
  );
}

/** Скелетон загрузки: блоки той же высоты, что и будущее содержимое, с переливом. */
export function Skeleton({ height = 16, width, radius = 6 }: { height?: number; width?: number | string; radius?: number }) {
  return <span className="skel" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}
