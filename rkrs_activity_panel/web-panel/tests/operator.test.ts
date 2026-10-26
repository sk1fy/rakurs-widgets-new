import { describe, expect, it } from "vitest";
import { lastCallLabel } from "../src/domain/formulas/operator";
import { unixAt } from "../src/domain/time";

const TZ = "Europe/Moscow";
const now = unixAt("2026-09-24", 15 * 60, TZ);

describe("lastCallLabel", () => {
  it("относительное время со склонениями", () => {
    expect(lastCallLabel(now - 30, now, TZ)).toBe("только что");
    expect(lastCallLabel(now - 60, now, TZ)).toBe("1 минуту назад");
    expect(lastCallLabel(now - 3 * 60, now, TZ)).toBe("3 минуты назад");
    expect(lastCallLabel(now - 11 * 60, now, TZ)).toBe("11 минут назад");
    expect(lastCallLabel(now - 21 * 60, now, TZ)).toBe("21 минуту назад");
    expect(lastCallLabel(now - 60 * 60, now, TZ)).toBe("1 час назад");
    expect(lastCallLabel(now - 2 * 3600, now, TZ)).toBe("2 часа назад");
    expect(lastCallLabel(now - 5 * 3600, now, TZ)).toBe("5 часов назад");
  });

  it("старше суток — дата и время", () => {
    expect(lastCallLabel(unixAt("2026-09-22", 9 * 60 + 5, TZ), now, TZ)).toBe("22.09 в 09:05");
  });
});
