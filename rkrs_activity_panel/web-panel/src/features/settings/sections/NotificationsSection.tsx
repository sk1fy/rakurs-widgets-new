import { useState } from "react";
import { ApiError } from "../../../api/errors";
import type { Capability, TelegramChat } from "../../../settings/api";
import type { TelegramSettings } from "../../../settings/models";
import { ErrorState, Switch } from "../../../ui/primitives";
import { ExtensionGate, NumInput, type EditorSectionProps } from "./fields";

export interface NotificationsSectionProps extends EditorSectionProps {
  telegram: Capability;
  /** null — панель ещё не создана: бота можно подключить после сохранения. */
  panelId: string | null;
  onSubmitToken: (token: string) => Promise<{ botName: string }>;
  onDiscoverChats: () => Promise<TelegramChat[]>;
}

/**
 * «Уведомления»: Telegram-бот. Токен только для записи: поле очищается сразу
 * после отправки, в состоянии/хранилище не остаётся и обратно не показывается.
 */
export function NotificationsSection({ draft, onChange, errors, extensions, telegram, disabled, panelId, onSubmitToken, onDiscoverChats }: NotificationsSectionProps) {
  const capability = extensions.available ? telegram : extensions;
  const off = disabled || !capability.available;
  const t = draft.ext.telegram;
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"token" | "chats" | null>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const setTelegram = (p: Partial<TelegramSettings>) => onChange({ ...draft, ext: { ...draft.ext, telegram: { ...t, ...p } } });

  const submitToken = async () => {
    const value = token.trim();
    setToken("");
    if (!value) return;
    setBusy("token");
    setError(null);
    try {
      const res = await onSubmitToken(value);
      setBotName(res.botName);
      setTelegram({ tokenSet: true, chatId: null, chatTitle: null });
      setChats(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const discover = async () => {
    setBusy("chats");
    setError(null);
    try {
      setChats(await onDiscoverChats());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const chatOptions = chats ?? (t.chatId ? [{ id: t.chatId, title: t.chatTitle ?? t.chatId }] : []);

  return (
    <ExtensionGate capability={capability}>
      <div className="form">
        <div className="card" style={{ marginBottom: 0 }}>
          <h3>Telegram-бот</h3>
          <p className="sub">
            Токен хранится только на сервере. После отправки поле очищается, а токен больше не показывается.
          </p>
          {!panelId ? (
            <div className="dim small">Сохраните панель, затем откройте её снова, чтобы подключить бота.</div>
          ) : (
            <div className="form">
              <div className="row-f">
                {t.tokenSet ? <span className="chip ok">токен задан{botName ? ` · @${botName}` : ""}</span> : <span className="chip mut">токен не задан</span>}
              </div>
              <form
                className="row-f"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitToken();
                }}
              >
                <input
                  className="inp"
                  style={{ maxWidth: 360 }}
                  type="password"
                  name="telegram-bot-token"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t.tokenSet ? "Новый токен бота (заменит текущий)" : "Токен бота от @BotFather"}
                  value={token}
                  disabled={off || busy !== null}
                  onChange={(e) => setToken(e.target.value)}
                />
                <button type="submit" className="tool-btn" disabled={off || busy !== null || !token.trim()}>
                  {busy === "token" ? "Отправка…" : t.tokenSet ? "Заменить токен" : "Задать токен"}
                </button>
              </form>

              <div className="field">
                <span>Чат для уведомлений</span>
                <div className="dim small">Добавьте бота в чат и отправьте ему /start, затем нажмите «Найти чаты».</div>
                <div className="row-f">
                  <select
                    className="sel"
                    style={{ maxWidth: 360 }}
                    value={t.chatId ?? ""}
                    disabled={off || !t.tokenSet || chatOptions.length === 0}
                    onChange={(e) => {
                      const chat = chatOptions.find((c) => c.id === e.target.value);
                      setTelegram({ chatId: chat?.id ?? null, chatTitle: chat?.title ?? null });
                    }}
                  >
                    <option value="">{chatOptions.length ? "Выберите чат" : "Чаты не найдены"}</option>
                    {chatOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="tool-btn" disabled={off || !t.tokenSet || busy !== null} onClick={() => void discover()}>
                    {busy === "chats" ? "Поиск…" : "Найти чаты"}
                  </button>
                </div>
                {chats && chats.length === 0 && <div className="dim small">Бот пока не видит ни одного чата. Отправьте /start и повторите.</div>}
              </div>
              {error !== null &&
                (error instanceof ApiError && error.code === "invalid_argument" ? (
                  <div className="err small" style={{ color: "#ff8a8a" }}>Сервер не принял токен: проверьте, что он скопирован из @BotFather целиком.</div>
                ) : (
                  <ErrorState compact error={error} />
                ))}
            </div>
          )}
        </div>

        <Switch checked={t.enabled} disabled={off} onChange={(v) => setTelegram({ enabled: v })} label="Отправлять уведомления о бездействии" />
        {errors.telegram && <div className="small" style={{ color: "#ff8a8a" }}>{errors.telegram}</div>}

        <div className="row-f">
          <label className="field">
            <span>Бездействие, мин</span>
            <NumInput label="Бездействие, мин" min={1} value={t.inactivityMinutes} disabled={off} onChange={(v) => setTelegram({ inactivityMinutes: v })} />
            {errors["telegram.inactivityMinutes"] && <div className="err">{errors["telegram.inactivityMinutes"]}</div>}
          </label>
          <label className="field">
            <span>Интервал повтора, мин</span>
            <NumInput label="Интервал повтора, мин" min={1} value={t.intervalMinutes} disabled={off} onChange={(v) => setTelegram({ intervalMinutes: v })} />
            {errors["telegram.intervalMinutes"] && <div className="err">{errors["telegram.intervalMinutes"]}</div>}
          </label>
        </div>
      </div>
    </ExtensionGate>
  );
}
