<script setup>
import { computed, ref } from "vue";
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  BarChart3,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Mail,
  Maximize2,
  MessageCircle,
  Minimize2,
  PhoneOutgoing,
  Search,
  SquareCheck,
  TrendingUp,
  X,
} from "@lucide/vue";
import ActivityTimeline from "./ActivityTimeline.vue";

const props = defineProps({
  group: { type: Object, required: true },
  showComparisons: { type: Boolean, default: true },
});
const emit = defineEmits(["select-employee"]);

// A keyed component owns its controls; searching or sorting cannot affect another department.
const query = ref("");
const sortBy = ref("rating");
const compact = ref(false);
const collapsed = ref(false);
const metricDefinitions = [
  { key: "calls", label: "Исходящие звонки", icon: PhoneOutgoing },
  { key: "messages", label: "Сообщения", icon: MessageCircle },
  { key: "emails", label: "Письма", icon: Mail },
  { key: "tasks", label: "Выполненные задачи", icon: SquareCheck },
  { key: "deals", label: "Движение сделок по этапам", icon: TrendingUp },
];
const legend = [
  { type: "crm", label: "Активность в amoCRM" },
  { type: "call", label: "Звонок" },
  { type: "idle", label: "Нет активности" },
  { type: "future", label: "Ещё не наступило" },
];
const avatarTones = {
  p: "purple",
  g: "green",
  o: "orange",
  b: "blue",
  t: "teal",
  r: "red",
  y: "yellow",
  purple: "purple",
  green: "green",
  orange: "orange",
  blue: "blue",
  teal: "teal",
  red: "red",
  yellow: "yellow",
};

const visibleEmployees = computed(() => {
  const filter = query.value.trim().toLocaleLowerCase("ru-RU");
  return props.group.employees
    .filter(
      (employee) =>
        !filter ||
        String(employee.name).toLocaleLowerCase("ru-RU").includes(filter)
    )
    .sort((a, b) => {
      if (sortBy.value === "rating") {
        const difference =
          (isNumber(b.rating) ? b.rating : -Infinity) -
          (isNumber(a.rating) ? a.rating : -Infinity);
        if (difference && !Number.isNaN(difference)) return difference;
      }
      return String(a.name).localeCompare(String(b.name), "ru-RU");
    });
});

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function number(value) {
  return isNumber(value) ? value.toLocaleString("ru-RU") : "—";
}
function initials(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}
function minutes(value) {
  if (!isNumber(value)) return "—";
  const rounded = Math.round(value);
  return rounded >= 60
    ? `${Math.floor(rounded / 60)} ч ${rounded % 60} м`
    : `${rounded} м`;
}
function metricValues(employee, key) {
  return employee.metrics?.[key] || [null, null];
}
function direction(employee, key) {
  if (!props.showComparisons) return "";
  const [current, previous] = metricValues(employee, key);
  if (!isNumber(current) || !isNumber(previous) || current === previous)
    return "";
  return current > previous ? "up" : "down";
}
function metricTitle(employee, metric) {
  const [current, previous] = metricValues(employee, metric.key);
  return `${metric.label}: ${number(current)}${
    props.showComparisons ? ` · предыдущий день: ${number(previous)}` : ""
  }`;
}
function ratingClass(value) {
  if (!isNumber(value)) return "";
  return value >= 55
    ? "rating-good"
    : value >= 30
    ? "rating-medium"
    : "rating-low";
}
function rating(value) {
  return isNumber(value)
    ? `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`
    : "—";
}
</script>

