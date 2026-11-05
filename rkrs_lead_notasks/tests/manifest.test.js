'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../manifest.json');

test('manifest settings use supported amoCRM field types', () => {
    const allowed = new Set(['text', 'pass', 'users', 'users_lp', 'custom']);
    assert.equal(Object.values(manifest.settings).filter(field => field.type === 'custom').length, 1);
    assert.equal(manifest.settings.runtime_config.type, 'custom');
    assert.equal(manifest.settings.teamos_enabled.type, 'text');
    for (const [name, field] of Object.entries(manifest.settings)) {
        assert.ok(allowed.has(field.type), `Unsupported settings type for ${name}: ${field.type}`);
    }
});

test('widget settings hide legacy fields and offer only the TeamOS connection code', () => {
    const nodes = [];
    const legacy = {
        hidden: false,
        hide() { this.hidden = true; return this; },
        closest() { return this; },
    };
    const $ = (tag) => {
        const node = {
            tag,
            label: '',
            appendTo() { return this; },
            text(label) { this.label = label; return this; },
            attr() { return this; },
            prop() { return this; },
            on() { return this; },
        };
        nodes.push(node);
        return node;
    };
    const Controller = require('../lib/teamos_controller')({});
    const controller = new Controller({}, $, {}, () => {});
    const selectors = [];
    controller.render({
        find(selector) {
            selectors.push(selector);
            return selector.startsWith('input') ? legacy : { first: () => ({ length: 0 }) };
        },
    });

    assert.match(selectors[0], /teamos_enabled.*runtime_config/);
    assert.equal(legacy.hidden, true);
    assert.deepEqual(nodes.filter(node => node.tag.startsWith('<button')).map(node => node.label), ['Код подключения']);
    assert.equal(nodes.some(node => node.tag.startsWith('<input')), false);
});
