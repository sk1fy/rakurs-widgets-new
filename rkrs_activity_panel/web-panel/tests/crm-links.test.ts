import { describe, expect, it } from "vitest";
import { allCallsStatsLink, eventsListLink, problemHeaderLink } from "../src/domain/crmLinks";
import { openPipelineStatuses } from "../src/domain/formulas/pipelineFilter";
import { badge } from "../src/features/dashboard/HeaderIndicators";

const BASE = "https://demo.amocrm.ru";

describe("ссылки в amoCRM", () => {
  it("«Сообщения» — только исходящие сообщения чатов (event_type 90)", () => {
    const link = eventsListLink(BASE, 7, "2026-10-21", "outgoing_chat_message");
    expect(decodeURIComponent(link ?? "")).toContain("filter[event_type][]=90");
  });
  it("общее время звонков — статистика звонков за день", () => {
    const link = decodeURIComponent(allCallsStatsLink(BASE, 7, "2026-10-21") ?? "");
    expect(link).toContain("/stats/calls/?");
    expect(link).toContain("filter[main_user][]=7");
    expect(link).toContain("filter_date_from=21.10.2026");
  });
  it("без адреса CRM ссылок нет", () => {
    expect(allCallsStatsLink(null, 7, "2026-10-21")).toBeNull();
  });
});

describe("ссылки шапки с воронками", () => {
  const catalog = [
    { id: "501", name: "Продажи", statuses: [{ id: "5010", name: "Неразобранное" }, { id: "7001", name: "Контакт" }, { id: "7002", name: "Архив", disabled: true }, { id: "142", name: "Успешно" }, { id: "143", name: "Закрыто" }] },
    { id: "502", name: "Сервис", statuses: [{ id: "142", name: "Успешно" }] },
    { id: "503", name: "Другое", statuses: [{ id: "8001", name: "Этап" }] },
  ];
  it("только открытые этапы выбранных воронок", () => {
    expect(openPipelineStatuses(catalog, ["501", "502"])).toEqual([{ pipelineId: "501", statusIds: ["7001"] }]);
    expect(openPipelineStatuses(catalog, [])).toEqual([]);
  });
  it("один менеджер без воронок — готовая filter_link источника", () => {
    const rows = [{ managerId: 7, filterLink: "https://x/ready" }];
    expect(problemHeaderLink(BASE, "no_tasks", rows, [], [])).toBe("https://x/ready");
  });
  it("с воронками — фильтр filter[pipe] без sel", () => {
    const rows = [{ managerId: 7, filterLink: "https://x/ready" }];
    const link = decodeURIComponent(problemHeaderLink(BASE, "failed_tasks", rows, ["501"], openPipelineStatuses(catalog, ["501"])) ?? "");
    expect(link).toContain("filter[pipe][501][]=7001");
    expect(link).not.toContain("sel=");
  });
  it("значок ограничен 99+ / 999+", () => {
    expect(badge(120, 99)).toBe("99+");
    expect(badge(99, 99)).toBe("99");
    expect(badge(1000, 999)).toBe("999+");
  });
});
