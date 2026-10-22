import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createColorAdapter, createColorLoader} from '../src/runtime.js';
import {createSDKFixture} from '../../../packages/widget-runtime/testing/fixture.mjs';
const rule = () => ({id:1,name:'VIP',enabled:true,bgColor:'#ffc5c5',borderColor:'#ff5733',textColor:'#414141',conditions:[{fieldId:504473000,operator:'contains',value:'VIP'}],allowedUsers:[]});
const route = {account_id:'777',product_code:'rkrs_color_leads',function_code:'whole',owner:'core',phase:'active',routing_epoch:1,installation_generation:1,revision:1,ttl_ms:60000,module_key:'color-core-v1'};
const tick = () => new Promise(resolve => setTimeout(resolve,10));
function setup(options={}) {
  const dom = new JSDOM('<body><div id="settings"></div><div class="pipeline_leads__item" data-id="1" style="background-color:blue"><span class="pipeline_leads__field">VIP</span></div><div class="list-row" data-id="1"><span class="list-row__cell-status"></span></div></body>');
  let permits = true, gatewayDestroyed = 0, reads = 0;
  const fixture = createSDKFixture({manual:options.manual,handle:request => request.options.type === 'PUT' ? (options.writeError ? {status:options.writeError,message:'Write failed'} : {data:{settings:request.body.settings,revision:2}}) : {data:options.read?.() || {settings:{main_settings:[rule()]},revision:1}}});
  const adapter = createColorAdapter({widget:fixture,apiUrl:'/fixture-api',document:dom.window.document,userId:42,route,canInvoke:()=>permits,debounceMs:1,
    createReadGateway:()=>({metadata:async()=>({fields:[{id:504473000,name:'Название',type:'text'}],users:[{id:42,name:'Test'}]}),leads:options.leads || (async ids=>{reads++;return {leads:ids.map(id=>({id,name:'VIP'}))};}),destroy(){gatewayDestroyed++;}})});
  adapter.setRouteState({status:'fresh',route});
  return {adapter,fixture,document:dom.window.document,dom,deny(){permits=false;},get reads(){return reads;},get gatewayDestroyed(){return gatewayDestroyed;},cleanup(){adapter.destroy();fixture.destroy();dom.window.close();}};
}
test('inert construction; init colors kanban/list, first rule; destroy restores owned styles',async()=>{
  const env=setup(); assert.equal(env.fixture.requests.length,0);
  env.adapter.invoke('init'); await tick();
  assert.equal(env.document.querySelector('.pipeline_leads__item').style.backgroundColor,'rgb(255, 197, 197)');
  assert.equal(env.document.querySelector('.pipeline_leads__field').style.fontWeight,'600');
  assert.equal(env.document.querySelector('.list-row').style.border,'');
  env.adapter.destroy(); assert.equal(env.document.querySelector('.pipeline_leads__item').style.backgroundColor,'blue');
  assert.equal(env.document.querySelector('.pipeline_leads__field').style.fontWeight,''); env.cleanup();
});
test('settings CRUD editor dispatches revision and route expectations, no tenant body',async()=>{
 const env=setup(); env.adapter.invoke('advancedSettings',[env.document.querySelector('#settings')]); await tick();
 const name=env.document.querySelector('input[type=text]'); name.value='Updated'; name.dispatchEvent(new env.dom.window.Event('change'));
 assert.equal(env.adapter.inspect().dirty,true); assert.equal(env.adapter.invoke('onSave'),false);
 assert.equal(await env.adapter.save(),true);
 const write=env.fixture.requests.find(request=>request.options.type==='PUT');
 assert.equal(write.body.expected_revision,1); assert.equal(write.body.settings.main_settings[0].name,'Updated');
 assert.deepEqual(write.options.headers,{'X-Routing-Epoch':'1','X-Installation-Generation':'1'});
 assert.equal(write.body.account_id,undefined); assert.equal(env.adapter.inspect().dirty,false); env.cleanup();
});
test('stale synchronously disables controls, aborts reads and guards retained callbacks',async()=>{
 const env=setup(); env.adapter.invoke('advancedSettings',[env.document.querySelector('#settings')]); await tick();
 const input=env.document.querySelector('input'); const retained=input.onchange;
 env.adapter.setRouteState({status:'stale',route}); input.value='forbidden'; retained();
 assert.equal(input.disabled,true); assert.equal(env.adapter.inspect().rules[0].name,'VIP');
 const before=env.fixture.requests.length; assert.equal(await env.adapter.save(),false); assert.equal(env.fixture.requests.length,before);
 assert.ok(env.gatewayDestroyed>0); env.cleanup();
});
test('canInvoke blocks effects even before delayed lease timer calls setRouteState',async()=>{
 const env=setup(); env.adapter.invoke('advancedSettings',[env.document.querySelector('#settings')]); await tick(); env.deny();
 assert.equal(await env.adapter.save(),false); const before=env.reads; await env.adapter.refresh(); assert.equal(env.reads,before); env.cleanup();
});
test('late lead response after stale cannot paint; successful resume refreshes',async()=>{
 let resolve; const env=setup({leads:()=>new Promise(done=>{resolve=done;})}); env.adapter.invoke('init'); await tick();
 env.adapter.setRouteState({status:'paused',route}); resolve({leads:[{id:1,name:'VIP'}]}); await tick();
 assert.equal(env.document.querySelector('.pipeline_leads__item').style.backgroundColor,'blue');
 env.adapter.setRouteState({status:'fresh',route}); await tick(); resolve({leads:[{id:1,name:'VIP'}]}); await tick();
 assert.equal(env.document.querySelector('.pipeline_leads__item').style.backgroundColor,'rgb(255, 197, 197)'); env.cleanup();
});
test('destroy aborts pending SDK settings and late success cannot mount or paint',async()=>{
 const env=setup({manual:true}); env.adapter.invoke('init'); const request=env.fixture.requests[0]; env.adapter.destroy();
 assert.equal(request.aborted,true); request.resolve({settings:{main_settings:[rule()]},revision:1}); await tick();
 assert.equal(env.document.querySelector('.pipeline_leads__item').style.backgroundColor,'blue'); env.cleanup();
});
test('repeat mount creates one editor; paused/resume preserves unsaved draft',async()=>{
 const env=setup(); const target=env.document.querySelector('#settings');env.adapter.invoke('advancedSettings',[target]);await tick();
 const input=target.querySelector('input');input.value='Draft';input.dispatchEvent(new env.dom.window.Event('change'));
 env.adapter.invoke('advancedSettings',[target]);env.adapter.setRouteState({status:'paused',route});env.adapter.setRouteState({status:'fresh',route}); await tick();
 assert.equal(target.querySelectorAll('.rkrs-color-settings').length,1);assert.equal(target.querySelector('input').value,'Draft');env.cleanup();
});
test('mutation observer processes inserted leads, disconnects after destroy',async()=>{
 const env=setup();env.adapter.invoke('init');await tick();const item=env.document.createElement('div');item.className='pipeline_leads__item';item.dataset.id='2';env.document.body.append(item);await tick();await tick();
 assert.equal(item.style.backgroundColor,'rgb(255, 197, 197)');env.adapter.destroy();const before=env.reads;env.document.body.append(env.document.createElement('div'));await tick();assert.equal(env.reads,before);env.cleanup();
});
test('cleanup does not overwrite subsequent CRM style changes',async()=>{
 const env=setup();env.adapter.invoke('init');await tick();const element=env.document.querySelector('.pipeline_leads__item');element.style.backgroundColor='green';env.adapter.destroy();assert.equal(element.style.backgroundColor,'green');env.cleanup();
});
test('unknown write stays fenced, no automatic retry, draft retained',async()=>{
 const env=setup({writeError:503});env.adapter.invoke('advancedSettings',[env.document.querySelector('#settings')]);await tick();
 const input=env.document.querySelector('input');input.value='Draft';input.dispatchEvent(new env.dom.window.Event('change'));
 assert.equal(await env.adapter.save(),false);assert.equal(env.adapter.inspect().uncertain,true);
 const before=env.fixture.requests.length;assert.equal(await env.adapter.save(),false);assert.equal(env.fixture.requests.length,before);
 assert.equal(env.adapter.inspect().rules[0].name,'Draft');env.cleanup();
});
test('common loader rejects SSD module and never invokes the old widget',async()=>{
 const dom=new JSDOM('<body></body>');let loads=0;
 const fixture=createSDKFixture({handle:()=>({data:{...route,owner:'ssd',module_key:'color-legacy-v1'}})});
 const loader=createColorLoader({widget:fixture,apiUrl:'/fixture-api',routePath:'/route-fixture',document:dom.window.document,amoCRM:fixture.amoCRM,createReadGateway:()=>{loads++;}});
 await assert.rejects(loader.dispatch('init'), /Route unavailable/);assert.equal(loads,0);await loader.destroy();fixture.destroy();dom.window.close();
});

