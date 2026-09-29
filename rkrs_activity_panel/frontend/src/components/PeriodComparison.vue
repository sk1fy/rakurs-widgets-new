<script setup>
import { computed, ref, watch } from "vue";
import { ArrowUpRight, ChevronDown, CalendarDays } from "@lucide/vue";
import {
  comparisonDays,
  periodEmployees,
  emptyPeriodEmployee,
} from "../data/periodFixtures";

const props = defineProps({
  employee: { type: Object, required: true },
  kind: { type: String, default: "week" },
  label: String,
  days: { type: Array, default: () => [] },
  open: Boolean,
});
const emit = defineEmits(["toggle", "open-day"]);
const selectedDays = ref([]);
const displayMode = ref("activity");
const profile = computed(
  () => periodEmployees[props.employee.id] || emptyPeriodEmployee
);
const hasData = computed(() => !!periodEmployees[props.employee.id]);
const visibleDays = computed(() =>
  props.days.filter(
    (day) => !day.future && selectedDays.value.includes(day.date)
  )
);
const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const timelineLabels = {
  crm: "Активность в amoCRM",
  call: "Звонки",
  idle: "Нет событий",
};

watch(
  () => props.days,
  (days) => {
    const working = days.filter((day) => !day.weekend && !day.future);
    selectedDays.value = (
      props.kind === "month" ? working.slice(0, 5) : working
    ).map((day) => day.date);
  },
  { immediate: true }
);

function setSelection(selection) {
  selectedDays.value =
    selection === "none"
      ? []
      : props.days
          .filter((day) => !day.future && (selection === "all" || !day.weekend))
          .map((day) => day.date);
}
function dayFixture(day) {
  return hasData.value ? comparisonDays[day.weekday] : comparisonDays[6];
}
function openDay(day) {
  if (!day.future)
    emit("open-day", { employeeId: props.employee.id, date: day.date });
}
</script>

