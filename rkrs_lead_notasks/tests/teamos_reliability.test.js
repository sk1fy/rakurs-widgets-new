const test = require('node:test');
const assert = require('node:assert/strict');
const Snapshot = require('../lib/snapshot');
const Rules = require('../lib/rules');
const {Client, supports, runtimeVersion} = require('../lib/teamos')(Snapshot, Rules);
const scope = {companyId:'company',accountId:'123',bindingId:'binding',bindingRevision:1,installationId:'install',integrationId:'integration',modeEpoch:2,product:'task-control',generation:1};
const failure = status => Object.assign(new Error('network'), {status});
function harness() {
    let now = Date.parse('2026-10-16T12:00:00Z'), clock = 0;
    const calls = [], waits = [];
    const h = {calls, waits, failures:[], epoch:2, schema:1, sessionHook:null};
    const envelope = () => ({scope:{...scope,modeEpoch:h.epoch},minRuntimeVersion:'1.1.0',state:'active',mode:'managed',actorId:'7',runtimeSchemaVersion:1,
        issuedAt:new Date(now).toISOString(),validUntil:new Date(now+300000).toISOString(),
        publication:{scope:{...scope,modeEpoch:h.epoch},version:1,schemaVersion:1,runtimeRules:[],checksum:Snapshot.hashRules([])}});
    h.envelope = envelope;
    h.bootstrap = envelope;
    h.advance = ms => {now += ms; clock += ms;};
    h.wallShift = ms => {now += ms;};
    h.client = new Client({settings:()=>({oauth_client_uuid:'11111111-1111-1111-1111-111111111111'}),accountId:123,coreOrigin:'https://core.example',backendOrigin:'https://backend.example',
        now:()=>now,clock:()=>clock,uuid:()=>String(calls.length),random:()=>0,sleep:async ms=>waits.push(ms),
        request:async(url,opts)=>{
            calls.push({url,opts});
            if (url.includes('disposable_token')) return {token:'jwt-'+calls.length};
            if (url.endsWith('/auth')) return {assertion:'proof-'+calls.length};
            if (url.endsWith('/sessions')) {
                if (h.sessionHook) await h.sessionHook();
                return {accessToken:String(calls.length).padStart(43,'a'),expiresAt:new Date(now+300000).toISOString(),actorId:'7',scope:{...scope,modeEpoch:h.epoch},runtimeSchemaVersion:h.schema};
            }
            if (h.failures.length) throw h.failures.shift();
            return h.bootstrap();
        }});
    return h;
}
test('minimum semver is ordered independently of protocol/package version',()=>{
    assert.equal(runtimeVersion, require('../package.json').version);
    for (const v of ['1.0.0','1.1.0','1.1.4','1.1.5','1.2.0']) assert.equal(supports(v),true,v);
    for (const v of ['1.2.1','2.0.0','1.1.4-beta','01.1.0','bad','1.1.9007199254740992']) assert.equal(supports(v),false,v);
});
test('renewal after 285s uses fresh JWT/assertion and keeps other tabs independent',async()=>{
    const h=harness(), other=harness();
    await Promise.all([h.client.refresh(),other.client.refresh()]);h.advance(286000);await h.client.refresh();
    const auth=h.calls.filter(c=>c.url.endsWith('/auth'));
    assert.equal(auth.length,2);assert.notEqual(auth[0].opts.headers['X-Auth-Token'],auth[1].opts.headers['X-Auth-Token']);
    assert.equal(other.calls.filter(c=>c.url.endsWith('/sessions')).length,1);
});
test('401 obtains one new session, 403/404 clears immediately without retries',async()=>{
    const h=harness();await h.client.refresh();h.failures=[failure(401)];await h.client.refresh();
    assert.equal(h.calls.filter(c=>c.url.endsWith('/sessions')).length,2);
    h.failures=[failure(401),failure(401)];await assert.rejects(h.client.refresh());assert.equal(h.client.good,null);
    for(const code of [403,404]) {
        const r=harness();await r.client.refresh();r.failures=[failure(code)];await assert.rejects(r.client.refresh());
        assert.equal(r.client.good,null);assert.equal(r.waits.length,0);assert.equal(r.calls.filter(c=>c.url.endsWith('/sessions')).length,1);
    }
});
test('429/503/timeout retries are bounded with jitter and Retry-After; reconnect succeeds',async()=>{
    for(const status of [429,503,0,408,502,504]) {
        const h=harness();await h.client.refresh();
        h.failures=[failure(status),failure(status),failure(status)];h.failures[0].retryAfterMs=4000;
        await assert.rejects(h.client.refresh());assert.deepEqual(h.waits,[4000,1000]);assert.ok(h.client.good);
        assert.ok(h.client.pollDelay()>=30000 && h.client.pollDelay()<=300000);
        await h.client.refresh();assert.equal(h.client.failures,0);assert.ok(h.client.good);
    }
});
test('cold reload offline has no cache; lease expires with monotonic time even after wall clock rollback',async()=>{
    const h=harness();h.failures=[failure(0),failure(0),failure(0)];await assert.rejects(h.client.refresh());assert.equal(h.client.good,null);
    await h.client.refresh();h.advance(300001);h.wallShift(-900000);assert.equal(h.client.good,null);
});
test('outage does not extend lease; new epoch and revoke cannot retain old config',async()=>{
    const h=harness();await h.client.refresh();const end=h.client.leaseUntil;
    h.advance(250000);h.failures=[failure(503),failure(503),failure(503)];await assert.rejects(h.client.refresh());assert.equal(h.client.leaseUntil,end);
    h.advance(50001);assert.equal(h.client.good,null);
    await h.client.refresh();h.client.session=null;h.epoch=3;h.bootstrap=()=>({...h.envelope(),publication:null});
    await assert.rejects(h.client.refresh());assert.equal(h.client.good,null);
});
test('clear fences late session exchange and pending refresh cannot resurrect cache',async()=>{
    const h=harness();let release;h.sessionHook=()=>new Promise(r=>release=r);
    const pending=h.client.refresh();while(!release) await Promise.resolve();h.client.clear();release();
    await assert.rejects(pending);assert.equal(h.client.good,null);assert.equal(h.client.session,null);
});
test('unknown schema, malformed lease, actor mismatch and oversized payload are rejected',async()=>{
    const h=harness();await h.client.refresh();
    for(const change of [{runtimeSchemaVersion:3},{validUntil:'bad'},{validUntil:'2026-10-16T12:10:00Z'},{publication:{huge:'a'.repeat(1048576)}}]) {
        h.bootstrap=()=>({...h.envelope(),...change});await assert.rejects(h.client.refresh());assert.ok(h.client.good);
    }
    h.bootstrap=()=>({...h.envelope(),actorId:'8'});await assert.rejects(h.client.refresh());assert.equal(h.client.good,null);
});
test('dynamic envelope advances runtimeRevision at same publicationVersion and rejects equal revision hash changes',async()=>{
    const h=harness();h.schema=2;let revision=21, rules=[];
    h.bootstrap=()=>({...h.envelope(),runtimeSchemaVersion:2,snapshotId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',publicationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',publicationVersion:7,runtimeRevision:revision,
        intentChecksum:'a'.repeat(64),resolvedChecksum:'b'.repeat(64),sourceRevisions:{crm:'sha256:'+'c'.repeat(64),organization:1,mapping:1},resolverVersion:1,runtimeRules:rules,payloadChecksum:Snapshot.hashRules(rules)});
    await h.client.refresh();assert.equal(h.client.good.version,21);
    assert.ok(h.calls.some(c=>c.url.endsWith('/api/v2/task-control/runtime/bootstrap')));
    revision=22;await h.client.refresh();assert.equal(h.client.good.version,22);
    rules=[{uid:'0c736c20-f044-45aa-b982-38b0e78f4760',name:'Rule',users:[7],pipelines:[{pipeline_id:12,status_ids:[22]}],customer_statuses:[],show_modal:false,deny_exit:true,check_responsible:false,customers:false,enabled:true,archived:false}];
    await assert.rejects(h.client.refresh());assert.equal(h.client.good.version,22);rules=[];
    revision=21;await assert.rejects(h.client.refresh());assert.equal(h.client.good.version,22);
    revision=22;h.bootstrap=()=>({...h.envelope(),runtimeSchemaVersion:2});await assert.rejects(h.client.refresh());
});

test('expired cache retains revision fence and rejects unsafe CRM IDs before normalization',async()=>{
    const h=harness();h.bootstrap=()=>({...h.envelope(),publication:{...h.envelope().publication,version:5}});
    await h.client.refresh();h.advance(300001);assert.equal(h.client.good,null);
    h.bootstrap=()=>({...h.envelope(),publication:{...h.envelope().publication,version:4}});
    await assert.rejects(h.client.refresh());assert.equal(h.client.good,null);
    const rule={uid:'0c736c20-f044-45aa-b982-38b0e78f4760',name:'Rule',users:[9007199254740992],pipelines:[{pipeline_id:12,status_ids:[22]}],customer_statuses:[],show_modal:false,deny_exit:true,check_responsible:false,customers:false,enabled:true,archived:false};
    h.bootstrap=()=>({...h.envelope(),publication:{...h.envelope().publication,version:6,runtimeRules:[rule],checksum:Snapshot.hashRules([rule])}});
    await assert.rejects(h.client.refresh());assert.equal(h.client.good,null);
});
