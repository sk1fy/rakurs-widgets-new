<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from "vue";
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
const otherName = ref(
  state.value.active?.kind === "other" ? state.value.active.title : ""
);
const selectedDialog = ref(
  state.value.active?.kind === "imbox"
    ? state.value.active.id
    : state.value.dialogs[0]?.id ?? null
);
const selectedTask = computed(() =>
  state.value.tasks.find((task) => task.id === state.value.selectedTaskId)
);
const dialog = computed(() =>
  state.value.dialogs.find((item) => item.id === selectedDialog.value)
);
const pending = computed(() =>
  state.value.tasks.filter((task) => !task.completed)
);
const scenarioNames = {
  tasks: "Мои задачи",
  other: "Другая активность",
  imbox: "Imbox",
};
const taskTypes = { call: "Звонок", meeting: "Встреча", email: "Письмо" };
const recentHistory = computed(() => [...state.value.history].reverse());
const scenarioIcons = { tasks: "tasks", other: "activity", imbox: "message" };
const activeTask = computed(
  () =>
    state.value.active?.kind === "tasks" || state.value.active?.kind === "task"
);
const canStart = computed(
  () =>
    !state.value.active &&
    (state.value.scenario === "tasks"
      ? selectedTask.value && !selectedTask.value.completed
      : state.value.scenario === "other"
      ? otherName.value.trim().length >= 3
      : Boolean(dialog.value))
);
const contextTitle = computed(() =>
  state.value.scenario === "tasks"
    ? selectedTask.value?.title || "Все задачи завершены"
    : dialog.value?.name || "Выберите диалог"
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
async function toggle(name, event) {
  if (open.value === name) return close();
  lastTrigger = event?.currentTarget;
  open.value = name;
  await nextTick();
  popover.value?.querySelector("button, input")?.focus();
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
function selectTask(id) {
  props.controller.selectTask(id);
  close();
}
function selectImbox(id) {
  if (state.value.active?.kind === "imbox" && state.value.active.id !== id)
    props.controller.stop();
  selectedDialog.value = id;
  close();
}
function start() {
  if (state.value.scenario === "tasks") props.controller.startTask();
  else if (state.value.scenario === "other")
    props.controller.startOther(otherName.value.trim());
  else props.controller.startImbox(selectedDialog.value);
}
function complete() {
  props.controller.completeTask(
    activeTask.value ? state.value.active.id : state.value.selectedTaskId
  );
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
        <span class="rkrs-demo">ДЕМО</span>
      </div>
      <WidgetSettings :controller="controller" :snapshot="state" />
    </template>
    <template v-else>
      <div class="rkrs-toolbar">
        <div class="rkrs-identity">
          <span class="rkrs-brand">R<span class="rkrs-brand-dot">.</span></span
          ><span class="rkrs-demo">ДЕМО</span>
        </div>
        <button
          type="button"
          class="rkrs-scenario"
          :aria-expanded="open === 'scenario'"
          aria-haspopup="true"
          @click="toggle('scenario', $event)"
        >
          <span class="rkrs-label">Сценарий работы</span
          ><span class="rkrs-scenario-value"
            >{{ scenarioNames[state.scenario]
            }}<WidgetIcon name="chevron" :size="15"
          /></span>
        </button>
        <div class="rkrs-context">
          <template v-if="state.scenario === 'other'">
            <label class="rkrs-label" for="rkrs-other-name"
              >Чем вы занимаетесь?</label
            >
            <input
              id="rkrs-other-name"
              v-model="otherName"
              :readonly="state.active?.kind === 'other'"
              class="rkrs-activity-input"
              placeholder="Например, подготовка презентации"
              maxlength="160"
              @keydown.enter="canStart && start()"
            />
            <span class="rkrs-input-help">Минимум 3 символа</span>
          </template>
          <template v-else>
            <div class="rkrs-context-meta">
              <span
                :class="{
                  'rkrs-overdue':
                    state.scenario === 'tasks' && selectedTask?.overdue,
                }"
                >{{
                  state.scenario === "tasks"
                    ? selectedTask?.dueLabel || "На сегодня"
                    : dialog?.channel || "Входящие сообщения"
                }}</span
              ><span class="rkrs-context-entity">{{
                state.scenario === "tasks"
                  ? selectedTask?.entityName
                  : dialog?.preview
              }}</span>
            </div>
            <button
              type="button"
              class="rkrs-task-title"
              :aria-expanded="
                open === (state.scenario === 'tasks' ? 'queue' : 'imbox')
              "
              @click="
                toggle(state.scenario === 'tasks' ? 'queue' : 'imbox', $event)
              "
            >
              <span>{{ contextTitle }}</span>
            </button>
          </template>
        </div>
        <button
          v-if="state.scenario !== 'other'"
          type="button"
          class="rkrs-queue-trigger"
          :aria-label="
            state.scenario === 'tasks'
              ? 'Открыть очередь задач'
              : 'Выбрать диалог Imbox'
          "
          :aria-expanded="
            open === (state.scenario === 'tasks' ? 'queue' : 'imbox')
          "
          @click="
            toggle(state.scenario === 'tasks' ? 'queue' : 'imbox', $event)
          "
        >
          <WidgetIcon :name="scenarioIcons[state.scenario]" /><span>{{
            state.scenario === "tasks" ? pending.length : state.dialogs.length
          }}</span
          ><WidgetIcon name="chevron" :size="13" />
        </button>
        <div
          class="rkrs-timer"
          :class="{ 'rkrs-timer-running': state.active }"
          :title="
            state.active ? `Сейчас: ${state.active.title}` : 'Таймер остановлен'
          "
        >
          <span class="rkrs-timer-status"
            ><i class="rkrs-status-dot"></i
            >{{ state.active ? "Идёт учёт" : "Остановлен" }}</span
          ><span
            class="rkrs-time"
            role="timer"
            aria-label="Время текущей активности"
            >{{ duration(state.elapsedSeconds) }}</span
          >
        </div>
        <div class="rkrs-actions">
          <button
            v-if="state.active"
            type="button"
            class="rkrs-button rkrs-stop"
            @click="controller.stop()"
          >
            <WidgetIcon name="stop" :size="14" />Стоп
          </button>
          <button
            v-else
            type="button"
            class="rkrs-button rkrs-start"
            :disabled="!canStart"
            @click="start"
          >
            <WidgetIcon name="play" :size="14" />Старт
          </button>
          <button
            v-if="state.scenario === 'tasks' || activeTask"
            type="button"
            class="rkrs-button rkrs-complete"
            :disabled="
              !activeTask &&
              (Boolean(state.active) || !selectedTask || selectedTask.completed)
            "
            @click="complete"
          >
            <WidgetIcon name="check" :size="15" /><span>Завершить</span>
          </button>
        </div>
        <div class="rkrs-utilities">
          <button
            type="button"
            class="rkrs-icon-button"
            aria-label="История активности"
            title="История активности"
            :aria-expanded="open === 'history'"
            @click="toggle('history', $event)"
          >
            <WidgetIcon name="history" /><span
              v-if="state.history.length"
              class="rkrs-notification"
            ></span>
          </button>
          <button
            type="button"
            class="rkrs-icon-button"
            aria-label="Настройки виджета"
            title="Настройки виджета"
            :aria-expanded="open === 'settings'"
            @click="toggle('settings', $event)"
          >
            <WidgetIcon name="settings" />
          </button>
        </div>
      </div>
      <p v-if="state.error" class="rkrs-error" role="alert">
        {{ state.error }}
      </p>
      <div
        v-if="
          state.active &&
          ((state.scenario === 'tasks' && !activeTask) ||
            (state.scenario !== 'tasks' &&
              state.active.kind !== state.scenario))
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
            imbox: 'Диалоги Imbox',
            history: 'История активности',
            settings: 'Настройки виджета',
          }[open]
        "
      >
        <div class="rkrs-popover-heading">
          <h2>
            {{
              {
                scenario: "Сценарий работы",
                queue: "Мои задачи",
                imbox: "Диалоги Imbox",
                history: "История активности",
                settings: "Настройки",
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
        <template v-if="open === 'scenario'">
          <button
            v-for="(name, kind) in scenarioNames"
            :key="kind"
            type="button"
            class="rkrs-scenario-option"
            :class="{ 'rkrs-selected': state.scenario === kind }"
            :aria-pressed="state.scenario === kind"
            @click="selectScenario(kind)"
          >
            <WidgetIcon :name="scenarioIcons[kind]" /><span>{{ name }}</span
            ><WidgetIcon
              v-if="state.scenario === kind"
              name="check"
              :size="15"
            />
          </button>
        </template>
        <template v-else-if="open === 'queue'">
          <p class="rkrs-popover-caption">
            {{ pending.length }} в очереди ·
            {{ state.completedCount }} завершено
          </p>
          <div class="rkrs-scroll-list">
            <button
              v-for="task in state.tasks"
              :key="task.id"
              type="button"
              class="rkrs-list-item"
              :class="{
                'rkrs-selected': task.id === state.selectedTaskId,
                'rkrs-task-done': task.completed,
              }"
              :aria-pressed="task.id === state.selectedTaskId"
              :disabled="task.completed"
              @click="selectTask(task.id)"
            >
              <span class="rkrs-list-icon"
                ><WidgetIcon :name="task.completed ? 'check' : 'tasks'" /></span
              ><span class="rkrs-item-copy"
                ><strong>{{ task.title }}</strong
                ><small>{{ task.entityName }}</small
                ><span
                  class="rkrs-item-meta"
                  :class="{ 'rkrs-overdue': task.overdue && !task.completed }"
                  >{{ task.completed ? "Завершено" : task.dueLabel
                  }}<span>{{ taskTypes[task.type] || task.type }}</span></span
                ></span
              ><WidgetIcon
                v-if="task.id === state.selectedTaskId"
                name="check"
                :size="15"
              />
            </button>
          </div>
          <p class="rkrs-popover-footer">
            Выберите задачу, затем нажмите «Старт» на панели.
          </p>
        </template>
        <template v-else-if="open === 'imbox'">
          <p class="rkrs-popover-caption">Выберите диалог для учёта времени</p>
          <div class="rkrs-scroll-list">
            <button
              v-for="item in state.dialogs"
              :key="item.id"
              type="button"
              class="rkrs-list-item"
              :class="{ 'rkrs-selected': selectedDialog === item.id }"
              :aria-pressed="selectedDialog === item.id"
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
              >Учтено за сессию<strong>{{
                duration(state.totalSeconds)
              }}</strong></span
            ><span
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
                  :name="scenarioIcons[entry.kind] || 'tasks'"
                  :size="16" /></span
              ><span class="rkrs-item-copy"
                ><strong>{{ entry.title }}</strong
                ><small
                  >{{ finishedTime(entry.finishedAt) }} ·
                  {{ scenarioNames[entry.kind] || "Мои задачи" }}</small
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
