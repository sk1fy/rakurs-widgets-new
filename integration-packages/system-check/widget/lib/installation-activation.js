define(['./phone.js'], function (phones) {
    'use strict';
    const origin = 'https://core.rkrs.ru';
    const syncing = new Map();

    function context(widget) {
        const settings = widget.get_settings();
        const user = window.APP.constant('user');
        const account = window.APP.constant('account');
        if (!user || !account || !user.id || !account.id) return null;
        return {
            settings,
            key: ['rkrs-system-check', account.id, settings.widget_code || 'system', user.id].join('.')
        };
    }

    async function request(widget, method, contact) {
        const uuid = widget.get_settings().oauth_client_uuid;
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid)) throw Error('Сохраните подключение в amoCRM.');
        const token = await fetch('/ajax/v2/integrations/' + uuid + '/disposable_token', {
            headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
            credentials: 'same-origin', cache: 'no-store'
        });
        if (!token.ok) throw Error('Не удалось подтвердить подключение amoCRM.');
        const proof = (await token.json()).token;
        if (!proof) throw Error('amoCRM не подтвердила подключение.');
        const headers = { 'X-Auth-Token': proof, Accept: 'application/json' };
        if (contact) headers['Content-Type'] = 'application/json';
        const result = await fetch(origin + '/api/v1/widget/activation', {
            method, headers, credentials: 'omit', cache: 'no-store',
            body: contact && JSON.stringify({ phone: contact.phone, consent_version: 'contact-v1' })
        });
        if (!result.ok) throw Error('Core пока не подтвердил активацию. Проверьте подключение и повторите проверку.');
        return result.json();
    }

    // The SDK may destroy the dialog during Save. Resume only for this tab,
    // installer and the exact settings that amoCRM reports as saved.
    function sync(widget) {
        const ctx = context(widget);
        if (!ctx || ctx.settings.active !== 'Y') return Promise.resolve(false);
        const saved = ctx.settings.system_contact;
        if (!saved || sessionStorage.getItem(ctx.key) !== saved) return Promise.resolve(false);
        if (!syncing.has(ctx.key)) {
            const task = request(widget, 'GET').then(result =>
                result.activated ? result : request(widget, 'POST', JSON.parse(saved))
            ).then(result => {
                if (!result.activated) return false;
                if (sessionStorage.getItem(ctx.key) === saved) sessionStorage.removeItem(ctx.key);
                return true;
            }).catch(() => false).finally(() => syncing.delete(ctx.key));
            syncing.set(ctx.key, task);
        }
        return syncing.get(ctx.key);
    }

    function mount(widget, target, stylesheet) {
        if (!target) return null;
        const scope = target.closest('.modal, .modal-window, .widget-settings') || target.closest('.widget_settings_block') || target;
        const styles = document.createElement('link');
        styles.rel = 'stylesheet';
        styles.href = stylesheet || widget.params.path + '/style.css?v=1.1.0';
        target.append(styles);
        scope.classList.add('rkrs-system-dialog');
        const root = document.createElement('section');
        root.className = 'rkrs-system-af';
        root.innerHTML = `
            <aside class="rkrs-system-af__side">
                <h3 class="rkrs-system-af__side-title">Что даст активация</h3>
                <ul class="rkrs-system-af__benefits">
                    <li><i>✓</i><div><b>Доступ к виджету</b><span>Проверьте установку на тестовом аккаунте</span></div></li>
                    <li><i>☎</i><div><b>Контакт для связи</b><span>Номер появится у менеджера в карточке установки</span></div></li>
                    <li><i>₽</i><div><b>Без привязки карты</b><span>Проверочный виджет бесплатный</span></div></li>
                </ul>
            </aside>
            <div class="rkrs-system-af__main">
                <div><h2 class="rkrs-system-af__title">Активация тестового доступа</h2><p class="rkrs-system-af__sub">Займёт полминуты</p></div>
                <label class="rkrs-system-af__field"><span>Телефон</span>
                    <span class="rkrs-system-af__phone"><span class="rkrs-system-af__cc"><span data-code>+7</span><select aria-label="Страна"></select></span>
                    <input type="tel" required autocomplete="tel" aria-label="Телефон" placeholder="(000) 000-00-00"></span>
                </label>
                <button class="rkrs-system-af__btn" type="button" disabled>Активировать доступ</button>
                <p class="rkrs-system-af__foot">Нажимая кнопку, вы разрешаете связаться с вами по указанному номеру по вопросам работы виджета.</p>
                <p role="status" aria-live="polite"></p>
            </div>`;
        target.append(root);
        const get = selector => root.querySelector(selector);
        const phone = get('[type=tel]'), select = get('select');
        const submit = get('.rkrs-system-af__btn'), status = get('[role=status]');
        const ctx = context(widget);
        let saving = false;
        for (const country of phones.countries) select.add(new Option(country.name + ' +' + country.code));
        let country = phones.ru;
        function digits() { return phone.value.replace(/\D/g, ''); }
        function valid() { return digits().length === country.len; }
        function refresh() { submit.disabled = saving || !valid(); }
        function format(number) {
            country = number.country;
            select.selectedIndex = phones.countries.indexOf(country);
            get('[data-code]').textContent = '+' + country.code;
            phone.placeholder = phones.fmt('0'.repeat(country.len), country.mask);
            const formatted = phones.fmt(number.nat.slice(0, country.len), country.mask);
            if (phone.value !== formatted) phone.value = formatted;
            refresh();
        }
        select.onchange = () => format({ country: phones.countries[select.selectedIndex], nat: digits() });
        phone.onbeforeinput = event => {
            if (event.inputType === 'insertText' && phone.selectionStart === phone.selectionEnd && valid()) {
                event.preventDefault();
            }
        };
        phone.oninput = () => format(phones.parse(phone.value, country));
        submit.onclick = () => {
            if (saving || !valid()) return;
            const save = scope.querySelector('.js-widget-save');
            const field = scope.querySelector('input[name="system_contact"]');
            if (!ctx || !save || !field) {
                status.textContent = 'Форма сохранения amoCRM недоступна. Откройте настройки виджета заново.';
                return;
            }
            const value = JSON.stringify({ phone: '+' + country.code + digits() });
            field.value = value;
            for (const type of ['input','change']) field.dispatchEvent(new Event(type, { bubbles: true }));
            if (save.disabled) { status.textContent = 'Сохранение ещё недоступно в amoCRM.'; return; }
            sessionStorage.setItem(ctx.key, value);
            saving = true;
            refresh();
            status.textContent = 'Сохраняем подключение в amoCRM…';
            save.click();
            // A rejected native save can leave the modal open. Allow another attempt.
            timer = setTimeout(() => { saving = false; refresh(); check(); }, 1800);
        };
        root.onkeydown = event => {
            if (event.key === 'Enter' && event.target.matches('input')) {
                event.preventDefault();
                if (!submit.disabled) submit.click();
            }
        };
        let timer;
        async function check() {
            if (widget.get_settings().active !== 'Y') return;
            try {
                if (!await sync(widget) && !(await request(widget, 'GET')).activated) {
                    if (root.isConnected && !saving) status.textContent = 'Для активации заполните форму и сохраните подключение.';
                    return;
                }
                if (root.isConnected) {
                    root.classList.add('rkrs-system-af--single');
                    root.innerHTML = '<div class="rkrs-system-af__done"><h2 class="rkrs-system-af__title">Доступ активирован</h2><p>Core подтвердил активацию виджета.</p></div>';
                }
            } catch (error) { if (root.isConnected && !saving) status.textContent = error.message; }
        }
        if (ctx && ctx.settings.system_contact) {
            try {
                const saved = JSON.parse(ctx.settings.system_contact);
                phone.value = saved.phone || '';
            } catch (_) { /* Settings from an earlier package can be empty. */ }
        }
        format(phones.parse(phone.value, country));
        check();
        return {
            allowSave: () => saving || !root.isConnected || !root.contains(submit),
            destroy() { clearTimeout(timer); styles.remove(); root.remove(); scope.classList.remove('rkrs-system-dialog'); }
        };
    }
    const checks = new WeakMap();
    function activated(widget) {
        if (!checks.has(widget)) {
            const check = sync(widget).then(done => done || request(widget, 'GET').then(result => result.activated === true));
            checks.set(widget, check.finally(() => checks.delete(widget)));
        }
        return checks.get(widget);
    }

    async function showWhenActivated(widget, target, show) {
        target.textContent = 'Проверяем активацию…';
        try {
            const allowed = await activated(widget);
            if (!target.isConnected) return;
            if (allowed) show();
            else target.textContent = 'Для работы откройте настройки установки и подтвердите телефон.';
        } catch (_) {
            if (target.isConnected) target.textContent = 'Не удалось проверить активацию. Откройте раздел повторно.';
        }
    }

    return { mount, sync, showWhenActivated };
});
