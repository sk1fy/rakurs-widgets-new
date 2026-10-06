<script setup>
import { formatMoney } from "../time.js";
import StatusBadge from "./StatusBadge.vue";

defineProps({
  snapshot: { type: Object, required: true },
  controller: { type: Object, required: true },
});
</script>

<template>
  <div v-if="snapshot.viewMode === 'loading'" class="stack" role="status">
    <div class="skeleton"></div>
    <p>Загрузка доски…</p>
  </div>
  <div v-else-if="snapshot.viewMode === 'error'" class="state state-error" role="alert">
    <h2>Доска не построена</h2>
    <p>Данные сценария повреждены. Маркеры SLA не подменяются благополучными нулями.</p>
  </div>
  <div v-else-if="snapshot.settingsErrors.length" class="state state-error" role="alert">
    <p v-for="error in snapshot.settingsErrors" :key="error">{{ error }}</p>
  </div>
  <div v-else-if="!snapshot.kanban.length" class="state">
    <h2>Нет сделок на доске</h2>
    <p>Контролируемых карточек нет. Смена вкладки не запускает новый отсчёт.</p>
  </div>
  <div v-else class="board">
    <p class="caption">Компактная доска двух воронок. Маркер берётся из того же состояния, что и отчёт.</p>
    <section v-for="pipeline in snapshot.kanban" :key="pipeline.id">
      <h3 style="margin-bottom: 8px">{{ pipeline.name }}</h3>
      <div class="stages">
        <div v-for="stage in pipeline.stages" :key="stage.id" class="stage">
          <h3>{{ stage.name }} <span class="fine">{{ stage.deals.length }}</span></h3>
          <p v-if="!stage.deals.length" class="fine">Пусто</p>
          <button
            v-for="deal in stage.deals"
            :key="deal.id"
            type="button"
            class="deal"
            @click="controller.openDeal(deal.id)"
          >
            <b>{{ deal.title }}</b>
            <span class="fine">{{ deal.managerName }} · {{ formatMoney(deal.budget) }}</span>
            <StatusBadge :status="deal.status" :muted="deal.suppressHighlight" />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
