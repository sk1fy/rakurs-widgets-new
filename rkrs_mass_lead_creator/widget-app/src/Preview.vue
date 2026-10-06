<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Bell, CheckSquare, ChevronDown, Info, LayoutGrid, RefreshCw, Settings, Users } from "@lucide/vue";

const page = ref("contacts");
const slot = ref(null);
const settingsDialog = ref(null);
const settingsTarget = ref(null);
const loading = ref(true);
const enabled = ref(true);
const error = ref("");
const previewState = ref({ deals: [], tasks: [] });
let widget;
let disposed = false;
let mountGeneration = 0;
let cancelMountWait;
const pages = [
  { id: "contacts", name: "Контакты", icon: Users },
  { id: "leads", name: "Сделки", icon: LayoutGrid },
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
  enabled.value = true;
  widget.callbacks.init();
  widget.callbacks.render();
  const mounted = await waitForPanel();
  if (disposed || generation !== mountGeneration) return;
  loading.value = false;
  if (!mounted && enabled.value) error.value = "Не удалось загрузить виджет. Нажмите «Повторить».";
}
function togglePanel() {
  if (enabled.value) {
    mountGeneration += 1;
    enabled.value = false;
    loading.value = false;
    cancelMountWait?.();
    widget?.callbacks.destroy();
  } else start();
}
function rerender() {
  if (!enabled.value) return;
  widget?.callbacks.render();
}
function navigate(id) {
  page.value = id;
}
function openSettings() {
  if (!widget || !enabled.value) return;
  settingsDialog.value.showModal();
  widget.callbacks.settings(settingsTarget.value);
}
function receiveState(event) {
  previewState.value = event.detail;
}

onMounted(() => {
  slot.value.addEventListener("rkrs-mass-leads-demo-state", receiveState);
  window.AMOCRM = {
    constant: (name) =>
      ({
        account: { id: 999201, subdomain: "demo" },
        user: { id: 999202, name: "Марина" },
        user_rights: { is_admin: true },
      })[name],
    widgets: { system: { area: "clist" } },
  };
  window.APP = window.AMOCRM;
  window.requirejs.config({
    paths: { "mass-leads-prototype-loader": "/widget-assets/widget-loader" },
    waitSeconds: 20,
  });
  window.requirejs(
    ["mass-leads-prototype-loader"],
    (Constructor) => {
      if (disposed) return;
      widget = new Constructor();
      widget.get_settings = () => ({
        widget_code: "rkrs_mass_lead_creator",
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
  slot.value?.removeEventListener("rkrs-mass-leads-demo-state", receiveState);
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
      <button type="button" aria-label="Настройки виджета" @click="openSettings"><Settings :size="22" /></button>
      <span class="crm-user">МК</span>
    </aside>
    <div class="crm-main">
      <header class="crm-header">
        <div class="crm-breadcrumb">
          Рабочее пространство <span>/</span> {{ pages.find((item) => item.id === page).name }}
        </div>
        <div class="crm-header-right">
          <span class="preview-tag">ДЕМО</span>
          <span class="crm-notifications"><Bell :size="19" /><i></i></span>
          <span class="crm-account">Марина <ChevronDown :size="13" /></span>
        </div>
      </header>
      <main class="crm-workspace">
        <div class="preview-caption">
          <span class="rakurs-label">Rakurs</span>
          <span class="caption-divider"></span>
          <span>Массовое создание сделок <span class="caption-sub">/ прототип виджета</span></span>
          <div class="preview-actions">
            <button type="button" :disabled="loading || !enabled" @click="rerender">
              <RefreshCw :size="14" /> Обновить виджет
            </button>
            <button type="button" @click="togglePanel">{{ enabled ? "Скрыть" : "Показать" }}</button>
          </div>
        </div>
        <div v-if="loading" class="panel-status" role="status">Загружаем виджет…</div>
        <div v-if="!enabled" class="panel-status">
          <span>Виджет скрыт</span>
          <button type="button" @click="togglePanel">Показать виджет</button>
        </div>
        <div v-if="error" class="panel-error" role="alert">
          {{ error }}
          <button type="button" @click="start">Повторить</button>
        </div>
        <div v-show="page === 'contacts' && enabled" ref="slot" data-rkrs-mass-leads-slot></div>
        <section v-if="page === 'leads'" class="crm-placeholder" aria-label="Локальные сделки">
          <h1>Сделки <span>локальная модель</span></h1>
          <p v-if="!previewState.deals.length">Пока пусто. Сделки появятся после запуска в списке контактов.</p>
          <article v-for="deal in previewState.deals" :key="deal.id">
            <strong>{{ deal.name }}</strong>
            <span>{{ deal.contactName }} · {{ deal.managerName }} · {{ deal.pipelineName }} / {{ deal.stageName }}</span>
          </article>
        </section>
        <section v-if="page === 'tasks'" class="crm-placeholder" aria-label="Локальные задачи">
          <h1>Задачи <span>локальная модель</span></h1>
          <p v-if="!previewState.tasks.length">Задач ещё нет. Они создаются вместе со сделками и остаются в браузере.</p>
          <article v-for="task in previewState.tasks" :key="task.id">
            <strong>{{ task.text }}</strong>
            <span>{{ task.managerName }} · {{ task.day }} · срок {{ task.dueLabel }}</span>
          </article>
        </section>
        <footer class="prototype-footer">
          <Info :size="14" />
          <span>Демонстрационная CRM. Сделки, задачи и квота пишутся только в этот браузер.</span>
          <button type="button" @click="openSettings">Настройки виджета</button>
        </footer>
      </main>
    </div>
    <dialog ref="settingsDialog" class="preview-settings-dialog" aria-label="Настройки виджета">
      <button type="button" class="dialog-close" aria-label="Закрыть настройки" @click="settingsDialog.close()">×</button>
      <div ref="settingsTarget"></div>
    </dialog>
  </div>
</template>
