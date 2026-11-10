const test = require('node:test');
const assert = require('node:assert/strict');
const { Controller, parseStatus, parseRedirect } = require('./company-entry.js');
const frontendOrigin = 'https://teamos.example.invalid';
const companyId = '10000000-0000-4000-8000-000000000001';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
function fixture(overrides = {}) {
    let account = 'account:admin';
    const events = [], urls = [];
    const popup = { closed: false, close() { this.closed = true; events.push('close'); }, location: { replace(url) { urls.push(url); } } };
    const controller = new Controller({
        identity: () => account, frontendOrigin,
        render: (state, message) => events.push({ state, message }),
        open: () => { events.push('open'); return popup; },
        proof: async () => { events.push('proof'); return 'fresh-' + events.length; },
        request: async (path, body, proof) => {
            events.push({ path, body, proof });
            return path.endsWith('/status') ? { state: 'absent' } : { redirectUrl: frontendOrigin + '/auth/amo#code=' + 'x'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() };
        }, ...overrides,
    });
    return { controller, events, popup, urls, switchAccount() { account = 'another:admin'; } };
}
test('absence is explicit and every malformed/error/blocked response fails closed', () => {
    assert.equal(parseStatus({ state: 'absent' }), 'absent');
    assert.equal(parseStatus({ state: 'present', companyId }), 'present');
    for (const value of [{}, null, { state: 'unknown' }, { state: 'present' }, { state: 'blocked' }, { state: 'absent', companyId }]) assert.throws(() => parseStatus(value));
});
test('synchronous popup precedes fresh JWT; duplicate click issues one credential and create becomes Go', async () => {
    const f = fixture();
    await f.controller.refresh();
    f.events.length = 0;
    const first = f.controller.enter();
    const duplicate = f.controller.enter();
    assert.equal(f.events[1], 'open');
    assert.equal(f.events[2], 'proof');
    await Promise.all([first, duplicate]);
    const calls = f.events.filter(event => event.path);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { intent: 'create' });
    assert.equal(f.controller.state, 'present');
    assert.equal(f.urls.length, 1);
    assert.equal(f.popup.opener, null);
});
test('blocked popup obtains no JWT or entry credential', async () => {
    const f = fixture({ open: () => null });
    await f.controller.refresh(); f.events.length = 0;
    await f.controller.enter();
    assert(!f.events.includes('proof'));
    assert.equal(f.controller.state, 'error');
    assert.match(f.events.at(-1).message, /всплывающие/);
});
test('unknown entry outcome is error and retry obtains fresh status and JWT before entering', async () => {
    let proofs = 0, entries = 0;
    const f = fixture({ proof: async () => String(++proofs), request: async path => {
        if (path.endsWith('/status')) return { state: entries ? 'present' : 'absent', ...(entries ? { companyId } : {}) };
        entries++; throw new Error('response lost');
    } });
    await f.controller.refresh(); await f.controller.enter();
    assert.equal(f.controller.state, 'error'); assert.equal(f.popup.closed, true);
    await f.controller.enter(); assert.equal(entries, 1);
    await f.controller.refresh(); assert.equal(f.controller.state, 'present');
    assert.equal(proofs, 3);
});
test('account change during JWT or entry discards response and closes popup', async () => {
    for (const during of ['proof', 'entry']) {
        const pending = deferred();
        const f = fixture(); await f.controller.refresh();
        if (during === 'proof') f.controller.options.proof = () => pending.promise;
        else f.controller.options.request = () => pending.promise;
        const request = f.controller.enter(); await tick();
        f.switchAccount();
        pending.resolve(during === 'proof' ? 'old-proof' : { redirectUrl: frontendOrigin + '/auth/amo#code=' + 'x'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() });
        await request;
        assert.equal(f.urls.length, 0); assert.equal(f.popup.closed, true);
        assert.equal(f.controller.state, 'error');
    }
});
test('late old status cannot overwrite a newer failed status as absent', async () => {
    const pending = deferred(); let calls = 0;
    const f = fixture({ request: async () => ++calls === 1 ? pending.promise : Promise.reject(new Error('unavailable')) });
    const old = f.controller.refresh(); await tick();
    await f.controller.refresh(); pending.resolve({ state: 'absent' }); await old;
    assert.equal(f.controller.state, 'error');
});
test('redirect permits only configured frontend fragment route and unexpired opaque code', () => {
    const valid = { redirectUrl: frontendOrigin + '/auth/amo#code=' + 'x'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() };
    assert.equal(parseRedirect(valid, frontendOrigin), valid.redirectUrl);
    for (const url of ['https://evil.invalid/auth/amo#code=' + 'x'.repeat(43), frontendOrigin + '/access/permanent', frontendOrigin + '/auth/amo?code=leak#code=' + 'x'.repeat(43), frontendOrigin + '/auth/amo#code=short']) {
        assert.throws(() => parseRedirect({ ...valid, redirectUrl: url }, frontendOrigin));
    }
    assert.throws(() => parseRedirect({ ...valid, expiresAt: '2000-01-01T00:00:00Z' }, frontendOrigin));
});
