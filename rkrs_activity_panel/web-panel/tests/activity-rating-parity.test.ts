import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/activity-rating-v1.json";
import { dashboardActivityPercent } from "../src/domain/formulas/dashboardActivity";
import { profileRatingPercent } from "../src/domain/formulas/profileRating";
import type { CrmEvent } from "../src/domain/types";

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
