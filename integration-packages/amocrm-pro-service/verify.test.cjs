const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('../../rkrs_lead_distribution/widget-app/node_modules/jsdom');
const root = path.join(__dirname, 'widget');
function fixture(ajax) {
  const dom = new JSDOM('<div id="card"></div><div id="widget_settings__fields_wrapper"></div><div id="foreign_custom_content">Foreign UI</div><input id="foreign_custom" value="preserve">');
  const document = dom.window.document;
  const handlers = new Set();
  function $(selector, attrs) {
    let nodes;
    if (typeof selector === 'string' && selector.startsWith('<')) {
      const node = document.createElement(selector.replace(/[<>]/g,''));
      for (const [k,v] of Object.entries(attrs || {})) node.setAttribute(k,v);
      nodes = [node];
    } else nodes = typeof selector === 'string' ? [...document.querySelectorAll(selector)] : [selector].filter(Boolean);
    const api = {length:nodes.length, 0:nodes[0], off(){return api;}, on(_event, selector){handlers.add(selector);return api;},
      appendTo(target){for(const n of nodes) target.appendChild(n);return api;},
      append(html){for(const n of nodes)n.insertAdjacentHTML('beforeend',html);return api;},
      find(selector){return $(nodes[0]?.querySelector(selector));},css(){return api;},
      text(value){if(value===undefined)return nodes[0]?.textContent;for(const n of nodes)if(n)n.textContent=value;return api;}
    };
    return api;
  }
  const mounts = [], destroys = [];
  const app = {mount(c){mounts.push(c);},destroy(w){destroys.push(w);}};
  const APP = {constant(k){return {account:{id:30402778},user:{id:10912522},card_id:32890655}[k];},data:{}};
  const modules = {};
  function load(file) {
    let factory;
    const req = (_deps, done) => done(app); req.undef = () => {};
    vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{APP,window:{APP,crypto:dom.window.crypto},document,Event:dom.window.Event,Promise,setTimeout,clearTimeout,require:req,define(deps,fn){factory=fn(...deps.map(name=>name==='jquery'?$:name==='./backend-client.js'?{}:modules[name]));}});
    return factory;
  }
  modules['./lib/legacy-widget.js'] = load('lib/legacy-widget.js');
  modules['./lib/distribution-adapter.js'] = load('lib/distribution-adapter.js');
  const Widget = load('script.js');
  const language = JSON.parse(fs.readFileSync(path.join(root,'i18n/ru.json')));
  const self = {params:{path:'https://account.amocrm.ru/widget'},get_settings(){assert.equal(this,self);return {widget_code:'amocrm-pro-service',backend_url:'https://example.test',integration_code:'amocrm_pro_test'};},i18n(k){return language[k];},get_version(){return '0.6.2';},system(){return {area:'lcard'};},render_template(t){document.getElementById('card').innerHTML=t.render;}};
  if (ajax) self.$authorizedAjax = ajax;
  Widget.call(self);
  return {self,document,mounts,destroys,handlers};
}
const tick = () => new Promise(r=>setImmediate(r));
test('legacy settings, translations and DP contract coexist without Activity replacement',()=>{
  const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  assert.equal(m.settings.backend_url.required,true);
  assert.equal(m.settings.integration_code.required,true);
  assert(m.locations.includes('digital_pipeline'));
  assert.equal(m.dp.settings.groupId.required,true);
  assert.equal(m.widget.version,'0.6.2');
  const legacy=fs.readFileSync(path.join(root,'lib/legacy-widget.js'),'utf8');
  assert.match(legacy,/data-action="configure-rule"/);
  assert.match(legacy,/data-action="set-status"/);
  assert(!fs.existsSync(path.join(root,'lib/activity-panel.js')));
});
test('real legacy render and distribution render coexist using constant card_id',async()=>{
  const f=fixture();f.self.callbacks.render();f.self.callbacks.bind_actions();await tick();
  assert(f.document.querySelector('.amopro-tester'));
  assert(f.document.querySelector('[data-amopro-distribution-card]'));
  for(const action of ['bootstrap','ping','set-status','configure-rule'])assert(f.handlers.has(`[data-action="${action}"]`));
  assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].leadId,'32890655');
  f.self.callbacks.destroy();assert(f.destroys.length);
});
test('settings append both modules and leave foreign custom fields untouched',async()=>{
  const f=fixture();const body=f.document.getElementById('widget_settings__fields_wrapper');
  f.self.callbacks.settings(body);await tick();
  assert(body.querySelector('.amopro-settings'));
  assert(body.querySelector('[data-amopro-distribution-settings]'));
  assert.equal(f.document.getElementById('foreign_custom_content').textContent,'Foreign UI');
  assert.equal(f.document.getElementById('foreign_custom').value,'preserve');
  f.self.callbacks.settings(body);await tick();
  assert.equal(body.querySelectorAll('[data-amopro-distribution-settings]').length,1);
  f.self.callbacks.destroy();
});
test('repeat render disposes old distribution instance and preserves one separate host',async()=>{
  const f=fixture();f.self.callbacks.render();await tick();f.self.callbacks.render();await tick();
  assert.equal(f.document.querySelectorAll('[data-amopro-distribution-card]').length,1);
  assert(f.document.querySelector('.amopro-tester'));assert(f.destroys.length);
  assert.equal(f.mounts.length,2);f.self.callbacks.destroy();
});

