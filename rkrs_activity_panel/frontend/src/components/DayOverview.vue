<script setup>
import { computed } from "vue";
import { Inbox, UsersRound } from "@lucide/vue";
import DayDepartment from "./DayDepartment.vue";

const props = defineProps({
  employees: { type: Array, default: () => [] },
  date: { type: String, required: true },
  isDemo: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  showComparisons: { type: Boolean, default: true },
});
const emit = defineEmits(["select-employee"]);
const formattedDate = computed(() => {
  const value = new Date(`${props.date}T12:00:00`);
  return Number.isNaN(value.getTime())
    ? props.date
    : value.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
});
const groups = computed(() => {
  const result = new Map();
  for (const employee of props.employees) {
    const name = employee.groupName || "Без группы";
    const id = String(employee.groupId ?? name);
    if (!result.has(id)) result.set(id, { id, name, employees: [] });
    result.get(id).employees.push(employee);
  }
  return [...result.values()];
});
</script>

<template>
  <section
    class="day-overview"
    :aria-label="`Активность сотрудников за ${formattedDate}`"
    :aria-busy="loading"
  >
    <div v-if="loading" class="loading-state surface" role="status">
      <div class="loading-caption">
        <span class="loading-dot" />Загружаем активность за {{ formattedDate }}…
      </div>
      <div
        v-for="index in 3"
        :key="index"
        class="skeleton-card"
        aria-hidden="true"
      >
        <div class="skeleton-line" />
        <div class="skeleton-track" />
      </div>
    </div>
    <div v-else-if="!employees.length" class="empty-state day-empty">
      <UsersRound :size="32" aria-hidden="true" />
      <h3>Выберите сотрудников</h3>
      <p>Отметьте сотрудников в списке, чтобы увидеть их активность за день.</p>
    </div>
    <div v-show="!loading">
      <DayDepartment
        v-for="group in groups"
        :key="group.id"
        :group="group"
        :show-comparisons="showComparisons"
        @select-employee="emit('select-employee', $event)"
      />
      <p v-if="employees.length" class="comparison-note">
        <Inbox :size="13" aria-hidden="true" /><span
          ><template v-if="showComparisons"
            >Показатели: выбранный день / предыдущий день. </template
          >«—» — нет данных.<template v-if="isDemo">
            Демо-данные.</template
          ></span
        >
      </p>
    </div>
  </section>
</template>

<style scoped>
.day-overview {
  min-width: 0;
}
.comparison-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--subtle);
  margin: 13px 2px 0;
  font-size: 11px;
  line-height: 1.5;
}
.day-empty {
  min-height: 300px;
  background: var(--inset);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 45px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.day-empty > svg {
  color: var(--subtle);
}
.day-empty h3 {
  margin: 0;
  font-weight: 600;
  font-size: 17px;
}
.day-empty p {
  max-width: 340px;
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.day-empty button {
  margin-top: 5px;
}
.loading-state {
  padding: 18px;
  background: var(--inset);
  border-radius: 8px;
}
.loading-caption {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 18px;
}
.loading-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
.skeleton-card {
  padding: 20px 16px;
  background: var(--card);
  border-radius: 7px;
  margin-top: 12px;
}
.skeleton-line,
.skeleton-track {
  background: var(--line);
  border-radius: 3px;
  height: 15px;
}
.skeleton-line {
  width: 60%;
  margin-bottom: 18px;
}
.skeleton-track {
  height: 30px;
}
</style>
