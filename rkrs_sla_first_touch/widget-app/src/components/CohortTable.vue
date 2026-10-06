<script setup>
import { formatDateTime, formatDuration } from "../time.js";
import StatusBadge from "./StatusBadge.vue";

const props = defineProps({
  snapshot: { type: Object, required: true },
  controller: { type: Object, required: true },
});

function download() {
  const csv = props.controller.exportCsv();
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sla-cohort.csv";
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="section-gap" aria-label="Когорта сделок">
    <div class="head-row">
      <h3>Сделки среза</h3>
      <button type="button" class="btn" @click="download">Скачать CSV</button>
    </div>
    <div class="chips">
      <button
        v-for="chip in snapshot.activeFilters"
        :key="chip.key"
        type="button"
        class="btn"
        @click="controller.clearFilter(chip.key)"
      >
        {{ chip.label }} ×
      </button>
      <button
        v-if="snapshot.activeFilters.length"
        type="button"
        class="btn"
        @click="controller.clearFilters()"
      >
        Сбросить фильтры
      </button>
    </div>
    <p class="caption">На узком экране таблица прокручивается по горизонтали.</p>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Сделка</th>
            <th>Менеджер</th>
            <th>Воронка</th>
            <th>Назначение</th>
            <th>Канал</th>
            <th>Рабочее ожидание</th>
            <th>Статус</th>
            <th>Превышение</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!snapshot.report.cohort.length">
            <td colspan="8">Нет сделок в этом срезе. Среднее по пустой выборке не равно 0 минут.</td>
          </tr>
          <tr v-for="row in snapshot.report.cohort" :key="row.id">
            <td>
              <button type="button" class="linkish" @click="controller.openDeal(row.id)">
                {{ row.title }}
              </button>
            </td>
            <td>{{ row.managerName }}</td>
            <td>{{ row.pipelineName }}</td>
            <td>{{ formatDateTime(row.assignedAt, snapshot.timeZone) }}</td>
            <td>{{ row.channel || "не определён" }}</td>
            <td>{{ formatDuration(row.elapsedMs) }}</td>
            <td><StatusBadge :status="row.status" :muted="row.suppressHighlight" /></td>
            <td>{{ row.overrunMs > 0 ? formatDuration(row.overrunMs) : "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