const groupA = 'e57e4a36-7a55-4b15-9d43-52a9cb5667d5';
const groupB = 'f7a5b11d-868a-4c1f-8223-d51fab434698';
function dpFixture(saved = groupA) {
  const requests = [];
  const f = fixture(options => {
    const r = {options, done(fn){this.success=fn;return this;}, fail(fn){this.failure=fn;return this;}, abort(){this.aborted=true;}};
    requests.push(r); return r;
  });
  f.document.body.insertAdjacentHTML('beforeend', `<div id="other-action"><input name="groupId" value="foreign"><input name="key" value="foreign-key"></div><div id="our-action"><div data-action="send_widget_hook"><div><span class="digital-pipeline__short-task_widget-style_amocrm-pro-service"></span></div><div class="key-row"><div>Ключ распределения (из настроек интеграции)</div><div><input name="key" value="existing-key"></div></div><input name="groupId" value="${saved}"></div></div>`);
  return {...f,requests,scope:f.document.getElementById('our-action')};
}
test('DP callback without arguments finds its action, replaces UUID field, saves selection using amo events',()=>{
  const f=dpFixture(); const input=f.scope.querySelector('[name=groupId]');
  let changes=0; input.addEventListener('change',()=>changes++);
  f.self.callbacks.dpSettings(); f.self.callbacks.dpSettings();
  assert.equal(f.requests.length,1); assert.equal(input.hidden,true);
  assert.equal(f.document.querySelector('#other-action [name=groupId]').hidden,false);
  assert.deepEqual(JSON.parse(f.requests[0].options.data),{kind:'groups'});
  f.requests[0].success({items:[{id:groupA,name:'Distribution E2E Live Group'},{id:groupB,name:'<img src=x onerror=alert(1)>'}]});
  const select=f.scope.querySelector('select');
  assert.equal(select.value,groupA);assert.equal(select.disabled,false);
  assert(select.textContent.includes('Distribution E2E Live Group'));
  assert.equal(select.querySelector('img'),null);
  select.value=groupB; select.dispatchEvent(new input.ownerDocument.defaultView.Event('change'));
  assert.equal(input.value,groupB); assert.equal(changes,1);
  assert.equal(f.scope.querySelector('[name=key]').value,'');
  assert.equal(f.scope.querySelector('[name=key]').hidden,true);
  assert.equal(f.scope.querySelector('.key-row').hidden,true);
  assert.equal(f.document.querySelector('#other-action [name=groupId]').value,'foreign');
});
test('failed group lookup preserves saved selection and retry recovers without manual UUID entry',()=>{
  const f=dpFixture();f.self.callbacks.dpSettings(f.scope);
  f.requests[0].failure({status:403});
  assert.match(f.scope.textContent,/Нет доступа/);
  assert.equal(f.scope.querySelector('[name=groupId]').value,groupA);
  assert.equal(f.scope.querySelector('select').disabled,true);
  const retry=f.scope.querySelector('button');assert.equal(retry.hidden,false);retry.click();
  assert.equal(f.requests.length,2);
  f.requests[1].success({items:[{id:groupA,name:'Моя группа'}]});
  assert.equal(f.scope.querySelector('select').value,groupA);
  assert.equal(retry.hidden,true);
});
test('missing saved group and empty lists never erase persisted UUID; closed action ignores late response',()=>{
  const f=dpFixture();f.self.callbacks.dpSettings(f.scope);
  f.requests[0].success({items:[{id:groupB,name:'Другая группа'}]});
  assert.equal(f.scope.querySelector('select').value,groupA);
  assert.match(f.scope.textContent,/Сохранённая группа недоступна/);
  assert.equal(f.scope.querySelector('[name=groupId]').value,groupA);
  const e=dpFixture();e.self.callbacks.dpSettings(e.scope);e.requests[0].success({items:[]});
  assert.match(e.scope.textContent,/Нет доступных групп/);
  assert.equal(e.scope.querySelector('[name=groupId]').value,groupA);
  const late=dpFixture();late.self.callbacks.dpSettings(late.scope);late.scope.remove();
  late.requests[0].success({items:[{id:groupA,name:'Моя группа'}]});
  assert.equal(late.scope.querySelector('select').disabled,true);
  late.self.callbacks.destroy();assert.equal(late.requests[0].aborted,true);
});
const dpKeyA = 'dp_' + 'a'.repeat(43);
const dpKeyB = 'dp_' + 'b'.repeat(43);
test('DP auto-connect uses its SDK identity and saves a hidden scoped key, with no secret text in UI',()=>{
  const f=dpFixture();f.self.callbacks.dpSettings();
  f.requests[0].success({items:[{id:groupA,name:'Рабочая группа'}]});
  const body=JSON.parse(f.requests[1].options.data);
  assert.deepEqual({kind:body.kind,write:body.write,groupId:body.groupId},{kind:'dp_settings',write:true,groupId:groupA});
  assert.match(body.requestId,/^[0-9a-f-]{36}$/);
  assert.equal(body.accountId,undefined);assert.equal(body.installationId,undefined);
  assert.equal(f.self.callbacks.onSave(),false);
  f.requests[1].success({state:'connected',groupId:groupA,groupName:'Рабочая группа',key:dpKeyA});
  assert.equal(f.scope.querySelector('[name=key]').value,dpKeyA);
  assert.equal(f.scope.querySelector('[name=key]').hidden,true);
  assert.equal(f.scope.querySelector('.key-row').hidden,true);
  assert.match(f.scope.textContent,/Подключено к TeamOS/);
  assert.equal(f.scope.textContent.includes(dpKeyA),false);
  assert.equal(f.self.callbacks.onSave(),true);
});
test('group change invalidates old credential and ignores delayed response for former group',()=>{
  const f=dpFixture();f.self.callbacks.dpSettings();
  f.requests[0].success({items:[{id:groupA,name:'A'},{id:groupB,name:'B'}]});
  const select=f.scope.querySelector('select');select.value=groupB;
  select.dispatchEvent(new f.document.defaultView.Event('change'));
  assert.equal(f.scope.querySelector('[name=key]').value,'');
  f.requests[1].success({state:'connected',groupId:groupA,key:dpKeyA});
  assert.equal(f.scope.querySelector('[name=key]').value,'');
  f.requests[2].success({state:'connected',groupId:groupB,key:dpKeyB});
  assert.equal(f.scope.querySelector('[name=key]').value,dpKeyB);
  assert.equal(f.self.callbacks.onSave(),true);
});
test('failed issuance for new group blocks save, retry recovers and wrong-group response is rejected',()=>{
  const f=dpFixture('');f.self.callbacks.dpSettings();
  f.requests[0].success({items:[{id:groupA,name:'A'}]});
  const select=f.scope.querySelector('select');select.value=groupA;
  select.dispatchEvent(new f.document.defaultView.Event('change'));
  f.requests[1].failure({status:403});
  assert.equal(f.self.callbacks.onSave(),false);assert.match(f.scope.textContent,/Нет прав/);
  f.scope.querySelector('button').click();
  f.requests[2].success({state:'connected',groupId:groupB,key:dpKeyB});
  assert.equal(f.scope.querySelector('[name=key]').value,'');
  f.scope.querySelector('button').click();
  f.requests[3].success({state:'connected',groupId:groupA,key:dpKeyA});
  assert.equal(f.self.callbacks.onSave(),true);
  select.value='';select.dispatchEvent(new f.document.defaultView.Event('change'));
  assert.equal(f.scope.querySelector('[name=key]').value,'');assert.equal(f.self.callbacks.onSave(),false);
});
