import { expect, it } from "vitest";
import { panelOptionsFromAPI, panelOptionsToAPI } from "../src/api/panelOptions";
import { defaultExtensions } from "../src/settings/models";
it("round trips product options without transmitting deferred Telegram settings", () => {
 const ext = { ...defaultExtensions(), pipelines: ["10"], operators: [{ employeeId: 7, enabled: true, plan: 80, dialingSeconds: 10, conversationSeconds: 30, exceedingSeconds: 180 }], departmentThresholds: { "1": { dialingSeconds: 5, conversationSeconds: 20, exceedingSeconds: 120 } } };
 const raw = panelOptionsToAPI(ext);
 expect(raw).not.toHaveProperty("telegram");
 expect(panelOptionsFromAPI(raw)).toEqual(ext);
});
