<script setup>
import { WEEKDAY_LABELS, formatDuration, formatWindow } from "../time.js";

const props = defineProps({
  heatmap: { type: Object, required: true },
  filters: { type: Object, required: true },
  controller: { type: Object, required: true },
});

const hours = Array.from({ length: 24 }, (_, hour) => hour);
const days = [1, 2, 3, 4, 5, 6, 7];

function cell(weekday, hour) {
  return props.heatmap.cells.find((item) => item.weekday === weekday && item.hour === hour);
}
function selected(weekday, hour) {
  return props.filters.weekday === weekday && props.filters.hour === hour;
}
</script>

<template>
  <div class="card section-gap">
    <h3>День недели × час назначения</h3>
    <p class="caption">
      Каждая ячейка — среднее рабочее время ожидания сделок, назначенных в этот час текущей эпохи,
      в часовом поясе кабинета. Пустая ячейка значит, что назначений не было.
    </p>
    <div class="heat-layout">
      <div>
        <div class="heat-scroll">
          <div class="heat" role="grid" aria-label="Тепловая карта назначений">
            <span></span>
            <span v-for="hour in hours" :key="hour">{{ hour }}</span>
            <template v-for="day in days" :key="day">
              <span>{{ WEEKDAY_LABELS[day].short }}</span>
              <button
                v-for="hour in hours"
                :key="`${day}-${hour}`"
                type="button"
                :class="[{ on: selected(day, hour) }, cell(day, hour).count ? `lv-${cell(day, hour).level}` : '']"
                :aria-label="`${formatWindow(day, hour)}. ${cell(day, hour).count} сделок. ${cell(day, hour).count ? formatDuration(cell(day, hour).averageMs) : 'нет данных'}`"
                @click="controller.toggleCell(day, hour)"
              >
                {{ cell(day, hour).count || "" }}
              </button>
            </template>
          </div>
        </div>
        <div class="legend" aria-hidden="true">
          <span>меньше</span>
          <i class="swatch" style="background: #eef2f6"></i>
          <i class="swatch" style="background: #d9efe4"></i>
          <i class="swatch" style="background: #f3e2b4"></i>
          <i class="swatch" style="background: #f3c7a2"></i>
          <i class="swatch" style="background: #e7a3a0"></i>
          <span>больше</span>
        </div>
      </div>
      <aside class="worst">
        <h3>Худшие день и час</h3>
        <strong>{{ heatmap.worst ? heatmap.worst.label : "нет данных" }}</strong>
        <p class="fine">
          {{
            heatmap.worst
              ? `${heatmap.worst.averageLabel} в среднем · ${heatmap.worst.count} сделок`
              : "В этом срезе нет назначений."
          }}
        </p>
        <p v-if="heatmap.worst" class="hypothesis">
          Гипотеза: назначения около {{ heatmap.worst.label }} ждут дольше, потому что ответ часто
          переносится на следующее рабочее окно. Это предположение, его нельзя подтвердить одной картой.
        </p>
      </aside>
    </div>
  </div>
</template>
