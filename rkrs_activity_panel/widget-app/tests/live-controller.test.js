import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveActivityController } from '../src/live-controller.js';

test('live controller loads real CRM task and context, writes through SDK and restores interval', async () => {
  let current={}, written;
  const listeners=[];
  const context={userId:7,widget:{$authorizedAjax(options){const result={done(fn){queueMicrotask(()=>{let value;if(options.url.endsWith('/state'))value={current,enabled:true,settings:{consider_future_tasks:true}};else if(options.method==='GET')value={items:[]};else {written=JSON.parse(options.data);current={id:'session',kind:'work',started_at:100,context:written.context};value=current;}fn(value);});return result;},fail(){return result;}};return result;}}};
  const fetchImpl=async url=>({ok:true,status:200,json:async()=>url.includes('tasks?')?{_embedded:{tasks:[{id:19,text:'CRM task',task_type_id:1,complete_till:200}]}}:url.endsWith('tasks/19')?{id:19,text:'CRM task',task_type_id:1,entity_type:'leads',entity_id:12}:url.endsWith('leads/12')?{name:'Real deal',pipeline_id:2,status_id:3}:url.includes('pipelines')?{name:'Sales',_embedded:{statuses:[{id:3,name:'New',color:'#fff'}]}}:{_embedded:{task_types:[{id:1,name:'Call'}]}}});
  const controller=createLiveActivityController({context,apiOrigin:'https://api.example.test',appOrigin:'https://panel.example.test',fetchImpl,documentImpl:{querySelectorAll(){return[];}},locationImpl:{pathname:'/'}});
  await new Promise(resolve=>{const unsubscribe=controller.subscribe(state=>{listeners.push(state);if(!state.busy){unsubscribe();resolve();}});});
  assert.equal(controller.getSnapshot().tasks[0].title,'CRM task');
  await controller.startTask('19');assert.equal(written.context.entity_name,'Real deal');assert.equal(written.context.status_name,'New');assert.equal(written.expected_session_id,'');assert.equal(controller.getSnapshot().active.id,'19');controller.dispose();
});

test('Imbox route transition records visible dialog and only closes its own interval', async () => {
  let current={}; const commands=[]; const route={pathname:'/imbox/77'};
  const doc={hidden:false,querySelectorAll(selector){return selector.includes('notification')?[{dataset:{id:'77'},querySelector(){return null;}}]:[];}};
  const widget={$authorizedAjax(options){const request={done(fn){queueMicrotask(()=>{if(options.url.endsWith('/state'))fn({current,enabled:true,settings:{}});else if(options.method==='GET')fn({items:[]});else{const command=JSON.parse(options.data);commands.push(command);current=command.action==='stop'?{}:{id:'imbox-session',kind:'activity',started_at:100,context:command.context};fn(command.action==='stop'?{id:'imbox-session',stopped_at:200}:current);}});return request;},fail(){return request;}};return request;}};
  const controller=createLiveActivityController({context:{widget,userId:7},apiOrigin:'https://api.example.test',appOrigin:'https://panel.example.test',fetchImpl:async()=>({ok:true,status:204}),documentImpl:doc,locationImpl:route});
  const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
  await settle();controller.tick();await settle();
  assert.equal(commands[0].action,'activity');assert.equal(commands[0].context.activity_name,'Imbox 77');assert.ok(commands[0].context.client_id);
  route.pathname='/leads';controller.tick();await settle();
  assert.equal(commands[1].action,'stop');assert.equal(commands[1].session_id,'imbox-session');controller.dispose();
});

function imboxFixture({ failStarts = 0, current: initial = {} } = {}) {
  let current = initial, visible = false;
  const writes = [], route = { pathname: '/imbox/77' };
  const widget = { $authorizedAjax(options) {
    let onFailure;
    const request = { done(fn) {
      queueMicrotask(() => {
        if (options.url.endsWith('/state')) return fn({ current, enabled: true, settings: {} });
        if (options.method === 'GET') return fn({ items: [] });
        const command = JSON.parse(options.data);
        writes.push({ command, id: options.headers['Idempotency-Key'] });
        if (command.action === 'activity' && failStarts-- > 0) return onFailure({ status: 503 });
        current = command.action === 'stop' ? {} : { id: 'session-77', kind: 'activity', started_at: 100, context: command.context };
        fn(command.action === 'stop' ? { id: 'session-77', stopped_at: 200 } : current);
      });
      return request;
    }, fail(fn) { onFailure = fn; return request; } };
    return request;
  } };
  const controller = createLiveActivityController({ context: { widget, userId: 7 }, apiOrigin: 'https://api.example.test', appOrigin: 'https://panel.example.test', fetchImpl: async () => ({ ok: true, status: 204 }), documentImpl: { hidden: false, querySelectorAll(selector) { return visible && selector.includes('notification') ? [{ dataset: { id: '77' }, querySelector() { return null; } }] : []; } }, locationImpl: route });
  return { controller, writes, route, show() { visible = true; } };
}
const settleImbox = () => new Promise(resolve => setImmediate(resolve));

test('delayed Imbox DOM remains pending until the dialog appears; manual stop stays stopped', async () => {
  const fixture = imboxFixture();
  await settleImbox(); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 0);
  fixture.show(); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].command.action, 'activity');
  await fixture.controller.stop(); fixture.controller.tick(); await settleImbox();
  assert.deepEqual(fixture.writes.map(row => row.command.action), ['activity', 'stop']);
  fixture.controller.dispose();
});

test('transient Imbox start retries with backoff and the same command identity', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const fixture = imboxFixture({ failStarts: 2 });
  fixture.show(); await settleImbox(); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 1);
  for (let i = 0; i < 10; i++) fixture.controller.tick();
  await settleImbox(); assert.equal(fixture.writes.length, 1);
  t.mock.timers.tick(1000); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 2);
  t.mock.timers.tick(1000); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 2, 'second retry uses two-second backoff');
  t.mock.timers.tick(1000); fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 3);
  assert.equal(new Set(fixture.writes.map(row => row.id)).size, 1);
  fixture.controller.tick(); await settleImbox(); assert.equal(fixture.writes.length, 3);
  fixture.route.pathname = '/leads'; fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes[3].command.action, 'stop'); fixture.controller.dispose();
});

test('Imbox observation neither replaces nor stops another tab interval', async () => {
  const fixture = imboxFixture({ current: { id: 'foreign', kind: 'activity', started_at: 100, context: { activity_type: 'imbox', activity_name: 'Imbox 88', client_id: 'another-tab' } } });
  fixture.show(); await settleImbox(); fixture.controller.tick(); await settleImbox();
  fixture.route.pathname = '/leads'; fixture.controller.tick(); await settleImbox();
  assert.equal(fixture.writes.length, 0); fixture.controller.dispose();
});
