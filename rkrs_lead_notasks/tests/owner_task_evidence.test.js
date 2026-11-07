'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Assignment = require('../lib/task_assignment');
const Constants = require('../lib/constants');

const context = { entityType: 'leads', entityId: 15, responsibleUserId: 42 };
const draft = { text: 'Проверить оплату', completeTill: 1791290000, taskTypeId: 1 };
const marker = 'rkrs_wt_task_write_v1:123:leads:15';
const uncertainty = /предыдущего создания неизвестен/;

function storageFixture() {
    const data = new Map();
    return { get length() { return data.size; }, key: i => [...data.keys()][i],
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

function fixture({ storage = storageFixture(), idOnly = false } = {}) {
    let writes = 0, state = Constants.TASK_STATE.NO_TASK;
    let detail = { id: 101, entity_id: 15, entity_type: 'leads', responsible_user_id: 42, is_completed: false };
    const reads = [];
    const api = {
        get: async path => {
            reads.push(path);
            if (path.startsWith('/api/v4/tasks/')) {
                if (detail instanceof Error || detail && detail.status) { throw detail; }
                return detail;
            }
            return { responsible_user_id: 42 };
        },
        post: async () => {
            writes++;
            return { _embedded: { tasks: [idOnly ? { id: 100 + writes } : { ...detail, id: 100 + writes }] } };
        }
    };
    const checker = { invalidate() {}, check: async () => ({ state }) };
    const createService = () => new Assignment.OwnerTaskService(api, checker,
        { accountId: 123, storage, locks: { request: (_, run) => run() } });
    return { api, checker, storage, reads, createService, writes: () => writes,
        state: value => { state = value; }, detail: value => { detail = value; } };
}

test('ID-only create acknowledgement succeeds even while task lists are empty', async () => {
    const f = fixture({ idOnly: true });
    const outcome = await f.createService().create(context, draft).catch(error => ({ error: error.message }));
    assert.deepEqual(outcome, { alreadyExists: false });
    assert.equal(f.writes(), 1);
});

test('completed identified task permits another create in the same service, a new tab, and memory mode', async () => {
    for (const mode of ['same', 'new-tab', 'memory']) {
        const f = fixture({ storage: mode === 'memory' ? null : storageFixture() });
        const service = f.createService();
        await service.create(context, draft);
        f.detail({ id: 101, is_completed: true });
        const next = mode === 'new-tab' ? f.createService() : service;
        const outcome = await next.create(context, draft).catch(error => ({ error: error.message }));
        assert.deepEqual(outcome, { alreadyExists: false }, mode);
        assert.equal(f.writes(), 2, mode);
        assert.ok(f.reads.includes('/api/v4/tasks/101'), mode);
    }
});

test('identified active task returns alreadyExists across tabs while task list lags', async () => {
    const f = fixture();
    await f.createService().create(context, draft);
    const result = await f.createService().create(context, draft).catch(error => ({ error: error.message }));
    assert.deepEqual(result, { alreadyExists: true });
    assert.equal(f.writes(), 1);
});

test('HAS_TASK keeps identified protection for a later tab with a lagging empty list', async () => {
    const f = fixture();
    const original = f.createService();
    await original.create(context, draft);
    f.state(Constants.TASK_STATE.HAS_TASK);
    assert.deepEqual(await f.createService().create(context, draft), { alreadyExists: true });
    f.state(Constants.TASK_STATE.NO_TASK);
    assert.deepEqual(await f.createService().create(context, draft), { alreadyExists: true });
    assert.equal(f.writes(), 1);
    f.detail({ id: 101, is_completed: 1 });
    assert.deepEqual(await original.create(context, draft), { alreadyExists: false });
    assert.equal(f.writes(), 2);
});

test('old and malformed legacy markers remain protected without expiry', async () => {
    for (const value of [JSON.stringify({ createdAt: 1, responsibleUserId: 42 }), '{broken', '', 'null', 'false']) {
        const f = fixture();
        f.storage.setItem(marker, value);
        await assert.rejects(f.createService().create(context, draft), uncertainty);
        assert.equal(f.writes(), 0, value);
    }
});

test('untrusted detail identity, completion and read failures cannot retire evidence', async () => {
    const invalid = [null, {}, { id: 101 }, { id: 101, is_completed: 'true' }, { id: 101, is_completed: 2 },
        { id: 102, is_completed: true }, { id: 101, is_completed: true, entity_id: 16 },
        { id: 101, is_completed: true, entity_type: 'customers' },
        { id: 101, is_completed: true, responsible_user_id: 77 },
        { id: '101', is_completed: true }, { id: 101, is_completed: true, account_id: 999 },
        { status: 404 }, new Error('offline')];
    for (const detail of invalid) {
        const f = fixture();
        await f.createService().create(context, draft);
        f.detail(detail);
        await assert.rejects(f.createService().create(context, draft), uncertainty);
        assert.equal(f.writes(), 1);
        assert.ok(f.storage.getItem(marker));
    }
});

test('invalid response IDs never become completion evidence', async () => {
    for (const id of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, {}, true, '', ' ', '101x', '101']) {
        const f = fixture();
        f.api.post = async () => ({ _embedded: { tasks: [
            { id, entity_id: 15, entity_type: 'leads', responsible_user_id: 42, is_completed: false }
        ] } });
        await f.createService().create(context, draft);
        f.detail({ id: 101, is_completed: true });
        await assert.rejects(f.createService().create(context, draft), uncertainty);
        assert.equal(f.reads.some(path => path.startsWith('/api/v4/tasks/')), false);
    }
});

test('over 256 acknowledged writes do not exhaust the current account ambiguity budget', async () => {
    const f = fixture();
    f.api.post = async (_, payload) => ({ _embedded: { tasks: [{
        id: payload[0].entity_id, ...payload[0], is_completed: false
    }] } });
    for (let i = 1; i <= 257; i++) {
        const outcome = await f.createService().create({ ...context, entityId: i }, draft)
            .catch(error => ({ error: error.message }));
        assert.deepEqual(outcome, { alreadyExists: false }, 'entity ' + i);
    }
});

test('ambiguity budget counts only the current account, including malformed markers', async () => {
    for (const account of [123, 456]) {
        const f = fixture();
        for (let i = 1; i <= 256; i++) { f.storage.setItem('rkrs_wt_task_write_v1:' + account + ':leads:' + (1000 + i), '{broken'); }
        const operation = f.createService().create(context, draft);
        if (account === 123) {
            await assert.rejects(operation, /лимит неподтверждённых/);
            assert.equal(f.writes(), 0);
        } else {
            assert.deepEqual(await operation, { alreadyExists: false });
            assert.equal(f.writes(), 1);
        }
    }
});

test('failed evidence acknowledgement or deletion preserves protection', async () => {
    const f = fixture();
    const setItem = f.storage.setItem;
    let calls = 0;
    f.storage.setItem = (key, value) => { if (++calls > 1) { throw new Error('QuotaExceeded'); } setItem(key, value); };
    await assert.rejects(f.createService().create(context, draft), /QuotaExceeded/);
    assert.equal(f.writes(), 1);
    await assert.rejects(f.createService().create(context, draft), uncertainty);
    assert.equal(f.writes(), 1);

    const completed = fixture();
    await completed.createService().create(context, draft);
    completed.detail({ id: 101, is_completed: true });
    completed.storage.removeItem = () => {};
    await assert.rejects(completed.createService().create(context, draft));
    assert.equal(completed.writes(), 1);
});

test('detail reconciliation rechecks current context and owner before a replacement POST', async () => {
    for (const change of ['context', 'owner']) {
        const f = fixture();
        await f.createService().create(context, draft);
        const service = f.createService();
        let current = true;
        service.isCurrent = () => current;
        const get = f.api.get;
        f.api.get = async path => {
            if (path.startsWith('/api/v4/tasks/')) {
                if (change === 'context') { current = false; }
                else { f.api.get = async () => ({ responsible_user_id: 77 }); }
                return { id: 101, is_completed: true };
            }
            return get(path);
        };
        await assert.rejects(service.create(context, draft), /изменил/);
        assert.equal(f.writes(), 1);
    }
});
