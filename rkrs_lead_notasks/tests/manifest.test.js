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

test('TeamOS toggle stages both on and off in native text field without changing saved runtime mode', () => {
    const nodes = [];
    const hidden = { length: 1, value: '0', changes: 0,
        hide() { return this; }, closest() { return this; }, first() { return this; }, val(v) { this.value = v; return this; },
        trigger(event) { assert.equal(event, 'change'); this.changes++; return this; } };
    const $ = (tag) => {
        const node = { tag, props: {}, events: {},
            css() { return this; }, appendTo() { return this; }, append() { return this; },
            text() { return this; }, attr(v) { Object.assign(this.props, v); return this; },
            prop(k,v) { if (arguments.length === 1) return this.props[k]; this.props[k] = v; return this; },
            on(event, cb) { this.events[event] = cb; return this; } };
        nodes.push(node); return node;
    };
    const saved = { teamos_enabled: '0' };
    const Controller = require('../lib/teamos_controller')({ enabled: v => v === '1' });
    const controller = new Controller({ get_settings: () => saved }, $, {}, () => {});
    controller.render({ find(selector) { assert.equal(selector, 'input[name="teamos_enabled"]'); return hidden; } });
    const toggle = nodes.find(n => n.props.type === 'checkbox');
    assert.equal(toggle.props.checked, false);
    assert.equal(toggle.props.disabled, false);
    toggle.prop('checked', true); toggle.events.change();
    assert.equal(hidden.value, '1');
    assert.equal(controller.enabled(), false);
    toggle.prop('checked', false); toggle.events.change();
    assert.equal(hidden.value, '0');
    assert.equal(hidden.changes, 2);
});
