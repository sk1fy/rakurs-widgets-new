# @rakurs/widget-loader

Общий маршрутизатор **браузерного UI** ПВ-02.01. Он выбирает заранее включённый
в пакет адаптер SSD/Core. Серверные fences, installation lifecycle, billing и
право на изменения проверяются сервером; этот пакет их не заменяет.

## Использование

`createSDKOwnerLoader` из `sdk.mjs` принимает widget, apiUrl, обязательный
routePath, modules и onUnavailable. Запрос идёт только через SDK
`$authorizedAjax`. Адрес routePath согласуется и реализуется в ПВ-03;
существующий Distribution API такого endpoint пока не объявляет.

```js
import { createSDKOwnerLoader } from './sdk.mjs';
const loader = createSDKOwnerLoader({
  widget, apiUrl, routePath,
  modules: {
    'color-legacy-v1': {
      owner: 'ssd', product_code: 'color_leads', function_code: 'whole',
      cleanupVerified: true, // only after teardown conformance, never from server
      load: async context => createPreparedAdapter(context),
    },
  },
  onUnavailable: showUnavailable,
});
await loader.dispatch('render', [], context);
const saved = loader.call('onSave', [], context); // synchronous SDK return
await loader.destroy();
```

`context`: account_id (positive decimal string), product_code, function_code,
identity. Identity включает account/user/location/card и target экземпляра;
при смене пользователя, карточки или settings target consumer меняет identity.
`dispatch` объединяет одинаковые callbacks, ожидающие один route/module load.
Идемпотентность повторного mount обеспечивается адаптером и общим
[instance registry](../widget-runtime/README.md). `call` сохраняет синхронные
результаты; при неготовом/просроченном маршруте возвращает false.
Уничтоженный loader не переиспользуется — новый SDK instance получает новый.

## Предлагаемый browser wire-контракт для ПВ-03

POST на согласованный routePath, body только product_code/function_code;
account/user/installation определяются сервером из проверенного SDK principal.
Ответ напрямую, без envelope:

```json
{
  "account_id": "777",
  "product_code": "color_leads",
  "function_code": "whole",
  "owner": "ssd",
  "phase": "active",
  "routing_epoch": 1,
  "revision": 1,
  "installation_generation": 1,
  "ttl_ms": 60000,
  "module_key": "color-legacy-v1"
}
```

Это проект контракта, не существующий production endpoint. Сервер должен
возвращать остаточный TTL своего authoritative snapshot, а не продлевать старый
кэш ещё на 60 секунд. Время ожидания запроса/модуля дополнительно расходует TTL
по monotonic clock браузера. Неизвестный/отключённый scope не получает active.
module_key выбирается из allowlist сборки, совпадают owner/product/function;
URL или JavaScript из ответа никогда не исполняются. Обновление кода требует
нового ZIP, если отдельно не согласована remote-code политика.

Максимальный TTL — 60 секунд, timeout route — 12 секунд; загрузка модуля
ограничена оставшимся TTL. Только phase=active допускает UI. Пустой ответ,
ошибка, неизвестный module_key, чужой аккаунт, просроченный маршрут или
отсутствие cleanup запрещают загрузку; автоматического SSD fallback нет.
Watermark живёт в экземпляре loader: revision/epoch/generation не уменьшаются,
смена owner/module/generation требует нового routing_epoch и revision.
Это локальная защита, не долговременный реестр полномочий.

## Контракт адаптера и очистки

`load(context)` **инертен**: не добавляет UI, не подписывает глобальные события,
не начинает business requests. Он готовит `{invoke(name,args), destroy()}`.
Ресурсы подготовки принадлежат только этому адаптеру; при ошибке load сам их
освобождает. После timeout/destroy/смены контекста поздно полученный адаптер
уничтожается без invoke. Старый адаптер не может чистить DOM нового экземпляра.

`invoke` выполняет callback с нужной SDK семантикой. `destroy` немедленно
закрывает новые действия, затем синхронно либо Promise завершает очистку UI,
listeners, observers, timers и pending reads. Новый адаптер ждёт эту очистку;
ошибка drain блокирует последующие активации. Незавершённая внешняя запись
требует серверного протокола ПВ-01, а не обещания отмены через abort.

`createLegacyAdapter` сохраняет SDK this, callbacks facade, вложенные callbacks
(`leads.selected`) и синхронные значения Salesbot. Его можно применять только
к заранее проверенному **инертному конструктору** с корректным destroy.
Проверка наличия метода после вызова конструктора не является sandbox.
Текущие пилотные snapshots не удовлетворяют этому контракту, поэтому их
cleanupVerified/runtime_activation_allowed остаются false. Глобальные scripts
из legacy требуют отдельной проверки: они не автоматически совместимые AMD.

## Проверка

```sh
node --test packages/widget-loader/tests/*.test.mjs
python3 -m http.server 5182 --bind 127.0.0.1
# http://127.0.0.1:5182/examples/owner-routing/
```

Стенд использует общий SDK fixture: SSD/Core, offline, frozen, TTL, повторный
render и разные аккаунты. Он не подключён к реальным клиентам amoCRM.
