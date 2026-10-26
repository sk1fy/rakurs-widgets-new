import { useState } from "react";
import type { DataMode } from "../api";
import { href } from "./router";
import { DataModeBanner } from "./DataModeBanner";

/** Стартовая страница без ключа: вставить ссылку на панель или открыть демо. */
export function HomePage({ mode, notFound }: { mode: DataMode; notFound?: boolean }) {
  const [value, setValue] = useState("");
  const open = () => {
    const m = value.trim().match(/#\/p\/([^/?#]+)/);
    const key = m?.[1] ?? value.trim();
    if (key) location.hash = href({ name: "dashboard", viewKey: decodeURIComponent(key), date: null });
  };
  return (
    <>
      <header className="hdr">
        <span className="logo">Rakurs</span>
        <div className="div" />
        <div className="ttl">Контроль активности</div>
      </header>
      <DataModeBanner mode={mode} />
      <div className="page-state">
        <div className="card">
          <h3>{notFound ? "Страница не найдена" : "Откройте панель по ссылке"}</h3>
          <p className="sub">Ссылка на панель выдаётся администратором и содержит ключ просмотра после <code>#/p/</code>.</p>
          <form
            className="row-f"
            onSubmit={(e) => {
              e.preventDefault();
              open();
            }}
          >
            <input className="inp" style={{ flex: 1, minWidth: 220 }} placeholder="Вставьте ссылку на панель" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Ссылка на панель" />
            <button type="submit" className="tool-btn primary">
              Открыть
            </button>
          </form>
          {mode === "fixtures" && (
            <p className="sub" style={{ marginTop: 12 }}>
              Режим разработки: <a href={href({ name: "dashboard", viewKey: "demo", date: null })}>открыть демо-панель на синтетических данных</a>
            </p>
          )}
          <p className="sub" style={{ marginTop: 12 }}>
            <a href={href({ name: "settings", viewKey: null, tab: null })}>Управление панелями</a>
          </p>
        </div>
      </div>
    </>
  );
}
