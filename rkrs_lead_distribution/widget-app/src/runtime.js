import { createClient } from "./client.js";
import css from "./widget.css?inline";
const instances = new Map();
const labels = {
  group_paused: "Группа на паузе",
  assignment_confirmed: "Назначение подтверждено",
  current_owner_kept: "Текущий ответственный сохранён",
  decision_ready: "Сотрудник выбран",
  decision_expired: "Решение устарело, нужна новая проверка",
  source_unavailable: "Состояние amoCRM недоступно",
  source_changed: "Данные сделки изменились",
  binding_unavailable: "Связь с TeamOS недоступна",
  operation_unfinished: "Результат операции ещё не подтверждён",
  group_operation_unfinished: "Предыдущее назначение группы ещё не завершено",
  lead_operation_unfinished: "Назначение этой сделки ещё не завершено",
  recipient_unavailable: "Выбранный сотрудник недоступен",
  crm_users_unavailable: "Данные сотрудников amoCRM недоступны",
  timezone_required: "Настройте часовой пояс компании",
  needs_configuration: "Нужна настройка",
  checking: "Проверяем состояние",
  confirming: "Подтверждаем назначение",
  cancel_pending: "Отмена уточняется",
  observed_stage_exit: "Сделка вышла из этапа",
  dispatching: "Назначается",
  uncertain: "Результат уточняется",
  requires_configuration: "Требуется настройка",
  failed: "Ошибка назначения",
  no_available_members: "Никто не доступен",
  source_time_unknown: "Неизвестно время входа сделки",
  rule_inactive: "Группа на паузе",
  mapping_unavailable: "Нет подтверждённой связи сотрудника с amoCRM",
  waiting: "Ожидает",
  assigning: "Назначается",
  sent_unknown: "Результат уточняется",
  assigned: "Ответственный назначен",
  confirmed: "Назначение подтверждено",
  kept: "Ответственный сохранён",
  cancelled: "Отменено",
  error: "Требует внимания",
  no_available_employee: "Никто не на смене",
  team_unavailable: "TeamOS недоступен",
  outcome_unknown: "Результат уточняется",
  on_shift: "На смене",
};
const text = (value) =>
  labels[value] || (value ? "Требуется проверка администратора" : "—");
