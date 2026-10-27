<script setup>
defineProps({ controller: Object, snapshot: Object });
</script>
<template>
  <div class="rkrs-settings-content">
    <p class="rkrs-help">
      {{ snapshot.live ? "Личный вид панели" : "Настройки этой демонстрации сохраняются в текущем браузере." }}
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
    <div v-if="!snapshot.live" class="rkrs-setting-info">
      <span class="rkrs-status-dot"></span
      ><span
        >Демонстрационный режим<small
          >Задачи и время локальные. Данные amoCRM не изменяются.</small
        ></span
      >
    </div>
    <template v-if="snapshot.live"><button type="button" class="rkrs-reset" :disabled="snapshot.busy" @click="controller.refresh()">Обновить / повторить запрос</button><button type="button" class="rkrs-reset" :disabled="snapshot.busy || snapshot.ready === false || snapshot.pending || Boolean(snapshot.completion)" @click="controller.openManagement()">Общие настройки аккаунта</button></template>
    <button v-else class="rkrs-reset" type="button" @click="controller.reset()">
      Сбросить таймер, историю и демозадачи
    </button>
  </div>
</template>
