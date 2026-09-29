<script setup>
import { computed, ref, watch } from "vue";
import {
  PhoneMissed,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock3,
  CheckCheck,
  PhoneOutgoing,
  MessageCircle,
  Mail,
  GitBranch,
  Info,
} from "@lucide/vue";
import DayOverview from "./components/DayOverview.vue";
import PeriodOverview from "./components/PeriodOverview.vue";
import ActivityTimeline from "./components/ActivityTimeline.vue";
import AppDialog from "./components/AppDialog.vue";
import ReferenceIcon from "./components/ReferenceIcon.vue";
import { directory, employees, getDemoDay } from "./data/demo";
import {
  DEMO_DATE,
  DEMO_TIME,
  canGoForward,
  periodBounds,
  periodLabel,
  shiftPeriod,
  readPreferences,
} from "./utils/periods";

let saved;
try {
  saved = readPreferences(window.localStorage);
} catch {
  saved = readPreferences({ getItem: () => null });
}
const kind = ref("day");
const anchorDate = ref(DEMO_DATE);
const sidebar = ref(saved.sidebar);
const comparisons = ref(saved.comparisons);
const availableIds = employees.map(({ id }) => id);
const selectedIds = ref(
  saved.selected === null
    ? [...availableIds]
    : saved.selected.filter((id) => availableIds.includes(id))
);
const modal = ref(null);
const activeEmployee = ref(null);
const notice = ref("");
const groups = [...new Set(directory.map((employee) => employee.groupId))].map(
  (id) => ({
    id,
    name: directory.find((employee) => employee.groupId === id).groupName,
    employees: directory.filter((employee) => employee.groupId === id),
  })
);
const dayEmployees = computed(() => getDemoDay(anchorDate.value));
const selectedEmployees = computed(() =>
  (kind.value === "day" ? dayEmployees.value : employees).filter((employee) =>
    selectedIds.value.includes(employee.id)
  )
);
const label = computed(() => periodLabel(kind.value, anchorDate.value));
const previousLabel = computed(() =>
  periodLabel(kind.value, shiftPeriod(kind.value, anchorDate.value, -1))
);
const isCurrent = computed(
  () =>
    periodBounds(kind.value, anchorDate.value).start ===
    periodBounds(kind.value, DEMO_DATE).start
);
const nextEnabled = computed(() => canGoForward(kind.value, anchorDate.value));
const title = computed(() =>
  kind.value === "day"
    ? "Активность по группам"
    : `Статистика отдела · ${kind.value === "week" ? "неделя" : "месяц"}`
);
const metricDefinitions = [
  { key: "calls", label: "Исходящие звонки", icon: PhoneOutgoing },
  { key: "messages", label: "Сообщения", icon: MessageCircle },
  { key: "emails", label: "Письма", icon: Mail },
  { key: "tasks", label: "Выполненные задачи", icon: CheckCheck },
  { key: "deals", label: "Движение сделок", icon: GitBranch },
];
const notificationTitle = computed(
  () =>
    ({
      missed: "Пропущенные звонки",
      noTasks: "Сделки без задач",
      overdue: "Сделки с просроченными задачами",
    }[modal.value])
);
const notifications = computed(() => {
  const key = modal.value === "noTasks" ? "noTasks" : "overdueDeals";
  return employees
    .filter((employee) => employee[key] > 0)
    .map((employee) => ({ ...employee, count: employee[key] }));
});
const selectedDetails = computed(
  () =>
    activeEmployee.value &&
    getDemoDay(anchorDate.value).find(
      (employee) => employee.id === activeEmployee.value.id
    )
);

watch(
  [sidebar, comparisons, selectedIds],
  () => {
    try {
      localStorage.setItem(
        "rkrs_activity_frontend_preferences",
        JSON.stringify({
          sidebar: sidebar.value,
          comparisons: comparisons.value,
          selected: selectedIds.value,
        })
      );
    } catch {
      /* Private browsing may disable storage; UI still works. */
    }
  },
  { deep: true }
);

