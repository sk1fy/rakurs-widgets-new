// Identity is an opaque local cache/lifecycle key, never an authorization claim.
export function createInstanceIdentity({
  accountId, userId, productCode, mode, entityId = null, installationGeneration = null,
}) {
  const required = { accountId, userId, productCode, mode };
  for (const [key, value] of Object.entries(required)) {
    if (value === null || value === undefined || String(value).trim() === "")
      throw new TypeError(`Missing instance ${key}`);
  }
  return JSON.stringify([
    ...Object.values(required).map(String),
    entityId === null ? null : String(entityId),
    installationGeneration === null ? null : String(installationGeneration),
  ]);
}

// One mounted surface per SDK widget object. Separate widget objects coexist.
// Factories must return state synchronously; their async work must check alive.
export function createInstanceRegistry(dispose = () => {}) {
  const instances = new WeakMap();
  const generations = new WeakMap();
  function destroy(widget) {
    const generation = (generations.get(widget) || 0) + 1;
    generations.set(widget, generation);
    const state = instances.get(widget);
    if (!state) return generation;
    instances.delete(widget);
    state.alive = false;
    dispose(state);
    return generation;
  }
  return {
    get: (widget) => instances.get(widget),
    mount(context, createState) {
      if (!context.widget || !["object", "function"].includes(typeof context.widget)
          || !context.target || typeof context.identity !== "string" || !context.identity)
        throw new TypeError("Widget, target and identity are required");
      const current = instances.get(context.widget);
      if (current?.target === context.target && current.identity === context.identity)
        return current;
      const generation = destroy(context.widget);
      if (generations.get(context.widget) !== generation) return;
      const state = createState(context);
      if (!state || typeof state.then === "function")
        throw new TypeError("Instance factory must return state synchronously");
      state.target = context.target;
      state.identity = context.identity;
      // SDK dispatch may synchronously invoke destroy or start another mount
      // before the factory returns. Never publish that abandoned instance.
      if (generations.get(context.widget) !== generation) {
        state.alive = false;
        dispose(state);
        return;
      }
      state.alive = true;
      instances.set(context.widget, state);
      return state;
    },
    destroy,
  };
}
