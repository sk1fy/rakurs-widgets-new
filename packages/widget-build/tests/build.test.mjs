import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createBundledLoader, packageWidget, reproducibleZip, sha256 } from "../index.mjs";

function temporary(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "rkrs-build-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("ZIP bytes ignore input mtime, modes, creation order and timezone", (t) => {
  const root = temporary(t), left = path.join(root, "left"), right = path.join(root, "right");
  for (const folder of [left, right]) mkdirSync(path.join(folder, "i18n"), { recursive: true });
  for (const name of ["script.js", "i18n/ru.json"]) writeFileSync(path.join(left, name), name);
  for (const name of ["i18n/ru.json", "script.js"]) {
    writeFileSync(path.join(right, name), name);
    chmodSync(path.join(right, name), 0o600);
    utimesSync(path.join(right, name), 946684800, 946684800);
  }
  const a = reproducibleZip(left, path.join(root, "a.zip"));
  const b = reproducibleZip(right, path.join(root, "b.zip"));
  assert.equal(a.sha256, b.sha256);
  assert.deepEqual(readFileSync(a.path), readFileSync(b.path));
  assert.deepEqual(a.files, ["i18n/ru.json", "script.js"]);
  assert.equal(readFileSync(a.path).readUInt32LE(), 0x04034b50);
  symlinkSync(path.join(left, "script.js"), path.join(left, "linked.js"));
  assert.throws(() => reproducibleZip(left, a.path), /symlinks/);
});

for (const dynamic of [false, true]) test(`bundled AMD works without any network (${dynamic ? "legacy manifest" : "pinned loader"})`, async () => {
  const bundle = 'define(["exports"], function (exports) { exports.mount = function () { return "local mounted"; }; });';
  const release = { version: "1.0.0", js: "rkrs-test.0123456789abcdef.umd.js", sha256: sha256(bundle) };
  const load = dynamic
    ? 'fetch("/assets/release.json").then(function (response) { return response.json(); }).then(function (release) { require(["/assets/" + release.js], resolve, reject); });'
    : `require(["/assets/${release.js}"], resolve, reject);`;
  const loader = `define([], function () { return function () { return new Promise(function (resolve, reject) { ${load} }).then(function (runtime) { return runtime.mount(); }); }; });`;
  const source = createBundledLoader(bundle, loader, { bundleFile: release.js, assetsURL: "/assets", release });
  let Widget;
  vm.runInNewContext(source, {
    define: (deps, factory) => { assert.equal(deps.length, 0); Widget = factory(); },
    require: () => { throw new Error("network require"); },
    fetch: () => { throw new Error("network fetch"); },
  });
  assert.equal(await Widget(), "local mounted");
  assert(!source.includes("eval("));
});

test("bundled runtime cannot import undeclared remote dependencies", () => {
  const source = createBundledLoader('define(["https://outside.test/code.js"], function () {});', 'define([], function () {});', {
    bundleFile: "runtime.js", assetsURL: "/assets", release: { sha256: "unused" },
  });
  assert.throws(() => vm.runInNewContext(source, { define: (_deps, factory) => factory() }), /External runtime dependency/);
});

function fixture(t) {
  const directory = temporary(t), root = path.join(directory, "widget-app"), widget = path.join(directory, "widget");
  for (const folder of [path.join(root, "dist-remote"), path.join(widget, "images"), path.join(widget, "i18n")]) mkdirSync(folder, { recursive: true });
  const bundle = 'define(["exports"], function (exports) { exports.mount = function () {}; });';
  const hash = sha256(bundle), release = { version: "1.0.0", js: `rkrs-test.${hash.slice(0, 16)}.umd.js`, sha256: hash };
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
  writeFileSync(path.join(root, "dist-remote/release.json"), JSON.stringify(release));
  writeFileSync(path.join(root, "dist-remote", release.js), bundle);
  writeFileSync(path.join(widget, "manifest.json"), JSON.stringify({ widget: { version: "1.0.0" } }));
  writeFileSync(path.join(widget, "script.js"), 'define([], function () { var assets = "__RKRS_TEST_ASSETS_URL__", bundle = "__RKRS_TEST_BUNDLE__", api = "__RKRS_TEST_API_URL__"; return function () {}; });');
  writeFileSync(path.join(widget, "images/logo.png"), "fixture");
  writeFileSync(path.join(widget, "i18n/ru.json"), "{}");
  return { root, widget, release, options: { root, bundleName: "rkrs-test", placeholderPrefix: "TEST", zipName: "widget.zip", apiRequired: true, argv: ["--api-url", "https://core.example.test/runtime"] } };
}

test("packaging validates actual bundle bytes and versions, defaults to embedded runtime", (t) => {
  const { root, widget, release, options } = fixture(t);
  const packaged = packageWidget(options);
  assert.equal(packaged.sha256, packageWidget(options).sha256);
  assert(readFileSync(path.join(root, "dist-package/widget/script.js"), "utf8").includes("function bundleDefine"));
  assert.equal(JSON.parse(readFileSync(path.join(root, "dist-package/build-report.json"))).runtime_mode, "bundled");
  writeFileSync(path.join(root, "dist-remote", release.js), "tampered");
  assert.throws(() => packageWidget(options), /integrity mismatch/);
  const hash = sha256("tampered");
  release.sha256 = hash; release.js = `rkrs-test.${hash.slice(0, 16)}.umd.js`;
  writeFileSync(path.join(root, "dist-remote/release.json"), JSON.stringify(release));
  writeFileSync(path.join(root, "dist-remote", release.js), "tampered");
  writeFileSync(path.join(widget, "manifest.json"), JSON.stringify({ widget: { version: "2.0.0" } }));
  assert.throws(() => packageWidget(options), /versions differ/);
});

test("remote mode requires explicit diagnostic consent and valid HTTPS; missing/duplicate CLI values fail", (t) => {
  const { root, options } = fixture(t);
  assert.throws(() => packageWidget({ ...options, argv: [...options.argv, "--runtime-mode", "remote"] }), /diagnostic only/);
  const remoteArgs = [...options.argv, "--runtime-mode", "remote", "--allow-unreviewed-remote", "--assets-url", "https://assets.example.test"];
  packageWidget({ ...options, argv: remoteArgs });
  assert(!readFileSync(path.join(root, "dist-package/widget/script.js"), "utf8").includes("function bundleDefine"));
  assert.equal(JSON.parse(readFileSync(path.join(root, "dist-package/build-report.json"))).remote_policy_approved, false);
  for (const url of ["http://assets.example.test", "https://u:p@assets.example.test", "https://assets.example.test/?key=value", "https://localhost/"]) {
    assert.throws(() => packageWidget({ ...options, argv: [...options.argv, "--assets-url", url] }), /HTTPS/);
  }
  assert.throws(() => packageWidget({ ...options, argv: ["--api-url"] }), /Invalid option/);
  assert.throws(() => packageWidget({ ...options, argv: [...options.argv, "--api-url", "https://core.example.test"] }), /Repeated option/);
});
