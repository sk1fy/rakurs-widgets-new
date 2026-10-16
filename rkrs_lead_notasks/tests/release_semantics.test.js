'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Constants = require('../lib/constants');

function amd(name, dependencies) {
    let factory;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/' + name + '.js'), 'utf8'), {
        define: (_names, callback) => { factory = callback(); },
        unescape, encodeURIComponent
    });
    return factory(...dependencies);
}
const Rules = amd('rules', [Constants]);
const Snapshot = amd('snapshot', [Constants, Rules]);
const uid = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const rule = overrides => Object.assign({uid:uid(1), name:'Правило', users:[7], pipelines:[{pipeline_id:12,status_ids:[22]}],
    customer_statuses:[], customers:false, show_modal:false, deny_exit:true, check_responsible:false, enabled:true, archived:false}, overrides);
const context = overrides => Object.assign({entityType:'leads', entityId:1, pipelineId:12, statusId:22, currentUserId:7, responsibleUserId:7}, overrides);
function engine(mode, rules, actor = 7) {
    // Both sources install the same legacy engine. Standalone must preserve the
    // explicitly saved fields; managed projection must not widen them either.
    const config = mode === 'standalone' ? Snapshot.compile({catalog_id:77,fields:{}}, rules) : {schema_version:1,rules};
    const parsed = Snapshot.parseRuntimeConfig(config);
    assert.equal(parsed.fatal, false);
    return new Rules.RuleEngine(parsed.rules, actor);
}

for (const mode of ['standalone', 'managed']) {
    test('actual AMD ' + mode + ': action flags, ownership and lifecycle fields remain independent', () => {
        for (const show of [false, true]) for (const deny of [false, true]) for (const check of [false, true]) {
            const runtime = engine(mode, [rule({show_modal:show,deny_exit:deny,check_responsible:check})]);
            for (const owner of [7, 8]) {
                const effective = runtime.match(context({responsibleUserId:owner}));
                const selected = !check || owner === 7;
                assert.equal(effective.showModal, selected && show);
                assert.equal(effective.denyExit, selected && deny);
                assert.equal(effective.matches.length, selected ? 1 : 0);
            }
        }
        for (const override of [{enabled:false}, {archived:true}, {users:[8]}]) {
            assert.equal(engine(mode,[rule(override)]).match(context()).matches.length, 0);
        }
        const runtime = engine(mode,[rule()]);
        for (const actor of [0, null, 8, 'not-an-id']) {
            assert.equal(runtime.match(context({currentUserId:actor})).matches.length, 0, 'old actor rules leaked to ' + actor);
        }
        assert.equal(runtime.match(context({currentUserId:undefined})).denyExit, true);
    });

    test('actual AMD ' + mode + ': explicit statuses including won/lost remain explicit', () => {
        const runtime = engine(mode,[rule({pipelines:[{pipeline_id:12,status_ids:[22,142,143]}]})]);
        for (const statusId of [22,142,143]) assert.equal(runtime.match(context({statusId})).denyExit,true);
        assert.equal(runtime.match(context({statusId:23})).denyExit,false,'a future stage was silently included');
        assert.equal(runtime.match(context({pipelineId:13,statusId:22})).denyExit,false,'a future pipeline was silently included');
        assert.equal(runtime.match(context({entityType:'customers',statusId:22})).denyExit,false,'a lead pipeline was treated as customers');
    });

    test('actual AMD ' + mode + ': customer status selection and overlapping OR rules retain semantics', () => {
        const runtime = engine(mode,[
            rule({uid:uid(1),pipelines:[],customers:true,customer_statuses:[55],deny_exit:false,show_modal:true}),
            rule({uid:uid(2),pipelines:[],customers:true,customer_statuses:[55],deny_exit:true,show_modal:false,check_responsible:true})
        ]);
        const mine = runtime.match(context({entityType:'customers',statusId:55}));
        assert.equal(mine.matches.length,2); assert.equal(mine.showModal,true); assert.equal(mine.denyExit,true);
        const foreign = runtime.match(context({entityType:'customers',statusId:55,responsibleUserId:8}));
        assert.equal(foreign.matches.length,1); assert.equal(foreign.showModal,true); assert.equal(foreign.denyExit,false);
        assert.equal(runtime.match(context({entityType:'customers',statusId:56})).matches.length,0);
        const all = engine(mode,[rule({pipelines:[],customers:true,customer_statuses:[]})]);
        assert.equal(all.match(context({entityType:'customers',statusId:56})).denyExit,true,'legacy empty customer statuses no longer mean all');
        assert.equal(engine(mode,[]).match(context()).matches.length,0,'empty materialization fell back to standalone rules');
    });
}
