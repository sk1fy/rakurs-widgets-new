<script setup>
import { computed } from "vue";
import { ChartNoAxesCombined } from "@lucide/vue";
import { periodCharts } from "../data/periodFixtures";

const props = defineProps({
  kind: { type: String, default: "week" },
  metric: { type: String, default: "calls" },
  label: String,
});
const chart = computed(() => periodCharts[props.kind][props.metric]);
const title = computed(() =>
  props.metric === "calls"
    ? "Динамика по звонкам"
    : "Динамика по закрытым задачам"
);
const points = computed(() =>
  chart.value.current.split(" ").map((point) => point.split(","))
);
</script>

<template>
  <section class="surface period-chart" :class="metric">
    <div class="period-chart-heading">
      <ChartNoAxesCombined :size="16" />
      <h3>{{ title }}</h3>
    </div>
    <p class="muted period-chart-description">
      {{ kind === "week" ? "По дням недели" : "По дням месяца" }} · пример
      динамики
    </p>
    <svg
      viewBox="0 0 610 210"
      role="img"
      :aria-label="`${title}: демонстрационные данные текущего и предыдущего периода`"
    >
      <g v-for="(tick, index) in chart.scale" :key="tick">
        <line
          x1="40"
          x2="574"
          :y1="30 + index * 36"
          :y2="30 + index * 36"
          class="chart-grid"
        />
        <text x="30" :y="34 + index * 36" text-anchor="end" class="chart-y">
          {{ tick }}
        </text>
      </g>
      <polyline
        :points="chart.previous"
        fill="none"
        class="chart-previous"
        stroke-width="1.7"
        stroke-dasharray="5 5"
      />
      <polygon :points="`40,174 ${chart.current} 574,174`" class="chart-fill" />
      <polyline
        :points="chart.current"
        fill="none"
        class="chart-current"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <template v-if="kind === 'week'">
        <g v-for="(point, index) in points" :key="index">
          <circle :cx="point[0]" :cy="point[1]" r="4" class="chart-point">
            <title>
              {{ chart.ticks[index] }}: {{ chart.values[index] }} · демоданные
            </title>
          </circle>
          <text
            :x="point[0]"
            :y="Number(point[1]) - 11"
            text-anchor="middle"
            class="chart-value"
          >
            {{ chart.values[index] }}
          </text>
        </g>
      </template>
      <text
        v-for="(tick, index) in chart.ticks"
        :key="index"
        :x="40 + index * 89"
        y="199"
        text-anchor="middle"
        class="chart-x"
      >
        {{ tick }}
      </text>
    </svg>
    <div class="period-chart-legend">
      <span><i class="current" />{{ label }}</span
      ><span
        ><i class="previous" />Предыдущий
        {{ kind === "week" ? "период" : "месяц" }}</span
      >
    </div>
  </section>
</template>

<style scoped>
.period-chart {
  --chart-color: var(--call);
  padding: 20px;
  min-width: 0;
}
.period-chart.tasks {
  --chart-color: var(--crm);
}
.period-chart-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.period-chart-heading svg {
  color: var(--subtle);
  flex: none;
}
.period-chart h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.period-chart-description {
  font-size: 11px;
  margin: 8px 0 16px;
}
.period-chart > svg {
  width: 100%;
  height: auto;
  display: block;
}
.chart-grid {
  stroke: var(--line);
  stroke-width: 1;
}
.chart-y,
.chart-x {
  fill: var(--muted);
  font-size: 11px;
}
.chart-previous {
  stroke: var(--muted);
}
.chart-current {
  stroke: var(--chart-color);
}
.chart-fill {
  fill: var(--chart-color);
  opacity: 0.065;
}
.chart-point {
  fill: var(--chart-color);
  stroke: var(--card);
  stroke-width: 2;
}
.chart-value {
  fill: var(--text);
  font-size: 11px;
  font-weight: 600;
}
.period-chart-legend {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 11px;
  margin-top: 9px;
}
.period-chart-legend span {
  display: flex;
  align-items: center;
  gap: 7px;
}
.period-chart-legend i {
  display: inline-block;
  width: 16px;
  border-top: 2px solid var(--chart-color);
}
.period-chart-legend .previous {
  border-color: var(--muted);
  border-top-style: dashed;
}
</style>
