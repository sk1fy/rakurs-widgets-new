define([], function () {
    'use strict';
    var companyHost = 'rakurscrm.amocrm.ru';
    var cabinetURL = 'https://core-admin.rkrs.ru/managers?section=installations';
    var coreURL = 'https://core.rkrs.ru';

    return function () {
        var widget = this;
        var panel;
        var cleanup;

        function destroy() {
            if (cleanup) { cleanup(); cleanup = null; }
            if (panel) { panel.remove(); panel = null; }
            return true;
        }

        function mountActivation(target) {
            var activation = panel.querySelector('.rkrs-manager-card__activate');
            var retry = panel.querySelector('.rkrs-manager-card__retry');
            var note = panel.querySelector('.rkrs-manager-card__note');
            var scope = target.closest('.modal, .modal-window, .widget-settings') || target;
            var nativeButtons = new Map();
            var request;
            var popup;
            var timer;
            var deadline;

            function hideSave() {
                scope.querySelectorAll('button, input[type="submit"]').forEach(function (button) {
                    var label = (button.textContent || button.value || '').trim();
                    if (!button.matches('.js-widget-save') && label !== 'Сохранить') { return; }
                    if (nativeButtons.has(button)) { return; }
                    nativeButtons.set(button, [button.style.display, button.style.getPropertyPriority('display')]);
                    button.style.setProperty('display', 'none', 'important');
                });
            }

            hideSave();
            var observer = new MutationObserver(hideSave);
            observer.observe(scope, { childList: true, subtree: true, characterData: true });

            async function check() {
                if (request) { return; }
                var controller = new AbortController();
                request = controller;
                var timeout = window.setTimeout(function () { controller.abort(); }, 5000);
                retry.hidden = true;
                try {
                    var response = await window.fetch(coreURL + '/api/v1/company-cabinet/activation', {
                        credentials: 'omit', cache: 'no-store', signal: controller.signal
                    });
                    if (!response.ok) { throw new Error('activation unavailable'); }
                    var status = await response.json();
                    if (typeof status.activated !== 'boolean') { throw new Error('invalid activation status'); }
                    if (request !== controller) { return; }
                    if (status.activated) {
                        activation.hidden = true;
                        note.textContent = 'Виджет подключён к Core.';
                        window.clearInterval(timer);
                        if (popup && !popup.closed) { popup.close(); }
                        popup = null;
                    } else if (!popup || popup.closed || Date.now() >= deadline) {
                        window.clearInterval(timer);
                        popup = null;
                        activation.hidden = false;
                        note.textContent = 'Активируйте виджет и разрешите доступ к аккаунту rakurscrm.';
                    }
                } catch (error) {
                    if (request === controller && (!popup || popup.closed || Date.now() >= deadline)) {
                        window.clearInterval(timer);
                        popup = null;
                        activation.hidden = true;
                        retry.hidden = false;
                        note.textContent = 'Не удалось проверить подключение к Core.';
                    }
                } finally {
                    window.clearTimeout(timeout);
                    if (request === controller) { request = null; }
                }
            }

            activation.onclick = function () {
                popup = window.open('about:blank', '_blank', 'popup,width=750,height=640');
                if (!popup) {
                    note.textContent = 'Разрешите всплывающие окна в браузере и нажмите «Активировать» снова.';
                    return;
                }
                popup.opener = null;
                popup.location.replace(coreURL + '/oauth/amocrm/start?integration_code=rakurscrm-manager');
                activation.hidden = true;
                note.textContent = 'Подтвердите доступ к аккаунту в окне amoCRM.';
                deadline = Date.now() + 120000;
                timer = window.setInterval(check, 2500);
            };

            retry.onclick = check;
            window.addEventListener('focus', check);
            void check();

            cleanup = function () {
                observer.disconnect();
                nativeButtons.forEach(function (style, button) {
                    button.style.setProperty('display', style[0], style[1]);
                });
                window.removeEventListener('focus', check);
                window.clearInterval(timer);
                if (request) { request.abort(); request = null; }
            };
        }

        function renderSettings(body) {
            destroy();
            var target = body && (body.nodeType === 1 ? body : body[0]);
            if (!target) { return true; }

            var isCompany = window.location.hostname === companyHost;
            panel = document.createElement('section');
            panel.className = 'rkrs-manager-card';
            panel.setAttribute('aria-label', 'Ракурс — установки и сделки по виджетам');
            panel.innerHTML = isCompany ? [
                '<div class="rkrs-manager-card__main">',
                '  <div class="rkrs-manager-card__header">',
                '    <h2>Ракурс — установки и сделки по виджетам</h2>',
                '    <p>В кабинете менеджеров видны новые установки, контакты клиентов и связанные сделки в amoCRM.</p>',
                '    <p>В разделе «Установки» можно отметить проверенные установки и выбрать общую воронку и этап для новых сделок.</p>',
                '  </div>',
                '  <div class="rkrs-manager-card__actions">',
                '    <button class="rkrs-manager-card__action rkrs-manager-card__activate" type="button" hidden>Активировать</button>',
                '    <a class="rkrs-manager-card__action" target="_blank" rel="noopener noreferrer">',
                '      Открыть кабинет <span aria-hidden="true">↗</span>',
                '    </a>',
                '  </div>',
                '</div>',
                '<div class="rkrs-manager-card__footer">',
                '  <p class="rkrs-manager-card__note" role="status">Проверяем подключение к Core…</p>',
                '  <button class="rkrs-manager-card__retry" type="button" hidden>Повторить проверку</button>',
                '</div>'
            ].join('') : '<p class="rkrs-manager-card__note">Подключение предназначено для аккаунта rakurscrm.</p>';

            var action = panel.querySelector('a.rkrs-manager-card__action');
            if (action) { action.href = cabinetURL; }

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
            if (isCompany) { mountActivation(target); }
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
