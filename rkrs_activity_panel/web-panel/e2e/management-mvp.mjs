/* global document */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

// Actual production React app + actual employee UMD. Only the HTTP owner is a
// fixture; no request reaches amoCRM/Core and no real credentials are used.
export async function managementMvp(browser, check, out) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const widgetRoot = fileURLToPath(new URL("../../widget-app/", import.meta.url));
  const server = await preview({ configFile: false, root, preview: { host: "127.0.0.1", port: 0 }, build: { outDir: "dist" } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--mode", "widget"], { cwd: widgetRoot, env: { ...process.env, VITE_ACTIVITY_API_ORIGIN: "https://api.example.invalid", VITE_ACTIVITY_APP_ORIGIN: base }, stdio: "pipe" });
  const bundle = readFileSync(`${widgetRoot}/dist/rkrs-activity.umd.js`);
  const context = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const credential = "m".repeat(43);
  let admin = true, forcedStatus = 0, holdSave = false, releaseSave;
  let viewReads = 0, viewerAllowed = true;
  let settings = { enabled: true, employee_ids: [7], consider_future_tasks: false, include_related_deals: true, priority_keys: ["today_timed", "urgent"], revision: 3 };
  const saves = [], managementCalls = [], issued = [];
  const html = `<!doctype html><meta charset="utf-8"><title>MVP widget fixture</title><main id="app"><h1>Искусственный SDK-стенд</h1></main><script src="/fixture-widget.js"></script><script>
    const widget={get_settings:()=>({widget_code:'fixture_activity'}),$authorizedAjax(options){let done,fail;const req={done(fn){done=fn;return req},fail(fn){fail=fn;return req}};queueMicrotask(async()=>{try{const url=new URL(options.url);const r=await fetch(url.pathname+url.search,{method:options.method,headers:{'Content-Type':'application/json',...options.headers},body:options.data});const value=await r.json();r.ok?done(value):fail({status:r.status,responseJSON:value})}catch(e){fail({status:0})}});return req}};
    RkrsActivityPrototype.registerWidgetInstance(widget);RkrsActivityPrototype.mountPanel({widget,accountId:42,userId:7,mode:'live'});
    </script>`;
  try {
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const json = (body, status = 200) => route.fulfill({ status, json: body, headers: { "Access-Control-Allow-Origin": "*" } });
      if (path === "/widget-fixture") return route.fulfill({ contentType: "text/html", body: html });
      if (path === "/fixture-widget.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
      if (path.startsWith("/api/v4/")) return json({ _embedded: { tasks: [] } });
      if (path.startsWith("/api/v1/widget/activity/")) {
        if (path.endsWith("/browser-session")) {
          if (!admin) return json({ error: { code: "permission_denied", message: "Нужны права администратора" } }, 403);
          issued.push(request.postDataJSON());
          return json({ url: `${base}/#/settings/panels?admin_session=${credential}` });
        }
        if (path.endsWith("/state")) return json({ current: null, enabled: settings.enabled && settings.employee_ids.includes(7), settings });
        return json({ items: [], snapshot_at: Math.floor(Date.now() / 1000) });
      }
      if (!path.startsWith("/api/v1/activity/")) return route.continue();
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" } });
      if (path === "/api/v1/activity/view/panel") {
        viewReads++;
        if (!viewerAllowed || request.headers().authorization !== "Bearer viewer-fixture") return json({ error: { code: "permission_denied", message: "viewer revoked" } }, 403);
        return json({ name: `Тестовая панель ${settings.revision}`, timezone: "Europe/Moscow", display_window: { from: "09:00", to: "18:00" }, employees: [{ id: 7, name: "Никита Тест", group_id: 1, group_name: "Тестовый отдел" }], task_panel_enabled: settings.enabled });
      }
      managementCalls.push({ path, method: request.method(), bearer: request.headers().authorization });
      if (request.headers().authorization !== `Bearer ${credential}` || !admin) return json({ error: { code: "permission_denied", message: "Администратор не подтверждён" } }, 403);
      if (path.endsWith("/panels")) return json({ panels: [] });
      if (path.endsWith("/employees")) return json({ users: [{ id: 7, name: "Никита Тест", group_id: 1, group_name: "Тестовый отдел" }, { id: 8, name: "Мария Тест", group_id: 1, group_name: "Тестовый отдел" }] });
      if (!path.endsWith("/task-panel")) return json({ error: { code: "not_found" } }, 404);
      if (request.method() === "GET") return json(settings);
      saves.push(request.postDataJSON());
      if (holdSave) { holdSave = false; await new Promise((resolve) => { releaseSave = resolve; }); }
      if (forcedStatus) {
        const status = forcedStatus; forcedStatus = 0;
        return json({ error: { code: status === 409 ? "conflict" : "permission_denied", message: "fixture refusal" } }, status);
      }
      const body = request.postDataJSON();
      if (body.revision !== settings.revision) return json({ error: { code: "conflict" } }, 409);
      settings = { ...body, revision: settings.revision + 1 };
      return json(settings);
    });
    const widget = await context.newPage();
    await widget.goto(`${base}/widget-fixture`);
    await widget.getByRole("button", { name: "Настройки виджета", exact: true }).click();
    const opened = context.waitForEvent("page");
    await widget.getByRole("button", { name: "Общие настройки аккаунта", exact: true }).click();
    const settingsPage = await opened;
    await settingsPage.getByRole("link", { name: "Панель задач", exact: true }).click();
    const panelSwitch = settingsPage.getByRole("switch", { name: "Панель задач включена в аккаунте", exact: true });
    await panelSwitch.waitFor();
    check(!settingsPage.url().includes("admin_session"), "management: widget opens React and removes its short-lived fragment credential");
    check(await settingsPage.evaluate((opaque) => [localStorage, sessionStorage].every((store) => Object.keys(store).every((key) => !store.getItem(key)?.includes(opaque))), credential), "management: credential is never persisted in browser storage");
    check(issued.length === 1 && managementCalls.every((call) => call.bearer === `Bearer ${credential}`), "management: only the browser credential authorizes shared settings");
    check((await settingsPage.locator("ol > li").first().innerText()).includes("На сегодня по времени"), "management: priority order is loaded from the server");
    await settingsPage.getByRole("button", { name: "Ниже", exact: true }).first().click();
    await settingsPage.getByText("сохранено", { exact: true }).waitFor();
    check(settings.priority_keys.join() === "urgent,today_timed", "management: reordered priorities survive the shared API round trip");
    holdSave = true;
    await settingsPage.getByRole("switch", { name: "Учитывать будущие задачи", exact: true }).click();
    const deadline = Date.now() + 10000;
    while (!releaseSave && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    if (!releaseSave) throw new Error("Settings save did not reach the fixture owner");
    await settingsPage.getByRole("checkbox", { name: /Мария Тест/ }).check();
    releaseSave();
    await settingsPage.getByText("изменения ждут сохранения…", { exact: true }).waitFor();
    check(await settingsPage.getByText("сохранено", { exact: true }).count() === 0, "management: acknowledgement of an older draft never marks new edits saved");
    await settingsPage.getByText("сохранено", { exact: true }).waitFor();
    check(settings.employee_ids.includes(8) && settings.consider_future_tasks, "management: rapid saves retain employee selection and use fresh revisions");
    await settingsPage.screenshot({ path: `${out}/shared-settings-mvp.png`, fullPage: true });
    forcedStatus = 409;
    settings = { ...settings, revision: settings.revision + 1, employee_ids: [8] };
    await settingsPage.getByRole("switch", { name: "Включать связанные сделки", exact: true }).click();
    await settingsPage.getByRole("button", { name: "Загрузить актуальные настройки", exact: true }).waitFor();
    check(!await panelSwitch.isEnabled(), "management: CAS conflict blocks editing instead of blindly retrying");
    await settingsPage.getByRole("button", { name: "Загрузить актуальные настройки", exact: true }).click();
    await settingsPage.getByRole("button", { name: "Загрузить актуальные настройки", exact: true }).waitFor({ state: "detached" });
    await panelSwitch.waitFor({ state: "visible" });
    await settingsPage.getByRole("checkbox", { name: /Мария Тест/ }).waitFor();
    check(await settingsPage.getByRole("checkbox", { name: /Мария Тест/ }).isChecked() && !await settingsPage.getByRole("checkbox", { name: /Никита Тест/ }).isChecked(), "management: explicit reload replaces the draft with current server settings");
    await widget.getByRole("button", { name: "Обновить / повторить запрос", exact: true }).click();
    await widget.getByRole("alert").waitFor();
    check((await widget.getByRole("alert").innerText()).includes("отключена"), "management: the employee widget consumes updated shared enablement");
    admin = false;
    forcedStatus = 403;
    await settingsPage.getByRole("switch", { name: "Включать связанные сделки", exact: true }).click();
    await settingsPage.getByRole("button", { name: "Загрузить актуальные настройки", exact: true }).waitFor();
    check(!await panelSwitch.isEnabled(), "management: revoked administrator access blocks subsequent edits");
    const before = issued.length;
    await widget.getByRole("button", { name: "Общие настройки аккаунта", exact: true }).click();
    await widget.getByRole("alert").filter({ hasText: "администратора" }).waitFor();
    check(issued.length === before, "management: an ordinary employee cannot mint a settings session");
    const viewer = await context.newPage();
    await viewer.goto(`${base}/#/settings/task-panel`);
    await viewer.getByText("управление недоступно", { exact: true }).waitFor();
    check(await viewer.getByRole("switch").count() === 0, "management: a viewer without an admin session gets no shared editor or demo fallback");
    await viewer.clock.install();
    await viewer.goto(`${base}/#/p/viewer-fixture/settings`);
    await viewer.locator(".pname").filter({ hasText: `Тестовая панель ${settings.revision}` }).waitFor();
    const firstReads = viewReads;
    settings = { ...settings, enabled: false, revision: settings.revision + 1 };
    await viewer.clock.fastForward(240000);
    await viewer.locator(".pname").filter({ hasText: `Тестовая панель ${settings.revision}` }).waitFor();
    check(viewReads === firstReads + 1 && await viewer.getByText("Сбор новых интервалов отключён.", { exact: false }).isVisible(), "panel: active viewer reloads shared configuration every four minutes");
    check(await viewer.getByRole("switch", { name: "События панели задач на таймлайне", exact: true }).isEnabled(), "panel: disabling collection does not disable viewing recorded history");
    await viewer.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await viewer.clock.fastForward(2400000);
    check(viewReads === firstReads + 1, "panel: hidden viewer does not refresh shared configuration");
    viewerAllowed = false;
    await viewer.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await viewer.getByText("Нет доступа к панели", { exact: true }).waitFor();
    check(viewReads === firstReads + 2 && await viewer.locator(".set-layout").count() === 0, "panel: returning rechecks access and hides old configuration after revocation");
  } finally {
    await context.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}
