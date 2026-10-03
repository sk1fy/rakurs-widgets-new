import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  copyFileSync,
} from "node:fs";
execFileSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--mode", "widget"],
  { stdio: "inherit" },
);
const bytes = readFileSync("dist/rkrs-distribution.umd.js"),
  hash = createHash("sha256").update(bytes).digest("hex"),
  js = `rkrs-distribution.${hash.slice(0, 16)}.umd.js`;
const release =
  JSON.stringify(
    {
      version: JSON.parse(readFileSync("package.json")).version,
      js,
      sha256: hash,
    },
    null,
    2,
  ) + "\n";
for (const folder of ["dist-remote", "public/widget-assets"]) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(`${folder}/${js}`, bytes);
  writeFileSync(`${folder}/release.json.tmp`, release);
  renameSync(`${folder}/release.json.tmp`, `${folder}/release.json`);
}
const loader = readFileSync("../widget/script.js", "utf8")
  .replaceAll("__RKRS_DISTRIBUTION_ASSETS_URL__", "/widget-assets")
  .replaceAll("__RKRS_DISTRIBUTION_API_URL__", "/fixture-api")
  .replaceAll("__RKRS_DISTRIBUTION_BUNDLE__", js);
writeFileSync("public/widget-assets/widget-loader.js", loader);
copyFileSync("node_modules/requirejs/require.js", "public/require.js");
