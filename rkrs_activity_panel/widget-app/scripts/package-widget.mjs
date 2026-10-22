import { fileURLToPath } from "node:url";
import { packageWidget } from "../../../packages/widget-build/index.mjs";

packageWidget({
  root: fileURLToPath(new URL("../", import.meta.url)),
  bundleName: "rkrs-activity",
  placeholderPrefix: "ACTIVITY",
  zipName: "rkrs-activity-prototype.zip",
  apiRequired: false,
  fallbackAssetsURL: process.env.RKRS_ACTIVITY_ASSETS_URL,
});
