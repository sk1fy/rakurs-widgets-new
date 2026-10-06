<script setup>
import { computed, inject, onMounted, ref, watch } from "vue";

const { controller, snapshot } = inject("mlc");
const dialog = ref(null);
const orderedManagers = computed(() =>
  snapshot.value.settings.managerIds.map((id, index) => {
    const user = snapshot.value.settings.users.find((item) => item.id === id);
    return { id, name: user?.name || id, vacation: user?.vacation || "", index };
  })
);
const availableUsers = computed(() =>
  snapshot.value.settings.users.filter((user) => user.active && !snapshot.value.settings.managerIds.includes(user.id))
);
const inactiveCount = computed(() => snapshot.value.settings.users.filter((user) => !user.active).length);
const progress = computed(() => {
  const total = snapshot.value.batch?.items.length || 0;
  if (!total) return 0;
  return Math.round((snapshot.value.processed / total) * 100);
});

function sync(phase) {
  const element = dialog.value;
  if (!element) return;
  if (phase === "list") {
    if (element.open) element.close();
  } else if (!element.open) element.showModal();
}
onMounted(() => sync(snapshot.value.phase));
watch(() => snapshot.value.phase, sync);
function onCancel(event) {
  if (snapshot.value.running) event.preventDefault();
  else controller.closeWizard();
}
function statusClass(status) {
  if (status === "сделка и задача созданы") return "ok";
  if (status === "сделка создана, задача не создана") return "partial";
  return "fail";
}
</script>

