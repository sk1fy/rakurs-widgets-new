import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
if (!process.env.TEAM_OS_PACKAGE)
  throw new Error(
    "Передайте TEAM_OS_PACKAGE с установленным Playwright TeamOS",
  );
const require = createRequire(process.env.TEAM_OS_PACKAGE);
const { chromium, expect } = require("@playwright/test");
const artifacts = process.env.RS10_ARTIFACTS || "/tmp/rs10-widget-artifacts";
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.RS10_PREVIEW_URL || "http://127.0.0.1:5178");
  await page.getByText("Сохранить правило", { exact: true }).waitFor();
  await page.locator("#scenario").selectOption("observe");
  await expect(page.getByLabel("Режим правила", { exact: true })).toHaveValue(
    "observe",
  );
  await expect(
    page.getByText(
      "Наблюдение: ответственный не меняется, рабочая очередь и порядок не продвигаются.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Журнал наблюдений", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/observe-settings-1440.png`,
    fullPage: true,
  });
  await page.locator("#mode").selectOption("card");
  await expect(
    page.getByText("Ответственный amoCRM: Иван", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Предлагаемый сотрудник: Анна", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "В этой области нет записей назначения. Показано предварительное наблюдение.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Пересчитать", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `${artifacts}/observe-card-1440.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator("#scenario").selectOption("observe-wait");
  await expect(
    page.getByText("Предлагается ожидание", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Предлагаемый сотрудник: Не выбран", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: `${artifacts}/observe-night-390.png`,
    fullPage: true,
  });
  await page.locator("#mode").selectOption("settings");
  await page.getByLabel("Режим правила", { exact: true }).selectOption("live");
  await page
    .getByRole("button", { name: "Сохранить участников", exact: true })
    .click();
  await expect(page.getByLabel("Режим правила", { exact: true })).toHaveValue(
    "live",
  );
  await page
    .getByRole("button", { name: "Сохранить правило", exact: true })
    .click();
  await expect(
    page.getByText(
      "Рабочий режим: результат назначения подтверждается отдельно.",
      { exact: true },
    ),
  ).toBeVisible();
  const writes = await page.evaluate(() =>
    window.__rs08Requests.filter((r) => r.write),
  );
  const modeWrite = writes.find(
    (r) => r.kind === "rule" && r.payload.executionMode === "live",
  );
  assert(modeWrite);
  assert(Number.isInteger(modeWrite.payload.expectedRevision));
  assert(!writes.some((r) => r.kind === "action"));
  await page.locator("#scenario").selectOption("unknown-mode");
  await expect(
    page.getByLabel("Режим правила", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Режим не поддерживается этой версией виджета; изменение режима недоступно.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.locator("#scenario").selectOption("observe");
  await page.getByLabel("Режим правила", { exact: true }).selectOption("live");
  await page.locator("#scenario").selectOption("conflict");
  await page.getByLabel("Режим правила", { exact: true }).selectOption("live");
  await page
    .getByRole("button", { name: "Сохранить правило", exact: true })
    .click();
  await expect(page.getByLabel("Режим правила", { exact: true })).toHaveValue(
    "live",
  );
  await expect(
    page.getByText(
      "Настройки изменены другим пользователем. Черновик сохранён",
      { exact: true },
    ),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  writeFileSync(
    `${artifacts}/browser-observe-result.json`,
    JSON.stringify(
      {
        origin: "SDK fixture, no amoCRM",
        scenarios: 8,
        errors,
        overflow: false,
        modeWrite,
        actualOwner: "Иван",
        proposal: "Анна",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ scenarios: 8, errors, overflow: false }));
} finally {
  await browser.close();
}
