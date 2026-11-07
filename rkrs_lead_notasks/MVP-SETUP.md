# Контроль задач. Установка и проверка

Начиная с версии 1.2.5, виджет получает правила из backend TeamOS. Проверки карточек и работа с задачами выполняются в amoCRM.

## Сборка

Перед обновлением ZIP разверните Core со схемой 36 и backend TeamOS со схемой 42, затем обновите интерфейс TeamOS. После этого загрузите ZIP в существующую интеграцию amoCRM. Для аккаунта amoCRM в Core должна быть зарегистрирована интеграция `task-control`, а компании TeamOS нужен доступ к этому аккаунту.

```sh
TASK_CONTROL_CORE_ORIGIN=https://YOUR_CORE_HOST \
TASK_CONTROL_BACKEND_ORIGIN=https://YOUR_TEAM_OS_API_HOST \
sh scripts/build.sh
```

Укажите реальные публичные HTTPS-адреса без путей и учётных данных. Скрипт встраивает их в `../rkrs_lead_notasks.zip` и берёт версию из `manifest.json`.

## Подключение

1. Загрузите ZIP в существующую приватную интеграцию amoCRM, сохранив её OAuth UUID.
2. Для нового подключения откройте настройки виджета как администратор amoCRM. Нажмите «Код подключения» и введите его в разделе «Интеграции → Контроль задач» в TeamOS. Код действует 60 секунд и используется один раз.
3. Создайте правило и нажмите «Сохранить правила» в TeamOS. Для ранее подключённого аккаунта в автономном режиме сохраните нужные правила один раз, чтобы начать применять их. Правила из локальных настроек можно перенести отдельным импортом до сохранения.
4. Откройте сделку от имени сотрудника, на которого распространяется правило. Проверьте запрет выхода без открытой задачи ответственного, затем создайте такую задачу и повторите переход. Уже открытая вкладка получает правила при следующем опросе backend TeamOS.

Сценарии ниже описывают поведение предыдущих версий виджета. Для 1.2.5 используйте порядок подключения выше.

## Пакет тестового сервера 2026-10-15

