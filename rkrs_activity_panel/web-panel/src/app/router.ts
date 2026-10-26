// Hash-маршрутизация: ключ просмотра остаётся во фрагменте URL и не уходит
// на сервер ни в запросе, ни в Referer.

import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "dashboard"; viewKey: string; date: string | null }
  | { name: "employee"; viewKey: string; employeeId: number; date: string | null }
  | { name: "operator"; viewKey: string; employeeId: number }
  | { name: "missed"; viewKey: string }
  | { name: "settings"; viewKey: string | null; tab: string | null }
  | { name: "not-found" };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [path = "/", query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date") : null;
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { name: "home" };
  if (parts[0] === "settings") return { name: "settings", viewKey: null, tab: parts[1] ?? null };
  if (parts[0] !== "p" || !parts[1]) return { name: "not-found" };
  const viewKey = parts[1];
  const rest = parts.slice(2);
  if (!rest.length) return { name: "dashboard", viewKey, date };
  const id = Number(rest[1]);
  if (rest[0] === "employee" && Number.isInteger(id) && id > 0) return { name: "employee", viewKey, employeeId: id, date };
  if (rest[0] === "operator" && Number.isInteger(id) && id > 0) return { name: "operator", viewKey, employeeId: id };
  if (rest[0] === "missed") return { name: "missed", viewKey };
  if (rest[0] === "settings") return { name: "settings", viewKey, tab: rest[1] ?? null };
  return { name: "not-found" };
}

export function href(route: Route): string {
  const k = (key: string) => encodeURIComponent(key);
  const q = (date: string | null) => (date ? `?date=${date}` : "");
  switch (route.name) {
    case "home": return "#/";
    case "dashboard": return `#/p/${k(route.viewKey)}${q(route.date)}`;
    case "employee": return `#/p/${k(route.viewKey)}/employee/${route.employeeId}${q(route.date)}`;
    case "operator": return `#/p/${k(route.viewKey)}/operator/${route.employeeId}`;
    case "missed": return `#/p/${k(route.viewKey)}/missed`;
    case "settings": return route.viewKey ? `#/p/${k(route.viewKey)}/settings${route.tab ? `/${route.tab}` : ""}` : `#/settings${route.tab ? `/${route.tab}` : ""}`;
    default: return "#/";
  }
}

export function navigate(route: Route, replace = false) {
  const next = href(route);
  if (replace) history.replaceState(null, "", next);
  else location.hash = next;
  if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  return parseHash(hash);
}
