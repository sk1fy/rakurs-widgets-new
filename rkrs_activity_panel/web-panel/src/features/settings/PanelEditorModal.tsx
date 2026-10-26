import { useCallback, useMemo, useState } from "react";
import { useResource } from "../../app/hooks";
import { ApiError } from "../../api/errors";
import type { Employee } from "../../domain/types";
import type { SettingsBackend } from "../../settings/api";
import type { PanelSettings } from "../../settings/models";
import { ErrorState, Modal, Tabs } from "../../ui/primitives";
import { coreChanges, draftFromPanel, draftPayload, tabOfField, validateDraft, type EditorTab, type PanelDraft } from "./draft";
import { CallsSection } from "./sections/CallsSection";
import { GeneralSection } from "./sections/GeneralSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { OperatorsSection } from "./sections/OperatorsSection";

const TABS: { value: EditorTab; label: string; ext: boolean }[] = [
  { value: "general", label: "Общие", ext: false },
  { value: "operators", label: "Операторы", ext: true },
  { value: "calls", label: "Звонки", ext: true },
  { value: "notifications", label: "Уведомления", ext: true },
];

export interface PanelEditorModalProps {
  backend: SettingsBackend;
  /** null — создание новой панели. */
  panel: PanelSettings | null;
  employees: Employee[];
  onClose: () => void;
  onSaved: (panel: PanelSettings, shareUrl: string | null) => void;
  /** Ревизия устарела (409): перечитать список панелей. */
  onConflictReload: () => void;
}

/** Создание/редактирование панели. Ядро — в core, расширения (C5) — только если доступны. */
export function PanelEditorModal({ backend, panel, employees, onClose, onSaved, onConflictReload }: PanelEditorModalProps) {
  const { extensions, telegram } = backend.capabilities;
  const pipelines = useResource(`settings:pipelines:${backend.kind}`, () => backend.listPipelines?.() ?? Promise.resolve([]));
  const initial = useMemo(() => draftFromPanel(panel), [panel]);
  const [draft, setDraft] = useState<PanelDraft>(initial);
  const [tab, setTab] = useState<EditorTab>("general");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const errors = useMemo(() => validateDraft(draft, extensions.available), [draft, extensions.available]);
  const shownErrors = submitted ? errors : {};
  const errorTabs = new Set(Object.keys(shownErrors).map(tabOfField));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const conflict = error instanceof ApiError && error.code === "conflict";

  const close = useCallback(() => {
    if (saving) return;
    if (dirty && !window.confirm("Закрыть без сохранения? Изменения будут потеряны.")) return;
    onClose();
  }, [dirty, saving, onClose]);

  const save = async () => {
    setSubmitted(true);
    const fields = Object.keys(errors);
    if (fields.length) {
      setTab(tabOfField(fields[0] as string));
      return;
    }
    const { core, ext } = draftPayload(draft, extensions.available);
    setSaving(true);
    setError(null);
    try {
      if (!panel) {
        const created = await backend.createPanel(core, ext);
        onSaved(created, created.shareUrl);
      } else {
        const changes = coreChanges(initial.core, core);
        if (!Object.keys(changes).length && !ext) {
          onClose();
          return;
        }
        onSaved(await backend.updatePanel(panel.id, panel.revision, changes, ext), null);
      }
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const common = { pipelineCatalog: pipelines.data ?? [], draft, onChange: setDraft, employees, errors: shownErrors, extensions, disabled: saving };

  return (
    <Modal
      wide
      title={panel ? `Панель «${panel.name}»` : "Новая панель"}
      onClose={close}
      footer={
        <>
          {submitted && Object.keys(errors).length > 0 && <span className="small" style={{ color: "#ff8a8a", marginRight: "auto", alignSelf: "center" }}>Исправьте ошибки в отмеченных вкладках</span>}
          <button type="button" className="tool-btn" disabled={saving} onClick={close}>
            Отмена
          </button>
          <button type="button" className="tool-btn primary" disabled={saving || conflict} onClick={() => void save()}>
            {saving ? "Сохранение…" : panel ? "Сохранить" : "Создать панель"}
          </button>
        </>
      }
    >
      <div className="form">
        {pipelines.status === "error" && <ErrorState error={pipelines.error} onRetry={pipelines.reload} compact />}
        <Tabs
          value={tab}
          onChange={setTab}
          items={TABS.map((t) => ({
            value: t.value,
            label: (
              <>
                {t.label}
                {errorTabs.has(t.value) && <span style={{ color: "#ff8a8a" }}> •</span>}
              </>
            ),
            title: t.ext && !extensions.available ? `Не поддерживается источником (${extensions.contract})` : undefined,
          }))}
        />

        {conflict && (
          <div className="state error" role="alert">
            <div>
              <b>Панель изменили в другом окне</b>
              <div className="dim small">Ваши изменения не сохранены: ревизия устарела. Перечитайте панель и внесите правки заново.</div>
            </div>
            <button type="button" className="tool-btn" onClick={onConflictReload}>
              Перечитать
            </button>
          </div>
        )}
        {error !== null && !conflict && <ErrorState compact error={error} onRetry={() => void save()} />}

        {tab === "general" && <GeneralSection {...common} />}
        {tab === "operators" && <OperatorsSection {...common} />}
        {tab === "calls" && <CallsSection {...common} />}
        {tab === "notifications" && (
          <NotificationsSection
            {...common}
            telegram={telegram}
            panelId={panel?.id ?? null}
            onSubmitToken={(token) => (panel ? backend.setTelegramToken(panel.id, token) : Promise.reject(new Error("panel is not saved")))}
            onDiscoverChats={() => (panel ? backend.discoverTelegramChats(panel.id) : Promise.resolve([]))}
          />
        )}
      </div>
    </Modal>
  );
}
