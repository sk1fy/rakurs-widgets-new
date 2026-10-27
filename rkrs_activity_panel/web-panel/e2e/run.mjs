/* global document */
// Сквозная проверка пользовательского пути на синтетике.
// Запуск: npm run dev:fixtures (порт по E2E_URL), затем npm run e2e.
// Скриншоты — в E2E_OUT (по умолчанию ./e2e-out, игнорируется git).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { managementMvp } from "./management-mvp.mjs";
import { sessionRefreshChecks } from "./session-refresh-checks.mjs";

const BASE = process.env.E2E_URL ?? "http://127.0.0.1:5173/";
const OUT = process.env.E2E_OUT ?? "e2e-out";
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
};

const browser = await chromium.launch();
await managementMvp(browser, check, OUT);
await sessionRefreshChecks(browser, BASE, check);

// Exercise the actual resource hook with controlled pending requests. A new
// observation refresh must preserve data; changing its scope must clear it.
const resourcePage = await browser.newPage();
await resourcePage.goto(`${BASE}e2e/resource-refresh.html`);
await resourcePage.getByTestId("status").filter({ hasText: "loading" }).waitFor();
await resourcePage.getByRole("button", { name: "Resolve", exact: true }).click();
await resourcePage.getByTestId("data").filter({ hasText: "1:0" }).waitFor();
await resourcePage.getByRole("button", { name: "Refresh", exact: true }).click();
await resourcePage.getByTestId("refreshing").filter({ hasText: "true" }).waitFor();
check(await resourcePage.getByTestId("data").innerText() === "1:0", "resource: pending refresh keeps displayed data");
await resourcePage.getByRole("button", { name: "Reject", exact: true }).click();
await resourcePage.getByTestId("error").filter({ hasText: "failed" }).waitFor();
check(await resourcePage.getByTestId("data").innerText() === "1:0", "resource: failed refresh keeps displayed data");
await resourcePage.getByRole("button", { name: "Refresh", exact: true }).click();
await resourcePage.getByTestId("refreshing").filter({ hasText: "true" }).waitFor();
await resourcePage.getByRole("button", { name: "Resolve", exact: true }).click();
await resourcePage.getByTestId("data").filter({ hasText: "1:2" }).waitFor();
check(await resourcePage.getByTestId("error").innerText() === "none", "resource: retry replaces data and clears error");
await resourcePage.getByRole("button", { name: "Change scope", exact: true }).click();
await resourcePage.getByTestId("data").filter({ hasText: "empty" }).waitFor();
check(await resourcePage.getByTestId("status").innerText() === "loading", "resource: new date, window or employee clears the old scope");
await resourcePage.close();

// A hidden panel must catch up when shown, without duplicate focus requests
// or aborting a slow refresh at the next polling boundary.
const pollingPage = await browser.newPage();
await pollingPage.clock.install();
await pollingPage.goto(`${BASE}e2e/resource-refresh.html?refreshMs=240000`);
const pollingText = (id) => pollingPage.getByTestId(id).innerText();
const pollingWait = (id, text) => pollingPage.getByTestId(id).filter({ hasText: text }).waitFor();
const pollingClick = (name) => pollingPage.getByRole("button", { name, exact: true }).click();
await pollingWait("status", "loading");
await pollingClick("Resolve");
await pollingWait("data", "1:1");
await pollingClick("Hide tab");
await pollingPage.clock.fastForward(30000);
check(await pollingText("requests") === "1", "timeline: inactive panel does not poll");
await pollingClick("Show tab");
await pollingClick("Focus");
await pollingWait("refreshing", "true");
check(await pollingText("requests") === "2", "timeline: even a thirty-second absence refreshes immediately on return, once");
await pollingClick("Resolve");
await pollingWait("data", "1:2");
await pollingPage.clock.fastForward(120000);
await pollingClick("Focus");
check(await pollingText("requests") === "2", "timeline: focus without a visibility transition keeps a fresh snapshot");
await pollingPage.clock.fastForward(120000);
await pollingWait("refreshing", "true");
check(await pollingText("requests") === "3", "timeline: active panel refreshes four minutes after the return refresh");
check(await pollingText("data") === "1:2", "timeline: polling retains previous segments while loading");
await pollingPage.clock.fastForward(480000);
await pollingClick("Focus");
check(await pollingText("requests") === "3", "timeline: slow refresh is not restarted by timers or focus");
await pollingClick("Resolve");
await pollingWait("data", "1:3");
await pollingClick("Hide tab");
await pollingPage.clock.fastForward(2400000);
check(await pollingText("requests") === "3", "timeline: hidden panel makes no polling requests");
await pollingClick("Show tab");
await pollingClick("Focus");
await pollingWait("refreshing", "true");
check(await pollingText("requests") === "4", "timeline: returning after forty minutes refreshes once immediately");
await pollingClick("Resolve");
await pollingWait("data", "1:4");
check(await pollingText("data") === "1:4", "timeline: new snapshot appears without page reload");
await pollingPage.clock.fastForward(240000);
await pollingWait("refreshing", "true");
await pollingClick("Reject");
await pollingWait("error", "failed");
check(await pollingText("data") === "1:4", "timeline: refresh failure retains the last snapshot");
await pollingPage.clock.fastForward(240000);
await pollingWait("refreshing", "true");
check(await pollingText("requests") === "6", "timeline: polling retries after an error");
await pollingPage.close();

