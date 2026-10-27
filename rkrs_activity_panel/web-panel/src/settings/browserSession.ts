// Tab-scoped storage survives reloads; the server remains authoritative for expiry.
const STORAGE_KEY = "rkrs_activity_admin_session_v1";
const MAX_AGE_MS = 30 * 60 * 1000;
let credential: string | null = null;
let expiresAt = 0;
export function clearBrowserSession(expected?: string): void {
  if (expected && credential && credential !== expected) return;
  credential = null;
  expiresAt = 0;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage is optional. */ }
}
export function consumeBrowserSession(): string | null {
  if (typeof window === "undefined") return credential;
  const [path, query = ""] = window.location.hash.split("?");
  const params = new URLSearchParams(query);
  const token = params.get("admin_session");
  if (token !== null) {
    params.delete("admin_session");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${path}${rest ? `?${rest}` : ""}`);
    clearBrowserSession();
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
      credential = token;
      expiresAt = Date.now() + MAX_AGE_MS;
      try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt })); } catch { /* Keep memory fallback. */ }
    }
  } else if (!credential) {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
      if (saved && /^[A-Za-z0-9_-]{43}$/.test(saved.token) && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now() && saved.expiresAt <= Date.now() + MAX_AGE_MS) {
        credential = saved.token;
        expiresAt = saved.expiresAt;
      } else clearBrowserSession();
    } catch { clearBrowserSession(); }
  }
  if (credential && Date.now() >= expiresAt) clearBrowserSession();
  return credential;
}
