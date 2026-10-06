<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Bell, ChevronDown, LayoutGrid, Settings, Users, CheckSquare } from "@lucide/vue";

const page = ref("leads");
const slot = ref(null);
const loading = ref(true);
const error = ref("");
let widget;
let cancelMountWait;
let disposed = false;
let mountGeneration = 0;

const pages = [
  { id: "leads", name: "Сделки", icon: LayoutGrid },
  { id: "contacts", name: "Контакты", icon: Users },
  { id: "tasks", name: "Задачи", icon: CheckSquare },
];

function waitForPanel() {
  cancelMountWait?.();
  return new Promise((resolve) => {
    const finish = (success) => {
      observer.disconnect();
      clearTimeout(timeout);
      cancelMountWait = null;
      resolve(success);
    };
    const observer = new MutationObserver(() => {
      if (slot.value?.querySelector('[data-rkrs-prototype-surface="panel"]')) finish(true);
    });
    const timeout = setTimeout(() => finish(false), 17000);
    cancelMountWait = () => finish(false);
    observer.observe(slot.value, { childList: true, subtree: true });
    if (slot.value.querySelector('[data-rkrs-prototype-surface="panel"]')) finish(true);
  });
}

async function start() {
  if (!widget || disposed || !slot.value) return;
  const generation = ++mountGeneration;
  error.value = "";
  loading.value = true;
  widget.callbacks.init();
  widget.callbacks.render();
  const mounted = await waitForPanel();
  if (disposed || generation !== mountGeneration) return;
  loading.value = false;
  if (!mounted) error.value = "Не удалось загрузить прототип SLA. Нажмите «Повторить».";
}

function navigate(id) {
  page.value = id;
}

function openSettings() {
  widget?.callbacks.settings(null);
}

onMounted(() => {
  window.AMOCRM = {
    constant: (name) =>
      ({
        account: { id: 999101, subdomain: "demo" },
        user: { id: 999102, name: "Демо" },
        user_rights: { is_admin: true },
      })[name],
    widgets: { system: { area: "llist" } },
  };
  window.APP = window.AMOCRM;
  window.requirejs.config({
    paths: { "sla-prototype-loader": "/widget-assets/widget-loader" },
    waitSeconds: 20,
  });
  window.requirejs(
    ["sla-prototype-loader"],
    (Constructor) => {
      if (disposed) return;
      widget = new Constructor();
      widget.get_settings = () => ({
        widget_code: "rkrs_sla_first_touch",
        version: "0.1.0",
        path: "/widget-assets",
      });
      start();
    },
    () => {
      if (disposed) return;
      loading.value = false;
      error.value = "Не найден загрузчик. Выполните npm run release и обновите страницу.";
    }
  );
});

onBeforeUnmount(() => {
  disposed = true;
  mountGeneration += 1;
  cancelMountWait?.();
  widget?.callbacks.destroy();
});
</script>

<template>
  <div class="crm-preview">
    <aside class="crm-nav" aria-label="Разделы демонстрационной CRM">
      <span class="crm-logo" title="Демонстрационная CRM">a<span>•</span></span>
      <button
        v-for="item in pages"
        :key="item.id"
        type="button"
        :class="{ active: page === item.id }"
        :aria-label="item.name"
        @click="navigate(item.id)"
      >
        <component :is="item.icon" :size="22" /><span>{{ item.name }}</span>
      </button>
      <div class="crm-nav-spacer"></div>
      <button type="button" aria-label="Настройки виджета" @click="openSettings">
        <Settings :size="22" />
      </button>
      <span class="crm-user">ДК</span>
    </aside>
    <div class="crm-main">
      <header class="crm-header">
        <div class="crm-breadcrumb">
          Рабочее пространство <span>/</span> {{ pages.find((item) => item.id === page).name }}
          <span>/</span> SLA
        </div>
        <div class="crm-header-right">
          <span class="preview-tag">ДЕМО</span>
          <span class="crm-notifications"><Bell :size="19" /><i></i></span>
          <span class="crm-account">Демо <ChevronDown :size="13" /></span>
        </div>
      </header>
      <main class="crm-workspace">
        <div class="preview-caption">
          <span class="rakurs-label">Rakurs</span>
          <span class="caption-divider"></span>
          <span>SLA: контроль первого касания <span class="caption-sub">/ локальный прототип</span></span>
        </div>
        <div v-if="loading" class="panel-status" role="status">Загружаем прототип SLA…</div>
        <div v-if="error" class="panel-error" role="alert">
          <span>{{ error }}</span>
          <button type="button" @click="start">Повторить</button>
        </div>
        <div ref="slot" data-rkrs-sla-slot></div>
      </main>
    </div>
  </div>
</template>
