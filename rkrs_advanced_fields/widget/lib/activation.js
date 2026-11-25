define(['./phone.js', './platform.js'], function (phones, platform) {
    'use strict';
    const syncing = new Map();

    function context(widget) {
        const settings = widget.get_settings();
        const user = window.APP.constant('user');
        const account = window.APP.constant('account');
        if (!user || !account || !user.id || !account.id) return null;
        return {
            settings,
            key: ['rkrs_advanced_fields', account.id, settings.oauth_client_uuid || settings.widget_code, user.id].join('.')
        };
    }

    async function request(widget, method, contact) {
        return platform.core(widget, '/api/v1/widget/activation', method,
            contact && { phone: contact.phone, consent_version: 'contact-v1' });
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
            }).finally(() => syncing.delete(ctx.key));
            syncing.set(ctx.key, task);
        }
        return syncing.get(ctx.key);
    }

    function mount(widget, target, onSaved) {
        // amoCRM owns the consent and Install controls until the widget is active.
        if (!target || widget.get_settings().active !== 'Y') return null;
        const scope = target.closest('.modal, .modal-window, .widget-settings') || target.closest('.widget_settings_block') || target;
        scope.classList.add('rkrs-af-dialog');
        const root = document.createElement('section');
        root.className = 'rkrs-af rkrs-af--single rkrs-af--card';
        root.innerHTML = `
            <div class="rkrs-af__main">
                <div class="rkrs-af__lead"><div class="rkrs-af__cal" aria-label="90 дней"><i></i><b>90</b><span>дней</span></div>
                <div><h2 class="rkrs-af__title">Для активации тестового периода заполните форму</h2><p class="rkrs-af__sub">Займёт полминуты</p></div></div>
                <label class="rkrs-af__field"><span>Телефон</span>
                    <span class="rkrs-af__phone"><span class="rkrs-af__cc"><span data-code>+7</span><select aria-label="Страна"></select></span>
                    <input type="tel" required autocomplete="tel" aria-label="Телефон" placeholder="(000) 000-00-00"></span>
                    <span class="rkrs-af__hint">Укажите действующий номер: по нему мы сможем помочь с виджетом.</span>
                </label>
                <button class="rkrs-af__btn" type="button" disabled>Активировать доступ</button>
                <p class="rkrs-af__foot">Нажимая кнопку, вы разрешаете связаться с вами по указанному номеру по вопросам работы виджета.</p>
                <p role="status" aria-live="polite"></p>
            </div>`;
        target.append(root);
        const get = selector => root.querySelector(selector);
        const phone = get('[type=tel]'), select = get('select');
        const submit = get('.rkrs-af__btn'), status = get('[role=status]');
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
            const formatted = phones.fmt(number.nat, country.mask);
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
            // A rejected native save can leave the modal open. Allow another attempt.
            timer = setTimeout(() => {
                saving = false;
                refresh();
                status.textContent = 'Проверяем сохранение. Если форма останется открытой, повторите активацию.';
                onSaved();
            }, 1800);
            save.click();
        };
        root.onkeydown = event => {
            if (event.key === 'Enter' && event.target.matches('input')) {
                event.preventDefault();
                if (!submit.disabled) submit.click();
            }
        };
        let timer;
        if (ctx && ctx.settings.system_contact) {
            try {
                const saved = JSON.parse(ctx.settings.system_contact);
                phone.value = saved.phone || '';
            } catch (_) { /* Settings from an earlier package can be empty. */ }
        }
        format(phones.parse(phone.value, country));
        return {
            allowSave: () => saving || !root.isConnected || !root.contains(submit),
            destroy() { clearTimeout(timer); root.remove(); scope.classList.remove('rkrs-af-dialog'); }
        };
    }
    async function activated(widget) {
        return await sync(widget) || (await request(widget, 'GET')).activated === true;
    }

    return { mount, activated };
});