<template>
  <section
    class="employee-group"
    :class="{ 'is-collapsed': collapsed, 'is-compact': compact }"
    :aria-label="group.name"
  >
    <button
      type="button"
      class="group-heading"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <span
        >{{ group.name }}
        <span class="group-count"
          >({{ visibleEmployees.length }}/{{ group.employees.length }})</span
        ></span
      >
      <ChevronDown :size="18" aria-hidden="true" />
    </button>
    <div v-show="!collapsed" class="group-content">
      <div class="day-toolbar">
        <div class="activity-legend" aria-label="Обозначения активности">
          <span v-for="item in legend" :key="item.type"
            ><i :class="item.type" aria-hidden="true" />{{ item.label }}</span
          >
        </div>
        <div class="view-controls">
          <label class="employee-search">
            <Search :size="16" aria-hidden="true" />
            <input
              v-model="query"
              type="search"
              :aria-label="`Поиск сотрудников: ${group.name}`"
              placeholder="Начните ввод..."
            />
            <button
              v-if="query"
              type="button"
              class="clear-search"
              :aria-label="`Очистить поиск: ${group.name}`"
              @click="query = ''"
            >
              <X :size="14" aria-hidden="true" />
            </button>
          </label>
          <label class="sort-control" title="Порядок сотрудников в группе">
            <ArrowDownWideNarrow :size="16" aria-hidden="true" />
            <select
              v-model="sortBy"
              :aria-label="`Сортировка сотрудников: ${group.name}`"
            >
              <option value="rating">По рейтингу</option>
              <option value="name">По имени</option>
            </select>
          </label>
          <button
            type="button"
            class="icon-button compact-button"
            :class="{ active: compact }"
            :aria-pressed="compact"
            :aria-label="`${
              compact ? 'Обычный вид карточек' : 'Компактный вид карточек'
            }: ${group.name}`"
            :title="compact ? 'Обычный вид' : 'Компактный вид'"
            @click="compact = !compact"
          >
            <component
              :is="compact ? Maximize2 : Minimize2"
              :size="17"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div
        v-if="!visibleEmployees.length"
        class="empty-state day-empty"
        role="status"
      >
        <Search :size="30" aria-hidden="true" />
        <h3>Сотрудники не найдены</h3>
        <p>В этом отделе нет сотрудников по запросу «{{ query }}».</p>
        <button type="button" class="button" @click="query = ''">
          Сбросить поиск
        </button>
      </div>
      <article
        v-for="employee in visibleEmployees"
        :key="employee.id"
        class="employee-card"
      >
        <div class="employee-row">
          <button
            type="button"
            class="employee-person"
            :title="`Открыть активность: ${employee.name}`"
            @click="emit('select-employee', employee)"
          >
            <span
              class="avatar employee-avatar"
              :class="`tone-${avatarTones[employee.tone] || 'blue'}`"
              aria-hidden="true"
              >{{ initials(employee.name) }}</span
            >
            <span class="employee-name">{{ employee.name }}</span>
          </button>
          <div class="employee-metrics">
            <span
              class="employee-metric duration"
              :title="`Время на звонках: ${minutes(employee.callMinutes)}`"
            >
              <Clock3 :size="16" aria-hidden="true" /><span
                class="metric-value"
                >{{ minutes(employee.callMinutes) }}</span
              >
            </span>
            <span
              v-for="metric in metricDefinitions"
              :key="metric.key"
              class="employee-metric"
              :title="metricTitle(employee, metric)"
              :aria-label="metricTitle(employee, metric)"
            >
              <component :is="metric.icon" :size="16" aria-hidden="true" />
              <span
                class="metric-value"
                :class="direction(employee, metric.key)"
                >{{ number(metricValues(employee, metric.key)[0]) }}</span
              >
              <span v-if="showComparisons" class="metric-previous"
                >/ {{ number(metricValues(employee, metric.key)[1]) }}</span
              >
              <ArrowUp
                v-if="direction(employee, metric.key) === 'up'"
                class="metric-direction up"
                :size="12"
                aria-hidden="true"
              />
              <ArrowDown
                v-else-if="direction(employee, metric.key) === 'down'"
                class="metric-direction down"
                :size="12"
                aria-hidden="true"
              />
            </span>
            <span
              class="employee-metric problem-metric"
              :title="`Сделки без задач: ${number(employee.noTasks)}`"
              :aria-label="`Сделки без задач: ${number(employee.noTasks)}`"
            >
              <span class="problem-icon"
                ><CircleDollarSign :size="16" aria-hidden="true" /><i
                  class="warning-dot" /></span
              ><span class="metric-value">{{ number(employee.noTasks) }}</span>
            </span>
            <span
              class="employee-metric problem-metric"
              :title="`Сделки с просроченными задачами: ${number(
                employee.overdueDeals
              )}`"
              :aria-label="`Сделки с просроченными задачами: ${number(
                employee.overdueDeals
              )}`"
            >
              <span class="problem-icon"
                ><CircleDollarSign :size="16" aria-hidden="true" /><i
                  class="danger-dot" /></span
              ><span class="metric-value">{{
                number(employee.overdueDeals)
              }}</span>
            </span>
            <span
              class="employee-metric problem-metric"
              :title="`Просроченные задачи: ${number(employee.overdueTasks)}`"
              :aria-label="`Просроченные задачи: ${number(
                employee.overdueTasks
              )}`"
            >
              <CalendarClock :size="16" aria-hidden="true" /><span
                class="metric-value"
                >{{ number(employee.overdueTasks) }}</span
              >
            </span>
          </div>
          <div
            class="employee-rating"
            :class="ratingClass(employee.rating)"
            :title="`Рейтинг активности за день: ${rating(employee.rating)}`"
            :aria-label="`Рейтинг активности: ${rating(employee.rating)}`"
          >
            <BarChart3 :size="18" aria-hidden="true" /><span>{{
              rating(employee.rating)
            }}</span>
          </div>
        </div>
        <ActivityTimeline
          :segments="employee.timeline || []"
          :compact="compact"
        />
      </article>
    </div>
  </section>
</template>

<style scoped>
.day-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 6px 0 18px;
}
.activity-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 17px;
  color: var(--muted);
  font-size: 11px;
}
.activity-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.activity-legend i {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  flex: none;
}
.activity-legend .crm {
  background: var(--crm);
}
.activity-legend .call {
  background: var(--call);
}
.activity-legend .idle {
  background: var(--idle);
}
.activity-legend .future {
  background: var(--future);
}
.view-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  min-width: 0;
  margin-left: auto;
}
.employee-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 194px;
  min-width: 120px;
  border-bottom: 1px solid var(--subtle);
  padding: 6px 0;
  color: var(--muted);
}
.employee-search:focus-within {
  border-color: var(--accent);
}
.employee-search input {
  border: none;
  outline: none;
  width: 100%;
  min-width: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
}
.employee-search input::placeholder {
  color: var(--muted);
}
.employee-search input::-webkit-search-cancel-button {
  display: none;
}
.clear-search {
  border: 0;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
}
.sort-control {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
}
.sort-control select {
  font: inherit;
  font-size: 12px;
  background: var(--inset);
  border: none;
  color: var(--muted);
  padding: 4px 0;
  cursor: pointer;
  max-width: 130px;
}
.sort-control select:focus-visible,
.clear-search:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
.compact-button {
  width: 30px;
  height: 30px;
}
.compact-button.active {
  color: var(--accent);
  background: rgba(24, 144, 255, 0.1);
}
.employee-group {
  margin-bottom: 12px;
  border-radius: 8px;
  overflow: hidden;
}
.group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 43px;
  padding: 10px 16px;
  background: var(--group);
  border: none;
  text-align: left;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.group-heading:hover {
  background: var(--card-hi);
}
.group-heading:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
}
.group-heading > svg {
  flex: none;
  color: var(--muted);
  transition: transform 0.18s;
}
.group-count {
  color: var(--muted);
  font-weight: 500;
  margin-left: 4px;
}
.is-collapsed .group-heading > svg {
  transform: rotate(-90deg);
}
.group-content {
  background: var(--inset);
  padding: 12px;
}
.employee-card {
  background: var(--card);
  border: 1px solid transparent;
  padding: 14px 14px 11px;
  border-radius: 7px;
  margin-bottom: 12px;
  transition: border-color 0.15s;
}
.employee-card:last-child {
  margin-bottom: 0;
}
.employee-card:hover {
  border-color: var(--line);
}
.employee-row {
  display: flex;
  align-items: center;
  gap: 17px;
  min-height: 40px;
  margin-bottom: 15px;
}
.employee-person {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 166px;
  min-width: 0;
  flex: none;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.employee-person:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 4px;
}
.employee-person:hover .employee-name {
  color: #7ec6ff;
}
.employee-avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex: none;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.06);
}
.tone-purple {
  background: linear-gradient(135deg, #7c5cbf, #4d3a86);
}
.tone-green {
  background: linear-gradient(135deg, #2f8f6a, #1f5e47);
}
.tone-orange {
  background: linear-gradient(135deg, #c27a3a, #8a4d1e);
}
.tone-blue {
  background: linear-gradient(135deg, #3b6b9e, #264566);
}
.tone-teal {
  background: linear-gradient(135deg, #2c8a99, #1b5761);
}
.tone-red {
  background: linear-gradient(135deg, #b4475c, #7a2e3e);
}
.tone-yellow {
  background: linear-gradient(135deg, #a58a2a, #6d5a18);
}
.employee-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.employee-metrics {
  display: flex;
  align-items: center;
  flex: 1;
  flex-wrap: wrap;
  gap: 10px 18px;
  min-width: 0;
}
.employee-metric {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.employee-metric > svg {
  flex: none;
}
.metric-value {
  color: var(--text);
  font-weight: 600;
}
.metric-previous {
  font-size: 11px;
  color: var(--muted);
}
.metric-direction {
  margin-left: -4px;
}
.up {
  color: var(--crm);
}
.down {
  color: var(--idle);
}
.problem-icon {
  display: inline-flex;
  position: relative;
}
.problem-icon i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  position: absolute;
  right: -2px;
  bottom: 0;
  box-shadow: 0 0 0 2px var(--card);
}
.warning-dot {
  background: #e1a01e;
}
.danger-dot {
  background: var(--idle);
}
.employee-rating {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex: none;
  min-width: 70px;
  margin-left: auto;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.employee-rating svg {
  color: var(--muted);
}
.rating-good {
  color: var(--crm);
}
.rating-medium {
  color: #e1a01e;
}
.rating-low {
  color: #ff7777;
}
.comparison-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--subtle);
  margin: 13px 2px 0;
  font-size: 11px;
  line-height: 1.5;
}
.day-empty {
  min-height: 300px;
  background: var(--inset);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 45px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.day-empty > svg {
  color: var(--subtle);
}
.day-empty h3 {
  margin: 0;
  font-weight: 600;
  font-size: 17px;
}
.day-empty p {
  max-width: 340px;
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.day-empty button {
  margin-top: 5px;
}
.is-compact .employee-card {
  padding: 10px 12px 6px;
  margin-bottom: 8px;
}
.is-compact .employee-row {
  min-height: 28px;
  margin-bottom: 10px;
}
.is-compact .employee-avatar {
  width: 28px;
  height: 28px;
  font-size: 10px;
}
.is-compact .employee-name {
  font-size: 12px;
}
.is-compact .employee-metrics {
  gap: 7px 15px;
}
.is-compact .employee-rating {
  font-size: 14px;
}
@media (max-width: 1250px) {
  .employee-row {
    gap: 13px;
    flex-wrap: wrap;
  }
  .employee-person {
    flex: 1;
    width: auto;
  }
  .employee-metrics {
    order: 3;
    flex-basis: 100%;
    gap: 10px 20px;
  }
  .employee-name {
    max-width: 220px;
  }
}
@media (max-width: 700px) {
  .day-toolbar {
    gap: 14px;
  }
  .view-controls {
    margin-left: 0;
    width: 100%;
    gap: 10px;
  }
  .employee-search {
    flex: 1;
    width: auto;
  }
  .activity-legend {
    font-size: 10px;
    gap: 8px 12px;
  }
  .group-content {
    padding: 8px;
  }
  .group-heading {
    padding-inline: 12px;
  }
  .employee-card {
    padding: 12px 10px 8px;
  }
  .employee-metrics {
    gap: 9px 14px;
  }
  .employee-metric {
    font-size: 11px;
    gap: 5px;
  }
  .employee-metric > svg,
  .problem-icon svg {
    width: 14px;
    height: 14px;
  }
  .employee-name {
    max-width: 190px;
  }
  .comparison-note {
    font-size: 10px;
  }
}
@media (max-width: 390px) {
  .employee-name {
    max-width: 140px;
  }
  .sort-control select {
    max-width: 101px;
    font-size: 11px;
  }
  .employee-search {
    min-width: 95px;
  }
  .employee-search input {
    font-size: 11px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .employee-card,
  .group-heading > svg {
    transition: none;
  }
}
</style>
