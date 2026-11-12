<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  message: { type: String, default: "" },
  error: { type: Boolean, default: false },
});
const visible = ref(false);

watch(() => props.message, (message, _, onCleanup) => {
  visible.value = Boolean(message);
  if (!message) return;
  const timer = setTimeout(() => { visible.value = false; }, 3000);
  onCleanup(() => clearTimeout(timer));
}, { immediate: true });
</script>

<template>
  <Transition name="rkrs-toast">
    <div v-if="visible && message" class="rkrs-toast" :class="{ 'rkrs-toast-error': error }">
      <div :role="error ? 'alert' : 'status'">{{ message }}</div>
      <slot />
    </div>
  </Transition>
</template>
