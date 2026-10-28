import { test } from "node:test";
import assert from "node:assert/strict";
import { createActivitySessionClient } from "../src/session-client.js";

test("network retry preserves command identity but gets a fresh disposable JWT", async () => {
  let tokens=0;const calls=[];
  const client=createActivitySessionClient({baseURL:"https://api.example.test",getToken:async()=>`jwt-${++tokens}`,fetchImpl:async(url,options)=>{calls.push({url,options});if(calls.length===1)throw Error("response lost");return {ok:true,json:async()=>({id:"session-1",stopped_at:0})};}});
  await assert.rejects(client.startImbox(123),/response lost/);
  await assert.rejects(client.startTask({task_id:7}),/pending command/);
  await client.retryPending();
  assert.equal(calls[0].options.headers["Idempotency-Key"],calls[1].options.headers["Idempotency-Key"]);
  assert.notEqual(calls[0].options.headers.Authorization,calls[1].options.headers.Authorization);
  assert.equal(JSON.parse(calls[1].options.body).context.activity_type,"imbox");
  assert.equal(client.getState().active.id,"session-1");client.dispose();
});
test("stop carries the acknowledged session ID and result, with no client actor override", async()=>{
 const bodies=[];const client=createActivitySessionClient({baseURL:"https://api.example.test",getToken:async()=>"jwt",fetchImpl:async(_,o)=>{const body=JSON.parse(o.body);bodies.push(body);return {ok:true,json:async()=>({id:"server-session",stopped_at:body.action==="stop"?100:0})};}});
 await client.startTask({task_id:8,entity_id:9,entity_type:"leads"});await client.stop("Done");assert.equal(bodies[1].session_id,"server-session");assert.equal(bodies[1].context.task_result,"Done");assert.equal(bodies[0].employee_id,undefined);assert.equal(client.getState().active,null);client.dispose();
});
test('SDK transport restores active state and guards cross-tab replacement', async () => {
  const calls=[];
  const client=createActivitySessionClient({baseURL:'https://api.example.test',authorizedRequest:async options => {calls.push(options);if(options.method==='GET')return {current:{id:'existing',stopped_at:0}};return {id:'new',stopped_at:0};}});
  await client.loadState();await client.startTask({task_id:9});
  assert.equal(calls[0].method,'GET');assert.equal(calls[0].data,undefined);
  assert.equal(JSON.parse(calls[1].data).expected_session_id,'existing');
  assert.ok(calls[1].headers['Idempotency-Key']);client.dispose();
});
test('definitive conflict releases command for a refresh, network errors remain retryable', async () => {
  let fail=true;
  const client=createActivitySessionClient({baseURL:'https://api.example.test',authorizedRequest:async()=>{if(fail){const e=new Error('conflict');e.status=409;throw e;}return {id:'new',stopped_at:0};}});
  await assert.rejects(client.startTask({task_id:3}));assert.equal(client.getState().pending,false);
  fail=false;await client.startTask({task_id:4});client.dispose();
});

test('pending identity survives reload and a state read without storing credentials', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const calls = [];
  const first = createActivitySessionClient({ baseURL: 'https://api.example.test', storage, storageKey: 'employee-7', authorizedRequest: async options => { calls.push(options); throw Error('response lost'); } });
  await assert.rejects(first.startTask({ task_id: 7 }));
  first.dispose();
  const second = createActivitySessionClient({ baseURL: 'https://api.example.test', storage, storageKey: 'employee-7', authorizedRequest: async options => { calls.push(options); return options.method === 'GET' ? { current: { id: 'acknowledged' } } : { id: 'acknowledged', stopped_at: 0 }; } });
  assert.equal(second.getState().pending, true);
  await second.loadState();
  assert.equal(second.getState().pending, true);
  await second.retryPending();
  assert.equal(calls[0].headers['Idempotency-Key'], calls[2].headers['Idempotency-Key']);
  assert.equal(calls[0].data, calls[2].data);
  assert.equal(values.has('employee-7'), false);
  assert.ok(!JSON.stringify([...values]).includes('jwt'));
  second.dispose();
});

test('late SDK responses after dispose do not acknowledge or clear a pending command', async () => {
  let finish;
  const client = createActivitySessionClient({ baseURL: 'https://api.example.test', authorizedRequest: () => new Promise(resolve => { finish = resolve; }) });
  const pending = client.startTask({ task_id: 9 });
  client.dispose();
  finish({ id: 'late-session', stopped_at: 0 });
  await assert.rejects(pending, /disposed/);
  assert.equal(client.getState().active, null);
  assert.equal(client.getState().pending, true);
});

test('recovery stop stays bound to its captured interval even after current state changes', async () => {
  let command;
  const client = createActivitySessionClient({ baseURL: 'https://api.example.test', authorizedRequest: async options => {
    if (options.method === 'GET') return { current: { id: 'different-active' } };
    command = JSON.parse(options.data);
    return { id: command.session_id, stopped_at: 200 };
  } });
  await client.loadState();
  await client.stopSession('captured-session', 'Результат');
  assert.equal(command.session_id, 'captured-session');
  assert.equal(command.context.task_result, 'Результат');
  client.dispose();
});
test('task reads and completion go only to the server task endpoints, carrying Retry-After', async () => {
  const calls=[];
  const client=createActivitySessionClient({baseURL:'https://api.example.test',getToken:async()=>'jwt',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.endsWith('/tasks'))return {ok:false,status:429,headers:{get:name=>name==='Retry-After'?'13':null},json:async()=>({error:{code:'resource_exhausted',message:'later'}})};return {ok:true,json:async()=>({id:9})};}});
  await assert.rejects(client.loadTasks(),error=>error.status===429&&error.retryAfter===13&&error.code==='resource_exhausted');
  await client.loadTasks(5);await client.loadTask(9,{context:true});await client.completeTask(9,'Готово');await client.loadLead(5);
  assert.deepEqual(calls.map(row=>[row.options.method,row.url.replace('https://api.example.test/api/v1/widget/activity/','')]),[['GET','tasks'],['GET','tasks?lead_id=5'],['GET','tasks/9?context=true'],['POST','tasks/9/complete'],['GET','leads/5']]);
  assert.deepEqual(JSON.parse(calls[3].options.body),{result:'Готово'});
  assert.equal(calls[3].options.headers['Idempotency-Key'],undefined);
  assert.equal(client.getState().pending,false,'completion is not a session command');client.dispose();
});
