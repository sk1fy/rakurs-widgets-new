'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Constants = require('../lib/constants');
const Rules = require('../lib/rules');
const Catalog = require('../lib/catalog_repository');

function storage() {
    const fields = {};
    const enums = {};
    Constants.FIELD_DEFINITIONS.forEach((definition, index) => {
        fields[definition.key] = 100 + index;
        if (definition.type === 'select') {
            enums[definition.key] = { false: 1000 + index * 2, true: 1001 + index * 2 };
        }
    });
    return { catalog_id: 77, fields, enums };
}

function sourceRule() {
    return {
        uid: '0c736c20-f044-45aa-b982-38b0e78f4760',
        elementId: 900,
        name: 'Отдел продаж',
        users: [2, 3],
        pipelines: [{ pipeline_id: 10, status_ids: [20, 21] }],
        customerStatuses: [30],
        showModal: true,
        denyExit: true,
        checkResponsible: false,
        customers: true,
        enabled: true,
        archived: false
    };
}

test('catalog serializer round-trips JSON and select enum values', () => {
    const meta = storage();
    const source = sourceRule();
    const element = {
        id: source.elementId,
        name: source.name,
        custom_fields_values: Rules.toCatalogFields(source, meta)
    };
    const parsed = Rules.fromCatalogElement(element, meta);

    assert.equal(parsed.valid, true);
    assert.deepEqual(parsed.users, [2, 3]);
    assert.deepEqual(parsed.pipelines, [{ pipeline_id: 10, status_ids: [20, 21] }]);
    assert.equal(parsed.showModal, true);
    assert.equal(parsed.checkResponsible, false);
});

test('repository PATCH sends only actually changed custom fields', async () => {
    let captured;
    const api = {
        patch: async (path, payload) => {
            captured = { path, payload };
            return { id: 900, name: payload.name };
        }
    };
    const repository = new Catalog.CatalogRepository(api);
    const current = sourceRule();
    const next = Object.assign({}, current, { showModal: false });
    const updated = await repository.updateRule(storage(), current, next);

    assert.equal(captured.path, '/api/v4/catalogs/77/elements/900');
    assert.equal(captured.payload.custom_fields_values.length, 1);
    assert.equal(captured.payload.custom_fields_values[0].field_id, storage().fields.show_modal);
    assert.equal(updated.showModal, false);
});

test('field create schema uses documented hidden select 0/1 payload', () => {
    const showModal = Constants.FIELD_DEFINITIONS.find((field) => field.key === 'show_modal');
    const payload = Catalog.fieldDefinitionPayload(showModal, 4);

    assert.equal(payload.type, 'select');
    assert.equal(payload.is_visible, false);
    assert.equal(payload.is_deletable, undefined);
    assert.equal(payload.request_id, undefined);
    assert.deepEqual(payload.enums.map((entry) => entry.value), ['0', '1']);
});

test('partial field bootstrap creates only missing CODEs with compatibility fallback', async () => {
    let postCalls = 0;
    let secondPayload;
    const existing = [{
        id: 501,
        code: 'RKRS_WT_RULE_UID',
        type: 'text',
        is_visible: false
    }];
    const makeField = (definition, index) => ({
        id: 600 + index,
        code: definition.code,
        type: definition.type,
        is_visible: false,
        enums: definition.type === 'select' ? [
            { id: 700 + index * 2, value: '0' },
            { id: 701 + index * 2, value: '1' }
        ] : null
    });
    const api = {
        post: async (path, payload) => {
            postCalls += 1;
            if (postCalls === 1) { throw { status: 400 }; }
            secondPayload = payload;
            const missing = Constants.FIELD_DEFINITIONS.filter((definition) => definition.code !== 'RKRS_WT_RULE_UID');
            return { _embedded: { custom_fields: missing.map(makeField) } };
        },
        getAllPages: async () => existing
    };
    const repository = new Catalog.CatalogRepository(api);
    const result = await repository.createMissingFields(77, []);

    assert.equal(Object.keys(result.fields).length, Constants.FIELD_KEYS.length);
    assert.equal(postCalls, 2);
    assert.equal(secondPayload.length, Constants.FIELD_KEYS.length - 1);
    assert.ok(secondPayload.every((field) => field.is_deletable === undefined && field.request_id === undefined));
});
