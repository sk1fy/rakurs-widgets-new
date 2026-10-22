/**
 * Browser UI selection, never execution authorization. Every server operation
 * still needs the PV-03 lifecycle/ownership fence. No implicit SSD fallback.
 * Kept dependency-free so the same implementation can be bundled into AMD ZIPs.
 */
export function createOwnerLoader(options) {
  const { resolveRoute, modules, onUnavailable = () => {} } = options;
  const now = options.now || (() => performance.now());
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  const maxAge = 60000;
  const requestTimeout = options.requestTimeoutMs ?? 12000;
  if (!Number.isFinite(requestTimeout) || requestTimeout <= 0 || requestTimeout > maxAge)
    throw new Error('Invalid route timeout');
  let generation = 0, selected = null, pending = null, scopeKey = null;
  let timer = null, disposed = false;
  let retiring = null, disposalError = null;
  const events = new Map();
  const watermarks = new Map();
  function bounded(promise, ms, lateCleanup) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const deadline = setTimer(() => {
        finished = true;
        reject(new Error('Route or module load timed out'));
      }, Math.max(1, ms));
      Promise.resolve(promise).then(value => {
        if (finished) {
          if (lateCleanup) Promise.resolve().then(() => lateCleanup(value)).catch(error => {
            disposalError = error;
            invalidate();
            onUnavailable(error);
          });
          return;
        }
        finished = true; clearTimer(deadline); resolve(value);
      }, error => {
        if (finished) return;
        finished = true; clearTimer(deadline); reject(error);
      });
    });
  }
  function clearSelected() {
    clearTimer(timer);
    timer = null;
    const previous = selected;
    selected = null;
    if (previous) {
      let cleanup;
      try { cleanup = Promise.resolve(previous.adapter.destroy()); }
      catch (error) { cleanup = Promise.reject(error); }
      retiring = Promise.all([retiring, cleanup]);
      // Observe immediately; a failed drain blocks all future activation.
      retiring.catch(error => { disposalError = error; });
    }
  }
  function invalidate() {
    generation += 1;
    pending = null;
    events.clear();
    clearSelected();
  }
  function keyOf(context) {
    if (!context || !/^[1-9][0-9]*$/.test(String(context.account_id)) ||
        !/^[a-z][a-z0-9_-]*$/.test(context.product_code || '') ||
        !/^[a-z][a-z0-9_-]*$/.test(context.function_code || '') ||
        typeof context.identity !== 'string' || !context.identity)
      throw new Error('Invalid widget context');
    return JSON.stringify([String(context.account_id), context.product_code,
      context.function_code, context.identity]);
  }
  function validate(route, context, started) {
    if (!route || String(route.account_id) !== String(context.account_id) ||
        route.product_code !== context.product_code ||
        route.function_code !== context.function_code ||
        !['ssd', 'core'].includes(route.owner) || route.phase !== 'active' ||
        !Number.isSafeInteger(route.routing_epoch) || route.routing_epoch < 1 ||
        !Number.isSafeInteger(route.revision) || route.revision < 1 ||
        !Number.isSafeInteger(route.installation_generation) || route.installation_generation < 1 ||
        !Number.isFinite(route.ttl_ms) || route.ttl_ms <= 0 || route.ttl_ms > maxAge ||
        typeof route.module_key !== 'string' ||
        !Object.hasOwn(modules, route.module_key))
      throw new Error('Route unavailable or incompatible');
    const module = modules[route.module_key];
    if (module.owner !== route.owner || module.product_code !== context.product_code ||
        module.function_code !== context.function_code || typeof module.load !== 'function' ||
        module.cleanupVerified !== true)
      throw new Error('Module not approved for this route');
    const expires = started + route.ttl_ms;
    if (expires <= now()) throw new Error('Route expired in transit');
    const scope = JSON.stringify([String(route.account_id), route.product_code, route.function_code]);
    const mark = watermarks.get(scope);
    const fingerprint = JSON.stringify([route.owner, route.module_key, route.installation_generation, route.routing_epoch]);
    if (mark && (route.revision < mark.revision || route.routing_epoch < mark.epoch ||
        route.installation_generation < mark.installationGeneration ||
        (route.revision === mark.revision || route.routing_epoch === mark.epoch) && fingerprint !== mark.fingerprint))
      throw new Error('Stale or conflicting route');
    watermarks.set(scope, { revision: route.revision, epoch: route.routing_epoch,
      installationGeneration: route.installation_generation, fingerprint });
    return { module, expires };
  }
  function prepare(context) {
    if (disposed) return Promise.reject(new Error('Widget destroyed'));
    const nextKey = keyOf(context);
    if (scopeKey !== nextKey) { invalidate(); scopeKey = nextKey; }
    if (selected && selected.expires > now()) return Promise.resolve(selected);
    if (pending) return pending;
    clearSelected();
    const gen = generation, started = now();
    const attempt = (async () => {
      if (retiring) await retiring;
      if (disposalError) throw disposalError;
      if (disposed || gen !== generation) return null;
      // SDK transport supplies its own finite timeout; arbitrary code URLs are
      // not accepted from this response. Only prepackaged module keys are valid.
      const route = await bounded(resolveRoute({ account_id: String(context.account_id),
        product_code: context.product_code, function_code: context.function_code }), requestTimeout);
      if (disposed || gen !== generation) return null;
      const { module, expires } = validate(route, context, started);
      const adapter = await bounded(module.load({ ...context, route }), expires - now(),
        late => late?.destroy?.());
      if (!adapter || typeof adapter.invoke !== 'function' || typeof adapter.destroy !== 'function')
        throw new Error('Invalid widget adapter');
      if (disposed || gen !== generation || expires <= now()) {
        await adapter.destroy();
        if (!disposed && gen === generation) throw new Error('Route expired during module load');
        return null;
      }
      selected = { adapter, route: Object.freeze({ ...route }), expires };
      timer = setTimer(() => {
        if (gen !== generation || disposed) return;
        invalidate();
        onUnavailable(new Error('Route expired; open the widget again'));
      }, expires - now());
      return selected;
    })();
    pending = attempt;
    attempt.then(() => { if (pending === attempt) pending = null; }, (error) => {
      if (pending === attempt) pending = null;
      if (gen === generation && !disposed) { clearSelected(); onUnavailable(error); }
    });
    return attempt;
  }
  return {
    /** Coalesce repeated init/render while a route or module is loading. */
    dispatch(name, args, context) {
      let prepared;
      try { prepared = prepare(context); } catch (error) { invalidate(); return Promise.reject(error); }
      const marker = {};
      events.set(name, marker);
      const gen = generation;
      return prepared.then((state) => {
        if (!state || disposed || gen !== generation || events.get(name) !== marker) return;
        events.delete(name);
        if (state !== selected || state.expires <= now()) return;
        return state.adapter.invoke(name, args);
      });
    },
    /** Preserve synchronous SDK callbacks (onSave, salesbot designer, etc.). */
    call(name, args, context, unavailable = false) {
      if (disposed) return unavailable;
      let nextKey;
      try { nextKey = keyOf(context); } catch (error) { invalidate(); return unavailable; }
      if (scopeKey !== nextKey) { invalidate(); scopeKey = nextKey; }
      if (!selected || selected.expires <= now()) { clearSelected(); return unavailable; }
      return selected.adapter.invoke(name, args);
    },
    refresh(context) { invalidate(); return prepare(context); },
    snapshot() { return selected && selected.expires > now() ? selected.route : null; },
    destroy() { if (!disposed) { disposed = true; invalidate(); } return retiring || Promise.resolve(); },
  };
}

/** Wrap a classic AMD widget constructor without changing amoCRM's SDK this. */
export function createLegacyAdapter(Constructor, widget, facade) {
  if (typeof Constructor !== 'function') throw new Error('Invalid legacy constructor');
  const previous = widget.callbacks;
  let callbacks;
  try { Constructor.call(widget); callbacks = widget.callbacks; }
  finally { widget.callbacks = facade || previous; }
  if (!callbacks || typeof callbacks.destroy !== 'function')
    throw new Error('Legacy cleanup has not been implemented');
  let alive = true;
  return {
    invoke(name, args = []) {
      if (!alive) return false;
      const parts = name.split('.');
      let receiver = callbacks;
      for (const part of parts.slice(0, -1)) receiver = receiver?.[part];
      const fn = receiver?.[parts.at(-1)];
      return typeof fn === 'function' ? fn.apply(widget, args) : true;
    },
    destroy() { if (alive) { alive = false; return callbacks.destroy.call(widget); } },
  };
}
