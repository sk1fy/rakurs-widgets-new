'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function amd(file, ...dependencies) {
    let factory;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib', file + '.js'), 'utf8'), {
        define: (_, register) => { factory = register(); }, self: {}, console, setTimeout, clearTimeout, Map, Set, Promise
    });
    return typeof factory === 'function' ? factory(...dependencies) : factory;
}
const Constants = amd('constants');
const Rules = amd('rules', Constants);
const Snapshot = amd('snapshot', Constants, Rules);
const Assignment = amd('task_assignment', Constants);
const Runtime = amd('runtime', Constants, Rules, Snapshot, Assignment);
const ctx = { entityType: 'leads', entityId: 15, responsibleUserId: 42 };
const draft = { text: 'Проверить', taskTypeId: 1, completeTill: 1791290000 };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function guardWith(check, options = {}) {
    let replayed = 0, modals = 0;
    const guard = new Runtime.CardGuard({ resolver: { resolve: () => ctx }, engine: { match: () => ({ denyExit: true }) },
        taskChecker: { key: c => c.entityType + ':' + c.entityId, check, peek: () => null },
        ui: { showBlockModal() { modals++; return {}; }, notify() {} }, ...options });
    guard.pendingNavigation = { target: { click() { replayed++; } } };
    return { guard, counts: () => ({ replayed, modals }) };
}
test('actual AMD guard cannot block or replay navigation after runtime destroy', async () => {
    for (const state of [Constants.TASK_STATE.NO_TASK, Constants.TASK_STATE.HAS_TASK, Constants.TASK_STATE.UNKNOWN]) {
        const result = deferred();
        const { guard, counts } = guardWith(() => result.promise);
        const pending = guard._checkAndContinue(ctx);
        guard.unbind();
        result.resolve({ state }); await pending;
        assert.equal(guard.beforeUnloadBound, false);
        assert.deepEqual(counts(), { replayed: 0, modals: 0 });
    }
});
test('actual AMD unload priming does not revive a destroyed guard', async () => {
    const result = deferred(); const { guard } = guardWith(() => result.promise);
    const pending = guard.primeCurrent(); guard.unbind();
    result.resolve({ state: Constants.TASK_STATE.NO_TASK }); await pending;
    assert.equal(guard.beforeUnloadBound, false);
});
test('tab hidden while checking cancels pending navigation and permits a later fresh check', async () => {
    let active = true;
    const result = deferred(); const { guard, counts } = guardWith(() => result.promise, { isActive: () => active });
    const pending = guard._checkAndContinue(ctx); active = false;
    result.resolve({ state: Constants.TASK_STATE.HAS_TASK }); await pending;
    assert.equal(guard.checking, false); assert.equal(guard.pendingNavigation, null);
    assert.deepEqual(counts(), { replayed: 0, modals: 0 });
});
test('destroyed AMD task checker never requeries or caches a late response', async () => {
    const result = deferred(); let calls = 0;
    const checker = new Runtime.TaskChecker({ get() { calls++; return result.promise; } }, () => ({}));
    const pending = checker.check(ctx); checker.destroy();
    result.resolve({ _embedded: { tasks: [] } });
    assert.equal((await pending).state, Constants.TASK_STATE.UNKNOWN);
    assert.equal(checker.peek(ctx), null); assert.equal(calls, 1);
});
function storageFixture() {
    const data = new Map();
    return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) || null,
        setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
