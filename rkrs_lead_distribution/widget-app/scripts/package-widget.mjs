import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  readdirSync,
  statSync,
  utimesSync,
} from "node:fs";
function arg(name) {
  return process.argv[process.argv.indexOf(name) + 1];
}
function secureURL(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash)
    throw new Error(
      "Configured URLs must be HTTPS without credentials/query/fragment",
    );
  return u.href.replace(/\/$/, "");
}
const assets = secureURL(arg("--assets-url")),
  api = secureURL(arg("--api-url"));
const release = JSON.parse(readFileSync("dist-remote/release.json"));
if (!/^rkrs-distribution\.[a-f0-9]{16}\.umd\.js$/.test(release.js))
  throw new Error("Invalid pinned release");
const actualHash = createHash("sha256")
  .update(readFileSync(`dist-remote/${release.js}`))
  .digest("hex");
if (
  actualHash !== release.sha256 ||
  !release.js.includes(actualHash.slice(0, 16))
)
  throw new Error("Release integrity mismatch");
if (
  release.version !==
  JSON.parse(readFileSync("../widget/manifest.json")).widget.version
)
  throw new Error("Manifest and release versions differ");
for (const name of readdirSync("../widget/images")) {
  if (
    !/\.png$/.test(name) ||
    statSync(`../widget/images/${name}`).size > 300000
  )
    throw new Error("Invalid widget image");
}
const folder = "dist-package/widget";
rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
for (const file of ["manifest.json", "i18n", "images"])
  cpSync(`../widget/${file}`, `${folder}/${file}`, { recursive: true });
let source = readFileSync("../widget/script.js", "utf8");
for (const [key, value] of Object.entries({
  ASSETS_URL: assets,
  API_URL: api,
  BUNDLE: release.js,
}))
  source = source.replace(
    new RegExp("(['\"])__RKRS_DISTRIBUTION_" + key + "__\\1"),
    () => JSON.stringify(value),
  );
if (
  /__RKRS_|fixture-api|localhost|127\.0\.0\.1|Bearer\s|client_secret|private_key/.test(
    source,
  )
)
  throw new Error("Placeholder or local/secret configuration in ZIP");
writeFileSync(`${folder}/script.js`, source);
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) walk(p);
    else {
      utimesSync(p, 946684800, 946684800);
      files.push(p.slice(folder.length + 1));
    }
  }
}
walk(folder);
const zip = `${process.cwd()}/dist-package/rkrs-lead-distribution.zip`;
rmSync(zip, { force: true });
execFileSync("zip", ["-X", "-q", zip, ...files], {
  cwd: folder,
  env: { ...process.env, TZ: "UTC" },
});
console.log(zip);
