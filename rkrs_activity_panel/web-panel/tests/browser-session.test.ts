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
