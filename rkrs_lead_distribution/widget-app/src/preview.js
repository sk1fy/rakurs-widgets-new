// Explicit developer-only SDK fixture. Not imported by runtime/UMD.
import "./preview.css";
const uuid = "10000000-0000-4000-8000-000000000001",
  group = "20000000-0000-4000-8000-000000000001";
let rule = {
  id: uuid,
  groupId: group,
  pipelineId: "100",
  statusId: "101",
  revision: 1,
  active: true,
  keepCurrentResponsible: true,
};
const extraRules = [];
let scenario = "ready",
  card = "501";
const title = document.createElement("header");
title.innerHTML =
  '<h1>Ракурс · локальный стенд</h1><p>Тестовые данные. Запросы не обращаются к amoCRM и не назначают реальных ответственных.</p><label>Экран <select id="mode"><option value="settings">Настройки</option><option value="card">Карточка сделки</option></select></label><label>Сценарий <select id="scenario"><option value="ready">Подключено</option><option value="unbound">Не подключено</option><option value="forbidden">Нет прав</option><option value="outage">Сервер недоступен</option><option value="conflict">Конфликт настроек</option><option value="unknown">Неопределённый результат</option></select></label><button id="next">Другая сделка</button><button id="destroy">Закрыть</button><button id="open">Открыть</button>';
document.body.append(title);
const target = document.createElement("main");
document.body.append(target);
let widget;
window.__rs08Requests = [];
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    widget?.callbacks.destroy();
    title.remove();
    target.remove();
  });
const sdk = {
  $authorizedAjax(options) {
    let success,
      failure,
      cancel = false;
    const deferred = {
      done(fn) {
        success = fn;
        return this;
      },
      fail(fn) {
        failure = fn;
        return this;
      },
      abort() {
        cancel = true;
        failure?.({ status: 0 });
      },
    };
    setTimeout(() => {
      if (cancel) return;
      const body = options.data ? JSON.parse(options.data) : null;
      if (body) window.__rs08Requests.push(structuredClone(body));
      if (
        body &&
        ((["history", "action"].includes(body.kind) &&
          body.leadId !== String(card)) ||
          (body.kind === "action" &&
            body.payload?.requestId !== body.requestId) ||
          Object.keys(body).some(
            (k) =>
              ![
                "kind",
                "id",
                "leadId",
                "limit",
                "offset",
                "write",
                "requestId",
                "payload",
              ].includes(k),
          ))
      )
        return failure?.({ status: 400 });
      if (scenario === "outage") return failure?.({ status: 503 });
      if (scenario === "forbidden") return failure?.({ status: 403 });
      if (body?.write && scenario === "conflict")
        return failure?.({ status: 409 });
      if (body?.write && scenario === "unknown")
        return success?.({ state: "pending" }, "success", { status: 202 });
      let data;
      if (options.url.endsWith("/bootstrap"))
        data = {
          state: scenario === "unbound" ? "not_connected" : "active",
          accountId: "777",
          userId: "42",
          canManage: true,
          teamOSUrl: "https://teamos.example.test/distribution",
          binding: { id: uuid },
        };
      else if (body.kind === "rules" && !body.write)
        data = { items: [rule, ...extraRules] };
      else if (body.kind === "groups")
        data = {
          items: [
            {
              id: group,
              name: "Первичные обращения",
              revision: 1,
              memberIds: [
                "30000000-0000-4000-8000-000000000001",
                "30000000-0000-4000-8000-000000000002",
              ],
              disabledMemberIds: [],
              active: true,
              algorithm: "round_robin",
            },
            {
              id: "20000000-0000-4000-8000-000000000002",
              name: "Вторая группа",
              revision: 1,
              memberIds: ["30000000-0000-4000-8000-000000000001"],
              disabledMemberIds: [],
              active: true,
              algorithm: "round_robin",
            },
          ],
        };
      else if (body.kind === "references")
        data = {
          employees: [
            { id: "30000000-0000-4000-8000-000000000001", name: "Анна" },
            { id: "30000000-0000-4000-8000-000000000002", name: "Иван" },
          ],
          pipelines: [
            {
              id: "100",
              name: "Продажи",
              statuses: [
                { id: "101", name: "Новая заявка" },
                { id: "102", name: "Переговоры" },
              ],
            },
          ],
        };
      else if (body.kind === "lead")
        data = {
          checkedAt: new Date().toISOString(),
          items: [
            {
              id: uuid,
              groupId: group,
              leadId: card,
              state: "waiting",
              reason: "no_available_employee",
              nextAttemptAt: new Date(Date.now() + 3600000).toISOString(),
              currentEmployeeId: "30000000-0000-4000-8000-000000000002",
              plannedEmployeeId: null,
              updatedAt: new Date().toISOString(),
              actions: ["recalculate", "cancel"],
            },
          ],
        };
      else if (body.kind === "history")
        data = {
          items: [
            {
              createdAt: new Date().toISOString(),
              state: "waiting",
              reason: "no_available_employee",
            },
          ],
        };
      else if (body.kind === "rules" && body.write) {
        data = {
          ...body.payload,
          id: "10000000-0000-4000-8000-000000000002",
          revision: 1,
        };
        extraRules.push(data);
      } else if (body.kind === "rule" && body.write) {
        rule = { ...rule, ...body.payload, revision: rule.revision + 1 };
        data = rule;
      } else data = {};
      success?.(data, "success", { status: 200 });
    }, 100);
    return deferred;
  },
};
function open() {
  if (!widget) return;
  window.AMOCRM.data.current_card.id = card;
  widget.callbacks.destroy();
  if (document.querySelector("#mode").value === "card")
    widget.callbacks.render();
  else widget.callbacks.settings(target);
}
for (const id of ["mode", "scenario"])
  document.getElementById(id).addEventListener("change", () => {
    scenario = document.querySelector("#scenario").value;
    open();
  });
document.getElementById("next").onclick = () => {
  card = card === "501" ? "502" : "501";
  open();
};
document.getElementById("destroy").onclick = () => widget?.callbacks.destroy();
document.getElementById("open").onclick = open;
window.AMOCRM = {
  constant: (key) => ({ id: key === "account" ? "777" : "42" }),
  data: { current_card: { id: card } },
};
window.require(["/widget-assets/widget-loader.js"], (Constructor) => {
  widget = new Constructor();
  widget.$authorizedAjax = sdk.$authorizedAjax;
  widget.render_template = (options) => {
    target.innerHTML = options.render;
  };
  open();
});
