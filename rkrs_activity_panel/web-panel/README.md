# Контроль активности 2.0 — веб-панель

React 19 + TypeScript + Vite. Отдельное приложение: дневной экран, профиль
сотрудника, история задач и Imbox, оператор (план/факт), пропущенные звонки
и все настройки. Целевой backend — `amocrm-pro` (viewer API активности).
Неделя и месяц видны, но выключены. Глубина истории — один месяц.

План и аудит переноса (матрица сценариев, контракты C1–C8, исправления
F1–F11): `amocrm-pro/docs/proposals/activity-v2-plan.md`,
`activity-v2-audit.md`.

## Запуск

```bash
npm ci
npm run dev:fixtures   # синтетика, http://127.0.0.1:5173/#/p/demo
npm run dev            # hybrid: нужен ACTIVITY_API_ORIGIN в .env, ссылка вида #/p/<view_key>
npm test               # unit-тесты формул и правил (vitest)
npm run lint && npm run typecheck
npm run build          # production, режим live
npm run e2e            # Playwright-путь; сначала запустить dev:fixtures (E2E_URL, E2E_OUT)
```

Состояния на синтетике: `?fixture=error|empty|partial|stale|slow` перед `#`.

## Режимы данных

| Режим | Что показывает |
| --- | --- |
| `live` (production по умолчанию) | Только amocrm-pro. Блоки без контракта — «Источник не подключён · Cn». |
| `hybrid` (dev по умолчанию) | События и сотрудники из amocrm-pro; проблемные списки (C3) и сессии (C4) — синтетика с пометкой «синтетика». |
| `fixtures` | Всё синтетическое, жёлтый баннер. Не доказывает живую интеграцию. |

Подключено к amocrm-pro: `GET /api/v1/activity/view/panel`, `/view/timeline`,
`/view/employees/{id}`, `/view/events/{id}` (`Authorization: Bearer <view_key>`).
Ключ просмотра живёт только во фрагменте URL (`#/p/<key>`); в localStorage
пишется лишь хэш для ключа личных предпочтений. Факты звонка (C1) берутся из
`call_facts` некомпактной ленты/журнала: дополнительные карточки не нужны,
неизвестная длительность остаётся `null`, известный ноль — `0`. Обновление
backend реализовано локально; его наличие на сервере ещё нужно проверить.
Для старого backend: payload события, иначе карточки (≤ 150 за загрузку,
до 4 параллельно). Pending-факты не кешируются; готовые — на минуту.

Management API (`/api/v1/activity/panels`) требует серверный токен и
работает только через dev-proxy Vite: `ACTIVITY_MANAGEMENT_TOKEN`,
`ACTIVITY_INSTALLATION_ID`, `ACTIVITY_INTEGRATION_ID` в `.env` (без префикса
`VITE_`, в сборку не попадают). В production управление показано как
недоступное (C7).

## Структура

- `src/domain` — модели и формулы без React; каждая поверхность со своей
  формулой (процент dashboard, рейтинг профиля, анализ событий), без унификации.
- `src/api` — транспорт, ошибки amocrm-pro, адаптер viewer API, синтетика, hybrid.
- `src/settings` — переносимые модели и API настроек: личные предпочтения
  (localStorage), настройки панели (amocrm-pro + расширения C5), панель задач (C6).
- `src/features` — экраны: dashboard, employee, operator, missed, settings.
- `src/ui`, `src/styles` — примитивы и токены макета (только тёмная тема).
