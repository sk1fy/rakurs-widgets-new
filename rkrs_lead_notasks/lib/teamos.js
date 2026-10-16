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
        return ['companyId', 'accountId', 'bindingId', 'bindingRevision', 'installationId', 'integrationId', 'modeEpoch', 'product', 'generation'].every(function (k) { return a && b && a[k] === b[k]; });
    }
    var RUNTIME_VERSION = '1.2.3';
    var MAX_PAYLOAD = 1048576;
    var LEASE_MS = 300000;
    function version(value) {
        if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value || '')) { return null; }
        var parts = value.split('.').map(Number);
        return parts.every(Number.isSafeInteger) ? parts : null;
    }
    function supports(minimum) {
        var a = version(RUNTIME_VERSION), b = version(minimum);
        if (!b) { return false; }
        for (var i = 0; i < 3; i++) { if (a[i] !== b[i]) { return a[i] > b[i]; } }
        return true;
    }
    function validScope(s) {
        return s && s.accountId && s.companyId && s.bindingId && s.installationId && s.integrationId &&
            s.product === 'task-control' && Number.isSafeInteger(s.bindingRevision) && s.bindingRevision > 0 &&
            Number.isSafeInteger(s.modeEpoch) && s.modeEpoch > 0 &&
            (s.generation === undefined || Number.isSafeInteger(s.generation) && s.generation > 0);
    }
    function validUUID(value) {
        return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) && value !== '00000000-0000-0000-0000-000000000000';
    }
    function validRuntimeRule(rule) {
        function ids(values) { return Array.isArray(values) && values.every(function (id) { return Number.isSafeInteger(id) && id > 0; }); }
        return rule && ids(rule.users) && ids(rule.customer_statuses || []) && Array.isArray(rule.pipelines) &&
            rule.pipelines.every(function (p) { return p && Number.isSafeInteger(p.pipeline_id) && p.pipeline_id > 0 && ids(p.status_ids); }) && Rules.validateRule(rule).valid;
    }
    function invalid(message, clear) { var e = new Error(message); e.clear = !!clear; return e; }
    function transient(error) { return !error.clear && [0, 408, 429, 502, 503, 504].indexOf(Number(error.status)) >= 0; }
    function delay(attempt, random) { return Math.round(Math.min(300000, 1000 * Math.pow(2, attempt)) * (0.5 + random() * 0.5)); }
    function Client(options) {
        this.request = options.request;
        this.settings = options.settings;
        this.accountId = String(options.accountId);
        this.core = origin(options.coreOrigin);
        this.backend = origin(options.backendOrigin);
        this.now = options.now || Date.now;
        this.uuid = options.uuid || function () { return crypto.randomUUID(); };
        this.clock = options.clock || (options.now ? options.now : function () { return performance.now(); });
        this.random = options.random || Math.random;
        this.sleep = options.sleep || function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
        this.runtimeInstanceId = this.uuid();
        this.protocol = null;
        this.session = null;
        this.sessionPending = null;
        this._good = null;
        this.accepted = null;
        this.leaseUntil = 0;
        this.generation = 0;
        this.failures = 0;
        this.pending = null;
        this.telemetryAt = {}; this.appliedKey = null; this.telemetryPending = {}; this.telemetryQueue = Promise.resolve(); this.telemetryQueued = {};
    }
    Object.defineProperty(Client.prototype, 'good', {
        get: function () {
            if (this._good && this.clock() >= this.leaseUntil) { this._good = null; }
            return this._good;
        },
        set: function (value) { this._good = value; }
    });
    Client.prototype.clear = function () { this.generation++; this.session = null; this.good = null; this.accepted = null; this.appliedKey = null; this.telemetryAt = {}; };
    Client.prototype.proof = async function (purpose, requestId) {
        var client = this.settings().oauth_client_uuid;
        if (!/^[0-9a-f-]{36}$/i.test(client || '')) { throw new Error('Нет OAuth UUID интеграции'); }
        var token = await this.request('/ajax/v2/integrations/' + encodeURIComponent(client) + '/disposable_token', { cache: false });
        if (!token || !token.token) { throw new Error('Не получен токен amoCRM'); }
        return this.request(this.core + '/api/v1/widget/task-control/auth', {
            method: 'POST', headers: { 'X-Auth-Token': token.token }, body: { purpose: purpose, requestId: requestId || this.uuid() }
        });
    };
    Client.prototype.verifyStandalone = async function (scope) {
        this.clear();
        var session = await this._session();
        var path = '/api/v1/widget/task-control/connection';
        var bootstrap = await this.request(this.backend + path, { headers: { Authorization: 'Bearer ' + session.accessToken } });
        if (!validScope(scope) || !sameScope(session.scope, scope) || !bootstrap || !sameScope(bootstrap.scope, scope) || bootstrap.mode !== 'standalone' || bootstrap.state && bootstrap.state !== 'active') { throw invalid('Режим подключения изменился', true); }
        return true;
    };
    Client.prototype.pendingSources = async function () {
        var proof = await this.proof('adminBridge');
        return this.request(this.backend + '/api/v1/widget/task-control/source-requests', { headers: { Authorization: 'Bearer ' + proof.assertion } });
    };
    Client.prototype.submitSource = async function (requestId, result) {
        if (!validUUID(requestId)) { throw invalid('Некорректный запрос источника'); }
        var proof = await this.proof('adminBridge', requestId);
        var body = Object.assign({}, result, { coreAssertion: proof.assertion });
        if (unescape(encodeURIComponent(JSON.stringify(body))).length > MAX_PAYLOAD) { throw invalid('Источник превышает 1 MiB'); }
        return this.request(this.backend + '/api/v1/widget/task-control/source-requests/' + requestId + '/result', { method: 'PUT', headers: { Authorization: 'Bearer ' + proof.assertion }, body: body });
    };
    Client.prototype._exchange = async function () {
        var generation = this.generation;
        if (this.session && Date.parse(this.session.expiresAt) > this.now() + 15000) { return this.session; }
        var proof = await this.proof('runtime');
        var s = await this.request(this.backend + '/api/v1/widget/task-control/sessions', { method: 'POST', body: { coreAssertion: proof.assertion, runtimeVersion: RUNTIME_VERSION, capabilities: ['dynamicRulesV2'] } });
        if (!s || !s.scope || s.scope.accountId !== this.accountId || s.scope.product !== 'task-control' || typeof s.accessToken !== 'string' || s.accessToken.length !== 43 || !(Date.parse(s.expiresAt) > this.now())) { throw invalid('Неверная сессия TeamOS', true); }
        if (!/^[1-9][0-9]{0,15}$/.test(s.actorId || '') || !Number.isSafeInteger(Number(s.actorId)) || s.runtimeSchemaVersion !== undefined && s.runtimeSchemaVersion !== 1 && s.runtimeSchemaVersion !== 2) { throw invalid('Неверная версия или пользователь сессии', true); }
        if (!validScope(s.scope)) { throw invalid('Неверная область сессии', true); }
        if (generation !== this.generation) { throw invalid('Сессия остановлена', true); }
        if (this.protocol && sameScope(this.protocol.scope, s.scope) && this.protocol.schema === 2 && s.runtimeSchemaVersion !== 2) { throw invalid('Динамические правила требуют протокол v2', true); }
        this.protocol = { scope: s.scope, schema: s.runtimeSchemaVersion || 1 };
        this.session = s;
        return s;
    };
    Client.prototype._session = function () {
        var self = this;
        if (!this.sessionPending) {
            this.sessionPending = this._exchange().finally(function () { self.sessionPending = null; });
        }
        return this.sessionPending;
    };
    Client.prototype._refresh = async function () {
        var generation = this.generation;
        this.refreshCorrelationId = this.uuid();
        var s = await this._session();
        if (this.accepted && (!sameScope(this.accepted.scope, s.scope) || this.accepted.actorId !== s.actorId)) { this.good = null; this.accepted = null; }
        var b;
        var path = s.runtimeSchemaVersion === 2 ? '/api/v2/task-control/runtime/bootstrap' : '/api/v1/widget/task-control/bootstrap';
        try {
            b = await this.request(this.backend + path, { headers: { Authorization: 'Bearer ' + s.accessToken } });
        } catch (error) {
            // Only an expired/unknown session permits one fresh authentication exchange.
            if (error.status !== 401) { throw error; }
            this.session = null;
            s = await this._session();
            if (this.accepted && (!sameScope(this.accepted.scope, s.scope) || this.accepted.actorId !== s.actorId)) { this.good = null; this.accepted = null; }
            path = s.runtimeSchemaVersion === 2 ? '/api/v2/task-control/runtime/bootstrap' : '/api/v1/widget/task-control/bootstrap';
            b = await this.request(this.backend + path, { headers: { Authorization: 'Bearer ' + s.accessToken } });
        }
        if (generation !== this.generation) { throw invalid('Сессия остановлена', true); }
        if (!b || unescape(encodeURIComponent(JSON.stringify(b))).length > MAX_PAYLOAD) { throw invalid('Превышен размер публикации'); }
        if (!sameScope(s.scope, b.scope) || b.scope.accountId !== this.accountId || b.state && b.state !== 'active') { throw invalid('Область подключения изменилась', true); }
        if (!supports(b.minRuntimeVersion)) { throw invalid('Обновите пакет виджета', true); }
        if (b.mode && b.mode !== 'managed') { this.good = null; this.accepted = null; return null; }
        // Legacy v1 servers have no lease metadata. Bound their memory cache locally too.
        if (b.runtimeSchemaVersion === undefined && b.issuedAt === undefined && b.validUntil === undefined) {
            var received = this.now();
            b = Object.assign({}, b, { runtimeSchemaVersion: 1, issuedAt: new Date(received).toISOString(), validUntil: new Date(received + LEASE_MS).toISOString() });
        }
        var issued = Date.parse(b.issuedAt), until = Date.parse(b.validUntil);
        if (!Number.isFinite(issued) || !Number.isFinite(until) || issued > this.now() + 60000 || until <= issued || until - issued > LEASE_MS || until <= this.now()) { throw invalid('Срок публикации истёк'); }
        if (b.actorId !== undefined && b.actorId !== s.actorId) { throw invalid('Пользователь сессии изменился', true); }
        var p = b.runtimeSchemaVersion === 2 ? b : b.publication;
        var dynamic = b.runtimeSchemaVersion === 2;
        if (b.runtimeSchemaVersion !== (s.runtimeSchemaVersion || 1)) { throw invalid('Протокол не соответствует сессии'); }
        if (b.runtimeSchemaVersion !== 1 && !dynamic) { throw invalid('Неизвестная версия протокола'); }
        if (dynamic && (s.runtimeSchemaVersion !== 2 || b.actorId !== s.actorId || !validUUID(b.snapshotId) || !validUUID(b.publicationId) ||
            !Number.isSafeInteger(b.publicationVersion) || b.publicationVersion < 1 || !b.sourceRevisions || b.resolverVersion !== 1 ||
            !Number.isSafeInteger(b.scope.generation) || b.scope.generation < 1 || typeof b.sourceRevisions.crm !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(b.sourceRevisions.crm) ||
            !Number.isSafeInteger(b.sourceRevisions.organization) || b.sourceRevisions.organization < 1 || !Number.isSafeInteger(b.sourceRevisions.mapping) || b.sourceRevisions.mapping < 1 ||
            !/^[a-f0-9]{64}$/.test(b.intentChecksum) || !/^[a-f0-9]{64}$/.test(b.resolvedChecksum))) { throw invalid('Некорректный динамический снимок'); }
        var revision = p && (dynamic ? p.runtimeRevision : p.version);
        var checksum = p && (dynamic ? p.payloadChecksum : p.checksum);
        if (!p || !sameScope(p.scope, b.scope) || !dynamic && p.schemaVersion !== 1 ||
            !Number.isSafeInteger(revision) || revision < 1 || !Array.isArray(p.runtimeRules) || p.runtimeRules.length > 1000 ||
            checksum !== Snapshot.hashRules(p.runtimeRules) || p.runtimeRules.some(function (r) { return !validRuntimeRule(r); })) { throw invalid('Некорректная публикация TeamOS'); }
        var accepted = this.accepted;
        if (accepted && sameScope(accepted.scope, b.scope) && (accepted.schema !== b.runtimeSchemaVersion || revision < accepted.version ||
            revision === accepted.version && checksum !== accepted.checksum)) { throw invalid('Устаревшая публикация TeamOS'); }
        this.accepted = { scope: b.scope, actorId: s.actorId, schema: b.runtimeSchemaVersion, version: revision, checksum: checksum };
        this.leaseUntil = this.clock() + Math.min(LEASE_MS, until - issued, until - this.now());
        this.good = { scope: b.scope, actorId: s.actorId, schema: b.runtimeSchemaVersion, version: revision, config: { schema_version: 1, rules: p.runtimeRules, published: { hash: checksum, revision: revision } },
            acknowledgement: { scope: b.scope, runtimeInstanceId: this.runtimeInstanceId, actorId: s.actorId,
                publicationId: dynamic ? b.publicationId : b.publicationId || p.id,
                publicationVersion: dynamic ? b.publicationVersion : p.version, runtimeRevision: revision,
                payloadChecksum: checksum, runtimeVersion: RUNTIME_VERSION }, correlationId: this.uuid() };
        if (dynamic) { this.good.acknowledgement.snapshotId = b.snapshotId; }
        this.telemetry('received', this.good).catch(function () {});
        return this.good;
    };
    Client.prototype.telemetryKey = function (good) {
        return JSON.stringify([good.scope, good.actorId, good.schema, good.version, good.config.published.hash]);
    };
    // Only explicit bounded fields leave this tab. Messages, rules, URLs and tokens are never diagnostic data.
    Client.prototype.telemetry = function (event, good, errorCode) {
        var self = this, generation = this.generation, session = this.session;
        var correlationId = good && good.correlationId || this.refreshCorrelationId || this.uuid();
        var slot = event + ':' + (good ? this.telemetryKey(good) : JSON.stringify(session && [session.scope, session.actorId]));
        if (this.telemetryQueued[slot]) { return this.telemetryQueued[slot]; }
        if (Object.keys(this.telemetryQueued).length >= 32) { return Promise.resolve(); }
        var queued = this.telemetryQueue.catch(function () {}).then(function () {
            if (generation !== self.generation || session !== self.session) { return; }
            return self._sendTelemetry(event, good, errorCode, correlationId);
        });
        this.telemetryQueue = queued; this.telemetryQueued[slot] = queued;
        function completed() { if (self.telemetryQueued[slot] === queued) { delete self.telemetryQueued[slot]; } }
        queued.then(completed, completed);
        return queued;
    };
    Client.prototype._sendTelemetry = async function (event, good, errorCode, correlationId) {
        var session = this.session, generation = this.generation;
        if (!session || !validScope(session.scope)) { return; }
        if (good && (good !== this.good || !sameScope(session.scope, good.scope) || session.actorId !== good.actorId ||
            !good.acknowledgement || !validUUID(good.acknowledgement.publicationId))) { return; }
        if (!good && event !== 'error') { return; }
        var key = good ? this.telemetryKey(good) : JSON.stringify([session.scope, session.actorId]), slot = event + ':' + key, now = this.clock();
        if (event === 'heartbeat' && this.appliedKey !== key || this.telemetryPending[slot] ||
            this.telemetryAt[slot] !== undefined && now - this.telemetryAt[slot] < 60000) { return; }
        var codes = ['config_invalid', 'config_fetch_failed', 'lease_expired', 'scope_mismatch', 'runtime_incompatible', 'apply_failed', 'references_unavailable', 'network_unavailable'];
        if (event === 'error' && codes.indexOf(errorCode) < 0) { errorCode = 'config_invalid'; }
        this.telemetryPending[slot] = true;
        this.telemetryAt[slot] = now;
        // Bound per-tab memory even if a long-running tab sees many revisions.
        if (Object.keys(this.telemetryAt).length > 32) { this.telemetryAt = {}; this.telemetryAt[slot] = now; }
        var identity = good ? good.acknowledgement : {scope: session.scope, actorId: session.actorId, runtimeInstanceId: this.runtimeInstanceId, runtimeVersion: RUNTIME_VERSION};
        var body = Object.assign({}, identity, {event: event, eventId: this.uuid(), correlationId: correlationId,
            occurredAt: new Date(this.now()).toISOString()});
        if (event === 'error') { body.errorCode = errorCode; }
        try {
            var response = await this.request(this.backend + '/api/v1/task-control/runtime/telemetry', {
                method: 'POST', headers: { Authorization: 'Bearer ' + session.accessToken }, body: body
            });
            if (event === 'applied' && generation === this.generation && good === this.good) { this.appliedKey = key; }
            return response;
        } catch (error) {
            if (session === this.session && [401, 403, 404].indexOf(error.status) >= 0) {
                this.session = null;
                if (error.status !== 401) { this.good = null; this.accepted = null; this.appliedKey = null;
                    if (typeof this.onInvalidated === 'function') { this.onInvalidated(); } }
            }
            throw error;
        } finally { delete this.telemetryPending[slot]; }
    };
    // Applied follows successful local engine installation. Diagnostic requests never renew a lease.
    Client.prototype.acknowledge = function (good) {
        if (!good) { return Promise.resolve(); }
        return this.telemetry(this.appliedKey === this.telemetryKey(good) ? 'heartbeat' : 'applied', good);
    };
    Client.prototype.reportError = function (code, good) { return this.telemetry('error', good || this.good, code); };
    Client.prototype._retryRefresh = async function () {
        var generation = this.generation;
        for (var attempt = 0; attempt < 3; attempt++) {
            try { var result = await this._refresh(); this.failures = 0; return result; }
            catch (error) {
                if (error.clear || [401, 403, 404].indexOf(error.status) >= 0) { this.session = null; this.good = null; this.accepted = null; }
                if (generation !== this.generation || !transient(error) || attempt === 2) { this.failures++;
                    if (generation === this.generation) { this.reportError(error.status === 503 ? 'references_unavailable' : transient(error) ? 'network_unavailable' : 'config_invalid').catch(function () {}); }
                    throw error; }
                // Restart the entire exchange after outage: an assertion/JWT may already be consumed.
                this.session = null;
                await this.sleep(Math.max(delay(attempt, this.random), Math.min(300000, Number(error.retryAfterMs) || 0)));
                if (generation !== this.generation) { throw invalid('Сессия остановлена', true); }
            }
        }
    };
    Client.prototype.pollDelay = function () { return this.failures ? delay(Math.min(9, this.failures + 5), this.random) : 60000; };
    Client.prototype.refresh = function () {
        var self = this;
        if (!this.pending) { this.pending = this._retryRefresh().finally(function () { self.pending = null; }); }
        return this.pending;
    };
    return { Client: Client, enabled: enabled, sameScope: sameScope, origin: origin, supports: supports, runtimeVersion: RUNTIME_VERSION };
}));