function groupSelected(group) {
  return group.employees.filter((employee) =>
    selectedIds.value.includes(employee.id)
  ).length;
}
function toggleGroup(group, checked) {
  const ids = group.employees
    .filter((employee) => employee.hasData)
    .map((employee) => employee.id);
  selectedIds.value = checked
    ? [...new Set([...selectedIds.value, ...ids])]
    : selectedIds.value.filter((id) => !ids.includes(id));
}
function switchKind(value) {
  kind.value = value;
  notice.value = "";
}
function navigateTabs(event) {
  const tabs = ["day", "week", "month"];
  const index = tabs.indexOf(kind.value);
  const target =
    event.key === "Home"
      ? 0
      : event.key === "End"
      ? 2
      : event.key === "ArrowRight"
      ? (index + 1) % 3
      : event.key === "ArrowLeft"
      ? (index + 2) % 3
      : null;
  if (target === null) return;
  event.preventDefault();
  switchKind(tabs[target]);
  event.currentTarget.querySelector(`#tab-${tabs[target]}`)?.focus();
}
function sidebarRating(employee) {
  if (!employee.hasData) return "нет данных";
  if (kind.value !== "day") return "";
  const rating = dayEmployees.value.find(
    (value) => value.id === employee.id
  )?.rating;
  return Number.isFinite(rating) ? `${Math.round(rating)}%` : "—";
}
function navigate(direction) {
  if (direction > 0 && !nextEnabled.value) return;
  const date = shiftPeriod(kind.value, anchorDate.value, direction);
  anchorDate.value = date > DEMO_DATE ? DEMO_DATE : date;
}
function changeDate(event) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))
    anchorDate.value =
      event.target.value > DEMO_DATE ? DEMO_DATE : event.target.value;
}
function openDay({ employeeId, date }) {
  kind.value = "day";
  anchorDate.value = date;
  if (employeeId && !selectedIds.value.includes(employeeId))
    selectedIds.value = [...selectedIds.value, employeeId];
  notice.value = employeeId
    ? `Дневной просмотр: ${
        employees.find((employee) => employee.id === employeeId)?.name ||
        "сотрудник"
      }`
    : "";
}
function openEmployee(employee) {
  activeEmployee.value = employee;
  modal.value = "employee";
}
function openNotificationEmployee(employee) {
  anchorDate.value = DEMO_DATE;
  kind.value = "day";
  openEmployee(employee);
}
function displayTime(offset) {
  const minutes = Math.round(540 + offset);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
}
const typeLabels = {
  crm: "Активность в amoCRM",
  call: "Звонок",
  idle: "Нет активности",
  future: "Ещё не наступило",
};
</script>

