'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Constants = require('../lib/constants'), Rules = require('../lib/rules'), Snapshot = require('../lib/snapshot');
const Migration = require('../lib/migration')(Constants, Rules, Snapshot);
const Catalog = require('../lib/catalog_repository');
const rawFixture = require('./fixtures/r04-catalog-source.json');
function setup() {
    const raw = structuredClone(rawFixture), requests = [], store = new Map();
    const settings = {runtime_config: raw.runtimeConfig, teamos_enabled:'1'};
    const repository = new Catalog.CatalogRepository({
        get:async()=>raw.catalog,
        getAllPages:async(path,key,opts)=>{requests.push({path,key,opts});return raw[key === 'custom_fields' ? 'fields' : key];}
    });
    const storage = {getItem:k=>store.get(k) ?? null,setItem:(k,v)=>store.set(k,v)};
    let uuid=0;
    const migration = new Migration.Migration({repository,storage,verifyStandalone:async()=>true,settings:()=>settings,accountId:123,uuid:()=>String(++uuid)});
    return {raw,settings,requests,store,repository,migration};
}
test('capture retains full raw source and archived/disabled/closed stage rules with strict full pagination',async()=>{
    const h=setup(), result=await h.migration.capture({kind:'catalog',catalogId:'77'});
    assert.equal(result.complete,true);assert.equal(result.payload.rules[0].enabled,false);assert.equal(result.payload.rules[0].archived,true);
    assert.deepEqual(result.payload.rules[0].pipelines[0].statusIds,['20','142','143']);
    assert.deepEqual(result.payload.raw,h.raw);assert.equal(result.payload.raw.elements[0].original_extra,'preserved');
    assert.equal(result.sourceChecksum,Snapshot.hashRules(JSON.parse(h.raw.runtimeConfig).rules));
    assert.ok(h.requests.every(r=>r.opts.requireComplete));assert.equal(h.store.size,1);
    const backup=JSON.parse([...h.store.values()][0]);assert.equal(backup.settings.runtime_config,h.settings.runtime_config);assert.equal(backup.accountId,'123');
});
test('divergent runtime config is reported and runtime source remains independently selectable',async()=>{
    const h=setup(), config=JSON.parse(h.settings.runtime_config);config.rules[0].name='Published';config.published.hash=Snapshot.hashRules(config.rules);h.settings.runtime_config=JSON.stringify(config);
    const catalog=await h.migration.capture({kind:'catalog',catalogId:'77'}), runtime=await h.migration.capture({kind:'runtime_config',catalogId:'77'});
    assert.equal(catalog.payload.discrepancies[0].code,'catalog_runtime_divergence');assert.notEqual(catalog.sourceChecksum,runtime.sourceChecksum);assert.equal(runtime.payload.rules[0].name,'Published');
});
test('valid published runtime remains selectable when catalog rules are malformed',async()=>{
    const h=setup();h.raw.elements[0].custom_fields_values[0].values[0].value='';
    const result=await h.migration.capture({kind:'runtime_config',catalogId:'77'});
    assert.equal(result.payload.discrepancies[0].code,'catalog_invalid');assert.equal(result.payload.rules.length,1);
    await assert.rejects(h.migration.capture({kind:'catalog',catalogId:'77'}));
});
test('capture refuses partial pagination, duplicate UID/elements, malformed fields and lossy numeric coercion',async()=>{
    const mutations=[
        h=>h.repository.api.getAllPages=async()=>{throw Object.assign(new Error('partial'),{code:'INCOMPLETE_PAGINATION'});},
        h=>h.raw.elements.push({...structuredClone(h.raw.elements[0]),id:901}),
        h=>h.raw.elements.push(structuredClone(h.raw.elements[0])),
        h=>h.raw.fields.push(structuredClone(h.raw.fields[0])),
        h=>h.raw.fields[0].code='WRONG',
        h=>h.raw.elements[0].custom_fields_values.shift(),
        h=>h.raw.elements[0].custom_fields_values.find(v=>v.field_id===101).values[0].value='[2,"bad"]',
        h=>h.raw.elements[0].custom_fields_values.find(v=>v.field_id===101).values[0].value='[9007199254740992]',
        h=>h.raw.elements[0].custom_fields_values[0].values[0].value='',
    ];
    for(const mutate of mutations){const h=setup();mutate(h);await assert.rejects(h.migration.capture({kind:'catalog',catalogId:'77'}));assert.equal(h.store.size,0);}
});
test('backup storage failure blocks migration; existing backups are never overwritten',async()=>{
    const h=setup();h.migration.storage.setItem=()=>{throw new Error('quota');};await assert.rejects(h.migration.capture({kind:'catalog',catalogId:'77'}),{code:'migration_backup_unavailable'});
    const ok=setup();await ok.migration.capture({kind:'catalog',catalogId:'77'});await ok.migration.capture({kind:'catalog',catalogId:'77'});assert.equal(ok.store.size,2);
});
function exported(h){const rules=JSON.parse(h.settings.runtime_config).rules,scope={accountId:'123',modeEpoch:1};return {state:'completed',targetMode:'standalone',scope:{...scope,modeEpoch:2},expiresAt:new Date(Date.now()+300000).toISOString(),export:{scope,targetMode:'standalone',complete:true,projection:'full',runtimeRules:rules,exportChecksum:Snapshot.hashRules(rules),expiresAt:new Date(Date.now()+300000).toISOString(),dynamicLoss:true}};}
test('return refuses actor projection, stale/foreign/tampered export and implicit dynamic/empty loss',async()=>{
    const mutations=[x=>delete x.complete,x=>x.projection='actor',x=>x.expiresAt='2000-01-01',x=>x.scope.accountId='456',x=>x.exportChecksum='bad'];
    for(const mutate of mutations){const h=setup(),x=exported(h);mutate(x.export);await assert.rejects(h.migration.prepareStandalone(x,{confirm:true,acceptDynamicLoss:true}));}
    const h=setup();await assert.rejects(h.migration.prepareStandalone(exported(h),{confirm:true}),{code:'migration_dynamic_loss_confirmation_required'});
    await assert.rejects(h.migration.prepareStandalone(exported(h),{}),{code:'migration_confirmation_required'});
});
test('return backs up original, writes separate catalog, preserves UIDs and refuses concurrent changes',async()=>{
    const h=setup(),x=exported(h), rules=x.export.runtimeRules;let restored=false;
    h.repository.restoreStorage=async supplied=>{restored=true;assert.equal(supplied[0].uid,rules[0].uid);return {storage:{...JSON.parse(h.settings.runtime_config).storage,catalog_id:88}};};
    h.repository.getRules=async storage=>{assert.equal(storage.catalog_id,88);return rules;};
    const result=await h.migration.prepareStandalone(x,{confirm:true,acceptDynamicLoss:true});assert.equal(restored,true);assert.equal(result.config.storage.catalog_id,88);assert.equal(result.config.rules[0].uid,rules[0].uid);assert.equal(result.dynamicRulesFrozen,true);assert.equal(h.settings.runtime_config,h.raw.runtimeConfig);
    h.repository.restoreStorage=async()=>{h.settings.teamos_enabled='0';return {storage:{catalog_id:88}};};
    await assert.rejects(h.migration.prepareStandalone(x,{confirm:true,acceptDynamicLoss:true}),{code:'migration_source_changed'});
});
test('actual capture reproduces backend-consumed source wire fixture',async()=>{
    const h=setup();h.migration.now=()=>Date.parse('2026-10-16T12:00:00Z');
    assert.deepEqual(await h.migration.capture({kind:'catalog',catalogId:'77'}),require('./fixtures/r04-source-result.json'));
});
test('return refuses mode intent without confirmed receipt and fails safely when server mode changes',async()=>{
    const h=setup(), receipt=exported(h);
    await assert.rejects(h.migration.prepareStandalone(receipt.export,{confirm:true}),{code:'migration_mode_receipt_required'});
    receipt.scope.modeEpoch=4;await assert.rejects(h.migration.prepareStandalone(receipt,{confirm:true}),{code:'migration_mode_receipt_required'});
    let writes=0;h.repository.restoreStorage=async()=>{writes++;};h.migration.verifyStandalone=async()=>{throw new Error('Mode changed');};
    await assert.rejects(h.migration.prepareStandalone(exported(h),{confirm:true,acceptDynamicLoss:true}));assert.equal(writes,0);assert.equal(h.settings.runtime_config,h.raw.runtimeConfig);
});
test('published runtime imports after deleted catalog but wrong-account/auth failures stay blocked',async()=>{
    const h=setup();h.repository.verifyCatalog=async()=>{throw Object.assign(new Error('deleted'),{status:404});};
    const result=await h.migration.capture({kind:'runtime_config',catalogId:'77'});assert.equal(result.complete,true);assert.equal(result.payload.rules.length,1);assert.equal(result.payload.raw.catalogReadError.status,404);assert.equal(result.payload.discrepancies[0].code,'catalog_invalid');
    await assert.rejects(h.migration.capture({kind:'catalog',catalogId:'77'}));
    h.repository.verifyCatalog=async()=>{throw Object.assign(new Error('forbidden'),{status:403});};await assert.rejects(h.migration.capture({kind:'runtime_config',catalogId:'77'}));
});
test('noncanonical uppercase UID produces explicit diagnostic before backend checksum disagreement',async()=>{
 const h=setup();h.raw.elements[0].custom_fields_values[0].values[0].value=h.raw.elements[0].custom_fields_values[0].values[0].value.toUpperCase();await assert.rejects(h.migration.capture({kind:'catalog',catalogId:'77'}),{code:'source_noncanonical_uid'});
});
