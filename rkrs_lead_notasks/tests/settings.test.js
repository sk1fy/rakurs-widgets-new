'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Settings = require('../lib/settings_controller');

const UID_A = '0c736c20-f044-45aa-b982-38b0e78f4760';
const UID_B = '1d847d31-a155-46bb-a893-49c1f89f5871';

function rule(uid, name) {
    return {
        uid,
        elementId: uid === UID_A ? 10 : 20,
        name,
        users: [7],
        pipelines: [{ pipeline_id: 1, status_ids: [2] }],
        customerStatuses: [],
        showModal: false,
        denyExit: true,
        checkResponsible: false,
        customers: false,
        enabled: true,
        archived: false
    };
}

function controller(repository) {
    return new Settings.SettingsController({
        widget: { get_settings: () => ({}) },
        $: () => ({}),
        api: { destroy() {} },
        repository,
        accountId: 1
    });
}

test('partial restore reconciles missing rules by RULE_UID before returning', async () => {
    const target = [rule(UID_A, 'A'), rule(UID_B, 'B')];
    let current = [rule(UID_A, 'A')];
    let created = [];
    const repository = {
        getRules: async () => current,
        createRulesBatch: async (storage, missing) => {
            created = missing;
            current = current.concat(missing.map((item, index) => Object.assign({}, item, { elementId: 50 + index })));
        },
        updateRule: async () => { throw new Error('unexpected update'); }
    };
    const result = await controller(repository)._reconcileRestoredRules({ catalog_id: 5 }, target);

    assert.deepEqual(created.map((item) => item.uid), [UID_B]);
    assert.deepEqual(result.map((item) => item.uid).sort(), [UID_A, UID_B].sort());
});

test('restore refuses to stage a catalog with unexpected rules', async () => {
    const repository = {
        getRules: async () => [rule(UID_A, 'A'), rule(UID_B, 'Unexpected')],
        createRulesBatch: async () => {},
        updateRule: async () => {}
    };
    await assert.rejects(
        controller(repository)._reconcileRestoredRules({ catalog_id: 5 }, [rule(UID_A, 'A')]),
        (error) => error.code === 'RESTORE_UNEXPECTED_RULES'
    );
});

test('onSave deactivation does not provision or call repository', async () => {
    let provisioned = false;
    const instance = controller({ getRules: async () => { throw new Error('must not run'); } });
    instance.provision = async () => { provisioned = true; };
    const result = await instance.onSave({ active: false });
    assert.equal(result, true);
    assert.equal(provisioned, false);
});
