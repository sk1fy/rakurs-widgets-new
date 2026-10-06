import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--mode", "widget"], {
  cwd: root,
  stdio: "inherit",
});
const bundle = readFileSync(path.join(root, "dist/rkrs-mass-leads.umd.js"));
const hash = createHash("sha256").update(bundle).digest("hex").slice(0, 12);
const js = `rkrs-mass-leads.${hash}.umd.js`;
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const manifest =
  JSON.stringify({ version, js, built_at: new Date().toISOString(), mode: "prototype" }, null, 2) + "\n";
for (const folder of ["dist-remote", "public/widget-assets"]) {
  const target = path.join(root, folder);
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, js), bundle);
  writeFileSync(path.join(target, "release.json.tmp"), manifest);
  renameSync(path.join(target, "release.json.tmp"), path.join(target, "release.json"));
}
const loader = readFileSync(path.join(root, "../widget/script.js"), "utf8");
if (!loader.includes("__RKRS_MASS_LEADS_ASSETS_URL__")) {
  throw new Error("Missing assets URL placeholder in widget/script.js");
}
writeFileSync(
  path.join(root, "public/widget-assets/widget-loader.js"),
  loader.replaceAll("__RKRS_MASS_LEADS_ASSETS_URL__", "/widget-assets")
);
copyFileSync(path.join(root, "node_modules/requirejs/require.js"), path.join(root, "public/require.js"));
console.log(`Remote release: dist-remote/${js} + release.json\nLocal AMD preview: http://127.0.0.1:5176/`);
