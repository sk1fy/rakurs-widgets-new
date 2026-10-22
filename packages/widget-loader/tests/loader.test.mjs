import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerLoader, createLegacyAdapter } from '../index.mjs';

const context = { account_id: '42', product_code: 'color_leads', function_code: 'whole', identity: 'user7:list' };
const route = { account_id: '42', product_code: 'color_leads', function_code: 'whole',
  owner: 'ssd', phase: 'active', routing_epoch: 1, revision: 1,
  installation_generation: 1, ttl_ms: 60000, module_key: 'legacy-v1' };
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const calls = [], errors = [], states = [];
  let time = 100, serial = 0, destroyed = 0, reads = 0;
  const timers = new Map();
  const loader = createOwnerLoader({
    resolveRoute: async () => { reads++; return {...route}; },
    modules: {
      'legacy-v1': {owner:'ssd', product_code:'color_leads', function_code:'whole', cleanupVerified:true,
        load: async () => ({setRouteState:state=>states.push(state),invoke:(name,args)=>{calls.push([name,args]);return name==='onSave'?'saved':true;}, destroy:()=>destroyed++})},
      'core-v2': {owner:'core', product_code:'color_leads', function_code:'whole', cleanupVerified:true,
        load: async () => ({setRouteState:state=>states.push(state),invoke:(name,args)=>{calls.push(['core:'+name,args]);}, destroy:()=>destroyed++})},
    },
    now: () => time,
    setTimer: (fn,ms) => {const id=++serial;timers.set(id,{fn,at:time+ms});return id;},
    clearTimer:id=>timers.delete(id), onUnavailable:error=>errors.push(error), ...overrides,
  });
  return {loader,calls,errors,states,reads:()=>reads,destroyed:()=>destroyed,jump:ms=>{time+=ms;},
    async advance(ms) {
      const end=time+ms;
      for (;;) {
        const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if (!next) break;
        const [id,timer]=next;timers.delete(id);time=timer.at;timer.fn();await flush();
      }
      time=end;await flush();
    }};
}
test('coalesces pending callback, preserves synchronous result and releases once', async () => {
  const f=fixture();
  assert.equal(f.loader.call('onSave', [], context), false);
  await Promise.all([f.loader.dispatch('render',[1],context), f.loader.dispatch('render',[2],context)]);
  assert.deepEqual(f.calls, [['render',[2]]]); assert.equal(f.reads(),1);
  assert.equal(f.loader.call('onSave',[],context),'saved');
  f.loader.destroy(); f.loader.destroy(); assert.equal(f.destroyed(),1);
  assert.equal(f.loader.call('onSave',[],context),false);
});
test('only registered bundle for authoritative owner is loaded', async () => {
  const f=fixture({resolveRoute:async()=>({...route,owner:'core',module_key:'core-v2',routing_epoch:2})});
  await f.loader.dispatch('init',[],context); assert.deepEqual(f.calls,[['core:init',[]]]);
  f.loader.destroy();
});
test('background refresh preserves UI and synchronous save across multiple TTLs', async () => {
  const f=fixture();await f.loader.dispatch('render',[],context);
  await f.advance(180000);
  assert(f.reads()>=4);assert.equal(f.destroyed(),0);
  assert.equal(f.loader.call('onSave',[],context),'saved');
  assert.deepEqual(f.calls.filter(c=>c[0]==='render'),[['render',[]]]);
  await f.loader.destroy();
});
test('offline renewal preserves read-only UI and draft, then recovers without remount', async () => {
  let fail=false;
  const f=fixture({resolveRoute:async()=>{if(fail)throw Error('offline');return route;}});
  await f.loader.dispatch('init',[],context);fail=true;
  await f.advance(60000);
  assert.equal(f.destroyed(),0);assert.equal(f.loader.status(),'stale');
  assert.equal(f.loader.snapshot(),null);assert.equal(f.loader.call('onSave',[],context),false);
  assert.equal(f.states.at(-1).status,'stale');
  fail=false;await f.advance(5000);assert.equal(f.loader.status(),'fresh');
  assert.equal(f.loader.call('onSave',[],context),'saved');assert.equal(f.destroyed(),0);
  await f.loader.destroy();
});
test('suspended browser cannot invoke writes on an expired lease before timers run', async () => {
  const f=fixture();await f.loader.dispatch('init',[],context);f.jump(60001);
  assert.equal(f.loader.call('onSave',[],context),false);assert.equal(f.states.at(-1).status,'stale');
  await flush();assert.equal(f.loader.status(),'fresh');assert.equal(f.destroyed(),0);await f.loader.destroy();
});
test('hung renewal expires into read-only while the original interface remains', async () => {
  let fail=false;const d=defer();
  const f=fixture({resolveRoute:()=>fail?d.promise:Promise.resolve(route)});
  await f.loader.dispatch('init',[],context);fail=true;await f.advance(60000);
  assert.equal(f.destroyed(),0);assert.equal(f.loader.status(),'stale');
  assert.equal(f.loader.call('onSave',[],context),false);await f.loader.destroy();d.resolve(route);await flush();
});
test('late route after destroy does not start legacy code', async () => {
  const d=defer(), f=fixture({resolveRoute:()=>d.promise});
  const p=f.loader.dispatch('init',[],context); f.loader.destroy();d.resolve(route);await p;
  assert.equal(f.calls.length,0);assert.equal(f.destroyed(),0);
});
test('late loaded adapter is disposed without mounting', async () => {
  const d=defer(), started=defer(); let destroyed=0;
  const f=fixture({modules:{'legacy-v1':{owner:'ssd',product_code:'color_leads',function_code:'whole',cleanupVerified:true,load:()=>{started.resolve();return d.promise;}}}});
  const p=f.loader.dispatch('init',[],context);await started.promise;f.loader.destroy();
  d.resolve({setRouteState(){},invoke:()=>assert.fail('must not invoke'),destroy:()=>destroyed++});await p;
  assert.equal(destroyed,1);
});
test('hung module times out; eventual module is cleaned up without activation', async () => {
  const d=defer();let destroyed=0;
  const f=fixture({resolveRoute:async()=>({...route,ttl_ms:5}),setTimer:setTimeout,clearTimer:clearTimeout,
    modules:{'legacy-v1':{owner:'ssd',product_code:'color_leads',function_code:'whole',cleanupVerified:true,load:()=>d.promise}}});
  await assert.rejects(f.loader.dispatch('init',[],context),/timed out/);
  d.resolve({setRouteState(){},invoke:()=>assert.fail(),destroy:()=>destroyed++});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(destroyed,1);
});
test('hung route has a bounded wait and does not start a module', async () => {
  const f=fixture({resolveRoute:()=>new Promise(()=>{}),requestTimeoutMs:5,setTimer:setTimeout,clearTimer:clearTimeout});
  await assert.rejects(f.loader.dispatch('init',[],context),/timed out/);assert.equal(f.calls.length,0);
});
test('identity change invalidates a pending response and old synchronous callbacks', async () => {
  const a=defer(),b=defer();let n=0;
  const f=fixture({resolveRoute:()=>++n===1?a.promise:b.promise});
  const first=f.loader.dispatch('render',['old'],context);
  const second=f.loader.dispatch('render',['new'],{...context,identity:'other-user'});
  b.resolve(route);await second;a.resolve(route);await first;
  assert.deepEqual(f.calls,[['render',['new']]]);
  assert.equal(f.loader.call('onSave',[],context),false);assert.equal(f.destroyed(),1);
});
test('invalid/foreign/frozen route, unregistered URL and unverified cleanup fail closed', async () => {
  for (const patch of [{account_id:99},{product_code:'other'},{function_code:'other'},
    {phase:'frozen'},{owner:'unknown'},{module_key:'https://bad.test/a.js'},
    {owner:'core'}, {ttl_ms:60001},{ttl_ms:0},{routing_epoch:0},
    {revision:NaN},{installation_generation:0}]) {
    const f=fixture({resolveRoute:async()=>({...route,...patch})});
    await assert.rejects(f.loader.dispatch('init',[],context));assert.equal(f.calls.length,0);
  }
  const f=fixture({modules:{'legacy-v1':{owner:'ssd',product_code:'color_leads',function_code:'whole',cleanupVerified:false,load:()=>assert.fail()}}});
  await assert.rejects(f.loader.dispatch('init',[],context),/not approved/);
});
test('network duration consumes route TTL and cannot extend it', async () => {
  let time=0;
  const f=fixture({now:()=>time,resolveRoute:async()=>{time=60001;return route;}});
  await assert.rejects(f.loader.dispatch('init',[],context),/expired/);assert.equal(f.calls.length,0);
});
test('route rollback requires a newer epoch and rejects stale/conflicting snapshots', async () => {
  let current={...route,owner:'core',module_key:'core-v2',routing_epoch:3,revision:5};
  const f=fixture({resolveRoute:async()=>current});
  await f.loader.dispatch('init',[],context);
  current={...route}; await assert.rejects(f.loader.refresh(context),/Stale/);
  current={...route,routing_epoch:3,revision:5}; await assert.rejects(f.loader.refresh(context),/conflicting/);
  current={...route,routing_epoch:3,revision:6}; await assert.rejects(f.loader.refresh(context),/conflicting/);
  current={...route,account_id:42}; await assert.rejects(f.loader.refresh(context),/Stale/);
  current={...route,routing_epoch:4,revision:6}; await f.loader.refresh(context);
  assert.equal(f.loader.snapshot().owner,'ssd'); f.loader.destroy();
});
test('invalid navigation context clears the previous adapter', async () => {
  const f=fixture();await f.loader.dispatch('init',[],context);
  assert.equal(f.loader.call('onSave',[],{...context,account_id:null}),false);
  assert.equal(f.destroyed(),1);
});
test('replacement waits for asynchronous disposal; failed disposal blocks activation', async () => {
  for (const success of [true,false]) {
    const drained=defer();let loads=0;
    const f=fixture({modules:{'legacy-v1':{owner:'ssd',product_code:'color_leads',function_code:'whole',cleanupVerified:true,
      load:async()=>{loads++;return {setRouteState(){},invoke(){},destroy:()=>drained.promise};}}}});
    await f.loader.dispatch('init',[],context);
    const next=f.loader.refresh({...context,identity:'new-user'});await Promise.resolve();await Promise.resolve();
    assert.equal(loads,1);assert.equal(f.loader.call('onSave',[],{...context,identity:'new-user'}),false);
    if (success) {drained.resolve();await next;assert.equal(loads,2);await f.loader.destroy();}
    else {drained.reject(Error('not drained'));await assert.rejects(next,/not drained/);assert.equal(loads,1);
      await assert.rejects(f.loader.refresh(context),/not drained/);}
  }
});
test('legacy adapter preserves SDK this, nested callbacks, sync return and facade', () => {
  let destroyed=0;const facade={},widget={sdk:true,callbacks:facade};
  const adapter=createLegacyAdapter(function(){
    assert.equal(this,widget);this.callbacks={onRouteState(){},destroy(){assert.equal(this,widget);destroyed++;},
      onSalesbotDesignerSave(){return '{"node":1}';},leads:{selected(ids){return [this.sdk,ids];}}};
  },widget,facade);
  assert.equal(widget.callbacks,facade);
  assert.equal(adapter.invoke('onSalesbotDesignerSave'),'{"node":1}');
  assert.deepEqual(adapter.invoke('leads.selected',[[1,2]]),[true,[1,2]]);
  adapter.destroy();adapter.destroy();assert.equal(destroyed,1);assert.equal(adapter.invoke('init'),false);
});

