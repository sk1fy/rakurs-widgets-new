import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthorizedClient, createInstanceIdentity, createInstanceRegistry } from "../index.mjs";
import { createSDKFixture } from "../testing/fixture.mjs";

test("SDK fixture exercises client authorization, exact envelope and non-200 success", async () => {
  const fixture = createSDKFixture({ handle: () => ({ status: 202, data: { pending: true } }) });
  const client = createAuthorizedClient(fixture, "https://core.example.test/widget");
  const body = { requestId: "stable", payload: { ruleId: "one" } };
  assert.deepEqual(await client.request("/action", { body }), { status: 202, data: { pending: true } });
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0].options.url, "https://core.example.test/widget/action");
  assert.deepEqual(fixture.requests[0].body, body);
  assert.equal(fixture.requests[0].options.headers, undefined);
  client.destroy(); fixture.destroy();
});

test("no implicit retry; confirmed denial differs from uncertain server failure", async () => {
  const fixture = createSDKFixture({ manual: true });
  const client = createAuthorizedClient(fixture, "/fixture-api");
  for (const status of [0, 401, 403, 409, 429, 503]) {
    const result = client.request("/action", { body: { requestId: String(status) } });
    fixture.requests.at(-1).reject(status);
    await assert.rejects(result, error => error.status === status && error.unknown === (status === 0 || status >= 500));
  }
  assert.equal(fixture.requests.length, 6);
  const read = client.request("/query", { body: {}, write: false });
  fixture.requests.at(-1).reject(503);
  await assert.rejects(read, error => error.unknown === false);
  client.destroy(); fixture.destroy();
});

test("destroy settles all pending promises without SDK abort callbacks and ignores late success", async () => {
  const callbacks = [];
  let aborts = 0;
  const client = createAuthorizedClient({ $authorizedAjax() {
    const request = { done(fn) { callbacks.push(fn); return request; }, fail() { return request; }, abort() { aborts++; } };
    return request;
  } }, "https://core.example.test");
  const read = client.request("/read");
  const write = client.request("/write", { body: {} });
  client.destroy(); client.destroy();
  await assert.rejects(read, error => !error.unknown && error.message === "Экран закрыт");
  await assert.rejects(write, error => error.unknown && error.message === "Экран закрыт");
  callbacks.forEach(callback => callback({ obsolete: true }));
  assert.equal(aborts, 2);
  await assert.rejects(client.request("/again"), /Экран закрыт/);
});

test("timeout aborts once, even when SDK abort throws, and never retries mutation", async () => {
  let dispatches = 0, aborts = 0;
  const client = createAuthorizedClient({ $authorizedAjax() {
    dispatches++;
    return { done() {}, fail() {}, abort() { aborts++; throw new Error("abort failure"); } };
  } }, "https://core.example.test", { timeoutMs: 5 });
  await assert.rejects(client.request("/write", { body: {} }), error => error.unknown);
  assert.equal(dispatches, 1); assert.equal(aborts, 1);
  client.destroy();
});

test("SDK re-entrant destroy cannot leave a request alive", async () => {
  let client, aborted = false;
  client = createAuthorizedClient({ $authorizedAjax() {
    client.destroy();
    return { done() {}, fail() {}, abort() { aborted = true; } };
  } }, "/fixture-api");
  await assert.rejects(client.request("/read"), /Экран закрыт/);
  assert.equal(aborted, true);
});

test("missing SDK, serialization and invalid destinations fail before dispatch", async () => {
  const client = createAuthorizedClient({}, "/fixture-api");
  await assert.rejects(client.request("/read"), error => error.status === 401 && !error.unknown);
  for (const base of ["http://core.test", "https://user:secret@core.test", "//evil.test", "https://core.test/path?q=1", "/api\\other"])
    assert.throws(() => createAuthorizedClient({}, base));
  const fixture = createSDKFixture({ manual: true });
  const valid = createAuthorizedClient(fixture, "/fixture-api");
  for (const path of ["//evil.test", "https://evil.test", "/../admin", "/a\\b", "/%2e%2e/admin", "/%2Fother", "/bad%path"])
    await assert.rejects(valid.request(path), TypeError);
  const circular = {}; circular.self = circular;
  await assert.rejects(valid.request("/write", { body: circular }), error => !error.unknown);
  assert.equal(fixture.requests.length, 0);
});

