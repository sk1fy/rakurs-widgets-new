<script setup>
defineProps({ name: String, size: { type: Number, default: 18 } });
const paths = {
  chevron: "m6 9 6 6 6-6",
  tasks: "M9 5h11M9 12h11M9 19h11M3 5h.01M3 12h.01M3 19h.01",
  history: "M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l.7 3 2.7 1 2.6 2-1.4 3 .4 3-2.4 2-1.1 3h-3l-2.5 1-2.5-2-3-1v-3L3 12l1.5-2.5V7l3-1Z",
  close: "m6 6 12 12M6 18 18 6",
  play: "M7 5.5v13c0 .8.9 1.3 1.6.8l10-6.5c.6-.4.6-1.2 0-1.6l-10-6.5C7.9 4.2 7 4.7 7 5.5Z",
  goto: "M4 5.5v13c0 .8.9 1.3 1.6.8l9-6.5c.6-.4.6-1.2 0-1.6l-9-6.5C4.9 4.2 4 4.7 4 5.5ZM17.5 4.5h2a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Z",
  stop: "M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  more: "M7 12a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0M13.6 12a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0M20.2 12a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0",
  link: "M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5",
  list: "M3 6h18M3 12h18M3 18h18",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  message: "M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 1 1 18-4Z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
};
const solid = new Set(["play", "goto", "stop", "more"]);
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="solid.has(name) ? 'currentColor' : 'none'"
    :stroke="solid.has(name) ? 'none' : 'currentColor'"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="rkrs-icon"
  >
    <path :d="paths[name] || paths.activity" />
  </svg>
</template>
