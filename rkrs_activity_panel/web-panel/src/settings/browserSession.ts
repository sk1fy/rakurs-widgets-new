// Credentials exist only in this tab's memory and are removed from the fragment
// immediately. Reloading requires reopening management from the amoCRM widget.
let credential: string | null = null;
export function consumeBrowserSession(): string | null {
  if (typeof window === "undefined") return credential;
  const [path, query = ""] = window.location.hash.split("?");
  const params = new URLSearchParams(query);
  const token = params.get("admin_session");
  if (token !== null) {
    params.delete("admin_session");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${path}${rest ? `?${rest}` : ""}`);
    credential = /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
  return credential;
}
