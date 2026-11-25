define(['../activation.js', '../platform.js'], function (activation, platform) {
    'use strict';
    return function createAccess(widget, publish) {
        let running = false;
        let generation = 0;
        let pending = false;
        let timer;
        async function check() {
            if (!running || pending) return;
            pending = true;
            clearTimeout(timer);
            const current = generation;
            let result;
            try {
                result = await activation.activated(widget)
                    ? await platform.access(widget)
                    : { status: 'unactivated', paidTo: '' };
            } catch (_) {
                result = { status: 'error', paidTo: '' };
            }
            if (!running || current !== generation) return;
            pending = false;
            const delay = result.status === 'active' && result.paidTo
                ? Math.min(60000, Math.max(1000, Date.parse(result.paidTo) - Date.now())) : 60000;
            timer = setTimeout(check, delay);
            publish(result);
        }
        return {
            start() { if (!running) { running = true; check(); } },
            refresh: check,
            stop() { running = false; generation++; pending = false; clearTimeout(timer); }
        };
    };
});
