<script setup>
import { AlertTriangle, CircleAlert, CircleCheck, Clock, Pause, Timer } from "@lucide/vue";

defineProps({
  status: { type: Object, required: true },
  muted: { type: Boolean, default: false },
});

const icons = {
  waiting: Clock,
  paused: Pause,
  risk: AlertTriangle,
  overdue: CircleAlert,
  on_time: CircleCheck,
  late: CircleAlert,
  scheduled: Timer,
};
</script>

<template>
  <span class="badge" :class="muted ? 'neutral' : status.tone">
    <component :is="icons[status.id] || Clock" :size="14" aria-hidden="true" />
    {{ status.label }}
  </span>
</template>
