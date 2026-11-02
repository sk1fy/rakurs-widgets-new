import { preview } from "vite";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

export async function eventDataChecks(browser, check, out) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const server = await preview({ configFile: false, root, preview: { host: "127.0.0.1", port: 0 }, build: { outDir: "dist" } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const now = new Date("2026-11-02T10:00:00Z");
  const todayStart = Date.parse("2026-11-02T00:00:00+03:00") / 1000;
  const warning = "Последнее обновление не удалось. Показаны ранее загруженные данные.";
  let activePage;
  const waitUntil = async (fn) => {
    const deadline = Date.now() + 10000;
    while (!fn() && Date.now() < deadline) { await activePage.clock.runFor(1); await new Promise(resolve => setTimeout(resolve, 20)); }
    if (!fn()) throw Error("Expected HTTP observation did not arrive");
  };
  const setup = async (viewport = { width: 1440, height: 1000 }) => {
    const context = await browser.newContext({ viewport });
    const state = { fail: false, prevFail: false, count: 1, overlap: false, end: "18:00", reads: [], panelReads: 0, settledAt: [], sessionReads: [], ratingReads: [], hold: false, release: null };
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install({ time: now });
    await context.route("**/api/v1/activity/view/**", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const json = async (body, status = 200) => { state.settledAt.push(await page.evaluate(() => Date.now())); return route.fulfill({ json: body, status }); };
      if (request.headers().authorization !== "Bearer live-check") throw Error("Live source did not send scoped viewer bearer");
      if (path.endsWith("/panel")) {
        state.panelReads++;
        return json({ name: "Проверка реального адаптера", timezone: "Europe/Moscow", display_window: { from: "09:00", to: state.end }, employees: [{ id: 7, name: "Тестовый сотрудник", group_id: 1, group_name: "Отдел" }], task_panel_enabled: true, options: { pipeline_ids: [10], operators: [{ employee_id: 7, enabled: true, plan: 80, thresholds: { dialing_seconds: 10, conversation_seconds: 30, exceeding_seconds: 180 } }] } });
      }
      if (path.endsWith("/sessions")) { state.sessionReads.push(Number(url.searchParams.get("from"))); return json({ snapshot_at: +now / 1000, items: [] }); }
      if (path.endsWith("/activity")) { state.ratingReads.push(Number(url.searchParams.get("from"))); return json({ formula_version: `${url.searchParams.get("surface")}-v1`, day: url.searchParams.get("day"), timezone: "Europe/Moscow", start_minutes: Number(url.searchParams.get("start_minutes")), end_minutes: Number(url.searchParams.get("end_minutes")), cutoff_unix: url.searchParams.has("cutoff_unix") ? Number(url.searchParams.get("cutoff_unix")) : undefined, snapshot_at: +now / 1000, partial: false, employees: [{ employee_id: 7, percent: state.percent ?? 50, minute_percentages: Array(1441).fill(state.percent ?? 50) }] }); }
      if (path.endsWith("/problems")) return json({ snapshot_at: +now / 1000, counts: [{ employee_id: 7, leads_no_tasks: 0, leads_overdue_tasks: 0, overdue_tasks: 0 }] });
      if (path.endsWith("/timeline") || /\/employees\/7$/.test(path)) {
        const from = Number(url.searchParams.get("from"));
        const previous = from < todayStart;
        state.reads.push({ path, from, to: Number(url.searchParams.get("to")), cursor: url.searchParams.get("cursor"), previous });
        if (state.hold && (!previous || from === state.holdFrom)) { state.hold = false; await new Promise(resolve => { state.release = resolve; }); }
        if ((!previous && state.fail) || (previous && state.prevFail)) return json({ error: { code: "unavailable", message: "Synthetic HTTP failure" } }, 503);
        const item = (id, type, duration, n) => ({ id, created_at: from + 3600 + n, created_by: 7, type, entity_id: 31, entity_type: "lead", value_before: [], value_after: [], call_facts: { duration, phone: `+700000000${type === "outgoing_call" ? "5" : "0"}${n}`, result: "4" } });
        const events = Array.from({ length: previous ? 1 : state.count }, (_, n) => [item(`stage-${n}`, "lead_status_changed", null, n), item(`out-${n}`, "outgoing_call", 30, n), item(`miss-${n}`, "incoming_call", 0, n)]).flat();
        const second = url.searchParams.has("cursor");
        return json({ timezone: "Europe/Moscow", coverage: state.overlap && !second ? "partial" : "verified", freshness: state.overlap && !second ? "lagging" : "current", data: { events, next_cursor: state.overlap && !second ? "page-2" : undefined, status: { state: "ready" } } });
      }
      throw Error(`Unexpected live API request ${path}`);
    });
    return { context, page, state, errors };
  };
  const surfaces = [
    { name: "employee", path: "employee/7", metric: page => page.locator(".mt").filter({ has: page.locator(".k", { hasText: "Смен этапов" }) }).locator(".v") },
    { name: "operator", path: "operator/7", metric: page => page.locator(".op-stats .row").first().locator("b") },
    { name: "missed", path: "missed", metric: page => page.locator("h2").filter({ hasText: "Пропущенные звонки" }) },
  ];
  try {
    for (const surface of [...surfaces, { name: "dashboard", path: "", metric: page => page.locator(".emp").first() }]) {
      const { context, page, state } = await setup(surface.name === "missed" ? { width: 390, height: 844 } : undefined);
      try {
        state.hold = true;
        await page.goto(`${base}/#/p/live-check/${surface.path}`);
        await waitUntil(() => Boolean(state.release));
        await page.locator(".data-loading-overlay").waitFor();
        check(await page.getByText("Загрузка данных...", { exact: true }).isVisible(), `live ${surface.name}: primary initial read has the approved centered loading text`);
        check(await page.getByRole("link", { name: "К панели", exact: false }).count() > 0 || await page.getByLabel("Выбрать дату").isEnabled(), `live ${surface.name}: initial overlay leaves navigation available`);
        await page.screenshot({ path: `${out}/live-${surface.name}-initial.png`, fullPage: true });
        await page.clock.resume();
        state.release(); state.release = null;
        await page.clock.runFor(10);
        await surface.metric(page).waitFor();
        await page.locator(".data-loading-overlay").waitFor({ state: "detached" });
        if (surface.name === "dashboard" || surface.name === "employee") await page.locator(".rating-tile .v, .emp .pct").first().filter({ hasText: "50" }).waitFor();
        await waitUntil(() => state.reads.length >= (surface.name === "missed" ? 1 : 2));
        if (surface.name === "employee") await waitUntil(() => state.sessionReads.length >= 2 && state.ratingReads.length >= 2);
        await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100));
        const reads = state.reads.length, panelReads = state.panelReads;
        const sessions = state.sessionReads.length, ratings = state.ratingReads.length;
        const responseSpread = Math.max(...state.settledAt) - Math.min(...state.settledAt);
        const elapsed = await page.evaluate(() => Date.now()) - Math.min(...state.settledAt);
        await page.clock.fastForward(89999 - elapsed);
        check(state.reads.length === reads && state.panelReads === panelReads, `live ${surface.name}: no automatic refresh before 90 seconds`);
        state.hold = true;
        await page.clock.fastForward(1);
        await page.clock.fastForward(responseSpread + 100);
        await waitUntil(() => Boolean(state.release));
        await page.locator(".data-refresh-indicator").waitFor();
        check(await page.locator(".data-refresh-indicator").count() === 1 && !await page.locator(".data-loading-overlay").count(), `live ${surface.name}: one nonblocking bottom-right indicator during background reads`);
        await waitUntil(() => state.panelReads >= panelReads + 1);
        check(state.panelReads === panelReads + 1, `live ${surface.name}: configuration uses the 90-second cadence`);
        if (surface.name === "employee") {
          await waitUntil(() => state.sessionReads.length >= sessions + 1);
          check(state.sessionReads.length === sessions + 1, "live employee: current sessions refresh at 90 seconds, previous sessions remain one-off");
        }
        await page.screenshot({ path: `${out}/live-${surface.name}-background.png`, fullPage: true });
        const heldReads = state.reads.length;
        await page.clock.fastForward(180000);
        check(state.reads.length === heldReads, `live ${surface.name}: a slow event request is not restarted at later poll boundaries`);
        if (surface.name === "operator") {
          await page.getByRole("switch").click();
          check(await page.getByRole("switch").getAttribute("aria-checked") === "true", "live operator: background refresh permits a real filter action");
        }
        state.percent = 60;
        await page.clock.resume();
        state.release(); state.release = null;
        await page.locator(".data-refresh-indicator").waitFor({ state: "detached" });
        if (surface.name === "employee" || surface.name === "dashboard") {
          await waitUntil(() => state.ratingReads.length > ratings);
          await page.locator(".rating-tile .v, .emp .pct").first().filter({ hasText: "60" }).waitFor();
          check(state.ratingReads.length > ratings, `live ${surface.name}: ratings follow successful event refresh`);
        }
      } finally { state.release?.(); await context.close(); }
    }
    for (const surface of surfaces) {
      const { context, page, state, errors } = await setup();
      try {
        await page.goto(`${base}/#/p/live-check/${surface.path}`);
        const metric = surface.metric(page);
        await metric.filter({ hasText: surface.name === "missed" ? "(1)" : /^1$/ }).waitFor();
        const original = await metric.innerText();
        state.fail = true;
        await page.clock.fastForward(90000);
        await page.locator(".state.error").waitFor();
        check(await metric.innerText() === original, `live ${surface.name}: failed 90-second refresh retains the same metric`);
        check(await page.getByText(warning, { exact: true }).isVisible(), `live ${surface.name}: retained data is explicitly marked after failed refresh`);
        await page.screenshot({ path: `${out}/live-${surface.name}-refresh-error.png`, fullPage: true });
        state.fail = false;
        state.count = 2;
        await page.getByRole("button", { name: "Повторить", exact: true }).click();
        await metric.filter({ hasText: surface.name === "missed" ? "(2)" : /^2$/ }).waitFor();
        check(await page.getByText(warning, { exact: true }).count() === 0 && await page.locator(".state.error").count() === 0, `live ${surface.name}: retry replaces metrics and clears error and warning`);
        check(errors.length === 0, `live ${surface.name}: no browser errors`);
      } finally { await context.close(); }
      const { context: failedContext, page: failedPage, state: failedState } = await setup();
      try {
        failedState.fail = true;
        await failedPage.goto(`${base}/#/p/live-check/${surface.path}`);
        await failedPage.locator(".state.error").waitFor();
        check(await surface.metric(failedPage).count() === (surface.name === "missed" ? 1 : 0) && !await failedPage.getByText(warning, { exact: true }).count(), `live ${surface.name}: first-load failure has no fabricated metric or retained-data warning`);
        if (surface.name === "missed") check(!(await surface.metric(failedPage).innerText()).includes("(0)"), "live missed: first failure does not imply an empty history");
      } finally { await failedContext.close(); }
    }
    for (const surface of surfaces.slice(0, 2)) {
      const { context, page, state } = await setup();
      try {
        state.prevFail = true;
        await page.goto(`${base}/#/p/live-check/${surface.path}`);
        await page.getByText("Сравнение с предыдущим днём недоступно.", { exact: true }).waitFor();
        await surface.metric(page).filter({ hasText: /^1$/ }).waitFor();
        const comparison = surface.name === "employee" ? page.locator(".mt").filter({ has: page.locator(".k", { hasText: "Смен этапов" }) }).locator(".s") : page.locator(".op-stats .row").first().locator(".prev");
        check((await comparison.innerText()).includes("—"), `live ${surface.name}: failed previous day remains unavailable while today renders`);
        state.prevFail = false;
        await page.getByRole("button", { name: "Повторить", exact: true }).click();
        await comparison.filter({ hasText: "1" }).waitFor();
        check(!await page.getByText("Сравнение с предыдущим днём недоступно.", { exact: true }).count(), `live ${surface.name}: previous-day retry restores comparison`);
      } finally { await context.close(); }
    }
    for (const surface of [surfaces[0], { name: "dashboard", path: "", metric: page => page.locator(".emp").first() }]) {
      const { context, page, state } = await setup();
      try {
        await page.goto(`${base}/#/p/live-check/${surface.path}`);
        await surface.metric(page).waitFor();
        const date = page.getByLabel("Выбрать дату");
        check(await date.getAttribute("min") === "2026-10-02" && await date.getAttribute("max") === "2026-11-02", `live ${surface.name}: date bounds span one account calendar month`);
        check(await page.getByRole("button", { name: "Следующий день", exact: true }).isDisabled(), `live ${surface.name}: tomorrow is unavailable`);
        const from = Date.parse(`2026-10-02T${surface.name === "employee" ? "00" : "09"}:00:00+03:00`) / 1000;
        state.holdFrom = from; state.hold = true;
        await date.fill("2026-10-02");
        await page.locator(".data-loading-overlay").waitFor();
        check(await date.isEnabled(), `live ${surface.name}: historical scope overlay leaves the date selector usable`);
        await waitUntil(() => Boolean(state.release));
        await page.screenshot({ path: `${out}/live-${surface.name}-historical-loading.png`, fullPage: true });
        state.release(); state.release = null;
        await page.locator(".data-loading-overlay").waitFor({ state: "detached" });
        await surface.metric(page).waitFor();
        check(state.reads.some(r => r.from === from && r.to === from + (surface.name === "employee" ? 86399 : 32400)), `live ${surface.name}: history requests the selected account-zone bounds`);
        check(await page.getByRole("button", { name: "Предыдущий день", exact: true }).isDisabled(), `live ${surface.name}: earlier than one month is unavailable`);
        if (surface.name === "employee") await waitUntil(() => state.sessionReads.includes(from));
        const selectedReads = state.reads.filter(r => r.from === from).length;
        const selectedSessions = state.sessionReads.filter(start => start === from).length;
        await page.clock.fastForward(270000);
        check(state.reads.filter(r => r.from === from).length === selectedReads && state.sessionReads.filter(start => start === from).length === selectedSessions, `live ${surface.name}: historical events and sessions do not poll`);
        if (surface.name === "dashboard") {
          await page.locator(".data-refresh-indicator").waitFor({ state: "detached" });
          state.end = "17:00";
          await page.clock.fastForward(90000);
          await waitUntil(() => state.reads.some(r => r.from === from && r.to === from + 28800) && state.reads.some(r => r.from === todayStart + 32400 && r.to === todayStart + 61200));
          check(state.reads.some(r => r.from === from && r.to === from + 28800) && state.reads.some(r => r.from === todayStart + 32400 && r.to === todayStart + 61200), "live dashboard: end-only configuration change reloads historical selection and current auxiliary bounds");
        }
      } finally { state.release?.(); await context.close(); }
    }
    const { context, page, state } = await setup({ width: 390, height: 844 });
    try {
      state.overlap = true;
      await page.goto(`${base}/#/p/live-check/operator/7`);
      await page.locator(".op-stats .row").first().locator("b").filter({ hasText: /^1$/ }).waitFor();
      check(await page.getByText("неполные данные", { exact: true }).count() > 0 && await page.getByText("данные устарели", { exact: true }).count() > 0, "live overlap: first-page partial and stale badges survive healthy last page");
      check((await page.locator(".op-stats .chip.mut").innerText()).includes("30 с"), "live overlap: two overlapping pages count call duration once");
      await page.screenshot({ path: `${out}/live-operator-mobile-partial.png`, fullPage: true });
      const oldTo = state.reads.find(r => !r.previous).to;
      state.overlap = false;
      state.end = "17:00";
      await page.clock.fastForward(90000);
      await waitUntil(() => state.reads.some(r => r.to === oldTo - 3600) && state.reads.some(r => r.previous && r.to === oldTo - 90000));
      check(state.reads.some(r => r.previous && r.to === oldTo - 90000), "live operator: changing only configured window end reloads current and previous bounds");
      check(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth + 1), "live operator: mobile partial state has no horizontal page overflow");
    } finally { await context.close(); }
  } finally { await new Promise(resolve => server.httpServer.close(resolve)); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.env.E2E_OUT ?? "e2e-out";
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];
  try { await eventDataChecks(browser, (ok, message) => { console.log(`${ok ? "ok" : "FAIL"} ${message}`); if (!ok) failures.push(message); }, out); }
  finally { await browser.close(); }
  if (failures.length) process.exitCode = 1;
}
