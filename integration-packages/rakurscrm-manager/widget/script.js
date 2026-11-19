define([], function () {
    'use strict';
    return function () {
        var panel;
        function destroy() {
            if (panel) { panel.remove(); panel = null; }
            return true;
        }
        this.callbacks = {
            init: function () { return true; },
            render: function () { return true; },
            bind_actions: function () { return true; },
            settings: function (body) {
                destroy();
                var target = body && (body.nodeType === 1 ? body : body[0]);
                if (!target) { return true; }
                panel = document.createElement('section');
                panel.style.cssText = 'margin:16px 0;padding:16px;border:1px solid #dce3ec;border-radius:8px';
                var text = document.createElement('p');
                if (window.location.hostname !== 'rakurscrm.amocrm.ru') {
                    text.textContent = 'Подключение предназначено для аккаунта rakurscrm.';
                    panel.appendChild(text);
                } else {
                    text.textContent = 'Сделки по установкам поступают в настроенную воронку после подключения OAuth на сервере.';
                    panel.appendChild(text);
                    var link = document.createElement('a');
                    link.href = 'https://core-admin.rkrs.ru/managers?section=installations';
                    link.textContent = 'Открыть установки в кабинете менеджеров';
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    panel.appendChild(link);
                }
                target.appendChild(panel);
                return true;
            },
            onSave: function () { return window.location.hostname === 'rakurscrm.amocrm.ru'; },
            destroy: destroy
        };
        return this;
    };
});
