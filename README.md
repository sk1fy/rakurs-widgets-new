# Виджеты Rakurs

Независимые приложения и установочные пакеты amoCRM. У каждого приложения свои
зависимости и команды; команды ниже выполняются из указанной папки.

| Проект | Назначение и документация | Разработка и проверка |
| --- | --- | --- |
| `rkrs_activity_panel/frontend/` | [Прототип аналитики дня, недели и месяца](rkrs_activity_panel/frontend/README.md) | `npm ci`, `npm run dev`, `npm test`, `npm run build` |
| `rkrs_activity_panel/widget-app/` | [Прототип панели amoCRM и симулятор](rkrs_activity_panel/widget-app/README.md) | `npm ci`, `npm run dev`, `npm test`, `npm run build:preview` |
| `rkrs_lead_distribution/widget-app/` | [Рабочий виджет распределения](rkrs_lead_distribution/widget-app/README.md) | `npm ci`, `npm run dev`, `npm test`, `npm run build:preview` |
| `rkrs_lead_notasks/` | [Контроль карточек без задач](rkrs_lead_notasks/README.md) | `npm test`, `npm run check`; [сборка и подключение](rkrs_lead_notasks/MVP-SETUP.md) |
| `integration-packages/amocrm-pro-service/` | [Полный интеграционный пакет](integration-packages/amocrm-pro-service/README.md) | `node --test verify.test.cjs`, `python3 pack.py` |

Для widget-app нужен Node.js 22.12+. Версии зависимостей и подробные параметры
упаковки указаны в README каждого проекта. Установка пакетов и публикация
ресурсов выполняются отдельно от локальной сборки.

Архитектура активности и открытые задачи собраны в [docs/activity](docs/activity/README.md).
`design/` и концепты интерфейсов
сохраняются как исходные материалы. ZIP и каталоги сборки генерируются заново
и не хранятся в Git. Копии изображений внутри `widget/images/` нужны каждому
самостоятельному пакету amoCRM.