test('reinstall generation is independent of epoch and clears old installation UI for reload', async () => {
  let current={...route};const notices=[];
  const f=fixture({resolveRoute:async()=>current,onStateChange:s=>notices.push(s)});
  await f.loader.dispatch('init',[],context);
  current={...route,revision:2,installation_generation:2};
  await f.loader.refresh(context);
  assert.equal(f.loader.status(),'reload-required');assert.equal(f.destroyed(),1);
  assert.equal(notices.at(-1).route.installation_generation,2);
  assert.equal(f.loader.call('onSave',[],context),false);
  await f.loader.dispatch('render',[],context);assert.equal(f.calls.length,1);
});
test('generation cannot legalize a changed owner without a new epoch', async () => {
  let current=route;const f=fixture({resolveRoute:async()=>current});
  await f.loader.dispatch('init',[],context);
  current={...route,revision:2,installation_generation:2,owner:'core',module_key:'core-v2'};
  await assert.rejects(f.loader.refresh(context),/conflicting/);assert.equal(f.destroyed(),1);
});
test('transition phase preserves paused read-only UI; confirmed new epoch requires reload', async () => {
  let current=route;const f=fixture({resolveRoute:async()=>current});
  await f.loader.dispatch('init',[],context);
  current={...route,phase:'freezing',revision:2,routing_epoch:2};
  await f.loader.refresh(context);
  assert.equal(f.loader.status(),'paused');assert.equal(f.destroyed(),0);
  assert.equal(f.states.at(-1).status,'paused');assert.equal(f.loader.call('onSave',[],context),false);
  current={...route,revision:3,routing_epoch:2,owner:'core',module_key:'core-v2'};
  // The freezing snapshot already reserved epoch 2; target activation uses that epoch.
  await f.loader.refresh(context);assert.equal(f.loader.status(),'reload-required');
  assert.equal(f.destroyed(),1);assert.equal(f.calls.length,1);
});
test('authorization revocation clears previously visible data instead of retaining a stale view', async () => {
  let denied=false;const f=fixture({resolveRoute:async()=>{if(denied)throw Object.assign(Error('forbidden'),{status:403});return route;}});
  await f.loader.dispatch('init',[],context);denied=true;
  await assert.rejects(f.loader.refresh(context),/forbidden/);assert.equal(f.destroyed(),1);assert.equal(f.loader.status(),'unavailable');
});
test('new offline document never boots a remembered legacy module', async () => {
  const f=fixture({resolveRoute:async()=>{throw Error('offline');}});
  await assert.rejects(f.loader.dispatch('init',[],context),/offline/);
  assert.equal(f.calls.length,0);assert.equal(f.loader.status(),'unavailable');
});
test('read-only fence is mandatory; a failed fence destroys the unsafe adapter', async () => {
  let offline=false, destroyed=0;
  const f=fixture({resolveRoute:async()=>{if(offline)throw Error('offline');return route;},
    modules:{'legacy-v1':{owner:'ssd',product_code:'color_leads',function_code:'whole',cleanupVerified:true,
      load:async()=>({setRouteState({status}){if(status!=='fresh')throw Error('cannot pause');},invoke(){},destroy(){destroyed++;}})}}});
  await f.loader.dispatch('init',[],context);offline=true;
  await assert.rejects(f.loader.refresh(context));assert.equal(destroyed,1);assert.equal(f.loader.status(),'unavailable');
});
test('same-revision generation change is rejected', async () => {
  let current=route;const f=fixture({resolveRoute:async()=>current});
  await f.loader.dispatch('init',[],context);current={...route,installation_generation:2};
  await assert.rejects(f.loader.refresh(context),/conflicting/);
});

