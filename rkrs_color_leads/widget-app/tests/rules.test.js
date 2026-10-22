import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkConditions,matchingRule,validateRules} from '../src/rules.js';
const lead={name:'VIP Alpha',responsible_user_id:42,custom_fields_values:[{field_id:5,field_type:'multiselect',values:[{value:'first'},{value:'second'}]},{field_id:6,field_type:'checkbox',values:[{value:true}]}]};
const condition=(fieldId,operator,value)=>[{fieldId,operator,value}];
test('synthetic fields, AND, missing field and legacy first-value semantics',()=>{
 assert.equal(checkConditions(lead,condition(504473000,'contains','vip')),true);
 assert.equal(checkConditions(lead,condition(5044780000,'equals','42')),true);
 assert.equal(checkConditions(lead,condition(5,'equals','second')),false);
 assert.equal(checkConditions(lead,condition(999,'equals','')),false);
 assert.equal(checkConditions(lead,[]),true);
 assert.equal(checkConditions(lead,[...condition(504473000,'contains','vip'),...condition(5044780000,'equals',43)]),false);
 assert.equal(checkConditions(lead,condition(6,'equals','1')),false);
});
test('enabled priority and allowed users preserve array order',()=>{
 const a={enabled:true,conditions:[],allowedUsers:[1]},b={enabled:true,conditions:[]};
 assert.equal(matchingRule(lead,[a,b],42),b);assert.equal(matchingRule(lead,[a,b],1),a);
});
test('date operators preserve browser midnight and strict greater-than boundary',()=>{
 const midnight=new Date(2026,9,22).getTime()/1000;
 const dated={custom_fields_values:[{field_id:7,field_type:'date',values:[{value:midnight}]}]};
 assert.equal(checkConditions(dated,condition(7,'greaterDays',0),(midnight+3600)*1000),true);
 assert.equal(checkConditions(dated,condition(7,'greaterDays',1),(midnight+3600)*1000),false);
 assert.equal(checkConditions(dated,condition(7,'lessDays',1),(midnight+86400)*1000),false);
 assert.equal(checkConditions(dated,condition(7,'lessDays',1),(midnight+86401)*1000),true);
});
test('new editor save requires valid conditions and safe colors',()=>{
 assert.throws(()=>validateRules([{name:'a',conditions:[],bgColor:'#ffffff',borderColor:'#ffffff',textColor:'#ffffff'}]));
});
