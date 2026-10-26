import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/activity-rating-v1.json";
import { dashboardActivityPercent } from "../src/domain/formulas/dashboardActivity";
import { profileRatingPercent } from "../src/domain/formulas/profileRating";
import type { CrmEvent } from "../src/domain/types";
import roundingOracle from "./fixtures/activity-rating-rounding-v1.json";
import { extractPipelineIds, filterByPipelines } from "../src/domain/formulas/pipelineFilter";

describe("Activity shared legacy formula fixtures", () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const events: CrmEvent[] = fixture.events.map((event) => ({
        ...event,
        pipelineIds: event.pipelineIds.map(String),
        taskId: null,
        taskTypeId: null,
        statusId: null,
        related: null,
        call: event.call ? { ...event.call, phone: null, entityType: null, entityId: null, result: null, link: null } : null,
      }));
      const input = { ...fixture, events, nowUnix: fixture.cutoffUnix };
      expect(dashboardActivityPercent(input)).toBe(fixture.expectedDashboard);
      expect(profileRatingPercent(input)).toBe(fixture.expectedProfile);
    });
  }
});

it("matches the shared exhaustive rounding oracle for every supported interval count", async () => {
  const values = new Uint8Array(roundingOracle.pairs * 2);
  const view = new DataView(values.buffer);
  let pair = 0;
  for (let total = 1; total <= roundingOracle.max_total; total++) {
    for (let active = 0; active <= total + 2; active++) {
      const percent = (active / total) * 100;
      const rounded = Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
      view.setUint16(pair++ * 2, Math.round(rounded * 10), true);
    }
  }
  expect(pair).toBe(roundingOracle.pairs);
  const digest = await crypto.subtle.digest("SHA-256", values);
  expect(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")).toBe(roundingOracle.sha256);
});

it("retains realistic numeric pipeline IDs without exponent notation", () => {
  for (const id of [5123456, 987654321]) {
    const pipelineIds = extractPipelineIds({ value_after: [{ lead_status: { pipeline_id: id } }] });
    expect(pipelineIds).toEqual([String(id)]);
    const event: CrmEvent = { id: "pipeline", type: "lead_added", createdAt: 0, createdBy: 7, entityType: "leads", entityId: 1, pipelineIds, call: null, taskId: null, taskTypeId: null, statusId: null, related: null };
    expect(filterByPipelines([event], [String(id)])).toEqual([event]);
  }
});
