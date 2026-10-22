import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

test("Activity ZIP is reproducible and mounts its embedded runtime without remote code or manifest", async () => {
  execFileSync(process.execPath, ["scripts/package-widget.mjs"]);
  const first = readFileSync("dist-package/rkrs-activity-prototype.zip");
  execFileSync(process.execPath, ["scripts/package-widget.mjs"]);
  assert.deepEqual(readFileSync("dist-package/rkrs-activity-prototype.zip"), first);
  execFileSync("unzip", ["-t", "dist-package/rkrs-activity-prototype.zip"]);
  const source = execFileSync("unzip", ["-p", "dist-package/rkrs-activity-prototype.zip", "script.js"], { encoding: "utf8" });
  assert(!source.includes("__RKRS"));
  const dom = new JSDOM('<main><div data-rkrs-activity-panel-slot></div></main>', { url: "https://demo.amocrm.ru", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  let Widget;
  window.AMOCRM = { constant: (name) => ({ id: name === "account" ? 1 : 2 }), widgets: { system: { area: "leads" } } };
  window.define = (_deps, factory) => { Widget = factory(); };
  window.require = () => { throw new Error("remote AMD request"); };
  window.fetch = () => { throw new Error("remote manifest request"); };
  try {
    window.eval(source);
    const widget = new Widget();
    assert.equal(widget.callbacks.init(), true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(window.document.querySelectorAll('[data-rkrs-prototype-surface="panel"]').length, 1);
    widget.callbacks.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(window.document.querySelectorAll("[data-rkrs-prototype-surface]").length, 0);
  } finally { window.close(); }
});
