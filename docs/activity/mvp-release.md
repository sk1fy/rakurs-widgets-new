# Выпуск тестового MVP «Контроль активности 2.0»

Задача [КА-01.04](https://app.clickup.com/t/1amkccgcnzz).
Этот выпуск предназначен для согласованного тестового пилота. Установка
использует существующую private-интеграцию и её OAuth installation в Core;
ZIP не создаёт отдельную интеграцию и не содержит credentials.

Перед заменой существующего пакета сверить название и настоящий client UUID
в карточке amoCRM. Аккаунт и код Core сами по себе не определяют слот:
общую сервисную интеграцию нельзя заменять самостоятельным виджетом.
У другого client UUID отдельная регистрация Core, OAuth installation,
pilot и панель; история прежней установки автоматически не переносится.

При `installation: true` раздел `settings` должен содержать поле:
пустой объект отклоняется валидатором amoCRM. Поле `activity_panel` типа
`custom` представляет встроенную панель настроек, без фиктивного ввода.

## Публичные параметры

Перед сборкой оператор фиксирует три адреса в журнале выпуска:

| Параметр | Назначение |
| --- | --- |
| `ACTIVITY_API_ORIGIN` | HTTPS origin Core, без пути, query и fragment |
| `ACTIVITY_APP_ORIGIN` | HTTPS origin React-приложения, доступного от `/` |
| `ACTIVITY_ASSETS_URL` | HTTPS URL директории с `release.json` и UMD |

Core выдаёт вход в настройки как `APP_ORIGIN/#/settings/panels`: публикация
React только в подкаталоге без корневого маршрута не подходит. В Core
`ACTIVITY_APP_ORIGINS` должен разрешать application origin;
`ACTIVITY_APP_PUBLIC_ORIGIN` используется для ссылок на панели. Список
разрешённых origin для widget API выводится из активных installation amoCRM.

## Сборка

Из корня репозитория, на зафиксированном commit, Node.js 22.12+:

```sh
cd rkrs_activity_panel/widget-app
npm ci
VITE_ACTIVITY_API_ORIGIN="$ACTIVITY_API_ORIGIN" \
VITE_ACTIVITY_APP_ORIGIN="$ACTIVITY_APP_ORIGIN" npm run release
npm run package:widget -- --assets-url "$ACTIVITY_ASSETS_URL"
cd ../web-panel
npm ci
VITE_DATA_MODE=live VITE_ACTIVITY_API_BASE="$ACTIVITY_API_ORIGIN" \
  npm run build -- --base /activity-panel/
```

Результаты:

- `widget-app/dist-remote/`: именованный по SHA-256 UMD и `release.json`.
- `widget-app/dist-package/rkrs-activity-prototype.zip`: загрузчик,
  `manifest.json`, `i18n/`, `images/`; имя ZIP историческое, runtime — live.
- `web-panel/dist/`: production React. Симулятор и `dist-preview/` не публикуются.

Не запускать `npm test` после финальной сборки UMD: эта команда пересобирает
релиз с окружением тестового запуска. Если проверка запускается позже,
повторить финальную сборку с публичными параметрами. В журнале сохранить
commit, версии Node/npm, origins, SHA-256 ZIP, `release.json`, UMD и файлов
React. Credentials и ключи просмотра в журнал не включать.

## Публикация и проверка

1. Сохранить предыдущие static current/release.json, ZIP и backend image
   revisions. Для первого выпуска явно зафиксировать отсутствие предыдущего
   Activity static release; остальные приложения не заменять.
2. Загрузить весь новый React build и UMD в новую директорию выпуска.
   Старые UMD и React assets сохранить: ранее открытые вкладки ещё могут
   запрашивать старые файлы.
3. Для `release.json` и React `index.html` задать `Cache-Control: no-cache`;
   для файлов с hash в имени — `public, max-age=31536000, immutable`.
   `release.json` должен читаться из origin пилотной CRM по CORS GET.
   Публичные статические файлы не требуют cookie либо credentials.
4. Переключить static current и описание релиза атомарно; UMD должен быть
   доступен до переключения `release.json`. Проверить TLS, HTTP200,
   content types и равенство опубликованных SHA-256 локальным.
5. Проверить viewer/management OPTIONS из application origin и widget
   OPTIONS из origin CRM. Health backend и image revisions сверить через
   существующие deploy-помощники. Успех OPTIONS не подтверждает авторизацию.
6. Загрузить ZIP в существующую private-интеграцию тестового аккаунта.
   После открытия CRM подтвердить реальный SDK-запрос Activity state с
   ожидаемыми account/installation/integration и отображение панели.
   Секреты, widget JWT и URL browser-session не сохранять в отчёт.

Полная проверка старт/стоп/завершения и отказов — КА-01.05; ручная приёмка —
КА-01.06. HTTP200 ресурсов и health не заменяют эти проверки.

## Откат

Вернуть предыдущий static current и сохранённый `release.json` атомарно,
проверить HTTP и checksum, затем перезагрузить CRM/React: уже загруженный
UMD остаётся в памяти вкладки. Если менялся loader/manifest, восстановить
предыдущий ZIP в той же интеграции; смена только UMD не требует ZIP.

Backend и admin откатываются существующими deploy-помощниками на
зафиксированные до выпуска revisions с их preflight/health. Не восстанавливать
БД поверх новых данных ради отката статических файлов. При первом выпуске
откат static означает отключение нового маршрута/публикации, при сохранении
остальных приложений и записанных интервалов.

## Схема первого пилотного выпуска

Публичный HTTPS origin приложения и Core: `https://2-26-66-187.sslip.io`.
UMD размещается в `/activity-widget/`, React assets — в `/activity-panel/`.
Exact nginx location `/` отдаёт React `index.html`; существующие `/api/` и
остальные backend маршруты сохраняются. Для этого React собирается с
`--base /activity-panel/`, маршрутизация внутри приложения остаётся hash-based.

Bundle и checksum receipt хранятся вне Git, в каталоге оператора
`~/.codex/tmp/activity04-release/`. `release-receipt.json` фиксирует source
commit и build parameters; `SHA256SUMS` покрывает ZIP и все опубликованные
файлы. Живой статус публикации, Core/Admin revisions и резервные копии
фиксируются в серверном deployment receipt; сборка сама по себе не означает
успешного развёртывания или установки в CRM.
