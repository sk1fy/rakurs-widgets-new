'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Snapshot=require('../lib/snapshot'),Rules=require('../lib/rules');
const TeamOS=require('../lib/teamos')(Snapshot,Rules);
const Controller=require('../lib/teamos_controller')(TeamOS);
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const job={id,kind:'catalog',catalogId:'77',scope:{accountId:'123',product:'task-control'},state:'pending',expiresAt:new Date(Date.now()+60000).toISOString()};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('bridge GET uses fresh admin assertion; PUT binds fresh proof to exact job id; never runtime bearer',async()=>{
 const calls=[];let assertion=0;
 const client=new TeamOS.Client({accountId:123,settings:()=>({oauth_client_uuid:id}),coreOrigin:'https://core.example',backendOrigin:'https://backend.example',uuid:()=>id,request:async(url,options={})=>{calls.push({url,options});if(url.includes('disposable_token'))return{token:'jwt'};if(url.endsWith('/auth'))return{assertion:'admin'+(++assertion)};return{requests:[job]};}});
 await client.pendingSources();await client.submitSource(id,{complete:true,payload:{rules:[]}});
 const auth=calls.filter(c=>c.url.endsWith('/auth'));assert.deepEqual(auth.map(c=>c.options.body.purpose),['adminBridge','adminBridge']);assert.equal(auth[1].options.body.requestId,id);
 const get=calls.find(c=>c.url.endsWith('/source-requests'));assert.equal(get.options.headers.Authorization,'Bearer admin1');
 const put=calls.find(c=>c.url.endsWith('/result'));assert.equal(put.options.method,'PUT');assert.equal(put.options.headers.Authorization,'Bearer admin2');assert.equal(put.options.body.coreAssertion,'admin2');assert.equal(calls.some(c=>c.url.endsWith('/sessions')),false);
});
test('bridge polls complete jobs; partial reads upload explicit failure and foreign scopes are ignored',async()=>{
 const submitted=[],captured=[];
 const controller=new Controller({accountId:123,get_settings:()=>({teamos_enabled:'1'})},{},{},()=>{});
 controller.running=true;controller.client={pendingSources:async()=>({requests:[{...job,scope:{...job.scope,accountId:'456'}},job]}),submitSource:async(id,result)=>submitted.push({id,result})};
 controller.migration={capture:async request=>{captured.push(request);throw Object.assign(new Error('partial'),{code:'INCOMPLETE_PAGINATION'});}};
 controller.pollSources();await flush();assert.equal(captured.length,1);assert.equal(submitted.length,1);assert.equal(submitted[0].result.complete,false);assert.equal(submitted[0].result.payload.issues[0].code,'INCOMPLETE_PAGINATION');
});
test('TeamOS disabled makes zero bridge/runtime network calls',async()=>{
 let calls=0;const controller=new Controller({accountId:123,get_settings:()=>({teamos_enabled:'0'})},{},{},()=>{});controller.client={pendingSources:()=>calls++,refresh:()=>calls++};controller.migration={capture:()=>calls++};controller.start();controller.pollSources();await flush();assert.equal(calls,0);
});
test('bridge late catalog result after destroy never submits',async()=>{
 let release,submitted=0;const controller=new Controller({accountId:123,get_settings:()=>({teamos_enabled:'1'})},{},{},()=>{});controller.running=true;
 controller.client={pendingSources:async()=>({requests:[job]}),submitSource:async()=>submitted++,clear:()=>{}};
 controller.migration={capture:()=>new Promise(resolve=>release=resolve)};controller.pollSources();await flush();controller.destroy();release({complete:true});await flush();assert.equal(submitted,0);
});
test('strict paginator rejects cap and malformed pages rather than reporting empty success',async()=>{
 const {AmoApiClient}=require('../lib/amo_api');
 const context={get:async()=>({_embedded:{elements:[{id:1}]},_links:{next:{href:'?page=2'}}})};
 await assert.rejects(AmoApiClient.prototype.getAllPages.call(context,'/api/v4/catalogs/77/elements','elements',{maxPages:1,requireComplete:true}),{code:'INCOMPLETE_PAGINATION'});
 context.get=async()=>({_embedded:{},_links:{}});
 await assert.rejects(AmoApiClient.prototype.getAllPages.call(context,'/api/v4/catalogs/77/elements','elements',{requireComplete:true}),{code:'INVALID_RESPONSE'});
 let page=0;context.get=async()=>({_embedded:{elements:[{id:++page}]},_links:page===1?{next:{href:'?page=2'}}:{}});
 const all=await AmoApiClient.prototype.getAllPages.call(context,'/api/v4/catalogs/77/elements','elements',{maxPages:5,requireComplete:true});assert.deepEqual(all,[{id:1},{id:2}]);
});
test('standalone mode verification uses runtime connection endpoint with renewed scope, never managed bootstrap',async()=>{
 const scope={companyId:'company',accountId:'123',bindingId:'binding',bindingRevision:1,installationId:'install',integrationId:'integration',modeEpoch:2,product:'task-control',generation:1};
 const calls=[];let mode='standalone';
 const client=new TeamOS.Client({accountId:123,settings:()=>({oauth_client_uuid:id}),coreOrigin:'https://core.example',backendOrigin:'https://backend.example',uuid:()=>id,request:async(url,options={})=>{calls.push({url,options});if(url.includes('disposable_token'))return{token:'jwt'};if(url.endsWith('/auth'))return{assertion:'proof'};if(url.endsWith('/sessions'))return{accessToken:'a'.repeat(43),expiresAt:new Date(Date.now()+60000).toISOString(),scope,actorId:'7',runtimeSchemaVersion:2};if(url.endsWith('/connection'))return{scope,mode,state:'active'};throw new Error('Unexpected endpoint');}});
 await client.verifyStandalone(scope);assert.equal(calls.filter(c=>c.url.endsWith('/connection')).length,1);assert.equal(calls.some(c=>c.url.endsWith('/bootstrap')),false);
 mode='managed';await assert.rejects(client.verifyStandalone(scope));assert.equal(calls.filter(c=>c.url.endsWith('/sessions')).length,2);
});
test('explicit admin bridge opt-in imports standalone rules without enabling managed runtime',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let polls=0,proofs=0,submits=0, runtime=0;
 const controller=new Controller({accountId:123,get_settings:()=>({teamos_enabled:'0'})},{},{},()=>{});
 controller.client={proof:async purpose=>{assert.equal(purpose,'adminBridge');proofs++;return{assertion:'admin'};},pendingSources:async()=>{polls++;return{requests:[job]};},submitSource:async()=>submits++,refresh:()=>runtime++,clear:()=>{}};
 controller.migration={capture:async()=>({complete:true})};controller.start();await flush();assert.equal(polls,0);
 await controller.startAdminBridge();await flush();assert.equal(proofs,1);assert.equal(polls,1);assert.equal(submits,1);assert.equal(runtime,0);assert.equal(controller.running,false);
 controller.destroy();t.mock.timers.tick(30000);await flush();assert.equal(polls,1);
});
