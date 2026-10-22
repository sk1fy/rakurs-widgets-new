# ПВ-02 — общая основа виджетов

[Этап ClickUp](https://app.clickup.com/t/1amkccgbvj7), 2026-10-22.
Результат — код основы и локальная проверка. Пилотные установки и отправка
архивов на модерацию ещё не выполнены; этап целиком не завершён.

| Подзадача | Результат | Граница приёмки |
| --- | --- | --- |
| [ПВ-02.01](https://app.clickup.com/t/1amkccgbvj8) | [Owner loader](../packages/widget-loader/README.md): SDK transport, allowlist, фоновое продление TTL, readonly и disposal | Готов к review на фикстурах; route API реализуется в ПВ-03 |
| [ПВ-02.02](https://app.clickup.com/t/1amkccgbvj9) | [Общая сборка](../packages/widget-build/README.md), SHA-256, детерминированный ZIP; Distribution/Activity используют её | Локальная инженерная сборка; не подтверждение публичного релиза |
| [ПВ-02.03](https://app.clickup.com/t/1amkccgbvja) | [SDK runtime](../packages/widget-runtime/README.md), lifecycle, identity, authorizedAjax, fixture simulator; Distribution подключён | Готов к review; бизнес-логика продукта сохранена |
| [ПВ-02.04](https://app.clickup.com/t/1amkccgbvjc) | Проверены callback-контракты, подготовлены воспроизводимые legacy snapshots | Блокируют неподтверждённый production baseline, отсутствие destroy и живая проверка demorkrs |
| [ПВ-02.05](https://app.clickup.com/t/1amkccgbvje) | Hash inventory и staging обоих пилотов, перечень правил модерации | Пилотные ZIP с новым loader не выпущены и не отправлены |

## Выбор модели поставки

Основной пакет содержит исполняемый код внутри ZIP. Сервер выбирает
предупакованную версию, а не присылает произвольный JS URL. CDN-режим оставлен
только как явный диагностический параметр сборки; индивидуальное разрешение
amoCRM не получено. Подробности, источники требований, сведения о legacy
и оставшиеся препятствия — в [проверке модерации](pv02-moderation.md).

При упаковке Distribution и Activity общий builder помещает runtime в
script.js, сохраняет один анонимный AMD entrypoint и локально разрешает
закреплённый bundle. Не используются eval, глобальная подмена RequireJS или
удалённый manifest. ZIP фиксирует порядок путей, timestamp и mode, не зависит
от системного zip. Версии manifest/package/release и SHA фактических байтов
проверяются перед упаковкой. Изменение упаковки требует обычного review и
приёмки; текущие версии продукта не переобозначены новым публичным релизом.

## Что проверить локально

Из корня репозитория:

```sh
node --test packages/*/tests/*.test.mjs
(cd rkrs_lead_distribution/widget-app && npm ci && npm test && npm run build:preview)
(cd rkrs_activity_panel/widget-app && npm ci && npm test && npm run build:preview)
python3 scripts/prepare-pv02-legacy.py --source /path/to/rakurs-widgets-dev
```

Последняя команда требует исходный snapshot с хэшами из provenance и
отказывается перезаписывать существующие outputs. Материализованные каталоги
не содержат нового script.js: это evidence inputs, не установочные ZIP.

Проверены реальные упакованные Distribution/Activity в jsdom + RequireJS при
запрещённой сетевой загрузке JavaScript/manifest, одинаковые ZIP-байты повторных
сборок, SHA-256, входы/выходы lifecycle и SDK. Отдельный
[браузерный стенд](../examples/owner-routing/index.html) проверен на повторный
render, Core/SSD, истечение TTL и недоступность Core. Это фикстуры, не demorkrs.

## Перед продолжением пилотов

1. Подтвердить опубликованные ZIP/версии ColorLeads и CopyLead: найденные
   widgets-dev и SSD отличаются. Понадобятся integration IDs, widget codes,
   account ID demorkrs и доступ для живой приёмки.
2. В подтверждённых исходниках реализовать disposal observers/timers/events,
   ActivationRakurs/Vue/IMask, отмену чтений и защиту late callbacks. Проверить
   отсутствующий ColorLeads template. После этого можно разрешить legacy adapter.
3. Реализовать и согласовать authenticated route API ПВ-03 и адреса
   DP/Salesbot ingress. Не заменять действующие endpoints неподтверждёнными.
4. Собрать пилотные ZIP с локальными модулями, прогнать upgrade/rollback и
   бизнес-сценарии на demorkrs, затем отправить на модерацию с evidence.

Открытые зависимости РС-12.2 и РС-12.19 автоматически не закрывались. Общая
сборка использует актуальный widget-app Distribution 0.1.2; задача сведения
диагностического пакета 0.6.2/0.6.3 в единый релиз остаётся отдельной.
ПВ-01 ADR остаются Proposed; реализация основы не подменяет их приёмку.