test("identity separates scope, delimiter collisions, generations and cards", () => {
  const context = { accountId: "1", userId: "2", productCode: "color", mode: "card", entityId: "3", installationGeneration: 1 };
  const key = createInstanceIdentity(context);
  assert.equal(key, createInstanceIdentity({ ...context, accountId: 1 }));
  for (const field of Object.keys(context))
    assert.notEqual(key, createInstanceIdentity({ ...context, [field]: "different" }));
  assert.notEqual(createInstanceIdentity({ ...context, accountId: "a:b", userId: "c" }), createInstanceIdentity({ ...context, accountId: "a", userId: "b:c" }));
  assert.throws(() => createInstanceIdentity({ ...context, accountId: "" }));
});

test("instance replacement fences old callbacks, disposes clients and handles target changes", async () => {
  const fixture = createSDKFixture({ manual: true });
  const disposed = [];
  const registry = createInstanceRegistry(state => { state.client.destroy(); disposed.push(state); });
  const widget = {}, target = {}, context = { widget, target, identity: "first" };
  const factory = () => ({ client: createAuthorizedClient(fixture, "/fixture-api") });
  const first = registry.mount(context, factory);
  assert.equal(registry.mount(context, () => { throw new Error("must not remount"); }), first);
  const pending = first.client.request("/read");
  const second = registry.mount({ ...context, identity: "next" }, factory);
  await assert.rejects(pending, /Экран закрыт/);
  assert.equal(first.alive, false); assert.equal(second.alive, true);
  assert.equal(fixture.requests[0].aborted, true);
  registry.mount({ ...context, target: {} }, factory);
  assert.equal(second.alive, false);
  registry.destroy(widget); registry.destroy(widget);
  assert.equal(disposed.length, 3);
  assert.equal(registry.get(widget), undefined);
});

test("generic fixture supports arbitrary SDK constructor and mutable CRM identity, never network fallback", async () => {
  const fixture = createSDKFixture();
  const widget = fixture.createWidget(function AnyProduct() { this.callbacks = { settings() {} }; });
  assert.equal(typeof widget.callbacks.settings, "function");
  fixture.setIdentity({ accountId: "9", userId: "8", entityId: "7" });
  assert.equal(fixture.amoCRM.constant("account").id, "9");
  assert.equal(fixture.amoCRM.data.current_card.id, "7");
  const client = createAuthorizedClient(widget, "/fixture-api");
  await assert.rejects(client.request("/unmatched"), error => error.status === 404);
  assert.deepEqual(fixture.requests[0].context, { accountId: "9", userId: "8", entityId: "7" });
  client.destroy(); fixture.destroy();
});

test("re-entrant SDK destroy while factory runs never resurrects state or pending transport", async () => {
  const widget = {}, target = {};
  let registry, state, aborted = 0, disposed = 0, pending;
  registry = createInstanceRegistry(value => { disposed++; value.client.destroy(); });
  const result = registry.mount({ widget, target, identity: "first" }, () => {
    state = { client: createAuthorizedClient({ $authorizedAjax() {
      registry.destroy(widget);
      return { done() {}, fail() {}, abort() { aborted++; } };
    } }, "/fixture-api"), alive: true };
    pending = state.client.request("/read");
    return state;
  });
  assert.equal(result, undefined);
  assert.equal(registry.get(widget), undefined);
  assert.equal(state.alive, false);
  assert.equal(disposed, 1);
  await assert.rejects(pending, /Экран закрыт/);
  assert.equal(aborted, 1);
});

test("re-entrant replacement wins over the older factory", () => {
  const widget = {}, target = {}, disposed = [];
  const registry = createInstanceRegistry(state => disposed.push(state.identity));
  const result = registry.mount({ widget, target, identity: "old" }, () => {
    registry.mount({ widget, target, identity: "new" }, () => ({}));
    return {};
  });
  assert.equal(result, undefined);
  assert.equal(registry.get(widget).identity, "new");
  assert.deepEqual(disposed, ["old"]);
  registry.destroy(widget);
});

test("routing expectation headers pass without exposing authority overrides", async () => {
  const fixture = createSDKFixture({handle: () => ({data:{ok:true}})});
  const client = createAuthorizedClient(fixture, '/fixture-api');
  const headers = {'X-Routing-Epoch':'5','X-Installation-Generation':'2'};
  await client.request('/settings', {headers});
  assert.deepEqual(fixture.requests[0].options.headers,headers);
  for (const invalid of [{Authorization:'Bearer secret'}, {'X-Account-ID':'7'}, {'X-Routing-Epoch':'0'}, {'X-Routing-Epoch':'1\r\nBad: yes'}, {'X-Routing-Epoch':'9007199254740992'}])
    await assert.rejects(client.request('/settings', {headers:invalid}), /Unsupported routing expectation/);
  assert.equal(fixture.requests.length,1);
  client.destroy(); fixture.destroy();
});
