<script setup>
import { inject, onMounted, ref, watch } from "vue";

const { controller, snapshot } = inject("mlc");
const box = ref(null);

function syncBox() {
  if (!box.value) return;
  box.value.indeterminate = snapshot.value.pageSomeSelected && !snapshot.value.pageAllSelected;
}
onMounted(syncBox);
watch(() => [snapshot.value.pageAllSelected, snapshot.value.pageSomeSelected, snapshot.value.page], syncBox);
</script>

<template>
  <div class="table-scroll">
    <table class="grid">
      <caption class="caption">
        Колонка «Открытая сделка» только предупреждает. Такие контакты не исключаются сами: дедупликации нет.
      </caption>
      <thead>
        <tr>
          <th>
            <input
              ref="box"
              type="checkbox"
              :checked="snapshot.pageAllSelected"
              aria-label="Выбрать контакты на этой странице"
              @change="controller.togglePage()"
            />
          </th>
          <th>Имя</th>
          <th>Телефон</th>
          <th>Компания</th>
          <th>Теги</th>
          <th>Источник</th>
          <th>Открытая сделка</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in snapshot.pageRows" :key="row.id">
          <td>
            <input
              type="checkbox"
              :checked="row.selected"
              :aria-label="`Выбрать ${row.name}`"
              @change="controller.toggleContact(row.id)"
            />
          </td>
          <td>{{ row.name }}</td>
          <td>
            <template v-if="row.phones.length">{{ row.phones.join(", ") }}</template>
            <span v-else class="deal-yes">нет телефона</span>
          </td>
          <td>{{ row.company }}</td>
          <td>
            <span class="tags"><span v-for="tag in row.tags" :key="tag" class="tag">{{ tag }}</span></span>
          </td>
          <td>{{ row.source }}</td>
          <td>
            <span :class="row.hasActiveDeal ? 'deal-yes' : 'deal-no'">
              {{ row.hasActiveDeal ? "Есть открытая" : "Нет" }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
