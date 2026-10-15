'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Queue = require('../lib/request_queue');
const Api = require('../lib/amo_api');

test('queue is sequential and deduplicates equal GET work', async () => {
    const queue = new Queue.RequestQueue({ minInterval: 1 });
    const order = [];
    const first = queue.enqueue(async () => {
        order.push('first:start');
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('first:end');
        return 1;
    }, { key: 'same' });
    const duplicate = queue.enqueue(async () => 99, { key: 'same' });
    const second = queue.enqueue(async () => { order.push('second'); return 2; });

    assert.equal(first, duplicate);
    assert.deepEqual(await Promise.all([first, duplicate, second]), [1, 1, 2]);
    assert.deepEqual(order, ['first:start', 'first:end', 'second']);
});

test('default browser timer is wrapped instead of called with queue as receiver', () => {
    const queue = new Queue.RequestQueue();
    assert.equal(queue.minInterval, 1000);
    assert.notEqual(queue.setTimer, setTimeout);
    assert.notEqual(queue.now, Date.now);
});

test('queue retries 429 twice and 5xx once', async () => {
    const queue = new Queue.RequestQueue({ minInterval: 1, retry429: [1, 1], retry5xx: 1 });
    let attempts429 = 0;
    const result429 = await queue.enqueue(async () => {
        attempts429 += 1;
        if (attempts429 < 3) { throw { status: 429 }; }
        return 'ok';
    });
    let attempts500 = 0;
    await assert.rejects(queue.enqueue(async () => {
        attempts500 += 1;
        throw { status: 503 };
    }));

    assert.equal(result429, 'ok');
    assert.equal(attempts429, 3);
    assert.equal(attempts500, 2);
});

test('query encoder supports bracketed array filters', () => {
    const url = Api.appendQuery('/api/v4/tasks', {
        'filter[entity_type]': 'leads',
        'filter[entity_id]': [10, 11],
        limit: 1
    });
    assert.match(url, /filter%5Bentity_id%5D%5B%5D=10/);
    assert.match(url, /filter%5Bentity_id%5D%5B%5D=11/);
});

test('non-idempotent task POST with retry disabled is attempted only once', async () => {
    const client = Object.create(Api.AmoApiClient.prototype);
    client.queue = new Queue.RequestQueue({ minInterval: 1 });
    let attempts = 0;
    client._ajax = async () => { attempts += 1; throw { status: 503 }; };
    await assert.rejects(client.post('/api/v4/tasks', [{ text: 'test' }], { retry: false }));
    assert.equal(attempts, 1);
});

test('required complete pagination raises an error instead of reporting partial task results', async () => {
    const client = Object.create(Api.AmoApiClient.prototype);
    client.get = async () => ({ _embedded: { tasks: [] }, _links: { next: { href: '/next' } } });
    await assert.rejects(client.getAllPages('/api/v4/tasks', 'tasks', { maxPages: 1, requireComplete: true }),
        error => error.code === 'INCOMPLETE_PAGINATION');
});

test('pagination follows next even when amoCRM clamps page below requested limit', async () => {
    const client = Object.create(Api.AmoApiClient.prototype);
    client.get = async (path, query) => ({
        _embedded: { items: [{ id: query.page }] },
        _links: query.page === 1 ? { next: { href: '/page/2' } } : {}
    });
    const result = await client.getAllPages('/api/v4/example', 'items', { limit: 250 });
    assert.deepEqual(result, [{ id: 1 }, { id: 2 }]);
});
