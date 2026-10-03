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
