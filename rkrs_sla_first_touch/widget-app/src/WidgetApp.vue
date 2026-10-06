<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import DealDrawer from "./components/DealDrawer.vue";
import DemoClock from "./components/DemoClock.vue";
import KanbanView from "./components/KanbanView.vue";
import NotificationsView from "./components/NotificationsView.vue";
import ReportView from "./components/ReportView.vue";
import SettingsView from "./components/SettingsView.vue";
import SubscriptionView from "./components/SubscriptionView.vue";

const props = defineProps({
  controller: { type: Object, required: true },
  settingsOnly: { type: Boolean, default: false },
});

const snapshot = ref(props.controller.getSnapshot());
const stop = props.controller.subscribe((next) => {
  snapshot.value = next;
});

const tabs = [
  { id: "report", label: "Отчёт" },
  { id: "pipeline", label: "Воронка" },
  { id: "settings", label: "Настройки" },
  { id: "alerts", label: "Уведомления" },
  { id: "plan", label: "Подписка" },
];

function onKey(event) {
  if (event.key !== "Escape") return;
  if (snapshot.value.popup) props.controller.dismissPopup();
  else if (snapshot.value.drawer) props.controller.closeDeal();
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => {
  stop();
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="sla">
    <SettingsView v-if="settingsOnly" :snapshot="snapshot" :controller="controller" />
    <template v-else>
      <header class="head-row">
        <h2>
          <span>SLA: контроль первого касания <i class="inline-demo">ДЕМО</i></span>
        </h2>
      </header>
      <DemoClock :snapshot="snapshot" :controller="controller" />
      <p v-if="snapshot.notice" class="notice" role="status">{{ snapshot.notice }}</p>
      <div class="tabs" role="tablist" aria-label="Разделы SLA">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="snapshot.tab === tab.id"
          @click="controller.setTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>
      <ReportView v-if="snapshot.tab === 'report'" :snapshot="snapshot" :controller="controller" />
      <KanbanView v-else-if="snapshot.tab === 'pipeline'" :snapshot="snapshot" :controller="controller" />
      <SettingsView v-else-if="snapshot.tab === 'settings'" :snapshot="snapshot" :controller="controller" />
      <NotificationsView v-else-if="snapshot.tab === 'alerts'" :snapshot="snapshot" :controller="controller" />
      <SubscriptionView v-else />
      <DealDrawer :snapshot="snapshot" :controller="controller" />
      <div v-if="snapshot.popup" class="popup" role="dialog" aria-modal="true" aria-labelledby="prealert-title">
        <h2 id="prealert-title">{{ snapshot.popup.title }}</h2>
        <p>{{ snapshot.popup.text }}</p>
        <div class="actions">
          <button type="button" class="btn primary" @click="controller.openFromPopup()">Открыть сделку</button>
          <button type="button" class="btn" @click="controller.dismissPopup()">Закрыть</button>
        </div>
      </div>
    </template>
  </div>
</template>
