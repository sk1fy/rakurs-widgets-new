'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Assignment = require('../lib/task_assignment');
const Runtime = require('../lib/runtime');
const Constants = require('../lib/constants');

const context = { entityType: 'leads', entityId: 15, responsibleUserId: 42, currentUserId: 77 };
const task = { id: 1, entity_id: 15, entity_type: 'leads', responsible_user_id: 42, is_completed: false };
const draft = { text: 'Проверить оплату', completeTill: 1791290000, taskTypeId: 1, duration: 0 };
const emptyJquery = () => ({ length: 0, first() { return this; } });

test('only an incomplete task of the deal owner closes the condition', () => {
    assert.equal(Assignment.matchesResponsible(task, context), true);
    assert.equal(Assignment.matchesResponsible({ ...task, responsible_user_id: 77 }, context), false);
    assert.equal(Assignment.matchesResponsible({ ...task, is_completed: true }, context), false);
    assert.equal(Assignment.matchesResponsible({ ...task, entity_type: 'customers' }, context), false);
    assert.equal(Assignment.matchesResponsible({ ...task, entity_id: 16 }, context), false);
    assert.equal(Assignment.matchesResponsible({ entity_id: 15 }, context), false);
});

test('another employee task does not satisfy card guard, including a misleading DOM state', async () => {
    const checker = new Runtime.TaskChecker({ get: async () => ({ _embedded: { tasks: [{ ...task, responsible_user_id: 77 }] } }) }, emptyJquery);
    checker.localState = () => Constants.TASK_STATE.HAS_TASK;
    assert.equal((await checker.check(context)).state, Constants.TASK_STATE.NO_TASK);
});

test('unknown owner does not substitute the logged-in employee or make a request', async () => {
    const checker = new Runtime.TaskChecker({ get: async () => { throw new Error('must not query'); } }, emptyJquery);
    assert.equal((await checker.check({ ...context, responsibleUserId: null })).state, Constants.TASK_STATE.UNKNOWN);
});

test('malformed API response is unknown instead of declaring a deal taskless', async () => {
    const checker = new Runtime.TaskChecker({ get: async () => ({ unexpected: true }) }, emptyJquery);
    assert.equal((await checker.check(context)).state, Constants.TASK_STATE.UNKNOWN);
    assert.equal(checker.peek(context), null);
});

test('task changes in the feed outside the today-task container invalidate checks; composer warnings do not', () => {
    const taskNode = { nodeType: 1, matches: () => true, closest: () => null };
    assert.equal(Runtime.isTaskMutation({ target: taskNode, addedNodes: [], removedNodes: [] }), true);
    const unrelated = { nodeType: 1, matches: () => false, closest: () => null, querySelector: () => null };
    assert.equal(Runtime.isTaskMutation({ target: unrelated, removedNodes: [taskNode] }), true);
    assert.equal(Runtime.isTaskMutation({ target: unrelated, addedNodes: [unrelated] }), false);
    const warning = { nodeType: 1, matches: () => false, closest: () => ({ className: 'feed-compose_task' }), querySelector: () => null };
    assert.equal(Runtime.isTaskMutation({ target: warning, addedNodes: [warning] }), false);
});

test('cache follows changes of deal owner', async () => {
    const queriedOwners = [];
    const checker = new Runtime.TaskChecker({ get: async (path, query) => {
        queriedOwners.push(query['filter[responsible_user_id]']);
        return { _embedded: { tasks: query['filter[responsible_user_id]'] === 42 ? [task] : [] } };
    } }, emptyJquery);
    assert.equal((await checker.check(context)).state, Constants.TASK_STATE.HAS_TASK);
    assert.equal((await checker.check({ ...context, responsibleUserId: 77 })).state, Constants.TASK_STATE.NO_TASK);
    assert.deepEqual(queriedOwners, [42, 77]);
    checker.invalidate(context);
    assert.equal(checker.peek({ ...context, responsibleUserId: 77 }), null);
});

test('cache invalidation during a request causes a fresh query before returning', async () => {
    let resolveOld;
    let calls = 0;
    const checker = new Runtime.TaskChecker({ get: async () => {
        calls += 1;
        if (calls === 1) { return new Promise(resolve => { resolveOld = resolve; }); }
        return { _embedded: { tasks: [task] } };
    } }, emptyJquery);
    const pending = checker.check(context);
    checker.invalidate(context);
    resolveOld({ _embedded: { tasks: [] } });
    assert.equal((await pending).state, Constants.TASK_STATE.HAS_TASK);
    assert.equal(calls, 2);
});

function serviceFixture({ owner = 42, state = Constants.TASK_STATE.NO_TASK } = {}) {
    const writes = [];
    const api = {
        get: async () => ({ responsible_user_id: owner }),
        post: async (path, payload, options) => {
            writes.push({ path, payload, options });
            return { _embedded: { tasks: [{ ...task, ...payload[0], is_completed: false }] } };
        }
    };
    const checker = { invalidate() {}, check: async () => ({ state }) };
    return { writes, api, checker, service: new Assignment.OwnerTaskService(api, checker) };
}

test('separate task copies content and deadline and uses the deal owner', async () => {
    const fixture = serviceFixture();
    assert.deepEqual(await fixture.service.create(context, draft), { alreadyExists: false });
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.writes[0].payload[0].responsible_user_id, 42);
    assert.equal(fixture.writes[0].payload[0].text, draft.text);
    assert.equal(fixture.writes[0].payload[0].complete_till, draft.completeTill);
    assert.equal(fixture.writes[0].options.retry, false);
});

test('concurrent creation clicks share one POST', async () => {
    const fixture = serviceFixture();
    await Promise.all([fixture.service.create(context, draft), fixture.service.create(context, draft)]);
    assert.equal(fixture.writes.length, 1);
});

