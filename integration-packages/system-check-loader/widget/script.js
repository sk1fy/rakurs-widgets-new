define([], function () {
    'use strict';
    const base = 'https://core.rkrs.ru/system-check-loader/';
    let loading;

    async function fetchApp() {
        const response = await fetch(base + 'release.json', {
            cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw Error('HTTP ' + response.status);
        const { release } = await response.json();
        if (!/^[a-f0-9]{16}$/.test(release)) throw Error('Некорректная версия');
        const url = base + release + '/app.js';
        return new Promise((resolve, reject) => {
            require([url], factory => {
                if (typeof factory === 'function') resolve(factory);
                else reject(Error('Некорректный модуль виджета'));
            }, error => {
                for (const id of error.requireModules || []) {
                    if (id.startsWith(base) && require.undef) require.undef(id);
                }
                if (require.undef) require.undef(url);
                reject(error);
            });
        });
    }

    return function () {
        const widget = this;
        let generation = 0;
        let app;
        let notice;
        let settingsPending = false;
        function run(method, target) {
            const current = generation;
            if (!loading) loading = fetchApp().catch(error => { loading = null; throw error; });
            loading.then(create => {
                if (current !== generation || (target && !target.isConnected)) return;
                if (notice) notice.remove();
                if (!app) app = create(widget);
                app[method](target);
                if (method === 'settings') settingsPending = false;
            }).catch(() => {
                if (current !== generation || (target && !target.isConnected)) return;
                if (!notice) {
                    notice = document.createElement('p');
                    notice.setAttribute('role', 'alert');
                    notice.textContent = 'Ракурс: не удалось загрузить серверный модуль. Откройте настройки повторно.';
                }
                (target || document.body).append(notice);
            });
            return true;
        }
        this.callbacks = {
            init: () => run('init'),
            render: () => run('render'),
            bind_actions: () => true,
            advancedSettings() {
                const code = widget.get_settings().widget_code;
                const host = document.getElementById('work-area-' + code) || document.getElementById('list_page_holder');
                return host ? run('advancedSettings', host) : false;
            },
            settings(body) {
                settingsPending = true;
                return run('settings', body?.nodeType === 1 ? body : body?.[0]);
            },
            onSave: () => !settingsPending && !!app && app.onSave(),
            destroy() {
                generation++;
                if (app) app.destroy();
                if (notice) notice.remove();
                app = null;
                settingsPending = false;
                return true;
            }
        };
        return this;
    };
});
