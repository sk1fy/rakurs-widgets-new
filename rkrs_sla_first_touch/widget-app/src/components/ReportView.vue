<script setup>
import { computed, ref } from "vue";
import CohortTable from "./CohortTable.vue";
import HeatmapGrid from "./HeatmapGrid.vue";

const props = defineProps({
  snapshot: { type: Object, required: true },
  controller: { type: Object, required: true },
});

const sortKey = ref("breaches");
const sortDir = ref("desc");

const managers = computed(() => {
  const rows = [...(props.snapshot.report?.managers || [])];
  const factor = sortDir.value === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const left = a[sortKey.value];
    const right = b[sortKey.value];
    if (left == null && right == null) return a.name.localeCompare(b.name, "ru");
    if (left == null) return 1;
    if (right == null) return -1;
    if (left === right) return a.name.localeCompare(b.name, "ru");
    return left > right ? factor : -factor;
  });
  return rows;
});

function sort(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  else {
    sortKey.value = key;
    sortDir.value = key === "name" ? "asc" : "desc";
  }
}

const presets = [
  { id: "today", label: "Сегодня" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "custom", label: "Период" },
];
</script>

<template>
  <div v-if="snapshot.viewMode === 'loading'" class="stack" role="status">
    <div class="skeleton"></div>
    <div class="skeleton"></div>
    <p>Загрузка демоданных…</p>
  </div>
  <div v-else-if="snapshot.viewMode === 'error'" class="state state-error" role="alert">
    <h2>Данные не разобраны</h2>
    <p>
      Демосценарий имитирует сбой чтения. Отчёт намеренно не построен: нулевые минуты и полное
      выполнение SLA здесь были бы неправдой.
    </p>
  </div>
  <div v-else-if="snapshot.settingsErrors.length" class="state state-error" role="alert">
    <h2>Настройки не позволяют посчитать SLA</h2>
    <p v-for="error in snapshot.settingsErrors" :key="error">{{ error }}</p>
  </div>
  <div v-else-if="!snapshot.report || snapshot.report.invalid" class="state state-error" role="alert">
    <h2>Период задан неверно</h2>
    <p>Конец диапазона должен быть позже начала. Показатели не рассчитаны.</p>
  </div>
  <div v-else class="stack">
    <div class="toolbar">
      <div class="period" role="group" aria-label="Период">
        <button
          v-for="item in presets"
          :key="item.id"
          type="button"
          :class="{ on: snapshot.period.preset === item.id }"
          :aria-pressed="snapshot.period.preset === item.id"
          @click="controller.setPeriod({ preset: item.id, from: snapshot.period.from, to: snapshot.period.to })"
        >
          {{ item.label }}
        </button>
      </div>
      <template v-if="snapshot.period.preset === 'custom'">
        <label>С
          <input
            type="date"
            :value="snapshot.period.from"
            @change="controller.setPeriod({ preset: 'custom', from: $event.target.value, to: snapshot.period.to })"
          />
        </label>
        <label>По
          <input
            type="date"
            :value="snapshot.period.to"
            @change="controller.setPeriod({ preset: 'custom', from: snapshot.period.from, to: $event.target.value })"
          />
        </label>
      </template>
      <label>Сотрудник
        <select
          :value="snapshot.filters.managerId"
          @change="controller.setFilters({ managerId: $event.target.value })"
        >
          <option value="">Все</option>
          <option v-for="person in snapshot.employees" :key="person.id" :value="person.id">
            {{ person.name }}
          </option>
        </select>
      </label>
      <label>Воронка
        <select
          :value="snapshot.filters.pipelineId"
          @change="controller.setFilters({ pipelineId: $event.target.value })"
        >
          <option value="">Все</option>
          <option v-for="pipe in snapshot.pipelines" :key="pipe.id" :value="pipe.id">
            {{ pipe.name }}
          </option>
        </select>
      </label>
    </div>

    <div class="kpi-grid">
      <article class="card kpi">
        <h3>Среднее время реакции</h3>
        <strong>{{ snapshot.report.kpis.average.label }}</strong>
        <p class="fine">
          <template v-if="snapshot.report.kpis.average.sample">
            по {{ snapshot.report.kpis.average.sample }} ответам ·
          </template>
          ждут {{ snapshot.report.kpis.average.waiting }}
        </p>
        <p class="delta">{{ snapshot.report.kpis.average.deltaLabel }}</p>
      </article>
      <article class="card kpi">
        <h3>Доля в SLA</h3>
        <strong>{{ snapshot.report.kpis.onTime.label }}</strong>
        <p class="fine">
          {{
            snapshot.report.kpis.onTime.sample
              ? `по ${snapshot.report.kpis.onTime.sample} ответам`
              : "нет ответов в выборке"
          }}
        </p>
        <p class="delta">{{ snapshot.report.kpis.onTime.deltaLabel }}</p>
      </article>
      <article class="card kpi">
        <h3>Нарушения</h3>
        <strong>{{ snapshot.report.kpis.breaches.label }}</strong>
        <p class="fine">
          {{
            snapshot.report.kpis.breaches.controlled
              ? `${snapshot.report.kpis.breaches.shareLabel} контролируемых сделок`
              : "нет контролируемых сделок"
          }}
        </p>
        <p class="delta">{{ snapshot.report.kpis.breaches.deltaLabel }}</p>
      </article>
      <article class="card kpi">
        <h3>Худшее окно</h3>
        <strong>{{ snapshot.report.kpis.worst.label }}</strong>
        <p class="fine">{{ snapshot.report.kpis.worst.averageLabel }}</p>
        <p class="delta">{{ snapshot.report.kpis.worst.deltaLabel }}</p>
      </article>
    </div>

    <div class="split">
      <section class="card" aria-label="Каналы">
        <h3>Каналы первого касания</h3>
        <div class="channel-grid" style="margin-top: 10px">
          <button
            v-for="channel in snapshot.report.channels"
            :key="channel.id"
            type="button"
            class="card channel"
            :class="{ on: snapshot.filters.channel === channel.id }"
            :aria-pressed="snapshot.filters.channel === channel.id"
            @click="controller.toggleChannel(channel.id)"
          >
            <span>{{ channel.label }}</span>
            <strong>{{ channel.count }}</strong>
            <small class="fine">среднее {{ channel.averageLabel }}</small>
            <small class="fine">в SLA {{ channel.shareLabel }}</small>
          </button>
        </div>
      </section>
      <section class="card" aria-label="Скорость">
        <h3>Скорость ответа</h3>
        <div class="speed-bar" role="img" aria-label="Доли групп скорости">
          <button
            v-for="segment in snapshot.report.speed"
            :key="segment.id"
            type="button"
            :class="[segment.tone, { on: snapshot.filters.speed === segment.id }]"
            :style="{ flexGrow: segment.count || 0.001 }"
            :aria-label="`${segment.label}: ${segment.count}`"
            @click="controller.toggleSpeed(segment.id)"
          ></button>
        </div>
        <ul class="speed-legend">
          <li v-for="segment in snapshot.report.speed" :key="segment.id">
            <button type="button" @click="controller.toggleSpeed(segment.id)">
              <i class="swatch" :class="segment.tone" aria-hidden="true"></i>
              {{ segment.label }}
              <b>{{ segment.count }}</b>
            </button>
          </li>
        </ul>
        <p class="caption">
          Границы — решение демо: до норматива включительно, от норматива до удвоенного
          включительно, дальше удвоенного. «Без ответа» — отдельная группа ожиданий.
        </p>
      </section>
    </div>

    <section class="card" aria-label="Рейтинг менеджеров">
      <h3>Рейтинг менеджеров</h3>
      <div class="table-scroll" style="margin-top: 10px; border: 0">
        <table>
          <thead>
            <tr>
              <th>
                <button type="button" @click="sort('name')" :aria-sort="sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                  Менеджер
                </button>
              </th>
              <th>
                <button type="button" @click="sort('averageMs')" :aria-sort="sortKey === 'averageMs' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                  Среднее
                </button>
              </th>
              <th>
                <button type="button" @click="sort('onTimeRatio')" :aria-sort="sortKey === 'onTimeRatio' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                  В срок
                </button>
              </th>
              <th>
                <button type="button" @click="sort('breaches')" :aria-sort="sortKey === 'breaches' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                  Нарушения
                </button>
              </th>
              <th>
                <button type="button" @click="sort('deals')" :aria-sort="sortKey === 'deals' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
                  Сделки
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="manager in managers" :key="manager.id">
              <td>
                <button type="button" class="linkish" @click="controller.setFilters({ managerId: manager.id })">
                  {{ manager.name }}
                </button>
              </td>
              <td>{{ manager.averageLabel }}</td>
              <td>{{ manager.onTimeLabel }}</td>
              <td>{{ manager.breaches }}</td>
              <td>{{ manager.deals }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <HeatmapGrid
      :heatmap="snapshot.report.heatmap"
      :filters="snapshot.filters"
      :controller="controller"
    />
    <CohortTable :snapshot="snapshot" :controller="controller" />

    <details>
      <summary>Как считается</summary>
      <ul>
        <li v-for="note in snapshot.report.notes" :key="note">{{ note }}</li>
      </ul>
    </details>
  </div>
</template>