test('durable cross-tab write marker prevents another POST after timeout and controller reinitialization', async () => {
    const storage = storageFixture(); let tail = Promise.resolve(), writes = 0;
    const locks = { request(_, run) { const pending = tail.then(run); tail = pending.catch(() => {}); return pending; } };
    const api = { get: async () => ({ responsible_user_id: 42 }), post: async () => { writes++; throw { status: 503 }; } };
    const checker = { invalidate() {}, check: async () => ({ state: Constants.TASK_STATE.NO_TASK }) };
    const create = () => new Assignment.OwnerTaskService(api, checker, { accountId: 123, storage, locks });
    const outcomes = await Promise.allSettled([create().create(ctx, draft), create().create(ctx, draft)]);
    assert.ok(outcomes.every(o => o.status === 'rejected')); assert.equal(writes, 1); assert.equal(storage.length, 1);
    await assert.rejects(create().create(ctx, draft), /предыдущего создания неизвестен/);
    assert.equal(writes, 1);
    checker.check = async () => ({ state: Constants.TASK_STATE.HAS_TASK });
    assert.equal((await create().create(ctx, draft)).alreadyExists, true); assert.equal(storage.length, 0);
});
test('blocked storage, missing lock support and ownership change all prevent POST', async () => {
    let writes = 0, reads = 0;
    const api = { get: async () => ({ responsible_user_id: ++reads === 1 ? 42 : 77 }), post: async () => { writes++; } };
    const checker = { invalidate() {}, check: async () => ({ state: Constants.TASK_STATE.NO_TASK }) };
    await assert.rejects(new Assignment.OwnerTaskService(api, checker).create(ctx, draft), /изменился/);
    const storage = storageFixture();
    await assert.rejects(new Assignment.OwnerTaskService(api, checker, { accountId: 123, storage }).create(ctx, draft), /Браузер/);
    reads = 0; api.get = async () => ({ responsible_user_id: 42 }); storage.setItem = () => { throw new Error('QuotaExceeded'); };
    await assert.rejects(new Assignment.OwnerTaskService(api, checker, { accountId: 123, storage,
        locks: { request: (_, run) => run() } }).create(ctx, draft), /QuotaExceeded/);
    assert.equal(writes, 0);
});
test('overdue unfinished owner task satisfies the guard, completed overdue task does not', async () => {
    const task = { entity_type: 'leads', entity_id: 15, responsible_user_id: 42, complete_till: 1, is_completed: false };
    assert.equal(Assignment.matchesResponsible(task, ctx), true);
    assert.equal(Assignment.matchesResponsible({ ...task, is_completed: true }, ctx), false);
});
test('legacy customer candidate limit stays 250 and warns once about a partial list', async () => {
    let requests = 0, notices = 0;
    const service = new Runtime.ListModalService({ userId: 42, engine: {}, ui: { notify() { notices++; } },
        api: { get: async (_, query) => { requests++; assert.equal(query.limit, 250);
            return { _embedded: { customers: [{ id: 1 }] }, _links: { next: {} } }; } } });
    for (let i = 0; i < 2; i++) { assert.equal((await service._fetchCustomerCandidates({ all: true })).length, 1); }
    assert.equal(requests, 2); assert.equal(notices, 1);
});
test('confirmed POST still prevents a second tab write while task reads lag behind', async () => {
    const storage = storageFixture(); let writes = 0;
    const locks = { request: (_, run) => run() };
    const api = { get: async () => ({ responsible_user_id: 42 }), post: async () => {
        writes++; return { _embedded: { tasks: [{ entity_type: 'leads', entity_id: 15, responsible_user_id: 42, is_completed: false }] } };
    } };
    const checker = { invalidate() {}, check: async () => ({ state: Constants.TASK_STATE.NO_TASK }) };
    const create = () => new Assignment.OwnerTaskService(api, checker, { accountId: 123, storage, locks });
    await create().create(ctx, draft);
    await assert.rejects(create().create(ctx, draft), /предыдущего создания неизвестен/);
    assert.equal(writes, 1);
});
test('SPA navigation away while checking drops the old pending navigation', async () => {
    let current = ctx;
    const result = deferred();
    const { guard, counts } = guardWith(() => result.promise, { resolver: { resolve: () => current } });
    const pending = guard._checkAndContinue(ctx); current = null;
    result.resolve({ state: Constants.TASK_STATE.HAS_TASK }); await pending;
    assert.equal(guard.pendingNavigation, null); assert.deepEqual(counts(), { replayed: 0, modals: 0 });
});
test('destroyed list service stops an in-flight candidate scan before its next page', async () => {
    const response = deferred(); let reads = 0;
    const service = new Runtime.ListModalService({ userId: 42, engine: {}, ui: {},
        api: { get: () => { reads++; return response.promise; } } });
    const pending = service._fetchLeadCandidates({ statuses: [] });
    service.destroy(); response.resolve({ _embedded: { leads: [{ id: 1, responsible_user_id: 42 }] }, _links: { next: {} } });
    assert.equal((await pending).length, 0); assert.equal(reads, 1);
});
test('live card, actor, account, applicability and visibility fences prevent POST after either queued read', async () => {
    for (const change of ['entityId', 'responsibleUserId', 'currentUserId', 'accountId', 'hidden', 'disabled']) {
        for (const stage of ['task', 'owner']) {
            const original = { ...ctx, accountId: 123, currentUserId: 77 };
            let live = { ...original }, active = true, applicable = true, reads = 0, writes = 0;
            const storage = storageFixture(); const waiting = deferred();
            const controller = new Assignment.TaskAssignmentController({ accountId: 123,
                resolver: { resolve: () => live }, engine: { match: () => ({ denyExit: applicable }) },
                isActive: () => active,
                api: { get: async () => (++reads === 2 && stage === 'owner' ? waiting.promise : { responsible_user_id: 42 }),
                    post: async () => { writes++; } },
                taskChecker: { invalidate() {}, check: async () => stage === 'task' ? waiting.promise : { state: Constants.TASK_STATE.NO_TASK } }, ui: {} });
            controller.service.storage = storage; controller.service.locks = { request: (_, run) => run() };
            const pending = controller.service.create(original, draft);
            // Let the initial owner GET and task read enter their awaited phases.
            await new Promise(resolve => setImmediate(resolve));
            if (change === 'hidden') { active = false; }
            else if (change === 'disabled') { applicable = false; }
            else { live = { ...live, [change]: live[change] + 1 }; }
            waiting.resolve(stage === 'task' ? { state: Constants.TASK_STATE.NO_TASK } : { responsible_user_id: 42 });
            await assert.rejects(pending, /Карточка, сотрудник или вкладка изменились/);
            assert.equal(writes, 0, change + ':' + stage); assert.equal(storage.length, 0, change + ':' + stage);
        }
    }
});
test('queued cross-tab lock callback does not make requests after controller destroy', async () => {
    let callback, calls = 0;
    const service = new Assignment.OwnerTaskService({ get: async () => { calls++; } }, {}, {
        accountId: 123, storage: storageFixture(), locks: { request: (_, run) => { callback = run; return Promise.resolve().then(() => {}); } }
    });
    await service.create(ctx, draft); service.destroyed = true;
    await assert.rejects(callback(), /Карточка, сотрудник или вкладка изменились/);
    assert.equal(calls, 0);
});
function assignmentDom(initialAssignee) {
    let assignee = initialAssignee, warning = null, changed = 0;
    const nativeForm = { task_id: 9001 };
    function element() {
        return { length: 1, first() { return this; }, attr() { return this; }, addClass() { return this; },
            text() { return this; }, append() { return this; }, remove() { warning = null; }, trigger() { return this; } };
    }
    const input = { length: 1, val(value) { if (arguments.length) { assignee = value; return this; } return assignee; },
        trigger() { changed++; return this; } };
    const form = Object.assign(element(), { 0: nativeForm,
        find(selector) {
            if (selector === '.js-task-main_user') { return input; }
            if (selector === '.rkrs-wt-task-warning') { return warning || { length: 0 }; }
            if (selector === '[name="date"]') { return { val: () => '16.10.2026' }; }
            if (selector === '[name="time"]') { return { val: () => '15:00' }; }
            if (selector === '[name="body"]') { return { val: () => 'Существующая задача' }; }
            return { ...element(), val: () => 1 };
        }, append(node) { warning = node; return this; } });
    const $ = selector => {
        if (selector === '.feed-compose_task') { return form; }
        if (selector === '.rkrs-wt-task-warning') { return warning || { remove() {} }; }
        if (typeof selector === 'object') { return { closest: () => form }; }
        return element();
    };
    return { $, assignee: () => assignee, changed: () => changed, warning: () => Boolean(warning) };
}
test('actual AMD task controller preserves native edit or draft assignee through sync and owner change', () => {
    const dom = assignmentDom(77); let owner = 42, writes = 0;
    const controller = new Assignment.TaskAssignmentController({ $: dom.$,
        resolver: { resolve: () => ({ ...ctx, responsibleUserId: owner }) },
        engine: { match: () => ({ showModal: true }) }, taskChecker: {}, api: { post() { writes++; } }, ui: {} });
    controller.sync(); controller.sync(); owner = 99; controller.sync();
    assert.equal(dom.assignee(), 77); assert.equal(dom.changed(), 0);
    assert.equal(dom.warning(), true); assert.equal(writes, 0);
});
test('actual AMD task controller defaults only an empty assignee field to the card owner', () => {
    const dom = assignmentDom('');
    const controller = new Assignment.TaskAssignmentController({ $: dom.$,
        resolver: { resolve: () => ctx }, engine: { match: () => ({ denyExit: true }) }, taskChecker: {}, api: {}, ui: {} });
    controller.sync(); controller.sync();
    assert.equal(dom.assignee(), 42); assert.equal(dom.changed(), 1); assert.equal(dom.warning(), false);
});
test('actual AMD native edit submit remains native and separate helper opens only on explicit button', () => {
    const dom = assignmentDom(77); let confirmations = 0, writes = 0, prevented = 0;
    const controller = new Assignment.TaskAssignmentController({ $: dom.$,
        resolver: { resolve: () => ctx }, engine: { match: () => ({ denyExit: true }) },
        taskChecker: {}, api: { post() { writes++; } }, ui: { notify() {} } });
    controller.showConfirmation = () => { confirmations++; };
    function event(helper) {
        const target = { classList: { contains: name => helper && name === 'rkrs-wt-task-owner-button' } };
        return { target: { closest: () => target }, preventDefault() { prevented++; }, stopPropagation() {} };
    }
    controller._onClick(event(false));
    assert.equal(confirmations, 0); assert.equal(writes, 0); assert.equal(prevented, 0); assert.equal(dom.assignee(), 77);
    controller._onClick(event(true));
    assert.equal(confirmations, 1); assert.equal(writes, 0); assert.equal(prevented, 1); assert.equal(dom.assignee(), 77);
});
