'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('entrypoint stages full standalone config only in open native settings and checks mode/toggle on Save',async()=>{
 let registration,modeChecks=0;
 const context={define:(dependencies,factory)=>registration={dependencies,factory},APP:{constant:()=>({id:123})},AMOCRM:{},window:{},document:{getElementById:()=>null},console,Promise,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../script.js'),'utf8'),context);
 const input={length:1,value:'old',first(){return this;},val(v){if(arguments.length){this.value=v;return this;}return this.value;},trigger(){return this;}};
 const toggle={...input,value:'1'},settings={runtime_config:'original',teamos_enabled:'1'};
 const body={find:selector=>selector.includes('teamos_enabled')?toggle:input};
 const jquery=()=>({appendTo(){return this;}});jquery.ajax=()=>{};
 class Controller{constructor(){this.running=false;}enabled(){return true;}render(){}getClient(){return{verifyStandalone:async()=>{modeChecks++;}};}startAdminBridge(){return{active:true};}}
 class Migration{async prepareStandalone(){return {config:{storage:{catalog_id:88},published:{hash:'checksum'},rules:[]},scope:{accountId:'123'},backupKey:'backup',expectedSettings:JSON.stringify(settings)};}}
 const Constructor=registration.factory(jquery,function(){},require('../lib/constants'),require('../lib/request_queue'),()=>require('../lib/amo_api'),()=>require('../lib/rules'),()=>require('../lib/snapshot'),()=>require('../lib/catalog_repository'),()=>require('../lib/runtime'),()=>require('../lib/settings_controller'),()=>require('../lib/task_assignment'),require('../lib/teamos'),{},()=>Controller,()=>({Migration}));
 const widget={params:{path:'/widget',widget_code:'widget'},get_settings:()=>settings,system:()=>({area:'settings'})};Constructor.call(widget);
 await assert.rejects(widget.taskControlMigration.prepareStandalone({},{}),/Откройте настройки/);
 widget.callbacks.settings(body);const staged=await widget.taskControlMigration.prepareStandalone({},{});assert.equal(staged.requiresNativeSave,true);assert.equal(JSON.parse(input.value).storage.catalog_id,88);assert.equal(settings.runtime_config,'original');
 assert.equal(widget.callbacks.onSave(),false);toggle.value='0';assert.equal(await widget.callbacks.onSave(),true);assert.equal(modeChecks,1);
 settings.runtime_config='other-tab';assert.equal(widget.callbacks.onSave(),false);assert.equal(modeChecks,1);
});
