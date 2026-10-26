import { useMemo, useState } from "react";
import { ApiError } from "../../api/errors";
import { useResource } from "../../app/hooks";
import type { SettingsBackend } from "../../settings/api";
import type { Employee } from "../../domain/types";
import type { PanelSettings } from "../../settings/models";
import { Icon } from "../../ui/Icon";
import { Avatar, EmptyState, ErrorState, Modal, NotConnected, Spinner } from "../../ui/primitives";
import { formatUpdatedAt } from "./draft";
import { PanelEditorModal } from "./PanelEditorModal";

type EditorState = { mode: "create" } | { mode: "edit"; panel: PanelSettings } | null;

/** Ссылка показывается только в этом окне и нигде не сохраняется. */
interface IssuedLink {
  panelName: string;
  url: string | null;
}

/** Поиск по панелям включается с трёх символов (PanelsSection.vue). */
const SEARCH_MIN = 3;
const STACK_SIZE = 3;

/** Первые сотрудники панели аватарами и «+N»; по клику — окно со всеми (PanelTable.vue). */
function EmployeeStack({ ids, byId, onShowAll }: { ids: number[]; byId: Map<number, Employee>; onShowAll: () => void }) {
  if (!ids.length) return <span className="dim">—</span>;
  const name = (id: number) => byId.get(id)?.name ?? `#${id}`;
  return (
    <div className="ava-stack">
      {ids.slice(0, STACK_SIZE).map((id) => (
        <span key={id} title={name(id)}>
          <Avatar id={id} name={name(id)} url={byId.get(id)?.avatarUrl} />
        </span>
      ))}
      <button type="button" className="ava-more" onClick={onShowAll} title="Все сотрудники панели">
        {ids.length > STACK_SIZE ? `+${ids.length - STACK_SIZE}` : ids.length}
      </button>
    </div>
  );
}

/** «Панели»: общие настройки панелей аккаунта (management API). */
export function PanelsSection({ backend, notify }: { backend: SettingsBackend; notify: (message: string) => void }) {
  const manage = backend.capabilities.managePanels;
  if (!manage.available) {
    return <NotConnected contract={manage.contract} reason={manage.reason} />;
  }
  return <PanelsManager backend={backend} notify={notify} />;
}

