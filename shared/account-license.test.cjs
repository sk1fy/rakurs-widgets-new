const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, 'account-license.js'), 'utf8');
const origin = 'https://core.example.invalid';
const integration = '20000000-0000-4000-8000-000000000002';

function fixture(account) {
    let client = integration;
    let time = 0;
    let token = 0;
    let timerId = 0;
    let postStatus = 204;
    let license;
    const calls = [];
    const timers = new Map();
    vm.runInNewContext(code, {
        APP: { constant: key => key === 'account' ? account : undefined },
        Date: { now: () => time },
        AbortController, TextEncoder, URL,
        setTimeout(run, delay) {
            timers.set(++timerId, { run, at: time + delay });
            return timerId;
        },
        clearTimeout(id) { timers.delete(id); },
        async fetch(url, options) {
            calls.push({ url, options });
            if (url.startsWith('/ajax/')) return { ok: true, json: async () => ({ token: 'test-' + ++token }) };
            return { ok: postStatus === 204, status: postStatus };
        },
        define(_deps, factory) { license = factory(); }
    });
    const widget = { get_settings: () => ({ oauth_client_uuid: client, active: 'N' }) };
    return {
        calls,
        async advance(milliseconds) {
            time += milliseconds;
            for (const [id, timer] of timers) {
                if (timer.at > time) continue;
                timers.delete(id);
                timer.run();
            }
            await new Promise(resolve => setImmediate(resolve));
        },
        status(value) { postStatus = value; },
        authorize(value) { client = value; },
        sync(installing, coreOrigin = origin) { return license.sync(widget, coreOrigin, installing); }
    };
}

test('installation sends only allowlisted license fields, including blocked, with fresh CRM proof', async () => {
    const f = fixture({ tariffId: '42', pay_type: ' blocked ', trial_end: 1800000000, id: 456, phone: '+777' });
    await f.sync(true);
    const [proof, post] = f.calls;
    assert.equal(f.calls.length, 2);
    assert.equal(proof.url, '/ajax/v2/integrations/' + integration + '/disposable_token');
    assert.equal(proof.options.credentials, 'same-origin');
    assert.equal(proof.options.cache, 'no-store');
    assert.equal(proof.options.headers['X-Requested-With'], 'XMLHttpRequest');
    assert.equal(post.url, origin + '/api/v1/widget/account-license');
    assert.equal(post.options.method, 'POST');
    assert.equal(post.options.credentials, 'omit');
    assert.equal(post.options.redirect, 'error');
    assert.equal(post.options.headers['X-Auth-Token'], 'test-1');
    assert.equal(post.options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(post.options.body), { tariff_id: 42, pay_type: 'blocked', trial_end: 1800000000 });
});

test('a later init recovers after missing OAuth and retries with a fresh proof without another init', async () => {
    const f = fixture({ tariffId: true, pay_type: 'trial', trial_end: 0 });
    f.authorize(undefined);
    await f.sync(true);
    assert.equal(f.calls.length, 0);

    f.authorize(integration);
    f.status(503);
    await Promise.all([f.sync(), f.sync()]);
    await f.sync();
    assert.equal(f.calls.length, 2);
    assert.deepEqual(JSON.parse(f.calls[1].options.body), { pay_type: 'trial' });

    f.status(204);
    await f.advance(15 * 1000);
    assert.equal(f.calls.length, 4);
    assert.equal(f.calls[3].options.headers['X-Auth-Token'], 'test-2');
    await f.advance(110 * 1000);
    assert.equal(f.calls.length, 4);
});

test('the first retry sees newly available SDK settings and license fields', async () => {
    const account = { tariffId: 42 };
    const f = fixture(account);
    f.authorize(undefined);
    await Promise.all([f.sync(true), f.sync()]);
    assert.equal(f.calls.length, 0);

    f.authorize(integration);
    account.pay_type = 'Trial';
    await f.advance(15 * 1000);
    assert.deepEqual(JSON.parse(f.calls[1].options.body), { tariff_id: 42, pay_type: 'Trial' });
});

test('the first retry reads fields that were missing after OAuth became available', async () => {
    const account = {};
    const f = fixture(account);
    await f.sync(true);
    assert.equal(f.calls.length, 0);

    account.tariffId = 42;
    await f.advance(15 * 1000);
    assert.deepEqual(JSON.parse(f.calls[1].options.body), { tariff_id: 42 });
});

test('an HTTPS origin with a trailing slash works while a URL with a path is rejected', async () => {
    const f = fixture({ tariffId: 42 });
    await f.sync(true, origin + '/other');
    assert.equal(f.calls.length, 0);

    await f.sync(true, origin + '/');
    assert.equal(f.calls[1].url, origin + '/api/v1/widget/account-license');
});

test('overlapping install and init make the final OAuth retry with a fresh proof and stop after success', async () => {
    const f = fixture({ tariffId: 42, pay_type: 'blocked' });
    f.status(503);
    await Promise.all([f.sync(true), f.sync()]);
    assert.equal(f.calls.length, 2);

    await f.advance(15 * 1000);
    assert.equal(f.calls.length, 4);

    f.status(204);
    await f.advance(109999);
    assert.equal(f.calls.length, 4);
    await f.advance(1);
    assert.equal(f.calls.length, 6);
    assert.deepEqual(f.calls.filter(call => call.options.method === 'POST').map(call => call.options.headers['X-Auth-Token']),
        ['test-1', 'test-2', 'test-3']);

    await f.advance(15 * 60 * 1000);
    assert.equal(f.calls.length, 6);
});

test('a successful partial observation is sent once and gains the tariff on a later retry', async () => {
    const account = { pay_type: 'trial' };
    const f = fixture(account);
    await Promise.all([f.sync(true), f.sync()]);
    assert.deepEqual(JSON.parse(f.calls[1].options.body), { pay_type: 'trial' });

    await f.advance(15 * 1000);
    assert.equal(f.calls.length, 2);
    account.tariffId = 42;
    await f.advance(110 * 1000);
    assert.deepEqual(JSON.parse(f.calls[3].options.body), { tariff_id: 42, pay_type: 'trial' });
    assert.equal(f.calls[3].options.headers['X-Auth-Token'], 'test-2');

    await f.advance(15 * 60 * 1000);
    assert.equal(f.calls.length, 4);
});

test('repeated Core failure stops after the two scheduled retries', async () => {
    const f = fixture({ pay_type: 'blocked' });
    f.status(503);
    await f.sync(true);
    await f.advance(15 * 1000);
    assert.equal(f.calls.length, 4);
    await f.advance(110 * 1000);
    assert.equal(f.calls.length, 6);
    await f.advance(15 * 60 * 1000);
    assert.equal(f.calls.length, 6);
});

test('init skips missing data, sends changed fields, and refreshes the same data after the interval', async () => {
    const account = { tariffId: null, pay_type: 'bad\ntype', trial_end: '253402300800' };
    const f = fixture(account);
    await f.sync();
    assert.equal(f.calls.length, 0);

    account.tariffId = 20;
    await f.sync();
    await f.sync();
    assert.equal(f.calls.length, 2);
    assert.deepEqual(JSON.parse(f.calls[1].options.body), { tariff_id: 20 });

    account.tariffId = 21;
    await f.sync();
    assert.deepEqual(JSON.parse(f.calls[3].options.body), { tariff_id: 21 });
    await f.advance(15 * 60 * 1000);
    await f.sync();
    assert.equal(f.calls.length, 6);
});
