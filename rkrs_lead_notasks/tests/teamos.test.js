const test = require('node:test');
const assert = require('node:assert/strict');
const Snapshot = require('../lib/snapshot');
const Rules = require('../lib/rules');
const { Client, origin, enabled } = require('../lib/teamos')(Snapshot, Rules);
const scope = {companyId:'company', accountId:'123', bindingId:'binding', bindingRevision:1, installationId:'install', integrationId:'integration', modeEpoch:2, product:'task-control'};
function setup() {
    const calls = []; let error = null; let epoch = 2;
    let bootstrap = {scope, state:'active', mode:'managed', publication:{scope, version:1,schemaVersion:1,runtimeRules:[],checksum:Snapshot.hashRules([])}};
    const client = new Client({settings:()=>({oauth_client_uuid:'11111111-1111-1111-1111-111111111111'}),accountId:123,coreOrigin:'https://core.example',backendOrigin:'https://backend.example',uuid:()=> 'req',request: async (url,opts)=>{
        calls.push({url,opts});
        if(url.includes('disposable_token'))return {token:'jwt'+calls.length};
        if(url.endsWith('/auth'))return {assertion:'proof'};
        if(url.endsWith('/sessions'))return {accessToken:'a'.repeat(43),expiresAt:new Date(Date.now()+300000).toISOString(),scope:{...scope,modeEpoch:epoch}};
        if(error)throw Object.assign(new Error('failure'), {status:error});
        return bootstrap;
    }});
    return {client,calls,setError:s=>error=s,setBootstrap:b=>bootstrap=b,setEpoch:e=>epoch=e,bootstrap};
}
test('origins reject credentials, http, paths; checkbox off stays standalone',()=>{
    for (const u of ['http://core.example','https://user:pass@core.example','https://core.example/path'])assert.throws(()=>origin(u));
    assert.equal(enabled('N'),false);assert.equal(enabled('1'),true);
});
test('each proof gets fresh disposable JWT; session reused only in memory; no Core per config read',async()=>{
    const s=setup();await s.client.proof('link');await s.client.proof('mode');
    const auth=s.calls.filter(c=>c.url.endsWith('/auth'));assert.notEqual(auth[0].opts.headers['X-Auth-Token'],auth[1].opts.headers['X-Auth-Token']);
    await s.client.refresh();await s.client.refresh();
    assert.equal(s.calls.filter(c=>c.url.endsWith('/sessions')).length,1);
    assert.equal(s.calls.filter(c=>c.url.endsWith('/bootstrap')).length,2);
});
test('outage retains last good, explicit revocation clears cache without local fallback',async()=>{
    const s=setup();await s.client.refresh();s.setError(503);await assert.rejects(s.client.refresh());assert.ok(s.client.good);
    s.setError(403);await assert.rejects(s.client.refresh());assert.equal(s.client.good,null);
});
test('cross-account scope, checksum corruption and publication regression cannot replace valid config',async()=>{
    const s=setup();await s.client.refresh();s.setBootstrap({...s.bootstrap,publication:{...s.bootstrap.publication,checksum:'bad'}});
    await assert.rejects(s.client.refresh());assert.equal(s.client.good.version,1);
    s.setBootstrap({...s.bootstrap,publication:{...s.bootstrap.publication,version:0}});await assert.rejects(s.client.refresh());
    s.setBootstrap({...s.bootstrap,scope:{...scope,accountId:'999'}});await assert.rejects(s.client.refresh());assert.equal(s.client.good,null);
});
test('managed exit clears config; concurrent refresh shares one session exchange',async()=>{
    const s=setup();await Promise.all([s.client.refresh(),s.client.refresh()]);assert.equal(s.calls.filter(c=>c.url.endsWith('/sessions')).length,1);
    s.setBootstrap({...s.bootstrap,mode:'standalone'});assert.equal(await s.client.refresh(),null);assert.equal(s.client.good,null);
});
test('new binding epoch cannot retain old cached rules when new publication fails validation',async()=>{
    const s=setup();await s.client.refresh();s.client.session=null;s.setEpoch(3);
    s.setBootstrap({...s.bootstrap,scope:{...scope,modeEpoch:3},publication:{...s.bootstrap.publication,checksum:'bad'}});
    await assert.rejects(s.client.refresh());assert.equal(s.client.good,null);
});
test('required runtime upgrade clears cached rules',async()=>{
    const s=setup();await s.client.refresh();s.setBootstrap({...s.bootstrap,minRuntimeVersion:'2.0.0'});
    await assert.rejects(s.client.refresh());assert.equal(s.client.good,null);
});
