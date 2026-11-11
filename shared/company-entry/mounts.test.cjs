const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('../../rkrs_lead_distribution/widget-app/node_modules/jsdom');
const root = path.resolve(__dirname, '../..');
const entry = require('./company-entry.js');
const config = { coreOrigin: 'https://core.example.invalid', frontendOrigin: 'https://teamos.example.invalid' };
const companyId = '10000000-0000-4000-8000-000000000001';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(relative, authority, isAdmin = true) {
    const dom = new JSDOM('<div id="settings"></div>', { url: 'https://account.amocrm.ru/settings/widgets/' });
    const { window } = dom;
    const body = window.document.getElementById('settings');
    const calls = [], opened = [], controls = [], proofRequests = [];
    let accountId = '123', proofCount = 0;
    const user = { id: 42 };
    let userRights = { is_admin: isAdmin };
    const crm = { constant(key) { return { account: { id: accountId }, user, user_rights: userRights, user_id: 42 }[key]; }, data: {} };
    function product() {
        const button = window.document.createElement('button'); button.textContent = 'Существующие настройки продукта';
        button.onclick = () => controls.push('used'); body.appendChild(button);
    }
    const app = { registerWidgetInstance() {}, openSettings: product, mountPanel() {}, unmountAll() {}, mount: product, destroy() {} };
    const jquery = () => ({ appendTo() {} });
    class TeamController { render() { product(); } destroy() {} }
    class AmoApiClient { destroy() {} }
    class CatalogRepository { constructor(api) { this.api = api; } }
    class Migration { constructor(options) { this.repository = options.repository; } }
    const modules = {
        jquery,
        'lib/components/base/modal': function () {},
        './lib/constants.js': {},
        './lib/request_queue.js': { RequestQueue: class {} },
        './lib/amo_api.js': () => ({ AmoApiClient }),
        './lib/catalog_repository.js': () => ({ CatalogRepository }),
        './lib/teamos_controller.js': () => TeamController,
        './lib/migration.js': () => ({ Migration }),
        './lib/legacy-widget.js': function () { this.callbacks = { settings: product, destroy() {} }; },
        './lib/distribution-adapter.js': function () { this.callbacks = { settings: product, destroy() {} }; },
        './lib/company-entry-deployment.js': config,
    };
    let Constructor;
    const context = {
        window, document: window.document, APP: crm, AMOCRM: crm,
        console: { info() {}, error() {} }, Promise, URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
        fetch: async (url, options) => {
            if (url.endsWith('/release.json')) return { ok: true, json: async () => ({ js: 'activity.test.js' }) };
            if (url.startsWith('/ajax/')) {
                proofRequests.push({ url, options });
                if (options.headers?.['X-Requested-With'] !== 'XMLHttpRequest') {
                    return { ok: false, status: 400, json: async () => ({ detail: 'Only web client allowed.' }) };
                }
                return { ok: true, json: async () => ({ token: 'proof-' + ++proofCount }) };
            }
            calls.push({ url, options });
            if (url.endsWith('/entries') && authority.profileUnavailable) return { ok: false, status: 422, json: async () => ({ error: { message: 'private-email@example.invalid and secret upstream detail' } }) };
            const value = url.endsWith('/status') ? authority.present ? { state: 'present', companyId } : { state: 'absent' } : { redirectUrl: config.frontendOrigin + '/auth/amo#code=' + 'x'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() };
            if (url.endsWith('/entries')) { authority.present = true; authority.creates++; }
            return { ok: true, json: async () => value };
        },
        require(_deps, resolve) { resolve(app); },
        define(deps, factory) { Constructor = factory(...deps.map(dependency => {
            const name = dependency.split('?')[0];
            if (name === './lib/company-entry.js') return context.CompanyEntry;
            return modules[name] || (() => ({}));
        })); },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'company-entry.js'), 'utf8'), { ...context, define(_deps, factory) { context.CompanyEntry = factory(); } });
    window.open = () => {
        const popup = { closed: false, close() { this.closed = true; }, location: { replace(url) { opened.push(url); } } };
        return popup;
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), context);
    const widget = { params: {}, get_settings: () => ({ oauth_client_uuid: '20000000-0000-4000-8000-000000000002' }), get_version: () => '1.2.5' };
    Constructor.call(widget);
    return { widget, body, calls, opened, controls, proofRequests, close() { widget.callbacks.destroy(); dom.window.close(); }, switchAccount() { accountId = '456'; }, setUserRights(rights) { userRights = rights; }, setLegacyAdmin(value) { user.is_admin = value; user.rights = { is_admin: value }; } };
}
const sources = ['rkrs_lead_notasks/script.js', 'rkrs_activity_panel/widget/script.js', 'rkrs_lead_distribution/widget/script.js', 'integration-packages/amocrm-pro-service/widget/script.js'];
test('fresh disposable tokens use the same-origin web-client request without adding CRM headers to Core', async () => {
    for (const source of sources) {
        const f = fixture(source, { present: false, creates: 0 });
        try {
            f.widget.callbacks.settings(f.body); await tick(); await tick();
            const button = f.body.querySelector('[data-teamos-company-entry] button');
            assert.equal(button.textContent, 'Создать компанию');
            button.click(); await tick(); await tick();
            assert.equal(f.proofRequests.length, 2);
            for (const request of f.proofRequests) {
                assert.equal(request.url, '/ajax/v2/integrations/20000000-0000-4000-8000-000000000002/disposable_token');
                assert.equal(request.options.credentials, 'same-origin');
                assert.equal(request.options.cache, 'no-store');
                assert.equal(request.options.headers['X-Requested-With'], 'XMLHttpRequest');
                assert.equal(request.options.headers.Accept, 'application/json');
            }
            assert.equal(f.calls[0].options.headers['X-Auth-Token'], 'proof-1');
            assert.equal(f.calls[1].options.headers['X-Auth-Token'], 'proof-2');
            for (const call of f.calls) {
                assert.equal(call.options.credentials, 'omit');
                assert.equal(call.options.headers['X-Requested-With'], undefined);
            }
            assert.equal(f.opened.length, 1);
        } finally { f.close(); }
    }
});
test('all actual settings callbacks share account-wide authority and preserve product controls', async () => {
    const authority = { present: false, creates: 0 };
    const fixtures = sources.map(source => fixture(source, authority));
    try {
        for (const f of fixtures) { f.widget.callbacks.settings(f.body); }
        await tick(); await tick();
        for (const f of fixtures) {
            const button = f.body.querySelector('[data-teamos-company-entry] button');
            assert.equal(button.textContent, 'Создать компанию');
            const product = [...f.body.querySelectorAll('button')].find(node => node.textContent === 'Существующие настройки продукта');
            assert(product); product.click(); assert.equal(f.controls.length, 1);
        }
        fixtures[0].body.querySelector('[data-teamos-company-entry] button').click();
        await tick(); await tick();
        assert.equal(authority.creates, 1); assert.equal(fixtures[0].opened.length, 1);
        for (const f of fixtures) { f.widget.callbacks.settings(f.body); }
        await tick(); await tick();
        for (const f of fixtures) {
            assert.equal(f.body.querySelectorAll('[data-teamos-company-entry]').length, 1);
            assert.equal(f.body.querySelector('[data-teamos-company-entry] button').textContent, 'Перейти в компанию');
            for (const call of f.calls) {
                const body = JSON.parse(call.options.body);
                assert.deepEqual(Object.keys(body), call.url.endsWith('/status') ? [] : ['intent']);
                assert.match(call.options.headers['X-Auth-Token'], /^proof-/);
            }
        }
    } finally { for (const f of fixtures) f.close(); }
});
test('ordinary employees see no company-entry CTA in each actual settings callback', async () => {
    for (const source of sources) {
        const f = fixture(source, { present: false, creates: 0 }, false);
        try {
            f.widget.callbacks.settings(f.body); await tick();
            assert.equal(f.body.querySelector('[data-teamos-company-entry]'), null);
            assert.equal(f.calls.length, 0);
        } finally { f.close(); }
    }
});
test('missing or denied SDK user_rights cannot be overridden by legacy user flags', async () => {
    for (const source of sources) {
        for (const rights of [undefined, {}, { is_admin: false }, { is_admin: 'false' }]) {
            const f = fixture(source, { present: false, creates: 0 });
            try {
                f.setUserRights(rights);
                f.setLegacyAdmin(true);
                f.widget.callbacks.settings(f.body); await tick();
                assert.equal(f.body.querySelector('[data-teamos-company-entry]'), null);
                assert.equal(f.calls.length, 0);
            } finally { f.close(); }
        }
    }
});
test('revoking SDK admin rights prevents entry and closes the block until settings reopen', async () => {
    for (const source of sources) {
        const authority = { present: true, creates: 0 };
        const f = fixture(source, authority);
        try {
            f.widget.callbacks.settings(f.body); await tick(); await tick();
            const button = f.body.querySelector('[data-teamos-company-entry] button');
            assert.equal(button.textContent, 'Перейти в компанию');
            f.setUserRights({ is_admin: false });
            button.click(); await tick(); await tick();
            assert.equal(f.opened.length, 0);
            assert.equal(f.calls.filter(call => call.url.endsWith('/entries')).length, 0);
            f.widget.callbacks.settings(f.body); await tick();
            assert.equal(f.body.querySelector('[data-teamos-company-entry]'), null);
        } finally { f.close(); }
    }
});
test('generated copies match shared consumer source', () => {
    const canonical = fs.readFileSync(path.join(__dirname, 'company-entry.js'), 'utf8');
    for (const source of sources) assert.equal(fs.readFileSync(path.join(root, path.dirname(source), 'lib/company-entry.js'), 'utf8'), canonical);
    assert.equal(typeof entry.mount, 'function');
});

test('HTTP422 profile failure is actionable without reflecting upstream PII in every widget', async () => {
    for (const source of sources) {
        const f = fixture(source, { present: false, creates: 0, profileUnavailable: true });
        try {
            f.widget.callbacks.settings(f.body); await tick(); await tick();
            f.body.querySelector('[data-teamos-company-entry] button').click();
            await tick(); await tick();
            const section = f.body.querySelector('[data-teamos-company-entry]');
            assert.match(section.textContent, /В профиле amoCRM отсутствует корректный email/);
            assert.match(section.textContent, /Проверьте профиль и повторите вход/);
            assert(!section.textContent.includes('private-email'));
            assert(!section.textContent.includes('secret upstream'));
            assert.equal(section.querySelector('button').textContent, 'Повторить проверку');
            assert.equal(f.opened.length, 0);
        } finally { f.close(); }
    }
});
