import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(
  process.env.TEAM_OS_PACKAGE ||
    "/Users/nikpeskov/Projects/team-os/package.json",
);
const { chromium, expect } = require("@playwright/test");
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const artifacts =
  process.env.RS08_ARTIFACTS ||
  "/Users/nikpeskov/.codex/state/clickup/rs08-artifacts";
mkdirSync(artifacts, { recursive: true });
async function screen(name) {
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
await page.goto(process.env.RS08_PREVIEW_URL || "http://127.0.0.1:5178");
await page.getByText("Сохранить правило", { exact: true }).waitFor();
await screen("settings-1440");
await page.setViewportSize({ width: 390, height: 1000 });
await screen("settings-390");
await page
  .getByLabel("Оставлять сделку у доступного текущего ответственного", {
    exact: true,
  })
  .uncheck();
await page
  .getByRole("button", { name: "Опустить Анна", exact: true })
  .first()
  .click();
await page
  .getByRole("button", { name: "Сохранить участников", exact: true })
  .click();
await page
  .getByRole("button", { name: "Сохранить правило", exact: true })
  .waitFor({ state: "visible" });
await expect(
  page.getByRole("button", { name: "Сохранить правило", exact: true }),
).toBeEnabled();
assert.equal(
  await page
    .getByLabel("Оставлять сделку у доступного текущего ответственного", {
      exact: true,
    })
    .isChecked(),
  false,
);
await page.locator("#scenario").selectOption("conflict");
await page.getByText("Сохранить правило", { exact: true }).waitFor();
await page
  .getByLabel("Оставлять сделку у доступного текущего ответственного", {
    exact: true,
  })
  .uncheck();
await page
  .getByRole("button", { name: "Сохранить правило", exact: true })
  .click();
await page
  .getByText("Настройки изменены другим пользователем. Черновик сохранён", {
    exact: true,
  })
  .waitFor();
assert.equal(
  await page
    .getByLabel("Оставлять сделку у доступного текущего ответственного", {
      exact: true,
    })
    .isChecked(),
  false,
);
await screen("conflict-390");
await page
  .getByRole("button", {
    name: "Обновить версии, сохранив черновик",
    exact: true,
  })
  .click();
await page
  .getByText(
    "Версии обновлены. Проверьте черновик: сохранение применит ваши значения поверх текущих.",
    { exact: true },
  )
  .waitFor();
assert.equal(
  await page
    .getByLabel("Оставлять сделку у доступного текущего ответственного", {
      exact: true,
    })
    .isChecked(),
  false,
);
await page
  .getByRole("button", { name: "Сбросить черновик", exact: true })
  .click();
await page.getByRole("button", { name: "Новое правило", exact: true }).click();
await page.getByLabel("Этап", { exact: true }).selectOption("101");
await page
  .getByRole("button", { name: "Создать правило на паузе", exact: true })
  .click();
await page
  .getByText("Настройки изменены другим пользователем. Черновик сохранён", {
    exact: true,
  })
  .waitFor();
assert.equal(
  await page.getByLabel("Этап", { exact: true }).inputValue(),
  "101",
);
const createCalls = await page.evaluate(() =>
  window.__rs08Requests.filter((r) => r.write && r.kind === "rules"),
);
assert.equal(createCalls.length, 1);
assert(!createCalls[0].id);
assert.equal(createCalls[0].payload.active, false);
await page.locator("#scenario").selectOption("unknown");
await page.getByText("Сохранить правило", { exact: true }).waitFor();
await page
  .getByRole("button", { name: "Сохранить правило", exact: true })
  .click();
await page
  .getByRole("button", { name: "Проверить тот же запрос", exact: true })
  .waitFor();
assert(
  await page
    .getByRole("button", { name: "Сохранить правило", exact: true })
    .isDisabled(),
);
await page
  .getByRole("button", { name: "Проверить тот же запрос", exact: true })
  .click();
await screen("unknown-390");
await page.waitForFunction(() => {
  const writes = window.__rs08Requests.filter((r) => r.write);
  return (
    writes.length > 1 && writes.at(-1).requestId === writes.at(-2).requestId
  );
});
const unknownCalls = await page.evaluate(() =>
  window.__rs08Requests.filter((r) => r.write).slice(-2),
);
assert.deepEqual(unknownCalls[0], unknownCalls[1]);
await page.locator("#scenario").selectOption("ready");
await page.locator("#mode").selectOption("card");
await page.getByText("Никто не на смене", { exact: true }).waitFor();
await page.getByRole("button", { name: "Пересчитать", exact: true }).click();
await page.getByRole("button", { name: "Пересчитать", exact: true }).waitFor();
await page.waitForFunction(() =>
  window.__rs08Requests.some((r) => r.kind === "action"),
);
const action = await page.evaluate(() =>
  window.__rs08Requests.find((r) => r.kind === "action"),
);
assert.equal(action.leadId, "501");
assert.equal(action.requestId, action.payload.requestId);
await page.getByRole("button", { name: "История", exact: true }).click();
await page.locator("ol.history").waitFor();
await page.getByRole("button", { name: "История", exact: true }).click();
assert.equal(await page.locator("ol.history").count(), 1);
await screen("card-390");
await page.setViewportSize({ width: 1440, height: 1000 });
await screen("card-1440");
await page.locator("#next").click();
await page.getByText("Никто не на смене", { exact: true }).waitFor();
await page.locator("#destroy").click();
assert.equal(
  await page
    .getByRole("heading", { name: "Распределение сделок", exact: true })
    .count(),
  0,
);
await page.locator("#open").click();
await page.getByText("Никто не на смене", { exact: true }).waitFor();
await page.locator("#scenario").selectOption("unbound");
await page.getByText("Свяжите аккаунт с TeamOS", { exact: true }).waitFor();
await page.locator("#scenario").selectOption("forbidden");
await page.getByText("Нет прав для этого действия", { exact: true }).waitFor();
assert.equal(
  await page.getByText("Никто не на смене", { exact: true }).count(),
  0,
);
await page.locator("#scenario").selectOption("outage");
await page.getByText("TeamOS временно недоступен", { exact: true }).waitFor();
assert.deepEqual(errors, []);
writeFileSync(
  `${artifacts}/browser-result.json`,
  JSON.stringify(
    {
      passed: true,
      widths: [1440, 390],
      scenarios: [
        "settings",
        "create-rule-conflict-preserves-draft",
        "card",
        "partial-save-preserves-draft",
        "409-preserved-draft-rebase",
        "unknown-no-new-command",
        "history-idempotent",
        "navigation",
        "destroy-reopen",
        "unbound",
        "forbidden",
        "outage",
      ],
      pageErrors: errors,
    },
    null,
    2,
  ),
);
console.log("RS08 local AMD browser scenarios PASS");
await browser.close();