function PanelsManager({ backend, notify }: { backend: SettingsBackend; notify: (message: string) => void }) {
  const panels = useResource(`settings:panels:${backend.kind}`, () => backend.listPanels());
  const employees = useResource(`settings:employees:${backend.kind}`, () => backend.listEmployees());
  const [editor, setEditor] = useState<EditorState>(null);
  const [rotateTarget, setRotateTarget] = useState<PanelSettings | null>(null);
  const [link, setLink] = useState<IssuedLink | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [membersOf, setMembersOf] = useState<PanelSettings | null>(null);
  const byId = useMemo(() => new Map((employees.data ?? []).map((e) => [e.id, e])), [employees.data]);
  const q = query.trim().toLowerCase();
  const shown = panels.data && q.length >= SEARCH_MIN ? panels.data.filter((p) => p.name.toLowerCase().includes(q)) : panels.data;

  const handleActionError = (e: unknown) => {
    if (e instanceof ApiError && e.code === "conflict") {
      panels.reload();
      notify("Панель изменили в другом окне — список обновлён, повторите действие");
      return;
    }
    setActionError(e);
  };

  const toggleEnabled = async (p: PanelSettings) => {
    if (p.enabled && !window.confirm(`Выключить панель «${p.name}»? Она перестанет открываться по ссылке, данные и настройки сохранятся.`)) return;
    setBusyId(p.id);
    setActionError(null);
    try {
      await backend.updatePanel(p.id, p.revision, { enabled: !p.enabled }, null);
      panels.reload();
      notify(p.enabled ? "Панель выключена" : "Панель включена");
    } catch (e) {
      handleActionError(e);
    } finally {
      setBusyId(null);
    }
  };

  const rotate = async (p: PanelSettings) => {
    setBusyId(p.id);
    setActionError(null);
    try {
      const res = await backend.rotateShareLink(p.id);
      setRotateTarget(null);
      setLink({ panelName: p.name, url: res.shareUrl });
      panels.reload();
    } catch (e) {
      setRotateTarget(null);
      handleActionError(e);
    } finally {
      setBusyId(null);
    }
  };

  const employeesReady = employees.status === "ready" && employees.data !== null;

  return (
    <div className="form">
      <div className="card">
        <div className="ch">
          <div>
            <h3>Панели аккаунта</h3>
            <p className="sub">Общие настройки: их видят все, кто открывает панель по ссылке. Удаления нет — amocrm-pro позволяет только выключить панель.</p>
          </div>
          <button type="button" className="tool-btn primary" disabled={!employeesReady} onClick={() => setEditor({ mode: "create" })}>
            <Icon name="plus" />
            Создать панель
          </button>
        </div>

        {employees.status === "error" && <ErrorState compact error={employees.error} onRetry={employees.reload} />}
        {actionError !== null && <ErrorState compact error={actionError} />}

        {panels.status === "error" && <ErrorState error={panels.error} onRetry={panels.reload} />}
        {(panels.status === "loading" || panels.status === "idle") && <Spinner label="Загрузка панелей…" />}
        {panels.data && panels.data.length === 0 && <EmptyState icon="user" title="Пока нет созданных панелей" hint="Нажмите «Создать панель», чтобы создать первую, и отправьте ссылку руководителям." />}
        {panels.data && panels.data.length > 0 && (
          <div className="srch inline-srch">
            <Icon name="search" />
            <input type="search" placeholder="Поиск по панелям" aria-label="Поиск по панелям" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="srch-x" aria-label="Очистить поиск" onClick={() => setQuery("")}>
                <Icon name="close" />
              </button>
            )}
          </div>
        )}
        {panels.data && panels.data.length > 0 && q.length > 0 && q.length < SEARCH_MIN && <div className="dim small">Введите не меньше {SEARCH_MIN} символов</div>}
        {shown && panels.data && panels.data.length > 0 && shown.length === 0 && <div className="dim small">Панели по запросу «{query.trim()}» не найдены</div>}
        {shown && shown.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Сотрудники</th>
                  <th>Окно</th>
                  <th>Часовой пояс</th>
                  <th>Статус</th>
                  <th>Ревизия</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className={p.enabled ? "" : "dim"}>
                    <td>
                      <b>{p.name}</b>
                      {!p.shareUrlIssued && <div className="dim small">ссылка не выпущена</div>}
                    </td>
                    <td>{employeesReady ? <EmployeeStack ids={p.employeeIds} byId={byId} onShowAll={() => setMembersOf(p)} /> : <span className="num">{p.employeeIds.length}</span>}</td>
                    <td className="num">
                      {p.displayWindow.from}–{p.displayWindow.to}
                    </td>
                    <td>{p.timezone}</td>
                    <td>{p.enabled ? <span className="chip ok">включена</span> : <span className="chip mut">выключена</span>}</td>
                    <td className="num">
                      <div>№ {p.revision}</div>
                      <div className="dim small">{formatUpdatedAt(p.updatedAt, p.timezone)}</div>
                    </td>
                    <td>
                      <div className="row-f" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        <button type="button" className="tool-btn" disabled={!employeesReady || busyId === p.id} onClick={() => setEditor({ mode: "edit", panel: p })}>
                          <Icon name="edit" />
                          Изменить
                        </button>
                        <button type="button" className="tool-btn" disabled={busyId === p.id} onClick={() => setRotateTarget(p)} title="Выпустить новую ссылку просмотра">
                          <Icon name="link" />
                          {p.shareUrlIssued ? "Новая ссылка" : "Выпустить ссылку"}
                        </button>
                        <button type="button" className={`tool-btn${p.enabled ? " danger" : ""}`} disabled={busyId === p.id} onClick={() => void toggleEnabled(p)}>
                          {p.enabled ? "Выключить" : "Включить"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {panels.refreshing && <div className="dim small" style={{ marginTop: 8 }}>Обновление…</div>}
      </div>

      {editor && employees.data && (
        <PanelEditorModal
          backend={backend}
          panel={editor.mode === "edit" ? editor.panel : null}
          employees={employees.data}
          onClose={() => setEditor(null)}
          onSaved={(saved, shareUrl) => {
            setEditor(null);
            panels.reload();
            notify(editor.mode === "create" ? "Панель создана" : "Панель сохранена");
            if (editor.mode === "create") setLink({ panelName: saved.name, url: shareUrl });
          }}
          onConflictReload={() => {
            setEditor(null);
            panels.reload();
            notify("Список панелей перечитан — откройте панель заново");
          }}
        />
      )}

      {rotateTarget && (
        <Modal
          title="Выпустить новую ссылку?"
          onClose={() => busyId === null && setRotateTarget(null)}
          footer={
            <>
              <button type="button" className="tool-btn" disabled={busyId !== null} onClick={() => setRotateTarget(null)}>
                Отмена
              </button>
              <button type="button" className="tool-btn danger" disabled={busyId !== null} onClick={() => void rotate(rotateTarget)}>
                {busyId ? "Выпуск…" : "Выпустить новую ссылку"}
              </button>
            </>
          }
        >
          <p>
            Панель «{rotateTarget.name}». {rotateTarget.shareUrlIssued ? "Старая ссылка сразу перестанет работать у всех, кому её отправляли." : "Будет выпущена ссылка просмотра."}
          </p>
          <p className="dim small" style={{ marginTop: 8 }}>
            Новую ссылку покажем один раз — скопируйте её и отправьте заново.
          </p>
        </Modal>
      )}

      {link && <ShareLinkModal link={link} onClose={() => setLink(null)} />}

      {membersOf && (
        <Modal title={`Сотрудники панели «${membersOf.name}» (${membersOf.employeeIds.length})`} onClose={() => setMembersOf(null)}>
          <div className="ava-list">
            {membersOf.employeeIds.map((id) => (
              <div key={id} className="ava-li">
                <Avatar id={id} name={byId.get(id)?.name ?? `#${id}`} url={byId.get(id)?.avatarUrl} />
                <span>{byId.get(id)?.name ?? `Сотрудник #${id}`}</span>
                {byId.get(id)?.groupName && <span className="dim small">{byId.get(id)?.groupName}</span>}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Подсказка для браузеров, где clipboard API часто недоступен (PanelTable.vue). */
function browserCopyHint(): { browser: string; keys: string } | null {
  const ua = navigator.userAgent;
  if (/firefox/i.test(ua)) return { browser: "Firefox", keys: "Ctrl+C" };
  if (/iphone|ipad|ipod/i.test(ua) || (/safari/i.test(ua) && !/chrome|chromium|crios|android/i.test(ua))) return { browser: "Safari", keys: "⌘+C" };
  return null;
}

function ShareLinkModal({ link, onClose }: { link: IssuedLink; onClose: () => void }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const hint = browserCopyHint();
  const copy = async () => {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };
  return (
    <Modal
      title="Ссылка на панель"
      onClose={onClose}
      footer={
        <button type="button" className="tool-btn primary" onClick={onClose}>
          Готово
        </button>
      }
    >
      <div className="form">
        <p>Панель «{link.panelName}».</p>
        {link.url ? (
          <>
            <div className="row-f" style={{ flexWrap: "nowrap" }}>
              <input className="inp" readOnly value={link.url} aria-label="Ссылка на панель" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className={`tool-btn${copied === "ok" ? " copied" : ""}`} onClick={() => void copy()}>
                <Icon name={copied === "ok" ? "ok" : "copy"} />
                {copied === "ok" ? "Скопировано!" : "Копировать"}
              </button>
            </div>
            {hint && (
              <div className="copy-hint dim small">
                <b>Подсказка для {hint.browser}:</b> нажмите на ссылку выше, чтобы выделить её, затем нажмите <code>{hint.keys}</code>.
              </div>
            )}
            {copied === "fail" && <div className="small" style={{ color: "#ff8a8a" }}>Не удалось скопировать — выделите ссылку и скопируйте вручную</div>}
            <div className="dim small">Ссылка показывается только сейчас и нигде не сохраняется. Если потеряете — выпустите новую.</div>
          </>
        ) : (
          <div className="dim small">Источник не вернул ссылку. Выпустите новую ссылку из списка панелей.</div>
        )}
      </div>
    </Modal>
  );
}
