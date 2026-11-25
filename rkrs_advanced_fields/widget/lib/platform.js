define(['./deployment.js'], function (deployment) {
    'use strict';

    async function json(url, options) {
        const response = await fetch(url, {
            credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12000), ...options
        });
        if (!response.ok) throw Error('HTTP ' + response.status);
        return response.json();
    }

    async function core(widget, path, method, body) {
        const uuid = widget.get_settings().oauth_client_uuid;
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid)) throw Error('Нет подключения amoCRM');
        const { token } = await json('/ajax/v2/integrations/' + uuid + '/disposable_token', {
            credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }
        });
        if (!token) throw Error('Нет подтверждения amoCRM');
        const headers = { 'X-Auth-Token': token, Accept: 'application/json' };
        if (body) headers['Content-Type'] = 'application/json';
        return json('https://core.rkrs.ru' + path, { method, headers, body: JSON.stringify(body) });
    }

    async function access(widget) {
        const { proof } = await core(widget, '/api/v1/widget/platform-access-proof', 'POST');
        if (!proof) throw Error('Нет подтверждения Core');
        const account = window.APP.constant('account').id;
        const result = await json(deployment.origin + '/v1/access/' + encodeURIComponent(account) + '/rkrs_advanced_fields', {
            headers: { Authorization: 'Bearer ' + proof }
        });
        if (typeof result.active !== 'boolean') throw Error('Некорректный ответ Platform');
        return { status: result.active ? 'active' : 'expired', paidTo: result.valid_until || '' };
    }

    return { core, access };
});
