const validId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');

export function createClientIdentity({ storage, key, locks }) {
  let disposed = false, release = null, resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const fallback = () => {
    release?.();
    release = null;
    resolveReady(disposed ? null : { id: crypto.randomUUID(), persistent: false });
  };
  function claim(id) {
    return new Promise(resolve => {
      try {
        Promise.resolve(locks.request(`${key}:${id}`, { ifAvailable: true }, lock => {
          if (!lock || disposed) { resolve(false); return; }
          const held = new Promise(done => { release = done; });
          resolve(true);
          return held;
        })).catch(() => resolve(null));
      } catch { resolve(null); }
    });
  }
  async function acquire() {
    try {
      if (!storage || typeof locks?.request !== 'function') return fallback();
      const stored = storage.getItem(key);
      let id = validId(stored) ? stored : crypto.randomUUID();
      for (let attempt = 0; attempt < 3 && !disposed; attempt++) {
        const granted = await claim(id);
        if (disposed) return;
        if (granted === null) return fallback();
        if (granted) {
          storage.setItem(key, id);
          if (storage.getItem(key) !== id) return fallback();
          resolveReady({ id, persistent: true });
          return;
        }
        id = crypto.randomUUID();
      }
      fallback();
    } catch { fallback(); }
  }
  void acquire();
  return {
    ready,
    dispose() { disposed = true; release?.(); release = null; resolveReady(null); },
  };
}
