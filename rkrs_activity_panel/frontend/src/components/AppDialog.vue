<script setup>
import { onMounted, ref } from "vue";
import { X } from "@lucide/vue";
defineProps({ title: String, wide: Boolean });
const emit = defineEmits(["close"]);
const dialog = ref(null);
onMounted(() => dialog.value.showModal());
</script>

<template>
  <dialog
    ref="dialog"
    class="app-dialog"
    :class="{ wide }"
    aria-labelledby="dialog-title"
    @cancel.prevent="emit('close')"
    @click="(event) => event.target === dialog && emit('close')"
  >
    <header class="dialog-header">
      <h2 id="dialog-title">{{ title }}</h2>
      <button
        class="icon-button"
        aria-label="Закрыть окно"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>
    </header>
    <div class="dialog-content"><slot /></div>
  </dialog>
</template>

<style scoped>
.app-dialog {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg);
  color: var(--text);
  padding: 0;
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  margin: auto;
  box-shadow: 0 24px 100px #0007;
}
.app-dialog.wide {
  width: min(1000px, calc(100vw - 32px));
}
.app-dialog::backdrop {
  background: #071624bc;
  backdrop-filter: blur(4px);
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line);
}
.dialog-header h2 {
  font-size: 19px;
  margin: 0;
}
.dialog-content {
  padding: 24px;
}
@media (max-width: 600px) {
  .dialog-header,
  .dialog-content {
    padding: 18px;
  }
}
</style>