test('SPA identity change cannot clear a required reload', async () => {
  let current=route;const f=fixture({resolveRoute:async()=>current});
  await f.loader.dispatch('init',[],context);
  current={...route,owner:'core',module_key:'core-v2',routing_epoch:2,revision:2};
  await f.loader.refresh(context);
  await f.loader.dispatch('init',[],{...context,identity:'another-card'});
  assert.equal(f.loader.status(),'reload-required');assert.equal(f.calls.length,1);
});
test('new installation generation in a non-active phase clears old UI immediately', async () => {
  let current=route;const f=fixture({resolveRoute:async()=>current});
  await f.loader.dispatch('init',[],context);
  current={...route,installation_generation:2,revision:2,phase:'freezing'};
  await f.loader.refresh(context);assert.equal(f.loader.status(),'reload-required');assert.equal(f.destroyed(),1);
});
test('adapter event guard rejects effects after expiry even before background timers run', async () => {
  let guard;
  const f=fixture({modules:{'legacy-v1':{owner:'ssd',product_code:'color_leads',function_code:'whole',cleanupVerified:true,
    load:async({canInvoke})=>{guard=canInvoke;assert.equal(guard(),false);return {setRouteState(){},invoke(){},destroy(){}};}}}});
  await f.loader.dispatch('init',[],context);assert.equal(guard(),true);
  f.jump(60001);assert.equal(guard(),false);await f.loader.destroy();assert.equal(guard(),false);
});
