import { demoTasks, demoDialogs } from "./demo-data.js";

const SCENARIOS = new Set(["tasks", "other", "imbox"]);
const MAX_SECONDS = 24 * 60 * 60;
const MAX_HISTORY = 100;
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const safeText = (value, limit = 160) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const secondsBetween = (start, end) =>
  Math.min(MAX_SECONDS, Math.max(0, Math.floor((end - start) / 1000)));

/** Local-only prototype state. No intervals, network calls, or DOM dependencies. */
export function createActivityController({
  storage,
  storageKey = "rkrs:activity:prototype:v1",
  now = Date.now,
  tasks = demoTasks,
  dialogs = demoDialogs,
} = {}) {
  const listeners = new Set();
  let disposed = false;
  let sequence = 0;
  const timestamp = () => {
    const value = now();
    return Number.isFinite(value) && value >= 0 ? value : Date.now();
  };
  const uniqueItems = (items, mapper) => {
    const ids = new Set();
    return (Array.isArray(items) ? items : [])
      .slice(0, 1000)
      .flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = safeText(item.id, 80);
        if (!id || ids.has(id)) return [];
        ids.add(id);
        return [mapper(item, id)];
      });
  };
  const initialTasks = uniqueItems(tasks, (item, id) => ({
    id,
    title: safeText(item.title) || "Задача",
    entityName: safeText(item.entityName),
    type: ["call", "meeting", "email"].includes(item.type) ? item.type : "call",
    dueLabel: safeText(item.dueLabel),
    overdue: item.overdue === true,
    completed: item.completed === true,
  }));
  const initialDialogs = uniqueItems(dialogs, (item, id) => ({
    id,
    name: safeText(item.name) || "Контакт",
    preview: safeText(item.preview),
    channel: safeText(item.channel),
  }));
  const freshState = () => ({
    scenario: "tasks",
    tasks: initialTasks.map((item) => ({ ...item })),
    selectedTaskId: initialTasks.find((item) => !item.completed)?.id ?? null,
    active: null,
    history: [],
    settings: { compact: false },
    error: null,
  });
  let state = freshState();

  // Only restore recognized fields. Task/dialog definitions always come from the demo source.
  try {
    const raw = storage?.getItem(storageKey);
    const saved =
      typeof raw === "string" && raw.length < 200000 ? JSON.parse(raw) : null;
    if (isRecord(saved) && saved.version === 1) {
      if (Array.isArray(saved.completedTaskIds)) {
        const completed = new Set(
          saved.completedTaskIds.filter((id) => typeof id === "string")
        );
        state.tasks = state.tasks.map((task) => ({
          ...task,
          completed: task.completed || completed.has(task.id),
        }));
      }
      state.scenario = SCENARIOS.has(saved.scenario) ? saved.scenario : "tasks";
      state.selectedTaskId =
        state.tasks.find(
          (task) => task.id === saved.selectedTaskId && !task.completed
        )?.id ??
        state.tasks.find((task) => !task.completed)?.id ??
        null;
      state.settings.compact =
        isRecord(saved.settings) && saved.settings.compact === true;
      if (Array.isArray(saved.history)) {
        state.history = saved.history.slice(-MAX_HISTORY).flatMap((entry) => {
          if (
            !isRecord(entry) ||
            !SCENARIOS.has(entry.kind) ||
            !safeText(entry.title) ||
            !Number.isFinite(entry.seconds) ||
            entry.seconds < 0 ||
            !Number.isFinite(entry.finishedAt) ||
            entry.finishedAt < 0
          )
            return [];
          return [
            {
              id: safeText(entry.id, 80) || `restored-${sequence++}`,
              kind: entry.kind,
              title: safeText(entry.title),
              seconds: Math.min(MAX_SECONDS, Math.floor(entry.seconds)),
              finishedAt: Math.min(timestamp(), entry.finishedAt),
            },
          ];
        });
      }
      const candidate = saved.active;
      if (
        isRecord(candidate) &&
        SCENARIOS.has(candidate.kind) &&
        Number.isFinite(candidate.startedAt) &&
        candidate.startedAt >= 0
      ) {
        const task = state.tasks.find(
          (item) => item.id === candidate.id && !item.completed
        );
        const dialog = initialDialogs.find((item) => item.id === candidate.id);
        const otherTitle = safeText(candidate.title);
        if (
          (candidate.kind === "tasks" && task) ||
          (candidate.kind === "imbox" && dialog) ||
          (candidate.kind === "other" &&
            otherTitle.length >= 3 &&
            typeof candidate.title === "string" &&
            candidate.title.trim().length <= 160)
        ) {
          state.active = {
            kind: candidate.kind,
            id: candidate.kind === "other" ? "other" : candidate.id,
            title:
              candidate.kind === "tasks"
                ? task.title
                : candidate.kind === "imbox"
                ? dialog.name
                : otherTitle,
            ...(candidate.kind === "tasks"
              ? { entityName: task.entityName }
              : {}),
            startedAt: Math.min(timestamp(), candidate.startedAt),
          };
          state.scenario = candidate.kind;
          if (task && candidate.kind === "tasks")
            state.selectedTaskId = task.id;
        }
      }
    }
  } catch {
    /* A disabled storage or corrupt record must not block the panel. */
  }

  function getSnapshot() {
    const elapsedSeconds = state.active
      ? secondsBetween(state.active.startedAt, timestamp())
      : 0;
    return {
      ...state,
      tasks: state.tasks.map((item) => ({ ...item })),
      dialogs: initialDialogs.map((item) => ({ ...item })),
      active: state.active ? { ...state.active } : null,
      history: state.history.map((item) => ({ ...item })),
      settings: { ...state.settings },
      elapsedSeconds,
      totalSeconds: state.history.reduce(
        (sum, item) => sum + item.seconds,
        elapsedSeconds
      ),
      completedCount: state.tasks.filter((item) => item.completed).length,
    };
  }
  function publish(persist = true) {
    if (persist) {
      try {
        storage?.setItem(
          storageKey,
          JSON.stringify({
            version: 1,
            scenario: state.scenario,
            completedTaskIds: state.tasks
              .filter((task) => task.completed)
              .map((task) => task.id),
            selectedTaskId: state.selectedTaskId,
            active: state.active,
            history: state.history,
            settings: state.settings,
          })
        );
      } catch {
        /* In-memory interactions remain usable when browser storage is unavailable. */
      }
    }
    for (const listener of [...listeners]) listener(getSnapshot());
  }
  function fail(message) {
    if (disposed) return false;
    state.error = message;
    publish(false);
    return false;
  }
  function commit() {
    state.error = null;
    publish();
    return true;
  }
  function stopActive() {
    if (!state.active) return;
    const finishedAt = timestamp();
    state.history.push({
      id: `session-${finishedAt}-${sequence++}`,
      kind: state.active.kind,
      title: state.active.title,
      seconds: secondsBetween(state.active.startedAt, finishedAt),
      finishedAt,
    });
    state.history = state.history.slice(-MAX_HISTORY);
    state.active = null;
  }
  function start(kind, id, title, entityName) {
    if (
      state.active?.kind !== kind ||
      state.active?.id !== id ||
      state.active?.title !== title
    ) {
      stopActive();
      state.active = {
        kind,
        id,
        title,
        ...(entityName === undefined ? {} : { entityName }),
        startedAt: timestamp(),
      };
    }
    state.scenario = kind;
    return commit();
  }
  return {
    getSnapshot,
    subscribe(listener) {
      if (disposed || typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectScenario(kind) {
      if (disposed) return false;
      if (!SCENARIOS.has(kind)) return fail("Неизвестный сценарий.");
      if (state.scenario !== kind) stopActive();
      state.scenario = kind;
      return commit();
    },
    selectTask(id) {
      if (disposed) return false;
      if (!state.tasks.some((task) => task.id === id && !task.completed))
        return fail("Выберите незавершённую задачу.");
      if (state.selectedTaskId !== id || state.scenario !== "tasks")
        stopActive();
      state.selectedTaskId = id;
      state.scenario = "tasks";
      return commit();
    },
    startTask(id = state.selectedTaskId) {
      if (disposed) return false;
      const task = state.tasks.find(
        (item) => item.id === id && !item.completed
      );
      if (!task) return fail("Выберите незавершённую задачу.");
      state.selectedTaskId = id;
      return start("tasks", id, task.title, task.entityName);
    },
    completeTask(id = state.selectedTaskId) {
      if (disposed) return false;
      const index = state.tasks.findIndex(
        (item) => item.id === id && !item.completed
      );
      if (index === -1) return fail("Выберите незавершённую задачу.");
      if (state.active?.kind === "tasks" && state.active.id === id)
        stopActive();
      state.tasks[index].completed = true;
      state.selectedTaskId =
        [...state.tasks.slice(index + 1), ...state.tasks.slice(0, index)].find(
          (item) => !item.completed
        )?.id ?? null;
      return commit();
    },
    startOther(name) {
      if (disposed) return false;
      if (
        typeof name !== "string" ||
        name.trim().length < 3 ||
        name.trim().length > 160
      )
        return fail("Введите название активности: от 3 до 160 символов.");
      return start("other", "other", name.trim());
    },
    startImbox(id) {
      if (disposed) return false;
      const dialog = initialDialogs.find((item) => item.id === id);
      if (!dialog) return fail("Выберите диалог.");
      return start("imbox", id, dialog.name);
    },
    stop() {
      if (disposed) return false;
      stopActive();
      return commit();
    },
    tick() {
      if (disposed) return false;
      publish(false);
      return true;
    },
    updateSettings(patch) {
      if (disposed) return false;
      if (!isRecord(patch) || typeof patch.compact !== "boolean")
        return fail("Некорректные настройки.");
      state.settings.compact = patch.compact;
      return commit();
    },
    reset() {
      if (disposed) return false;
      state = freshState();
      return commit();
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
