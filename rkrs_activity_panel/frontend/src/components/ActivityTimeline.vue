<script setup>
import { computed } from "vue";

const props = defineProps({
  segments: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
  startHour: { type: Number, default: 9 },
  endHour: { type: Number, default: 21 },
});

const kinds = {
  crm: { label: "Активность в amoCRM", color: "var(--crm, #52c41a)" },
  call: { label: "Звонок", color: "var(--call, #1890ff)" },
  idle: { label: "Нет активности", color: "var(--idle, #ff4d4f)" },
  future: { label: "Ещё не наступило", color: "var(--future, #878787)" },
};

const range = computed(() =>
  Math.max(1, (props.endHour - props.startHour) * 60)
);
const visibleSegments = computed(() =>
  props.segments.flatMap((segment, index) => {
    if (
      !kinds[segment.type] ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.duration) ||
      segment.duration <= 0
    )
      return [];
    const start = Math.max(0, segment.start);
    const end = Math.min(range.value, segment.start + segment.duration);
    if (end <= start) return [];
    return [{ ...segment, index, start, end, duration: end - start }];
  })
);
const ticks = computed(() =>
  Array.from(
    { length: Math.max(1, Math.floor(props.endHour - props.startHour)) + 1 },
    (_, index) => ({
      hour: props.startHour + index,
      left: `${((index * 60) / range.value) * 100}%`,
    })
  )
);
const summary = computed(() => {
  if (!visibleSegments.value.length)
    return "Данные об активности за этот день отсутствуют.";
  const totals = Object.keys(kinds)
    .map((type) => {
      const minutes = visibleSegments.value
        .filter((segment) => segment.type === type)
        .reduce((sum, segment) => sum + segment.duration, 0);
      return minutes
        ? `${kinds[type].label}: ${Math.round(minutes)} мин.`
        : null;
    })
    .filter(Boolean);
  return totals.join(" · ");
});

function time(offset) {
  const minutes = Math.round(props.startHour * 60 + offset);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
}

function segmentTitle(segment) {
  return `${time(segment.start)}–${time(segment.end)} · ${
    kinds[segment.type].label
  } · ${Math.round(segment.duration)} мин.`;
}
</script>

<template>
  <div class="timeline" :class="{ 'is-compact': compact }">
    <div
      class="timeline-track"
      :class="{ 'is-empty': !visibleSegments.length }"
      role="img"
      tabindex="0"
      :aria-label="`Активность с ${time(0)} до ${time(range)}. ${summary}`"
      :title="summary"
    >
      <span
        v-for="segment in visibleSegments"
        :key="segment.index"
        class="timeline-segment"
        :style="{
          left: `${(segment.start / range) * 100}%`,
          width: `${(segment.duration / range) * 100}%`,
          background: kinds[segment.type].color,
        }"
        :title="segmentTitle(segment)"
      />
      <span v-if="!visibleSegments.length" class="timeline-empty"
        >Нет данных об активности</span
      >
    </div>
    <div class="timeline-axis" aria-hidden="true">
      <span
        v-for="(tick, index) in ticks"
        :key="tick.hour"
        :class="{
          'is-first': index === 0,
          'is-last': index === ticks.length - 1,
          'is-intermediate': index % 2 !== 0 && index !== ticks.length - 1,
        }"
        :style="{ left: tick.left }"
        >{{ String(tick.hour).padStart(2, "0") }}:00</span
      >
    </div>
    <div class="timeline-keyboard-summary">{{ summary }}</div>
  </div>
</template>

<style scoped>
.timeline {
  position: relative;
  min-width: 0;
}
.timeline-track {
  height: 30px;
  overflow: hidden;
  position: relative;
  border-radius: 3px;
  background: #354b63;
}
.timeline-track:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.timeline-segment {
  position: absolute;
  top: 0;
  bottom: 0;
  min-width: 1px;
}
.timeline-segment:hover {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.65);
  z-index: 1;
}
.timeline-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 11px;
}
.timeline-axis {
  height: 21px;
  margin-top: 5px;
  position: relative;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.timeline-axis > span {
  position: absolute;
  top: 4px;
  transform: translateX(-50%);
  white-space: nowrap;
}
.timeline-axis > span::before {
  content: "";
  position: absolute;
  top: -7px;
  left: 50%;
  height: 4px;
  width: 1px;
  background: var(--subtle);
  opacity: 0.7;
}
.timeline-axis > .is-first {
  transform: none;
}
.timeline-axis > .is-first::before {
  left: 0;
}
.timeline-axis > .is-last {
  transform: translateX(-100%);
}
.timeline-axis > .is-last::before {
  left: auto;
  right: 0;
}
.timeline-keyboard-summary {
  display: none;
  color: var(--muted);
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.5;
}
.timeline:focus-within .timeline-keyboard-summary {
  display: block;
}
.is-compact .timeline-track {
  height: 20px;
}
.is-compact .timeline-empty {
  font-size: 10px;
}
.is-compact .timeline-axis {
  height: 17px;
  font-size: 10px;
}
@media (max-width: 600px) {
  .timeline-axis > .is-intermediate {
    visibility: hidden;
  }
  .timeline-axis {
    font-size: 10px;
  }
}
</style>
