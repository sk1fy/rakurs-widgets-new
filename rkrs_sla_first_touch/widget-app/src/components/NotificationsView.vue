<script setup>
import { formatDateTime } from "../time.js";

defineProps({
  snapshot: { type: Object, required: true },
  controller: { type: Object, required: true },
});
</script>

<template>
  <div class="stack">
    <section class="card">
      <h3>Пре-алерт</h3>
      <p class="caption">
        {{ snapshot.settings.preAlertPercent }}% норматива, только текущему ответственному и только
        пока нет ответа. Один раз на сделку, даже после переназначения. Если рабочий возраст уже
        больше 2× норматива, предупреждение пропускается. Это не первое касание. Сдвиньте демо-часы
        на +5 мин, чтобы увидеть локальный popup.
      </p>
    </section>
    <section class="card">
      <h3>Критическая задача</h3>
      <p class="caption">
        Без ответа, норматив уже нарушен, и выполнено одно из условий: рабочее время достигло
        ×{{ snapshot.settings.criticalMultiplier }} или бюджет выше
        {{
          snapshot.settings.budgetThreshold == null
            ? "выключенного порога"
            : `${snapshot.settings.budgetThreshold} ₽`
        }}. Бюджет до нарушения задачу не создаёт. Повтор не создаёт вторую. Задача видна в журнале
        и в карточке сделки.
      </p>
    </section>
    <section class="card">
      <h3>Дайджест · час {{ snapshot.settings.digestHour }}:00</h3>
      <p class="caption">Макет группового чата. Если с прошлой отправки нет нарушений, сообщение не создаётся. Не больше 20 худших сделок.</p>
      <div class="actions" style="margin: 8px 0">
        <button type="button" class="btn" @click="controller.previewDigest()">Предпросмотр</button>
        <button type="button" class="btn primary" @click="controller.simulateDigest()">Смоделировать отправку</button>
      </div>
      <div class="chat-mock" aria-label="Макет группового чата">
        <strong>Группа «Отдел продаж» · макет</strong>
        <p v-if="!snapshot.digestCard">Нажмите кнопку, чтобы собрать сообщение локально.</p>
        <p v-else-if="snapshot.digestCard.empty">{{ snapshot.digestCard.text }}</p>
        <template v-else>
          <p>{{ snapshot.digestCard.title }}: {{ snapshot.digestCard.breachCount }} нарушений.</p>
          <p v-for="line in snapshot.digestCard.lines" :key="line">{{ line }}</p>
        </template>
      </div>
    </section>
    <section class="card">
      <h3>Итог дня · {{ snapshot.settings.eodHour }}:00</h3>
      <p class="caption">По менеджерам: число сделок, средняя реакция в рабочем времени, нарушения, итог команды. Если за день сделок не было, отчёт не формируется.</p>
      <div class="actions" style="margin: 8px 0">
        <button type="button" class="btn" @click="controller.previewEod()">Предпросмотр</button>
        <button type="button" class="btn primary" @click="controller.simulateEod()">Смоделировать отправку</button>
      </div>
      <div class="chat-mock">
        <strong>Личные подписчики · макет</strong>
        <p v-if="!snapshot.eodCard">Итог ещё не собран.</p>
        <p v-else-if="snapshot.eodCard.empty">{{ snapshot.eodCard.text }}</p>
        <p v-for="line in snapshot.eodCard?.lines || []" :key="line">{{ line }}</p>
      </div>
    </section>
    <section class="card">
      <h3>Подписчики и бот</h3>
      <ul class="timeline">
        <li v-for="person in snapshot.subscribers" :key="person.id">
          <strong>{{ person.name }}</strong>
          <span class="fine">{{ person.channel }} · {{ person.status }}</span>
        </li>
        <li>
          <strong>{{ snapshot.bot.title }}</strong>
          <span class="fine">{{ snapshot.bot.status }}</span>
        </li>
        <li>
          <strong>{{ snapshot.link.label }}</strong>
          <span class="fine">{{ snapshot.link.value }}</span>
          <span class="fine">{{ snapshot.link.status }}</span>
        </li>
      </ul>
    </section>
    <section class="card">
      <h3>Журнал</h3>
      <p v-if="!snapshot.journal.length" class="fine">Пока пусто.</p>
      <ul class="journal">
        <li v-for="entry in snapshot.journal" :key="entry.id">
          <time>{{ formatDateTime(entry.at, snapshot.timeZone) }}</time>
          <div>{{ entry.text }}</div>
        </li>
      </ul>
    </section>
  </div>
</template>
