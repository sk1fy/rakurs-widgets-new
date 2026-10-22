/** Browser UI selection, never execution authorization or an offline SSD grant. */
export function createOwnerLoader(options) {
  const { resolveRoute, modules, onUnavailable = () => {}, onStateChange = () => {} } = options;
  const now = options.now || (() => performance.now());
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  const requestTimeout = options.requestTimeoutMs ?? 12000;
  if (!Number.isFinite(requestTimeout) || requestTimeout <= 0 || requestTimeout > 60000)
    throw new Error('Invalid route timeout');
  let generation = 0, selected = null, pending = null, scopeKey = null;
  let renewal = null, expiry = null, disposed = false, reloadRequired = false;
  let retiring = null, disposalError = null;
  const events = new Map(), watermarks = new Map();

  function bounded(promise, ms, lateCleanup) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const deadline = setTimer(() => {
        finished = true; reject(new Error('Route or module load timed out'));
      }, Math.max(1, ms));
      Promise.resolve(promise).then(value => {
        if (finished) {
          if (lateCleanup) Promise.resolve().then(() => lateCleanup(value)).catch(error => {
            disposalError = error; invalidate(); onUnavailable(error);
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
  function clearTimers() {
    clearTimer(renewal); clearTimer(expiry); renewal = expiry = null;
  }
  function clearSelected() {
    clearTimers();
    const previous = selected; selected = null;
    if (previous) {
      let cleanup;
      try { cleanup = Promise.resolve(previous.adapter.destroy()); }
      catch (error) { cleanup = Promise.reject(error); }
      retiring = Promise.all([retiring, cleanup]);
      retiring.catch(error => { disposalError = error; });
    }
  }
  function invalidate() {
    generation++; pending = null; events.clear(); clearSelected();
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
        route.product_code !== context.product_code || route.function_code !== context.function_code ||
        !['ssd', 'core'].includes(route.owner) ||
        !['active', 'freezing', 'frozen', 'preparing', 'activating', 'blocked'].includes(route.phase) ||
        !Number.isSafeInteger(route.routing_epoch) || route.routing_epoch < 1 ||
        !Number.isSafeInteger(route.revision) || route.revision < 1 ||
        !Number.isSafeInteger(route.installation_generation) || route.installation_generation < 1 ||
        !Number.isFinite(route.ttl_ms) || route.ttl_ms <= 0 || route.ttl_ms > 60000 ||
        typeof route.module_key !== 'string' || !Object.hasOwn(modules, route.module_key))
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
    const owner = JSON.stringify([route.owner, route.module_key]);
    const fingerprint = JSON.stringify([owner, route.installation_generation, route.routing_epoch, route.phase]);
    if (mark && (route.revision < mark.revision || route.routing_epoch < mark.epoch ||
        route.installation_generation < mark.installationGeneration ||
        route.revision === mark.revision && fingerprint !== mark.fingerprint ||
        route.phase === 'active' && route.routing_epoch === mark.activeEpoch && owner !== mark.activeOwner))
      throw new Error('Stale or conflicting route');
    watermarks.set(scope, { revision: route.revision, epoch: route.routing_epoch,
      installationGeneration: route.installation_generation, owner, fingerprint,
      activeEpoch: route.phase === 'active' ? route.routing_epoch : mark?.activeEpoch,
      activeOwner: route.phase === 'active' ? owner : mark?.activeOwner });
    return { module, expires };
  }
  function setState(status, observedRoute = selected?.route) {
    if (!selected) return;
    selected.status = status; // block loader callbacks before touching adapter code
    try {
      // Must synchronously fence handlers/timers/requests; stale DOM alone is unsafe.
      const result = selected.adapter.setRouteState({ status, route: observedRoute });
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch(() => {});
        throw new Error('Route state fence must be synchronous');
      }
    } catch (error) {
      clearSelected(); throw error;
    }
    onStateChange({ status, route: observedRoute });
  }
  function retry(context, gen) {
    clearTimer(renewal);
    renewal = setTimer(() => {
      if (!disposed && gen === generation && selected?.status !== 'reload-required')
        prepare(context, true).catch(() => {});
    }, 5000);
  }
  function arm(context, gen) {
    clearTimers();
    const remaining = selected.expires - now();
    expiry = setTimer(() => {
      if (disposed || gen !== generation || !selected) return;
      try { setState('stale'); }
      catch (error) { onUnavailable(error); return; }
      prepare(context, true).catch(() => {});
    }, remaining);
    renewal = setTimer(() => {
      if (!disposed && gen === generation) prepare(context, true).catch(() => {});
    }, Math.max(1, remaining * 0.8));
  }
  function prepare(context, force = false) {
    if (disposed) return Promise.reject(new Error('Widget destroyed'));
    const nextKey = keyOf(context);
    if (scopeKey !== nextKey) { invalidate(); scopeKey = nextKey; }
    if (reloadRequired) return Promise.resolve(null);
    if (pending) return pending;
    if (!force && selected?.status === 'fresh' && selected.expires > now())
      return Promise.resolve(selected);
    if (selected && selected.expires <= now()) setState('stale');
    const gen = generation;
    const attempt = (async () => {
      if (retiring) await retiring;
      if (disposalError) throw disposalError;
      if (disposed || gen !== generation) return null;
      const started = now();
      const route = await bounded(resolveRoute({ account_id: String(context.account_id),
        product_code: context.product_code, function_code: context.function_code }), requestTimeout);
      if (disposed || gen !== generation) return null;
      let checked;
      try { checked = validate(route, context, started); }
      catch (error) { error.invalidRoute = true; throw error; }
      const { module, expires } = checked;
      if (selected && selected.route.installation_generation !== route.installation_generation) {
        reloadRequired = true; clearSelected();
        onStateChange({ status: 'reload-required', route }); return null;
      }
      if (route.phase !== 'active') {
        clearTimers();
        if (selected) { setState('paused', route); retry(context, gen); }
        else throw new Error('Route is not active');
        return null;
      }
      if (selected) {
        const old = selected.route;
        if (old.owner !== route.owner || old.module_key !== route.module_key ||
            old.routing_epoch !== route.routing_epoch || old.installation_generation !== route.installation_generation) {
          reloadRequired = true; clearSelected();
          onStateChange({ status: 'reload-required', route }); return null;
        }
        selected.route = Object.freeze({ ...route }); selected.expires = expires;
        setState('fresh'); arm(context, gen); return selected;
      }
      let adapter;
      const canInvoke = () => !disposed && gen === generation && selected?.adapter === adapter &&
        selected?.status === 'fresh' && selected.expires > now();
      adapter = await bounded(module.load({ ...context, route, canInvoke }), expires - now(), late => late?.destroy?.());
      if (!adapter || typeof adapter.invoke !== 'function' || typeof adapter.destroy !== 'function' ||
          typeof adapter.setRouteState !== 'function') {
        await adapter?.destroy?.(); throw new Error('Invalid widget adapter: synchronous route state fence required');
      }
      if (disposed || gen !== generation || expires <= now()) {
        await adapter.destroy();
        if (!disposed && gen === generation) throw new Error('Route expired during module load');
        return null;
      }
      selected = { adapter, route: Object.freeze({ ...route }), expires, status: 'fresh' };
      setState('fresh'); arm(context, gen); return selected;
    })();
    pending = attempt;
    attempt.then(() => { if (pending === attempt) pending = null; }, error => {
      if (pending === attempt) pending = null;
      if (gen !== generation || disposed) return;
      clearTimers();
      const denied = error.status >= 400 && error.status < 500 && error.status !== 429;
      if (selected && !error.invalidRoute && !denied) {
        try { setState('stale'); retry(context, gen); }
        catch (fenceError) { onUnavailable(fenceError); }
      } else { clearSelected(); onUnavailable(error); }
    });
    return attempt;
  }
  return {
    dispatch(name, args, context) {
      let prepared;
      try { prepared = prepare(context); }
      catch (error) { invalidate(); return Promise.reject(error); }
      const marker = {}; events.set(name, marker); const gen = generation;
      return prepared.then(state => {
        if (!state || disposed || gen !== generation || events.get(name) !== marker) return;
        events.delete(name);
        if (state !== selected || state.status !== 'fresh' || state.expires <= now()) return;
        return state.adapter.invoke(name, args);
      });
    },
    call(name, args, context, unavailable = false) {
      if (disposed) return unavailable;
      let nextKey;
      try { nextKey = keyOf(context); } catch { invalidate(); return unavailable; }
      if (scopeKey !== nextKey) { invalidate(); scopeKey = nextKey; }
      if (!selected || selected.status !== 'fresh') return unavailable;
      if (selected.expires <= now()) {
        try { setState('stale'); prepare(context, true).catch(() => {}); }
        catch (error) { onUnavailable(error); }
        return unavailable;
      }
      return selected.adapter.invoke(name, args);
    },
    refresh(context) {
      try { return prepare(context, true); }
      catch (error) { invalidate(); return Promise.reject(error); }
    },
    snapshot() { return selected?.status === 'fresh' && selected.expires > now() ? selected.route : null; },
    status() { return reloadRequired ? 'reload-required' : selected?.status || 'unavailable'; },
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
  if (!callbacks || typeof callbacks.destroy !== 'function' || typeof callbacks.onRouteState !== 'function')
    throw new Error('Legacy cleanup and route-state fence have not been implemented');
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
    setRouteState(state) { if (alive) return callbacks.onRouteState.call(widget, state); },
    destroy() { if (alive) { alive = false; return callbacks.destroy.call(widget); } },
  };
}