const safeURL = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
};
export function destroy(widget) {
  const state = instances.get(widget);
  if (!state) return;
  state.alive = false;
  clearTimeout(state.timer);
  state.client.destroy();
  state.doc.removeEventListener("visibilitychange", state.visibility);
  state.target.shadowRoot?.replaceChildren();
  state.target.replaceChildren();
  instances.delete(widget);
}
export function mount(context) {
  const current = instances.get(context.widget);
  if (
    current?.target === context.target &&
    current.identity === context.identity
  )
    return;
  destroy(context.widget);
  const doc = context.target.ownerDocument,
    shadow =
      context.target.shadowRoot ||
      context.target.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  const style = doc.createElement("style");
  style.textContent = css;
  shadow.append(style);
  const root = doc.createElement("section");
  root.className = "panel";
  shadow.append(root);
  const state = {
    ...context,
    doc,
    root,
    alive: true,
    client: createClient(context.widget, context.apiUrl),
    bootstrap: null,
    rules: [],
    groups: [],
    refs: { pipelines: [] },
    selection: null,
    draft: null,
    pending: null,
    histories: new Map(),
    error: "",
    busy: false,
    timer: null,
  };
  instances.set(context.widget, state);
  const node = (tag, content, attrs = {}) => {
    const e = doc.createElement(tag);
    if (content != null) e.textContent = content;
    for (const [key, value] of Object.entries(attrs))
      e.setAttribute(key, String(value));
    return e;
  };
  function button(label, action, disabled = false, primary = false) {
    const b = node("button", label, { type: "button" });
    b.disabled = disabled;
    b.className = primary ? "primary" : "";
    b.addEventListener("click", action);
    return b;
  }
  function link(label, url) {
    const safe = safeURL(url);
    if (!safe) return null;
    return node("a", label, {
      href: safe,
      target: "_blank",
      rel: "noopener noreferrer",
    });
  }
  function field(parent, label, value, onchange, type = "text") {
    const l = node("label", label),
      input = node("input", null, { type });
    if (type === "checkbox") input.checked = value;
    else input.value = value || "";
    input.addEventListener("change", () =>
      onchange(type === "checkbox" ? input.checked : input.value),
    );
    l.append(input);
    parent.append(l);
    return input;
  }
  async function read(body) {
    const result = await state.client.runtime(body);
    return result.data;
  }
  async function readRules() {
    const items = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await read({ kind: "rules", limit: 100, offset });
      items.push(...(page.items || []));
      if ((page.items || []).length < 100) return { items };
    }
    throw new Error(
      "Показаны не все правила: ограничение 1000. Обратитесь к администратору.",
    );
  }
  async function refresh() {
    if (!state.alive || state.busy || state.reading || doc.hidden) return;
    state.reading = true;
    state.partial = false;
    try {
      const result = await state.client.bootstrap();
      if (!state.alive) return;
      state.bootstrap = result.data;
      if (
        state.bootstrap.state === "active" ||
        state.bootstrap.state === "ready"
      ) {
        if (state.mode === "card") {
          const [data, groups, refs] = await Promise.all([
            read({ kind: "lead", leadId: state.leadId, limit: 20, offset: 0 }),
            read({ kind: "groups" }).catch(() => ({
              items: [],
              unavailable: true,
            })),
            read({ kind: "references" }).catch(() => ({
              employees: [],
              unavailable: true,
            })),
          ]);
          state.groups = groups.items || [];
          state.refs = refs;
          if (groups.unavailable || refs.unavailable) {
            state.partial = true;
            state.error =
              "Состояние сделки получено; справочники сотрудников или групп временно недоступны.";
          }
          if (!state.alive) return;
          state.items = data.items || [];
          state.checkedAt = data.checkedAt;
        } else {
          const [rules, groups, refs] = await Promise.all([
            readRules(),
            read({ kind: "groups" }),
            read({ kind: "references" }),
          ]);
          if (!state.alive) return;
          if (state.draft && !state.draft.dirty) state.draft = null;
          state.rules = rules.items || [];
          state.groups = Array.isArray(groups)
            ? groups
            : groups.items || groups.groups || [];
          state.refs = refs;
          state.checkedAt = new Date().toISOString();
        }
        if (!state.partial && !state.draft?.dirty && !state.pending)
          state.error = "";
      }
    } catch (e) {
      if (!state.alive) return;
      state.error = e.message;
      if (e.status === 401 || e.status === 403) {
        state.bootstrap = null;
        state.items = [];
        state.rules = [];
        state.groups = [];
      }
    }
    state.reading = false;
    if (state.alive) {
      if (!state.draft?.dirty || state.error) render();
      schedule();
    }
  }
  function schedule() {
    clearTimeout(state.timer);
    if (state.alive && !doc.hidden) state.timer = setTimeout(refresh, 15000);
  }
  function applySaved(envelope, data) {
    if (envelope.kind === "rules") {
      state.newRule = false;
      state.createDraft = null;
    }
    if (!state.draft) return;
    if (envelope.kind === "rule") {
      state.draft.rule = { ...state.draft.rule, ...data };
      state.draft.ruleDirty = false;
    } else if (envelope.kind === "group") {
      state.draft.group = { ...state.draft.group, ...data };
      state.draft.groupDirty = false;
    }
    state.draft.dirty = !!(state.draft.ruleDirty || state.draft.groupDirty);
    if (!state.draft.dirty) state.draft = null;
  }
  async function mutate(envelope) {
    if (state.busy || state.pending) return;
    state.busy = true;
    state.error = "";
    let succeeded = false;
    const requestId = crypto.randomUUID();
    if (envelope.kind === "action") envelope.payload.requestId = requestId;
    state.pending = { ...envelope, write: true, requestId };
    render();
    try {
      const { unknown: _unknown, ...request } = state.pending;
      const result = await state.client.runtime(request);
      if (!state.alive) return;
      if (result.status === 202) {
        state.error =
          "Результат действия уточняется. Обновите состояние перед новым действием.";
        state.pending.unknown = true;
      } else {
        succeeded = true;
        state.pending = null;
        if (state.draft) {
          if (envelope.kind === "rule") {
            state.draft.rule = { ...state.draft.rule, ...result.data };
            state.draft.ruleDirty = false;
          } else if (envelope.kind === "group") {
            state.draft.group = { ...state.draft.group, ...result.data };
            state.draft.groupDirty = false;
          }
          state.draft.dirty = !!(
            state.draft.ruleDirty || state.draft.groupDirty
          );
          if (!state.draft.dirty) state.draft = null;
        }
      }
    } catch (e) {
      if (!state.alive) return;
      state.error = e.message;
      if (e.unknown) state.pending.unknown = true;
      else state.pending = null;
    }
    state.busy = false;
    render();
    if (!state.pending) await refresh();
    return succeeded;
  }
  function render() {
    const controls = [...root.querySelectorAll("button,input,select,a")];
    const active = shadow.activeElement;
    const index = controls.indexOf(active);
    const start = active?.selectionStart,
      end = active?.selectionEnd;
    renderBody();
    if (index >= 0) {
      const next = root.querySelectorAll("button,input,select,a")[index];
      if (next && next.tagName === active.tagName) {
        next.focus({ preventScroll: true });
        if (start != null && next.setSelectionRange)
          try {
            next.setSelectionRange(start, end);
          } catch {
            /* checkbox */
          }
      }
    }
  }
  function renderBody() {
    root.setAttribute("aria-busy", String(!!(state.reading || state.busy)));
    root.replaceChildren();
    const top = node("div", null, { class: "top" });
    top.append(
      node("h2", "Распределение сделок"),
      button("Обновить", refresh, state.busy),
    );
    root.append(top);
    if (state.error) {
      root.append(node("p", state.error, { class: "error", role: "alert" }));
      if (state.draft)
        root.append(
          button(
            "Обновить версии, сохранив черновик",
            async () => {
              try {
                const [rules, groups] = await Promise.all([
                  readRules(),
                  read({ kind: "groups" }),
                ]);
                if (!state.alive) return;
                const rule = rules.items?.find((r) => r.id === state.selection),
                  group = groups.items?.find(
                    (g) => g.id === state.draft.group?.id,
                  );
                if (rule) state.draft.rule.revision = rule.revision;
                if (group) state.draft.group.revision = group.revision;
                state.error =
                  "Версии обновлены. Проверьте черновик: сохранение применит ваши значения поверх текущих.";
                render();
              } catch (e) {
                state.error = e.message;
                render();
              }
            },
            state.busy,
          ),
        );
    }
    if (state.pending?.unknown) {
      root.append(
        node(
          "p",
          "Запрос отправлен. Автоматического повтора нет; проверьте результат или обратитесь к администратору.",
          { class: "notice" },
        ),
      );
      root.append(
        button(
          "Проверить тот же запрос",
          async () => {
            if (state.busy) return;
            state.busy = true;
            try {
              const { unknown: _unknown, ...request } = state.pending;
              const result = await state.client.runtime(request);
              if (!state.alive) return;
              if (result.status !== 202) {
                applySaved(request, result.data);
                state.pending = null;
                state.error = "";
              }
            } catch (e) {
              if (state.alive) state.error = e.message;
            }
            state.busy = false;
            if (state.alive) {
              render();
              refresh();
            }
          },
          state.busy,
        ),
      );
    }
    if (!state.bootstrap) {
      root.append(
        node("p", "Проверяем авторизацию и подключение…", { role: "status" }),
      );
      return;
    }
    root.append(
      node(
        "p",
        `Аккаунт ${state.bootstrap.accountId || "—"} · пользователь ${state.bootstrap.userId || "—"}`,
        { class: "muted" },
      ),
    );
    if (!(
      state.bootstrap.state === "active" || state.bootstrap.state === "ready"
    )) {
      root.append(
        node(
          "p",
          {
            not_connected: "Свяжите аккаунт с TeamOS",
            unbound: "Свяжите аккаунт с TeamOS",
            ambiguous:
              "Найдено несколько подключений. Нужна проверка администратора",
            reauth_required: "Восстановите авторизацию amoCRM",
            disabled: "Модуль отключён",
          }[state.bootstrap.state] || "Подключение не готово",
          { class: "notice" },
        ),
      );
      const l = link("Открыть подключение", state.bootstrap.teamOSUrl);
      if (l) root.append(l);
      return;
    }
    if (state.mode === "card") renderCard();
    else renderSettings();
    root.append(
      node(
        "small",
        state.checkedAt
          ? `Данные обновлены ${new Date(state.checkedAt).toLocaleTimeString("ru")}`
          : "Ожидаем данные",
      ),
    );
  }
  function renderCard() {
    if (!state.items?.length) {
      root.append(
        node("p", "Для этой сделки нет записей распределения", {
          class: "empty",
        }),
      );
      return;
    }
    for (const item of state.items) {
      const c = node("article", null, { class: "card" });
      c.append(
        node("h3", text(item.state)),
        node("p", text(item.reason)),
        node(
          "p",
          `Группа: ${state.groups.find((g) => g.id === item.groupId)?.name || "Группа недоступна"}`,
        ),
        node(
          "p",
          `Текущий сотрудник: ${state.refs.employees?.find((e) => e.id === item.currentEmployeeId)?.name || "Неизвестно"}`,
        ),
        node(
          "p",
          `Планируемый сотрудник: ${state.refs.employees?.find((e) => e.id === item.plannedEmployeeId)?.name || (item.plannedEmployeeId ? "Имя недоступно" : "Не выбран")}`,
        ),
      );
      if (item.nextAttemptAt)
        c.append(
          node(
            "p",
            `Следующая проверка: ${new Date(item.nextAttemptAt).toLocaleString("ru")}`,
          ),
        );
      const actions = node("div", null, { class: "actions" });
      const titles = {
        check: "Проверить результат",
        recalculate: "Пересчитать",
        retry: "Повторить после исправления",
        cancel: "Отменить",
      };
      for (const action of item.actions || [])
        actions.append(
          button(
            titles[action] || action,
            () =>
              mutate({
                kind: "action",
                id: item.id,
                leadId: state.leadId,
                payload: {
                  action,
                  requestId: crypto.randomUUID(),
                  expectedUpdatedAt: item.updatedAt,
                },
              }),
            state.busy || !!state.pending,
          ),
        );
      async function history(offset = 0) {
        const existing = state.histories.get(item.id);
        if (existing?.loading) return;
        state.histories.set(item.id, { ...existing, loading: true });
        render();
        try {
          const h = await read({
            kind: "history",
            id: item.id,
            leadId: state.leadId,
            limit: 20,
            offset,
          });
          if (!state.alive) return;
          state.histories.set(item.id, {
            items: h.items || [],
            offset,
            hasMore: h.hasMore ?? h.items?.length === 20,
            loading: false,
          });
          render();
        } catch (e) {
          if (!state.alive) return;
          state.histories.set(item.id, {
            ...existing,
            error: e.message,
            loading: false,
          });
          render();
        }
      }
      actions.append(
        button(
          "История",
          () => history(0),
          state.histories.get(item.id)?.loading,
        ),
      );
      const h = state.histories.get(item.id);
      if (h) {
        if (h.error)
          c.append(node("p", h.error, { class: "error", role: "alert" }));
        if (h.loading)
          c.append(node("p", "Загрузка истории…", { role: "status" }));
        const list = node("ol", null, { class: "history" });
        for (const row of h.items || [])
          list.append(
            node(
              "li",
              `${new Date(row.createdAt).toLocaleString("ru")} · ${text(row.state)} · ${text(row.reason)}`,
            ),
          );
        c.append(list);
        if (!h.items?.length && !h.loading)
          c.append(node("p", "История пуста"));
        c.append(
          button(
            "Предыдущие события",
            () => history(Math.max(0, h.offset - 20)),
            !h.offset || h.loading,
          ),
          button(
            "Следующие события",
            () => history(h.offset + 20),
            !h.hasMore || h.loading,
          ),
        );
      }
      const l = link("Открыть в TeamOS", state.bootstrap.teamOSUrl);
      if (l) actions.append(l);
      c.append(actions);
      root.append(c);
    }
  }
  function renderSettings() {
    const grid = node("div", null, { class: "grid" }),
      left = node("nav", null, {
        class: "groups",
        "aria-label": "Группы распределения",
      }),
      right = node("div");
    grid.append(left, right);
    root.append(grid);
    for (const rule of state.rules) {
      const group = state.groups.find((g) => g.id === rule.groupId);
      left.append(
        button(
          `${group?.name || "Группа"} · ${rule.active ? "работает" : "пауза"}`,
          () => {
            if (state.draft?.dirty && state.selection !== rule.id) {
              state.error =
                "Сохраните изменения текущей группы перед переключением";
              render();
              return;
            }
            state.selection = rule.id;
            state.draft = null;
            render();
          },
          state.busy || !!state.pending,
        ),
      );
      left.lastElementChild.setAttribute(
        "aria-pressed",
        String(rule.id === (state.selection || state.rules[0]?.id)),
      );
    }
    if (!state.rules.length || state.newRule) {
      right.append(node("h3", "Новое правило"));
      const eligibleGroups = state.groups.filter(
        (g) => !state.rules.some((r) => r.groupId === g.id),
      );
      if (!eligibleGroups.length) {
        right.append(
          node("p", "Создайте группу сотрудников в TeamOS.", {
            class: "empty",
          }),
        );
        const l = link("Открыть TeamOS", state.bootstrap.teamOSUrl);
        if (l) right.append(l);
        return;
      }
      if (!state.createDraft)
        state.createDraft = {
          groupId: eligibleGroups[0].id,
          pipelineId: state.refs.pipelines?.[0]?.id || "",
          statusId: "",
          active: false,
          keepCurrentResponsible: true,
        };
      const d = state.createDraft;
      function select(label, items, key) {
        const l = node("label", label),
          e = node("select");
        e.setAttribute("aria-label", label);
        e.append(node("option", "Выберите", { value: "" }));
        for (const i of items)
          e.append(node("option", i.name, { value: i.id }));
        e.value = d[key];
        e.disabled =
          !state.bootstrap.canManage || state.busy || !!state.pending;
        e.addEventListener("change", () => {
          d[key] = e.value;
          if (key === "pipelineId") {
            d.statusId = "";
          }
          render();
        });
        l.append(e);
        right.append(l);
      }
      select("Группа", eligibleGroups, "groupId");
      select("Воронка", state.refs.pipelines || [], "pipelineId");
      select(
        "Этап",
        state.refs.pipelines?.find((p) => p.id === d.pipelineId)?.statuses ||
          [],
        "statusId",
      );
      field(
        right,
        "Оставлять сделку у доступного текущего ответственного",
        d.keepCurrentResponsible,
        (v) => (d.keepCurrentResponsible = v),
        "checkbox",
      ).disabled = !state.bootstrap.canManage || state.busy || !!state.pending;
      right.append(
        button(
          "Создать правило на паузе",
          async () => {
            const saved = await mutate({ kind: "rules", payload: { ...d } });
            if (saved) {
              state.newRule = false;
              state.createDraft = null;
              render();
            }
          },
          !state.bootstrap.canManage ||
            state.busy ||
            !!state.pending ||
            !d.statusId ||
            state.busy ||
            !!state.pending,
          true,
        ),
      );
      if (state.rules.length)
        right.append(
          button("Назад", () => {
            state.newRule = false;
            state.createDraft = null;
            render();
          }),
        );
      return;
    }
    left.append(
      button(
        "Новое правило",
        () => {
          if (state.draft?.dirty) {
            state.error = "Сохраните или сбросьте черновик";
            render();
            return;
          }
          state.newRule = true;
          render();
        },
        !state.bootstrap.canManage || state.busy || !!state.pending,
      ),
    );
    const rule =
      state.rules.find((r) => r.id === state.selection) || state.rules[0];
    state.selection = rule.id;
    const group = state.groups.find((g) => g.id === rule.groupId);
    if (!state.draft)
      state.draft = {
        rule: { ...rule },
        group: group ? structuredClone(group) : null,
        dirty: false,
        ruleDirty: false,
        groupDirty: false,
      };
    const draft = state.draft;
    right.append(node("h3", group?.name || "Настройки группы"));
    const pipelineLabel = node("label", "Воронка"),
      pipeline = node("select");
    pipeline.setAttribute("aria-label", "Воронка");
    for (const p of state.refs.pipelines || []) {
      const option = node("option", p.name, { value: p.id });
      pipeline.append(option);
    }
    pipeline.value = draft.rule.pipelineId;
    pipeline.disabled =
      !state.bootstrap.canManage || state.busy || !!state.pending;
    pipeline.addEventListener("change", () => {
      draft.rule.pipelineId = pipeline.value;
      draft.rule.statusId = "";
      draft.dirty = true;
      draft.ruleDirty = true;
      render();
    });
    pipelineLabel.append(pipeline);
    right.append(pipelineLabel);
    const statusLabel = node("label", "Этап"),
      status = node("select");
    status.setAttribute("aria-label", "Этап");
    status.append(node("option", "Выберите этап", { value: "" }));
    for (const s of state.refs.pipelines?.find(
      (p) => p.id === draft.rule.pipelineId,
    )?.statuses || [])
      status.append(node("option", s.name, { value: s.id }));
    status.value = draft.rule.statusId;
    status.disabled =
      !state.bootstrap.canManage || state.busy || !!state.pending;
    status.addEventListener("change", () => {
      draft.rule.statusId = status.value;
      draft.dirty = true;
      draft.ruleDirty = true;
      render();
    });
    statusLabel.append(status);
    right.append(statusLabel);
    for (const [key, title] of [
      ["active", "Распределение включено"],
      [
        "keepCurrentResponsible",
        "Оставлять сделку у доступного текущего ответственного",
      ],
    ]) {
      const input = field(
        right,
        title,
        draft.rule[key],
        (v) => {
          draft.rule[key] = v;
          draft.dirty = true;
          draft.ruleDirty = true;
        },
        "checkbox",
      );
      input.disabled =
        !state.bootstrap.canManage || state.busy || !!state.pending;
    }
    if (group) {
      right.append(node("h3", "Сотрудники — порядок назначения"));
      const members = draft.group.memberIds || [];
      members.forEach((member, index) => {
        const row = node("div", null, { class: "member" });
        row.append(
          node(
            "span",
            state.refs.employees?.find((e) => e.id === member)?.name ||
              "Сотрудник без доступного имени",
          ),
        );
        row.append(
          button(
            "↑",
            () => {
              [members[index - 1], members[index]] = [
                members[index],
                members[index - 1],
              ];
              draft.dirty = true;
              draft.groupDirty = true;
              render();
            },
            !state.bootstrap.canManage ||
              state.busy ||
              !!state.pending ||
              index === 0,
          ),
          button(
            "↓",
            () => {
              [members[index + 1], members[index]] = [
                members[index],
                members[index + 1],
              ];
              draft.dirty = true;
              draft.groupDirty = true;
              render();
            },
            !state.bootstrap.canManage ||
              state.busy ||
              !!state.pending ||
              index === members.length - 1,
          ),
          button(
            "Убрать",
            () => {
              members.splice(index, 1);
              draft.group.disabledMemberIds = (
                draft.group.disabledMemberIds || []
              ).filter((id) => id !== member);
              draft.groupDirty = true;
              draft.dirty = true;
              render();
            },
            !state.bootstrap.canManage ||
              state.busy ||
              !!state.pending ||
              members.length === 1,
          ),
        );
        const employeeName =
          state.refs.employees?.find((e) => e.id === member)?.name ||
          "сотрудника";
        const rowButtons = row.querySelectorAll("button");
        if (rowButtons[0])
          rowButtons[0].setAttribute("aria-label", `Поднять ${employeeName}`);
        if (rowButtons[1])
          rowButtons[1].setAttribute("aria-label", `Опустить ${employeeName}`);
        if (rowButtons[2])
          rowButtons[2].setAttribute("aria-label", `Убрать ${employeeName}`);
        const available = field(
          row,
          "Участвует",
          !(draft.group.disabledMemberIds || []).includes(member),
          (value) => {
            draft.group.disabledMemberIds = (
              draft.group.disabledMemberIds || []
            ).filter((id) => id !== member);
            if (!value) draft.group.disabledMemberIds.push(member);
            draft.dirty = true;
            draft.groupDirty = true;
          },
          "checkbox",
        );
        available.disabled =
          !state.bootstrap.canManage || state.busy || !!state.pending;
        available.setAttribute("aria-label", `Участвует ${employeeName}`);
        right.append(row);
      });
      const addLabel = node("label", "Добавить сотрудника"),
        addSelect = node("select");
      addSelect.setAttribute("aria-label", "Добавить сотрудника");
      addSelect.append(node("option", "Выберите сотрудника", { value: "" }));
      for (const e of state.refs.employees || [])
        if (!members.includes(e.id))
          addSelect.append(node("option", e.name, { value: e.id }));
      addSelect.disabled =
        !state.bootstrap.canManage || state.busy || !!state.pending;
      addSelect.addEventListener("change", () => {
        if (addSelect.value) {
          members.push(addSelect.value);
          draft.groupDirty = true;
          draft.dirty = true;
          render();
        }
      });
      addLabel.append(addSelect);
      right.append(addLabel);
      const groupActions = node("div", null, { class: "actions" });
      groupActions.append(
        button(
          "Сохранить участников",
          () =>
            mutate({
              kind: "group",
              id: group.id,
              payload: {
                expectedRevision: draft.group.revision,
                name: draft.group.name,
                memberIds: draft.group.memberIds,
                disabledMemberIds: draft.group.disabledMemberIds || [],
                active: draft.group.active,
                algorithm: "round_robin",
              },
            }),
          !state.bootstrap.canManage || state.busy || !!state.pending,
        ),
      );
      right.append(groupActions);
    }
    const actions = node("div", null, { class: "actions" });
    actions.append(
      button(
        "Сохранить правило",
        () =>
          mutate({
            kind: "rule",
            id: rule.id,
            payload: {
              expectedRevision: draft.rule.revision,
              pipelineId: draft.rule.pipelineId,
              statusId: draft.rule.statusId,
              active: draft.rule.active,
              keepCurrentResponsible: draft.rule.keepCurrentResponsible,
            },
          }),
        !state.bootstrap.canManage ||
          state.busy ||
          !!state.pending ||
          !draft.rule.statusId,
        true,
      ),
    );
    actions.append(
      button(
        "Сбросить черновик",
        () => {
          state.draft = null;
          state.error = "";
          render();
        },
        state.busy,
      ),
    );
    const l = link("Графики и сотрудники в TeamOS", state.bootstrap.teamOSUrl);
    if (l) actions.append(l);
    right.append(actions);
    if (!state.bootstrap.canManage)
      right.append(
        node(
          "p",
          "У вас есть доступ к просмотру. Изменения доступны администратору.",
          { class: "notice" },
        ),
      );
  }
  state.visibility = () => {
    if (doc.hidden) clearTimeout(state.timer);
    else refresh();
  };
  doc.addEventListener("visibilitychange", state.visibility);
  render();
  refresh();
  return state;
}
