define([], function () {
    'use strict';
    const endpoint = '/private/api/v2/json/widgets/';
    async function request(path, body) {
        const response = await fetch(endpoint + path, {
            method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: body && JSON.stringify(body)
        });
        if (!response.ok) throw Error('Ошибка amoCRM (' + response.status + ').');
        if (body) return; // The subsequent GET verifies the committed value.
        return response.json();
    }
    async function read(code) {
        const data = await request('list?filter[widget_code]=' + encodeURIComponent(code));
        const rows = data.response?.widgets;
        const row = Array.isArray(rows) && rows.find(item => (item.widget_code || item.code) === code);
        if (!row) throw Error('amoCRM не вернула настройки этой установки.');
        const raw = row.settings;
        const settings = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!settings || typeof settings !== 'object') throw Error('Не удалось прочитать настройки установки.');
        return settings;
    }
    async function save(code, expected, next) {
        const current = await read(code);
        if ((current.card_config || '') !== expected) throw Error('Настройки уже изменились. Откройте раздел заново.');
        const config = JSON.stringify(next);
        const settings = { card_config: config, system_contact: current.system_contact || '' };
        await request('set', { request: { widgets: { install: [{ widget_code: code, settings }] } } });
        if ((await read(code)).card_config !== config) throw Error('amoCRM не подтвердила сохранение.');
        return config;
    }
    return { read, save };
});
