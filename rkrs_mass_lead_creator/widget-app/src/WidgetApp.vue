<script setup>
import { onBeforeUnmount, provide, ref, shallowRef } from "vue";
import ContactTable from "./components/ContactTable.vue";
import DealDialog from "./components/DealDialog.vue";
import DemoPanel from "./components/DemoPanel.vue";
import WizardDialog from "./components/WizardDialog.vue";

const props = defineProps({
  controller: { type: Object, required: true },
  settingsOnly: { type: Boolean, default: false },
});
const snapshot = shallowRef(props.controller.getSnapshot());
const demoOpen = ref(false);
const stop = props.controller.subscribe((next) => {
  snapshot.value = next;
});
provide("mlc", { controller: props.controller, snapshot });
onBeforeUnmount(stop);
</script>

<template>
  <div v-if="settingsOnly" class="app settings-only">
    <h2>Массовое создание сделок</h2>
    <span class="demo-flag">ДЕМО</span>
    <p>Прототип не подключает amoCRM, OAuth и оплату. Сделки и задачи появляются только в этом браузере.</p>
    <p>
      Квота на {{ snapshot.quota.dayLabel }}:
      <template v-if="snapshot.quota.unlimited">безлимитный деморежим, предел 250 выключен.</template>
      <template v-else>использовано {{ snapshot.quota.used }}, осталось {{ snapshot.quota.remaining }} из {{ snapshot.quota.limit }}.</template>
    </p>
    <p class="hint">Списание квоты — по успешно созданным сделкам за локальный день кабинета. Это допущение демо.</p>
  </div>
  <div v-else class="app">
    <section class="panel" aria-label="Массовое создание сделок">
      <header class="top">
        <div>
          <div class="title">
            <h1>Массовое создание сделок</h1>
            <span class="badge">ДЕМО</span>
          </div>
          <p class="hint">Список контактов. Создание сделок и задач имитируется локально.</p>
        </div>
        <div class="quota">
          <strong v-if="snapshot.quota.unlimited">Безлимитный деморежим</strong>
          <strong v-else>
            Сегодня использовано {{ snapshot.quota.used }}, осталось {{ snapshot.quota.remaining }} из {{ snapshot.quota.limit }}
          </strong>
          <span>Квота кабинета за {{ snapshot.quota.dayLabel }}. Это не лимит задач менеджера и не оплата.</span>
          <button type="button" class="text-btn" @click="demoOpen = !demoOpen">{{ demoOpen ? "Скрыть демо" : "Демо" }}</button>
        </div>
      </header>
      <DemoPanel v-if="demoOpen" />
      <div v-if="snapshot.view === 'loading'" class="state loading" role="status">Загружаем контакты…</div>
      <div v-else-if="snapshot.view === 'error'" class="state error" role="alert">
        <h2>Не удалось загрузить контакты</h2>
        <p>Список недоступен. Создание не запускалось, пустая партия успехом не считается.</p>
        <button type="button" class="btn" @click="controller.retryLoad()">Повторить</button>
      </div>
      <template v-else>
        <div class="filters">
          <label class="field grow">
            <span>Поиск</span>
            <input
              type="search"
              :value="snapshot.filters.query"
              placeholder="Имя, телефон, компания"
              aria-label="Поиск контактов"
              @input="controller.setQuery($event.target.value)"
            />
          </label>
          <label class="field">
            <span>Тег</span>
            <select :value="snapshot.filters.tag" aria-label="Фильтр по тегу" @change="controller.setFilterTag($event.target.value)">
              <option value="">Все теги</option>
              <option v-for="tag in snapshot.filters.tags" :key="tag" :value="tag">{{ tag }}</option>
            </select>
          </label>
          <label class="field">
            <span>Источник</span>
            <select :value="snapshot.filters.source" aria-label="Фильтр по источнику" @change="controller.setFilterSource($event.target.value)">
              <option value="">Все источники</option>
              <option v-for="source in snapshot.filters.sources" :key="source" :value="source">{{ source }}</option>
            </select>
          </label>
          <label class="field">
            <span>Открытая сделка</span>
            <select :value="snapshot.filters.deal" aria-label="Фильтр по открытой сделке" @change="controller.setFilterDeal($event.target.value)">
              <option value="any">Неважно</option>
              <option value="yes">Есть</option>
              <option value="no">Нет</option>
            </select>
          </label>
        </div>
        <p v-if="snapshot.batchFilterId" class="banner">
          Показана партия в списке контактов. Это не отмена созданных сделок.
          <button type="button" class="text-btn" @click="controller.clearBatchFilter()">Показать все контакты</button>
          <button type="button" class="text-btn" @click="controller.openBatchResult(snapshot.batchFilterId)">Открыть результат</button>
        </p>
        <div v-if="snapshot.view === 'empty'" class="state empty" role="status">
          <h2>Контактов не найдено</h2>
          <p>Фильтр ничего не вернул. Это пустой список, а не успешное создание сделок.</p>
        </div>
        <template v-else>
          <p v-if="snapshot.allFilteredSelected && snapshot.filteredCount > snapshot.pageSize" class="banner">
            Выбраны все {{ snapshot.filteredCount }} контактов по фильтру, а не только {{ snapshot.pageRows.length }} на этой странице.
            Перелистывание не сокращает выбор.
          </p>
          <p v-else-if="snapshot.selectionLargerThanPage" class="banner">
            Выбрано {{ snapshot.selectedCount }}. Это больше, чем строки на текущей странице. Пагинация не сокращает выбор.
          </p>
          <div class="filters">
            <button type="button" class="btn" :disabled="!snapshot.filteredCount" @click="controller.selectAllFiltered()">
              Выбрать все {{ snapshot.filteredCount }} по фильтру
            </button>
            <span class="hint">По {{ snapshot.pageSize }} на странице. «Выбрать страницу» — это флажок в таблице.</span>
          </div>
          <ContactTable />
          <div class="pager">
            <button type="button" class="btn" :disabled="snapshot.page <= 1" @click="controller.setPage(snapshot.page - 1)">
              Назад
            </button>
            <span>Страница {{ snapshot.page }} из {{ snapshot.pageCount }} · найдено {{ snapshot.filteredCount }}</span>
            <button
              type="button"
              class="btn"
              :disabled="snapshot.page >= snapshot.pageCount"
              @click="controller.setPage(snapshot.page + 1)"
            >
              Дальше
            </button>
          </div>
        </template>
        <div v-if="snapshot.selectedCount" class="mass" aria-live="polite">
          <strong>Выбрано {{ snapshot.selectedCount }}</strong>
          <span>
            <button type="button" class="btn-primary" @click="controller.openWizard()">Создать сделки</button>
            <button type="button" class="btn" @click="controller.clearSelection()">Снять выбор</button>
          </span>
        </div>
      </template>
    </section>
    <WizardDialog />
    <DealDialog />
  </div>
</template>
