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
