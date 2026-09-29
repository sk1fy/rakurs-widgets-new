<script setup>
import { computed, ref, watch } from "vue";
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  CheckCheck,
  ChevronDown,
  Clock3,
  FlaskConical,
  Mail,
  Pause,
  PhoneOutgoing,
  Users,
} from "@lucide/vue";
import PeriodChart from "./PeriodChart.vue";
import PeriodComparison from "./PeriodComparison.vue";
import {
  periodEmployees,
  emptyPeriodEmployee,
  periodSummaries,
} from "../data/periodFixtures";
import { DEMO_DATE } from "../utils/periods";

const props = defineProps({
  kind: {
    type: String,
    default: "week",
    validator: (value) => ["week", "month"].includes(value),
  },
  label: { type: String, default: "" },
  anchorDate: { type: String, default: "2026-09-24" },
  employees: { type: Array, default: () => [] },
});
const emit = defineEmits(["open-day"]);
const mode = ref("level");
const expandedIds = ref([]);
const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const modes = [
  { id: "level", label: "Уровень" },
  { id: "calls", label: "Звонки" },
  { id: "delta", label: "Δ к прошлому периоду" },
];
const icons = {
  phone: PhoneOutgoing,
  tasks: CheckCheck,
  deals: ArrowRightLeft,
  activity: Activity,
  mail: Mail,
  clock: Clock3,
  pause: Pause,
};
const summary = computed(() => periodSummaries[props.kind]);
const rows = computed(() =>
  props.employees.map((employee) => ({
    employee,
    fixture: periodEmployees[employee.id] || emptyPeriodEmployee,
  }))
);

