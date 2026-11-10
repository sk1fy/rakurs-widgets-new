'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('amoCRM entrypoint starts and stops guards only with rules received from TeamOS', () => {
    let registration;
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8'), {
        define(dependencies, factory) { registration = { dependencies, factory }; },
        APP: { constant: () => ({ id: 123 }) },
        window: {},
        document: { getElementById: () => null },
        console,
    });
    let emitRules, started = 0;
    const active = new Set();
    class TeamController {
        constructor(_widget, _$, _deployment, changed) { emitRules = changed; }
        start() { started++; }
        destroy() {}
    }
    class RuntimeController {
        constructor({ runtimeConfig }) { this.config = runtimeConfig; }
        bind() { active.add(this.config); }
        init() {}
        destroy() { active.delete(this.config); }
    }
    const jquery = () => ({ appendTo() {} });
    jquery.ajax = () => { throw new Error('Unexpected amoCRM request'); };
    const dependencies = new Map([
        ['jquery', jquery],
        ['lib/components/base/modal', function Modal() {}],
        ['./lib/runtime.js', () => ({ RuntimeController })],
        ['./lib/amo_api.js', () => require('../lib/amo_api')],
        ['./lib/rules.js', () => require('../lib/rules')],
        ['./lib/snapshot.js', () => require('../lib/snapshot')],
        ['./lib/catalog_repository.js', () => require('../lib/catalog_repository')],
        ['./lib/task_assignment.js', () => require('../lib/task_assignment')],
        ['./lib/teamos_controller.js', () => TeamController],
        ['./lib/deployment.js', {}],
        ['./lib/company-entry-deployment.js', {}],
    ]);
    const Constructor = registration.factory(...registration.dependencies.map(dependency => {
        const name = dependency.split('?')[0];
        return dependencies.has(name) ? dependencies.get(name) : require('../' + name);
    }));
    let localRuleReads = 0;
    const widget = {
        params: { path: '/widget' },
        get_version: () => '1.2.5',
        get_settings() {
            return {
                teamos_enabled: '0',
                get runtime_config() { localRuleReads++; return { rules: ['legacy'] }; },
            };
        },
        system: () => ({ area: 'leads_card' }),
    };
    Constructor.call(widget);

    widget.callbacks.render();
    widget.callbacks.init();
    widget.callbacks.bind_actions();
    assert.equal(started, 1);
    assert.equal(active.size, 0);

    const config = { rules: ['server'] };
    assert.equal(emitRules({ config, scope: {}, actorId: '7', schema: 1, version: 1 }), true);
    assert.deepEqual([...active], [config]);

    assert.equal(emitRules(null), false);
    widget.callbacks.bind_actions();
    assert.equal(active.size, 0);
    assert.equal(localRuleReads, 0);
    widget.callbacks.destroy();
});
