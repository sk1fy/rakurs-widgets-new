const assert = require('node:assert/strict');
const test = require('node:test');
const { checkConnection, createAccess, REINSTALL_URL } = require('../widget/lib/app/access.js');

const clientId = '11111111-1111-4111-8111-111111111111';
const sdkPath = '/ajax/v2/integrations/' + clientId + '/disposable_token';

test('Core confirms the installation using a fresh amoCRM token per check', async () => {
    let sdkCalls = 0;
    const fetcher = async (url, init) => {
        if (url === sdkPath) {
            assert.equal(init.credentials, 'same-origin');
            return Response.json({ token: 'token-' + ++sdkCalls });
        }
        assert.equal(url, 'https://core.rkrs.ru/api/v1/widget/connection');
        assert.equal(init.method, 'GET');
        assert.equal(init.credentials, 'omit');
        assert.equal(init.headers['X-Auth-Token'], 'token-' + sdkCalls);
        return new Response(null, { status: 204 });
    };

    assert.equal(await checkConnection(fetcher, clientId), 'active');
    assert.equal(await checkConnection(fetcher, clientId), 'active');
    assert.equal(sdkCalls, 2);
    assert.equal(REINSTALL_URL, 'https://core.rkrs.ru/oauth/amocrm/start?integration_code=rkrs_compact_fields');
});

test('only explicit Core auth denials request reauthorization', async () => {
    const cases = [
        [401, { error: { code: 'unauthenticated' } }, 'error'],
        [403, { error: { code: 'permission_denied' } }, 'error'],
        [429, { error: { code: 'rate_limited' } }, 'offline'],
        [503, { error: { code: 'policy_not_configured' } }, 'offline'],
        [404, {}, 'offline'],
        [200, {}, 'offline'],
    ];
    for (const [status, body, expected] of cases) {
        const fetcher = async (url) => url === sdkPath
            ? Response.json({ token: 'token' })
            : Response.json(body, { status });
        assert.equal(await checkConnection(fetcher, clientId), expected);
    }
    assert.equal(await checkConnection(async () => Response.json({}, { status: 401 }), clientId), 'offline');
    assert.equal(await checkConnection(() => assert.fail('Missing SDK UUID must not make a request'), ''), 'offline');
});

test('refresh after OAuth clears the authorization error and caches success', async () => {
    let finishCheck;
    let status = 'error';
    let stored = JSON.stringify({ status, at: Date.now() });
    let coreCalls = 0;
    const access = createAccess({
        clientId,
        fetcher: async (url) => {
            if (url === sdkPath) return Response.json({ token: 'token' });
            coreCalls++;
            return status === 'active'
                ? new Response(null, { status: 204 })
                : Response.json({ error: { code: 'unauthenticated' } }, { status: 401 });
        },
        cache: { get: () => stored, set: (value) => { stored = value; } },
        setTimeout: () => { finishCheck(); return 1; },
        clearTimeout: () => {},
    });
    await new Promise((resolve) => { finishCheck = resolve; access.start(); });
    assert.equal(access.getStatus(), 'error');
    status = 'active';
    await new Promise((resolve) => { finishCheck = resolve; access.refresh(); });
    assert.equal(access.getStatus(), 'active');
    assert.equal(JSON.parse(stored).status, 'active');
    assert.equal(coreCalls, 2);
    access.stop();
});

test('activation sends the entered name and phone using a fresh amoCRM token', async () => {
    const { activation } = require('../widget/lib/app/access.js');
    let tokens = 0;
    const fetcher = async (url, init) => {
        if (url === sdkPath) return Response.json({ token: 'token-' + ++tokens });
        assert.equal(url, 'https://core.rkrs.ru/api/v1/widget/activation');
        assert.equal(init.headers['X-Auth-Token'], 'token-' + tokens);
        if (init.method === 'GET') return Response.json({ activated: false });
        assert.equal(init.method, 'POST');
        assert.equal(init.headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(init.body), { name: 'Алексей', phone: '+79001234567', consent_version: 'contact-v1' });
        return Response.json({ activated: true });
    };
    assert.equal(await activation(fetcher, clientId), false);
    assert.equal(await activation(fetcher, clientId, {
        name: 'Алексей', phone: '+79001234567', email: 'ignored@example.invalid', role: 'ignored'
    }), true);
    assert.equal(tokens, 2);
});
