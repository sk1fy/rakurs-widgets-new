// Запросы к amoCRM в сессии менеджера — только через ограничитель (как в «Списке задач» и «Аватаре в imBox»):
// по одному, не чаще раза в секунду с вкладки (лимит amoCRM — 7 в секунду), на 429 — пауза 2 / 4 / 8 с и до трёх повторов,
// на 401 / 403 — виджет перестаёт ходить в amoCRM совсем, до перезагрузки страницы.
// У «Удобных полей» запросы к amoCRM делает только pulse.js — раз в день с браузера, несколько штук.
(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
})(this, function () {
    'use strict';

    function ApiError(status, url) {
        var e = new Error('amoCRM API ' + status + ': ' + url);
        e.status = status;
        return e;
    }

    return function createApi(fetcher, options) {
        options = options || {};
        var GAP = options.gapMs != null ? options.gapMs : 1000;
        var BACKOFF = options.backoffMs || [2000, 4000, 8000];
        var sleep = options.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
        var now = options.now || function () { return Date.now(); };

        var chain = Promise.resolve();
        var lastAt = -Infinity;
        var stopped = false;
        var count = 0;

        async function once(url) {
            var wait = lastAt + GAP - now();
            if (wait > 0) await sleep(wait);
            lastAt = now();
            count++;
            return fetcher(url, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
        }

        async function run(url) {
            for (var attempt = 0; ; attempt++) {
                if (stopped) throw ApiError(403, url);
                var response = await once(url);
                if (response.status === 429 && attempt < BACKOFF.length) {
                    await sleep(BACKOFF[attempt]);
                    continue;
                }
                if (response.status === 401 || response.status === 403) {
                    stopped = true;
                    throw ApiError(response.status, url);
                }
                if (response.status === 204) return null;
                if (!response.ok) throw ApiError(response.status, url);
                var text = await response.text();
                try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
            }
        }

        function get(url) {
            var p = chain.then(function () { return run(url); });
            chain = p.catch(function () {});
            return p;
        }

        return {
            stats: function () { return { requests: count, stopped: stopped }; },
            isStopped: function () { return stopped; },
            get: get
        };
    };
});
