import { describe, expect, it } from "vitest";
import { fixturePanel } from "../src/api/fixtures/generator";
import { formatPp, formatRating, periodNav, periodRouteDate, resolvePeriod, selectedEmployees } from "../src/features/period/model";
import { periodOf } from "../src/domain/period";
import { defaultPreferences } from "../src/settings/models";

const today = "2026-11-05";

describe("экран недели/месяца", () => {
  it("берёт период из любой даты маршрута, по умолчанию — текущий", () => {
    expect(resolvePeriod("week", null, today).start).toBe("2026-11-02");
    expect(resolvePeriod("week", "2026-10-28", today).start).toBe("2026-10-26");
    expect(resolvePeriod("month", "2026-12-10", today).start).toBe("2026-11-01");
    // Старше 33 суток истории — самый ранний доступный период.
    expect(resolvePeriod("week", "2026-09-01", today).start).toBe("2026-09-28");
  });

  it("ограничивает навигацию history_from и текущим периодом", () => {
    const nav = periodNav(periodOf("week", today), today, "2026-10-04");
    expect(nav.isCurrent).toBe(true);
    expect(nav.next).toBeNull();
    expect(nav.prev?.start).toBe("2026-10-26");
    expect(periodNav(periodOf("week", "2026-10-05"), today, "2026-10-04").prev?.start).toBe("2026-09-28");
    expect(periodNav(periodOf("week", "2026-10-05"), today, "2026-10-05").prev).toBeNull();
    expect(periodNav(periodOf("month", "2026-10-05"), today, "2026-10-04").prev).toBeNull();
    expect(periodRouteDate(periodOf("week", today), today)).toBeNull();
    expect(periodRouteDate(periodOf("week", "2026-10-28"), today)).toBe("2026-10-26");
  });

  it("делит выбор сотрудников с дневным экраном", () => {
    const panel = fixturePanel(0);
    const prefs = { ...defaultPreferences(), hiddenEmployees: [9001], selectedDepartments: ["1"] };
    expect(selectedEmployees(panel, prefs).map((e) => e.id)).toEqual([9002, 9003, 9004]);
    expect(selectedEmployees(panel, defaultPreferences())).toHaveLength(9);
  });

  it("форматирует рейтинг как карточка дня и разность в п.п.", () => {
    expect(formatRating(0.47)).toBe("47%");
    expect(formatRating(138 / 480)).toBe("28.7%");
    expect(formatRating(null)).toBe("—");
    expect(formatPp(0.031)).toBe("+3.1 п.п.");
    expect(formatPp(-0.05)).toBe("−5 п.п.");
  });
});
