<script setup>
defineProps({ controller: Object, snapshot: Object });
</script>
<template>
  <div class="rkrs-settings-content">
    <p class="rkrs-help">
      Настройки этой демонстрации сохраняются в текущем браузере.
    </p>
    <label class="rkrs-setting-row">
      <span
        ><strong>Компактная панель</strong
        ><small>Меньше отступов, больше места для CRM</small></span
      >
      <input
        type="checkbox"
        :checked="snapshot.settings.compact"
        @change="controller.updateSettings({ compact: $event.target.checked })"
      />
    </label>
    <div class="rkrs-setting-info">
      <span class="rkrs-status-dot"></span
      ><span
        >Демонстрационный режим<small
          >Задачи и время локальные. Данные amoCRM не изменяются.</small
        ></span
      >
    </div>
    <button class="rkrs-reset" type="button" @click="controller.reset()">
      Сбросить таймер, историю и демозадачи
    </button>
  </div>
</template>
