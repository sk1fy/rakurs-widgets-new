import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientIdentity } from '../src/client-identity.js';
import { LockManager, memoryStorage } from './helpers/locks.js';

const storedId = '11111111-1111-4111-8111-111111111111';
const key = 'rkrs-activity-client:test';
const flush = () => new Promise(setImmediate);

test('the granted identity is ready while its exclusive lock stays held until disposal', async () => {
  const locks = new LockManager(), storage = memoryStorage([[key, storedId]]);
  const identity = createClientIdentity({ storage, key, locks });
  assert.deepEqual(await identity.ready, { id: storedId, persistent: true });
  assert.deepEqual([...locks.held], [`${key}:${storedId}`]);
  identity.dispose(); await flush();
  assert.equal(locks.held.size, 0);
});

for (const failure of ['missing storage', 'read storage', 'write storage', 'ignored storage', 'rejected locks', 'throwing locks']) {
  test(`${failure} uses an unpersisted identity and releases any grant`, async () => {
    const locks = new LockManager();
    let persisted = storedId;
    const storage = failure === 'missing storage' ? null : {
      getItem() { if (failure === 'read storage') throw Error('disabled'); return persisted; },
      setItem(key, value) { if (failure === 'write storage') throw Error('quota'); if (failure !== 'ignored storage') persisted = value; },
    };
    if (failure === 'ignored storage') persisted = 'malformed';
    if (failure === 'rejected locks') locks.request = () => Promise.reject(Error('unavailable'));
    if (failure === 'throwing locks') locks.request = () => { throw Error('unavailable'); };
    const identity = createClientIdentity({ storage, key, locks });
    const result = await identity.ready;
    assert.equal(result.persistent, false);
    assert.notEqual(result.id, storedId);
    assert.notEqual(persisted, result.id);
    await flush(); assert.equal(locks.held.size, 0);
    identity.dispose();
  });
}

test('repeated UUID collisions have bounded claims and fall back without ownership', async () => {
  let claims = 0;
  const storage = memoryStorage([[key, storedId]]);
  const identity = createClientIdentity({ storage, key, locks: { async request(name, options, callback) { claims++; return callback(null); } } });
  const result = await identity.ready;
  assert.equal(claims, 3);
  assert.equal(result.persistent, false);
  assert.notEqual(result.id, storedId);
  assert.equal(storage.getItem(key), storedId);
  identity.dispose();
});

test('disposal settles readiness even before a delayed grant callback runs', async () => {
  const locks = new LockManager(); locks.paused = true;
  const storage = memoryStorage([[key, storedId]]);
  const identity = createClientIdentity({ storage, key, locks });
  identity.dispose();
  assert.equal(await identity.ready, null);
  locks.resume(); await flush();
  assert.equal(storage.getItem(key), storedId);
  assert.equal(locks.held.size, 0);
});

test('disposal between grant and persistence releases the lock without storing an identity', async () => {
  const locks = new LockManager(), storage = memoryStorage();
  const identity = createClientIdentity({ storage, key, locks });
  queueMicrotask(() => identity.dispose());
  assert.equal(await identity.ready, null);
  await flush();
  assert.equal(storage.getItem(key), null);
  assert.equal(locks.held.size, 0);
});
