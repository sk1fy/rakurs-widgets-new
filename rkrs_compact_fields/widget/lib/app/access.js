// Проверка подключения виджета к Core через одноразовый токен amoCRM.
(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
})(this, function () {
    'use strict';

    var CORE = 'https://core.rkrs.ru';
    var ACTIVE_MS = 24 * 60 * 60 * 1000;
    var CHECK_MS = 30 * 60 * 1000;
    var OFFLINE_MS = 60 * 1000;
    var TIMEOUT_MS = 10000;
    var REINSTALL_URL = CORE + '/oauth/amocrm/start?integration_code=rkrs_compact_fields';
    var CLIENT_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

    async function coreRequest(fetcher, clientId, path, method, input) {
        if (!CLIENT_ID.test(clientId || '')) return null;
        var tokenResponse = await fetcher('/ajax/v2/integrations/' + clientId + '/disposable_token', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }
        }, TIMEOUT_MS);
        if (!tokenResponse.ok) return null;
        var token = (await tokenResponse.json()).token;
        if (typeof token !== 'string' || !token) return null;

        var options = {
            method: method,
            credentials: 'omit',
            cache: 'no-store',
            headers: { 'X-Auth-Token': token, Accept: 'application/json' }
        };
        if (input) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(input);
        }
        return fetcher(CORE + path, options, TIMEOUT_MS);
    }

    async function checkConnection(fetcher, clientId) {
        var response = await coreRequest(fetcher, clientId, '/api/v1/widget/connection', 'GET');
        if (!response) return 'offline';
        if (response.status === 204) return 'active';
        if (response.status === 401 || response.status === 403) return 'error';
        return 'offline';
    }

    async function activation(fetcher, clientId, contact) {
        var input = contact && { name: contact.name, phone: contact.phone, consent_version: 'contact-v1' };
        var response = await coreRequest(fetcher, clientId, '/api/v1/widget/activation', input ? 'POST' : 'GET', input);
        if (!response || !response.ok) throw new Error('Не удалось получить статус активации');
        var result = await response.json();
        if (typeof result.activated !== 'boolean') throw new Error('Некорректный ответ Core');
        return result.activated;
    }

    function createAccess(options) {
        var fetcher = options.fetcher;
        var later = options.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
        var cancel = options.clearTimeout || function (id) { clearTimeout(id); };
        var onChange = options.onChange || function () {};
        var now = options.now || function () { return Date.now(); };
        var cache = options.cache || { get: function () { return null; }, set: function () {} };
        var running = false, pending = false, timer = null, generation = 0;

        // Прошлый ответ сервера из браузера: «active» живёт сутки, «error» — до следующей проверки
        // (виджет сразу стартует выключенным, без мигания полей).
        var saved = readCache();
        var status = saved ? saved.status : 'checking';

        function readCache() {
            try {
                var c = JSON.parse(cache.get() || 'null');
                if (!c || (c.status !== 'active' && c.status !== 'error')) return null;
                if (c.status === 'active' && !(now() - c.at < ACTIVE_MS)) return null;
                return c;
            } catch (e) { return null; }
        }

        function publish(next) {
            if (next === 'active' || next === 'error') {
                try { cache.set(JSON.stringify({ status: next, at: now() })); } catch (e) {}
            }
            if (next === status) return;
            status = next;
            onChange(status);
        }

        function delay() {
            if (status === 'offline') return OFFLINE_MS;
            return status === 'active' ? ACTIVE_MS : CHECK_MS;
        }

        function schedule(ms) {
            if (timer) cancel(timer);
            timer = later(check, ms == null ? delay() : ms);
        }

        function check() {
            if (!running || pending) return;
            pending = true;
            var current = generation;
            checkConnection(fetcher, options.clientId)
                .catch(function () { return 'offline'; })
                .then(function (next) {
                    if (!running || current !== generation) return;
                    // Уже было подтверждено — разовый сбой связи не сбрасывает «active».
                    if (next === 'offline' && status === 'active') next = 'active';
                    publish(next);
                })
                .then(function () {
                    if (current !== generation) return;
                    pending = false;
                    if (running) schedule();
                });
        }

        return {
            getStatus: function () { return status; },
            // Доступ подтверждён меньше суток назад — к серверу не идём до конца этих суток.
            start: function () {
                if (running) return;
                running = true;
                var c = readCache();
                if (c && c.status === 'active') schedule(Math.max(0, ACTIVE_MS - (now() - c.at)));
                else check();
            },
            refresh: function () { running = true; check(); },
            stop: function () {
                running = false;
                generation += 1;
                pending = false;
                if (timer) cancel(timer);
                timer = null;
            }
        };
    }

    return { activation: activation, checkConnection: checkConnection, createAccess: createAccess, REINSTALL_URL: REINSTALL_URL, ACTIVE_MS: ACTIVE_MS, CHECK_MS: CHECK_MS, OFFLINE_MS: OFFLINE_MS };
});
