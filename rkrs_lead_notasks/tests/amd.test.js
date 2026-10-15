'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectDir = path.resolve(__dirname, '..');

test('every browser library registers through define even without define.amd', () => {
    const files = fs.readdirSync(path.join(projectDir, 'lib')).filter((file) => file.endsWith('.js'));
    for (const file of files) {
        let registration = null;
        const context = {
            define: (dependencies, factory) => { registration = { dependencies, factory }; },
            self: {},
            console,
            setTimeout,
            clearTimeout,
            Map,
            Set,
            Promise
        };
        vm.runInNewContext(fs.readFileSync(path.join(projectDir, 'lib', file), 'utf8'), context, { filename: file });
        assert.ok(registration, `${file} did not call define()`);
        assert.equal(typeof registration.factory, 'function');
    }
});

test('script entrypoint creates callbacks.onSave with versioned .js dependency paths', () => {
    let registration;
    const context = {
        define: (dependencies, factory) => { registration = { dependencies, factory }; },
        APP: { constant: () => ({ id: 1 }) },
        AMOCRM: {},
        window: {},
        document: {},
        console,
        Promise,
        setTimeout,
        clearTimeout
    };
    vm.runInNewContext(fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8'), context, { filename: 'script.js' });

    assert.ok(registration);
    const buildVersion = require('../manifest.json').widget.version;
    assert.ok(registration.dependencies.filter((dependency) => dependency.startsWith('./')).every((dependency) => dependency.endsWith('.js?v=' + buildVersion)));

    const jquery = () => ({ appendTo() {} });
    jquery.ajax = () => {};
    const Constructor = registration.factory(
        jquery,
        function Modal() {},
        require('../lib/constants'),
        require('../lib/request_queue'),
        (queue) => require('../lib/amo_api'),
        (constants) => require('../lib/rules'),
        (constants, rules) => require('../lib/snapshot'),
        (constants, rules) => require('../lib/catalog_repository'),
        (constants, rules, snapshot) => require('../lib/runtime'),
        (constants, rules, snapshot) => require('../lib/settings_controller'),
        (constants) => require('../lib/task_assignment'),
        require('../lib/teamos'),
        { coreOrigin: '', backendOrigin: '' },
        require('../lib/teamos_controller')
    );
    const widget = {
        params: { path: '/widgets/rkrs_lead_notasks', widget_code: 'rkrs_lead_notasks' },
        get_settings: () => ({ widget_code: 'rkrs_lead_notasks', version: '1.0.7' }),
        get_version: () => '1.0.7',
        system: () => ({ area: 'settings' }),
        render: () => ({})
    };
    Constructor.call(widget);

    assert.ok(widget.callbacks);
    assert.equal(typeof widget.callbacks.onSave, 'function');
    assert.equal(widget.callbacks.onSave(), true);
});
