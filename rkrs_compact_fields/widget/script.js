define([
    'jquery',
    './lib/app/api.js?v=6.2.0',
    './lib/app/access.js?v=6.2.0',
    './lib/app/pulse.js?v=6.2.0',
    './lib/shared/rkrs_activation_form.js?v=6.2.0'
], function ($, createApi, Access, Pulse, ActivationForm) {
    return function () {
        var self = this;

        self.appName = 'rkrs_compact_fields';

        // Где виджет работает: карточки сделки, контакта, компании, покупателя (locations в manifest.json).
        var CARD_AREAS = ['lcard', 'ccard', 'comcard', 'cucard'];
        // Блоки полей карточки → класс, на который навешаны правила style.css (те же, что в 6.0.39).
        var TARGETS = [
            ['.card-holder__fields', 'rkrs_compact_fields_card-holder__fields'],
            ['.linked-form__field', 'rkrs_compact_fields_linked-form__field'],
            ['.card-cf-table', 'rkrs_compact_fields_card-cf-table'],
            ['.linked-form', 'rkrs_compact_fields_linked-form']
        ];

        var api = createApi(function (url, options) { return fetch(url, options); });
        var observer = null;
        var frame = 0;
        var pulseStarted = false;
        var access = null;
        var summaryWrap = null;  // открытое окно виджета — перерисовываем, когда пришёл ответ сервера

        function version() {
            try { return typeof self.get_version === 'function' ? String(self.get_version() || '') : ''; } catch (e) { return ''; }
        }

        function settingsSafe() {
            try { return self.get_settings() || {}; } catch (e) { return {}; }
        }

        function assetPath(p) {
            var path = '';
            try { path = self.params.path || self.params.cdn_path || settingsSafe().path || ''; } catch (e) {}
            return path + '/' + p;
        }

        function includeCSS() {
            var v = version();
            var href = assetPath('style.css') + (v ? '?v=' + encodeURIComponent(v) : '');
            var existing = document.getElementById('rkrs-compact-fields-style');
            if (existing) {
                if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
                return;
            }
            var link = document.createElement('link');
            link.id = 'rkrs-compact-fields-style';
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = href;
            document.head.appendChild(link);
        }

        function area() {
            try { return String(self.system().area || ''); } catch (e) { return ''; }
        }

        // Администратор или владелец аккаунта — как в «Аватаре в imBox», «Динамических полях» и «Счётчике».
        function isAdmin() {
            try {
                var rights = window.APP.constant('user_rights') || {};
                return [true, 1, '1', 'Y'].indexOf(rights.is_admin) !== -1 || [true, 1, '1', 'Y'].indexOf(rights.is_owner) !== -1;
            } catch (e) {
                return false;
            }
        }

        // Ставит классы на блоки полей, у которых их ещё нет. Новые поля (связанный контакт, другая вкладка карточки)
        // amoCRM дорисовывает позже — их подхватывает наблюдатель, не чаще раза за кадр.
        // ~~Снимать .js-widgets-hidden и выключать клики на время разметки~~ — убрано (было до 6.1.0): первое разворачивало
        // свёрнутую пользователем панель виджетов в карточке, второе ничего не делало.
        function markFields() {
            TARGETS.forEach(function (t) {
                var list = document.querySelectorAll(t[0] + ':not(.' + t[1] + ')');
                for (var i = 0; i < list.length; i++) list[i].classList.add(t[1]);
            });
        }

        // Виджет выключен — снимаем свои классы, поля amoCRM выглядят как без виджета.
        function unmarkFields() {
            TARGETS.forEach(function (t) {
                var list = document.querySelectorAll('.' + t[1]);
                for (var i = 0; i < list.length; i++) list[i].classList.remove(t[1]);
            });
        }

        // Полоса «нужна переавторизация» над полями карточки (Максим 27.11.2026): только администраторам,
        // без крестика — висит, пока сервер не подтвердит доступ или виджет не удалят. amoCRM перерисовывает
        // карточку — наблюдатель возвращает полосу на место.
        var STRIP = 'rkrs-cmf-reauth';
        var STRIP_ANCHORS = ['.card-holder__fields', '.linked-form'];

        function buildStrip() {
            var box = document.createElement('div');
            box.className = STRIP;
            box.setAttribute('role', 'status');
            var title = document.createElement('b');
            title.textContent = 'Удобные поля выключены: нужна переавторизация';
            var text = document.createElement('span');
            text.textContent = 'Чтобы названия полей снова были видны целиком, переавторизуйте виджет. Это займёт минуту. ';
            var a = document.createElement('a');
            a.href = Access.REINSTALL_URL;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'Переавторизоваться';
            text.appendChild(a);
            box.appendChild(title);
            box.appendChild(text);
            return box;
        }

        function removeStrip() {
            var list = document.querySelectorAll('.' + STRIP);
            for (var i = 0; i < list.length; i++) list[i].parentNode.removeChild(list[i]);
        }

        function syncStrip() {
            var anchor = null;
            for (var i = 0; i < STRIP_ANCHORS.length && !anchor; i++) anchor = document.querySelector(STRIP_ANCHORS[i]);
            var mine = document.querySelector('.' + STRIP);
            if (!anchor) { if (mine) removeStrip(); return; }
            if (mine && mine.nextElementSibling === anchor) return;
            removeStrip();
            anchor.parentNode.insertBefore(buildStrip(), anchor);
        }

        // Один шаг для карточки: доступ есть (или сбой связи у нас, или ещё проверяем) — расширяем названия полей;
        // сервер сказал «не знаю» — виджет выключен, администратору полоса.
        function syncCard() {
            if (accessStatus() === 'error') {
                unmarkFields();
                if (isAdmin()) syncStrip(); else removeStrip();
            } else {
                removeStrip();
                markFields();
            }
        }

        function startCard() {
            syncCard();
            if (observer) return;
            observer = new MutationObserver(function () {
                if (frame) return;
                frame = window.requestAnimationFrame(function () { frame = 0; syncCard(); });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        function stopCard() {
            if (observer) observer.disconnect();
            observer = null;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            removeStrip();
        }

        // Пульс аккаунта для ssd.rkrs.ru — раз в день с браузера (lib/app/pulse.js), как account.js в 6.0.39 и в ДП.
        function startPulse() {
            if (pulseStarted) return;
            pulseStarted = true;
            try {
                Pulse.createPulse({
                    api: api,
                    appName: self.appName,
                    account: window.APP.constant('account'),
                    user: window.APP.constant('user'),
                    settings: settingsSafe(),
                    widgetData: settingsSafe(),
                    today: function () { return new Date().getDate(); },
                    storage: {
                        get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
                        set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
                    },
                    // Тот же формат, что у 6.0.39 (jQuery, form-data): сервер разбирает именно его.
                    post: function (url, data) {
                        return new Promise(function (resolve) {
                            $.ajax({ url: url, method: 'POST', data: data, crossDomain: true })
                                .done(function (res) { resolve(res || null); })
                                .fail(function () { resolve(null); });
                        });
                    }
                }).run();
            } catch (e) {}
        }

        function coreActivation(contact) {
            return Access.activation(fetchWithTimeout, settingsSafe().oauth_client_uuid, contact);
        }

        function accessStatus() {
            return access ? access.getStatus() : 'checking';
        }

        function refreshAfterOAuth() {
            if (access && access.getStatus() !== 'active') access.refresh();
        }

        function fetchWithTimeout(url, init, ms) {
            var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
            var t = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
            return fetch(url, Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {}))
                .then(function (r) { if (t) clearTimeout(t); return r; }, function (e) { if (t) clearTimeout(t); throw e; });
        }

        function onAccessChange() {
            if (observer) syncCard();
            if (summaryWrap && document.body.contains(summaryWrap)) summaryWrap.innerHTML = summaryHtml(version(), accessStatus());
        }

        // Проверка связи — у всех пользователей с запуска (выключить виджет нужно и у менеджеров, полосу видят только админы).
        // Ответ сервера помним в браузере: доступ есть — сутки без запросов, нет — переспрашиваем каждые 30 минут.
        function startAccess() {
            if (access) return access;
            access = Access.createAccess({
                fetcher: fetchWithTimeout,
                clientId: settingsSafe().oauth_client_uuid,
                onChange: onAccessChange,
                cache: {
                    get: function () { try { return window.localStorage.getItem('rkrs_cmf_core_access_state'); } catch (e) { return null; } },
                    set: function (v) { try { window.localStorage.setItem('rkrs_cmf_core_access_state', v); } catch (e) {} }
                }
            });
            window.addEventListener('focus', refreshAfterOAuth);
            access.start();
            return access;
        }

        // Окно виджета в amoМаркете после активации — «Меню amo», как у «Счётчика недозвонов» и «Аватара в imBox»
        // (стандарт упаковки), без «Оплачено до» и «Продлить»: виджет FREE.
        var CONTACTS = {
            messengers: [
                { key: 'tg', name: 'Telegram', url: 'https://t.me/+79214377886' },
                { key: 'wa', name: 'WhatsApp', url: 'https://wa.me/79214377886' },
                { key: 'max', name: 'Max', url: 'https://max.ru/u/f9LHodD0cOKGsdNZ1wo62jq1Vc9g9x8nEG5LqNwpXJVaDLosI7e00Zfh9lU' },
                { key: 'vk', name: 'VK', url: 'https://vk.me/rakurs_rosta' }
            ],
            phone: '+7 (921) 437-78-86',
            phoneHref: '+79214377886',
            email: 'amo@rkrs.ru',
            site: 'https://rkrs.ru/?utm_source=amocrm&utm_medium=widget&utm_campaign=compact_fields&utm_content=settings',
            policy: 'https://rkrs.ru/policy',
            legal: 'ИП Шумилов Максим Львович · ИНН 371501428560 · ОГРНИП 316370200076776'
        };

        function esc(t) {
            return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
        }

        function link(url, text, cls) {
            return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(text) + '</a>';
        }

        // Памятка «без виджета / с виджетом» в окне виджета (Максим 27.11.2026: как кадр «было | стало» со страницы согласования).
        // Вёрстка, не картинка: чёткая на любом экране и в тёмной теме amoCRM. Данные условные.
        var MEMO_ROWS = [
            ['Дата следующего звонка клиенту', '28.11.2026'],
            ['Дата следующего платежа по договору', '05.12.2026'],
            ['Откуда клиент узнал о компании', 'Рекомендация']
        ];

        function memoHtml() {
            function card(cls, title) {
                return '<figure class="rkrs-cmf-ba-col ' + cls + '"><figcaption>' + title + '</figcaption><div class="rkrs-cmf-ba-card">' +
                    MEMO_ROWS.map(function (r) {
                        return '<div class="rkrs-cmf-ba-row"><span class="rkrs-cmf-ba-label">' + esc(r[0]) + '</span><span class="rkrs-cmf-ba-value">' + esc(r[1]) + '</span></div>';
                    }).join('') + '</div></figure>';
            }
            return '<div class="rkrs-cmf-ba">' + card('rkrs-cmf-ba-before', 'Без виджета') + card('rkrs-cmf-ba-after', 'С виджетом') + '</div>';
        }

        function summaryHtml(ver, status) {
            var msgs = CONTACTS.messengers.map(function (m) { return link(m.url, m.name, 'rkrs-cmf-msg rkrs-cmf-msg-' + m.key); }).join('');
            // Сервер не подтвердил — красный блок сверху, то же слово, что в полосе карточки (Максим 27.11.2026:
            // переавторизация = установка по ссылке). ~~«Требуется переустановка» / «Восстановить виджет»~~ — устарело (было до 27.11.2026).
            var reinstall = status === 'error' && isAdmin()
                ? '<div class="rkrs-cmf-block rkrs-cmf-bad"><h2>Виджет выключен: нужна переавторизация</h2>' +
                  '<p>Чтобы названия полей снова были видны целиком, переавторизуйте виджет. Это займёт минуту.</p>' +
                  '<p>' + link(Access.REINSTALL_URL, 'Переавторизоваться', 'rkrs-cmf-restore') + '</p></div>'
                : '';
            return '<section class="rkrs-cmf-sum">' + reinstall +
                '<div class="rkrs-cmf-block"><h2>Настраивать ничего не нужно</h2>' +
                '<p class="rkrs-cmf-sub">В карточках сделок, контактов, компаний и покупателей названия полей видны целиком: ' +
                'длинное название переносится на следующую строку, а не обрезается.</p>' + memoHtml() + '</div>' +
                // Максим 27.11.2026: «как рекламка» — зашёл в окно виджета, вспомнил, что это, и нашёл остальные наши виджеты.
                '<div class="rkrs-cmf-block rkrs-cmf-more"><p>Ищите другие виджеты Ракурса в amoМаркете по запросу <b>«Ракурс»</b></p></div>' +
                '<div class="rkrs-cmf-block"><h3>Связаться с нами</h3>' +
                '<p class="rkrs-cmf-sub">Поможем настроить amoCRM под ваши задачи — напишите в любой мессенджер.</p>' +
                '<div class="rkrs-cmf-msgs">' + msgs + '</div>' +
                '<p class="rkrs-cmf-contacts">' + link('tel:' + CONTACTS.phoneHref, CONTACTS.phone) + ' · ' +
                link('mailto:' + CONTACTS.email, CONTACTS.email) + ' · ' + link(CONTACTS.site, 'rkrs.ru') + '</p></div>' +
                '<div class="rkrs-cmf-legal"><p>' + esc(CONTACTS.legal) + '</p>' +
                '<p>' + link(CONTACTS.policy, 'Политика конфиденциальности') + ' · Версия ' + esc(ver || '—') + '</p></div>' +
                '</section>';
        }

        function start() {
            includeCSS();
            startAccess();
            if (CARD_AREAS.indexOf(area()) !== -1) startCard(); else stopCard();
        }

        self.callbacks = {
            render: function () {
                start();
                return true;
            },

            init: function () {
                start();
                startPulse();
                return true;
            },

            bind_actions: function () {
                return true;
            },

            settings: function (modalBody) {
                includeCSS();
                var modal = modalBody && modalBody.jquery ? modalBody[0] : modalBody;
                if (!modal) return true;
                var old = modal.querySelector('.rkrs-cmf-settings');
                if (old) old.remove();

                // Поля формы (phone, name, countryName) amoCRM рисует сам — прячем: их заполняет форма активации.
                modal.querySelectorAll('.widget_settings_block__item_field').forEach(function (el) { el.style.display = 'none'; });

                // До активации — форма активации v3 для FREE (стандарт с 17.11.2026, эталон «Динамические поля»):
                // без листка «N дней», заголовок «Активация виджета». Форма шлёт телефон на ssd.rkrs.ru (/api/widget/install),
                // кладёт его в поля phone/name/countryName и сама нажимает «Сохранить» amoCRM.
                if (settingsSafe().active !== 'Y') {
                    ActivationForm.render('#widget_settings__fields_wrapper', {
                        appName: self.appName,
                        isPaid: false,
                        hasSettings: false
                    });
                    return true;
                }

                // Активирован — окно с контактами. Блок полей amoCRM не трогаем: в нём кнопка «Сохранить/Отключить».
                var wrap = document.createElement('div');
                wrap.className = 'rkrs-cmf-settings';
                wrap.innerHTML = summaryHtml(version(), accessStatus());
                summaryWrap = wrap;
                // Открыли окно виджета — переспрашиваем сервер сразу (например, только что переавторизовали).
                startAccess().refresh();
                var fields = modal.querySelector('.widget_settings_block__fields') || modal.querySelector('#widget_settings__fields_wrapper');
                if (fields && fields.parentNode) fields.parentNode.insertBefore(wrap, fields); else modal.appendChild(wrap);
                coreActivation().then(function (activated) {
                    if (activated || summaryWrap !== wrap || !wrap.isConnected) return;
                    summaryWrap = null;
                    wrap.innerHTML = '';
                    var saved = settingsSafe();
                    ActivationForm.render(wrap, {
                        appName: self.appName,
                        isPaid: false,
                        hasSettings: false,
                        onSubmit: coreActivation,
                        initialName: saved.name,
                        initialPhone: saved.phone
                    });
                }).catch(function () {
                    // The summary stays available while the contact status cannot be read.
                });
                return true;
            },

            onSave: function () {
                return true;
            },

            destroy: function () {
                stopCard();
                unmarkFields();
                window.removeEventListener('focus', refreshAfterOAuth);
                if (access) access.stop();
                access = null;
            }
        };

        return this;
    };
});
