<script setup>
import { inject, onMounted, ref, watch } from "vue";

const { controller, snapshot } = inject("mlc");
const dialog = ref(null);

function sync(card) {
  const element = dialog.value;
  if (!element) return;
  if (card && !element.open) element.showModal();
  if (!card && element.open) element.close();
}
onMounted(() => sync(snapshot.value.dealCard));
watch(() => snapshot.value.dealCard, sync);
function onCancel(event) {
  event.preventDefault();
  controller.closeDeal();
}
</script>

<template>
  <dialog ref="dialog" class="sheet" aria-label="Локальная карточка сделки" @cancel="onCancel">
    <div v-if="snapshot.dealCard" class="sheet-body">
      <div class="sheet-head">
        <div>
          <span class="demo-flag">ДЕМО</span>
          <h2>{{ snapshot.dealCard.name }}</h2>
          <p class="hint">Локальная карточка. В amoCRM ничего не записано.</p>
        </div>
        <button type="button" class="btn" @click="controller.closeDeal()">Закрыть</button>
      </div>
      <p><strong>Контакт:</strong> {{ snapshot.dealCard.contactName }}, {{ snapshot.dealCard.phone }}</p>
      <p><strong>Компания:</strong> {{ snapshot.dealCard.company }}</p>
      <p><strong>Воронка:</strong> {{ snapshot.dealCard.pipelineName }}, этап «{{ snapshot.dealCard.stageName }}»</p>
      <p><strong>Ответственный:</strong> {{ snapshot.dealCard.managerName }}</p>
      <p><strong>Тег:</strong> {{ snapshot.dealCard.tag || "без тега" }}</p>
      <p><strong>Задача:</strong> {{ snapshot.dealCard.taskText }}</p>
      <p v-if="snapshot.dealCard.dueLabel"><strong>Срок:</strong> {{ snapshot.dealCard.dueLabel }}</p>
    </div>
  </dialog>
</template>
