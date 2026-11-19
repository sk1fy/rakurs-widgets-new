define([], function () {
    'use strict';
    var companyHost = 'rakurscrm.amocrm.ru';
    var installationsURL = 'https://core-admin.rkrs.ru/managers?section=installations';

    return function () {
        var widget = this;
        var panel;
        function destroy() {
            if (panel) { panel.remove(); panel = null; }
            return true;
        }

        function renderSettings(body) {
            destroy();
            var target = body && (body.nodeType === 1 ? body : body[0]);
            if (!target) { return true; }

            panel = document.createElement('section');
            panel.className = 'rkrs-manager-card';
            panel.setAttribute('aria-label', 'Кабинет менеджеров');
            panel.innerHTML = window.location.hostname === companyHost ? [
                '<div class="rkrs-manager-card__main">',
                '  <div class="rkrs-manager-card__header">',
                '    <h2>Установки виджетов</h2>',
                '    <p>Контакты клиентов и связанные сделки.</p>',
                '  </div>',
                '  <a class="rkrs-manager-card__action" target="_blank" rel="noopener noreferrer">',
                '    Открыть установки <span aria-hidden="true">↗</span>',
                '  </a>',
                '</div>',
                '<p class="rkrs-manager-card__note">',
                '  После подключения Core сделки по установкам попадают в настроенную воронку.',
                '</p>'
            ].join('') : '<p class="rkrs-manager-card__note">Подключение предназначено для аккаунта rakurscrm.</p>';

            var action = panel.querySelector('.rkrs-manager-card__action');
            if (action) { action.href = installationsURL; }

            var assetPath = widget.params && widget.params.path;
            if (assetPath) {
                var version = typeof widget.get_version === 'function' ? widget.get_version() : '';
                var suffix = version ? '?v=' + encodeURIComponent(version) : '';
                var base = assetPath.replace(/\/$/, '');
                var stylesheet = document.createElement('link');
                stylesheet.rel = 'stylesheet';
                stylesheet.href = base + '/style.css' + suffix;
                panel.prepend(stylesheet);
            }
            target.appendChild(panel);
            return true;
        }

        this.callbacks = {
            init: function () { return true; },
            render: function () { return true; },
            bind_actions: function () { return true; },
            settings: renderSettings,
            onSave: function () { return window.location.hostname === companyHost; },
            destroy: destroy
        };
        return this;
    };
});
