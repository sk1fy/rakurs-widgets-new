/* global document */
// Сквозная проверка пользовательского пути на синтетике.
// Запуск: npm run dev:fixtures (порт по E2E_URL), затем npm run e2e.
// Скриншоты — в E2E_OUT (по умолчанию ./e2e-out, игнорируется git).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_URL ?? "http://127.0.0.1:5173/";
const OUT = process.env.E2E_OUT ?? "e2e-out";
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
};

const browser = await chromium.launch();

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
  check((await page.locator(".grp").first().locator(".emp").count()) === 1, `${tag}: поиск в группе`);
  await page.locator(".srch input").first().fill("");
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
  check((await page.locator("h2:has-text('История выполненных задач')").count()) === 1, `${tag}: профиль — история задач`);
  await page.waitForSelector("h2:has-text('посещений в Imbox')", { timeout: 5000 }).catch(() => {});
  check((await page.locator("h2:has-text('посещений в Imbox')").count()) === 1, `${tag}: профиль — Imbox`);
  const seg = page.locator(".strip button").first();
  if (await seg.count()) {
    await seg.click();
    check((await page.locator("tr.hl").count()) === 1, `${tag}: клик по отрезку подсвечивает строку`);
  }
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
  await go("/p/demo/settings/panels");
  await page.waitForTimeout(500);
  await shot("settings-panels");
  await go("/p/demo/settings/task-panel");
  await page.waitForTimeout(500);
  await shot("settings-task");

  // Состояния
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
