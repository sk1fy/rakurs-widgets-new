const test = require('node:test');
const assert = require('node:assert/strict');
const Controller = require('../lib/teamos_controller')({enabled:()=>true});
const flush = async()=>{for(let i=0;i<15;i++) await Promise.resolve();};
test('controller expires applied config independently of polling; resume refreshes; destroy removes listeners',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});
    const previousDocument=global.document, previousWindow=global.window;
    global.document=new EventTarget();global.document.hidden=false;global.window=new EventTarget();
    try {
        let now=0, calls=0, cleared=0; const applied=[];
        const client={leaseUntil:1000,clock:()=>now,get good(){return now<1000 ? {config:{}} : null;},
            refresh:async()=>{calls++;},pollDelay:()=>60000,clear:()=>cleared++};
        const controller=new Controller({get_settings:()=>({})},{},{},good=>applied.push(good));
        controller.client=client;controller.start();await flush();assert.equal(calls,1);assert.ok(applied.at(-1));
        now=1001;t.mock.timers.tick(1001);assert.equal(applied.at(-1),null);
        global.document.hidden=true;global.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(calls,1);
        global.document.hidden=false;global.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(calls,2);
        global.window.dispatchEvent(new Event('online'));await flush();assert.equal(calls,3);
        controller.destroy();assert.equal(cleared,1);global.window.dispatchEvent(new Event('online'));await flush();assert.equal(calls,3);
    } finally {global.document=previousDocument;global.window=previousWindow;}
});
