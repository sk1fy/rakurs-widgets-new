# Вход в компанию из настроек amoCRM

Общий модуль монтируется settings callback каждого из трёх виджетов и полного
интеграционного пакета распределения. Существующие настройки продуктов остаются
отдельными. Обычным сотрудникам CTA не показывается. Проверка прав и принадлежности
компании выполняется сервером по свежему disposable JWT, а не по UI-флагам.

Источники находятся в этой папке. После изменений запустить `node shared/company-entry/sync.mjs`
из корня репозитория. Это обновляет поставляемые локальные AMD-копии. Пустые origins
в исходном deployment-модуле блокируют вход с сообщением об отсутствии настройки.

Каждая команда упаковки требует публичные HTTPS origins без пути, credentials,
query и fragment. Секреты в эти параметры не передаются.

```sh
export COMPANY_ENTRY_CORE_ORIGIN=https://core.example.invalid
export COMPANY_ENTRY_FRONTEND_ORIGIN=https://teamos.example.invalid
```

Это примеры для изолированных fixture-архивов. Перед установкой пользователь
задаёт реальные origins и пересобирает пакет существующей командой своего виджета.
Core origin должен проксировать `/api/v1/widget/company/status` и `/entries`
на отдельный company-entry listener. Frontend origin должен обслуживать `/auth/amo`.

```sh
node --test shared/company-entry/company-entry.test.cjs shared/company-entry/mounts.test.cjs
node --test shared/company-entry/packaged.test.cjs
```

Последняя команда требует предварительно созданных четырёх fixture-архивов
с origins из примера. DOM-тесты используют jsdom из widget-app распределения.
Проверка упаковки не доказывает установку виджетов или готовность серверного входа.
