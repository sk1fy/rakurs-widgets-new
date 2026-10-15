'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Constants = require('../lib/constants');
const Runtime = require('../lib/runtime');

function emptyJquery() {
    return {
        length: 0,
        first() { return this; }
    };
}

test('amoCRM area aliases are normalized to domain locations', () => {
    assert.equal(Runtime.normalizeArea('lcard-0'), 'lcard');
    assert.equal(Runtime.normalizeArea('leads_card'), 'lcard');
    assert.equal(Runtime.normalizeArea('customers_card'), 'cucard');
    assert.equal(Runtime.normalizeArea('leads_pipeline'), 'llist');
    assert.equal(Runtime.normalizeArea('leads-pipeline'), 'llist');
    assert.equal(Runtime.normalizeArea('todo-list'), 'todo');
    assert.equal(Runtime.normalizeArea('todo-line'), 'todo');
    assert.equal(Runtime.normalizeArea('todo-calendar'), 'todo');
    assert.equal(Runtime.normalizeArea('tlist'), 'todo');
    assert.equal(Runtime.normalizeArea('tline'), 'todo');
    assert.equal(Runtime.normalizeArea('tcalendar'), 'todo');
});

test('entity modal pagination limits every page to ten rows', () => {
    const entities = Array.from({ length: 31 }, (_, index) => ({ id: index + 1 }));
    assert.deepEqual(Runtime.entityPage(entities, 1, 10).map((item) => item.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(Runtime.entityPage(entities, 3, 10).map((item) => item.id), [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    assert.deepEqual(Runtime.entityPage(entities, 4, 10).map((item) => item.id), [31]);
});

test('pagination shows at most five numbers including the current page', () => {
    assert.deepEqual(Runtime.paginationPages(1, 25), [1, 2, 3, 4, 5]);
    assert.deepEqual(Runtime.paginationPages(13, 25), [11, 12, 13, 14, 15]);
    assert.deepEqual(Runtime.paginationPages(25, 25), [21, 22, 23, 24, 25]);
    for (let total = 1; total <= 25; total += 1) {
        for (let current = 1; current <= total; current += 1) {
            const pages = Runtime.paginationPages(current, total);
            assert.equal(pages.length, Math.min(5, total));
            assert.ok(pages.includes(current));
            assert.ok(pages[0] >= 1);
            assert.ok(pages.at(-1) <= total);
        }
    }
});

test('CardContextResolver ignores generic everywhere areas and falls back to the URL', () => {
    global.location = { pathname: '/leads/detail/15' };
    global.AMOCRM = { getWidgetsArea: () => 'everywhere' };
    const resolver = new Runtime.CardContextResolver({ system: () => ({ area: 'everywhere' }) }, emptyJquery);
    assert.equal(resolver.area(), 'lcard');
    const outerSpaceResolver = new Runtime.CardContextResolver({ system: () => ({ area: 'outer_space' }) }, emptyJquery);
    assert.equal(outerSpaceResolver.area(), 'lcard');
    delete global.AMOCRM;
    delete global.location;
});

test('CardContextResolver reads responsible user from current_card.main_user', () => {
    global.APP = {
        data: {
            current_card: {
                id: 15,
                main_user: { id: 42 },
                getStatusId: () => 20,
                getSinglePipelineId: () => 10
            }
        },
        constant: (name) => name === 'user' ? { id: 42 } : {}
    };
    const jquery = () => ({ first() { return this; }, attr() { return null; }, val() { return null; } });
    const resolver = new Runtime.CardContextResolver({ system: () => ({ area: 'lcard-0' }) }, jquery);
    const context = resolver.resolve();
    delete global.APP;

    assert.equal(context.entityId, 15);
    assert.equal(context.responsibleUserId, 42);
    assert.equal(context.pipelineId, 10);
    assert.equal(context.statusId, 20);
});

test('card navigation guard recognizes contact links but ignores local controls', () => {
    global.location = { href: 'https://example.amocrm.ru/leads/detail/1' };
    function target(attributes) {
        return {
            getAttribute: (name) => attributes[name] || null,
            hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attributes, name),
            matches: () => false
        };
    }
    assert.equal(Runtime.isPageNavigationTarget(target({ href: '/contacts/detail/2' })), true);
    assert.equal(Runtime.isPageNavigationTarget(target({ href: '/leads/detail/1#tasks' })), false);
    assert.equal(Runtime.isPageNavigationTarget(target({ href: '#' })), false);
    assert.equal(Runtime.isPageNavigationTarget(target({ href: '/contacts/detail/2', target: '_blank' })), false);
    delete global.location;
});

test('TaskChecker falls back to Tasks API and deduplicates with TTL cache', async () => {
    let calls = 0;
    let query;
    const api = {
        get: async (path, receivedQuery) => {
            calls += 1;
            query = receivedQuery;
            return { _embedded: { tasks: [{ id: 1, entity_id: 15, entity_type: 'leads', responsible_user_id: 42, is_completed: false }] } };
        }
    };
    const checker = new Runtime.TaskChecker(api, emptyJquery, { ttl: 30000 });
    const context = { entityType: 'leads', entityId: 15, currentUserId: 77, responsibleUserId: 42 };

    assert.equal((await checker.check(context)).state, Constants.TASK_STATE.HAS_TASK);
    assert.equal((await checker.check(context)).state, Constants.TASK_STATE.HAS_TASK);
    assert.equal(calls, 1);
    assert.equal(query['filter[responsible_user_id]'], 42);
});

test('TaskChecker returns UNKNOWN instead of blocking on API errors', async () => {
    const checker = new Runtime.TaskChecker({ get: async () => { throw { status: 503 }; } }, emptyJquery);
    const result = await checker.check({ entityType: 'customers', entityId: 9, currentUserId: 77, responsibleUserId: 77 });
    assert.equal(result.state, Constants.TASK_STATE.UNKNOWN);
    assert.equal(result.error.status, 503);
});

test('CardGuard primes beforeunload only after a confirmed missing task', async () => {
    const context = { entityType: 'leads', entityId: 15 };
    const result = { state: Constants.TASK_STATE.NO_TASK, source: 'api' };
    const guard = new Runtime.CardGuard({
        $: emptyJquery,
        resolver: { resolve: () => context },
        engine: { match: () => ({ denyExit: true }) },
        taskChecker: {
            key: () => 'leads:15',
            check: async () => result,
            peek: () => result
        },
        ui: {}
    });

    await guard.primeCurrent();
    let prevented = false;
    const event = { preventDefault: () => { prevented = true; }, returnValue: false };
    assert.equal(guard._onBeforeUnload(event), true);
    assert.equal(prevented, true);
    assert.equal(event.returnValue, true);
});

test('CardGuard keeps beforeunload fail-open when task state is unknown', async () => {
    const context = { entityType: 'leads', entityId: 15 };
    const guard = new Runtime.CardGuard({
        $: emptyJquery,
        resolver: { resolve: () => context },
        engine: { match: () => ({ denyExit: true }) },
        taskChecker: {
            key: () => 'leads:15',
            check: async () => ({ state: Constants.TASK_STATE.UNKNOWN, source: 'api' }),
            peek: () => null
        },
        ui: {}
    });

    await guard.primeCurrent();
    assert.equal(guard.beforeUnloadBound, false);
});

test('ListModalService verifies lead candidates through Tasks API', async () => {
    const calls = [];
    let taskQuery;
    const api = {
        get: async (path) => {
            calls.push(path);
            if (path === '/api/v4/leads/pipelines') {
                return { _embedded: { pipelines: [{ id: 10, name: 'Воронка', _embedded: { statuses: [{ id: 20, name: 'Квалификация' }] } }] } };
            }
            return {
                _embedded: {
                    leads: [
                        { id: 1, name: 'Без задачи', price: 15000, pipeline_id: 10, status_id: 20, responsible_user_id: 7 },
                        { id: 2, name: 'С задачей', pipeline_id: 10, status_id: 20, responsible_user_id: 7 }
                    ]
                }
            };
        },
        getAllPages: async (path, key, options) => {
            calls.push(path);
            taskQuery = options.query;
            return [{ entity_id: 2, entity_type: 'leads', responsible_user_id: 7, is_completed: false }];
        }
    };
    let shown = [];
    const service = new Runtime.ListModalService({
        api,
        engine: {
            myRules: () => [{ showModal: true, customers: false, pipelines: [{ pipeline_id: 10, status_ids: [20] }] }],
            match: () => ({ showModal: true })
        },
        ui: { showEntitiesModal: (entities) => { shown = entities; }, notify: () => {} },
        accountId: 1,
        userId: 7,
        snapshotHash: 'hash',
        sessionStorage: {
            getItem: () => 'shown-by-an-earlier-list-view',
            setItem: () => { throw new Error('modal display must not be persisted'); }
        }
    });

    const result = await service.run('todo');
    assert.deepEqual(result.map((entity) => entity.id), [1]);
    assert.deepEqual(shown.map((entity) => entity.id), [1]);
    assert.equal(result[0].stage, 'Воронка  ›  Квалификация');
    assert.match(result[0].budget, /15.?000 ₽/);
    assert.match(calls[0], /^\/api\/v4\/leads\?/);
    assert.equal(calls[1], '/api/v4/tasks');
    assert.equal(taskQuery['filter[responsible_user_id]'], 7);
});

test('taskless checks wait for the browser tab to become active', async () => {
    let active = false;
    let calls = 0;
    const service = new Runtime.ListModalService({
        api: {
            get: async () => { calls += 1; return { _embedded: { leads: [] } }; },
            getAllPages: async () => []
        },
        engine: {
            myRules: () => [{ showModal: true, customers: false, pipelines: [{ pipeline_id: 10, status_ids: [20] }] }],
            match: () => ({ showModal: true })
        },
        ui: { showEntitiesModal: () => {}, notify: () => {} },
        accountId: 1,
        userId: 7,
        snapshotHash: 'visibility',
        sessionStorage: null,
        isActive: () => active
    });

    assert.deepEqual(await service.run('todo'), []);
    assert.equal(calls, 0);
    active = true;
    assert.deepEqual(await service.run('todo'), []);
    assert.equal(calls, 1);
});

test('activating a tab resets the modal throttle and starts a fresh check', () => {
    const controller = new Runtime.RuntimeController({ widget: {}, $: () => ({}), Modal: null, api: {}, accountId: 1 });
    let active = false;
    let resets = 0;
    let runs = 0;
    let primes = 0;
    controller._isActiveTab = () => active;
    controller.resolver = { area: () => 'todo' };
    controller.listModal = { resetThrottle: () => { resets += 1; }, run: () => { runs += 1; } };
    controller.guard = { primeCurrent: () => { primes += 1; } };

    controller._onVisibilityChange();
    assert.deepEqual([resets, runs, primes], [0, 0, 0]);
    active = true;
    controller._onVisibilityChange();
    assert.deepEqual([resets, runs, primes], [1, 1, 1]);
});

test('ListModalService always limits lead modal candidates to the current responsible user', async () => {
    let leadPath = '';
    const service = new Runtime.ListModalService({
        api: {
            get: async (path) => {
                leadPath = path;
                return { _embedded: { leads: [] } };
            },
            getAllPages: async () => []
        },
        engine: {
            myRules: () => [{
                showModal: true,
                customers: false,
                checkResponsible: false,
                pipelines: [{ pipeline_id: 10, status_ids: [20] }]
            }],
            match: () => ({ showModal: true })
        },
        ui: { showEntitiesModal: () => {}, notify: () => {} },
        accountId: 1,
        userId: 777,
        snapshotHash: 'batch-hash',
        sessionStorage: null
    });

    await service.run('llist');
    assert.match(leadPath, /filter%5Bresponsible_user_id%5D=777/);
    assert.match(leadPath, /^\/api\/v4\/leads\?limit=250/);
});

test('ListModalService batches task filters to keep request URLs bounded', async () => {
    const taskIdBatches = [];
    const service = new Runtime.ListModalService({
        api: {
            get: async () => ({
                _embedded: {
                    leads: Array.from({ length: 121 }, (_, index) => ({
                        id: index + 1,
                        name: 'Сделка ' + (index + 1),
                        pipeline_id: 10,
                        status_id: 20,
                        responsible_user_id: 7
                    }))
                }
            }),
            getAllPages: async (path, key, options) => {
                taskIdBatches.push(options.query['filter[entity_id]']);
                return [];
            }
        },
        engine: {
            myRules: () => [{ showModal: true, customers: false, checkResponsible: false, pipelines: [{ pipeline_id: 10, status_ids: [20] }] }],
            match: () => ({ showModal: true })
        },
        ui: { showEntitiesModal: () => {}, notify: () => {} },
        accountId: 1,
        userId: 7,
        snapshotHash: 'batch-hash',
        sessionStorage: null,
        taskBatchSize: 50
    });

    await service.run('llist');
    assert.deepEqual(taskIdBatches.map((batch) => batch.length), [50, 50, 21]);
});

test('ListModalService filters responsible customers before the candidate limit', async () => {
    let customerQuery;
    const service = new Runtime.ListModalService({
        api: {
            get: async (path, query) => {
                customerQuery = query;
                return { _embedded: { customers: [] } };
            },
            getAllPages: async () => []
        },
        engine: {
            myRules: () => [{
                showModal: true,
                customers: true,
                checkResponsible: true,
                customerStatuses: [55],
                pipelines: []
            }],
            match: () => ({ showModal: true })
        },
        ui: { showEntitiesModal: () => {}, notify: () => {} },
        accountId: 1,
        userId: 888,
        snapshotHash: 'hash',
        sessionStorage: null
    });

    await service.run('culist');
    assert.equal(customerQuery['filter[responsible_user_id]'], 888);
    assert.deepEqual(customerQuery['filter[status_id]'], [55]);
});

test('repeated runtime init re-runs area services after SPA navigation', () => {
    const controller = new Runtime.RuntimeController({
        widget: {},
        $: () => ({}),
        Modal: null,
        api: {},
        accountId: 1
    });
    let runs = 0;
    controller.started = true;
    controller._runAreaServices = () => { runs += 1; };
    assert.equal(controller.init(), true);
    assert.equal(runs, 1);
});
