<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from "vue";
import TaskQueueRow from "./TaskQueueRow.vue";
import WidgetIcon from "./WidgetIcon.vue";
import WidgetSettings from "./WidgetSettings.vue";

const props = defineProps({
  controller: { type: Object, required: true },
  settingsOnly: { type: Boolean, default: false },
});
const state = shallowRef(props.controller.getSnapshot());
const panel = ref(null);
const popover = ref(null);
const open = ref(null);
const queueTab = ref("timed");
const completionTask = ref(null);
const taskResult = ref("");
const resultTooLong = computed(() => new TextEncoder().encode(taskResult.value).length > 2000);
const otherName = ref(
  state.value.active?.kind === "other" ? state.value.active.title : ""
);
const selectedDialog = ref(
  state.value.active?.kind === "imbox"
    ? state.value.active.id
    : state.value.dialogs[0]?.id ?? null
);
const dialog = computed(() =>
  state.value.dialogs.find((item) => item.id === selectedDialog.value)
);
const pending = computed(() =>
  state.value.tasks.filter((task) => !task.completed)
);
const scenarioNames = {
  tasks: "Мои задачи",
  other: "Другое",
  imbox: "Imbox",
};
const taskTypes = { call: "Звонок", meeting: "Встреча", email: "Письмо" };
const allDay = "Весь день";
const queueLimit = 5;
const recentHistory = computed(() => [...state.value.history].reverse());
const scenarioIcons = { tasks: "tasks", other: "activity", imbox: "message" };
const historyNames = { ...scenarioNames, pause: "Пауза" };
const historyIcons = { ...scenarioIcons, pause: "clock" };
// A pause is an open interval, but any start replaces it on the server.
const paused = computed(() => state.value.active?.kind === "pause");
const running = computed(() => Boolean(state.value.active) && !paused.value);
// amoCRM starts Imbox by itself when a dialog opens, whatever the scenario is.
const view = computed(() =>
  state.value.active?.kind === "imbox" ? "imbox" : state.value.scenario
);
const imboxRunning = computed(() => state.value.active?.kind === "imbox");
const activeTask = computed(
  () =>
    state.value.active?.kind === "tasks" || state.value.active?.kind === "task"
);
// The running task owns the panel: its title, «Стоп» and «Завершить» all refer to it.
const activeTaskView = computed(() => {
  if (!activeTask.value) return null;
  const { id, title, entityName, url } = state.value.active;
  return state.value.tasks.find((task) => task.id === id) || { id, title, entityName, url };
});
const queue = computed(() =>
  pending.value.filter((task) => task.id !== activeTaskView.value?.id)
);
const timedTasks = computed(() => queue.value.filter((task) => task.dueTime !== allDay));
const upcoming = computed(
  () => queue.value.find((task) => task.id === state.value.selectedTaskId) || queue.value[0] || null
);
const focusTask = computed(() => activeTaskView.value || upcoming.value);
const queueList = computed(() => (queueTab.value === "timed" ? timedTasks.value : queue.value));
const relatedTasks = computed(() => pending.value.filter((task) => task.related));
const relatedGroups = computed(() => {
  const groups = new Map();
  for (const task of relatedTasks.value)
    groups.set(task.related, [...(groups.get(task.related) || []), task]);
  return [...groups];
});
const completionTarget = computed(() =>
  activeTask.value ? activeTaskView.value : !running.value ? upcoming.value : null
);
const available = computed(() => state.value.enabled !== false && state.value.ready !== false);
const canMutate = computed(() =>
  !state.value.busy && available.value && !state.value.pending && !state.value.completion
);
const canStop = computed(() => running.value && !state.value.busy && !state.value.pending);
const canComplete = computed(() => canMutate.value && Boolean(completionTarget.value));
// Polling makes the panel busy for a moment: a button only looks switched off
// when it has nothing to do, otherwise it would blink on every refresh.
const startReady = computed(
  () =>
    available.value && !running.value &&
    (view.value === "other" ? otherName.value.trim().length >= 3 : Boolean(dialog.value))
);
const canStart = computed(() => canMutate.value && startReady.value);
// Outside the task scenario the action only leaves a running activity for the queue.
const smartReady = computed(() =>
  activeTask.value ? Boolean(activeTaskView.value.url)
    : available.value && Boolean(upcoming.value) && (view.value === "tasks" || running.value)
);
const canSmart = computed(() => smartReady.value && (activeTask.value || canMutate.value));
const smartTitle = computed(() =>
  activeTask.value ? "Перейти к активной задаче"
    : !upcoming.value ? "Нет задач для выполнения"
    : view.value !== "tasks" && !running.value ? "Задачи запускаются в сценарии «Мои задачи»"
    : running.value ? "Завершить активность и начать следующую задачу"
    : "Начать следующую задачу"
);
const statusText = computed(() =>
  activeTask.value ? "В работе"
    : paused.value ? `Пауза · ${duration(state.value.elapsedSeconds)}`
    : running.value ? "Идёт учёт"
    : "Следующая задача"
);
const emptyText = computed(() =>
  state.value.live && !state.value.ready ? "Загрузка..." : "Нет задач в очереди"
);
const imboxTitle = computed(() =>
  dialog.value?.name || (imboxRunning.value ? state.value.active.title : "Выберите диалог")
);
const timerCaption = computed(() =>
  paused.value ? "время на паузе" : view.value === "imbox" ? "время в imbox" : "время в задаче"
);
let unsubscribe;
let eventRoot;
let eventDocument;
let lastTrigger;

