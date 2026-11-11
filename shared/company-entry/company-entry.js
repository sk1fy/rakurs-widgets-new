(function (factory) {
    if (typeof define === 'function') { define([], factory); }
    else if (typeof module === 'object' && module.exports) { module.exports = factory(); }
}(function () {
    'use strict';
    var unavailable = 'Не удалось проверить компанию. Повторите проверку.';
    function origin(value) {
        var url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) { throw new Error('Не настроен адрес входа в TeamOS'); }
        return url.origin;
    }
    function uuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value); }
    function status(value) {
        if (value && value.state === 'absent' && value.companyId === undefined) { return 'absent'; }
        if (value && value.state === 'present' && uuid(value.companyId)) { return 'present'; }
        if (value && value.state === 'blocked') { throw new Error('Доступ к компании ограничен. Обратитесь к администратору TeamOS.'); }
        throw new Error(unavailable);
    }
    function redirect(value, frontendOrigin) {
        if (!value || typeof value.redirectUrl !== 'string' || typeof value.expiresAt !== 'string' || !(Date.parse(value.expiresAt) > Date.now())) { throw new Error('Ссылка входа недействительна. Повторите вход из виджета.'); }
        var url = new URL(value.redirectUrl);
        if (url.origin !== frontendOrigin || url.pathname !== '/auth/amo' || url.username || url.password || url.search || !/^#code=[a-zA-Z0-9_-]{32,256}$/.test(url.hash)) { throw new Error('Ссылка входа недействительна. Повторите вход из виджета.'); }
        return url.href;
    }
    function Controller(options) {
        this.options = options;
        this.identity = options.identity();
        this.state = 'loading';
        this.generation = 0;
        this.alive = true;
        this.pending = null;
        this.popup = null;
    }
    Controller.prototype.current = function (generation) {
        if (!this.alive || this.identity !== this.options.identity()) { this.destroy(); return false; }
        return generation === this.generation;
    };
    Controller.prototype.publish = function (state, message) {
        this.state = state;
        this.options.render(state, message || '');
    };
    Controller.prototype.close = function () {
        if (this.popup) { try { this.popup.close(); } catch (ignored) {} this.popup = null; }
    };
    Controller.prototype.destroy = function () {
        this.alive = false;
        this.generation++;
        if (this.pending) { this.pending.abort(); this.pending = null; }
        this.close();
        this.publish('error', 'Аккаунт изменился. Откройте настройки виджета заново.');
    };
    Controller.prototype.call = async function (path, body, generation) {
        var pending = new AbortController();
        this.pending = pending;
        var timer = setTimeout(function () { pending.abort(); }, 15000);
        try {
            var proof = await this.options.proof(pending.signal);
            if (!this.current(generation)) { throw new Error('Аккаунт изменился'); }
            var result = await this.options.request(path, body, proof, pending.signal);
            if (!this.current(generation)) { throw new Error('Аккаунт изменился'); }
            return result;
        } finally {
            clearTimeout(timer);
            if (this.pending === pending) { this.pending = null; }
        }
    };
    Controller.prototype.refresh = async function () {
        if (!this.current(this.generation) || this.state === 'entering') { return; }
        if (this.pending) { this.pending.abort(); }
        var generation = ++this.generation;
        this.publish('loading');
        try {
            var value = await this.call('/api/v1/widget/company/status', {}, generation);
            if (this.current(generation)) { this.publish(status(value)); }
        } catch (error) { if (this.current(generation)) { this.publish('error', error.name === 'AbortError' ? unavailable : error.message || unavailable); } }
    };
    Controller.prototype.enter = async function () {
        if (!this.current(this.generation) || (this.state !== 'absent' && this.state !== 'present')) { return; }
        var intent = this.state === 'absent' ? 'create' : 'enter';
        var generation = ++this.generation;
        this.publish('entering');
        try {
            this.popup = this.options.open();
            if (!this.popup || this.popup.closed) { throw new Error('Разрешите всплывающие окна и повторите проверку.'); }
            this.popup.opener = null;
            var value = await this.call('/api/v1/widget/company/entries', { intent: intent }, generation);
            if (!this.current(generation)) { return; }
            var url = redirect(value, this.options.frontendOrigin);
            if (this.popup.closed) { throw new Error('Окно входа закрыто. Повторите проверку.'); }
            this.popup.location.replace(url);
            this.popup = null;
            this.publish('present');
        } catch (error) {
            this.close();
            if (this.current(generation)) { this.publish('error', error.name === 'AbortError' ? 'Вход не завершён. Повторите проверку и вход из виджета.' : error.message || 'Вход не завершён. Повторите проверку и вход из виджета.'); }
        }
    };
    function constant(name) {
        try { return (typeof APP !== 'undefined' ? APP : AMOCRM).constant(name) || {}; } catch (ignored) { return {}; }
    }
    function identity() {
        var user = constant('user');
        return String(constant('account').id || '') + ':' + String(user.id || constant('user_id')) + ':' + String(admin());
    }
    function admin() {
        return [true, 1, '1', 'Y', 'true'].indexOf(constant('user_rights').is_admin) >= 0;
    }
    function mount(widget, body, config) {
        var target = body && (body.nodeType ? body : body[0]);
        if (!target || !admin()) { return { destroy: function () {} }; }
        var host = document.createElement('section');
        host.setAttribute('data-teamos-company-entry', '');
        host.style.cssText = 'margin:16px 0;padding:16px;border:1px solid #dce3ec;border-radius:8px;font:14px/1.5 Arial,sans-serif';
        var title = document.createElement('h3'); title.textContent = 'Компания TeamOS';
        var message = document.createElement('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
        var button = document.createElement('button'); button.type = 'button';
        button.style.cssText = 'margin-top:10px;padding:8px 14px;cursor:pointer';
        host.appendChild(title); host.appendChild(message); host.appendChild(button); target.appendChild(host);
        function render(state, error) {
            button.disabled = state === 'loading' || state === 'entering';
            button.textContent = state === 'absent' ? 'Создать компанию' : state === 'present' ? 'Перейти в компанию' : state === 'error' ? 'Повторить проверку' : 'Подождите…';
            message.textContent = error || (state === 'absent' ? 'Создайте компанию и откройте TeamOS.' : state === 'present' ? 'Ваша компания готова к работе.' : state === 'entering' ? 'Открываем вашу компанию…' : 'Проверяем компанию…');
        }
        var controller;
        try {
            var core = origin(config.coreOrigin), frontend = origin(config.frontendOrigin);
            async function json(url, options) {
                var response = await fetch(url, options);
                var value = await response.json();
                if (!response.ok) {
                    var error = new Error(response.status === 403 ? 'Вход доступен только действующему администратору amoCRM.' : response.status === 422 ? 'В профиле amoCRM отсутствует корректный email. Проверьте профиль и повторите вход.' : 'Сервис входа недоступен. Повторите проверку.');
                    throw error;
                }
                return value;
            }
            controller = new Controller({
                identity: identity, render: render, frontendOrigin: frontend,
                open: function () { return window.open('about:blank', '_blank'); },
                proof: async function (signal) {
                    var client = widget.get_settings().oauth_client_uuid;
                    if (!uuid(client)) { throw new Error('Не настроена OAuth интеграция виджета.'); }
                    var value = await json('/ajax/v2/integrations/' + encodeURIComponent(client) + '/disposable_token', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }, signal: signal });
                    if (!value || typeof value.token !== 'string' || !value.token) { throw new Error('Не получен токен amoCRM. Повторите проверку.'); }
                    return value.token;
                },
                request: function (path, body, proof, signal) {
                    return json(core + path, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': proof }, body: JSON.stringify(body), signal: signal });
                }
            });
            button.onclick = function () { if (controller.state === 'error') { void controller.refresh(); } else { void controller.enter(); } };
            void controller.refresh();
        } catch (error) { render('error', error.message); button.disabled = true; }
        var timer = setInterval(function () {
            if (!host.isConnected || controller && !controller.current(controller.generation)) { clearInterval(timer); if (controller) { controller.destroy(); } }
        }, 500);
        return { destroy: function () { clearInterval(timer); if (controller) { controller.destroy(); } host.remove(); } };
    }
    return { mount: mount, Controller: Controller, parseStatus: status, parseRedirect: redirect };
}));
