define([], function () {
    'use strict';

    var unavailable = { destroy: function () {} };

    function mount(widget, target, coreOrigin) {
        if (!target || !coreOrigin) { return unavailable; }
        var core;
        try {
            core = new URL(coreOrigin);
            if (core.protocol !== 'https:' || core.origin !== coreOrigin) { return unavailable; }
        } catch (error) { return unavailable; }

        var host = document.createElement('section');
        host.setAttribute('data-rakurs-installation-activation', '');
        host.style.cssText = 'margin:16px 0;padding:16px;border:1px solid #dce3ec;border-radius:8px';
        var heading = document.createElement('h3');
        heading.textContent = 'Активация виджета';
        var status = document.createElement('p');
        status.setAttribute('role', 'status');
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Проверить подключение';
        retry.hidden = true;
        var form = document.createElement('form');
        form.hidden = true;
        var profile = document.createElement('p');
        var phoneLabel = document.createElement('label');
        phoneLabel.textContent = 'Телефон для связи ';
        var phone = document.createElement('input');
        phone.type = 'tel';
        phone.autocomplete = 'tel';
        phone.placeholder = '+7 (___) ___-__-__';
        phone.required = true;
        phone.maxLength = 48;
        phoneLabel.appendChild(phone);
        var consentLabel = document.createElement('label');
        consentLabel.style.cssText = 'display:block;margin:12px 0';
        var consent = document.createElement('input');
        consent.type = 'checkbox';
        consent.required = true;
        consentLabel.appendChild(consent);
        consentLabel.appendChild(document.createTextNode(' Разрешаю связаться со мной по вопросам работы виджета.'));
        var submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Активировать';
        form.appendChild(profile);
        form.appendChild(phoneLabel);
        form.appendChild(consentLabel);
        form.appendChild(submit);
        host.appendChild(heading);
        host.appendChild(status);
        host.appendChild(retry);
        host.appendChild(form);
        target.appendChild(host);

        var controller = new AbortController();
        var busy = false;
        async function request(method, body) {
            var integration = widget.get_settings().oauth_client_uuid;
            if (typeof integration !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(integration)) {
                return { status: 401, value: null };
            }
            var proofResponse = await fetch('/ajax/v2/integrations/' + encodeURIComponent(integration) + '/disposable_token', {
                credentials: 'same-origin', cache: 'no-store',
                headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
                signal: controller.signal
            });
            if (!proofResponse.ok) { return { status: proofResponse.status, value: null }; }
            var proof = await proofResponse.json();
            if (!proof || typeof proof.token !== 'string' || !proof.token) { throw new Error('invalid proof'); }
            var headers = { Accept: 'application/json', 'X-Auth-Token': proof.token };
            if (body) { headers['Content-Type'] = 'application/json'; }
            var response = await fetch(core.origin + '/api/v1/widget/activation', {
                method: method, mode: 'cors', credentials: 'omit', cache: 'no-store',
                headers: headers, body: body && JSON.stringify(body), signal: controller.signal
            });
            return { status: response.status, value: response.ok ? await response.json() : null };
        }

        async function check() {
            if (busy || controller.signal.aborted) { return; }
            busy = true;
            retry.hidden = true;
            form.hidden = true;
            status.textContent = 'Проверяем подключение amoCRM…';
            try {
                var response = await request('GET');
                if (controller.signal.aborted) { return; }
                if (response.status === 200 && response.value.activated === true) {
                    status.textContent = 'Виджет активирован.';
                } else if (response.status === 200 && response.value.profile &&
                    typeof response.value.profile.name === 'string') {
                    var employee = response.value.profile;
                    profile.textContent = employee.name + (employee.role ? ' · ' + employee.role : '') +
                        (employee.email ? ' · ' + employee.email : '');
                    status.textContent = 'Укажите телефон, чтобы мы могли помочь с настройкой виджета.';
                    form.hidden = false;
                } else {
                    status.textContent = response.status === 404 || response.status === 401
                        ? 'Сохраните подключение виджета в amoCRM, затем повторите проверку.'
                        : 'Не удалось получить профиль amoCRM. Повторите проверку.';
                    retry.hidden = false;
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    status.textContent = 'Сервис активации недоступен. Повторите проверку.';
                    retry.hidden = false;
                }
            } finally { busy = false; }
        }

        retry.onclick = check;
        form.onsubmit = async function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (busy || !form.reportValidity()) { return; }
            busy = true;
            submit.disabled = true;
            status.textContent = 'Сохраняем контакт…';
            try {
                var response = await request('POST', { phone: phone.value, consent_version: 'contact-v1' });
                if (controller.signal.aborted) { return; }
                if (response.status === 200 && response.value.activated === true) {
                    form.hidden = true;
                    phone.value = '';
                    status.textContent = 'Виджет активирован. Контакт сохранён.';
                } else {
                    status.textContent = response.status === 400
                        ? 'Проверьте телефон и укажите код страны.'
                        : 'Не удалось подтвердить активацию. Повторите попытку.';
                }
            } catch (error) {
                if (!controller.signal.aborted) { status.textContent = 'Сервис активации недоступен. Повторите попытку.'; }
            } finally {
                busy = false;
                submit.disabled = false;
            }
        };
        void check();
        return { destroy: function () { controller.abort(); host.remove(); } };
    }

    return { mount: mount };
});
