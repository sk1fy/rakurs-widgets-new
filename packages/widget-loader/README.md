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
ограничена оставшимся TTL. На 80% срока loader обновляет маршрут в фоне.
Неизменные owner/module/epoch/generation продлевают lease без повторного load,
mount или destroy: интерфейс и черновик сохраняются. Поэтому onSave не ломается
через минуту при доступном актуальном маршруте.

При потере связи интерфейс остаётся **только для чтения**, адаптер синхронно
получает `setRouteState({status:'stale',route})`; callback-записи запрещены,
повторная проверка каждые 5 секунд. Последующий успешный ответ возвращает fresh
без remount. Просроченный lease проверяется также в call — suspended browser
не получает окно записи из-за задержанного таймера. Non-active phase сохраняет
проверенный readonly UI в paused. Первый non-active/неизвестный route не запускает
никакой модуль. Отказы авторизации и некорректный scope очищают прежний UI.

Изменение owner/module/epoch или installation generation завершает прежний
адаптер и выставляет reload-required через onStateChange; target в этом document
не запускается. Это избегает повтора callback с побочными эффектами. Новый
экземпляр после перезагрузки снова получает authoritative route. При новой
installation generation старые данные не остаются на экране.

Watermark живёт в экземпляре loader: revision/epoch/generation не уменьшаются.
Generation может вырасти отдельно от epoch, но только при выросшей revision.
Смена owner/module требует epoch новее последнего active. Freezing резервирует
новый epoch, поэтому подтверждённый target вправе активироваться в том же
зарезервированном epoch. Это локальная проверка, не реестр полномочий.

LocalStorage не даёт права загрузить legacy после отказа Core. Серверное
исключение SSD из ADR-0040 требует durable grant/fence, которого браузер не
видит. До появления guarded fallback-контракта нельзя выкатывать общий loader
всем SSD-аккаунтам вместе с публичным ZIP. Сохранение уже открытого readonly UI
не означает разрешение нового offline-старта legacy.

## Контракт адаптера и очистки

`load(context)` **инертен**: не добавляет UI, не подписывает глобальные события,
не начинает business requests. Он готовит `{invoke(name,args), setRouteState(state), destroy()}`.
Ресурсы подготовки принадлежат только этому адаптеру; при ошибке load сам их
освобождает. После timeout/destroy/смены контекста поздно полученный адаптер
уничтожается без invoke. Старый адаптер не может чистить DOM нового экземпляра.

`setRouteState` — обязательный **синхронный** fence, не Promise. При stale/paused
он блокирует controls, самостоятельные listeners/timers и новые запросы с
эффектами, сохраняет только безопасный UI/черновик и помечает его устаревшим.
При fresh разрешает работу с новым подтверждённым снимком. Ошибка/асинхронная
реализация fence приводит к destroy, а не к сохранению активного runtime под
табличкой «только чтение». `onStateChange` уведомляет оболочку; сам по себе он
не защищает продуктовые обработчики. Если адаптер не может гарантировать
readonly, он пока несовместим с этим loader.

`load` также получает `canInvoke()`: адаптер проверяет его непосредственно перед
каждым эффектом из собственного DOM listener, timer или async continuation.
Это закрывает просроченный lease даже при задержке фоновых таймеров браузера.
Проверка возвращает false при смене экземпляра/установки, expiry и destroy;
серверная авторизация всё равно обязательна. Consumer сохраняет один loader
на lifecycle SDK-экземпляра и не пересоздаёт его для обхода reload-required
при обычной SPA-навигации.

`invoke` выполняет callback с нужной SDK семантикой. `destroy` немедленно
закрывает новые действия, затем синхронно либо Promise завершает очистку UI,
listeners, observers, timers и pending reads. Новый адаптер ждёт эту очистку;
ошибка drain блокирует последующие активации. Незавершённая внешняя запись
требует серверного протокола ПВ-01, а не обещания отмены через abort.

`createLegacyAdapter` сохраняет SDK this, callbacks facade, вложенные callbacks
(`leads.selected`) и синхронные значения Salesbot. Его можно применять только
к заранее проверенному **инертному конструктору** с корректными destroy и
callbacks.onRouteState (делегат синхронного fence).
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