const hiddenPollingPage = await browser.newPage();
await hiddenPollingPage.clock.install();
await hiddenPollingPage.goto(`${BASE}e2e/resource-refresh.html?refreshMs=240000&hidden=1`);
await hiddenPollingPage.getByTestId("status").filter({ hasText: "idle" }).waitFor();
await hiddenPollingPage.clock.fastForward(480000);
check(await hiddenPollingPage.getByTestId("requests").innerText() === "0", "timeline: initially inactive panel makes no request");
await hiddenPollingPage.getByRole("button", { name: "Show tab", exact: true }).click();
await hiddenPollingPage.getByTestId("status").filter({ hasText: "loading" }).waitFor();
check(await hiddenPollingPage.getByTestId("requests").innerText() === "1", "timeline: initial activation loads immediately");
await hiddenPollingPage.close();

// Exercise demand-driven collection using the real hook and deterministic clock.
const problemPage = await browser.newPage();
await problemPage.goto(`${BASE}e2e/problem-refresh.html`);
await problemPage.getByTestId("status").filter({ hasText: "loading" }).waitFor();
const inspectRequests = async () => {
  await problemPage.getByRole("button", { name: "Inspect", exact: true }).click();
  return Number(await problemPage.getByTestId("requests").innerText());
};
check(await inspectRequests() === 1, "problems: initial read starts once");
await problemPage.getByRole("button", { name: "Resolve initial", exact: true }).click();
await problemPage.getByTestId("collecting").filter({ hasText: "true" }).waitFor();
check(await problemPage.getByTestId("count").innerText() === "empty", "problems: initial collection has no false zero count");
await problemPage.getByRole("button", { name: "Advance 10 seconds", exact: true }).click();
await problemPage.getByTestId("refreshing").filter({ hasText: "true" }).waitFor();
check(await inspectRequests() === 2, "problems: collection status polled after ten seconds");
await problemPage.getByRole("button", { name: "Resolve complete", exact: true }).click();
await problemPage.getByTestId("collecting").filter({ hasText: "false" }).waitFor();
await problemPage.getByRole("button", { name: "Advance 410 seconds", exact: true }).click();
check(await inspectRequests() === 2, "problems: complete snapshot is reused before seven minutes");
await problemPage.getByRole("button", { name: "Advance 10 seconds", exact: true }).click();
await problemPage.getByTestId("refreshing").filter({ hasText: "true" }).waitFor();
check(await inspectRequests() === 3, "problems: seven-minute boundary starts another read");
check(await problemPage.getByTestId("count").innerText() === "82", "problems: background request retains the last complete count");
await problemPage.getByRole("button", { name: "Reject", exact: true }).click();
await problemPage.getByTestId("error").filter({ hasText: "failed" }).waitFor();
check(await problemPage.getByTestId("count").innerText() === "82", "problems: failure retains the last complete count");
await problemPage.getByRole("button", { name: "Advance 30 seconds", exact: true }).click();
await problemPage.getByTestId("refreshing").filter({ hasText: "true" }).waitFor();
check(await inspectRequests() === 4, "problems: failed read retries after thirty seconds");
await problemPage.getByRole("button", { name: "Hide tab", exact: true }).click();
await problemPage.getByRole("button", { name: "Advance 7 minutes", exact: true }).click();
check(await inspectRequests() === 4, "problems: hidden tab stops requests and aborts the current read");
check(await problemPage.getByTestId("count").innerText() === "82", "problems: hiding the tab retains the snapshot");
await problemPage.getByRole("button", { name: "Show tab", exact: true }).click();
await problemPage.getByTestId("refreshing").filter({ hasText: "true" }).waitFor();
check(await inspectRequests() === 5, "problems: returning to a visible tab checks immediately");
await problemPage.getByRole("button", { name: "Resolve paused", exact: true }).click();
await problemPage.getByTestId("refreshing").filter({ hasText: "false" }).waitFor();
await problemPage.getByRole("button", { name: "Advance 30 seconds", exact: true }).click();
check(await inspectRequests() === 5, "problems: no status read during a server batch pause");
await problemPage.getByRole("button", { name: "Advance 30 seconds", exact: true }).click();
await problemPage.getByTestId("refreshing").filter({ hasText: "true" }).waitFor();
check(await inspectRequests() === 6, "problems: status read resumes at refresh_after");
await problemPage.getByRole("button", { name: "Unmount", exact: true }).click();
await problemPage.getByRole("button", { name: "Advance 7 minutes", exact: true }).click();
check(await inspectRequests() === 6, "problems: closing the panel cancels pending polling");
check(Number(await problemPage.getByTestId("aborted").innerText()) > 0, "problems: unmount aborts the in-flight read");
await problemPage.close();
const hiddenProblemPage = await browser.newPage();
await hiddenProblemPage.goto(`${BASE}e2e/problem-refresh.html?hidden=1`);
await hiddenProblemPage.getByTestId("status").filter({ hasText: "idle" }).waitFor();
await hiddenProblemPage.getByRole("button", { name: "Advance 7 minutes", exact: true }).click();
check(Number(await hiddenProblemPage.getByTestId("requests").innerText()) === 0, "problems: initially hidden panel makes no request");
await hiddenProblemPage.getByRole("button", { name: "Show tab", exact: true }).click();
await hiddenProblemPage.getByTestId("status").filter({ hasText: "loading" }).waitFor();
await hiddenProblemPage.getByRole("button", { name: "Inspect", exact: true }).click();
check(Number(await hiddenProblemPage.getByTestId("requests").innerText()) === 1, "problems: initially hidden panel reads when first shown");
await hiddenProblemPage.close();

