'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Snapshot = require('../lib/snapshot');

test('SHA-256 matches standard vectors including UTF-8', () => {
    assert.equal(Snapshot.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(Snapshot.sha256('Привет'), 'dd679c0b9fd408a04148aa7d30c9df393f67b7227f65693fffe0ed6d0f0ade59');
});

test('hash is stable across rule and id ordering', () => {
    const first = [
        {
            uid: '1d847d31-a155-46bb-a893-49c1f89f5871', name: 'B', users: [3, 2],
            pipelines: [{ pipeline_id: 9, status_ids: [8, 7] }], enabled: true
        },
        {
            uid: '0c736c20-f044-45aa-b982-38b0e78f4760', name: 'A', users: [1],
            pipelines: [{ pipeline_id: 2, status_ids: [4] }], enabled: true
        }
    ];
    const second = [first[1], {
        uid: first[0].uid, name: 'B', users: [2, 3, 2],
        pipelines: [{ pipeline_id: 9, status_ids: [7, 8] }], enabled: true
    }];

    assert.equal(Snapshot.hashRules(first), Snapshot.hashRules(second));
});

test('compile increments revision and parser is fail-open per invalid rule', () => {
    const good = {
        uid: '0c736c20-f044-45aa-b982-38b0e78f4760', name: 'A', users: [1],
        pipelines: [{ pipeline_id: 2, status_ids: [4] }], enabled: true
    };
    const config = Snapshot.compile({ catalog_id: 44, fields: { users: 1 } }, [good], { revision: 7 });
    config.rules.push({ uid: 'bad', users: [] });
    config.published.hash = Snapshot.hashRules(config.rules);
    const parsed = Snapshot.parseRuntimeConfig(JSON.stringify(config));

    assert.equal(config.published.revision, 8);
    assert.equal(parsed.valid, false);
    assert.equal(parsed.rules.length, 1);
});

test('unknown schema and hash mismatch disable all runtime rules', () => {
    const good = {
        uid: '0c736c20-f044-45aa-b982-38b0e78f4760', name: 'A', users: [1],
        pipelines: [{ pipeline_id: 2, status_ids: [4] }], enabled: true
    };
    const wrongSchema = Snapshot.compile({ catalog_id: 44, fields: {} }, [good], { revision: 1 });
    wrongSchema.schema_version = 99;
    assert.equal(Snapshot.parseRuntimeConfig(wrongSchema).rules.length, 0);

    const wrongHash = Snapshot.compile({ catalog_id: 44, fields: {} }, [good], { revision: 1 });
    wrongHash.published.hash = 'deadbeef';
    assert.equal(Snapshot.parseRuntimeConfig(wrongHash).rules.length, 0);
});
