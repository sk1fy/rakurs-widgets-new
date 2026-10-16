'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Snapshot = require('../lib/snapshot');
const Rules = require('../lib/rules');
const TeamOS = require('../lib/teamos')(Snapshot, Rules);
const Controller = require('../lib/teamos_controller')(TeamOS);
const scope = {companyId:'company',accountId:'123',bindingId:'binding',bindingRevision:1,installationId:'installation',integrationId:'integration',modeEpoch:2,generation:1,product:'task-control'};
const flush = async () => { for (let i=0;i<40;i++) await Promise.resolve(); };
function harness() {
    let now=Date.parse('2026-10-16T12:00:00Z'), clock=0;
    const h={calls:[],schema:2,revision:21,status:22,ackError:null,bootstrapError:null};
    h.advance=ms=>{now+=ms;clock+=ms;};
    h.client=new TeamOS.Client({accountId:'123',settings:()=>({oauth_client_uuid:'11111111-1111-1111-1111-111111111111'}),coreOrigin:'https://core.example',backendOrigin:'https://backend.example',now:()=>now,clock:()=>clock,uuid:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sleep:async()=>{},request:async(url,options)=>{
        h.calls.push({url,options});
        if(url.includes('disposable_token')) return {token:'token'};
        if(url.endsWith('/auth')) return {assertion:'assertion'};
        if(url.endsWith('/sessions')) return {scope,actorId:'7',runtimeSchemaVersion:h.schema,accessToken:'a'.repeat(43),expiresAt:new Date(now+300000).toISOString()};
        if(url.endsWith('/telemetry')) {
            if(options.body.event !== 'applied') return;
 if(h.ackError) throw h.ackError; return; }
        if(h.bootstrapError) throw h.bootstrapError;
        const rules=[{uid:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Rule',users:[7],pipelines:[{pipeline_id:12,status_ids:[h.status]}],customer_statuses:[],show_modal:false,deny_exit:true,check_responsible:false,customers:false,enabled:true,archived:false}];
        return {scope,actorId:'7',runtimeSchemaVersion:2,minRuntimeVersion:'1.2.0',publicationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',publicationVersion:7,snapshotId:`dddddddd-dddd-4ddd-8ddd-${String(h.revision).padStart(12,'0')}`,runtimeRevision:h.revision,intentChecksum:'a'.repeat(64),resolvedChecksum:'b'.repeat(64),payloadChecksum:Snapshot.hashRules(rules),sourceRevisions:{crm:'sha256:'+'c'.repeat(64),organization:1,mapping:1},resolverVersion:1,runtimeRules:rules,issuedAt:new Date(now).toISOString(),validUntil:new Date(now+90000).toISOString()};
    }});
    return h;
}
test('v2 negotiation, controller application and ACK use the same actor snapshot; same publication gets new engine rules',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});
    const h=harness(); let engine;
    const controller=new Controller({get_settings:()=>({teamos_enabled:'1'})},{},{},good=>{
        engine=good ? new Rules.RuleEngine(good.config.rules,7) : null;
        // ACK must follow engine installation, not merely successful download.
        assert.equal(h.calls.filter(c=>c.url.endsWith('/telemetry') && c.options.body.event === 'applied').length, good && good.version===22 ? 1 : 0);
        return true;
    });
    controller.client=h.client;controller.start();await flush();
    const session=h.calls.find(c=>c.url.endsWith('/sessions')).options.body;
    assert.equal(session.runtimeVersion,'1.2.2');assert.deepEqual(session.capabilities,['dynamicRulesV2']);
    assert.equal(engine.match({entityType:'leads',pipelineId:12,statusId:22,currentUserId:7,responsibleUserId:7}).denyExit,true);
    let ack=h.calls.find(c=>c.url.endsWith('/telemetry') && c.options.body.event === 'applied');
    assert.equal(ack.options.method,'POST');assert.equal(ack.options.headers.Authorization,'Bearer '+'a'.repeat(43));
    assert.deepEqual(ack.options.body.scope,scope);assert.equal(ack.options.body.runtimeRevision,21);assert.equal(ack.options.body.actorId,'7');assert.equal(ack.options.body.runtimeVersion,'1.2.2');
    const instance=ack.options.body.runtimeInstanceId;
    h.revision=22;h.status=23;t.mock.timers.tick(60000);await flush();
    assert.equal(engine.match({entityType:'leads',pipelineId:12,statusId:22,currentUserId:7,responsibleUserId:7}).denyExit,false);
    assert.equal(engine.match({entityType:'leads',pipelineId:12,statusId:23,currentUserId:7,responsibleUserId:7}).denyExit,true);
    ack=h.calls.filter(c=>c.url.endsWith('/telemetry') && c.options.body.event === 'applied').at(-1);assert.equal(ack.options.body.runtimeRevision,22);assert.equal(ack.options.body.publicationVersion,7);assert.equal(ack.options.body.runtimeInstanceId,instance);
    controller.destroy();
});
test('ACK failure does not discard applied rules or extend lease; expiry prevents late ACK',async()=>{
    const h=harness();const good=await h.client.refresh();const end=h.client.leaseUntil;
    h.ackError=Object.assign(new Error('offline'),{status:503});await assert.rejects(h.client.acknowledge(good));assert.equal(h.client.good,good);assert.equal(h.client.leaseUntil,end);
    h.advance(90001);assert.equal(h.client.good,null);const calls=h.calls.length;await h.client.acknowledge(good);assert.equal(h.calls.length,calls);
});
test('v2 never falls back to v1 on endpoint failure or session downgrade in the same scope',async()=>{
    const h=harness();await h.client.refresh();h.bootstrapError=Object.assign(new Error('not found'),{status:404});await assert.rejects(h.client.refresh());assert.equal(h.client.good,null);
    h.schema=1;h.bootstrapError=null;await assert.rejects(h.client.refresh(),/протокол v2/);
    assert.equal(h.calls.filter(c=>c.url.includes('/api/v1/widget/task-control/bootstrap')).length,0);
});
test('controller does not acknowledge a snapshot when no runtime engine was installed; standalone never starts transport',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const h=harness();
    const controller=new Controller({get_settings:()=>({teamos_enabled:'1'})},{},{},()=>false);controller.client=h.client;controller.start();await flush();
    assert.equal(h.calls.filter(c=>c.url.endsWith('/telemetry') && c.options.body.event === 'applied').length,0);controller.destroy();
    const standalone=new Controller({get_settings:()=>({teamos_enabled:'0'})},{},{},()=>{throw Error('standalone');});standalone.client=h.client;const before=h.calls.length;standalone.start();await flush();assert.equal(h.calls.length,before);standalone.destroy();
});