// Calendar navigation is UI state only. No activity totals are computed here.
const days = computed(() => {
  const anchor = new Date(`${props.anchorDate}T12:00:00`);
  if (Number.isNaN(anchor.getTime())) return [];
  const start = new Date(anchor);
  let count = 7;
  if (props.kind === "week")
    start.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  else {
    start.setDate(1);
    count = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  }
  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const weekday = (date.getDay() + 6) % 7;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${date.getFullYear()}-${month}-${day}`;
    return {
      date: dateString,
      label: `${weekdays[weekday]}, ${day}.${month}`,
      weekday,
      weekend: weekday > 4,
      future: dateString > DEMO_DATE,
    };
  });
});

watch(
  () => [props.kind, props.anchorDate],
  () => {
    expandedIds.value = props.employees
      .slice(0, 2)
      .map((employee) => employee.id);
  },
  { immediate: true }
);

function toggleEmployee(id) {
  expandedIds.value = expandedIds.value.includes(id)
    ? expandedIds.value.filter((value) => value !== id)
    : [...expandedIds.value, id];
}
function cellStyle(value) {
  if (value === null) return { background: "var(--inset)" };
  const color =
    mode.value === "calls"
      ? "var(--call)"
      : mode.value === "delta"
      ? value < 0
        ? "var(--idle)"
        : "var(--crm)"
      : value < 35
      ? "var(--idle)"
      : "var(--crm)";
  const strength =
    mode.value === "delta"
      ? Math.min(Math.abs(value) * 5, 65)
      : mode.value === "calls"
      ? Math.min(value * 1.6, 85)
      : Math.max(12, value * 0.72);
  return {
    background: `color-mix(in srgb, ${color} ${strength}%, var(--inset))`,
  };
}
function cellText(value) {
  if (value === null) return "—";
  return mode.value === "delta"
    ? `${value > 0 ? "+" : ""}${value}`
    : `${value}%`;
}
</script>

<template>
  <div class="period-overview">
    <div class="period-preview">
      <span><FlaskConical :size="13" />Предпросмотр · демоданные</span
      ><span class="period-preview-detail"
        >Демонстрационные значения не пересчитываются</span
      >
    </div>
    <section v-if="!employees.length" class="surface empty-state period-empty">
      <Users :size="30" />
      <h3>Выберите сотрудников</h3>
      <p>
        Добавьте сотрудников в фильтре, чтобы посмотреть макет
        {{ kind === "week" ? "недельного" : "месячного" }} отчёта.
      </p>
    </section>

    <template v-else>
      <section class="surface period-section">
        <div class="period-section-heading">
          <div>
            <h2>
              <BarChart3 :size="16" />Итоги <span>· {{ label }}</span>
            </h2>
            <p class="muted">
              Обзор активности за {{ kind === "week" ? "неделю" : "месяц" }} ·
              сравнение с предыдущим периодом
            </p>
          </div>
        </div>
        <div class="period-kpis">
          <div v-for="card in summary" :key="card.label" class="period-kpi">
            <div class="period-kpi-label">
              <component :is="icons[card.icon]" :size="13" /><span>{{
                card.label
              }}</span>
            </div>
            <strong
              class="period-kpi-value"
              :class="{ long: card.value.length > 8 }"
              >{{ card.value }}</strong
            >
            <div class="period-kpi-change">
              <b :class="card.positive ? 'positive' : 'negative'">{{
                card.change
              }}</b
              ><span>· было {{ card.previous }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="surface period-section">
        <div class="period-section-heading">
          <div>
            <h2>
              <Clock3 :size="16" />По часам <span>· {{ label }}</span>
            </h2>
            <p class="muted">
              Доля активного времени в часе ·
              <span class="period-mark">▲</span> лучший час ·
              <span class="period-mark">▼</span> худший час
            </p>
          </div>
          <div
            class="segmented period-modes"
            aria-label="Режим таблицы по часам"
          >
            <button
              v-for="item in modes"
              :key="item.id"
              type="button"
              :class="{ active: mode === item.id }"
              :aria-pressed="mode === item.id"
              @click="mode = item.id"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
        <div
          class="period-table-scroll"
          tabindex="0"
          aria-label="Активность по часам, прокрутите таблицу по горизонтали"
        >
          <table class="period-heatmap">
            <thead>
              <tr>
                <th class="period-name-cell">Сотрудник</th>
                <th v-for="hour in hours" :key="hour">{{ hour }}:00</th>
                <th>Рейтинг</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.employee.id">
                <td class="period-name-cell">
                  <span class="period-person"
                    ><span
                      class="avatar period-avatar"
                      :data-tone="row.employee.tone"
                      >{{ row.employee.name.charAt(0) }}</span
                    >{{ row.employee.name }}</span
                  >
                </td>
                <td
                  v-for="(value, index) in row.fixture[mode]"
                  :key="index"
                  :style="cellStyle(value)"
                  :title="`${row.employee.name}, ${hours[index]}:00–${
                    hours[index] + 1
                  }:00 · ${cellText(value)} · демоданные`"
                  :class="{
                    'best-hour': mode !== 'delta' && index === row.fixture.best,
                    'worst-hour':
                      mode !== 'delta' && index === row.fixture.worst,
                    'no-value': value === null,
                  }"
                >
                  {{ cellText(value) }}
                </td>
                <td class="period-rating">
                  <strong>{{ row.fixture.rating }}</strong
                  ><span
                    v-if="row.fixture.change"
                    :class="
                      row.fixture.change.startsWith('+')
                        ? 'positive'
                        : 'negative'
                    "
                    >{{ row.fixture.change }} п.п.</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="period-heat-legend">
          <span>{{
            mode === "delta"
              ? "Изменение доли активности, п.п."
              : mode === "calls"
              ? "Доля времени на звонках"
              : "Доля активного времени"
          }}</span
          ><template v-if="mode === 'delta'"
            ><i :style="cellStyle(-12)" />Снижение<i
              :style="cellStyle(12)"
            />Рост</template
          ><template v-else
            ><template v-for="value in [0, 30, 60, 90]" :key="value"
              ><i :style="cellStyle(value)" />{{ value }}%</template
            ></template
          >
        </div>
      </section>

      <section class="surface period-section">
        <div class="period-section-heading">
          <div>
            <h2>
              <Users :size="16" />Сотрудники <span>· {{ label }}</span>
            </h2>
            <p class="muted">
              Активное время и зарегистрированные события в CRM
            </p>
          </div>
          <span class="period-count">{{ employees.length }} сотрудников</span>
        </div>
        <div
          class="period-table-scroll"
          tabindex="0"
          aria-label="Показатели сотрудников, прокрутите таблицу по горизонтали"
        >
          <table class="period-employees-table">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Активное время</th>
                <th>События</th>
                <th>Рейтинг</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.employee.id">
                <td>
                  <span class="period-person"
                    ><span
                      class="avatar period-avatar"
                      :data-tone="row.employee.tone"
                      >{{ row.employee.name.charAt(0) }}</span
                    >{{ row.employee.name }}</span
                  >
                </td>
                <td>
                  <span class="period-bar-cell"
                    ><i
                      class="period-bar active-time"
                      :style="{ width: `${row.fixture.activeWidth * 0.55}%` }"
                    /><b>{{
                      kind === "month"
                        ? row.fixture.monthActive
                        : row.fixture.active
                    }}</b></span
                  >
                </td>
                <td>
                  <span class="period-bar-cell"
                    ><i
                      class="period-bar events"
                      :style="{ width: `${row.fixture.eventsWidth * 0.62}%` }"
                    /><b>{{
                      kind === "month"
                        ? row.fixture.monthEvents
                        : row.fixture.events
                    }}</b></span
                  >
                </td>
                <td class="period-employee-rating">{{ row.fixture.rating }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="period-charts">
        <PeriodChart :kind="kind" metric="calls" :label="label" /><PeriodChart
          :kind="kind"
          metric="tasks"
          :label="label"
        />
      </div>

      <div class="period-comparison-title">
        <h2>Сравнение рабочих дней</h2>
        <div class="period-expansion-actions">
          <button
            type="button"
            @click="expandedIds = employees.map((employee) => employee.id)"
          >
            <ChevronDown :size="13" />Развернуть все</button
          ><button type="button" @click="expandedIds = []">Свернуть все</button>
        </div>
      </div>
      <div class="period-comparison-list">
        <PeriodComparison
          v-for="employee in employees"
          :key="employee.id"
          :employee="employee"
          :kind="kind"
          :label="label"
          :days="days"
          :open="expandedIds.includes(employee.id)"
          @toggle="toggleEmployee(employee.id)"
          @open-day="emit('open-day', $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.period-overview {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  max-width: 100%;
  color: var(--text);
}
.period-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}
.period-preview > span:first-child {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  background: var(--card);
  padding: 5px 9px;
  border-radius: 5px;
}
.period-preview-detail {
  color: var(--subtle);
}
.period-empty {
  padding: 70px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.period-empty > svg {
  color: var(--subtle);
}
.period-empty h3 {
  margin: 15px 0 8px;
  font-size: 17px;
}
.period-empty p {
  color: var(--muted);
  font-size: 13px;
  max-width: 420px;
  line-height: 1.6;
  margin: 0;
}
.period-section {
  padding: 20px;
  min-width: 0;
}
.period-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 19px;
}
.period-section-heading h2 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  flex-wrap: wrap;
  line-height: 1.5;
}
.period-section-heading h2 > svg {
  color: var(--subtle);
  flex: none;
}
.period-section-heading h2 > span {
  color: var(--muted);
  font-weight: 400;
}
.period-section-heading p {
  font-size: 11px;
  margin: 7px 0 0;
  line-height: 1.6;
}
.period-mark {
  font-size: 9px;
}
.period-kpis {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 9px;
}
.period-kpi {
  padding: 12px;
  background: var(--inset);
  border: 1px solid var(--line);
  border-radius: 6px;
  min-width: 0;
}
.period-kpi-label {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.45;
  min-height: 29px;
}
.period-kpi-label svg {
  color: var(--subtle);
  flex: none;
  margin-top: 1px;
}
.period-kpi-value {
  display: block;
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.5px;
  margin: 10px 0 7px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.period-kpi-value.long {
  font-size: 19px;
  line-height: 1.58;
  letter-spacing: -0.4px;
}
.period-kpi-change {
  font-size: 10px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  line-height: 1.5;
  color: var(--muted);
}
.period-kpi-change b {
  font-weight: 600;
}
.positive {
  color: var(--crm);
}
.negative {
  color: var(--idle);
}
.period-modes {
  flex: none;
  white-space: nowrap;
}
.period-modes button {
  font-size: 11px;
  padding: 6px 10px;
}
.period-table-scroll {
  width: 100%;
  overflow-x: auto;
  min-width: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.period-heatmap {
  width: 100%;
  min-width: 850px;
  border-collapse: separate;
  border-spacing: 3px 5px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.period-heatmap th {
  text-align: center;
  color: var(--muted);
  font-weight: 500;
  padding: 0 0 6px;
  font-size: 10px;
}
.period-heatmap td {
  text-align: center;
  border-radius: 4px;
  height: 34px;
  font-weight: 500;
  position: relative;
  padding: 3px 4px;
  min-width: 40px;
}
.period-heatmap .period-name-cell {
  text-align: left;
  background: transparent;
  width: 155px;
  white-space: nowrap;
  padding-left: 0;
  min-width: 155px;
}
.period-person {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.period-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  font-size: 11px;
}
.period-heatmap .period-rating {
  width: 74px;
  background: transparent;
  padding-left: 8px;
  min-width: 74px;
}
.period-rating strong {
  font-size: 12px;
  font-weight: 600;
}
.period-rating > span {
  display: block;
  font-size: 9px;
  line-height: 1.3;
  margin-top: 3px;
}
.best-hour:after,
.worst-hour:after {
  content: "";
  position: absolute;
  right: 3px;
  border: 3px solid transparent;
}
.best-hour:after {
  top: 3px;
  border-top: 0;
  border-bottom-color: var(--text);
}
.worst-hour:after {
  bottom: 3px;
  border-bottom: 0;
  border-top-color: var(--text);
}
.period-heatmap .no-value {
  color: var(--subtle);
}
.period-heat-legend {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--muted);
  margin-top: 14px;
  flex-wrap: wrap;
}
.period-heat-legend > span {
  margin-right: 7px;
}
.period-heat-legend i {
  width: 14px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
  margin-left: 5px;
}
.period-count {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  margin-top: 3px;
}
.period-employees-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 750px;
  text-align: left;
  font-size: 11px;
}
.period-employees-table th {
  font-size: 10px;
  color: var(--muted);
  font-weight: 500;
  padding: 0 0 11px;
}
.period-employees-table th:first-child {
  width: 190px;
}
.period-employees-table th:nth-child(2) {
  width: 37%;
}
.period-employees-table th:nth-child(3) {
  width: 30%;
}
.period-employees-table th:last-child {
  text-align: right;
}
.period-employees-table td {
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.period-bar-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 20px;
  white-space: nowrap;
}
.period-bar {
  display: block;
  height: 12px;
  flex: none;
  border-radius: 3px;
  opacity: 0.85;
}
.period-bar.active-time {
  background: var(--crm);
}
.period-bar.events {
  background: var(--call);
}
.period-bar-cell b {
  font-weight: 500;
  font-size: 11px;
}
.period-employee-rating {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.period-charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  min-width: 0;
}
.period-comparison-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  flex-wrap: wrap;
  margin-top: 5px;
}
.period-comparison-title h2 {
  font-size: 17px;
  font-weight: 600;
  margin: 0;
}
.period-expansion-actions {
  display: flex;
  gap: 8px;
}
.period-expansion-actions button {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--card);
  padding: 6px 10px;
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
}
.period-expansion-actions button:hover {
  color: var(--text);
  border-color: var(--subtle);
}
.period-comparison-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
@media (max-width: 1300px) {
  .period-kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .period-kpi-label {
    min-height: 15px;
  }
  .period-section-heading {
    flex-wrap: wrap;
  }
  .period-kpi-value.long {
    font-size: 22px;
    line-height: 1.35;
  }
}
@media (max-width: 900px) {
  .period-charts {
    grid-template-columns: 1fr;
  }
  .period-preview {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }
  .period-preview-detail {
    font-size: 10px;
  }
}
@media (max-width: 600px) {
  .period-overview {
    gap: 14px;
  }
  .period-section {
    padding: 15px;
  }
  .period-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .period-kpi:last-child {
    grid-column: span 2;
  }
  .period-kpi-value {
    font-size: 24px;
  }
  .period-section-heading h2 {
    font-size: 13px;
  }
  .period-modes {
    max-width: 100%;
    display: flex;
  }
  .period-modes button {
    padding: 6px 8px;
    font-size: 10px;
  }
  .period-comparison-title h2 {
    font-size: 16px;
  }
  .period-expansion-actions button {
    font-size: 10px;
  }
}
</style>
