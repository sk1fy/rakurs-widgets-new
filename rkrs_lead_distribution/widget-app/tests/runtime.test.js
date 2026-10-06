import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
function environment() {
  const dom = new JSDOM("<main></main>", {
    url: "https://demo.amocrm.ru",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  dom.window.structuredClone = structuredClone;
  let app;
  dom.window.define = (_deps, fn) => {
    app = {};
    fn(app);
  };
  dom.window.define.amd = {};
  dom.window.eval(readFileSync("dist/rkrs-distribution.umd.js", "utf8"));
  return { dom, app, target: dom.window.document.querySelector("main") };
}
function fixture(response) {
  const requests = [];
  return {
    requests,
    $authorizedAjax(o) {
      const callbacks = {};
      const r = {
        done(fn) {
          callbacks.done = fn;
          return r;
        },
        fail(fn) {
          callbacks.fail = fn;
          return r;
        },
        abort() {
          r.aborted = true;
          callbacks.fail?.({ status: 0 });
        },
        resolve(data = response(o)) {
          callbacks.done?.(data, "ok", { status: 200 });
        },
      };
      requests.push(r);
      return r;
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
test("navigation discards old replies and aborts requests; repeated mount idempotent; destroy clears nodes", async () => {
  const { dom, app, target } = environment(),
    widget = fixture(() => ({
      state: "active",
      accountId: "1",
      userId: "2",
      binding: {},
      canManage: false,
    }));
  app.mount({
    widget,
    target,
    identity: "1",
    mode: "card",
    leadId: "10",
    apiUrl: "https://api.test",
  });
  assert.equal(widget.requests.length, 1);
  app.mount({
    widget,
    target,
    identity: "1",
    mode: "card",
    leadId: "10",
    apiUrl: "https://api.test",
  });
  assert.equal(widget.requests.length, 1);
  app.mount({
    widget,
    target,
    identity: "2",
    mode: "card",
    leadId: "20",
    apiUrl: "https://api.test",
  });
  assert.equal(widget.requests[0].aborted, true);
  widget.requests[0].resolve({ state: "unbound", accountId: "OLD" });
  widget.requests[1].resolve();
  await tick();
  widget.requests[3].resolve({ items: [] });
  widget.requests[4].resolve({ employees: [] });
  widget.requests[2].resolve({
    items: [
      {
        id: "a",
        state: "waiting",
        reason: "no_available_employee",
        groupId: "new",
        actions: [],
      },
    ],
  });
  await tick();
  assert(!target.shadowRoot.textContent.includes("OLD"));
  assert(target.shadowRoot.textContent.includes("Никто не на смене"));
  assert(!dom.window.localStorage.length);
  app.destroy(widget);
  assert.equal(target.shadowRoot.children.length, 0);
  dom.window.close();
});
test("unbound and forbidden never request runtime or expose prior data", async () => {
  const { dom, app, target } = environment(),
    widget = fixture(() => ({ state: "unbound", accountId: "9", userId: "2" }));
  app.mount({
    widget,
    target,
    identity: "x",
    mode: "settings",
    apiUrl: "https://api.test",
  });
  widget.requests[0].resolve();
  await tick();
  assert.equal(widget.requests.length, 1);
  assert(target.shadowRoot.textContent.includes("Свяжите аккаунт"));
  app.destroy(widget);
  dom.window.close();
});

function observerFixture({
  badLead = false,
  badObservations = false,
  futureDecision = false,
  liveWork = false,
  holdWrites = false,
  missingMode = false,
  noRules = false,
} = {}) {
  const requests = [];
  let forbidden = false;
  let historyForbidden = false;
  let pendingWrite;
  const obs = {
    id: "observation-one",
    ruleId: "rule-one",
    groupId: "group-one",
    leadId: "10",
    executionEpoch: 1,
    ruleRevision: 1,
    decisionKind: futureDecision ? "future_decision" : "assign",
    reason: "decision_ready",
    checkedAt: new Date().toISOString(),
    currentResponsibleUserId: "22",
    plannedEmployeeId: "employee-one",
    nextShiftAt: null,
  };
  return {
    requests,
    setHistoryForbidden() {
      historyForbidden = true;
    },
    rejectWrite(status) {
      pendingWrite?.({ status });
    },
    setForbidden() {
      forbidden = true;
    },
    $authorizedAjax(options) {
      const body = options.data ? JSON.parse(options.data) : null;
      requests.push(body);
      let done, fail;
      const request = {
        done(fn) {
          done = fn;
          return request;
        },
        fail(fn) {
          fail = fn;
          return request;
        },
        abort() {},
      };
      setTimeout(() => {
        if (forbidden) {
          fail?.({
            status: 403,
            responseJSON: { error: { message: "Нет прав" } },
          });
          return;
        }
        if (body?.write && holdWrites) {
          pendingWrite = fail;
          return;
        }
        if (body?.kind === "history" && historyForbidden) {
          fail?.({
            status: 403,
            responseJSON: { error: { message: "Доступ к истории отозван" } },
          });
          return;
        }
        let data;
        if (options.url.endsWith("/bootstrap"))
          data = {
            state: "active",
            accountId: "1",
            userId: "2",
            canManage: true,
            binding: { id: "binding" },
          };
        else if (body.kind === "lead")
          data = badLead
            ? {}
            : {
                items: liveWork
                  ? [
                      {
                        id: "queue-one",
                        groupId: "group-one",
                        leadId: "10",
                        state: "uncertain",
                        reason: "outcome_unknown",
                        actions: ["check", "cancel"],
                        updatedAt: "2026-10-03T08:00:00Z",
                      },
                    ]
                  : [],
                latestObservation: obs,
                currentLead: {
                  responsibleUserId: "33",
                  responsibleUserName: "Ольга",
                  observedAt: new Date().toISOString(),
                  deleted: false,
                  absent: false,
                },
                checkedAt: new Date().toISOString(),
              };
        else if (body.kind === "groups")
          data = {
            items: [
              { id: "group-one", name: "Группа", memberIds: [], revision: 1 },
            ],
          };
        else if (body.kind === "references")
          data = {
            employees: [{ id: "employee-one", name: "Анна" }],
            users: [{ id: "22", name: "Иван" }],
            pipelines: [],
          };
        else if (body.kind === "rules")
          data = noRules
            ? { items: [] }
            : {
                items: [
                  {
                    id: "rule-one",
                    groupId: "group-one",
                    pipelineId: "1",
                    statusId: "2",
                    revision: 1,
                    active: true,
                    ...(missingMode ? {} : { executionMode: "observe" }),
                    executionEpoch: 1,
                    keepCurrentResponsible: true,
                  },
                ],
              };
        else if (body.kind === "observations")
          data = badObservations
            ? {}
            : {
                items: [obs],
                limit: 20,
                offset: 0,
                hasMore: false,
                checkedAt: new Date().toISOString(),
              };
        else if (body.kind === "history")
          data = {
            items: [
              {
                createdAt: "2026-10-03T08:00:00Z",
                state: "confirmed",
                reason: "assignment_confirmed",
              },
            ],
            hasMore: false,
          };
        else data = {};
        done?.(data, "ok", { status: 200 });
      }, 0);
      return request;
    },
  };
}
async function settle() {
  for (let i = 0; i < 8; i++) await tick();
}
test("observe-only lead separates fresh CRM owner, historical owner and proposed recipient without assignment controls", async () => {
  const { dom, app, target } = environment(),
    widget = observerFixture();
  try {
    app.mount({
      widget,
      target,
      identity: "observe-card",
      mode: "card",
      leadId: "10",
      apiUrl: "https://api.test",
    });
    await settle();
    const content = target.shadowRoot.textContent;
    assert(content.includes("Ответственный amoCRM: Ольга"));
    assert(content.includes("Ответственный на момент наблюдения: Иван"));
    assert(content.includes("Предлагаемый сотрудник: Анна"));
    assert(content.includes("В этой области нет записей назначения"));
    assert(
      !target.shadowRoot
        .querySelector("button")
        ?.textContent?.includes("назначить"),
    );
    assert(!widget.requests.some((body) => body?.write));
    widget.setForbidden();
    target.shadowRoot.querySelector("button").click();
    await settle();
    assert(!target.shadowRoot.textContent.includes("Ольга"));
    assert(!target.shadowRoot.textContent.includes("Иван"));
    assert(!target.shadowRoot.textContent.includes("Анна"));
  } finally {
    app.destroy(widget);
    dom.window.close();
  }
});
test("malformed lead and observation envelopes show errors rather than empty success", async () => {
  for (const mode of ["card", "settings"]) {
    const { dom, app, target } = environment(),
      widget = observerFixture({
        badLead: mode === "card",
        badObservations: mode === "settings",
      });
    try {
      app.mount({
        widget,
        target,
        identity: mode,
        mode,
        leadId: "10",
        apiUrl: "https://api.test",
      });
      await settle();
      assert(
        target.shadowRoot.textContent.includes("неполное") ||
          target.shadowRoot.textContent.includes("неполный"),
      );
      assert(
        !target.shadowRoot.textContent.includes("Для этой сделки нет записей"),
      );
      assert(
        !target.shadowRoot.textContent.includes(
          "В доступной области записей наблюдения пока нет",
        ),
      );
    } finally {
      app.destroy(widget);
      dom.window.close();
    }
  }
});
test("future observation decision stays unknown rather than skipped or successful", async () => {
  const { dom, app, target } = environment(),
    widget = observerFixture({ futureDecision: true });
  try {
    app.mount({
      widget,
      target,
      identity: "future",
      mode: "card",
      leadId: "10",
      apiUrl: "https://api.test",
    });
    await settle();
    assert(
      target.shadowRoot.textContent.includes("Тип решения не подтверждён"),
    );
    assert(!target.shadowRoot.textContent.includes("Наблюдение пропущено"));
    assert(!widget.requests.some((body) => body?.write));
  } finally {
    app.destroy(widget);
    dom.window.close();
  }
});

function clickButton(target, title) {
  const button = [...target.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent === title,
  );
  assert(button, `Missing button: ${title}`);
  button.click();
  return button;
}
test("history permission loss immediately removes cached history and lead data", async () => {
  const { dom, app, target } = environment();
  const widget = observerFixture({ liveWork: true });
  try {
    app.mount({
      widget,
      target,
      identity: "history-revoked",
      mode: "card",
      leadId: "10",
      apiUrl: "https://api.test",
    });
    await settle();
    clickButton(target, "История");
    await settle();
    assert(
      target.shadowRoot
        .querySelector(".history")
        .textContent.includes("Назначение подтверждено"),
    );
    widget.setHistoryForbidden();
    clickButton(target, "История");
    await settle();
    assert(target.shadowRoot.textContent.includes("Доступ к истории отозван"));
    assert(!target.shadowRoot.textContent.includes("Ольга"));
    assert(!target.shadowRoot.textContent.includes("Анна"));
    assert(!target.shadowRoot.querySelector(".history"));
  } finally {
    app.destroy(widget);
    dom.window.close();
  }
});
test("replay denied by current permissions keeps the original uncertain request identity", async () => {
  const { dom, app, target } = environment();
  const widget = observerFixture({ liveWork: true, holdWrites: true });
  try {
    app.mount({
      widget,
      target,
      identity: "replay-denied",
      mode: "card",
      leadId: "10",
      apiUrl: "https://api.test",
    });
    await settle();
    clickButton(target, "Проверить результат");
    await settle();
    widget.rejectWrite(503);
    await settle();
    clickButton(target, "Проверить тот же запрос");
    await settle();
    widget.rejectWrite(403);
    await settle();
    assert(
      [...target.shadowRoot.querySelectorAll("button")].some(
        (b) => b.textContent === "Проверить тот же запрос",
      ),
    );
    clickButton(target, "Проверить тот же запрос");
    await settle();
    const writes = widget.requests.filter((body) => body?.write);
    assert.equal(writes.length, 3);
    assert.deepEqual(writes[1], writes[0]);
    assert.deepEqual(writes[2], writes[0]);
  } finally {
    app.destroy(widget);
    dom.window.close();
  }
});
test("polling resumes when its timer fires during an unresolved write", async () => {
  const { dom, app, target } = environment();
  const widget = observerFixture({ liveWork: true, holdWrites: true });
  const timers = [];
  const originalTimeout = dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout = (callback, delay, ...args) => {
    if (delay === 15000) {
      timers.push(callback);
      return -timers.length;
    }
    return originalTimeout(callback, delay, ...args);
  };
  try {
    app.mount({
      widget,
      target,
      identity: "poll-write",
      mode: "card",
      leadId: "10",
      apiUrl: "https://api.test",
    });
    await settle();
    assert.equal(timers.length, 1);
    clickButton(target, "Проверить результат");
    await settle();
    timers.shift()();
    assert.equal(timers.length, 1, "busy poll must schedule its next read");
    widget.rejectWrite(503);
    await settle();
    const before = widget.requests.filter(
      (body) => body?.kind === "lead",
    ).length;
    timers.shift()();
    await settle();
    assert.equal(
      widget.requests.filter((body) => body?.kind === "lead").length,
      before + 1,
    );
    assert.equal(
      widget.requests.filter((body) => body?.write).length,
      1,
      "poll must not replay writes",
    );
  } finally {
    app.destroy(widget);
    dom.window.close();
  }
});

test("missing execution mode never claims the rule is live", async () => {  const { dom, app, target } = environment();
  const widget = observerFixture({ missingMode: true });
  try {
    app.mount({
      widget,
      target,
      identity: "missing-mode",
      mode: "settings",
      apiUrl: "https://api.test",
    });
    await settle();
    assert(
      target.shadowRoot.textContent.includes(
        "Источник не подтвердил режим правила",
      ),
    );
    assert(
      !target.shadowRoot.textContent.includes(
        "рабочий режим, наблюдение не подтверждено",
      ),
    );
    assert.equal(
      target.shadowRoot.querySelector('[aria-label="Режим правила"]').value,
      "",
    );
    assert.equal(
      target.shadowRoot.querySelector('[aria-label="Режим правила"]').disabled,
      true,
    );
  } finally {
    app.destroy(widget);
    dom.window.close();
  }
});
