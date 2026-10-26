import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { DataModeBanner } from "./DataModeBanner";
import type { DataMode } from "../api";
import { href } from "./router";

/** Шапка макета: логотип, название, слот для иконок и кнопка «Настройки». */
export function AppHeader({ mode, panelName, viewKey, actions, showSettings = true }: { mode: DataMode; panelName?: string; viewKey: string | null; actions?: ReactNode; showSettings?: boolean }) {
  return (
    <>
      <header className="hdr">
        <a className="logo" href={viewKey ? href({ name: "dashboard", viewKey, date: null }) : href({ name: "home" })}>
          Rakurs
        </a>
        <div className="div" />
        <div className="ttl">Контроль активности</div>
        {panelName && <div className="pname" title={panelName}>{panelName}</div>}
        <div className="sp" />
        {actions && <div className="hicons">{actions}</div>}
        {showSettings && (
          <a className="btn" href={href({ name: "settings", viewKey, tab: null })}>
            <Icon name="gear" />
            Настройки
          </a>
        )}
      </header>
      <DataModeBanner mode={mode} />
    </>
  );
}
