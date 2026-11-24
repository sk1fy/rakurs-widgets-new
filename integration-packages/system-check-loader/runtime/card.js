define([], function () {
    'use strict';
    const defaults = {
        title: 'Ракурс — проверка загрузчика', message: 'Виджет подключён',
        account: true, deal: false, version: true, accent: '#448aff', compact: false, collapsed: false
    };
    const colors = ['#448aff', '#24956d', '#ad7228', '#8270be'];
    function decode(raw) {
        const config = { ...defaults };
        if (!raw) return config;
        const input = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!input || typeof input !== 'object') throw Error('Не удалось прочитать настройки виджета.');
        for (const key of Object.keys(defaults)) {
            if (typeof input[key] === typeof defaults[key]) config[key] = input[key];
        }
        if (!colors.includes(config.accent)) config.accent = defaults.accent;
        return config;
    }
    function draw(target, config, ids, open = !config.collapsed) {
        const block = document.createElement('details');
        block.open = open;
        block.style.cssText = 'padding:4px 12px;overflow-wrap:anywhere;border-inline-start:3px solid ' + config.accent;
        const summary = document.createElement('summary');
        summary.style.cssText = 'cursor:pointer;font-weight:600';
        summary.textContent = config.title;
        block.append(summary);
        const lines = [config.message];
        if (config.account && ids.account) lines.push('Аккаунт · ' + ids.account);
        if (config.deal && ids.deal) lines.push('Сделка · ' + ids.deal);
        if (config.version) lines.push('Версия модуля · ' + ids.version);
        lines.forEach((line, index) => {
            const p = document.createElement('p');
            p.style.margin = config.compact ? '2px 0' : '8px 0';
            p.style.whiteSpace = 'pre-line';
            if (index) p.style.fontSize = '0.85em';
            p.textContent = line;
            block.append(p);
        });
        target.replaceChildren(block);
    }
    return { defaults, decode, draw };
});
