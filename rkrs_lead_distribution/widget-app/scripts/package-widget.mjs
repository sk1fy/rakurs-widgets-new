import { fileURLToPath } from "node:url";
import { packageWidget } from "../../../packages/widget-build/index.mjs";

packageWidget({
  root: fileURLToPath(new URL("../", import.meta.url)),
  bundleName: "rkrs-distribution",
  placeholderPrefix: "DISTRIBUTION",
  zipName: "rkrs-lead-distribution.zip",
  apiRequired: true,
});
