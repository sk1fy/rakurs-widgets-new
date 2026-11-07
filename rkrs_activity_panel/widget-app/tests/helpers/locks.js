export class LockManager {
  held = new Set();
  waiting = [];
  paused = false;

  request(name, options, callback) {
    if (options.ifAvailable !== true) throw new Error('Identity claims must not queue');
    return new Promise((resolve, reject) => {
      const grant = async () => {
        const available = !this.held.has(name);
        if (available) this.held.add(name);
        try { resolve(await callback(available ? { name, mode: 'exclusive' } : null)); }
        catch (error) { reject(error); }
        finally { if (available) this.held.delete(name); }
      };
      if (this.paused) this.waiting.push(grant);
      else queueMicrotask(grant);
    });
  }

  resume() {
    this.paused = false;
    for (const grant of this.waiting.splice(0)) queueMicrotask(grant);
  }
}

export function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clone: () => memoryStorage(values),
  };
}
