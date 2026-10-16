(function (factory) {
    if (typeof define === 'function') { define([], function () { return factory; }); }
    else if (typeof module === 'object' && module.exports) { module.exports = factory; }
}(function (TeamOS) {
    'use strict';
    function Controller(widget, $, deployment, changed) {
        this.widget = widget; this.$ = $; this.deployment = deployment; this.changed = changed;
        this.client = null; this.running = false; this.timer = null; this.generation = 0;
    }
    Controller.prototype.enabled = function () { return TeamOS.enabled(this.widget.get_settings().teamos_enabled); };
    Controller.prototype.getClient = function () {
        var self = this;
        if (!this.client) {
            this.client = new TeamOS.Client({ accountId: this.widget.accountId, settings: function () { return self.widget.get_settings(); }, coreOrigin: this.deployment.coreOrigin, backendOrigin: this.deployment.backendOrigin,
                request: function (url, opts) {
                    opts = opts || {};
                    return new Promise(function (resolve, reject) {
                        self.$.ajax({ url: url, method: opts.method || 'GET', dataType: 'json', cache: false, timeout: 10000, headers: opts.headers || {}, xhrFields: { withCredentials: false }, contentType: opts.body ? 'application/json' : undefined, data: opts.body ? JSON.stringify(opts.body) : undefined }).done(resolve).fail(function (xhr) { var e = new Error('Ошибка подключения'); e.status = xhr.status; var after = xhr.getResponseHeader && xhr.getResponseHeader('Retry-After'); e.retryAfterMs = /^\d+$/.test(after || '') ? Number(after) * 1000 : Math.max(0, Date.parse(after) - Date.now()) || 0; reject(e); });
                    });
                }
            });
        }
        return this.client;
    };
    Controller.prototype.start = function () {
        if (this.running || !this.enabled()) { return; }
        this.running = true;
        var self = this, generation = ++this.generation;
        function current() { return self.running && generation === self.generation; }
        function apply() {
            if (!current()) { return; }
            var client = self.client, good = client && client.good;
            var applied = self.changed(good);
            if (good && applied !== false && client.acknowledge) { Promise.resolve().then(function () { return client.acknowledge(good); }).catch(function () { if (current() && !client.good) { apply(); } }); }
            clearTimeout(self.leaseTimer);
            if (good) { self.leaseTimer = setTimeout(apply, Math.max(1, client.leaseUntil - client.clock())); }
        }
        function refresh() {
            clearTimeout(self.timer);
            if (!current()) { return; }
            if (typeof document !== 'undefined' && document.hidden) { apply(); return; }
            if (self.refreshing) { return; }
            self.refreshing = true;
            Promise.resolve().then(function () { return self.getClient().refresh(); }).catch(function () {}).finally(function () {
                self.refreshing = false;
                if (current()) { apply(); self.pollSources(); self.timer = setTimeout(refresh, self.client.pollDelay()); }
            });
        }
        this.resume = function () { apply(); refresh(); };
        if (typeof window !== 'undefined') { window.addEventListener('online', this.resume); window.addEventListener('pageshow', this.resume); }
        if (typeof document !== 'undefined') { document.addEventListener('visibilitychange', this.resume); }
        refresh();
    };
    Controller.prototype.bridgeAllowed = function () { return !!this.bridgeAuthorized || this.running && this.enabled(); };
    Controller.prototype.authorizeBridge = function () {
        var self = this;
        this.bridgeAuthorized = true;
        function poll() {
            if (!self.bridgeAuthorized) { return; }
            self.pollSources();
            self.bridgeTimer = setTimeout(poll, 30000);
        }
        clearTimeout(this.bridgeTimer);
        poll();
    };
    Controller.prototype.startAdminBridge = async function () {
        await this.getClient().proof('adminBridge');
        this.authorizeBridge();
        return { active: true };
    };
    Controller.prototype.pollSources = function () {
        var self = this;
        if (!this.migration || this.sourcePending || !this.bridgeAllowed() || typeof document !== 'undefined' && document.hidden || Date.now() < (this.nextSourcePoll || 0)) { return; }
        this.nextSourcePoll = Date.now() + 30000;
        this.sourcePending = true;
        var generation = this.generation;
        Promise.resolve().then(function () { return self.getClient().pendingSources(); }).then(async function (response) {
            var jobs = Array.isArray(response) ? response : response && response.requests;
            if (!Array.isArray(jobs) || jobs.length > 20) { throw new Error('Некорректный список источников'); }
            for (var index = 0; index < jobs.length; index++) {
                if (!self.bridgeAllowed() || generation !== self.generation) { break; }
                var job = jobs[index];
                if (!job.scope || String(job.scope.accountId) !== String(self.widget.accountId) || job.scope.product !== 'task-control' || job.state !== 'pending' || !Number.isFinite(Date.parse(job.expiresAt)) || Date.parse(job.expiresAt) <= Date.now()) { continue; }
                var result;
                try {
                    if (!['catalog', 'runtime_config'].includes(job.kind)) { throw Object.assign(new Error('Unsupported source'), { code: 'source_kind_unsupported' }); }
                    result = await self.migration.capture(job);
                } catch (error) {
                    result = { complete: false, payload: { issues: [{ path: 'source', code: error.code || 'source_read_failed', message: 'Не удалось прочитать полный источник' }] } };
                }
                if (self.bridgeAllowed() && generation === self.generation) { await self.getClient().submitSource(job.id, result); }
            }
        }).catch(function () {}).finally(function () { self.sourcePending = false; });
    };
    Controller.prototype.render = function ($body) {
        var self = this, $ = this.$;
        if (this.panel) { this.panel.remove(); }
        var field = $body.find('input[name="teamos_enabled"]').first();
        var nativeItem = field.closest('.widget_settings_block__item_field');
        field.hide(); nativeItem.hide();
        var panel = $('<section>').attr('class', 'rkrs-wt-teamos');
        this.panel = panel;
        // Keep custom controls inside the native fields area, before amoCRM Save.
        if (nativeItem.length) { panel.insertAfter(nativeItem); }
        else {
            var wrapper = $body.find('#widget_settings__fields_wrapper').first();
            panel.appendTo(wrapper.length ? wrapper : $body);
        }
        $('<h3>').text('Правила из TeamOS').appendTo(panel);
        $('<p>').attr('class', 'rkrs-wt-teamos__intro').text(this.enabled()
            ? 'Правила настраиваются в TeamOS. Проверка задач выполняется в amoCRM.'
            : 'Сейчас используются локальные правила amoCRM. Подключите TeamOS, чтобы управлять правилами аккаунта в одном месте.').appendTo(panel);
        var toggle = $('<input>').attr({ type: 'checkbox', 'aria-label': 'Правила из TeamOS' })
            .prop('checked', this.enabled()).prop('disabled', !field.length);
        var label = $('<label>').attr('class', 'rkrs-wt-teamos__toggle').appendTo(panel);
        label.append(toggle).append($('<span>').text(' Использовать правила из TeamOS'));
        toggle.on('change', function () {
            field.val(toggle.prop('checked') ? '1' : '0').trigger('change');
        });
        if (!field.length) {
            $('<p>').text('Не найдено поле настроек TeamOS. Закройте и повторно откройте настройки виджета.').appendTo(panel);
        }
        var steps = $('<ol>').attr('class', 'rkrs-wt-teamos__steps').appendTo(panel);
        ['Получите код подключения и вставьте его в разделе «Контроль задач» в TeamOS.',
            'Создайте и опубликуйте правила в TeamOS.',
            'Получите код смены режима, подтвердите переход в TeamOS, затем включите флажок выше и нажмите «Сохранить» в amoCRM.'
        ].forEach(function (text) { $('<li>').text(text).appendTo(steps); });
        var actions = $('<div>').attr('class', 'rkrs-wt-teamos__actions').appendTo(panel);
        var status = $('<p>').attr({ 'class': 'rkrs-wt-teamos__status', role: 'status', 'aria-live': 'polite' }).text('Коды одноразовые и действуют 60 секунд.').appendTo(panel);
        var code = $('<textarea readonly>').attr({ 'class': 'rkrs-wt-teamos__code', 'aria-label': 'Одноразовый код для TeamOS', spellcheck: 'false' }).prop('hidden', true).appendTo(panel);
        ['link', 'mode'].forEach(function (purpose) {
            var button = $('<button type="button">').attr('class', 'button-input rkrs-wt-teamos__button').text(purpose === 'link' ? 'Код подключения' : 'Код смены режима').appendTo(actions).on('click', function () {
                button.prop('disabled', true);
                code.val('').prop('hidden', true); status.text('Получение подтверждения…');
                Promise.resolve().then(function () { return self.getClient().proof(purpose); }).then(function (proof) {
                    if (purpose === 'link') { self.authorizeBridge(); }
                    code.val(proof.assertion).prop('hidden', false); status.text('Выделите и скопируйте код в TeamOS в течение 60 секунд.');
                    setTimeout(function () { if (code.val() === proof.assertion) { code.val('').prop('hidden', true); status.text('Код истёк. Получите новый код.'); } }, 60000);
                }).catch(function () { status.text('Не удалось получить код. Проверьте подключение сервера и права администратора amoCRM.'); }).finally(function () { button.prop('disabled', false); });
            });
        });
        code.on('click', function () { this.select(); });
        if (this.enabled()) { $('<p>').text('Настройки правил находятся в TeamOS. Для возврата к автономному режиму сначала переключите режим в TeamOS, затем отключите флажок и сохраните настройки amoCRM.').appendTo(panel); }
    };
    Controller.prototype.destroy = function () { this.running = false; this.bridgeAuthorized = false; clearTimeout(this.bridgeTimer); this.generation++; clearTimeout(this.timer); clearTimeout(this.leaseTimer);
        if (typeof window !== 'undefined' && this.resume) { window.removeEventListener('online', this.resume); window.removeEventListener('pageshow', this.resume); }
        if (typeof document !== 'undefined' && this.resume) { document.removeEventListener('visibilitychange', this.resume); }
        if (this.client) { this.client.clear(); } this.client = null; this.refreshing = false; };
    return Controller;
}));