async function session(viewport, tag) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const go = async (hash, search = "") => {
    await page.goto(`${BASE}${search}#${hash}`);
    await page.waitForTimeout(900);
  };
  const shot = (name) => page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });

  await go("/p/demo");
  await page.waitForSelector(".emp");
  check((await page.locator(".banner.fixture").count()) === 1, `${tag}: баннер синтетики виден`);
  check((await page.locator(".emp").count()) === 9, `${tag}: 9 карточек сотрудников`);
  check(await page.locator(".seg button:has-text('Неделя')").isDisabled(), `${tag}: неделя недоступна`);
  await shot("dashboard");

  // Попап отрезка таймлайна
  await page.locator(".tl-bar .seg-a").first().click({ force: true });
  check(await page.locator(".tl-pop").isVisible(), `${tag}: попап событий отрезка`);
  await page.keyboard.press("Escape");

  // Пропущенные
  await page.locator(".pop-trigger").first().click();
  check(await page.locator(".pop").first().isVisible(), `${tag}: выпадающий список пропущенных`);
  await page.keyboard.press("Escape");

  // Поиск, компактный вид, сортировка
  await page.locator(".srch input").first().fill("Глеб");
  await page.waitForTimeout(400); // поиск в группе с задержкой 300 мс
  check((await page.locator(".grp").first().locator(".emp").count()) === 1, `${tag}: поиск в группе`);
  await page.locator(".srch input").first().fill("");
  await page.waitForTimeout(400);
  await page.locator(".tools .ti").first().click();
  check((await page.locator(".emp.compact").count()) > 0, `${tag}: компактный вид`);
  await page.locator(".tools .ti").first().click();

  // Фильтр сотрудников в боковой панели
  if (viewport.width > 1100) {
    await page.locator(".side-list .chk input").first().uncheck();
    check((await page.locator(".emp").count()) === 8, `${tag}: скрытие сотрудника`);
    await page.locator(".side-tools button:has-text('Все')").click();
  }

  // Предыдущий день
  await page.locator("button[aria-label='Предыдущий день']").click();
  await page.waitForTimeout(800);
  check(page.url().includes("date="), `${tag}: переход на прошлый день`);
  check((await page.locator(".cmp:has-text('весь рабочий день')").count()) === 1, `${tag}: сравнение для прошлого дня (F11)`);

  // Профиль
  await page.locator(".ename a").first().click();
  await page.waitForSelector("h1");
  await page.waitForTimeout(800);
  check((await page.locator("h2:has-text('Анализ событий')").count()) === 1, `${tag}: профиль — анализ событий`);
  check((await page.locator("h2:has-text('История задач')").count()) === 1, `${tag}: профиль — история задач`);
  await page.waitForSelector("h2:has-text('посещений в Imbox')", { timeout: 5000 }).catch(() => {});
  check((await page.locator("h2:has-text('посещений в Imbox')").count()) === 1, `${tag}: профиль — Imbox`);
  const seg = page.locator(".strip button").first();
  if (await seg.count()) {
    await seg.click();
    check((await page.locator("tr.hl").count()) === 1, `${tag}: клик по отрезку подсвечивает строку`);
  }
  // Цветные части одного столбца раскрывают отдельные группы событий.
  const mixedBin = page.locator(".ea-hist .bin").filter({ has: page.locator("button:nth-child(2)") }).first();
  if (await mixedBin.count()) {
    const segments = mixedBin.locator("button");
    await segments.first().click();
    const firstGroup = await page.locator(".tl-pop").innerText();
    await page.keyboard.press("Escape");
    await segments.nth(1).click();
    const secondGroup = await page.locator(".tl-pop").innerText();
    check(firstGroup !== secondGroup, `${tag}: разные части столбца раскрывают разные группы`);
    await page.keyboard.press("Escape");
  }
  check(await page.locator(".total-time .donut-chart").count() === 3, `${tag}: три кольцевые диаграммы суммарного времени`);
  check(await page.locator(".task-history .history-summary .sum-card").count() === 5, `${tag}: пять показателей истории задач`);
  const rangeStart = page.locator(".task-history input[aria-label='Начало периода']");
  const rangeBefore = Number(await rangeStart.inputValue());
  await rangeStart.focus();
  await rangeStart.press("ArrowRight");
  check(Number(await rangeStart.inputValue()) === rangeBefore + 1, `${tag}: диапазон истории управляется клавиатурой`);
  await rangeStart.press("ArrowLeft");
  const profileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(profileOverflow <= 1, `${tag}: профиль не выходит за ширину страницы`);
  await shot("employee");

  // Оператор, пропущенные, настройки
  await go("/p/demo/operator/9007");
  check((await page.locator(".gauge svg").count()) === 1, `${tag}: страница оператора`);
  await shot("operator");
  await go("/p/demo/missed");
  check((await page.locator("h2:has-text('Пропущенные')").count()) === 1, `${tag}: страница пропущенных`);
  await go("/p/demo/settings");
  await page.waitForTimeout(400);
  check((await page.locator(".set-nav").count()) === 1, `${tag}: настройки открываются`);
  await shot("settings-view");
  await go("/settings/panels");
  await page.waitForTimeout(500);
  await shot("settings-panels");
  await go("/settings/task-panel");
  await page.waitForTimeout(500);
  await shot("settings-task");

  // Состояния
  await go("/p/demo", "?fixture=rating-error");
  await page.waitForSelector(".emp");
  check((await page.locator(".emp").count()) === 9, `${tag}: ошибка рейтинга не скрывает сотрудников`);
  check((await page.locator(".tl-bar").count()) === 9, `${tag}: таймлайны доступны без рейтинга`);
  check((await page.locator(".emp .pct").allTextContents()).every((text) => text.trim() === "—"), `${tag}: нет локальной подмены недоступного процента`);
  check((await page.locator(".emp .metrics .v").count()) > 0, `${tag}: KPI доступны при ошибке рейтинга`);
  await go("/p/demo", "?fixture=error");
  await page.waitForTimeout(600);
  check((await page.locator(".state.error").count()) >= 1, `${tag}: состояние ошибки`);
  await shot("state-error");
  await go("/p/demo", "?fixture=empty");
  await page.waitForTimeout(600);
  check((await page.locator(".state.empty").count()) >= 1, `${tag}: пустое состояние`);
  await go("/p/demo", "?fixture=partial");
  await page.waitForTimeout(600);
  check((await page.locator(".chip:has-text('неполные данные')").count()) >= 1, `${tag}: частичные данные помечены`);
  await go("/p/demo", "?fixture=stale");
  await page.waitForTimeout(600);
  check((await page.locator(".chip:has-text('устарели')").count()) >= 1, `${tag}: устаревшие данные помечены`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${tag}: нет горизонтальной прокрутки страницы (${overflow}px)`);
  check(errors.length === 0, `${tag}: нет ошибок в консоли${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await page.close();
}

await session({ width: 1440, height: 1000 }, "desktop");
await session({ width: 390, height: 844 }, "mobile");
await browser.close();
console.log(failures.length ? `\n${failures.length} проверок не прошло` : "\nвсе проверки прошли");
process.exit(failures.length ? 1 : 0);
