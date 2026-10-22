# Shared amoCRM runtime (ПВ-02.03)

Dependency-free ESM for all widget applications. Vite bundles production exports
from `index.mjs`; no runtime script URL, OAuth token or global SDK replacement is
introduced. Distribution uses the shared transport and lifecycle registry now.
Product endpoint contracts, view models and rendering remain in each product.

## Authorized requests

```js
import { createAuthorizedClient } from "../../packages/widget-runtime/index.mjs";

const api = createAuthorizedClient(widget, "https://core.example.test/api/v1/widget/color");
const bootstrap = await api.request("/bootstrap");
// A read-only POST opts out of mutation uncertainty explicitly.
const state = await api.request("/runtime", { body: { kind: "settings" }, write: false });
await api.request("/runtime", { body: { write: true, requestId, payload } });
api.destroy();
```

Only `widget.$authorizedAjax` sends requests. Account/user identity is not copied
into authorization headers. Absolute base URLs require HTTPS without credentials;
root-relative bases support same-origin development fixtures. Paths remain under
the configured base. The server must independently authenticate the SDK identity
and authorize product, tenant and operation.

The result is `{data, status}` (including 202). `APIError` contains `status` and
`unknown`: a dispatched mutation's timeout, network failure, 5xx or cancellation
has an uncertain outcome. It is never retried automatically. The consumer must
retain its operation identity and reconcile before a new mutation. POST defaults
to a mutation; explicitly pass `write:false` for POST read envelopes. Default
deadline is 12 seconds; `timeoutMs` can be overridden. `destroy()` rejects pending
promises, clears timers, aborts transport when supported and ignores late replies.

## Lifecycle and identity

```js
import { createInstanceIdentity, createInstanceRegistry } from "../../packages/widget-runtime/index.mjs";

const instances = createInstanceRegistry((state) => {
  state.api.destroy();
  clearTimeout(state.timer);
  state.target.replaceChildren();
});
const identity = createInstanceIdentity({
  accountId, userId, productCode: "color", mode: "card", entityId: leadId,
  installationGeneration,
});
const state = instances.mount({ widget, target, identity }, (context) => ({
  ...context, api: createAuthorizedClient(widget, apiUrl), alive: true,
}));
instances.destroy(widget);
```

One SDK widget object owns one mounted surface. Separate widget objects can
coexist. The same target and identity reuse the state; changed account, user,
product, mode, entity, generation or target disposes the previous instance before
mounting another. The key is collision-safe JSON, for local lifecycle use only,
never a server credential. Factory and cleanup are synchronous; factories own
cleanup if they throw before returning. Check `state.alive` after every async
boundary before rendering. Timers, listeners and subscriptions belong in cleanup.
If SDK code re-enters `destroy()` while a factory is creating its state, the
returned state is disposed and never published; `mount()` returns `undefined`.
Cleanup must remove only nodes/listeners owned by that instance, because a
re-entrant replacement may already have mounted into the same target.

## Generic development fixture

`testing/fixture.mjs` is a separate entry point and **must not be imported by a
production entry**. It contains no network fallback. Missing fixtures return 404.
It simulates SDK jqXHR `.done/.fail/.abort`, account/user constants, current card,
arbitrary widget constructors, transport errors and 202 responses.

```js
import { createSDKFixture } from "../../packages/widget-runtime/testing/fixture.mjs";

const fixture = createSDKFixture({
  accountId: "777", userId: "42", entityId: "501",
  handle({ options, body, context }) {
    if (options.url.endsWith("/bootstrap")) return { data: { state: "active" } };
    if (body?.write) return { status: 409, message: "Fixture conflict" };
    // undefined -> 404; never calls a real backend.
  },
});
window.AMOCRM = fixture.amoCRM; // explicit development harness only
const widget = fixture.createWidget(WidgetConstructor, {
  renderTemplate: (options) => { target.innerHTML = options.render; },
});
widget.callbacks.settings(target);
fixture.setIdentity({ entityId: "502" });
widget.callbacks.destroy();
widget.callbacks.render();
// teardown (also in Vite HMR dispose):
widget.callbacks.destroy();
fixture.destroy();
```

For deterministic tests pass `manual:true`, inspect `fixture.requests`, and call
`requests[n].resolve(data, status)` or `.reject(status, message)`. Each record
captures its dispatch-time context and parsed body. `delayMs` applies to automatic
handlers. Fixtures are an SDK contract simulator, not evidence of real amoCRM
authorization, marketplace acceptance or backend tenant isolation.

Run shared tests from the repository root:

```sh
node --test packages/widget-runtime/tests/*.test.mjs
```

Distribution's existing client/runtime regression tests also exercise this
package through its real UMD build. Its browser preview uses the same fixture
transport with product-specific data handlers.

`npm run dev -- --port 5183` in `rkrs_lead_distribution/widget-app` starts the
preview on a different port if the default 5178 is occupied. Vite serves the
explicitly imported shared fixture outside the app root; no unrestricted
`server.fs.allow` is needed. `tests/dev-server.test.js` verifies the actual HTTP
module imports, as production builds alone do not exercise development serving.
