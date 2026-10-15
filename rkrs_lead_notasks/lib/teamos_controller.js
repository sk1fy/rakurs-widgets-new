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
                        self.$.ajax({ url: url, method: opts.method || 'GET', dataType: 'json', cache: false, timeout: 10000, headers: opts.headers || {}, xhrFields: { withCredentials: false }, contentType: opts.body ? 'application/json' : undefined, data: opts.body ? JSON.stringify(opts.body) : undefined }).done(resolve).fail(function (xhr) { var e = new Error('Ошибка подключения'); e.status = xhr.status; reject(e); });
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
        function refresh() {
            Promise.resolve().then(function () { return self.getClient().refresh(); }).then(function (good) {
                if (self.running && generation === self.generation) { self.changed(good); }
            }).catch(function () {
                if (self.running && generation === self.generation) { self.changed(self.client && self.client.good); }
            }).finally(function () { if (self.running && generation === self.generation) { self.timer = setTimeout(refresh, 60000); } });
        }
        refresh();
    };
    Controller.prototype.render = function ($body) {
        var self = this, $ = this.$;
        var panel = $('<div>').css({ padding: '16px' }).appendTo($body);
        $('<h3>').text('Подключение к TeamOS').appendTo(panel);
        // manifest custom fields are persisted by amoCRM's main Save button.
        // A checkbox is a rendered control, not a supported manifest field type.
        var field = $body.find('input[name="teamos_enabled"]').first();
        var toggle = $('<input>').attr({ type: 'checkbox', 'aria-label': 'Правила из TeamOS' })
            .prop('checked', this.enabled()).prop('disabled', !field.length);
        var label = $('<label>').appendTo(panel);
        label.append(toggle).append($('<span>').text(' Правила из TeamOS'));
        toggle.on('change', function () {
            field.val(toggle.prop('checked') ? '1' : '0').trigger('change');
        });
        if (!field.length) {
            $('<p>').text('Не найдено поле настроек TeamOS. Закройте и повторно откройте настройки виджета.').appendTo(panel);
        }
        $('<p>').text('В TeamOS подключите аккаунт, опубликуйте правила и активируйте режим managed. Затем включите флажок «Правила из TeamOS» здесь и нажмите основную кнопку Сохранить. Коды действуют 60 секунд.').appendTo(panel);
        var status = $('<p>').appendTo(panel);
        var code = $('<textarea readonly>').css({ width: '100%', height: '70px' }).attr('aria-label', 'Одноразовое подтверждение Core').appendTo(panel);
        ['link', 'mode'].forEach(function (purpose) {
            $('<button type="button">').text(purpose === 'link' ? 'Код подключения' : 'Код смены режима').appendTo(panel).on('click', function () {
                code.val(''); status.text('Получение подтверждения…');
                Promise.resolve().then(function () { return self.getClient().proof(purpose); }).then(function (proof) {
                    code.val(proof.assertion); status.text('Скопируйте код в TeamOS в течение 60 секунд.');
                    setTimeout(function () { if (code.val() === proof.assertion) { code.val(''); } }, 60000);
                }).catch(function () { status.text('Проверьте адреса сборки, подключение Core и права администратора amoCRM.'); });
            });
        });
        if (this.enabled()) { $('<p>').text('Настройки правил находятся в TeamOS. Для возврата к автономному режиму сначала переключите режим в TeamOS, затем отключите флажок и сохраните настройки amoCRM.').appendTo(panel); }
    };
    Controller.prototype.destroy = function () { this.running = false; this.generation++; clearTimeout(this.timer); this.client = null; };
    return Controller;
}));
