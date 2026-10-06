import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
test("release hash pins actual bytes and ZIP is reproducible and free of placeholders", () => {
  const release = JSON.parse(readFileSync("dist-remote/release.json")),
    bytes = readFileSync(`dist-remote/${release.js}`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    release.sha256,
  );
  assert(release.js.includes(release.sha256.slice(0, 16)));
  const args = [
    "scripts/package-widget.mjs",
    "--assets-url",
    "https://assets.example.test/distribution",
    "--api-url",
    "https://core.example.test/api/v1/widget/distribution",
  ];
  execFileSync(process.execPath, args);
  const first = readFileSync("dist-package/rkrs-lead-distribution.zip");
  execFileSync(process.execPath, args);
  assert.deepEqual(
    readFileSync("dist-package/rkrs-lead-distribution.zip"),
    first,
  );
  const files = execFileSync(
    "unzip",
    ["-Z1", "dist-package/rkrs-lead-distribution.zip"],
    { encoding: "utf8" },
  );
  assert(!files.includes("node_modules"));
  const manifest = JSON.parse(execFileSync(
    "unzip", ["-p", "dist-package/rkrs-lead-distribution.zip", "manifest.json"],
    { encoding: "utf8" },
  ));
  const locale = JSON.parse(execFileSync(
    "unzip", ["-p", "dist-package/rkrs-lead-distribution.zip", "i18n/ru.json"],
    { encoding: "utf8" },
  ));
  assert(manifest.widget.installation);
  assert(Object.keys(manifest.settings).length > 0);
  assert.equal(manifest.settings.distribution.type, "custom");
  assert.equal(manifest.settings.distribution.required, false);
  assert.equal(manifest.settings.distribution.name, "settings.distribution");
  assert(locale.settings.distribution);
  const loader = execFileSync(
    "unzip",
    ["-p", "dist-package/rkrs-lead-distribution.zip", "script.js"],
    { encoding: "utf8" },
  );
  assert(!loader.includes("__RKRS"));
  assert(loader.includes(release.js));
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [
        "scripts/package-widget.mjs",
        "--assets-url",
        "http://local",
        "--api-url",
        "https://core.test",
      ],
      { stdio: "ignore" },
    ),
  );
});

test("manifest satisfies the amoCRM contract: non-empty custom settings field and required package files", () => {
  const manifest = JSON.parse(readFileSync("../widget/manifest.json", "utf8"));
  for (const field of [
    "name",
    "description",
    "short_description",
    "locale",
    "installation",
  ])
    assert(
      manifest.widget && manifest.widget[field] !== undefined,
      `widget.${field} is required`,
    );
  assert(manifest.locations.includes("settings"));
  assert(
    manifest.settings &&
      typeof manifest.settings === "object" &&
      Object.keys(manifest.settings).length > 0,
    "empty top-level settings is rejected by amoCRM",
  );
  const custom = Object.values(manifest.settings).filter(
    (field) => field.type === "custom",
  );
  assert.equal(custom.length, 1, "exactly one custom settings field");
  assert.equal(custom[0].required, false);
  assert(
    !/secret|password|pass\b|token|api[_-]?key/i.test(
      JSON.stringify(manifest.settings),
    ),
    "no credential requirement may be invented in top-level settings",
  );
  const files = execFileSync(
    "unzip",
    ["-Z1", "dist-package/rkrs-lead-distribution.zip"],
    { encoding: "utf8" },
  );
  for (const required of [
    "manifest.json",
    "i18n/ru.json",
    "images/logo.png",
    "images/logo_main.png",
    "images/logo_medium.png",
    "images/logo_min.png",
    "images/logo_small.png",
  ])
    assert(files.includes(required), `missing required package file ${required}`);
  const packaged = JSON.parse(
    execFileSync(
      "unzip",
      ["-p", "dist-package/rkrs-lead-distribution.zip", "manifest.json"],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(packaged.settings, manifest.settings);
});