function duration(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
function finishedTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function typeName(task) {
  return taskTypes[task?.type] || task?.type || "";
}
function taskTitle(task) {
  return task.entityName ? `${task.title} — ${task.entityName}` : task.title;
}
async function show(name) {
  open.value = name;
  await nextTick();
  popover.value?.querySelector("button, input")?.focus();
}
async function toggle(name, event) {
  if (open.value === name) return close();
  lastTrigger = event?.currentTarget;
  await show(name);
}
function toggleQueue(event) {
  if (open.value !== "queue" && !timedTasks.value.length) queueTab.value = "queue";
  return toggle("queue", event);
}
function close(restore = true) {
  open.value = null;
  if (restore) lastTrigger?.focus();
}
function keydown(event) {
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}
function outside(event) {
  if (!open.value) return;
  const path = event.composedPath();
  if (!path.includes(popover.value) && !path.includes(lastTrigger))
    close(false);
}
function selectScenario(kind) {
  props.controller.selectScenario(kind);
  close();
}
// A task row opens its card when the card is known; the play button starts it.
function openTask(task) {
  close(false);
  if (task.url) window.location.href = task.url;
  else props.controller.selectTask(task.id);
}
// The selection changes only after the server confirmed the previous dialog's
// stop; on failure the list stays open with the error and can be retried.
async function selectImbox(id) {
  if (state.value.busy) return;
  if (state.value.active?.kind === "imbox" && state.value.active.id !== id) {
    const stopped = await props.controller.stop();
    if (stopped !== true) return;
  }
  selectedDialog.value = id;
  close();
}
// Work on a queued task happens in its card, so a confirmed start opens it.
async function startQueued(task) {
  if (!canMutate.value) return;
  close(false);
  if (state.value.scenario !== "tasks") props.controller.selectScenario("tasks");
  const started = await props.controller.startTask(task.id);
  if (started === true && task.url && window.location.pathname !== task.url)
    window.location.href = task.url;
}
function smartAction() {
  if (activeTask.value) window.location.href = activeTaskView.value.url;
  else startQueued(upcoming.value);
}
function start() {
  if (view.value === "other") props.controller.startOther(otherName.value.trim());
  else props.controller.startImbox(selectedDialog.value);
}
function menuPause() {
  close();
  if (paused.value) props.controller.stop();
  else props.controller.pause();
}
async function openCompletion() {
  if (!canComplete.value) return;
  const { id, title, entityName } = completionTarget.value;
  completionTask.value = { id, title, entityName };
  taskResult.value = "";
  await show("complete");
  popover.value?.querySelector("textarea")?.focus();
}
async function complete() {
  if (!canComplete.value || resultTooLong.value || (state.value.live && !taskResult.value.trim())) return;
  const result = await props.controller.completeTask(completionTask.value.id, taskResult.value.trim());
  if (result !== false) close();
}
async function recover() {
  const completing = Boolean(state.value.completion);
  const result = await props.controller.refresh();
  if (result !== false && completing && !state.value.completion && !state.value.pending && open.value === "complete") close();
}
onMounted(() => {
  unsubscribe = props.controller.subscribe((snapshot) => {
    state.value = snapshot || props.controller.getSnapshot();
    if (state.value.active?.kind === "imbox")
      selectedDialog.value = state.value.active.id;
    if (state.value.active?.kind === "other")
      otherName.value = state.value.active.title;
  });
  // composedPath preserves shadow boundaries; document sees clicks in the surrounding CRM too.
  eventRoot = panel.value.getRootNode();
  eventDocument = panel.value.ownerDocument;
  eventDocument.addEventListener("pointerdown", outside);
  eventRoot.addEventListener("keydown", keydown);
});
onBeforeUnmount(() => {
  unsubscribe?.();
  eventDocument?.removeEventListener("pointerdown", outside);
  eventRoot?.removeEventListener("keydown", keydown);
});
</script>

<template>
  <section
    ref="panel"
    class="rkrs-widget"
    :class="{
      'rkrs-compact': state.settings.compact,
      'rkrs-settings-only': settingsOnly,
    }"
    aria-label="Rakurs — контроль активности"
  >
    <template v-if="settingsOnly">
      <div class="rkrs-settings-heading">
        <span class="rkrs-brand">Rakurs</span>
        <h2>Настройки панели активности</h2>
        <span v-if="!state.live" class="rkrs-demo">ДЕМО</span>
      </div>
      <p v-if="state.live && state.error" class="rkrs-error" role="alert">{{ state.error }}</p>
      <WidgetSettings :controller="controller" :snapshot="state" />
    </template>
    <template v-else>
      <div class="rkrs-toolbar">
        <button
          type="button"
          class="rkrs-scenario"
          :aria-expanded="open === 'scenario'"
          aria-haspopup="true"
          @click="toggle('scenario', $event)"
        >
          <span class="rkrs-scenario-label"
            >Сценарий работы<span v-if="!state.live" class="rkrs-demo">ДЕМО</span></span
          ><span class="rkrs-scenario-current"
            >{{ scenarioNames[view] }}<WidgetIcon name="chevron" :size="16"
          /></span>
        </button>
        <div v-if="view === 'tasks'" class="rkrs-center">
          <div class="rkrs-summary">
            <div class="rkrs-summary-top">
              <template v-if="focusTask || state.active">
                <button
                  type="button"
                  class="rkrs-summary-stop"
                  :class="{ 'rkrs-running': running }"
                  :disabled="!canStop"
                  @click="controller.stop()"
                >
                  <WidgetIcon name="stop" :size="12" />Стоп
                </button>
                <span
                  class="rkrs-summary-status"
                  :title="running ? `Время в работе: ${duration(state.elapsedSeconds)}` : undefined"
                  >{{ statusText }}</span
                >
              </template>
              <span v-else class="rkrs-center-empty">{{ emptyText }}</span>
              <span class="rkrs-summary-right">
                <button
                  v-if="state.relatedEnabled || relatedTasks.length"
                  type="button"
                  class="rkrs-related-trigger"
                  :aria-expanded="open === 'related'"
                  @click="toggle('related', $event)"
                >
                  <WidgetIcon name="link" :size="13" /><span>Связанные</span
                  ><span v-if="relatedTasks.length" class="rkrs-related-count">{{ relatedTasks.length }}</span>
                </button>
                <span v-if="focusTask?.dueDate" class="rkrs-summary-date">{{ focusTask.dueDate }}</span
                ><span v-if="focusTask?.dueTime" class="rkrs-summary-time">{{ focusTask.dueTime }}</span>
              </span>
            </div>
            <div v-if="focusTask" class="rkrs-summary-bottom">
              <span v-if="typeName(focusTask)" class="rkrs-task-type-badge">{{ typeName(focusTask) }}</span>
              <button
                type="button"
                class="rkrs-task-title"
                :title="taskTitle(focusTask)"
                :aria-expanded="open === 'queue'"
                @click="toggleQueue($event)"
              >
                <span>{{ focusTask.title }}</span>
              </button>
              <button
                type="button"
                class="rkrs-queue-trigger"
                aria-label="Открыть очередь задач"
                :aria-expanded="open === 'queue'"
                @click="toggleQueue($event)"
              >
                <WidgetIcon name="chevron" :size="17" />
              </button>
            </div>
          </div>
        </div>
        <div v-else-if="view === 'other'" class="rkrs-center rkrs-other-zone">
          <input
            v-model="otherName"
            :readonly="state.active?.kind === 'other'"
            class="rkrs-other-input"
            aria-label="Чем вы занимаетесь?"
            title="Минимум 3 символа"
            placeholder="Напишите, что делаете..."
            maxlength="160"
            @keydown.enter="canStart && start()"
          />
        </div>
        <div v-else class="rkrs-center rkrs-imbox-zone">
          <div class="rkrs-imbox-label">IMBOX</div>
          <button
            type="button"
            class="rkrs-task-title rkrs-imbox-title"
            :title="imboxTitle"
            :aria-expanded="open === 'imbox'"
            @click="toggle('imbox', $event)"
          >
            <span>{{ imboxTitle }}</span>
          </button>
        </div>
        <div class="rkrs-actions">
          <button
            type="button"
            class="rkrs-more-trigger"
            aria-label="Ещё"
            title="Ещё"
            :aria-expanded="open === 'more'"
            @click="toggle('more', $event)"
          >
            <WidgetIcon name="more" />
          </button>
          <template v-if="view !== 'tasks'">
            <button
              v-if="imboxRunning"
              type="button"
              class="rkrs-btn rkrs-btn-stopred"
              title="Остановить Imbox-активность"
              :disabled="!canStop"
              @click="controller.stop()"
            >
              <WidgetIcon name="stop" />
            </button>
            <div v-else class="rkrs-play-group">
              <button
                type="button"
                class="rkrs-btn rkrs-btn-play"
                :class="{ 'rkrs-off': !startReady }"
                title="Начать активность"
                :disabled="!canStart"
                @click="start"
              >
                <WidgetIcon name="play" />
              </button>
              <button
                type="button"
                class="rkrs-btn rkrs-btn-stopred"
                :class="{ 'rkrs-off': !running }"
                title="Остановить активность"
                :disabled="!canStop"
                @click="controller.stop()"
              >
                <WidgetIcon name="stop" />
              </button>
            </div>
            <div class="rkrs-timer-block">
              <span class="rkrs-timer-caption">{{ timerCaption }}</span
              ><span class="rkrs-timer-value" role="timer" aria-label="Время текущей активности">{{ duration(state.elapsedSeconds) }}</span>
            </div>
          </template>
          <button
            type="button"
            class="rkrs-smart-action"
            :class="{ 'rkrs-start': !activeTask, 'rkrs-off': !smartReady }"
            :aria-label="smartTitle"
            :title="smartTitle"
            :disabled="!canSmart"
            @click="smartAction"
          >
            <WidgetIcon :name="activeTask ? 'goto' : 'play'" :size="24" />
          </button>
        </div>
      </div>
      <p v-if="state.error || (!state.busy && (state.pending || state.completion))" class="rkrs-error" role="alert">
        {{ state.error || "Нужно восстановить предыдущую операцию." }}
        <button v-if="state.live" type="button" class="rkrs-button" :disabled="state.busy" @click="recover">
          {{ state.pending || state.completion ? "Восстановить операцию" : "Обновить данные" }}
        </button>
      </p>
      <div
        v-if="
          running &&
          ((view === 'tasks' && !activeTask) ||
            (view !== 'tasks' && state.active.kind !== view))
        "
        class="rkrs-active-note"
      >
        Сейчас учитывается: {{ state.active.title }}
      </div>
      <div
        v-if="open"
        ref="popover"
        class="rkrs-popover"
        :class="`rkrs-popover-${open}`"
        role="region"
        :aria-label="
          {
            scenario: 'Сценарии работы',
            queue: 'Очередь задач',
            related: 'Связанные задачи',
            imbox: 'Диалоги Imbox',
            more: 'Дополнительные действия',
            history: 'История активности',
            settings: 'Настройки виджета',
            complete: 'Завершение задачи',
          }[open]
        "
      >
        <div v-if="!['scenario', 'queue', 'more'].includes(open)" class="rkrs-popover-heading">
          <h2>
            {{
              {
                related: "Связанные задачи",
                imbox: "Диалоги Imbox",
                history: "История активности",
                settings: "Настройки",
                complete: "Завершение задачи",
              }[open]
            }}
          </h2>
          <button
            type="button"
            class="rkrs-icon-button"
            aria-label="Закрыть панель"
            @click="close()"
          >
            <WidgetIcon name="close" :size="17" />
          </button>
        </div>
        <form v-if="open === 'complete'" class="rkrs-completion-form" @submit.prevent="complete">
          <p v-if="completionTask" class="rkrs-completion-target">
            <strong>{{ completionTask.title }}</strong>
            <small v-if="completionTask.entityName">{{ completionTask.entityName }}</small>
          </p>
          <label for="rkrs-task-result">Результат выполнения</label>
          <textarea id="rkrs-task-result" v-model="taskResult" rows="3" maxlength="2000" :disabled="state.busy || Boolean(state.completion)" placeholder="Укажите результат задачи" />
          <p v-if="resultTooLong" role="alert">Результат слишком длинный. Сократите текст.</p>
          <p class="rkrs-help">{{ state.live ? "Задача будет завершена в amoCRM, а её таймер остановлен." : "Демозадача будет завершена только в этом браузере." }}</p>
          <p v-if="state.live && !taskResult.trim()" class="rkrs-help">Укажите результат для завершения задачи.</p>
          <button type="submit" class="rkrs-button rkrs-submit" :disabled="!canComplete || resultTooLong || (state.live && !taskResult.trim())">Завершить задачу</button>
        </form>
        <template v-else-if="open === 'scenario'">
          <button
            v-for="(name, kind) in scenarioNames"
            :key="kind"
            type="button"
            class="rkrs-scenario-option"
            :class="{ 'rkrs-selected': view === kind }"
            :aria-pressed="view === kind"
            :disabled="state.live && imboxRunning && kind !== 'imbox'"
            :title="state.live && imboxRunning && kind !== 'imbox' ? 'Сначала остановите Imbox-активность' : undefined"
            @click="selectScenario(kind)"
          >
            {{ name }}
          </button>
        </template>
        <template v-else-if="open === 'more'">
          <button
            v-if="view === 'tasks' || activeTask"
            type="button"
            class="rkrs-menu-item rkrs-complete"
            :disabled="!canComplete"
            @click="openCompletion"
          >
            <WidgetIcon name="check" :size="16" />Завершить задачу
          </button>
          <button
            v-if="state.live"
            type="button"
            class="rkrs-menu-item"
            :disabled="paused ? state.busy || state.pending : !canMutate"
            @click="menuPause"
          >
            <WidgetIcon name="clock" :size="16" />{{ paused ? "Завершить паузу" : "Пауза" }}
          </button>
          <button type="button" class="rkrs-menu-item" @click="show('history')">
            <WidgetIcon name="history" :size="16" />История активности
          </button>
          <button type="button" class="rkrs-menu-item" @click="show('settings')">
            <WidgetIcon name="settings" :size="16" />Настройки
          </button>
        </template>
        <template v-else-if="open === 'queue'">
          <template v-if="timedTasks.length">
            <div class="rkrs-q-header"><WidgetIcon name="list" :size="15" /><span>Следующая задача по времени</span></div>
            <TaskQueueRow :task="timedTasks[0]" :type-name="typeName(timedTasks[0])" :disabled="!canMutate" @open="openTask" @start="startQueued" />
          </template>
          <div class="rkrs-queue-tabs" role="tablist">
            <button type="button" class="rkrs-queue-tab" :class="{ 'rkrs-active': queueTab === 'timed' }" role="tab" :aria-selected="queueTab === 'timed'" @click="queueTab = 'timed'">Задачи по времени</button>
            <button type="button" class="rkrs-queue-tab" :class="{ 'rkrs-active': queueTab === 'queue' }" role="tab" :aria-selected="queueTab === 'queue'" @click="queueTab = 'queue'">Очередь задач</button>
          </div>
          <p v-if="state.queue?.note" class="rkrs-queue-note" :class="{ 'rkrs-queue-warning': state.queue.warning }" role="status">{{ state.queue.note }}</p>
          <div class="rkrs-queue-list">
            <TaskQueueRow
              v-for="task in queueList.slice(0, queueLimit)"
              :key="task.id"
              :task="task"
              :type-name="typeName(task)"
              :disabled="!canMutate"
              @open="openTask"
              @start="startQueued"
            />
            <div v-if="!queueList.length" class="rkrs-queue-empty">Нет задач</div>
          </div>
          <a v-if="queueList.length > queueLimit" href="/todo/list" target="_blank" class="rkrs-queue-more">И еще {{ queueList.length - queueLimit }} задач в очереди</a>
        </template>
        <template v-else-if="open === 'related'">
          <div v-if="!relatedTasks.length" class="rkrs-queue-empty">Связанных задач нет</div>
          <div v-else class="rkrs-queue-list">
            <template v-for="[name, tasks] in relatedGroups" :key="name">
              <div class="rkrs-r-group"><span>{{ name }}</span><small>{{ tasks.length }}</small></div>
              <TaskQueueRow
                v-for="task in tasks"
                :key="task.id"
                :task="task"
                :type-name="typeName(task)"
                :disabled="!canMutate"
                @open="openTask"
                @start="startQueued"
              />
            </template>
          </div>
        </template>
        <template v-else-if="open === 'imbox'">
          <p class="rkrs-popover-caption" role="status">{{ state.busy ? "Останавливаем учёт текущего диалога…" : "Выберите диалог для учёта времени" }}</p>
          <div class="rkrs-scroll-list">
            <button
              v-for="item in state.dialogs"
              :key="item.id"
              type="button"
              class="rkrs-list-item"
              :class="{ 'rkrs-selected': selectedDialog === item.id }"
              :aria-pressed="selectedDialog === item.id"
              :disabled="state.busy"
              @click="selectImbox(item.id)"
            >
              <span class="rkrs-avatar">{{ item.name.charAt(0) }}</span
              ><span class="rkrs-item-copy"
                ><strong>{{ item.name }}</strong
                ><small>{{ item.preview }}</small
                ><span class="rkrs-item-meta">{{ item.channel }}</span></span
              ><WidgetIcon
                v-if="selectedDialog === item.id"
                name="check"
                :size="15"
              />
            </button>
          </div>
        </template>
        <template v-else-if="open === 'history'">
          <div class="rkrs-history-summary">
            <span
              >{{ state.live ? "Учтено сегодня" : "Учтено за сессию" }}<strong>{{
                duration(state.totalSeconds)
              }}</strong></span
            ><span v-if="state.completedCount != null"
              >Завершено задач<strong>{{ state.completedCount }}</strong></span
            >
          </div>
          <div v-if="!state.history.length" class="rkrs-empty">
            <WidgetIcon name="clock" :size="28" /><strong
              >История пока пуста</strong
            >
            <p>Запустите и остановите активность — здесь появится запись.</p>
          </div>
          <ol v-else class="rkrs-history-list rkrs-scroll-list">
            <li v-for="entry in recentHistory" :key="entry.id">
              <span class="rkrs-history-mark"
                ><WidgetIcon
                  :name="historyIcons[entry.kind] || 'tasks'"
                  :size="16" /></span
              ><span class="rkrs-item-copy"
                ><strong>{{ entry.title }}</strong
                ><small
                  >{{ finishedTime(entry.finishedAt) }} ·
                  {{ historyNames[entry.kind] || "Мои задачи" }}</small
                ></span
              ><span class="rkrs-history-duration">{{
                duration(entry.seconds)
              }}</span>
            </li>
          </ol>
        </template>
        <WidgetSettings
          v-else-if="open === 'settings'"
          :controller="controller"
          :snapshot="state"
        />
      </div>
    </template>
  </section>
</template>
