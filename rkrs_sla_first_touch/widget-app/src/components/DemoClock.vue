<script setup>
defineProps({
  snapshot: { type: Object, required: true },
  controller: { type: Object, required: true },
});
</script>

<template>
  <section class="demo-bar" aria-label="Демо-часы">
    <span class="demo-badge">ДЕМО</span>
    <p>
      <strong>{{ snapshot.clockLabel }}</strong>
      <span>{{ snapshot.frozen ? "заморожены" : "идут" }} · {{ snapshot.timeZone }}</span>
    </p>
    <button type="button" @click="controller.setFrozen(!snapshot.frozen)">
      {{ snapshot.frozen ? "Продолжить" : "Заморозить" }}
    </button>
    <button type="button" @click="controller.addMinutes(5)">+5 мин</button>
    <button type="button" @click="controller.addMinutes(30)">+30 мин</button>
    <button type="button" @click="controller.addMinutes(60)">+60 мин</button>
    <button type="button" @click="controller.jumpNextWorkingDay()">Следующий рабочий день</button>
    <label>
      Сценарий
      <select :value="snapshot.scenario" @change="controller.setScenario($event.target.value)">
        <option v-for="item in snapshot.scenarios" :key="item.id" :value="item.id">
          {{ item.label }}
        </option>
      </select>
    </label>
    <button type="button" @click="controller.reset()">Сбросить данные</button>
  </section>
  <p class="demo-hint">
    Одни часы питают таймеры, графики, журнал и таблицу. По умолчанию они заморожены.
    Сделка «Клиника Рассвет — лицензионный пакет» ждёт 20 минут: «+5 мин» пересекает порог
    пре-алерта 22 мин 30 с. Прыжок сразу за удвоенный норматив это предупреждение пропускает.
  </p>
</template>