test('confirmed ACK revocation removes engine immediately; transient ACK errors keep it until lease',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});const h=harness();let applied;
    h.ackError=Object.assign(new Error('revoked'),{status:403});
    const controller=new Controller({get_settings:()=>({teamos_enabled:'1'})},{},{},good=>{applied=good;return true;});controller.client=h.client;controller.start();await flush();
    assert.equal(applied,null);assert.equal(h.client.good,null);controller.destroy();
});

test('v2 rejects malformed snapshot/publication IDs and CRM source revisions without acknowledging them',async()=>{
    for (const malformed of [null,7,'snapshot','00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaZ']) {
        for (const field of ['snapshotId','publicationId']) {
            const h=harness();const request=h.client.request;h.client.request=async(url,options)=>{const response=await request(url,options);return url.endsWith('/bootstrap') ? {...response,[field]:malformed} : response;};
            await assert.rejects(h.client.refresh(),/динамический снимок/);assert.equal(h.client.good,null);assert.equal(h.calls.filter(c=>c.url.endsWith('/telemetry') && c.options.body.event === 'applied').length,0);
        }
    }
    for (const crm of ['crm','a'.repeat(64),'sha256:'+'A'.repeat(64),'sha256:'+'a'.repeat(63)]) {
        const h=harness();const request=h.client.request;h.client.request=async(url,options)=>{const response=await request(url,options);return url.endsWith('/bootstrap') ? {...response,sourceRevisions:{...response.sourceRevisions,crm}} : response;};
        await assert.rejects(h.client.refresh(),/динамический снимок/);assert.equal(h.client.good,null);
    }
});
test('future-issued lease beyond clock tolerance cannot replace an already accepted snapshot',async()=>{
    const h=harness();const accepted=await h.client.refresh(),end=h.client.leaseUntil,request=h.client.request;
    h.client.request=async(url,options)=>{const response=await request(url,options);if(!url.endsWith('/bootstrap'))return response;const future=Date.parse(response.issuedAt)+60001;return {...response,issuedAt:new Date(future).toISOString(),validUntil:new Date(future+30000).toISOString()};};
    await assert.rejects(h.client.refresh(),/Срок публикации/);assert.equal(h.client.good,accepted);assert.equal(h.client.leaseUntil,end);
});