<template>
  <section class="surface period-comparison">
    <button
      class="comparison-heading"
      type="button"
      :aria-expanded="open"
      :aria-controls="`comparison-${employee.id}`"
      @click="emit('toggle')"
    >
      <span class="comparison-person">
        <span class="avatar comparison-avatar" :data-tone="employee.tone">{{
          employee.name.charAt(0)
        }}</span>
        <span
          ><strong>{{ employee.name }}</strong
          ><small>{{ employee.groupName || "Отдел продаж" }}</small></span
        >
      </span>
      <span class="comparison-brief"
        ><span
          >Активность
          <b>{{
            kind === "month" ? profile.monthActive : profile.active
          }}</b></span
        ><span
          >События
          <b>{{
            kind === "month" ? profile.monthEvents : profile.events
          }}</b></span
        ></span
      >
      <span class="comparison-period">{{ label }}</span>
      <span class="comparison-chevron" :class="{ closed: !open }"
        ><ChevronDown :size="16"
      /></span>
    </button>

    <div
      v-if="open"
      :id="`comparison-${employee.id}`"
      class="comparison-content"
    >
      <div class="comparison-day-toolbar">
        <span class="muted"
          >Выбрано {{ selectedDays.length }} из {{ days.length }} дней</span
        >
        <div class="comparison-day-actions">
          <button type="button" @click="setSelection('all')">Все дни</button
          ><button type="button" @click="setSelection('weekdays')">Пн–Пт</button
          ><button type="button" @click="setSelection('none')">Сбросить</button>
        </div>
      </div>
      <div class="comparison-day-chips">
        <label
          v-for="day in days"
          :key="day.date"
          class="comparison-day-chip"
          :class="{
            selected: selectedDays.includes(day.date),
            weekend: day.weekend,
            future: day.future,
          }"
        >
          <span
            ><input
              v-model="selectedDays"
              type="checkbox"
              :value="day.date"
              :disabled="day.future"
              :aria-label="`Выбрать ${day.label} для ${employee.name}`"
            />{{ day.label }}</span
          >
          <small>{{
            day.future
              ? "Ещё не наступило"
              : dayFixture(day).events === "—"
              ? "Нет событий"
              : `${dayFixture(day).events} событий`
          }}</small>
        </label>
      </div>

      <div class="comparison-mini-cards">
        <div>
          <span>Первое событие</span
          ><strong>{{ hasData ? "09:08" : "—" }}</strong
          ><small>Медиана · пример</small>
        </div>
        <div>
          <span>Последнее событие</span
          ><strong>{{ hasData ? "18:18" : "—" }}</strong
          ><small>Медиана · пример</small>
        </div>
        <div>
          <span>Интервалы активности</span
          ><strong>{{
            kind === "month" ? profile.monthActive : profile.active
          }}</strong
          ><small>За период · пример</small>
        </div>
        <div>
          <span>Зарегистрировано в CRM</span
          ><strong>{{
            kind === "month" ? profile.monthEvents : profile.events
          }}</strong
          ><small>Событий · пример</small>
        </div>
      </div>

      <div class="comparison-mode-row">
        <div
          class="segmented comparison-modes"
          aria-label="Вид полос активности"
        >
          <button
            type="button"
            :class="{ active: displayMode === 'activity' }"
            :aria-pressed="displayMode === 'activity'"
            @click="displayMode = 'activity'"
          >
            Активность и паузы</button
          ><button
            type="button"
            :class="{ active: displayMode === 'events' }"
            :aria-pressed="displayMode === 'events'"
            @click="displayMode = 'events'"
          >
            Только события
          </button>
        </div>
        <div class="comparison-legend">
          <span><i class="crm" />amoCRM</span
          ><span><i class="call" />Звонки</span
          ><span
            ><i :class="displayMode === 'events' ? 'no-event' : 'idle'" />{{
              displayMode === "events" ? "Нет событий" : "Паузы"
            }}</span
          >
        </div>
      </div>

      <div
        v-if="visibleDays.length"
        class="comparison-table-scroll"
        tabindex="0"
        aria-label="Сравнение дней, прокрутите таблицу по горизонтали"
      >
        <table class="comparison-table">
          <thead>
            <tr>
              <th>День</th>
              <th class="timeline-header">
                <div class="comparison-hour-scale">
                  <span
                    v-for="(hour, index) in hours"
                    :key="hour"
                    :style="{ left: `${(index / 12) * 100}%` }"
                    >{{ hour }}</span
                  >
                </div>
              </th>
              <th>Первое</th>
              <th>Последнее</th>
              <th>Активность</th>
              <th>События</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="day in visibleDays" :key="day.date">
              <td class="comparison-day-name">
                <strong>{{ day.label }}</strong
                ><button
                  type="button"
                  :disabled="day.future"
                  @click="openDay(day)"
                >
                  Открыть день <ArrowUpRight :size="11" />
                </button>
              </td>
              <td class="timeline-cell">
                <div
                  class="comparison-timeline"
                  :class="{ 'events-only': displayMode === 'events' }"
                  :aria-label="`Демонстрационная активность за ${day.label}`"
                >
                  <template v-if="dayFixture(day).segments.length"
                    ><span
                      v-for="(segment, index) in dayFixture(day).segments"
                      :key="index"
                      class="comparison-segment"
                      :class="segment[2]"
                      :style="{
                        left: `${segment[0]}%`,
                        width: `${segment[1]}%`,
                      }"
                      :title="timelineLabels[segment[2]]"
                  /></template>
                  <span v-else class="comparison-no-events"
                    >Нет зарегистрированных событий</span
                  >
                </div>
              </td>
              <td>{{ dayFixture(day).first }}</td>
              <td>{{ dayFixture(day).last }}</td>
              <td>{{ dayFixture(day).active }}</td>
              <td>{{ dayFixture(day).events }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="comparison-empty">
        <CalendarDays :size="22" /><span>Выберите дни для сравнения</span>
      </div>
      <p class="comparison-note">
        Пауза — отсутствие зарегистрированных действий в CRM. Цветные интервалы
        показывают активность в amoCRM и звонки.
      </p>
    </div>
  </section>
</template>

<style scoped>
.comparison-day-chip.future {
  opacity: 0.45;
  cursor: default;
}
.comparison-day-chip.future input {
  cursor: default;
}
.period-comparison {
  padding: 0;
  min-width: 0;
  overflow: hidden;
}
.comparison-heading {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 18px;
  text-align: left;
  cursor: pointer;
}
.comparison-heading:hover {
  background: var(--card-hi);
}
.comparison-person {
  display: flex;
  align-items: center;
  gap: 11px;
  flex: 1;
  min-width: 140px;
}
.comparison-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 8px;
  font-size: 14px;
}
.comparison-person strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
}
.comparison-person small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}
.comparison-brief {
  display: flex;
  gap: 22px;
  color: var(--muted);
  font-size: 11px;
}
.comparison-brief b {
  margin-left: 5px;
  color: var(--text);
  font-weight: 500;
}
.comparison-period {
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}
.comparison-chevron {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--muted);
}
.comparison-chevron svg {
  transition: transform 0.15s;
}
.comparison-chevron.closed svg {
  transform: rotate(-90deg);
}
.comparison-content {
  padding: 0 20px 17px;
}
.comparison-day-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  border-top: 1px solid var(--line);
  padding-top: 15px;
  margin-bottom: 12px;
}
.comparison-day-actions {
  display: flex;
  gap: 6px;
}
.comparison-day-actions button {
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 5px 10px;
  background: var(--inset);
  color: var(--text);
  font-size: 11px;
  cursor: pointer;
}
.comparison-day-actions button:hover {
  border-color: var(--accent);
}
.comparison-day-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 18px;
}
.comparison-day-chip {
  min-width: 108px;
  cursor: pointer;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 10px;
  background: var(--inset);
  font-size: 11px;
}
.comparison-day-chip.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--inset));
}
.comparison-day-chip > span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.comparison-day-chip input {
  accent-color: var(--accent);
  margin: 0;
  width: 12px;
  height: 12px;
  cursor: pointer;
}
.comparison-day-chip small {
  display: block;
  padding-left: 18px;
  margin-top: 5px;
  color: var(--muted);
  font-size: 10px;
}
.comparison-day-chip.weekend:not(.selected) {
  opacity: 0.65;
}
.comparison-mini-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 17px;
}
.comparison-mini-cards > div {
  padding: 12px 14px;
  background: var(--inset);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.comparison-mini-cards span,
.comparison-mini-cards small {
  display: block;
  color: var(--muted);
  font-size: 11px;
}
.comparison-mini-cards strong {
  display: block;
  font-size: 22px;
  line-height: 1.3;
  font-weight: 600;
  margin: 7px 0 4px;
  white-space: nowrap;
}
.comparison-mini-cards small {
  font-size: 10px;
  color: var(--subtle);
}
.comparison-mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 13px;
}
.comparison-modes button {
  font-size: 11px;
  padding: 6px 10px;
}
.comparison-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--muted);
  font-size: 10px;
}
.comparison-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.comparison-legend i {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
.crm {
  background: var(--crm);
}
.call {
  background: var(--call);
}
.idle {
  background: var(--idle);
}
.no-event {
  background: var(--line);
}
.comparison-table-scroll {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.comparison-table {
  width: 100%;
  min-width: 830px;
  border-collapse: collapse;
  font-size: 11px;
  text-align: left;
}
.comparison-table th {
  color: var(--muted);
  font-weight: 500;
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  white-space: nowrap;
}
.comparison-table td {
  padding: 10px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.comparison-table tbody tr:last-child td {
  border-bottom: 0;
}
.comparison-table tbody tr:hover {
  background: var(--card-hi);
}
.comparison-day-name {
  width: 100px;
}
.comparison-day-name strong {
  display: block;
  font-size: 11px;
  font-weight: 500;
}
.comparison-day-name button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--accent);
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 5px;
  cursor: pointer;
}
.comparison-day-name button:hover {
  text-decoration: underline;
}
.timeline-header,
.timeline-cell {
  width: 100%;
  min-width: 400px;
}
.comparison-table .timeline-header {
  padding-left: 16px;
  padding-right: 16px;
}
.comparison-hour-scale {
  position: relative;
  height: 12px;
}
.comparison-hour-scale span {
  position: absolute;
  transform: translateX(-50%);
  color: var(--muted);
  font-size: 10px;
}
.comparison-timeline {
  height: 27px;
  position: relative;
  background: var(--inset);
  border-radius: 3px;
  overflow: hidden;
}
.comparison-segment {
  height: 100%;
  position: absolute;
  border-right: 1px solid color-mix(in srgb, var(--card) 20%, transparent);
}
.comparison-segment.idle {
  opacity: 0.65;
}
.events-only .comparison-segment.idle {
  background: var(--inset);
  opacity: 1;
}
.comparison-no-events {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--muted);
}
.comparison-note {
  font-size: 10px;
  color: var(--subtle);
  margin: 13px 0 0;
  line-height: 1.6;
}
.comparison-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 28px;
  color: var(--muted);
  font-size: 12px;
}
@media (max-width: 1100px) {
  .comparison-brief {
    gap: 12px;
  }
  .comparison-period {
    display: none;
  }
}
@media (max-width: 750px) {
  .comparison-heading {
    padding: 15px;
  }
  .comparison-content {
    padding: 0 15px 15px;
  }
  .comparison-brief {
    display: none;
  }
  .comparison-mini-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .comparison-mini-cards strong {
    font-size: 19px;
  }
  .comparison-day-chip {
    min-width: 98px;
    flex: 1;
  }
  .comparison-day-chip small {
    padding-left: 0;
  }
  .comparison-modes button {
    padding: 6px 8px;
    font-size: 10px;
  }
}
</style>
