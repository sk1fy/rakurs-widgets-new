'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const Snapshot=require('../lib/snapshot'),Rules=require('../lib/rules');
function amd(name,args){let factory;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/'+name+'.js'),'utf8'),{define:(_deps,fn)=>factory=fn(),URL,performance,crypto,Promise,Date,setTimeout,clearTimeout,unescape,encodeURIComponent});return factory(...args);}
const TeamOS=amd('teamos',[Snapshot,Rules]),Controller=amd('teamos_controller',[TeamOS]);
const scope={companyId:'c',accountId:'123',bindingId:'b',installationId:'i',integrationId:'o',bindingRevision:1,modeEpoch:2,generation:1,product:'task-control'};
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
function harness(){let clock=0,wall=Date.parse('2026-10-16T12:00:00Z');const events=[];const h={events,advance:ms=>{clock+=ms;wall+=ms;}};h.client=new TeamOS.Client({accountId:'123',settings:()=>({oauth_client_uuid:crypto.randomUUID()}),coreOrigin:'https://core.example',backendOrigin:'https://api.example',now:()=>wall,clock:()=>clock,uuid:crypto.randomUUID,request:async(url,o)=>{
if(url.includes('disposable_token'))return {token:'SECRET'};
if(url.endsWith('/auth'))return {assertion:'SECRET'};
if(url.endsWith('/sessions'))return {scope,actorId:'7',runtimeSchemaVersion:1,accessToken:'S'.repeat(43),expiresAt:new Date(wall+300000).toISOString()};
if(url.endsWith('/telemetry')){events.push(o.body);if(h.failure)throw h.failure;return;}
return {scope,actorId:'7',runtimeSchemaVersion:1,issuedAt:new Date(wall).toISOString(),validUntil:new Date(wall+180000).toISOString(),minRuntimeVersion:'1.2.2',mode:'managed',publicationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',publicationVersion:1,runtimeRevision:1,payloadChecksum:Snapshot.hashRules([]),publication:{scope,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',schemaVersion:1,version:1,runtimeRules:[],checksum:Snapshot.hashRules([])}};
}});return h;}
test('actual AMD v1 received is distinct from applied; repeated apply becomes bounded heartbeat without lease renewal',async()=>{
const h=harness(),good=await h.client.refresh();assert.deepEqual(h.events.map(e=>e.event),['received']);const lease=h.client.leaseUntil;
await h.client.acknowledge(good);await h.client.acknowledge(good);await h.client.acknowledge(good);
assert.deepEqual(h.events.map(e=>e.event),['received','applied','heartbeat']);h.advance(60000);await h.client.acknowledge(good);assert.equal(h.events.at(-1).event,'heartbeat');assert.equal(h.client.leaseUntil,lease);
for(const event of h.events){assert.equal(event.runtimeRevision,1);assert.equal(event.publicationVersion,1);assert.equal(event.runtimeVersion,'1.2.2');assert.equal(event.correlationId,good.correlationId);assert.ok(event.eventId);assert.ok(event.occurredAt);assert.equal(event.snapshotId,undefined);}
assert.equal(new Set(h.events.map(e=>e.eventId)).size,h.events.length);
h.advance(180001);await h.client.acknowledge(good);assert.equal(h.events.length,4);
});
test('actual AMD independent tabs have unique instance IDs; clear stops only its own telemetry',async()=>{
const a=harness(),b=harness(),ga=await a.client.refresh(),gb=await b.client.refresh();assert.notEqual(a.client.runtimeInstanceId,b.client.runtimeInstanceId);await a.client.acknowledge(ga);await b.client.acknowledge(gb);a.client.clear();await a.client.acknowledge(ga);b.advance(60000);await b.client.acknowledge(gb);assert.equal(a.events.length,2);assert.equal(b.events.at(-1).event,'heartbeat');assert.equal(b.client.good,gb);
});
test('actual AMD errors contain allowlisted codes only and failed engine never emits applied',async t=>{
t.mock.timers.enable({apis:['setTimeout']});const h=harness();const c=new Controller({get_settings:()=>({teamos_enabled:'1'})},{},{},()=>{throw Error('SECRET token rules@example.org');});c.client=h.client;c.start();await flush();assert.deepEqual(h.events.map(e=>e.event),['received','error']);assert.equal(h.events[1].errorCode,'apply_failed');assert.equal(JSON.stringify(h.events).includes('SECRET'),false);assert.equal(JSON.stringify(h.events).includes('rules@example.org'),false);const count=h.events.length;c.destroy();t.mock.timers.tick(120000);await flush();assert.equal(h.events.length,count);
});
test('actual AMD arbitrary diagnostic error is sanitized and stale foreign snapshots send no data',async()=>{
const h=harness(),good=await h.client.refresh();await h.client.reportError('SECRET customer@example.org');assert.equal(h.events.at(-1).errorCode,'config_invalid');const count=h.events.length;await h.client.acknowledge({...good,scope:{...scope,modeEpoch:9}});assert.equal(h.events.length,count);assert.equal(JSON.stringify(h.events).includes('SECRET'),false);
});
test('actual AMD pending received POST cannot delay installing runtime, while wire order remains received then applied',async t=>{
t.mock.timers.enable({apis:['setTimeout']});const h=harness(),request=h.client.request;let release,installed=false;
h.client.request=async(url,options)=>{if(url.endsWith('/telemetry')&&options.body.event==='received'){await request(url,options);await new Promise(resolve=>{release=resolve;});return;}return request(url,options);};
const controller=new Controller({get_settings:()=>({teamos_enabled:'1'})},{},{},good=>{installed=!!good;return true;});controller.client=h.client;controller.start();await flush();
assert.equal(installed,true);assert.equal(h.client.good.version,1);assert.deepEqual(h.events.map(e=>e.event),['received']);assert.equal(typeof release,'function');release();await flush();assert.deepEqual(h.events.map(e=>e.event),['received','applied']);controller.destroy();
});
test('actual AMD bootstrap failure reports bounded sanitized error with authorized session and no publication',async()=>{
const h=harness(),request=h.client.request;h.client.sleep=async()=>{};h.client.request=async(url,options)=>{if(url.endsWith('/bootstrap'))throw Object.assign(new Error('SECRET CRM private@example.org'),{status:503});return request(url,options);};
await assert.rejects(h.client.refresh());await flush();assert.equal(h.events.length,1);const e=h.events[0];assert.equal(e.event,'error');assert.equal(e.errorCode,'references_unavailable');assert.equal(e.publicationId,undefined);assert.equal(e.runtimeRevision,undefined);assert.equal(e.payloadChecksum,undefined);assert.equal(e.actorId,'7');assert.equal(e.scope.accountId,'123');assert.ok(e.correlationId);assert.equal(JSON.stringify(e).includes('SECRET'),false);
await assert.rejects(h.client.refresh());await flush();assert.equal(h.events.length,1);
});
test('actual AMD revoked session cannot emit anonymous error or foreign bootstrap evidence',async()=>{
for(const status of [401,403]){const h=harness(),request=h.client.request;h.client.request=async(url,options)=>{if(url.endsWith('/bootstrap'))throw Object.assign(new Error('revoked'),{status});return request(url,options);};await assert.rejects(h.client.refresh());await flush();assert.equal(h.events.length,0);}
const h=harness(),request=h.client.request;h.client.request=async(url,options)=>{const result=await request(url,options);return url.endsWith('/bootstrap')?{...result,scope:{...scope,accountId:'999'}}:result;};await assert.rejects(h.client.refresh());await flush();assert.equal(h.events.length,0);
});
test('actual AMD background received revocation immediately clears an already installed engine',async t=>{
t.mock.timers.enable({apis:['setTimeout']});const h=harness(),request=h.client.request;let reject,installed=false;h.client.request=async(url,options)=>{if(url.endsWith('/telemetry')&&options.body.event==='received'){await request(url,options);return new Promise((_resolve,no)=>{reject=no;});}return request(url,options);};const controller=new Controller({get_settings:()=>({teamos_enabled:'1'})},{},{},good=>{installed=!!good;return true;});controller.client=h.client;controller.start();await flush();assert.equal(installed,true);reject(Object.assign(new Error('revoked'),{status:403}));await flush();assert.equal(installed,false);assert.equal(h.client.good,null);controller.destroy();
});
