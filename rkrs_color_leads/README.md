# Цветные сделки — кандидат ПВ-04.03

Новый независимый frontend, product_code `rkrs_color_leads`, legacy appName `rkrs_color_leads`.
Это инженерная реализация, **не опубликованный виджет и не разрешение на переключение**.
Общий owner-loader включает только `color-core-v1`; SSD adapter не добавляется автоматически.

## Проверка и стенд

```sh
cd rkrs_color_leads/widget-app
npm ci
npm test
npm run release
npm run build:preview
npm run dev
```

Стенд содержит только fixture SDK/локальные сделки, переключатели unavailable/freezing/generation.
Он не выполняет live запросы. Визуальная приёмка в amoCRM отложена пользователем.
Runtime UMD собирается общей widget-build цепочкой без минификации. `widget/script.js` намеренно
не активирует продукт: требуется связать routePath, read gateway и SDK surfaces с ПВ-03.
Публичный ZIP не предлагается; загрузка ZIP не может считаться безопасной миграцией.

## Реализованные функции

- Правила: добавление, редактирование, удаление, включение; фон/обводка/текст,
  пользователи, несколько AND-условий, поля/операторы/enum/date/checkbox.
- Приоритет первого enabled совпадения; имя/ответственный и custom fields.
- Kanban: фон, border 3px, цвет/600 текста. List: фон строки и status cell.
- Динамические карточки через MutationObserver, чтение пакетами по 50 ID.
- Settings optimistic revision, ошибки/409/неизвестный результат без автоматического повтора,
  сохранение черновика при offline/paused, синхронный route fence.
- Полный settings document сохраняет неизвестные ключи при roundtrip; первая установка
  с `{}` открывает пустой список. После paused/stale повторно читается серверная revision;
  изменившаяся revision при грязном черновике блокирует сохранение без перезаписи черновика.

Исходник для сравнения: `rakurs-widgets-dev` commit
`d000ac7335942c18458d4baf61cc7cbed4a72f8d`, `rkrs_colorfull_lead/widget/script.js`
и `vue/src/components/{SettingsWidget,RuleForm}.vue`. Production baseline пока не подтверждён.
Сохраняются спорные legacy semantics: только первое значение multiselect, checkbox строго
`value === '1'`, даты в timezone браузера и прежние границы greaterDays/lessDays,
пустые conditions матчятся как true при чтении старых правил. Новая форма не сохраняет
пустые условия. Изменение поведения: ранее нанесённый стиль снимается, если правило
больше не подходит; cleanup восстанавливает только свои свойства, не переписывая поздние
изменения CRM. Это требует отдельной приёмки, не объявляется production parity.

## Контракт интеграции

`createColorLoader({widget,apiUrl,routePath,document,amoCRM,createReadGateway})` получает
явный зарегистрированный routePath от ПВ-03 (нет придуманного production пути).
Использует общий SDK authorization, account/user только для локального identity/context;
сервер обязан брать principal из проверенной авторизации.

Settings contract из isolated Core module: `GET/PUT /v1/widgets/color-leads/settings`,
GET/PUT ответ `{settings:{main_settings:[...]},revision:N}`;
PUT body `{settings:{main_settings:[...]},expected_revision:N}`.
Ожидания `X-Routing-Epoch`, `X-Installation-Generation` отправляются на каждый запрос.
CORS и authoritative owner/epoch/generation guards должны быть подключены на сервере.
`createReadGateway(context)` должен предоставить `metadata() -> {fields,users}`,
`leads(ids) -> {leads}`, `destroy()` с отменой pending reads. Перед каждым dispatch он
проверяет `context.canInvoke()` и использует текущий `context.route()` для ожиданий.
Metadata содержит synthetic fields 504473000/5044780000 и активных пользователей/enum.
По умолчанию gateway **закрыт**; прямого `/api/v4` fetch и fallback на SSD нет.
Billing/activation/подписка не копируются из старого ActivationRakurs: это ответственность
Core и общего installation lifecycle, подключение ещё требуется.

## Условия безопасного пилота

Новый адаптер инертен до подтверждённого route, на stale/paused синхронно отключает controls,
observer/timer и новые requests; проверяет canInvoke перед DOM/async эффектами. Destroy
отменяет reads, удаляет UI и восстанавливает свои стили; поздние ответы не применяются.
Неизвестный результат записи и 409 запрещают повторную запись до сверки/перезагрузки.
SDK onSave синхронный, не подтверждает несохранённый черновик.

Эта очистка касается **нового** frontend. Старые вкладки/ZIP без guard сами не остановятся.
До включения Core нужны SSD write fence/credentials drain, доказанная остановка старых
браузерных эффектов (включая существующие вкладки), проверенный production snapshot,
пилотный account/cohort, rollback и сверка состояния. Отдельная интеграция сама по себе
не исключает параллельный старый виджет. LocalStorage не является route grant.
