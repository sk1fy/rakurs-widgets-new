'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../lib/rules');

const UID_A = '0c736c20-f044-45aa-b982-38b0e78f4760';
const UID_B = '1d847d31-a155-46bb-a893-49c1f89f5871';

function rule(overrides) {
    return Object.assign({
        uid: UID_A,
        name: 'Продажи',
        users: [1002],
        pipelines: [{ pipeline_id: 12, status_ids: [22] }],
        customer_statuses: [],
        show_modal: false,
        deny_exit: true,
        check_responsible: false,
        customers: false,
        enabled: true,
        archived: false
    }, overrides || {});
}

test('normalizes ids, removes duplicates and sorts pipelines', () => {
    const normalized = Rules.normalizeRule(rule({
        users: ['5', 2, 5, null, -1],
        pipelines: [
            { pipeline_id: 20, status_ids: [4, 3, 4] },
            { pipeline_id: 10, status_ids: ['2'] },
            { pipeline_id: 20, status_ids: [2] }
        ]
    }));

    assert.deepEqual(normalized.users, [2, 5]);
    assert.deepEqual(normalized.pipelines, [
        { pipeline_id: 10, status_ids: [2] },
        { pipeline_id: 20, status_ids: [2, 3, 4] }
    ]);
});

test('RuleEngine merges action flags with OR', () => {
    const engine = new Rules.RuleEngine([
        rule({ deny_exit: true, show_modal: false }),
        rule({ uid: UID_B, deny_exit: false, show_modal: true })
    ], 1002);
    const effective = engine.match({
        entityType: 'leads', pipelineId: 12, statusId: 22,
        responsibleUserId: 9999, currentUserId: 1002
    });

    assert.equal(effective.matches.length, 2);
    assert.equal(effective.denyExit, true);
    assert.equal(effective.showModal, true);
});

test('responsible flag and customer status are enforced independently', () => {
    const engine = new Rules.RuleEngine([
        rule({ customers: true, check_responsible: true, customer_statuses: [55] })
    ], 1002);

    assert.equal(engine.match({ entityType: 'customers', statusId: 55, responsibleUserId: 1003, currentUserId: 1002 }).denyExit, false);
    assert.equal(engine.match({ entityType: 'customers', statusId: 56, responsibleUserId: 1002, currentUserId: 1002 }).denyExit, false);
    assert.equal(engine.match({ entityType: 'customers', statusId: 55, responsibleUserId: 1002, currentUserId: 1002 }).denyExit, true);
});

test('disabled, archived and malformed rules are not indexed', () => {
    const engine = new Rules.RuleEngine([
        rule({ enabled: false }),
        rule({ uid: UID_B, archived: true }),
        rule({ uid: 'broken' })
    ], 1002);
    assert.deepEqual(engine.myRules(), []);
});

test('validator rejects a blank name and a rule without any entity scope', () => {
    const validation = Rules.validateRule(rule({ name: '  ', pipelines: [], customers: false }));
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join(' '), /название/i);
    assert.match(validation.errors.join(' '), /этап/i);
});

test('validator rejects string booleans instead of coercing them to true', () => {
    const validation = Rules.validateRule(rule({ deny_exit: 'false' }));
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join(' '), /deny_exit.*boolean/i);
});