<template>
  <dialog ref="dialog" class="sheet" aria-label="Создание сделок" @cancel="onCancel">
    <div class="sheet-head">
      <div>
        <span class="demo-flag">ДЕМО</span>
        <h2>
          {{
            snapshot.phase === "settings"
              ? "Настройка операции"
              : snapshot.phase === "plan"
                ? "План партии"
                : snapshot.phase === "processing"
                  ? "Создание"
                  : "Результат партии"
          }}
        </h2>
      </div>
      <button type="button" class="btn" :disabled="snapshot.running" @click="controller.closeWizard()">Закрыть</button>
    </div>
    <div class="sheet-body">
      <template v-if="snapshot.phase === 'settings'">
        <div class="split">
          <div class="block">
            <label class="field">
              Воронка
              <select :value="snapshot.settings.pipelineId" @change="controller.setPipeline($event.target.value)">
                <option v-for="pipeline in snapshot.settings.pipelines" :key="pipeline.id" :value="pipeline.id">
                  {{ pipeline.name }}
                </option>
              </select>
            </label>
            <p class="hint">
              Этап отдельно не выбирается. Сделки попадут на первый рабочий этап «{{ snapshot.settings.stageName }}».
              Это правило прототипа.
            </p>
            <label class="field">
              Время задачи, мин
              <input
                type="number"
                min="1"
                step="1"
                :value="snapshot.settings.durationMinutes"
                @input="controller.setDuration($event.target.value)"
              />
            </label>
            <label class="field">
              Задач в день на менеджера
              <input
                type="number"
                min="1"
                step="1"
                :value="snapshot.settings.dailyLimit"
                @input="controller.setDailyLimit($event.target.value)"
              />
            </label>
            <p class="hint">Лимит относится только к новым задачам этой партии. Чужую загрузку менеджера прототип не знает.</p>
            <label class="field">
              Тег сделки
              <input type="text" :value="snapshot.settings.tag" @input="controller.setTag($event.target.value)" />
            </label>
            <label class="field">
              Текст задачи
              <textarea :value="snapshot.settings.taskText" @input="controller.setTaskText($event.target.value)"></textarea>
            </label>
          </div>
          <div class="block">
            <h3>Ответственные по порядку</h3>
            <p class="hint">Номер на чипе — порядок round-robin. Контакт i получает менеджера i по модулю числа менеджеров.</p>
            <div v-if="orderedManagers.length" class="chips">
              <div v-for="manager in orderedManagers" :key="manager.id" class="chip">
                <span class="num">{{ manager.index + 1 }}</span>
                <strong>{{ manager.name }}</strong>
                <button type="button" class="btn" :disabled="manager.index === 0" @click="controller.moveManager(manager.id, -1)">
                  Выше
                </button>
                <button
                  type="button"
                  class="btn"
                  :disabled="manager.index === orderedManagers.length - 1"
                  @click="controller.moveManager(manager.id, 1)"
                >
                  Ниже
                </button>
                <button type="button" class="btn" @click="controller.toggleManager(manager.id)">Убрать</button>
                <span v-if="manager.vacation" class="hint">{{ manager.vacation }}</span>
              </div>
            </div>
            <p v-else class="hint">Пока никого не выбрали.</p>
            <div class="filters">
              <button v-for="user in availableUsers" :key="user.id" type="button" class="btn" @click="controller.toggleManager(user.id)">
                Добавить {{ user.name }}
              </button>
            </div>
            <p v-if="inactiveCount" class="hint">Неактивные пользователи скрыты и в очередь не попадают.</p>
            <h3>График кабинета</h3>
            <p>
              {{ snapshot.schedule.timezone }}, {{ snapshot.schedule.startLabel }}–{{ snapshot.schedule.endLabel }}.
              Рабочие дни: {{ snapshot.schedule.workingDays.join(", ") || "не заданы" }}.
              Исключения: {{ snapshot.schedule.holidays.join(", ") || "нет" }}.
            </p>
            <p class="hint">Часы, дни и праздники меняются в панели «Демо», это не поля окна создания.</p>
          </div>
        </div>
        <ul v-if="snapshot.settingsBlockers.length" class="list">
          <li v-for="item in snapshot.settingsBlockers" :key="item">{{ item }}</li>
        </ul>
        <button type="button" class="btn-primary" :disabled="snapshot.settingsBlockers.length > 0" @click="controller.showPlan()">
          Далее к плану
        </button>
      </template>

      <template v-else-if="snapshot.phase === 'plan' && snapshot.plan">
        <div class="stats">
          <div class="stat"><b>{{ snapshot.plan.selectedCount }}</b>выбрано</div>
          <div class="stat"><b>{{ snapshot.plan.processableCount }}</b>к обработке</div>
          <div class="stat"><b>{{ snapshot.plan.fixCount }}</b>нужно исправить</div>
          <div class="stat">
            <b>{{ snapshot.plan.quota.unlimited ? "∞" : snapshot.plan.quota.remaining }}</b>
            остаток квоты
          </div>
        </div>
        <p>
          Воронка «{{ snapshot.plan.pipelineName }}», первый рабочий этап «{{ snapshot.plan.stageName }}».
          Снимок выбора зафиксирован: смена фильтра списка эту партию не меняет.
        </p>
        <p v-if="snapshot.plan.selectedCount > 20" class="banner">
          В партии {{ snapshot.plan.selectedCount }} контактов. На странице списка видно 20, план считает всю выборку.
        </p>
        <p class="hint">
          Правило демо: шаг = доступные минуты окна / число задач в этом окне. Длительность — отдельный параметр и с шагом не совпадает.
          Квота списывается по успешно созданным сделкам в локальный день кабинета. Это не дневной лимит задач менеджера.
        </p>
        <p v-if="snapshot.plan.quota.unlimited" class="banner">Безлимитный деморежим: предел 250 не применяется. Оплата не открывается.</p>
        <p v-else class="hint">
          Квота на {{ snapshot.plan.quota.dayLabel }}: использовано {{ snapshot.plan.quota.used }}, осталось
          {{ snapshot.plan.quota.remaining }} из {{ snapshot.plan.quota.limit }}.
        </p>
        <div v-if="snapshot.plan.managers.length" class="chips">
          <div v-for="manager in snapshot.plan.managers" :key="manager.id" class="chip">
            <span class="num">{{ manager.order }}</span>
            <span>{{ manager.name }}: {{ manager.count }} сделок</span>
            <span v-if="manager.vacation" class="hint">{{ manager.vacation }}</span>
          </div>
        </div>
        <div v-for="group in snapshot.plan.dayGroups" :key="group.day" class="block">
          <strong>{{ group.label }}</strong>
          <p v-for="manager in group.managers" :key="manager.id">
            {{ manager.name }}: {{ manager.count }} задач, шаг {{ manager.stepLabel }} мин, первая в {{ manager.firstStart }}
          </p>
        </div>
        <p v-if="snapshot.plan.lastTaskLabel">Последняя задача: {{ snapshot.plan.lastTaskLabel }}.</p>
        <p v-if="snapshot.plan.noTag" class="banner warn">Тега нет. Потом такую партию будет трудно найти фильтром.</p>
        <p v-if="snapshot.plan.noTaskText" class="banner warn">Текст задачи пустой. В задаче останется телефон.</p>
        <p v-if="snapshot.plan.openDealCount" class="banner warn">
          У {{ snapshot.plan.openDealCount }} контактов уже есть открытая сделка. Они не исключены: дедупликации нет.
        </p>
        <p v-for="warning in snapshot.plan.overload" :key="`${warning.managerId}-${warning.day}`" class="banner warn">
          {{ warning.managerName }}, {{ warning.dayLabel }}: длительность больше шага {{ warning.stepLabel }} мин.
          Задачи могут пересекаться. Прототип этого не скрывает.
        </p>
        <p class="banner warn">Уже созданную партию нельзя отменить одной кнопкой. В продукте своей отмены нет.</p>
        <ul v-if="snapshot.launchBlockers.length" class="list">
          <li v-for="item in snapshot.launchBlockers" :key="item">{{ item }}</li>
        </ul>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Контакт</th>
                <th>Новая сделка</th>
                <th>Ответственный</th>
                <th>Задача</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in snapshot.plan.rows" :key="row.contactId">
                <td>
                  {{ row.contactName }}
                  <div v-if="row.needsPhone" class="deal-yes">Нет телефона. Выбрать номер нельзя.</div>
                  <div v-if="row.excluded">Исключён из партии</div>
                  <button v-if="row.needsPhone" type="button" class="btn" @click="controller.excludeContact(row.contactId)">
                    Исключить из партии
                  </button>
                  <button v-if="row.excluded" type="button" class="btn" @click="controller.includeContact(row.contactId)">
                    Вернуть в партию
                  </button>
                  <select
                    v-if="row.phones.length > 1 && !row.excluded"
                    :value="row.chosenPhone"
                    :aria-label="`Телефон для ${row.contactName}`"
                    @change="controller.setPhone(row.contactId, $event.target.value)"
                  >
                    <option v-for="phone in row.phones" :key="phone" :value="phone">{{ phone }}</option>
                  </select>
                </td>
                <td>
                  {{ row.dealName || "—" }}
                  <div v-if="row.hasActiveDeal && !row.excluded" class="deal-yes">Уже есть открытая сделка</div>
                </td>
                <td>{{ row.managerName || "—" }}</td>
                <td>{{ row.taskText || "—" }}</td>
                <td>
                  <template v-if="row.startLabel">{{ row.dayLabel }}, {{ row.startLabel }} → срок {{ row.dueLabel }}</template>
                  <template v-else>—</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="result-actions">
          <button type="button" class="btn" @click="controller.showSettings()">К настройкам</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="snapshot.launchBlockers.length > 0 || snapshot.running"
            @click="controller.launch()"
          >
            {{ snapshot.launchLabel }}
          </button>
        </div>
      </template>

      <template v-else-if="snapshot.phase === 'processing'">
        <p role="status">Обработано {{ snapshot.processed }} из {{ snapshot.batch?.items.length || 0 }}.</p>
        <div class="progress" role="progressbar" :aria-valuenow="snapshot.processed" :aria-valuemax="snapshot.batch?.items.length || 0">
          <span :style="{ width: `${progress}%` }"></span>
        </div>
        <p class="hint">Повторное нажатие не запускает вторую партию. Запись идёт только в локальную модель.</p>
      </template>

      <template v-else-if="snapshot.batch">
        <div class="stats">
          <div class="stat"><b>{{ snapshot.batch.counts.ok }}</b><span class="status ok">сделка и задача созданы</span></div>
          <div class="stat"><b>{{ snapshot.batch.counts.partial }}</b><span class="status partial">сделка создана, задача не создана</span></div>
          <div class="stat"><b>{{ snapshot.batch.counts.failed }}</b><span class="status fail">сделка не создана</span></div>
        </div>
        <p class="banner warn">Эту партию нельзя отменить одной кнопкой. Сброс демоданных живёт только в панели «Демо».</p>
        <p class="hint">Повтор выполняет лишь отсутствующий шаг и не создаёт вторую копию успешной сделки.</p>
        <div v-for="group in snapshot.batch.groups" :key="group.day" class="block">
          <strong>{{ group.label }}</strong>
          <div v-for="manager in group.managers" :key="manager.name">
            <p>{{ manager.name }}: {{ manager.items.length }}</p>
            <p v-for="item in manager.items" :key="item.contactId" class="hint">
              {{ item.contactName }} · {{ item.startLabel }} → {{ item.dueLabel }} · {{ item.status }}
            </p>
          </div>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Сделка</th>
                <th>Менеджер</th>
                <th>Задача</th>
                <th>Срок</th>
                <th>Статус</th>
                <th>Ошибка</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in snapshot.batch.items" :key="item.contactId">
                <td>
                  <button v-if="item.dealId" type="button" class="text-btn" @click="controller.openDeal(item.dealId)">
                    {{ item.dealName }}
                  </button>
                  <span v-else>{{ item.dealName }}</span>
                </td>
                <td>{{ item.managerName }}</td>
                <td>{{ item.taskText }}</td>
                <td>{{ item.dayLabel }}, {{ item.dueLabel }}</td>
                <td><span class="status" :class="statusClass(item.status)">{{ item.status }}</span></td>
                <td>
                  {{ item.error }}
                  <button
                    v-if="item.canRetry"
                    type="button"
                    class="btn"
                    :disabled="snapshot.running"
                    @click="controller.retry(snapshot.batch.id, item.contactId)"
                  >
                    Повторить шаг
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="result-actions">
          <button type="button" class="btn" @click="controller.closeWizard()">Вернуться к контактам</button>
          <button type="button" class="btn-primary" @click="controller.showBatch(snapshot.batch.id)">Показать партию</button>
        </div>
      </template>
    </div>
  </dialog>
</template>
