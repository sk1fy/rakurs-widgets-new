(function (factory) {
    if (typeof define === 'function') { define([], function () { return factory; }); }
    else if (typeof module === 'object' && module.exports) { module.exports = factory; }
}(function (Snapshot, Rules) {
    'use strict';
    function origin(value) {
        var u = new URL(value);
        if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') { throw new Error('Настройте HTTPS origins при сборке пакета'); }
        return u.origin;
    }
    function enabled(value) { return value === true || value === 1 || value === '1' || value === 'Y' || value === 'true'; }
    function sameScope(a, b) {
        return ['companyId', 'accountId', 'bindingId', 'bindingRevision', 'installationId', 'integrationId', 'modeEpoch', 'product'].every(function (k) { return a && b && a[k] === b[k]; });
    }
    function Client(options) {
        this.request = options.request;
        this.settings = options.settings;
        this.accountId = String(options.accountId);
        this.core = origin(options.coreOrigin);
        this.backend = origin(options.backendOrigin);
        this.now = options.now || Date.now;
        this.uuid = options.uuid || function () { return crypto.randomUUID(); };
        this.session = null;
        this.good = null;
        this.pending = null;
    }
    Client.prototype.proof = async function (purpose) {
        var client = this.settings().oauth_client_uuid;
        if (!/^[0-9a-f-]{36}$/i.test(client || '')) { throw new Error('Нет OAuth UUID интеграции'); }
        var token = await this.request('/ajax/v2/integrations/' + encodeURIComponent(client) + '/disposable_token', { cache: false });
        if (!token || !token.token) { throw new Error('Не получен токен amoCRM'); }
        return this.request(this.core + '/api/v1/widget/task-control/auth', {
            method: 'POST', headers: { 'X-Auth-Token': token.token }, body: { purpose: purpose, requestId: this.uuid() }
        });
    };
    Client.prototype._session = async function () {
        if (this.session && Date.parse(this.session.expiresAt) > this.now() + 15000) { return this.session; }
        var proof = await this.proof('runtime');
        var s = await this.request(this.backend + '/api/v1/widget/task-control/sessions', { method: 'POST', body: { coreAssertion: proof.assertion } });
        if (!s || !s.scope || s.scope.accountId !== this.accountId || s.scope.product !== 'task-control' || typeof s.accessToken !== 'string' || s.accessToken.length !== 43 || !(Date.parse(s.expiresAt) > this.now())) { throw new Error('Неверная сессия TeamOS'); }
        this.session = s;
        return s;
    };
    Client.prototype._refresh = async function () {
        try {
            var s = await this._session();
            if (this.good && !sameScope(this.good.scope, s.scope)) { this.good = null; }
            var b;
            try {
                b = await this.request(this.backend + '/api/v1/widget/task-control/bootstrap', { headers: { Authorization: 'Bearer ' + s.accessToken } });
            } catch (error) {
                if (error.status !== 401 && error.status !== 403) { throw error; }
                this.session = null;
                // Do not keep revoked configuration while acquiring a fresh epoch/session.
                this.good = null;
                s = await this._session();
                b = await this.request(this.backend + '/api/v1/widget/task-control/bootstrap', { headers: { Authorization: 'Bearer ' + s.accessToken } });
            }
            if (!sameScope(s.scope, b.scope) || b.scope.accountId !== this.accountId || b.state !== 'active') { this.good = null; throw new Error('Область подключения изменилась'); }
            if (b.minRuntimeVersion && b.minRuntimeVersion !== '1.1.0') { this.good = null; throw new Error('Обновите пакет виджета'); }
            if (b.mode !== 'managed') { this.good = null; return null; }
            var p = b.publication;
            if (!p || !sameScope(p.scope, b.scope) || p.schemaVersion !== 1 || !Number.isSafeInteger(p.version) || !Array.isArray(p.runtimeRules) || p.checksum !== Snapshot.hashRules(p.runtimeRules) || p.runtimeRules.some(function (r) { return !Rules.validateRule(r).valid; })) { throw new Error('Некорректная публикация TeamOS'); }
            if (this.good && sameScope(this.good.scope, b.scope) && (p.version < this.good.version || (p.version === this.good.version && p.checksum !== this.good.config.published.hash))) { throw new Error('Устаревшая публикация TeamOS'); }
            this.good = { scope: b.scope, version: p.version, config: { schema_version: 1, rules: p.runtimeRules, published: { hash: p.checksum, revision: p.version } } };
            return this.good;
        } catch (error) {
            if (error.status === 401 || error.status === 403 || error.status === 404) { this.session = null; this.good = null; }
            throw error;
        }
    };
    Client.prototype.refresh = function () {
        var self = this;
        if (!this.pending) { this.pending = this._refresh().finally(function () { self.pending = null; }); }
        return this.pending;
    };
    return { Client: Client, enabled: enabled, sameScope: sameScope, origin: origin };
}));
