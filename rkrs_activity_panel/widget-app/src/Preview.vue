<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  CheckSquare,
  LayoutGrid,
  MessageCircle,
  Settings,
  Search,
  ChevronDown,
  Phone,
  Mail,
  Video,
  ArrowUpRight,
  RefreshCw,
  Power,
  Info,
  Bell,
  Plus,
  MoreHorizontal,
  Filter,
  Check,
} from "@lucide/vue";
import { demoTasks, demoDialogs } from "./demo-data.js";

const page = ref("tasks");
const slot = ref(null);
const settingsDialog = ref(null);
const settingsTarget = ref(null);
const loading = ref(true);
const enabled = ref(true);
const error = ref("");
const search = ref("");
const previewState = ref(null);
const tasks = computed(() => previewState.value?.tasks || demoTasks);
const receiveState = (event) => {
  previewState.value = event.detail;
};
const activeDialog = ref(demoDialogs[0]);
const toast = ref("");
let widget;
let toastTimer;
let cancelMountWait;
let disposed = false;
let mountGeneration = 0;
const taskIcons = { call: Phone, meeting: Video, email: Mail };
const filteredTasks = computed(() =>
  tasks.value.filter((task) =>
    `${task.title} ${task.entityName}`
      .toLowerCase()
      .includes(search.value.toLowerCase())
  )
);
const pages = [
  { id: "leads", name: "Сделки", icon: LayoutGrid },
  { id: "tasks", name: "Задачи", icon: CheckSquare },
  { id: "imbox", name: "Чаты", icon: MessageCircle },
];

function notify(message) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 3500);
}
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
      if (slot.value?.querySelector('[data-rkrs-prototype-surface="panel"]'))
        finish(true);
    });
    const timeout = setTimeout(() => finish(false), 17000);
    cancelMountWait = () => finish(false);
    observer.observe(slot.value, { childList: true });
    if (slot.value.querySelector('[data-rkrs-prototype-surface="panel"]'))
      finish(true);
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
  if (!mounted && enabled.value)
    error.value = "Не удалось загрузить панель. Нажмите «Повторить».";
}
function togglePanel() {
  if (enabled.value) {
    mountGeneration++;
    enabled.value = false;
    loading.value = false;
    cancelMountWait?.();
    widget?.callbacks.destroy();
  } else start();
}
function rerender() {
  if (!enabled.value) return;
  widget?.callbacks.render();
  notify("Панель обновлена");
}
function navigate(id) {
  page.value = id;
  window.AMOCRM.widgets.system.area =
    id === "imbox" ? "imbox" : id === "leads" ? "llist" : "tlist";
  if (enabled.value) widget?.callbacks.render();
}
function action(type, id) {
  if (!enabled.value || loading.value) {
    notify("Сначала включите панель активности");
    return;
  }
  slot.value.dispatchEvent(
    new CustomEvent("rkrs-activity-demo-action", { detail: { type, id } })
  );
}
function openSettings() {
  if (!widget || !enabled.value) {
    notify("Сначала включите панель активности");
    return;
  }
  settingsDialog.value.showModal();
  widget.callbacks.settings(settingsTarget.value);
}

