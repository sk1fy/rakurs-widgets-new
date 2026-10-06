<script setup>
import { inject, ref } from "vue";

const { controller, snapshot } = inject("mlc");
const holiday = ref("");
const nowError = ref("");
const days = [
  [1, "Пн"],
  [2, "Вт"],
  [3, "Ср"],
  [4, "Чт"],
  [5, "Пт"],
  [6, "Сб"],
  [7, "Вс"],
];
const scenarios = [
  ["1", "100 контактов и 4 менеджера", "По 25 сделок, лимит 25, один рабочий день."],
  ["2", "100 контактов и 2 менеджера", "По 50 сделок: 25 сегодня и 25 на следующий рабочий день."],
  ["3", "30 задач одному менеджеру", "Окно 09:00–18:00 и короткая длительность: шаг 18 минут."],
  ["4", "Пятница и праздник в понедельник", "Сейчас 2 октября 16:00. Хвост начинается во вторник."],
  ["5", "Фильтр больше одной страницы", "Тег «опт»: план включает всю выборку, не только 20 строк."],
  ["6", "Уже есть открытая сделка", "Предупреждение есть, автоматического исключения нет."],
  ["7", "Квота: осталось 20, выбрано 21", "Запуск закрыт. Часть партии молча не создаётся."],
  ["8", "Телефон, пустой тег и текст", "Нет номера, два номера, пустой тег и пустой текст задачи."],
  ["9", "Частичная ошибка и повтор", "Смешанный результат. Повтор делает только неуспешный шаг."],
];

function changeNow(event) {
  const value = event.target.value.trim();
  nowError.value = controller.setNow(value) ? "" : "Нужна дата в формате ISO, например 2026-10-06T09:00:00+03:00.";
}
function addHoliday() {
  controller.addHoliday(holiday.value);
  holiday.value = "";
}
</script>

<template>
  <section class="demo panel" aria-label="Демо">
    <div class="demo-head">
      <h2>Демо</h2>
      <span class="demo-flag">ДЕМО</span>
    </div>
    <p class="hint">
      Сценарии готовят выборку и локальные сделки заново. Это не отмена в продукте.
      Сброс всего набора — отдельная кнопка ниже. Запись в CRM не выполняется.
    </p>
    <div class="scenarios">
      <button v-for="item in scenarios" :key="item[0]" type="button" class="btn" @click="controller.applyScenario(Number(item[0]))">
        <strong>{{ item[0] }}. {{ item[1] }}</strong>
        <span class="hint">{{ item[2] }}</span>
      </button>
    </div>
    <div class="filters">
      <label class="check">
        <input type="checkbox" :checked="snapshot.quota.unlimited" @change="controller.setUnlimited($event.target.checked)" />
        Безлимитный
      </label>
      <label class="check">
        <input type="checkbox" :checked="snapshot.partialFailure" @change="controller.setPartialFailure($event.target.checked)" />
        Частичный сбой при запуске
      </label>
      <button type="button" class="btn" @click="controller.setForceEmpty(!snapshot.forceEmpty)">
        {{ snapshot.forceEmpty ? "Вернуть контакты" : "Пустой фильтр" }}
      </button>
      <button type="button" class="btn" @click="controller.setForceError(!snapshot.forceError)">
        {{ snapshot.forceError ? "Снять ошибку данных" : "Ошибка данных" }}
      </button>
      <button type="button" class="btn" @click="controller.showLoading()">Показать загрузку</button>
      <button type="button" class="btn" @click="controller.resetDemo()">Сбросить демоданные</button>
    </div>
    <div class="block">
      <h3>График кабинета</h3>
      <p class="hint">
        Это настройки кабинета, а не поля окна создания. Сейчас {{ snapshot.schedule.timezone }}, UTC+3.
        Расчёт идёт в этом смещении. Окно {{ snapshot.schedule.startLabel }}–{{ snapshot.schedule.endLabel }},
        {{ snapshot.schedule.windowMinutes }} минут.
      </p>
      <div class="days">
        <label v-for="day in days" :key="day[0]" class="check">
          <input
            type="checkbox"
            :checked="snapshot.schedule.workingDays.includes(day[0])"
            @change="controller.toggleWorkingDay(day[0])"
          />
          {{ day[1] }}
        </label>
      </div>
      <div class="filters">
        <label class="field">Начало<input type="time" :value="snapshot.schedule.startLabel" @change="controller.setStart($event.target.value)" /></label>
        <label class="field">Конец<input type="time" :value="snapshot.schedule.endLabel" @change="controller.setEnd($event.target.value)" /></label>
        <label class="field grow">
          Замороженное «сейчас»
          <input type="text" :value="snapshot.nowIso" aria-label="Текущий момент демо" @change="changeNow" />
        </label>
      </div>
      <p v-if="nowError" class="banner bad">{{ nowError }}</p>
      <div class="filters">
        <label class="field">Дата-исключение<input v-model="holiday" type="date" aria-label="Праздничная дата" /></label>
        <button type="button" class="btn" @click="addHoliday">Добавить выходной</button>
      </div>
      <p v-if="!snapshot.schedule.holidays.length" class="hint">Праздничных дат нет.</p>
      <p v-for="day in snapshot.schedule.holidays" :key="day" class="holiday">
        {{ day }}
        <button type="button" class="text-btn" @click="controller.removeHoliday(day)">Удалить</button>
      </p>
    </div>
  </section>
</template>