test('an existing task of the deal owner prevents creating a duplicate', async () => {
    const fixture = serviceFixture({ state: Constants.TASK_STATE.HAS_TASK });
    assert.deepEqual(await fixture.service.create(context, draft), { alreadyExists: true });
    assert.equal(fixture.writes.length, 0);
});

test('owner changes and task API errors stop the additional POST', async () => {
    const changed = serviceFixture({ owner: 77 });
    await assert.rejects(changed.service.create(context, draft), /Ответственный.*изменился/);
    assert.equal(changed.writes.length, 0);
    const unknown = serviceFixture({ state: Constants.TASK_STATE.UNKNOWN });
    await assert.rejects(unknown.service.create(context, draft), /Не удалось проверить/);
    assert.equal(unknown.writes.length, 0);
});

test('invalid draft cannot create a task', async () => {
    const fixture = serviceFixture();
    for (const invalid of [{ ...draft, text: '' }, { ...draft, completeTill: NaN }, { ...draft, taskTypeId: 0 }]) {
        await assert.rejects(fixture.service.create(context, invalid), /Укажите текст/);
    }
    assert.equal(fixture.writes.length, 0);
});

test('list rejects foreign, completed, and unrelated tasks even if API returns them', async () => {
    const service = new Runtime.ListModalService({
        api: { getAllPages: async () => [
            { ...task, entity_id: 1, responsible_user_id: 77 },
            { ...task, entity_id: 2, is_completed: true },
            { ...task, entity_id: 3 },
            { ...task, entity_id: 4, entity_type: 'customers' }
        ] }, engine: {}, ui: {}, userId: 42
    });
    assert.deepEqual((await service._filterTaskless('leads', [1, 2, 3, 4].map(id => ({ id, responsible_user_id: 42 })))).map(e => e.id), [1, 2, 4]);
});

test('lead candidate selection continues past 250 leads and rejects foreign owners', async () => {
    const pages = [];
    const service = new Runtime.ListModalService({
        api: { get: async (path) => {
            const page = Number(new URL(path, 'https://test.invalid').searchParams.get('page'));
            pages.push(page);
            return page === 1 ? {
                _embedded: { leads: Array.from({ length: 250 }, (_, i) => ({ id: i + 1, responsible_user_id: 42 })) },
                _links: { next: { href: 'next' } }
            } : { _embedded: { leads: [{ id: 251, responsible_user_id: 42 }, { id: 252, responsible_user_id: 77 }] } };
        } }, engine: {}, ui: {}, userId: 42
    });
    const result = await service._fetchLeadCandidates({ statuses: [{ pipeline_id: 10, status_id: 20 }], responsibleOnly: true });
    assert.equal(result.length, 251);
    assert.deepEqual(pages, [1, 2]);
});

test('refresh updates an existing modal and removes resolved deals without reopening', async () => {
    let updated;
    const service = new Runtime.ListModalService({
        api: {}, engine: { myRules: () => [{ showModal: true }], match: () => ({ showModal: true }) }, userId: 42,
        ui: { entitiesModal: { entityType: 'leads', updateEntities: entities => { updated = entities; } },
            showEntitiesModal: () => { throw new Error('must update existing modal'); }, notify() {} }
    });
    service._leadsWithoutTasks = async () => [];
    await service.run('llist');
    assert.deepEqual(updated, []);
});

// Exercise the actual controller timer, not a manual second run of the modal.
test('dismissed reminder returns on the same page until the owner has a task; hidden tab stays idle', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 });
    let active = true, missing = true, opened = 0, reads = 0;
    const ui = { entitiesModal: null, notify() {}, showEntitiesModal() { opened++; this.entitiesModal = { entityType: 'leads', updateEntities() {} }; } };
    const service = new Runtime.ListModalService({ userId: 42, api: {}, ui,
        engine: { myRules: () => [{ showModal: true }], match: () => ({ showModal: true }) }, isActive: () => active });
    service._leadsWithoutTasks = async () => { reads++; return missing ? [{ id: 15, responsible_user_id: 42 }] : []; };
    service._leadStageNames = async () => ({});
    const controller = new Runtime.RuntimeController({ widget: {}, $: () => ({}), api: {}, accountId: 1 });
    controller.init = () => true;
    controller.guard = { bind() {} };
    controller._syncTaskObserver = () => {};
    controller._isActiveTab = () => active;
    controller.resolver = { resolve: () => null, area: () => 'llist' };
    controller.ui = ui; controller.listModal = service;
    controller.bind();
    const tick = async (ms) => { t.mock.timers.tick(ms); await new Promise(setImmediate); };
    await tick(1000); assert.equal(opened, 1);
    ui.entitiesModal = null;
    await tick(29000); assert.equal(opened, 1);
    await tick(1000); assert.equal(opened, 2);
    ui.entitiesModal = null; missing = false;
    await tick(30000); assert.equal(opened, 2);
    active = false; const previousReads = reads;
    await tick(30000); assert.equal(reads, previousReads);
    clearInterval(controller.refreshTimer); service.destroy();
});

test('slow reminder scan cannot overlap the next polling interval', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1000 });
    let finish, reads = 0;
    const service = new Runtime.ListModalService({ userId: 42, api: {}, ui: { notify() {} },
        engine: { myRules: () => [{ showModal: true }] } });
    service._leadsWithoutTasks = () => { reads++; return new Promise(resolve => { finish = resolve; }); };
    const first = service.run('llist');
    t.mock.timers.tick(31000);
    await service.run('llist'); assert.equal(reads, 1);
    finish([]); await first;
    const second = service.run('llist'); assert.equal(reads, 2);
    finish([]); await second;
});