<template>
  <a class="skip-link" href="#dashboard-content">Перейти к активности</a>
  <header class="app-header">
    <div class="brand">
      <span class="wordmark">Rakurs</span><span class="brand-divider"></span>
      <h1>Контроль активности</h1>
      <span class="demo-tag">Демо</span>
    </div>
    <div class="header-actions">
      <button
        class="header-indicator red"
        aria-label="Пропущенные звонки"
        title="Пропущенные звонки"
        @click="modal = 'missed'"
      >
        <ReferenceIcon name="phone" />
      </button>
      <button
        class="header-indicator"
        aria-label="Сделки без задач"
        title="Сделки без задач"
        @click="modal = 'noTasks'"
      >
        <ReferenceIcon name="dollar" /><i class="indicator-dot warning"></i>
      </button>
      <button
        class="header-indicator"
        aria-label="Сделки с просроченными задачами"
        title="Сделки с просроченными задачами"
        @click="modal = 'overdue'"
      >
        <ReferenceIcon name="dollar" /><i class="indicator-dot danger"></i>
      </button>
      <button
        class="settings-button"
        aria-label="Настройки"
        @click="modal = 'settings'"
      >
        <ReferenceIcon name="settings" :size="18" /><span>Настройки</span>
      </button>
    </div>
  </header>

  <main class="app-main">
    <div class="section-toolbar">
      <h2>{{ title }}</h2>
      <div class="period-controls">
        <div
          class="segmented period-tabs"
          role="tablist"
          aria-label="Период активности"
          @keydown="navigateTabs"
        >
          <button
            v-for="tab in [
              { key: 'day', text: 'День' },
              { key: 'week', text: 'Неделя' },
              { key: 'month', text: 'Месяц' },
            ]"
            :id="`tab-${tab.key}`"
            :key="tab.key"
            role="tab"
            :aria-selected="kind === tab.key"
            :tabindex="kind === tab.key ? 0 : -1"
            aria-controls="dashboard-content"
            :class="{ active: kind === tab.key }"
            @click="switchKind(tab.key)"
          >
            {{ tab.text }}
          </button>
        </div>
        <div class="date-navigation">
          <button
            class="icon-button"
            aria-label="Предыдущий период"
            @click="navigate(-1)"
          >
            <ChevronLeft :size="22" />
          </button>
          <label class="date-label" title="Выбрать дату">
            <span>{{ label }}</span
            ><small>{{
              isCurrent
                ? kind === "day"
                  ? `сегодня · ${DEMO_TIME}`
                  : "текущий период"
                : "прошедший период"
            }}</small>
            <input
              type="date"
              aria-label="Выбрать дату"
              :value="anchorDate"
              :max="DEMO_DATE"
              @change="changeDate"
            />
          </label>
          <button
            class="icon-button"
            aria-label="Следующий период"
            :disabled="!nextEnabled"
            @click="navigate(1)"
          >
            <ChevronRight :size="22" />
          </button>
        </div>
        <div v-if="comparisons" class="comparison-label">
          <span>сравнение:</span><strong>{{ previousLabel }}</strong
          ><small v-if="isCurrent && kind === 'day'">до {{ DEMO_TIME }}</small>
        </div>
      </div>
    </div>

    <div class="dashboard-layout" :class="{ 'without-sidebar': !sidebar }">
      <aside
        v-show="sidebar"
        id="employee-filter"
        class="employee-sidebar"
        aria-label="Выбор сотрудников"
      >
        <div class="sidebar-heading">
          <h3>
            Сотрудники
            <small>{{ selectedIds.length }} из {{ directory.length }}</small>
          </h3>
          <button
            class="icon-button small-button"
            aria-label="Скрыть панель сотрудников"
            aria-expanded="true"
            aria-controls="employee-filter"
            @click="sidebar = false"
          >
            <ChevronLeft :size="16" />
          </button>
        </div>
        <section v-for="group in groups" :key="group.id" class="sidebar-group">
          <label class="group-checkbox"
            ><input
              type="checkbox"
              :aria-label="group.name"
              :checked="
                groupSelected(group) > 0 &&
                groupSelected(group) ===
                  group.employees.filter((e) => e.hasData).length
              "
              :indeterminate="
                groupSelected(group) > 0 &&
                groupSelected(group) <
                  group.employees.filter((e) => e.hasData).length
              "
              :disabled="!group.employees.some((e) => e.hasData)"
              @change="toggleGroup(group, $event.target.checked)"
            /><span>{{ group.name }}</span
            ><small
              >{{ groupSelected(group) }}/{{ group.employees.length }}</small
            ></label
          >
          <label
            v-for="employee in group.employees"
            :key="employee.id"
            class="employee-checkbox"
            :class="{ unavailable: !employee.hasData }"
          >
            <input
              v-model="selectedIds"
              type="checkbox"
              :value="employee.id"
              :disabled="!employee.hasData"
              :aria-label="employee.name"
            />
            <span class="avatar small-avatar" :data-tone="employee.tone">{{
              employee.name[0]
            }}</span
            ><span class="employee-name">{{ employee.name }}</span>
            <small>{{ sidebarRating(employee) }}</small>
          </label>
        </section>
        <div class="sidebar-actions">
          <button
            class="button subtle"
            @click="selectedIds = [...availableIds]"
          >
            Все</button
          ><button class="button subtle" @click="selectedIds = []">
            Никого
          </button>
        </div>
        <p class="sidebar-hint">
          Выбор сотрудников сохраняется при переключении дня, недели и месяца.
        </p>
      </aside>
      <button
        v-if="!sidebar"
        class="employees-tab"
        aria-label="Показать панель сотрудников"
        aria-expanded="false"
        aria-controls="employee-filter"
        :title="`Сотрудники: выбрано ${selectedIds.length}`"
        @click="sidebar = true"
      >
        <span>Сотрудники</span>
      </button>

      <section
        id="dashboard-content"
        class="dashboard-content"
        role="tabpanel"
        :aria-labelledby="`tab-${kind}`"
      >
        <p v-if="notice" class="inline-notice" role="status">
          {{ notice }}
          <button @click="notice = ''" aria-label="Скрыть сообщение">×</button>
        </p>
        <div
          v-if="kind === 'day' && !dayEmployees.length"
          class="surface empty-state no-snapshot"
        >
          <CalendarDays :size="34" />
          <h3>Нет демонстрационных данных за этот день</h3>
          <p>Дневные примеры доступны за 23 и 24 сентября 2026 года.</p>
          <button class="button primary" @click="anchorDate = DEMO_DATE">
            Открыть 24 сентября
          </button>
        </div>
        <DayOverview
          v-else-if="kind === 'day'"
          :employees="selectedEmployees"
          :date="anchorDate"
          :is-demo="true"
          :loading="false"
          :show-comparisons="comparisons"
          @select-employee="openEmployee"
        />
        <PeriodOverview
          v-else
          :kind="kind"
          :label="label"
          :anchor-date="anchorDate"
          :employees="selectedEmployees"
          @open-day="openDay"
        />
      </section>
    </div>
    <footer class="demo-footer">
      <Info :size="13" /><span
        >Демонстрационные данные. Точка отсчёта — 24 сентября 2026,
        {{ DEMO_TIME }}. Аккаунт amoCRM не подключён.</span
      >
    </footer>
  </main>

  <AppDialog
    v-if="modal === 'settings'"
    title="Настройки отображения"
    @close="modal = null"
  >
    <p class="dialog-intro muted">Параметры сохраняются в этом браузере.</p>
    <label class="setting-row"
      ><div>
        <strong>Панель сотрудников</strong
        ><small>Показывать выбор сотрудников слева</small>
      </div>
      <input
        v-model="sidebar"
        type="checkbox"
        role="switch"
        aria-label="Панель сотрудников"
    /></label>
    <label class="setting-row"
      ><div>
        <strong>Сравнение периодов</strong
        ><small>Показывать предыдущие значения в дневных карточках</small>
      </div>
      <input
        v-model="comparisons"
        type="checkbox"
        role="switch"
        aria-label="Сравнение периодов"
    /></label>
    <div class="settings-info">
      <Clock3 :size="17" /><span
        >Рабочий интервал демо: <strong>09:00–21:00</strong></span
      >
    </div>
    <p class="muted small-text">
      Настройки рабочего времени и подключения аккаунта пока недоступны в
      деморежиме.
    </p>
    <button class="button primary dialog-done" @click="modal = null">
      Готово
    </button>
  </AppDialog>

  <AppDialog
    v-if="modal === 'employee' && selectedDetails"
    :title="selectedDetails.name"
    wide
    @close="modal = null"
  >
    <div class="employee-detail-heading">
      <span class="avatar" :data-tone="selectedDetails.tone">{{
        selectedDetails.name[0]
      }}</span>
      <div>
        <strong>{{ selectedDetails.groupName }}</strong>
        <p class="muted small-text">
          {{ periodLabel("day", anchorDate) }} · демоданные
        </p>
      </div>
      <span class="detail-rating"
        >{{ selectedDetails.rating }}<small>% активности</small></span
      >
    </div>
    <div class="detail-metrics">
      <div
        v-for="metric in metricDefinitions"
        :key="metric.key"
        class="detail-metric"
      >
        <component :is="metric.icon" :size="18" /><span>{{ metric.label }}</span
        ><strong>{{ selectedDetails.metrics[metric.key][0] }}</strong>
      </div>
    </div>
    <div class="detail-timeline">
      <h3>Активность в течение дня</h3>
      <ActivityTimeline :segments="selectedDetails.timeline" />
    </div>
    <h3 class="activity-list-title">Фрагменты активности</h3>
    <p class="muted small-text">Пример детализации временной шкалы.</p>
    <ul class="activity-list">
      <li
        v-for="(segment, index) in selectedDetails.timeline
          .filter((s) => ['crm', 'call'].includes(s.type))
          .slice(0, 6)"
        :key="index"
      >
        <i :style="{ background: `var(--${segment.type})` }"></i
        ><time
          >{{ displayTime(segment.start) }}–{{
            displayTime(segment.start + segment.duration)
          }}</time
        ><span>{{ typeLabels[segment.type] }}</span
        ><small>{{ Math.round(segment.duration) }} мин</small>
      </li>
    </ul>
  </AppDialog>

  <AppDialog
    v-if="['missed', 'noTasks', 'overdue'].includes(modal)"
    :title="notificationTitle"
    @close="modal = null"
  >
    <div v-if="modal === 'missed'" class="empty-state">
      <PhoneMissed :size="32" />
      <h3>Детализация пока недоступна</h3>
      <p>История пропущенных звонков появится после подключения аккаунта.</p>
    </div>
    <template v-else
      ><p class="muted dialog-intro">Демонстрационный список по сотрудникам.</p>
      <button
        v-for="employee in notifications"
        :key="employee.id"
        class="notification-row"
        @click="openNotificationEmployee(employee)"
      >
        <span class="avatar small-avatar" :data-tone="employee.tone">{{
          employee.name[0]
        }}</span
        ><span>{{ employee.name }}</span
        ><strong>{{ employee.count }}</strong
        ><ChevronRight :size="16" /></button
    ></template>
  </AppDialog>
</template>
