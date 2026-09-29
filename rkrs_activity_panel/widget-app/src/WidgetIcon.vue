<script setup>
defineProps({ name: String, size: { type: Number, default: 18 } });
const paths = {
  chevron: "m6 9 6 6 6-6",
  tasks: "M9 5h11M9 12h11M9 19h11M3 5h.01M3 12h.01M3 19h.01",
  history: "M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l.7 3 2.7 1 2.6 2-1.4 3 .4 3-2.4 2-1.1 3h-3l-2.5 1-2.5-2-3-1v-3L3 12l1.5-2.5V7l3-1Z",
  close: "m6 6 12 12M6 18 18 6",
  play: "m8 5 11 7-11 7Z",
  stop: "M6 6h12v12H6Z",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  message: "M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 1 1 18-4Z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
};
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="rkrs-icon"
  >
    <path :d="paths[name] || paths.activity" />
  </svg>
</template>
