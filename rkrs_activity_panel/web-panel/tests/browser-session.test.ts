import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("consumes browser credential only from fragment and erases it from browser history", async () => {
 const replaceState = vi.fn(); const token="a".repeat(43);
 vi.stubGlobal("window", { location: { hash: `#/settings/panels?admin_session=${token}`, pathname:"/", search:"" }, history:{replaceState} });
 const {consumeBrowserSession}=await import("../src/settings/browserSession");
 expect(consumeBrowserSession()).toBe(token);
 expect(replaceState).toHaveBeenCalledWith(null,"","/#/settings/panels");
});
it("does not accept malformed credentials", async()=>{
 vi.stubGlobal("window", { location:{hash:"#/settings?admin_session=bad",pathname:"/",search:""},history:{replaceState:vi.fn()} });
 const {consumeBrowserSession}=await import("../src/settings/browserSession");expect(consumeBrowserSession()).toBeNull();
});
it("retains credentials only in memory during navigation and removes duplicate URL parameters", async () => {
  const token = "b".repeat(43);
  const location = { hash: `#/settings/task-panel?keep=1&admin_session=${token}&admin_session=bad`, pathname: "/", search: "" };
  const replaceState = vi.fn();
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { setItem });
  vi.stubGlobal("sessionStorage", { setItem });
  vi.stubGlobal("window", { location, history: { replaceState } });
  const { consumeBrowserSession } = await import("../src/settings/browserSession");
  expect(consumeBrowserSession()).toBe(token);
  expect(replaceState).toHaveBeenCalledWith(null, "", "/#/settings/task-panel?keep=1");
  location.hash = "#/settings/panels";
  expect(consumeBrowserSession()).toBe(token);
  expect(setItem).not.toHaveBeenCalled();
});
