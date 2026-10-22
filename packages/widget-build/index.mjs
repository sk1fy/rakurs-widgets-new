import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function secureURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Provide an absolute HTTPS URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url.hostname)) {
    throw new Error("Configured URLs must be public HTTPS without credentials/query/fragment");
  }
  return url.href.replace(/\/$/, "");
}

function configureLoader(source, prefix, values) {
  for (const [key, value] of Object.entries(values)) {
    const token = `__RKRS_${prefix}_${key}__`;
    source = source.replace(new RegExp(`(["'])${token}\\1`, "g"), () => JSON.stringify(value));
  }
  return source;
}

export function releaseWidget({ root, bundleName, placeholderPrefix, previewApiUrl = "/fixture-api" }) {
  execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--mode", "widget"], { cwd: root, stdio: "inherit" });
  const bytes = readFileSync(path.join(root, "dist", `${bundleName}.umd.js`));
  const hash = sha256(bytes);
  const release = {
    version: JSON.parse(readFileSync(path.join(root, "package.json"))).version,
    js: `${bundleName}.${hash.slice(0, 16)}.umd.js`,
    sha256: hash,
  };
  for (const folder of ["dist-remote", "public/widget-assets"]) {
    const target = path.join(root, folder);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, release.js), bytes);
    writeFileSync(path.join(target, "release.json.tmp"), JSON.stringify(release, null, 2) + "\n");
    renameSync(path.join(target, "release.json.tmp"), path.join(target, "release.json"));
  }
  const loader = configureLoader(readFileSync(path.join(root, "../widget/script.js"), "utf8"), placeholderPrefix, {
    ASSETS_URL: "/widget-assets", API_URL: previewApiUrl, BUNDLE: release.js,
  });
  writeFileSync(path.join(root, "public/widget-assets/widget-loader.js"), loader);
  copyFileSync(path.join(root, "node_modules/requirejs/require.js"), path.join(root, "public/require.js"));
  return release;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP STORE, sorted UTF-8 paths, fixed date/mode; independent of host zip, timezone and umask. */
export function reproducibleZip(directory, output) {
  const entries = [];
  function walk(folder, prefix = "") {
    for (const name of readdirSync(folder).sort()) {
      if (name.includes("\\")) throw new Error("Unsafe ZIP filename");
      const absolute = path.join(folder, name), relative = prefix + name;
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error("ZIP symlinks are not allowed");
      if (stat.isDirectory()) walk(absolute, relative + "/");
      else if (stat.isFile()) entries.push({ name: relative, bytes: readFileSync(absolute) });
      else throw new Error("ZIP contains unsupported file type");
    }
  }
  walk(directory);
  if (entries.length > 65535) throw new Error("ZIP64 is unsupported");
  const locals = [], centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), bytes = entry.bytes, checksum = crc32(bytes);
    if (name.length > 65535 || bytes.length > 0xffffffff || offset > 0xffffffff) throw new Error("ZIP64 is unsupported");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(0x2821, 12); // 2000-01-01, midnight
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0x2821, 14); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE((0o100644 * 65536) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, bytes); centrals.push(central, name);
    offset += local.length + name.length + bytes.length;
  }
  const central = Buffer.concat(centrals), end = Buffer.alloc(22);
  if (offset + central.length > 0xffffffff) throw new Error("ZIP64 is unsupported");
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  const result = Buffer.concat([...locals, central, end]);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, result);
  return { path: output, sha256: sha256(result), files: entries.map((entry) => entry.name) };
}

/** One anonymous AMD module, with the UMD runtime captured locally; no eval or remote JS. */
export function createBundledLoader(bundleSource, loaderSource, { bundleFile, assetsURL, release }) {
  return `/* Bundled runtime ${bundleFile}; SHA-256 ${release.sha256}. */\ndefine([], function () {\n` +
    `  var runtime, Widget;\n  function bundleDefine(deps, factory) {\n` +
    `    var exports = {};\n    if (typeof deps === "function") { factory = deps; deps = []; }\n` +
    `    var args = deps.map(function (dep) { if (dep !== "exports") throw new Error("External runtime dependency: " + dep); return exports; });\n` +
    `    runtime = factory.apply(null, args) || exports;\n  }\n  bundleDefine.amd = {};\n` +
    `  (function (define, module, exports) {\n${bundleSource}\n  })(bundleDefine, undefined, undefined);\n` +
    `  function localRequire(deps, resolve, reject) {\n    try {\n` +
    `      if (deps.length !== 1 || deps[0] !== ${JSON.stringify(assetsURL + "/" + bundleFile)}) throw new Error("Unpackaged module requested");\n` +
    `      resolve(runtime);\n    } catch (error) { if (reject) reject(error); else throw error; }\n  }\n` +
    `  localRequire.undef = function () {};\n` +
    `  function localFetch(url) {\n    if (url !== ${JSON.stringify(assetsURL + "/release.json")}) return Promise.reject(new Error("Unexpected loader fetch"));\n` +
    `    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(${JSON.stringify(release)}); } });\n  }\n` +
    `  (function (define, require, fetch) {\n${loaderSource}\n  })(function (deps, factory) { if (deps.length) throw new Error("External loader dependency"); Widget = factory(); }, localRequire, localFetch);\n` +
    `  return Widget;\n});\n`;
}