onMounted(() => {
  slot.value.addEventListener("rkrs-activity-demo-state", receiveState);
  window.AMOCRM = {
    constant: (name) =>
      ({
        account: { id: 999001, subdomain: "demo" },
        user: { id: 999002, name: "Александр" },
        user_rights: { is_admin: true },
      }[name]),
    widgets: { system: { area: "tlist" } },
  };
  window.APP = window.AMOCRM;
  window.requirejs.config({
    paths: { "activity-prototype-loader": "/widget-assets/widget-loader" },
    waitSeconds: 20,
  });
  window.requirejs(
    ["activity-prototype-loader"],
    (Constructor) => {
      if (disposed) return;
      widget = new Constructor();
      widget.get_settings = () => ({
        widget_code: "rkrs_activity_prototype",
        version: "0.1.0",
        path: "/widget-assets",
      });
      start();
    },
    () => {
      if (disposed) return;
      loading.value = false;
      error.value =
        "Не найден загрузчик. Выполните npm run release и обновите страницу.";
    }
  );
});
onBeforeUnmount(() => {
  slot.value?.removeEventListener("rkrs-activity-demo-state", receiveState);
  disposed = true;
  mountGeneration++;
  cancelMountWait?.();
  clearTimeout(toastTimer);
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
        :class="{ active: page === item.id }"
        :aria-label="item.name"
        @click="navigate(item.id)"
      >
        <component :is="item.icon" :size="22" /><span>{{ item.name }}</span>
      </button>
      <div class="crm-nav-spacer"></div>
      <button aria-label="Настройки виджета" @click="openSettings">
        <Settings :size="22" /></button
      ><span class="crm-user">АИ</span>
    </aside>
    <div class="crm-main">
      <div class="widget-slot-wrap">
        <div ref="slot" data-rkrs-activity-panel-slot></div>
        <div v-if="loading" class="panel-status" role="status">
          Загружаем панель активности…
        </div>
        <div v-if="!enabled" class="panel-status">
          <span>Панель активности скрыта</span
          ><button @click="togglePanel">Показать панель</button>
        </div>
        <div v-if="error" class="panel-error" role="alert">
          {{ error }}<button @click="start">Повторить</button>
        </div>
      </div>
      <header class="crm-header">
        <div class="crm-breadcrumb">
          Рабочее пространство <span>/</span>
          {{ pages.find((item) => item.id === page).name }}
        </div>
        <div class="crm-header-right">
          <span class="preview-tag">ДЕМО</span
          ><span class="crm-notifications"><Bell :size="19" /><i></i></span
          ><span class="crm-account">Александр <ChevronDown :size="13" /></span>
        </div>
      </header>
      <main class="crm-workspace">
        <div class="preview-caption">
          <span class="rakurs-label">Rakurs</span
          ><span class="caption-divider"></span
          ><span
            >Контроль активности
            <span class="caption-sub">/ прототип виджета</span></span
          >
          <div class="preview-actions">
            <button
              :disabled="loading || !enabled"
              @click="rerender"
              aria-label="Обновить панель"
              title="Повторно отрисовать панель"
            >
              <RefreshCw :size="14" /><span>Обновить панель</span></button
            ><button
              @click="togglePanel"
              :aria-label="enabled ? 'Скрыть панель' : 'Показать панель'"
            >
              <Power :size="14" /><span>{{
                enabled ? "Скрыть" : "Показать"
              }}</span>
            </button>
          </div>
        </div>

        <template v-if="page === 'tasks'">
          <div class="workspace-heading">
            <div>
              <span class="workspace-eyebrow">МОЯ РАБОТА</span>
              <h1>
                Задачи <span>{{ demoTasks.length }}</span>
              </h1>
            </div>
            <button
              class="crm-primary"
              @click="notify('В прототипе используются готовые примеры задач')"
            >
              <Plus :size="17" />Новая задача
            </button>
          </div>
          <div class="crm-toolbar">
            <div class="crm-view-tabs">
              <span class="selected">Список</span><span>Сегодня</span
              ><span>Все задачи</span>
            </div>
            <label class="crm-search"
              ><Search :size="16" /><input
                v-model="search"
                placeholder="Поиск по задачам"
                aria-label="Поиск по задачам" /></label
            ><span class="crm-owner-filter"
              ><Filter :size="15" />Мои задачи</span
            >
          </div>
          <section class="crm-task-list" aria-label="Демонстрационные задачи">
            <div class="task-table-head">
              <span>ЗАДАЧА</span><span>СДЕЛКА</span><span>СРОК</span
              ><span></span>
            </div>
            <article
              v-for="task in filteredTasks"
              :key="task.id"
              class="crm-task-row"
              :class="{ completed: task.completed }"
            >
              <div class="task-name-cell">
                <span class="task-checkbox"
                  ><Check v-if="task.completed" :size="12" /></span
                ><span class="task-type-icon" :class="task.type"
                  ><component :is="taskIcons[task.type]" :size="17"
                /></span>
                <div>
                  <strong>{{ task.title }}</strong
                  ><small
                    >{{
                      task.type === "call"
                        ? "Звонок"
                        : task.type === "meeting"
                        ? "Встреча"
                        : "Письмо"
                    }}
                    · Александр Иванов</small
                  >
                </div>
              </div>
              <div class="crm-entity">
                {{ task.entityName }}<span>Основная воронка</span>
              </div>
              <span class="crm-due" :class="{ overdue: task.overdue }"
                >{{ task.dueLabel
                }}<small v-if="task.overdue">Просрочено</small></span
              ><button
                class="task-start"
                :disabled="task.completed"
                :aria-label="`Начать задачу: ${task.title}`"
                @click="action('task', task.id)"
              >
                {{ task.completed ? "Готово" : "Начать" }}
                <ArrowUpRight :size="14" />
              </button>
            </article>
            <p v-if="!filteredTasks.length" class="crm-empty">
              Задачи не найдены
            </p>
          </section>
          <div class="preview-hint">
            <span class="hint-icon"><Check :size="18" /></span>
            <div>
              <strong>Одна задача — один фокус</strong>
              <p>
                Начните задачу из списка или очереди в верхней панели.
                Переключайтесь между работой с клиентами, чатами и другими
                активностями.
              </p>
            </div>
          </div>
        </template>

        <template v-else-if="page === 'leads'">
          <div class="workspace-heading">
            <div>
              <span class="workspace-eyebrow">ПРОДАЖИ</span>
              <h1>Сделки <span>Основная воронка</span></h1>
            </div>
          </div>
          <div class="crm-board">
            <section
              v-for="(stage, index) in [
                'Первичный контакт',
                'Согласование',
                'Предложение',
              ]"
              :key="stage"
              class="crm-stage"
            >
              <h2>
                <i
                  :style="{
                    background: ['#54a3ee', '#a093dc', '#65ba9b'][index],
                  }"
                ></i
                >{{ stage }} <small>{{ index === 0 ? 2 : 1 }}</small>
              </h2>
              <article
                v-for="task in tasks.filter((_, i) => i % 3 === index)"
                :key="task.id"
                class="crm-deal"
              >
                <div class="deal-top">
                  <strong>{{ task.entityName.split(" · ")[0] }}</strong
                  ><MoreHorizontal :size="18" />
                </div>
                <p>{{ task.entityName.split(" · ")[1] }}</p>
                <div class="deal-owner">
                  <span class="small-user">АИ</span>Александр Иванов
                </div>
                <button
                  :disabled="task.completed"
                  @click="action('task', task.id)"
                >
                  <component :is="taskIcons[task.type]" :size="15" />{{
                    task.title
                  }}<ArrowUpRight :size="13" />
                </button>
              </article>
            </section>
          </div>
        </template>

        <template v-else>
          <div class="workspace-heading">
            <div>
              <span class="workspace-eyebrow">IMBOX</span>
              <h1>Сообщения <span>3 диалога</span></h1>
            </div>
          </div>
          <div class="crm-chat">
            <aside class="chat-list">
              <button
                v-for="dialog in demoDialogs"
                :key="dialog.id"
                :class="{ selected: activeDialog.id === dialog.id }"
                @click="activeDialog = dialog"
              >
                <span class="chat-avatar">{{ dialog.name[0] }}</span
                ><span
                  ><strong>{{ dialog.name }}</strong
                  ><small>{{ dialog.preview }}</small></span
                ><i></i>
              </button>
            </aside>
            <section class="chat-conversation">
              <header>
                <span class="chat-avatar">{{ activeDialog.name[0] }}</span>
                <div>
                  <strong>{{ activeDialog.name }}</strong
                  ><small>{{ activeDialog.channel }} · клиент</small>
                </div>
                <button
                  class="task-start"
                  @click="action('imbox', activeDialog.id)"
                >
                  Начать активность <ArrowUpRight :size="14" />
                </button>
              </header>
              <div class="messages">
                <span class="chat-day">Сегодня</span>
                <div class="chat-message">
                  <span>{{ activeDialog.preview }}</span
                  ><small>14:32</small>
                </div>
                <div class="chat-placeholder">
                  Демонстрационный диалог. Сообщения не отправляются.
                </div>
              </div>
              <div class="chat-composer">
                <span>Ответить клиенту…</span
                ><span class="demo-composer-label">Демо</span>
              </div>
            </section>
          </div>
        </template>
        <footer class="prototype-footer">
          <Info :size="14" /><span
            >Демонстрационная CRM. Действия и время сохраняются только в этом
            браузере и не изменяют реальные задачи.</span
          ><button @click="openSettings">Настройки виджета</button>
        </footer>
      </main>
    </div>
    <dialog
      ref="settingsDialog"
      class="preview-settings-dialog"
      aria-label="Настройки виджета"
    >
      <button
        class="dialog-close"
        @click="settingsDialog.close()"
        aria-label="Закрыть настройки"
      >
        ×
      </button>
      <div ref="settingsTarget"></div>
    </dialog>
    <div v-if="toast" class="preview-toast" role="status">{{ toast }}</div>
  </div>
</template>
