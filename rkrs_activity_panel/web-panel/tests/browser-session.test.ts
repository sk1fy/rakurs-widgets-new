import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });
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
it("retains tab session across navigation and removes duplicate URL parameters", async () => {
  const token = "b".repeat(43);
  const location = { hash: `#/settings/task-panel?keep=1&admin_session=${token}&admin_session=bad`, pathname: "/", search: "" };
  const replaceState = vi.fn();
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { setItem });
  vi.stubGlobal("sessionStorage", { setItem });
  vi.stubGlobal("window", { location, history: { replaceState }, sessionStorage: { setItem, removeItem: vi.fn(), getItem: vi.fn() } });
  const { consumeBrowserSession } = await import("../src/settings/browserSession");
  expect(consumeBrowserSession()).toBe(token);
  expect(replaceState).toHaveBeenCalledWith(null, "", "/#/settings/task-panel?keep=1");
  location.hash = "#/settings/panels";
  expect(consumeBrowserSession()).toBe(token);
  expect(setItem).toHaveBeenCalledTimes(1);
});

it("restores a valid tab session after reload and clears it on expiry", async () => {
 const values = new Map<string,string>();
 const storage = {getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => values.set(key,value), removeItem: (key:string) => values.delete(key)};
 const location = {hash:`#/settings/panels?admin_session=${"c".repeat(43)}`,pathname:"/",search:""};
 vi.stubGlobal("window",{location,history:{replaceState:vi.fn()},sessionStorage:storage});
 const first = await import("../src/settings/browserSession");expect(first.consumeBrowserSession()).toBe("c".repeat(43));
 location.hash = "#/settings/panels";vi.resetModules();
 const second = await import("../src/settings/browserSession");expect(second.consumeBrowserSession()).toBe("c".repeat(43));
 vi.spyOn(Date,"now").mockReturnValue(Date.now()+31*60*1000);
 expect(second.consumeBrowserSession()).toBeNull();expect(values.size).toBe(0);vi.restoreAllMocks();
});
it("rejects corrupt or overlong stored sessions",async()=>{
 vi.stubGlobal("window",{location:{hash:"#/settings/panels"},sessionStorage:{getItem:()=>JSON.stringify({token:"d".repeat(43),expiresAt:Date.now()+86400000}),removeItem:vi.fn()}});
 const {consumeBrowserSession}=await import("../src/settings/browserSession");expect(consumeBrowserSession()).toBeNull();
});

it("a late rejection cannot clear a newer browser session", async () => {
 const values = new Map<string,string>();
 const storage = {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)};
 const location={hash:`#/settings/panels?admin_session=${"e".repeat(43)}`,pathname:"/",search:""};
 vi.stubGlobal("window",{location,history:{replaceState:vi.fn()},sessionStorage:storage});
 const session=await import("../src/settings/browserSession");session.consumeBrowserSession();
 location.hash=`#/settings/panels?admin_session=${"f".repeat(43)}`;session.consumeBrowserSession();location.hash="#/settings/panels";
 session.clearBrowserSession("e".repeat(43));expect(session.consumeBrowserSession()).toBe("f".repeat(43));expect(values.size).toBe(1);
 session.clearBrowserSession("f".repeat(43));expect(session.consumeBrowserSession()).toBeNull();expect(values.size).toBe(0);
});
it("keeps memory fallback when tab storage is unavailable",async()=>{
 const location={hash:`#/settings/panels?admin_session=${"g".repeat(43)}`,pathname:"/",search:""};
 vi.stubGlobal("window",{location,history:{replaceState:vi.fn()},get sessionStorage(){throw Error("blocked");}});
 const session=await import("../src/settings/browserSession");expect(session.consumeBrowserSession()).toBe("g".repeat(43));location.hash="#/settings/panels";expect(session.consumeBrowserSession()).toBe("g".repeat(43));
});
