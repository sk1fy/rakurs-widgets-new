import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const index = process.argv.indexOf("--assets-url");
const assets =
  index >= 0 ? process.argv[index + 1] : process.env.RKRS_ACTIVITY_ASSETS_URL;
let url;
try {
  url = new URL(assets);
} catch {
  throw new Error(
    "Provide --assets-url https://your-host/widget-assets (assets must already be hosted there)."
  );
}
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
)
  throw new Error(
    "Assets URL must be HTTPS without credentials, query or fragment."
  );
const staging = path.join(root, "dist-package/widget");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
for (const file of ["manifest.json", "i18n", "images"])
  cpSync(path.join(root, "../widget", file), path.join(staging, file), {
    recursive: true,
  });
const source = readFileSync(path.join(root, "../widget/script.js"), "utf8");
// JSON encoding keeps a supplied URL from becoming executable source text.
const configured = source.replace(/(["'])__RKRS_ACTIVITY_ASSETS_URL__\1/, () =>
  JSON.stringify(url.href.replace(/\/$/, ""))
);
if (configured === source) throw new Error("Missing loader URL placeholder.");
writeFileSync(path.join(staging, "script.js"), configured);
const zip = path.join(root, "dist-package/rkrs-activity-prototype.zip");
rmSync(zip, { force: true });
execFileSync(
  "zip",
  ["-qr", zip, "script.js", "manifest.json", "i18n", "images"],
  { cwd: staging }
);
console.log(
  `Created ${zip}\nPrototype only; no backend authorization or live CRM writes.`
);
