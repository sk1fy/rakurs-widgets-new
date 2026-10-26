import { describe, expect, it } from "vitest";
import { profilePreview, previewNeeds } from "../src/features/employee/previewData";
import { zoned } from "../src/domain/time";
import type { Sourced } from "../src/api/source";
import type { EmployeeSessions } from "../src/domain/types";

describe("примеры пустых блоков профиля", () => {
  it("показывает все блоки при отсутствии источника сессий и звонков", () => {
    expect(previewNeeds([], { kind: "unavailable", contract: "C4", reason: "нет API" })).toEqual({ analysis: true, totals: true, tasks: true, imbox: true });
  });
  it("сохраняет заполненные блоки и обнаруживает отдельно отсутствующий Imbox", () => {
    const sample = profilePreview(42, "2026-10-26", "Europe/Moscow", 540, 1080);
    expect(previewNeeds(sample.events, sample.sessions)).toEqual({ analysis: false, totals: false, tasks: false, imbox: false });
    if (sample.sessions.kind !== "ok") throw new Error("sample");
    const tasks: Sourced<EmployeeSessions> = { kind: "ok", data: { ...sample.sessions.data, items: sample.sessions.data.items.filter((s) => s.kind === "work") } };
    expect(previewNeeds(sample.events, tasks)).toEqual({ analysis: false, totals: false, tasks: false, imbox: true });
  });
  it("генерирует выбранный день в timezone аккаунта и не создаёт CRM-ссылки", () => {
    const sample = profilePreview(42, "2026-10-26", "America/New_York", 600, 1140);
    expect(sample.events.length).toBeGreaterThan(0);
    expect(sample.events.every((e) => e.createdBy === 42 && zoned(e.createdAt, "America/New_York").dayKey === "2026-10-26")).toBe(true);
    if (sample.sessions.kind !== "ok") throw new Error("sample");
    expect(sample.sessions.data.meta.source).toBe("fixture");
    expect(sample.sessions.data.items.every((s) => s.taskUrl === null && s.stoppedAt !== null)).toBe(true);
    expect(zoned(sample.now, "America/New_York").hour).toBe(19);
  });
});
