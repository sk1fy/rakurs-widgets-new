<script setup>
import { computed, ref, watch } from "vue";
import { normalizeSettings, validateSettings, WEEKDAY_LABELS } from "../time.js";

const props = defineProps({
  snapshot: { type: Object, required: true },
  controller: { type: Object, required: true },
});

const copySettings = (value) => JSON.parse(JSON.stringify(value));
const draft = ref(copySettings(props.snapshot.settings));
const holidayInput = ref("");
const zones = [
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Kamchatka",
  "UTC",
];

watch(
  () => props.snapshot.settingsNonce,
  () => {
    draft.value = copySettings(props.snapshot.settings);
  }
);

const draftErrors = computed(() => validateSettings(normalizeSettings(draft.value)));

function toggleDay(day) {
  const next = new Set(draft.value.weekdays);
  if (next.has(day)) next.delete(day);
  else next.add(day);
  draft.value.weekdays = [...next].sort();
}
function togglePipeline(id) {
  const next = new Set(draft.value.pipelineIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  draft.value.pipelineIds = [...next];
}
function addHoliday() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayInput.value)) return;
  if (!draft.value.holidays.includes(holidayInput.value)) {
    draft.value.holidays = [...draft.value.holidays, holidayInput.value].sort();
  }
  holidayInput.value = "";
}
function save() {
  props.controller.setSettings(draft.value);
}
</script>

<template>
  <form class="stack" @submit.prevent="save">
    <p class="caption">
      Настройки хранятся в этом браузере. После сохранения пересчитываются статусы и цифры отчёта.
    </p>
    <div v-if="draftErrors.length" class="state state-error" role="alert">
      <p v-for="error in draftErrors" :key="error">{{ error }}</p>
    </div>
    <div class="split">
      <label class="field">Норматив, минуты
        <input v-model.number="draft.targetMinutes" type="number" min="1" step="1" required />
      </label>
      <label class="field">Часовой пояс кабинета
        <select v-model="draft.timezone">
          <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
        </select>
      </label>
      <label class="field">Начало окна
        <input v-model="draft.workStart" type="time" required />
      </label>
      <label class="field">Конец окна
        <input v-model="draft.workEnd" type="time" required />
      </label>
    </div>
    <fieldset>
      <legend>Рабочие дни</legend>
      <div class="choices">
        <button
          v-for="day in [1, 2, 3, 4, 5, 6, 7]"
          :key="day"
          type="button"
          class="choice"
          :class="{ on: draft.weekdays.includes(day) }"
          :aria-pressed="draft.weekdays.includes(day)"
          @click="toggleDay(day)"
        >
          {{ WEEKDAY_LABELS[day].short }}
        </button>
      </div>
    </fieldset>
    <fieldset>
      <legend>Воронки под контролем</legend>
      <div class="check-grid">
        <label v-for="pipe in snapshot.pipelines" :key="pipe.id">
          <input
            type="checkbox"
            :checked="draft.pipelineIds.includes(pipe.id)"
            @change="togglePipeline(pipe.id)"
          />
          {{ pipe.name }}
        </label>
      </div>
    </fieldset>
    <fieldset>
      <legend>Переназначение в ожидании</legend>
      <label>
        <input v-model="draft.reassignmentPolicy" type="radio" value="reset" />
        Сброс: новая эпоха, старая остаётся в истории
      </label>
      <label>
        <input v-model="draft.reassignmentPolicy" type="radio" value="keep" />
        Сохранить обязательство: старт прежний
      </label>
    </fieldset>
    <label>
      <input v-model="draft.noteCounts" type="checkbox" />
      Ручное примечание текущего ответственного останавливает таймер
    </label>
    <label>
      <input v-model="draft.hideOffHoursHighlight" type="checkbox" />
      Скрывать подсветку сделок, созданных вне рабочего времени
    </label>
    <p class="caption">
      Это только маркер. Рабочие секунды таких сделок всё равно входят в расчёт.
    </p>
    <fieldset>
      <legend>Праздники демокалендаря</legend>
      <p class="caption">Явный список дат кабинета. Это выбранный способ демонстрации, не календарь поставщика.</p>
      <div class="choices">
        <button
          v-for="day in draft.holidays"
          :key="day"
          type="button"
          class="choice on"
          @click="draft.holidays = draft.holidays.filter((item) => item !== day)"
        >
          {{ day }} ×
        </button>
      </div>
      <div class="toolbar">
        <label>Дата
          <input v-model="holidayInput" type="date" />
        </label>
        <button type="button" class="btn" @click="addHoliday">Добавить дату</button>
      </div>
    </fieldset>
    <div class="split">
      <label class="field">Пре-алерт, % норматива
        <input v-model.number="draft.preAlertPercent" type="number" min="0" max="100" step="1" />
      </label>
      <label class="field">Множитель критической задачи
        <input v-model.number="draft.criticalMultiplier" type="number" min="1" step="0.1" />
      </label>
      <label class="field">Порог бюджета, ₽ (пусто — выключен)
        <input
          :value="draft.budgetThreshold ?? ''"
          type="number"
          min="0"
          step="1000"
          @input="draft.budgetThreshold = $event.target.value === '' ? null : Number($event.target.value)"
        />
      </label>
      <label class="field">Час дайджеста
        <input v-model.number="draft.digestHour" type="number" min="0" max="23" step="1" />
      </label>
      <label class="field">Час итога дня
        <input v-model.number="draft.eodHour" type="number" min="0" max="23" step="1" />
      </label>
    </div>
    <button type="submit" class="btn primary">Сохранить локально</button>
  </form>
</template>
