# Ракурс — кабинет менеджеров

Приватный пакет для единственного аккаунта `rakurscrm.amocrm.ru`.
Настройки виджета дают ссылку на «Установки» кабинета менеджеров.

## Сборка

```sh
python3 integration-packages/rakurscrm-manager/pack.py --output /tmp/rakurscrm-manager-1.0.0.zip
```

## Установка

Создайте в rakurscrm отдельную приватную интеграцию «Ракурс — кабинет
менеджеров». В настройках загрузите ZIP и укажите согласованный с Core
OAuth Redirect URI. Для этой интеграции зарегистрируйте собственные
Client ID и Client Secret в Core через действующий секретный контур.
Установите виджет в rakurscrm и подтвердите права для сделок.

Зафиксируйте ID аккаунта, интеграции и созданной установки для привязки
`COMPANY_CRM_*` в Core и `PLATFORM_COMPANY_*` в Platform. В кабинете
задайте воронку и стартовый этап для нужных клиентских виджетов.
Сервер использует эту привязку для обращений к amoCRM после закрытия
браузера. ZIP содержит интерфейс настроек и ссылку на кабинет.

[Структура виджета amoCRM](https://www.amocrm.ru/developers/content/integrations/structure)
[Документация по OAuth](https://www.amocrm.ru/developers/content/oauth/oauth)