test('empty initial settings allows creating the first rule',async()=>{
 const env=setup({read:()=>({settings:{},revision:0})});env.adapter.invoke('advancedSettings',[env.document.querySelector('#settings')]);await tick();
 assert.deepEqual(env.adapter.inspect().rules,[]);
 const add=Array.from(env.document.querySelectorAll('button')).find(button=>button.textContent==='Добавить правило');
 assert.equal(add.disabled,false);add.click();assert.equal(env.adapter.inspect().rules.length,1);env.cleanup();
});
test('save roundtrips unknown imported settings keys',async()=>{
 const unknown={legacy:{nested:['retain',7]},futureFlag:true};
 const env=setup({read:()=>({settings:{...unknown,main_settings:[rule()]},revision:1})});env.adapter.invoke('advancedSettings',[env.document.querySelector('#settings')]);await tick();
 assert.equal(await env.adapter.save(),true);
 const write=env.fixture.requests.find(request=>request.options.type==='PUT');
 assert.deepEqual(write.body.settings.legacy,unknown.legacy);assert.equal(write.body.settings.futureFlag,true);env.cleanup();
});
test('recovery fetches current revision, keeps dirty draft and blocks conflicting save',async()=>{
 let server={settings:{main_settings:[rule()]},revision:1};
 const env=setup({read:()=>structuredClone(server)});env.adapter.invoke('advancedSettings',[env.document.querySelector('#settings')]);await tick();
 const input=env.document.querySelector('input');input.value='Draft';input.dispatchEvent(new env.dom.window.Event('change'));
 env.adapter.setRouteState({status:'paused',route});server={settings:{main_settings:[{...rule(),name:'Other user'}]},revision:2};
 env.adapter.setRouteState({status:'fresh',route});await tick();
 assert.equal(env.adapter.inspect().rules[0].name,'Draft');assert.equal(env.document.querySelector('input').value,'Draft');
 assert.equal(env.adapter.inspect().uncertain,true);assert.equal(await env.adapter.save(),false);assert.equal(env.fixture.requests.length,2);env.cleanup();
});
test('clean recovery refreshes editor and persisted highlighting from server',async()=>{
 let server={settings:{main_settings:[rule()]},revision:1};
 const env=setup({read:()=>structuredClone(server)});env.adapter.invoke('advancedSettings',[env.document.querySelector('#settings')]);await tick();
 env.adapter.setRouteState({status:'stale',route});server={settings:{main_settings:[{...rule(),name:'Updated',enabled:false}]},revision:2};
 env.adapter.setRouteState({status:'fresh',route});await tick();
 assert.equal(env.document.querySelector('input').value,'Updated');assert.equal(env.adapter.inspect().revision,2);
 assert.equal(env.document.querySelector('.pipeline_leads__item').style.backgroundColor,'blue');env.cleanup();
});
