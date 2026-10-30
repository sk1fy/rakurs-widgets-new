<script setup>
import WidgetIcon from "./WidgetIcon.vue";

defineProps({
  task: { type: Object, required: true },
  typeName: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});
defineEmits(["open", "start"]);
</script>

<template>
  <div class="rkrs-q-row">
    <button
      type="button"
      class="rkrs-q-main"
      :title="task.entityName ? `${task.title} — ${task.entityName}` : task.title"
      @click="$emit('open', task)"
    >
      <span class="rkrs-q-top"
        ><span v-if="typeName" class="rkrs-task-type-badge">{{ typeName }}</span
        ><span class="rkrs-q-date"
          >{{ task.dueDate }}<template v-if="task.dueTime">
            <span class="rkrs-q-sep">|</span>
            <span class="rkrs-q-time">{{ task.dueTime }}</span></template
          ></span
        ></span
      ><span class="rkrs-q-name">{{ task.title }}</span>
    </button>
    <button
      type="button"
      class="rkrs-q-play"
      :aria-label="`Начать задачу: ${task.title}`"
      title="Начать задачу"
      :disabled="disabled"
      @click="$emit('start', task)"
    >
      <WidgetIcon name="play" :size="20" />
    </button>
  </div>
</template>