Для проверенного владельцем тестового контура оба build origins —
`https://2-26-66-187.sslip.io`. Это существующий HTTPS-домен Core; nginx должен
направлять точный `/auth` на Core, а `/sessions` и `/bootstrap` прямо на gateway
TeamOS. Конфигурационные фрагменты и порядок выкладки находятся в
[Core PR #64](https://github.com/sk1fy/amocrm-pro/pull/64),
`deploy/task-control-staging/`. Новые маршруты требуется развернуть до проверки пакета.
UI TeamOS остаётся доступен через SSH-forward8190; новый публичный UI не требуется.

## Исправление 1.1.1

Поле teamos_enabled объявлено как custom: manifest amoCRM не поддерживает тип checkbox. Флажок отрисовывается виджетом и записывает 1/0 в штатное поле, которое сохраняется основной кнопкой amoCRM. Проверены допустимые типы manifest и оба направления переключения; 67 тестов прошли.

## Исправление 1.1.2

amoCRM разрешает только одно custom-поле: им остаётся runtime_config. Переключатель TeamOS использует штатное text-поле teamos_enabled, скрытое после отрисовки флажка. Значение 1/0 сохраняется основной кнопкой amoCRM. Сборка проверяет допустимые типы и ограничение одного custom до создания ZIP.

## Runtime 1.2.0: динамические правила (КТ-01.R11)

Пакет объявляет серверу `runtimeVersion: "1.2.0"` и capability `dynamicRulesV2`
при обычном обмене Core assertion на короткую runtime session. Сервер выбирает
`runtimeSchemaVersion`: существующий v1 продолжает использовать прежний bootstrap,
v2 использует `GET /api/v2/task-control/runtime/bootstrap`. Ошибка v2 или попытка
вернуть v1 в той же области подключения не переводит вкладку на старый протокол.
Переключение схемы и новый epoch выполняются явно на сервере.

В v2 движок получает actor-specific материализованные legacy rules и заменяет их
при изменении `runtimeRevision`, в том числе без новой версии публикации. Scope,
actor, schema, минимальная версия, payload hash и монотонность revision проверяются
до применения. После установки правил в движок вкладка отправляет
`POST /api/v2/task-control/runtime/ack` с snapshot/publication/revision, hash,
`runtimeInstanceId` этой вкладки и временем применения. ACK повторяется при
подтверждённой установке/опросе; ошибка телеметрии не продлевает lease.

Lease ограничена серверной свежестью источников и пятью минутами; локальный таймер
монотонный. По истечении guard отключается до получения свежего снимка. Подтверждённый
403/revoke немедленно убирает правила, сетевой сбой сохраняет их только до конца lease.
Автономный режим продолжает читать локальные правила без обращения к TeamOS.

### R04: импорт и безопасный возврат (1.2.1)

При сохранённом `teamos_enabled=1` открытый виджет обслуживает задания admin bridge:
GET `/api/v1/widget/task-control/source-requests`, затем PUT `/{id}/result`.
Каждое чтение списка получает свежую Core assertion `purpose=adminBridge`; результат
получает отдельную assertion с `requestId`, равным ID задания. Runtime access token
для этих операций не используется. Core проверяет текущего администратора amoCRM.
С выключенным TeamOS нет автоматических запросов к Core/TeamOS. Для импорта до
включения managed-режима явно нажмите «Код подключения»: после успешного admin proof
начинается отдельное чтение заданий bridge, автономные правила продолжают работать.
Эквивалентный API: `await widget.taskControlMigration.startAdminBridge()`. При закрытии
виджета этот bridge останавливается. Runtime транспорт с выключенным TeamOS не запускается.

Чтение каталога проверяет все страницы, CODE, карту ID/типов/enum, уникальные UID и
безопасные числовые ID до нормализации. Неполный ответ, повтор UID, повреждённое
значение или превышение 1 MiB возвращает явный `complete=false`, а не пустой снимок.
Архивные/выключенные правила и закрытые этапы 142/143 сохраняются. `raw` содержит
исходные каталог, определения полей, элементы и точный `runtime_config`; расхождение
каталога и опубликованного snapshot отмечается `catalog_runtime_divergence`.
Снимки каталога не изменяют автономные настройки или сам каталог.

Перед передачей снимка/возвратом сохраняется отдельная локальная резервная копия:
`localStorage['rkrs-wt-migration:<accountId>:<uuid>']`. Она содержит исходные значения
`runtime_config`, `teamos_enabled`, version и весь исходный каталог. Имеющаяся копия
не перезаписывается; при недоступном хранилище/квоте операция прекращается. Копии
можно выгрузить штатными средствами браузера; очищать их следует только после
проверки переноса. Копия привязана к аккаунту и профилю браузера.

API интеграции для будущего экрана миграции доступен на экземпляре виджета:

```js
await widget.taskControlMigration.prepareStandalone(modeReceipt, {
    confirm: true,
    acceptDynamicLoss: true, // только после явного согласия заморозить динамику
    confirmEmpty: true      // только для намеренного пустого экспорта
});
```

Сначала в TeamOS получите полный свежий v2 mode preview, проверьте правила и
подтвердите переход в `standalone`. Передайте именно ответ успешного mode commit
(`state=completed`, `targetMode=standalone`, `export=preview`, новая `scope.modeEpoch`),
а не runtime snapshot одного сотрудника. Откройте настройки amoCRM перед вызовом.
API проверяет свежесть/область/контрольную сумму полного экспорта и реальное состояние
backend через свежую runtime-сессию до и после записи. При невозможности представить
правило автономно сервер отказывает явно; динамика не теряется молча.

API создаёт **отдельный** каталог, читает его обратно и сверяет полный checksum;
исходный каталог остаётся резервной копией. Частичная запись или конфликт параллельных
изменений не переключает локальные настройки; новый неполный каталог может остаться
и требует ручного удаления после проверки. После успешной подготовки настройка
`runtime_config` только подставлена в native поле. Отключите TeamOS и нажмите штатное
«Сохранить» amoCRM. При Save повторно проверяется серверный режим и отсутствие
конкурирующих изменений настроек. Закрытие окна без Save оставляет старый runtime_config.
Сбой после серверного mode commit безопасно приостанавливает managed runtime;
повторите подготовку с новым свежим preview/commit вместо применения старого снимка.
Переход режима на сервере имеет отдельное подтверждение: локальная подготовка сама
не меняет режим TeamOS. При необходимости отката используйте сохранённые исходные
настройки и соответствующий подтверждённый режим, не смешивая эпохи.

### Runtime diagnostics (1.2.2)

Managed runtime sends bounded diagnostic events to
`POST /api/v1/task-control/runtime/telemetry` with its existing runtime session.
`received` confirms validation and download; events use an ordered background queue
that cannot delay runtime installation. `applied` follows installation into the
local engine. Only `applied` confirms execution by that specific tab. Later successful
applications of the same revision produce heartbeat evidence at most once per 60 seconds.
Heartbeat and diagnostic responses never extend the bootstrap lease.

Each tab creates a new random `runtimeInstanceId` in memory. A refreshed page is a new
instance. Events carry the exact scope, actor, publication, runtime revision/checksum,
package version, event UUID, occurrence time and bootstrap correlation UUID; v2 also
includes snapshot ID. No rule contents, CRM objects, user messages, URLs, tokens or
assertions are included. Error codes are restricted to a fixed allowlist. Failed or
closed tabs are not reported as uninstall and do not invalidate another tab's evidence.
The server determines freshness from its own receipt time and current scope.

Failed engine installation emits `apply_failed` without `applied`. A failed bootstrap
with a still-valid runtime session can emit a sanitized error scoped to that session
without publication fields; revoked and foreign sessions emit no such evidence. A failed diagnostic
request cannot renew a lease or initiate authentication. Confirmed 403/404 revocation
clears the cached managed config; a transport outage leaves it usable until its original
lease expires. Hidden tabs do not send applied/heartbeat from visibility callbacks.
Destroy removes timers/listeners and clears this instance's session. Autonomous mode
still starts no TeamOS transport unless explicitly connected through the admin bridge.

## R08: релизная семантика, пакет 1.2.3

Существующие explicit ID и standalone-правила не расширяются на новые отделы,
воронки или этапы. Пересекающиеся флаги объединяются OR. Просроченная незавершённая
задача владельцу карточки удовлетворяет guard; задача другому сотруднику — нет.
Штатная форма сохраняет выбранного исполнителя при создании/редактировании;
владелец подставляется только в пустое поле.

Legacy customers сохраняет первые 250 карточек на запрос и предупреждает о
частичной выборке. В списке проверяется задача текущему пользователю, а в карточке
— задача ответственному карточки. Это не полный мониторинг CRM.

Отдельное создание задачи владельцу требует доступных Web Locks и localStorage.
Неопределённый POST не повторяется: устойчивый маркер сохраняется между вкладками
и переинициализацией до подтверждения задачи в Tasks API. Если POST вернул ID,
маркер сохраняется до явного завершения этой задачи в ответе Tasks API по ID,
даже когда задача появилась в списке. Маркеры без TTL; предел 256 применяется
только к неопределённым созданиям текущего аккаунта. Подтверждённые ID в этот
предел не входят. Без поддержки браузера/доступа к хранилищу используйте штатную форму amoCRM.
Для неопределённого результата сначала вручную проверьте ленту и задачи; не
удаляйте маркер для слепого повтора. Граница этой защиты — helper виджета одного
origin; native/mobile/API и другие устройства не блокируются.

Полная матрица, ограничения и порядок диагностики —
`docs/integrations/task-control-r08-semantics.md` в team-os-backend. Core миграция
30 и backend должны поддерживать 1.2.3 до подтверждения пакета оператором.
