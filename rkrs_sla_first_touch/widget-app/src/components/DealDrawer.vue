<script setup>
import { ref, watch } from "vue";
import { formatDateTime, formatDuration, formatMoney } from "../time.js";
import StatusBadge from "./StatusBadge.vue";

const props = defineProps({
  snapshot: { type: Object, required: true },
  controller: { type: Object, required: true },
});

const closeBtn = ref(null);
const nextManager = ref("m2");

watch(
  () => [props.snapshot.drawer?.id, props.snapshot.drawer?.managerId],
  () => {
    const current = props.snapshot.drawer?.managerId;
    if (
      !props.snapshot.employees.some(
        (person) => person.id === nextManager.value && person.id !== current
      )
    ) {
      nextManager.value =
        props.snapshot.employees.find((person) => person.id !== current)?.id || "m1";
    }
    requestAnimationFrame(() => closeBtn.value?.focus());
  }
);
</script>

<template>
  <div v-if="snapshot.drawer">
    <button type="button" class="backdrop" aria-label="Закрыть карточку" @click="controller.closeDeal()"></button>
    <aside class="drawer" role="dialog" aria-modal="true" :aria-labelledby="`deal-${snapshot.drawer.id}`">
      <header>
        <h2 :id="`deal-${snapshot.drawer.id}`">{{ snapshot.drawer.title }}</h2>
        <button ref="closeBtn" type="button" class="icon-btn" aria-label="Закрыть" @click="controller.closeDeal()">
          ×
        </button>
      </header>
      <StatusBadge :status="snapshot.drawer.status" :muted="snapshot.drawer.suppressHighlight" />
      <p v-if="snapshot.drawer.suppressHighlight" class="caption">
        Цветная подсветка скрыта настройкой. Рабочее время по-прежнему посчитано.
      </p>
      <p class="timer">{{ formatDuration(snapshot.drawer.elapsedMs) }}</p>
      <p class="fine">
        {{ snapshot.drawer.touch ? `Канал: ${snapshot.drawer.channel}` : "Канал пока не определён" }}
        <template v-if="snapshot.drawer.overrunMs > 0">
          · превышение {{ formatDuration(snapshot.drawer.overrunMs) }}
        </template>
      </p>
      <dl class="fine" style="display: grid; gap: 4px; margin: 12px 0">
        <div>Ответственный: {{ snapshot.drawer.managerName }}</div>
        <div>Воронка: {{ snapshot.drawer.pipelineName }} · {{ snapshot.drawer.stageName }}</div>
        <div>Бюджет: {{ formatMoney(snapshot.drawer.budget) }}</div>
        <div>Назначение эпохи: {{ formatDateTime(snapshot.drawer.assignedAt, snapshot.timeZone) }}</div>
      </dl>
      <p v-if="snapshot.drawer.pauseText" class="hypothesis">{{ snapshot.drawer.pauseText }}</p>
      <p v-if="snapshot.drawer.preAlertSent" class="caption">
        Пре-алерт уже отправлен один раз и не считается первым касанием.
      </p>
      <p v-if="snapshot.drawer.criticalTask" class="caption">
        Есть критическая задача от
        {{ formatDateTime(snapshot.drawer.criticalTask.at, snapshot.timeZone) }}. Это эскалация, не
        первое касание.
      </p>
      <h3>Демодействия</h3>
      <div class="actions">
        <button type="button" class="btn" @click="controller.applyAction(snapshot.drawer.id, 'call')">Звонок 2 мин</button>
        <button type="button" class="btn" @click="controller.applyAction(snapshot.drawer.id, 'call-zero')">Звонок 0 сек</button>
        <button type="button" class="btn" @click="controller.applyAction(snapshot.drawer.id, 'message')">Сообщение</button>
        <button type="button" class="btn" @click="controller.applyAction(snapshot.drawer.id, 'message-in')">Входящее</button>
        <button type="button" class="btn" @click="controller.applyAction(snapshot.drawer.id, 'email')">Письмо</button>
        <button type="button" class="btn" @click="controller.applyAction(snapshot.drawer.id, 'note')">Заметка</button>
      </div>
      <div class="toolbar">
        <label>Переназначить
          <select v-model="nextManager">
            <option
              v-for="person in snapshot.employees.filter((item) => item.id !== snapshot.drawer.managerId)"
              :key="person.id"
              :value="person.id"
            >
              {{ person.name }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="btn"
          @click="controller.applyAction(snapshot.drawer.id, 'reassign', { managerId: nextManager })"
        >
          Переназначить
        </button>
      </div>
      <h3>История учитываемых событий</h3>
      <ul class="timeline">
        <li v-for="(item, index) in snapshot.drawer.timeline" :key="`${item.kind}-${index}`">
          <time>{{ formatDateTime(item.at, snapshot.timeZone) }}</time>
          {{ item.label }}
        </li>
      </ul>
    </aside>
  </div>
</template>