/** Legacy dynamic-manifest adapters also remain pinned in explicit remote diagnostic mode. */
export function createPinnedRemoteLoader(loaderSource, { assetsURL, release }) {
  return `/* Diagnostic remote runtime ${release.js}; not approved for public distribution. */\ndefine([], function () {\n` +
    `  var Widget;\n  function pinnedFetch(url) {\n` +
    `    if (url !== ${JSON.stringify(assetsURL + "/release.json")}) return Promise.reject(new Error("Unexpected loader fetch"));\n` +
    `    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(${JSON.stringify(release)}); } });\n  }\n` +
    `  (function (define, fetch) {\n${loaderSource}\n  })(function (deps, factory) { if (deps.length) throw new Error("External loader dependency"); Widget = factory(); }, pinnedFetch);\n` +
    `  return Widget;\n});\n`;
}

function parseArgs(argv) {
  const options = {};
  const names = new Set(["--assets-url", "--api-url", "--runtime-mode"]);
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (Object.hasOwn(options, name)) throw new Error(`Repeated option ${name}`);
    if (name === "--allow-unreviewed-remote") { options[name] = true; continue; }
    if (!names.has(name) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid option ${name}`);
    options[name] = argv[++i];
  }
  return options;
}

export function packageWidget({ root, bundleName, placeholderPrefix, zipName, apiRequired = false, argv = process.argv.slice(2), fallbackAssetsURL }) {
  const options = parseArgs(argv);
  const mode = options["--runtime-mode"] || "bundled";
  if (!["bundled", "remote"].includes(mode)) throw new Error("runtime-mode must be bundled or remote");
  if (mode === "remote" && !options["--allow-unreviewed-remote"]) throw new Error("Remote JavaScript is diagnostic only pending policy approval; pass --allow-unreviewed-remote explicitly");
  const suppliedAssets = options["--assets-url"] || fallbackAssetsURL;
  if (mode === "remote" && !suppliedAssets) throw new Error("Remote mode requires --assets-url");
  // Even ignored legacy arguments are validated, so misconfigured commands fail visibly.
  const assets = suppliedAssets ? secureURL(suppliedAssets) : "/bundled-widget-assets";
  const api = options["--api-url"] ? secureURL(options["--api-url"]) : undefined;
  if (apiRequired && !api) throw new Error("Provide --api-url");
  const release = JSON.parse(readFileSync(path.join(root, "dist-remote/release.json")));
  if (typeof release.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(release.sha256) ||
      release.js !== `${bundleName}.${release.sha256.slice(0, 16)}.umd.js`) throw new Error("Invalid pinned release");
  const bytes = readFileSync(path.join(root, "dist-remote", release.js));
  if (sha256(bytes) !== release.sha256) throw new Error("Release integrity mismatch");
  const manifest = JSON.parse(readFileSync(path.join(root, "../widget/manifest.json")));
  if (release.version !== manifest.widget.version || release.version !== JSON.parse(readFileSync(path.join(root, "package.json"))).version) throw new Error("Manifest and release versions differ");
  for (const name of readdirSync(path.join(root, "../widget/images"))) {
    const stat = lstatSync(path.join(root, "../widget/images", name));
    if (!/\.png$/.test(name) || !stat.isFile() || stat.size > 300000) throw new Error("Invalid widget image");
  }
  let loader = configureLoader(readFileSync(path.join(root, "../widget/script.js"), "utf8"), placeholderPrefix, {
    ASSETS_URL: assets, API_URL: api, BUNDLE: release.js,
  });
  if (/__RKRS_|fixture-api|localhost|127\.0\.0\.1|Bearer\s|client_secret|private_key/.test(loader)) throw new Error("Placeholder or local/secret configuration in ZIP");
  if (mode === "bundled") loader = createBundledLoader(bytes.toString("utf8"), loader, { bundleFile: release.js, assetsURL: assets, release });
  else loader = createPinnedRemoteLoader(loader, { assetsURL: assets, release });
  const staging = path.join(root, "dist-package/widget");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const file of ["manifest.json", "i18n", "images"]) cpSync(path.join(root, "../widget", file), path.join(staging, file), { recursive: true });
  writeFileSync(path.join(staging, "script.js"), loader);
  const result = reproducibleZip(staging, path.join(root, "dist-package", zipName));
  writeFileSync(path.join(root, "dist-package/build-report.json"), JSON.stringify({ version: release.version, runtime_mode: mode, remote_policy_approved: false, bundle_sha256: release.sha256, zip_sha256: result.sha256, files: result.files }, null, 2) + "\n");
  console.log(result.path);
  return result;
}
