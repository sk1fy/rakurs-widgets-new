define([
    'jquery',
    'module',
    './lib/activation.js',
    './lib/app/access.js',
    './lib/app/checklist.js',
    './lib/app/templates.js',
    './lib/app/filter-labels.js',
    './lib/app/help-ui.js'
], function ($, module, activation, createAccess, checklist, templates, createFilterLabels, helpUi) {
    return function () {
        var self = this;

        self.appName = 'rkrs_advanced_fields';
        self.widget_data = self.get_settings();
        self.accountId = window.APP.constant('account').id;

        var NS = '.rkrs_advanced_fields';
        var FIELD_SELECTOR = '.linked-forms__group-wrapper_main .linked-form__field, .company_contacts__list .linked-form__field';
        var HELP_INPUT_SELECTOR = '.card-cf__inner input[type="text"], .card-cf__inner input:not([type]), .card-cf__inner textarea';
        var HELP_CONTEXT_SELECTOR = '.rkrs-dfh';
        var OPTION_SELECTOR = [
            'option',
            '.control-select__option',
            '.control-select__list__item',
            '.control-select__list .control-select__list-item',
            '.control-select__list li',
            '.control--select--list--item',
            '.control-select-suggester__item'
        ].join(', ');

        var GROUP_HEADER_RE = /^\[([A-Za-zА-Яа-яЁё])([1234])(?:\s+\/([1-8])\/)?\]\s*/;
        var GROUP_MEMBER_RE = /^\[([A-Za-zА-Яа-яЁё])(?:\s+\/([1-8])\/)?\]\s*/;
        var TOOLTIP_RE = /\{::([^}]+)\}\s*$/;
        var FIELD_NOTE_RE = /\{:\s*([1-8])\s*=\s*([^}]+)\}\s*$/;
        var TEXTAREA_COLUMN_RE = /\{:\s*col\s*\}\s*$/i;
        // Поле-флаг чек-листа (1.0.150): «Квалификация — выполнено {:done К}» — галочку ставит виджет при 100 %.
        var DONE_SUFFIX_RE = /\s*\{:\s*done\s+([A-Za-zА-Яа-яЁё])\s*\}\s*$/i;
        var HIGHLIGHT_RE = /^\[\/([1-8])\/\]\s*/;
        var SWITCH_OPTION_RE = /^\[@([A-Za-zА-Яа-яЁё])\]\s*(.+)$/;
        var EXTERNAL_FORMULA_RE = /\s*\{\{=[\s\S]*?\}\}\s*$/;
        var HIGHLIGHT_COLORS = {
            1: '#e04444',
            2: '#35a76f',
            3: '#3f7fd8',
            4: '#d6ac16',
            5: '#e57a24',
            6: '#9b55c7',
            7: '#7d8994',
            8: '#6ea62e'
        };

        var state = {
            groups: {},
            observer: null,
            observerRoot: null,
            processTimer: null,
            validationGroupTimer: null,
            processing: false,
            needsReprocess: false,
            retryCount: 0,
            started: false,
            filterLabels: null,
            navBound: false,
            valueGroupExpansions: {},
            switcherSelections: {},
            switcherMetadata: {},
            checklistMetadata: {},
            checklistRefreshTimer: null,
            checklistManualStates: {},
            helpObserver: null,
            helpAnchor: null,
            helpSyncTimer: null,
            helpPanel: null,
            helpLastInput: null,
            helpTarget: null,
            helpFilter: 'group',
            templateRuns: {},
            helpStatus: null,
            helpCollapsed: false,
            helpLetter: 'Д',
            helpTipKind: 'hover',
            helpTimers: [],
            helpExampleTimers: [],
            helpExampleOpen: false,
            helpExampleSlide: 0,
            helpExamplePaused: false,
            wizard: null,
            gwizard: null,
            lwizard: null,
            vwizard: null,
            hwizard: null,
            twizard: null,
            helpGroups: null,
            helpGroupNames: null,
            helpGroupsLoading: false,
            helpPosition: null,
            startTimers: []
        };

        var settingsAccessHost = null;
        var modal = null;
        var form = null;
        var accessShown = { status: 'checking', paidTo: '' };
        function accessState() { return accessShown; }
        var access = createAccess(self, function (result) {
            accessShown = result;
            if (result.status === 'active') {
                startHelpObserver();
                start();
            } else {
                if (state.started || state.helpObserver || state.filterLabels) destroy();
                if (result.status === 'expired') startHelpObserver();
            }
            if (modal && modal.isConnected) renderSettings(modal);
            updateAccessUi();
        });

        var templateClient = templates.createClient(function (url, options) { return fetch(url, options); }, function () {
            return isActivated() && accessState().status === 'active';
        });

        function isActivated() {
            return accessShown.status === 'active' || accessShown.status === 'expired';
        }

        function requestStart() {
            if (self.get_settings().active !== 'Y') return;
            access.start();
            $(window).off('focus.rkrs_af_access').on('focus.rkrs_af_access', function () {
                access.refresh();
            });
            $(window).off('hashchange.rkrs_af_access popstate.rkrs_af_access')
                .on('hashchange.rkrs_af_access popstate.rkrs_af_access', function () {
                    start();
                    updateAccessUi();
                });
            if (isActivated()) startHelpObserver();
            start();
            updateAccessUi();
        }

        // Связь с Ракурсом и реквизиты — как в окне «Счётчика недозвонов» и в описании при установке (i18n/ru.json).
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
            // ЗАГЛУШКИ (Максим 06.11.2026): pay — потом ссылка на эквайринг; reinstall — ссылка переустановки (даст Максим).
            // Пока обе ведут в WhatsApp Ракурса.
            pay: 'https://wa.me/79214377886',
            reinstall: 'https://wa.me/79214377886',
            site: 'https://rkrs.ru/?utm_source=amocrm&utm_medium=widget&utm_campaign=dynamic_fields&utm_content=settings',
            policy: 'https://rkrs.ru/policy',
            legal: 'ИП Шумилов Максим Львович · ИНН 371501428560 · ОГРНИП 316370200076776'
        };

        // 2027-09-14 / 2027-09-14 00:00:00 → 14.09.2027; другой формат показываем как пришёл.
        function formatPaidTo(value) {
            var m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
            return m ? m[3] + '.' + m[2] + '.' + m[1] : String(value || '');
        }

        // Верхняя полоса сводки: срок доступа с сервера Ракурса, «Продлить» и «Восстановить виджет» (1.0.117).
        // Закончился или нет доступа — блок красный и объясняет, что выключено: первое, что видит администратор.
        function accessView() {
            var result = accessState();
            var date = formatPaidTo(result.paidTo);
            // «Продлён до» вместо «Оплачено до» (Максим 12.11.2026). Закончился срок — только «Продлить» и «Связаться с нами»;
            // «Восстановить виджет» — только когда слетел доступ (сценарий «нет доступа»).
            if (result.status === 'active') return { label: 'Доступ', value: date ? 'Продлён до ' + date : 'Активен', note: '', bad: false, pay: true, restore: false, contact: false };
            if (result.status === 'expired') {
                return {
                    label: date ? 'Доступ закончился ' + date : 'Доступ закончился',
                    value: 'Динамические поля выключены',
                    note: 'В карточках нет групп, подсветки, чек-листов и подсказок: поля показаны как в обычной amoCRM, маркеры видны в названиях. ' +
                        'Продлите — всё включится само, разметка полей сохранена.',
                    bad: true, pay: true, restore: false, contact: true
                };
            }
            if (result.status === 'error') {
                return {
                    label: 'Нет доступа',
                    value: 'Требуется переустановка виджета',
                    note: 'Сервер Ракурса не подтвердил доступ, Динамические поля выключены. Нажмите «Восстановить виджет» и переустановите его.',
                    bad: true, pay: false, restore: true, contact: false
                };
            }
            return { label: 'Продлён до', value: 'проверяем…', note: '', bad: false, pay: false, restore: false, contact: false };
        }

        function renderAccessStatus($host) {
            var view = accessView();
            var $info = $('<div>').append($('<span>').text(view.label)).append($('<b>').text(view.value));
            if (view.note) $info.append($('<small>').text(view.note));
            $host.empty().toggleClass('rkrs-df-sum-plan-bad', view.bad).append($info);
            var $btns = $('<div>').addClass('rkrs-df-sum-plan-btns');
            if (view.restore) {
                $('<a>').addClass('rkrs-df-sum-restore')
                    .attr({ href: CONTACTS.reinstall, target: '_blank', rel: 'noopener noreferrer' })
                    .text('Восстановить виджет').appendTo($btns);
            }
            if (view.contact) {
                // Ведёт к блоку «Связаться с нами» в этом же окне — если клиент хочет что-то обсудить.
                $('<a>').addClass('rkrs-df-sum-restore').attr('href', '#')
                    .text('Связаться с нами')
                    .on('click', function (e) {
                        e.preventDefault();
                        var target = $host.closest('.rkrs-df-sum').find('.rkrs-df-sum-contact-block')[0];
                        if (!target) return;
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // Блок мигает цветом три раза, когда прокрутка доехала (Максим 12.11.2026).
                        var $target = $(target).removeClass('rkrs-df-sum-flash');
                        setTimeout(function () {
                            void target.offsetWidth;
                            $target.addClass('rkrs-df-sum-flash');
                            setTimeout(function () { $target.removeClass('rkrs-df-sum-flash'); }, 2000);
                        }, 450);
                    })
                    .appendTo($btns);
            }
            if (view.pay) {
                $('<a>').addClass('rkrs-df-sum-pay')
                    .attr({ href: CONTACTS.pay, target: '_blank', rel: 'noopener noreferrer' })
                    .text('Продлить').appendTo($btns);
            }
            if ($btns.children().length) $btns.appendTo($host);
        }

        // Пояснение в карточке, пока поля выключены (1.0.117): без него менеджер видит сырые маркеры «[В1] …» и не понимает почему.
        // Администратору — ссылка «Оплатить» / «Переустановить», остальным — «Сообщите администратору amoCRM».
        var noticeObserver = null;
        var noticeTimer = null;
        function isAccountAdmin() {
            try {
                var rights = window.APP.constant('user_rights') || {};
                return [true, 1, '1', 'Y'].indexOf(rights.is_admin) !== -1 || [true, 1, '1', 'Y'].indexOf(rights.is_owner) !== -1;
            } catch (e) {
                return false;
            }
        }

        function noticeMessage() {
            var status = accessState().status;
            var admin = isAccountAdmin();
            if (status === 'expired') {
                return admin
                    ? { text: 'Динамические поля выключены: закончился срок доступа. После продления всё включится само.', href: CONTACTS.pay, link: 'Продлить' }
                    : { text: 'Динамические поля выключены: закончился срок доступа. Сообщите администратору amoCRM.' };
            }
            if (status === 'error') {
                return admin
                    ? { text: 'Динамические поля: требуется переустановка виджета.', href: CONTACTS.reinstall, link: 'Переустановить' }
                    : { text: 'Динамические поля не работают: требуется переустановка виджета. Сообщите администратору amoCRM.' };
            }
            return null;
        }

        function syncNotice() {
            var message = isActivated() && isCardArea() ? noticeMessage() : null;
            if (!message) {
                $('.rkrs-df-off').remove();
                if (noticeObserver) noticeObserver.disconnect();
                noticeObserver = null;
                return;
            }
            var host = document.querySelector('.linked-forms__group-wrapper_main');
            var $current = $('.rkrs-df-off');
            var key = message.text;
            if (host && !($current.length === 1 && $current[0].parentNode === host && $current.attr('data-text') === key)) {
                $current.remove();
                var $notice = $('<div>').addClass('rkrs-df-off')
                    .attr({ role: 'status', 'data-text': key }).text(message.text);
                if (message.href) {
                    $notice.append(' ').append($('<a>').attr({ href: message.href, target: '_blank', rel: 'noopener noreferrer' }).text(message.link));
                }
                host.insertBefore($notice[0], host.firstChild);
            }
            // amoCRM перерисовывает карточку без перезагрузки — следим, пока поля выключены.
            if (!noticeObserver && typeof MutationObserver !== 'undefined') {
                noticeObserver = new MutationObserver(function () {
                    if (noticeTimer) return;
                    noticeTimer = setTimeout(function () { noticeTimer = null; syncNotice(); }, 300);
                });
                noticeObserver.observe(document.body, { childList: true, subtree: true });
            }
        }

        function stopNotice() {
            if (noticeObserver) noticeObserver.disconnect();
            noticeObserver = null;
            if (noticeTimer) clearTimeout(noticeTimer);
            noticeTimer = null;
            $('.rkrs-df-off').remove();
        }

        function updateAccessUi() {
            if (settingsAccessHost) renderAccessStatus(settingsAccessHost);
            renderHelpAccess();
            syncNotice();
        }

        function currentAreaFromUrl() {
            var path = '';
            try {
                path = String(window.location.href || '') + ' ' + String(window.location.hash || '');
            } catch (e) {
                return '';
            }

            if (/\/leads\/detail\//.test(path)) {
                return 'lcard';
            }
            if (/\/contacts\/detail\//.test(path)) {
                return 'ccard';
            }
            if (/\/companies\/detail\//.test(path)) {
                return 'comcard';
            }
            if (/\/customers\/detail\//.test(path)) {
                return 'cucard';
            }
            return '';
        }

        function isCardArea() {
            var area = '';
            try {
                area = self.system().area || '';
            } catch (e) {}
            if (['lcard', 'ccard', 'comcard', 'cucard'].indexOf(area) !== -1) {
                return true;
            }
            return currentAreaFromUrl() !== '';
        }

        function getWidgetAssetPath(assetPath) {
            var base = self.params && (self.params.path || self.params.cdn_path);
            return new URL(assetPath, new URL(base ? base.replace(/\/$/, '') + '/' : module.uri, document.baseURI)).href;
        }

        function includeCSS() {
            var version = '';
            try {
                version = typeof self.get_version === 'function' ? String(self.get_version() || '') : '';
            } catch (e) {}
            var href = getWidgetAssetPath('style.css') + (version ? '?v=' + encodeURIComponent(version) : '');
            var existing = document.getElementById('rkrs-advanced-fields-style');
            if (existing) {
                if (existing.getAttribute('href') !== href) {
                    existing.setAttribute('href', href);
                }
                return;
            }

            $('<link>', {
                id: 'rkrs-advanced-fields-style',
                rel: 'stylesheet',
                type: 'text/css',
                href: href
            }).appendTo('head');
        }

        function normalizeGroupKey(key) {
            return String(key || '').toUpperCase();
        }

        function getLabelSpan($field) {
            var $label = $field.find('.linked-form__field__label').first();
            var $owned = $label.find('.rkrs-cf-label-text').first();
            if ($owned.length) {
                return $owned;
            }
            var $span = $label.find('span')
                .not('.rkrs-cf-chevron, .rkrs-cf-tooltip, .rkrs-cf-formula-sink, .rkrs-formula-badge')
                .first();
            if ($span.length) {
                return $span;
            }
            return $label;
        }

        function labelHasMarkers(text) {
            var label = String(text || '').trim();
            label = label.replace(EXTERNAL_FORMULA_RE, '').trim();
            return GROUP_HEADER_RE.test(label) ||
                GROUP_MEMBER_RE.test(label) ||
                TOOLTIP_RE.test(label) ||
                FIELD_NOTE_RE.test(label) ||
                TEXTAREA_COLUMN_RE.test(label) ||
                DONE_SUFFIX_RE.test(label) ||
                checklist.hasMarkers(label) ||
                HIGHLIGHT_RE.test(label);
        }

        function collectLabelCandidates($field) {
            var values = [];
            var formulaOriginal = $field.attr('data-rkrs-formula-original-label');
            if (formulaOriginal) {
                values.push(String(formulaOriginal));
            }
            var cached = $field.data('rkrs_cf_original_label');
            if (cached) {
                values.push(String(cached));
            }

            var $label = $field.find('.linked-form__field__label').first();
            if ($label.length) {
                if ($label.attr('title')) {
                    values.push(String($label.attr('title')));
                }
                $label.find('span')
                    .not('.rkrs-cf-chevron, .rkrs-cf-tooltip, .rkrs-cf-formula-sink, .rkrs-formula-badge')
                    .each(function () {
                    var $el = $(this);
                    values.push($el.text());
                    if ($el.attr('title')) {
                        values.push(String($el.attr('title')));
                    }
                });
            }

            return values;
        }

        function getOriginalLabel($field) {
            var candidates = collectLabelCandidates($field);
            var i;
            for (i = 0; i < candidates.length; i++) {
                var value = String(candidates[i] || '').trim();
                if (labelHasMarkers(value)) {
                    $field.data('rkrs_cf_original_label', value);
                    return value;
                }
            }

            var cached = $field.data('rkrs_cf_original_label');
            if (cached !== undefined) {
                return cached;
            }

            var fallback = candidates.length ? String(candidates[candidates.length - 1] || '').trim() : '';
            $field.data('rkrs_cf_original_label', fallback);
            return fallback;
        }

        function setVisibleLabel($field, text) {
            var $label = $field.find('.linked-form__field__label').first();
            if (!$label.length) {
                return;
            }

            var visibleText = String(text || '').trim();
            var originalText = String($field.data('rkrs_cf_original_label') || '').trim();
            var originalVisibleText = originalText;

            if (originalText && labelHasMarkers(originalText)) {
                originalVisibleText = parseFieldLabel(originalText).label;
            }

            var hasExternalFormula = EXTERNAL_FORMULA_RE.test(originalText);
            var formulaLabel = hasExternalFormula ? originalText.replace(EXTERNAL_FORMULA_RE, '').trim() : '';
            var $spans = $label.find('span')
                .not('.rkrs-cf-chevron, .rkrs-cf-tooltip, .rkrs-cf-formula-sink, .rkrs-formula-badge');
            var $span = $spans.first();
            if ($span.length) {
                $span.addClass('rkrs-cf-label-text').attr('data-rkrs-cf-label-owner', 'dynamic-fields');
                $span.text(text);
                $span.removeAttr('title');

                // Some amoCRM card layouts render the field name in two nested
                // spans. Rewriting only the first one leaves the clean name next
                // to its duplicate (for example, "Link Link"). Empty only spans
                // that contain another representation of this field label and
                // leave unrelated controls/icons intact.
                $spans.not($span).each(function () {
                    var $candidate = $(this);
                    var candidateText = $candidate.text().trim();
                    var candidateTitle = String($candidate.attr('title') || '').trim();
                    var isDuplicate = candidateText && (
                        candidateText === visibleText ||
                        candidateText === originalText ||
                        candidateText === originalVisibleText ||
                        labelHasMarkers(candidateText) ||
                        candidateTitle === originalText ||
                        candidateTitle === originalVisibleText
                    );

                    if (isDuplicate) {
                        $candidate.empty().removeAttr('title');
                    }
                });

                $label.contents().filter(function () {
                    return this.nodeType === 3 && String(this.nodeValue || '').trim() !== '';
                }).remove();
            } else {
                $label.contents().filter(function () {
                    return this.nodeType === 3;
                }).remove();
                $span = $('<span>')
                    .addClass('rkrs-cf-label-text')
                    .attr('data-rkrs-cf-label-owner', 'dynamic-fields')
                    .text(text)
                    .prependTo($label);
            }

            if (hasExternalFormula) {
                var $sink = $label.find('.rkrs-cf-formula-sink').first();
                if (!$sink.length) {
                    $sink = $('<span>')
                        .addClass('rkrs-cf-formula-sink')
                        .attr({ 'aria-hidden': 'true', 'data-rkrs-cf-foreign-owner': 'formula-fields' })
                        .appendTo($label);
                }
                $sink.text(formulaLabel);
            }

            $label.removeAttr('title');
            $field.removeAttr('title');
        }

        function parseFieldLabel(originalLabel) {
            var label = String(originalLabel || '').trim();
            var result = {
                label: label,
                groupKey: null,
                groupMode: null,
                groupRole: null,
                tooltip: null,
                note: null,
                noteColor: null,
                textareaColumn: false,
                checklist: false,
                percent: false,
                tag: null,
                advice: null,
                highlight: null
            };

            // Formula suffixes belong to another widget. Preserve the complete
            // CRM name in the cache, but do not render that suffix in our label.
            label = label.replace(EXTERNAL_FORMULA_RE, '').trim();

            // Tooltip and field-note suffixes can be combined in either order.
            // Peel them from the end before parsing the leading group/color markers.
            var suffixFound = true;
            while (suffixFound) {
                suffixFound = false;
                var checklistSuffix = checklist.peelSuffix(label);
                if (checklistSuffix) {
                    label = checklistSuffix.label;
                    ['checklist', 'percent', 'tag', 'advice'].forEach(function (key) {
                        if (checklistSuffix[key]) result[key] = checklistSuffix[key];
                    });
                    suffixFound = true;
                    continue;
                }
                var tipMatch = label.match(TOOLTIP_RE);
                if (tipMatch) {
                    result.tooltip = tipMatch[1].trim();
                    label = label.replace(TOOLTIP_RE, '').trim();
                    suffixFound = true;
                    continue;
                }

                var noteMatch = label.match(FIELD_NOTE_RE);
                if (noteMatch) {
                    result.noteColor = noteMatch[1];
                    result.note = noteMatch[2].trim();
                    label = label.replace(FIELD_NOTE_RE, '').trim();
                    suffixFound = true;
                    continue;
                }

                var doneMatch = label.match(DONE_SUFFIX_RE);
                if (doneMatch) {
                    result.doneKey = doneMatch[1].toUpperCase();
                    label = label.replace(DONE_SUFFIX_RE, '').trim();
                    suffixFound = true;
                    continue;
                }

                if (TEXTAREA_COLUMN_RE.test(label)) {
                    result.textareaColumn = true;
                    label = label.replace(TEXTAREA_COLUMN_RE, '').trim();
                    suffixFound = true;
                }
            }

            var headerMatch = label.match(GROUP_HEADER_RE);
            if (headerMatch) {
                result.groupKey = normalizeGroupKey(headerMatch[1]);
                result.groupMode = headerMatch[2];
                result.groupRole = 'header';
                result.highlight = headerMatch[3] || null;
                label = label.replace(GROUP_HEADER_RE, '').trim();
            } else {
                var memberMatch = label.match(GROUP_MEMBER_RE);
                if (memberMatch) {
                    result.groupKey = normalizeGroupKey(memberMatch[1]);
                    result.groupRole = 'member';
                    result.highlight = memberMatch[2] || null;
                    label = label.replace(GROUP_MEMBER_RE, '').trim();
                }
            }

            // Standalone color markers are valid only for fields that do not
            // already use group brackets. Grouped fields must use [X /3/]
            // or [X3 /3/] so there is a single marker block.
            if (!result.groupRole) {
                var highlightMatch = label.match(HIGHLIGHT_RE);
                if (highlightMatch) {
                    result.highlight = highlightMatch[1];
                    label = label.replace(HIGHLIGHT_RE, '').trim();
                }
            }

            result.label = label;
            return result;
        }

        function removeWidgetMarkers(value) {
            var original = String(value || '');
            var formula = original.match(EXTERNAL_FORMULA_RE);
            var label = formula ? original.substring(0, formula.index) : original;
            var before = label;
            // Only these tokens belong to this widget. Keep foreign formulas intact.
            label = label.replace(/\s*(?:\{::[^}]*\}|\{:\s*[1-8]\s*=\s*[^}]*\}|\{:\s*(?:col|checklist|percent)\s*\}|\{:\s*tag\s+[^}]+\}|\{:\s*done\s+[A-Za-zА-Яа-яЁё]\s*\}|\{![^}]*\})\s*/gi, ' ');
            var prefix = /^\s*(?:\[[A-Za-zА-Яа-яЁё][1234]?(?:\s+\/[1-8]\/)?\]|\[@[A-Za-zА-Яа-яЁё]\]|\[[+-]\]|\[\/[1-8]\/\])\s*/;
            while (prefix.test(label)) label = label.replace(prefix, '');
            if (label === before) return original;
            label = label.trim();
            if (!formula) return label;
            if (!label) return formula[0].replace(/^\s+/, '');
            return label + (/^\s/.test(formula[0]) ? '' : ' ') + formula[0];
        }

        function applyHighlight($field, color) {
            if (!color) {
                return;
            }
            $field.addClass('rkrs-cf-highlight rkrs-cf-highlight-' + color);
        }

        function getGroupAccentClass(color) {
            return 'rkrs-cf-group-accent-' + (color || 'default');
        }

        function applyTooltip($field, text, showIcon) {
            if (!text) {
                return;
            }

            var $span = getLabelSpan($field);
            if (!$span.length) {
                return;
            }

            $span.removeAttr('title');
            var $label = $span.closest('.linked-form__field__label');
            $label.removeAttr('title');
            $field.removeAttr('title');

            if (!showIcon) {
                $label.attr('title', text);
                return;
            }

            var $tooltip = $('<span>')
                .addClass('rkrs-cf-tooltip')
                .attr('data-tip', text)
                .attr('title', text)
                .attr('aria-label', text)
                .attr('tabindex', '0')
                .text('i');

            if ($label.length && $span.is($label)) {
                // Some amoCRM layouts render the label without an inner span.
                // Inserting after the fallback label puts the tooltip next to it;
                // group headers intentionally hide such sibling controls.
                $tooltip.appendTo($label);
            } else {
                $tooltip.insertAfter($span);
            }
        }

        function applyFieldNote($field, text, color) {
            if (!text || !color) {
                return;
            }

            $field.addClass('rkrs-cf-has-note');
            $('<div>')
                .addClass('rkrs-cf-field-note rkrs-cf-field-note-' + color)
                .attr('data-rkrs-cf-note-color', color)
                .text(text)
                .appendTo($field);
        }

        function applyTextareaColumn($field, enabled) {
            if (!enabled) {
                return;
            }

            var isTextarea = $field.find('.linked-form__field__value textarea, textarea').length > 0;
            if (isTextarea) {
                $field.addClass('rkrs-cf-textarea-column');
            }
        }

        function getEntityScope() {
            try {
                var hash = window.location.hash || '';
                var match = hash.match(/\/(?:leads|contacts|companies|customers)\/detail\/(\d+)/);
                if (match && match[1]) {
                    return match[1];
                }
            } catch (e) {}
            return 'unknown';
        }

        function getStorageKey(group) {
            return 'rkrs_cf_group_' + getEntityScope() + '_' + group.key;
        }

        function getChecklistStateKey(group) {
            return window.location.pathname + window.location.hash + '_' + getStorageKey(group) + '_' +
                (group.$header.find('[name]').first().attr('name') || group.sourceIndex);
        }

        function applyChecklistManualState(group) {
            var manual = state.checklistManualStates[getChecklistStateKey(group)];
            if (manual && manual.signature === group.checklistSignature) group.collapsed = manual.collapsed;
        }

        function loadGroupState(group) {
            if (group.mode === '2' || group.mode === '4') {
                return null;
            }
            try {
                return sessionStorage.getItem(getStorageKey(group));
            } catch (e) {
                return null;
            }
        }

        function saveGroupState(group) {
            if (group.mode === '2' || group.mode === '4') {
                return;
            }
            try {
                sessionStorage.setItem(getStorageKey(group), group.collapsed ? 'collapsed' : 'expanded');
            } catch (e) {}
        }

        function hasValueGroupExpansion(group) {
            return !!state.valueGroupExpansions[getStorageKey(group)];
        }

        function setValueGroupExpansion(group, expanded) {
            var key = getStorageKey(group);
            if (expanded) {
                state.valueGroupExpansions[key] = true;
            } else {
                delete state.valueGroupExpansions[key];
            }
        }

        function fieldHasValue($field) {
            var $value = $field.find('.linked-form__field__value');
            var $controls = $value.find('input, textarea, select');
            var hasValue = false;

            if ($controls.length) {
                $controls.each(function () {
                    var el = this;
                    var type = String(el.type || '').toLowerCase();

                    if (type === 'checkbox' || type === 'radio') {
                        if (el.checked) {
                            hasValue = true;
                            return false;
                        }
                        return;
                    }

                    var value = $(el).val();
                    if (value === null || value === undefined) {
                        return;
                    }

                    if (Array.isArray(value)) {
                        if (value.length > 0) {
                            hasValue = true;
                            return false;
                        }
                    } else if (String(value).trim() !== '') {
                        if ($(el).is('select') && String(value) === '0') {
                            return;
                        }
                        hasValue = true;
                        return false;
                    }
                });
            } else {
                var text = $value.text().trim();
                hasValue = !!(text && text !== '...' && text !== '—' && text !== '-' && text !== 'Не заполнено');
            }

            return hasValue;
        }

        function groupHasValue(group) {
            var hasValue = false;
            group.$members.each(function () {
                if (fieldHasValue($(this))) {
                    hasValue = true;
                    return false;
                }
            });
            return hasValue;
        }

        function groupAllFieldsHaveValue(group) {
            if (group.checklist) {
                return group.checklistSummary && group.checklistSummary.complete;
            }
            if (!group.$members.length) {
                return false;
            }

            var allHaveValue = true;
            group.$members.each(function () {
                if (!fieldHasValue($(this))) {
                    allHaveValue = false;
                    return false;
                }
            });
            return allHaveValue;
        }

        function checklistOptionText($element) {
            var text = $element.text().trim();
            return text === $element.attr('data-rkrs-cf-checklist-clean-text')
                ? $element.attr('data-rkrs-cf-original-text') || text : text;
        }

        function cleanChecklistOption($element, original, clean) {
            if (original === clean || $element.text().trim() === clean) return;
            $element.attr('data-rkrs-cf-original-text', original)
                .attr('data-rkrs-cf-checklist-clean-text', clean);
            setOptionVisibleText($element, clean);
        }

        function loadChecklistMetadata($field) {
            var info = getCustomFieldMetadataInfo($field, true);
            if (!info) return null;
            var path = info.path.split('?')[0] + '/' + info.id;
            if (!state.checklistMetadata[path]) {
                var entry = { loading: true, field: null };
                state.checklistMetadata[path] = entry;
                fetch(path, { credentials: 'same-origin' })
                    .then(function (response) {
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json();
                    })
                    .then(function (field) { entry.field = field; })
                    .catch(function () { entry.failed = true; })
                    .finally(function () {
                        entry.loading = false;
                        scheduleChecklistRefresh();
                    });
            }
            return state.checklistMetadata[path];
        }

        function readChecklistItem($field) {
            var parsed = parseFieldLabel(getOriginalLabel($field));
            var item = {
                $field: $field, label: parsed.label, tag: parsed.tag,
                status: 'pending'
            };
            var $value = $field.find('.linked-form__field__value').first();
            var isChoice = $field.is('.linked-form__field-select, .linked-form__field-radiobutton, .linked-form__field-multiselect') ||
                $value.find('select, input[type="radio"], .control--select, .control-select').length > 0;
            if (!isChoice || $field.hasClass('linked-form__field-multiselect') || $value.find('select[multiple]').length) {
                item.unsupported = true;
                return item;
            }

            var metadata = loadChecklistMetadata($field);
            if (metadata && metadata.field && ['select', 'radiobutton'].indexOf(metadata.field.type) === -1) {
                item.unsupported = true;
                return item;
            }
            var options = [];
            var byId = Object.create(null);
            function remember(id, rawText) {
                if (id !== undefined && byId[String(id)]) return byId[String(id)];
                var option = checklist.parseOption(rawText);
                options.push(option);
                if (id !== undefined && id !== null && String(id) !== '') byId[String(id)] = option;
                return option;
            }
            var enums = metadata && metadata.field && metadata.field.enums || [];
            for (var i = 0; i < enums.length; i++) remember(enums[i].id, enums[i].value);

            $field.find(OPTION_SELECTOR).each(function () {
                var $option = $(this);
                var original = checklistOptionText($option);
                var id = $option.is('option') ? $option.val() :
                    $option.attr('data-value') || $option.attr('data-id');
                var option = remember(id, original);
                if (option.marked || option.advice) cleanChecklistOption($option, original, option.label);
            });
            $field.find('input[type="radio"]').each(function () {
                var $input = $(this);
                var $text = $input.closest('.control-radio__label').find('.control-radio-label-text').first();
                if (!$text.length) return;
                var original = checklistOptionText($text);
                var option = remember($input.val(), original);
                $input.closest('.control-radio__label').attr('data-rkrs-cf-checklist-option-status', option.status);
                if (option.marked || option.advice) cleanChecklistOption($text, original, option.label);
            });

            // Only read the committed input. A dropdown click can precede amoCRM's update.
            var $select = $value.find('select').first();
            var $radio = $value.find('input[type="radio"]:checked').first();
            var $hidden = $value.find('input[type="hidden"][name]').filter(function () {
                return /CFV\[\d+\]/.test(this.name);
            }).first();
            var selectedId = $select.length ? $select.val() : $radio.length ? $radio.val() : $hidden.val();
            var selected = !Array.isArray(selectedId) && selectedId !== undefined ? byId[String(selectedId)] : null;
            var $button = $value.find('.control--select--button, .control-select__button').first();
            if (!selected && !$select.length && !$radio.length && !$hidden.length && $button.length) {
                var buttonText = checklist.parseOption(checklistOptionText($button));
                var matches = options.filter(function (option) { return option.label === buttonText.label; });
                // An ambiguous clean label must never count as a different enum.
                if (matches.length && matches.every(function (option) {
                    return option.status === matches[0].status && option.advice === matches[0].advice;
                })) selected = matches[0];
                else if (buttonText.marked) selected = buttonText;
            }
            if (selected) {
                item.status = selected.status;
                item.answerAdvice = selected.advice;
            } else if (metadata && metadata.loading) {
                item.loading = true;
            } else if (metadata && metadata.failed) {
                item.metadataFailed = true;
            }
            if ($button.length) {
                var originalButton = checklistOptionText($button);
                var cleanButton = checklist.parseOption(originalButton);
                if (cleanButton.marked || cleanButton.advice) {
                    cleanChecklistOption($button, originalButton, cleanButton.label);
                }
            }
            return item;
        }

        function renderChecklist(group) {
            var items = [];
            group.$members.each(function () { items.push(readChecklistItem($(this))); });
            var validItems = items.filter(function (item) { return !item.unsupported; });
            var unsupported = items.filter(function (item) { return item.unsupported; });
            var summary = checklist.summarize(validItems);
            summary.complete = summary.complete && !unsupported.length;
            group.checklistSummary = summary;
            group.checklistSignature = items.map(function (item) { return item.unsupported ? 'unsupported' : item.status; }).join('|');
            var $label = group.$header.find('.linked-form__field__label').first();
            var $progress = $label.children('.rkrs-cf-checklist-progress');
            if (!$progress.length) $progress = $('<div>').addClass('rkrs-cf-checklist-progress').appendTo($label);
            $progress.empty();
            var $track = $('<div>').addClass('rkrs-cf-checklist-track').attr({
                role: 'progressbar', 'aria-label': 'Выполнение чек-листа',
                'aria-valuemin': 0, 'aria-valuemax': summary.total || 1, 'aria-valuenow': summary.done
            });
            var statusLabels = { done: 'Выполнено', pending: 'Не выяснено', blocked: 'Блокер' };
            items.forEach(function (item) {
                if (!item.unsupported) {
                    $('<span>').addClass('rkrs-cf-checklist-segment is-' + item.status)
                        .attr('title', (item.tag || item.label) + ': ' + statusLabels[item.status]).appendTo($track);
                }
                var $indicator = item.$field.find('.linked-form__field__label > .rkrs-cf-checklist-indicator');
                if (!$indicator.length) $indicator = $('<span>').addClass('rkrs-cf-checklist-indicator')
                    .prependTo(item.$field.find('.linked-form__field__label').first());
                var itemStatus = item.unsupported ? 'unsupported' : item.status;
                var statusLabel = item.unsupported ? 'Нужен тип «Список» или «Переключатель». Поле не учитывается.' : statusLabels[item.status];
                $indicator.attr({ 'data-status': itemStatus, title: statusLabel, 'aria-label': statusLabel })
                    .text(item.unsupported ? '!' : item.status === 'done' ? '✓' : item.status === 'blocked' ? '!' : '?');
                item.$field.addClass('rkrs-cf-checklist-member')
                    .toggleClass('rkrs-cf-checklist-radio-column', !item.unsupported &&
                        (item.$field.hasClass('linked-form__field-radiobutton') ||
                        item.$field.find('.linked-form__field__value input[type="radio"]').length > 0))
                    .toggleClass('rkrs-cf-checklist-blocked', item.status === 'blocked');
            });
            $progress.append($track).append($('<span>').addClass('rkrs-cf-checklist-count')
                .text(summary.percent + '%')
                .attr('title', 'Выполнено: ' + summary.done + ' из ' + summary.total +
                    (summary.blocked ? '. Блокеров: ' + summary.blocked : '')));
            group.$header.addClass('rkrs-cf-checklist-header')
                .toggleClass('rkrs-cf-checklist-blocked', summary.blocked > 0)
                .toggleClass('rkrs-cf-checklist-complete', summary.complete);
            group.$header.attr('data-rkrs-cf-checklist-state', summary.blocked ? 'blocked' :
                summary.complete ? 'done' : summary.done ? 'progress' : 'pending');
            var $advice = group.$header.children('.rkrs-cf-checklist-advice');
            if (!$advice.length) $advice = $('<div>').addClass('rkrs-cf-checklist-advice').appendTo(group.$header);
            $advice.empty();
            var adviceItems = checklist.getAdviceItems(validItems, summary.next);
            adviceItems.forEach(function (item) {
                var $row = $('<div>').addClass(item.answerAdvice ? 'rkrs-cf-checklist-answer-advice' : 'rkrs-cf-checklist-message').appendTo($advice);
                if (validItems.length > 1) $row.append($('<b>').text((item.tag || item.label) + ': '));
                $row.append(document.createTextNode(item.answerAdvice || (item.loading ? 'Загружаем варианты поля…' :
                    'Не удалось загрузить варианты поля. Обновите карточку.')));
            });
            if (unsupported.length) {
                $advice.append($('<div>').addClass('rkrs-cf-checklist-warning').text('Не учитываются: ' +
                    unsupported.map(function (item) { return '«' + item.label + '»'; }).join(', ') +
                    '. Для пунктов чек-листа используйте тип «Список» или «Переключатель».'));
            }
            $advice.prop('hidden', !adviceItems.length && !unsupported.length);
            scheduleDoneFlag(group, items);
            return summary;
        }

        // ===== Чек-лист 100 % → поле-флаг (1.0.150) =====
        // Галочку ставим по СОХРАНЁННЫМ ответам: читаем сделку из API, а не карточку — несохранённые клики не считаются.
        // Поле «Только из API» принимает запись из браузера (проверено 17.11.2026). Запрет перехода на этап делает amoCRM.
        function doneEntity() {
            var area = '';
            try { area = self.system().area || ''; } catch (e) {}
            return { lcard: 'leads', ccard: 'contacts', comcard: 'companies', cucard: 'customers' }[area || currentAreaFromUrl()] || null;
        }

        function doneFieldsOf(entity) {
            state.doneFields = state.doneFields || {};
            if (!state.doneFields[entity]) {
                var fields = [];
                var load = function (page) {
                    return fetch('/api/v4/' + entity + '/custom_fields?limit=250&page=' + page, { credentials: 'same-origin' }).then(function (response) {
                        if (response.status === 204) return fields;
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json().then(function (payload) {
                            var batch = payload && payload._embedded && payload._embedded.custom_fields;
                            fields = fields.concat(Array.isArray(batch) ? batch : []);
                            return payload && payload._links && payload._links.next && page < 4 ? load(page + 1) : fields;
                        });
                    });
                };
                state.doneFields[entity] = load(1).catch(function () { delete state.doneFields[entity]; return []; });
            }
            return state.doneFields[entity];
        }

        function scheduleDoneFlag(group, items) {
            var entity = doneEntity();
            var recordId = getEntityScope();
            if (!entity || !/^\d+$/.test(recordId) || accessState().status !== 'active') return;
            state.doneTimers = state.doneTimers || {};
            var key = entity + ':' + recordId + ':' + group.key;
            clearTimeout(state.doneTimers[key]);
            state.doneTimers[key] = setTimeout(function () { syncDoneFlag(entity, recordId, group.key, items, key, 0); }, 1500);
        }

        function syncDoneFlag(entity, recordId, groupKey, items, key, attempt) {
            var ids = items.map(function (item) {
                var match = String(item.$field.find('input[name], select[name], textarea[name]').first().attr('name') || '').match(/CFV\[(\d+)\]/);
                return item.unsupported || !match ? null : Number(match[1]);
            });
            if (!ids.length || ids.indexOf(null) !== -1) return;
            doneFieldsOf(entity).then(function (fields) {
                var flag = fields.filter(function (field) {
                    var match = String(field.name || '').match(DONE_SUFFIX_RE);
                    return field.type === 'checkbox' && match && match[1].toUpperCase() === String(groupKey).toUpperCase();
                })[0];
                if (!flag) return null;
                var byId = {};
                fields.forEach(function (field) { byId[field.id] = field; });
                return fetch('/api/v4/' + entity + '/' + recordId, { credentials: 'same-origin' }).then(function (response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.json();
                }).then(function (record) {
                    var values = {};
                    (record.custom_fields_values || []).forEach(function (cf) { values[cf.field_id] = cf.values || []; });
                    var complete = ids.every(function (id) {
                        var chosen = (values[id] || [])[0];
                        var enumItem = chosen && (byId[id] && byId[id].enums || []).filter(function (item) { return item.id === chosen.enum_id; })[0];
                        return !!enumItem && checklist.parseOption(enumItem.value).status === 'done';
                    });
                    var current = !!((values[flag.id] || [])[0] || {}).value;
                    if (complete !== current) {
                        return fetch('/api/v4/' + entity + '/' + recordId, {
                            method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ custom_fields_values: [{ field_id: flag.id, values: [{ value: complete }] }] })
                        }).then(function () { return complete; });
                    }
                    return complete;
                });
            }).then(function (savedComplete) {
                if (savedComplete === null || savedComplete === undefined) return;
                // Карточка показывает 100 %, а в сохранённой сделке ещё нет — ждём «Сохранить» и проверяем снова (до 2 минут).
                var group = null;
                Object.keys(state.groups || {}).forEach(function (k) {
                    (state.groups[k] || []).forEach(function (g) { if (g.key === groupKey && g.checklist) group = g; });
                });
                var cardComplete = !!(group && group.checklistSummary && group.checklistSummary.complete);
                if (cardComplete !== savedComplete && attempt < 30 && getEntityScope() === recordId) {
                    state.doneTimers[key] = setTimeout(function () { syncDoneFlag(entity, recordId, groupKey, items, key, attempt + 1); }, 4000);
                }
            }).catch(function () {});
        }

        function scheduleChecklistRefresh() {
            if (!state.started || accessState().status !== 'active' || state.checklistRefreshTimer) return;
            state.checklistRefreshTimer = setTimeout(function () {
                state.checklistRefreshTimer = null;
                refreshValueBasedGroups();
            }, 30);
        }

        function registerGroup(group) {
            if (!state.groups[group.key]) {
                state.groups[group.key] = [];
            }
            state.groups[group.key].push(group);
        }

        function setGroupVisibleBySwitcher(group, visible) {
            group.switcherVisible = visible;
            applyGroupState(group);
        }

        function applyGroupState(group) {
            var switchHidden = group.switcherVisible === false;

            group.$header.toggleClass('rkrs-cf-switch-hidden', switchHidden);
            group.$members.toggleClass('rkrs-cf-switch-hidden', switchHidden);

            if (switchHidden) {
                return;
            }

            group.$header.toggleClass('rkrs-cf-group-collapsed', group.collapsed);
            group.$members.toggleClass('rkrs-cf-group-member-hidden', group.collapsed);
        }

        function initializeGroup(group) {
            var saved = loadGroupState(group);

            if (group.checklist) renderChecklist(group);

            if ((group.mode === '2' || group.mode === '4') && hasValueGroupExpansion(group)) {
                group.collapsed = false;
            } else if (group.mode === '2') {
                group.collapsed = !groupHasValue(group);
            } else if (group.mode === '4') {
                group.collapsed = groupAllFieldsHaveValue(group);
            } else if (saved === 'collapsed' || saved === 'expanded') {
                group.collapsed = saved === 'collapsed';
            } else {
                group.collapsed = group.mode === '1';
            }

            if (group.checklist && group.checklistSummary.blocked && !saved) group.collapsed = false;
            if (group.checklist) applyChecklistManualState(group);

            applyGroupState(group);
        }

        function refreshValueBasedGroups() {
            if (accessState().status !== 'active') return;
            for (var key in state.groups) {
                if (!state.groups.hasOwnProperty(key)) {
                    continue;
                }

                for (var i = 0; i < state.groups[key].length; i++) {
                    var group = state.groups[key][i];
                    if (group.checklist) {
                        var wasBlocked = group.checklistSummary && group.checklistSummary.blocked;
                        var summary = renderChecklist(group);
                        if (summary.blocked && !wasBlocked) {
                            group.collapsed = false;
                            if (group.mode === '2' || group.mode === '4') setValueGroupExpansion(group, true);
                            else saveGroupState(group);
                        }
                    }
                    if ((group.mode === '2' || group.mode === '4') && hasValueGroupExpansion(group)) {
                        group.collapsed = false;
                        applyGroupState(group);
                    } else if (group.mode === '2') {
                        group.collapsed = !groupHasValue(group);
                        applyGroupState(group);
                    } else if (group.mode === '4') {
                        group.collapsed = groupAllFieldsHaveValue(group);
                        applyGroupState(group);
                    }
                    if (group.checklist) {
                        applyChecklistManualState(group);
                        applyGroupState(group);
                    }
                }
            }
        }

        function toggleGroup($header) {
            var group = $header.data('rkrs_cf_group_object');
            if (!group || group.switcherVisible === false) {
                return;
            }

            group.collapsed = !group.collapsed;
            if (group.checklist) {
                state.checklistManualStates[getChecklistStateKey(group)] = {
                    collapsed: group.collapsed, signature: group.checklistSignature
                };
            }
            if (group.mode === '2' || group.mode === '4') {
                // Keep a value-driven group open while its empty controls are
                // being edited. Opening an amoCRM custom select can rebuild
                // the field DOM before it commits a value.
                setValueGroupExpansion(group, !group.collapsed);
            }
            saveGroupState(group);
            applyGroupState(group);
        }

        function elementSignalsValidationError(element, includeRequired) {
            if (!element || element.nodeType !== 1) {
                return false;
            }

            var $element = $(element);
            if ($element.attr('aria-hidden') === 'true') {
                return false;
            }
            if ($element.attr('aria-invalid') === 'true' || $element.attr('data-invalid') === 'true') {
                return true;
            }

            var className = String(element.className || '');
            if (includeRequired && (
                $element.attr('aria-required') === 'true' ||
                $element.attr('data-required') === 'true' ||
                $element.attr('data-mandatory') === 'true' ||
                $element.is('[required]') ||
                /(^|[\s_-])(required|mandatory)([\s_-]|$)/i.test(className)
            )) {
                return true;
            }
            if (!/(^|[\s_-])(error|invalid)([\s_-]|$)/i.test(className) &&
                !/(^|\s)has-error(\s|$)/i.test(className)) {
                return false;
            }
            if (/(no-error|without-error|error-placeholder)/i.test(className)) {
                return false;
            }

            try {
                var computed = window.getComputedStyle(element);
                var hiddenByCollapsedGroup = $element.hasClass('rkrs-cf-group-member-hidden');
                if ((computed.display === 'none' && !hiddenByCollapsedGroup) || computed.visibility === 'hidden') {
                    return false;
                }
            } catch (e) {}
            return true;
        }

        function fieldHasValidationError($field, includeRequired) {
            var hasError = false;
            $field.find('*').addBack().each(function () {
                var text = String($(this).text() || '').replace(/\s+/g, ' ').trim();
                if (/\b\d+\s+из\s+\d+\b/i.test(text) ||
                    /обязательн(?:ое|ого|ые|ых)?\s+пол/i.test(text) ||
                    elementSignalsValidationError(this, includeRequired)) {
                    hasError = true;
                    return false;
                }
            });
            return hasError;
        }

        function expandGroupsWithValidationErrors() {
            if (accessState().status !== 'active') return;
            state.validationGroupTimer = null;
            var includeRequired = cardHasRequiredValidationCounter();
            $('.rkrs-cf-group-member').each(function () {
                var $field = $(this);
                if (!fieldHasValidationError($field, includeRequired)) {
                    return;
                }

                var group = $field.data('rkrs_cf_group_object');
                if (!group || !group.collapsed) {
                    return;
                }

                group.collapsed = false;
                if (group.mode === '2' || group.mode === '4') {
                    setValueGroupExpansion(group, true);
                } else {
                    saveGroupState(group);
                }
                applyGroupState(group);
            });
        }

        function cardHasRequiredValidationCounter() {
            var found = false;
            var $root = state.observerRoot ? $(state.observerRoot) : $('.card-holder, body').first();
            $root.find('*').each(function () {
                var text = String($(this).text() || '').replace(/\s+/g, ' ').trim();
                if (/\b\d+\s+из\s+\d+\b/i.test(text)) {
                    found = true;
                    return false;
                }
            });
            return found;
        }

        function mutationContainsRequiredValidationCounter(mutation) {
            var nodes = mutation.addedNodes || [];
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var text = String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
                if (/\b\d+\s+из\s+\d+\b/i.test(text)) {
                    return true;
                }
            }
            return false;
        }

        function scheduleValidationGroupCheck(delay) {
            if (state.validationGroupTimer) {
                clearTimeout(state.validationGroupTimer);
            }
            state.validationGroupTimer = setTimeout(
                expandGroupsWithValidationErrors,
                typeof delay === 'number' ? delay : 0
            );
        }

        function getSwitcherSignature($field) {
            var keys = ($field.data('rkrs_cf_switcher_keys') || []).slice();
            if (!keys.length) {
                return '';
            }
            keys = keys.map(normalizeGroupKey).sort();
            return getEntityScope() + ':' + keys.join('|');
        }

        function getSwitcherControllerId($field) {
            var controlName = $field.find('input[name], select[name], textarea[name]').first().attr('name');
            var fieldIdentity = controlName || $field.data('rkrs_cf_original_label') || getOriginalLabel($field);
            return getEntityScope() + ':' + String(fieldIdentity || 'unknown');
        }

        function setSwitcherSelection($field, selectedKey, rememberSelection) {
            var keys = $field.data('rkrs_cf_switcher_keys') || [];
            selectedKey = selectedKey ? normalizeGroupKey(selectedKey) : null;
            var signature = getSwitcherSignature($field);
            var controllerId = getSwitcherControllerId($field);

            if (signature) {
                if (rememberSelection) {
                    state.switcherSelections[signature] = {
                        controllerId: controllerId,
                        selectedKey: selectedKey
                    };
                } else if (state.switcherSelections.hasOwnProperty(signature)) {
                    var remembered = state.switcherSelections[signature];
                    if (!remembered || remembered.controllerId !== controllerId) {
                        return;
                    }
                    selectedKey = remembered.selectedKey;
                }
            }

            for (var i = 0; i < keys.length; i++) {
                var key = normalizeGroupKey(keys[i]);
                var groups = state.groups[key] || [];
                for (var j = 0; j < groups.length; j++) {
                    setGroupVisibleBySwitcher(groups[j], selectedKey === key);
                }
            }
        }

        function syncSwitcherSelection($field, expectedKey, attempt) {
            if (accessState().status !== 'active') return;
            attempt = attempt || 0;
            expectedKey = expectedKey ? normalizeGroupKey(expectedKey) : null;

            if (!$field.length || !$.contains(document.documentElement, $field[0])) {
                return;
            }

            scanSwitcherField($field);
            var actualKey = getCurrentSwitcherKey($field);
            if (actualKey && normalizeGroupKey(actualKey) === expectedKey) {
                setSwitcherSelection($field, actualKey, true);
                return;
            }

            if (attempt < 4) {
                setTimeout(function () {
                    syncSwitcherSelection($field, expectedKey, attempt + 1);
                }, 60 * (attempt + 1));
            }
        }

        function addSwitcherKey($field, key) {
            key = normalizeGroupKey(key);
            var keys = $field.data('rkrs_cf_switcher_keys') || [];
            if (keys.indexOf(key) === -1) {
                keys.push(key);
                $field.data('rkrs_cf_switcher_keys', keys);
            }
            $field.addClass('rkrs-cf-switcher-field');
        }

        function rememberSwitcherLabel($field, key, cleanText) {
            cleanText = String(cleanText || '').trim();
            if (!cleanText) {
                return;
            }

            var labels = $field.data('rkrs_cf_switcher_labels') || {};
            labels[cleanText] = normalizeGroupKey(key);
            $field.data('rkrs_cf_switcher_labels', labels);
        }

        function getCustomFieldMetadataInfo($field, anyType) {
            if (!anyType && !$field.hasClass('linked-form__field-select')) {
                return null;
            }

            var controlName = $field.find('input[name], select[name], textarea[name]').first().attr('name') || '';
            var idMatch = String(controlName).match(/CFV\[(\d+)\]/);
            if (!idMatch) {
                return null;
            }

            var area = '';
            try {
                area = self.system().area || '';
            } catch (e) {}
            if (!area) {
                area = currentAreaFromUrl();
            }

            var entityByArea = {
                lcard: 'leads',
                ccard: 'contacts',
                comcard: 'companies',
                cucard: 'customers'
            };
            var entity = entityByArea[area];
            return entity ? {
                id: idMatch[1],
                path: '/api/v4/' + entity + '/custom_fields?limit=250'
            } : null;
        }

        function applySwitcherMetadata($field, metadata) {
            var enums = metadata && Array.isArray(metadata.enums) ? metadata.enums : [];
            var found = false;

            for (var i = 0; i < enums.length; i++) {
                var text = String(enums[i].value || '').trim();
                var match = text.match(SWITCH_OPTION_RE);
                if (!match) {
                    continue;
                }

                var key = normalizeGroupKey(match[1]);
                var cleanText = match[2].trim();
                addSwitcherKey($field, key);
                rememberSwitcherLabel($field, key, cleanText);
                found = true;
            }

            return found;
        }

        function hydrateSwitcherMetadata($field) {
            var labels = $field.data('rkrs_cf_switcher_labels') || {};
            if (Object.keys(labels).length || $field.data('rkrs_cf_switcher_metadata_loading')) {
                return;
            }

            var info = getCustomFieldMetadataInfo($field);
            if (!info) {
                return;
            }

            $field.data('rkrs_cf_switcher_metadata_loading', true);
            if (!state.switcherMetadata[info.path]) {
                state.switcherMetadata[info.path] = fetch(info.path, { credentials: 'same-origin' })
                    .then(function (response) {
                        if (!response.ok) {
                            throw new Error('HTTP ' + response.status);
                        }
                        return response.json();
                    })
                    .then(function (payload) {
                        var fields = payload && payload._embedded && payload._embedded.custom_fields
                            ? payload._embedded.custom_fields
                            : [];
                        var byId = {};
                        for (var i = 0; i < fields.length; i++) {
                            byId[String(fields[i].id)] = fields[i];
                        }
                        return byId;
                    })
                    .catch(function () {
                        return {};
                    });
            }

            state.switcherMetadata[info.path]
                .then(function (metadataById) {
                    if (accessState().status !== 'active' || !state.started) return;
                    var metadata = metadataById[info.id] || {};
                    if (applySwitcherMetadata($field, metadata)) {
                        initializeSwitchers();
                    }
                })
                .finally(function () {
                    $field.removeData('rkrs_cf_switcher_metadata_loading');
                });
        }

        function rememberOptionText($option, text) {
            if ($option.attr('data-rkrs-cf-original-text') === undefined) {
                $option.attr('data-rkrs-cf-original-text', text);
            }
        }

        function setOptionVisibleText($option, cleanText) {
            if ($option.is('option')) {
                $option.text(cleanText);
                return;
            }

            var $inner = $option.find('span').first();
            if ($inner.length) {
                $inner.text(cleanText);
                if ($inner.attr('title') !== undefined) {
                    $inner.attr('title', cleanText);
                }
            } else {
                $option.text(cleanText);
            }
        }

        function scanSelectSwitcher($field) {
            var found = false;

            $field.find(OPTION_SELECTOR).each(function () {
                var $option = $(this);
                var existingKey = $option.attr('data-rkrs-cf-switch-key');
                if (existingKey) {
                    addSwitcherKey($field, existingKey);
                    rememberSwitcherLabel($field, existingKey, $option.text());
                    found = true;
                    return;
                }

                var text = ($option.text() || '').trim();
                var match = text.match(SWITCH_OPTION_RE);
                if (!match) {
                    return;
                }

                var key = normalizeGroupKey(match[1]);
                var cleanText = match[2].trim();

                rememberOptionText($option, text);
                $option.attr('data-rkrs-cf-switch-key', key);
                setOptionVisibleText($option, cleanText);
                addSwitcherKey($field, key);
                rememberSwitcherLabel($field, key, cleanText);
                found = true;
            });

            // amoCRM mirrors the selected option into a separate custom-select
            // button. Options can already be parsed while that button still
            // shows the raw "[@X]" prefix, especially after a full page reload.
            $field.find('.control--select--button, .control-select__button').each(function () {
                var $button = $(this);
                var storedText = $button.attr('data-rkrs-cf-original-text');
                var text = String(storedText !== undefined ? storedText : $button.text()).trim();
                var match = text.match(SWITCH_OPTION_RE);
                if (!match) {
                    return;
                }

                var key = normalizeGroupKey(match[1]);
                var cleanText = match[2].trim();

                rememberOptionText($button, text);
                $button.attr('data-rkrs-cf-switch-key', key);
                setOptionVisibleText($button, cleanText);
                addSwitcherKey($field, key);
                rememberSwitcherLabel($field, key, cleanText);
                found = true;
            });

            return found;
        }

        function updateRadioSwitcherButtons($field) {
            var selectedKey = null;
            var $checked = $field.find('input[type="radio"]:checked[data-rkrs-cf-switch-key]').first();
            if ($checked.length) {
                selectedKey = normalizeGroupKey($checked.attr('data-rkrs-cf-switch-key'));
            }

            $field.find('.rkrs-cf-switch-button').each(function () {
                var $button = $(this);
                var isActive = normalizeGroupKey($button.attr('data-rkrs-cf-switch-key')) === selectedKey;
                $button
                    .toggleClass('is-active', isActive)
                    .attr('aria-pressed', isActive ? 'true' : 'false');
            });
        }

        function enhanceRadioSwitcher($field) {
            var $inputs = $field.find('input[type="radio"][data-rkrs-cf-switch-key]');
            if (!$inputs.length) {
                return;
            }

            $field.find('.rkrs-cf-switch-buttons').remove();
            $field.addClass('rkrs-cf-radio-switcher');

            var $wrapper = $('<div>').addClass('rkrs-cf-switch-buttons');
            $inputs.each(function () {
                var $input = $(this);
                var $label = $input.closest('.control-radio__label');
                var text = $label.find('.control-radio-label-text').first().text().trim();
                var key = normalizeGroupKey($input.attr('data-rkrs-cf-switch-key'));

                $('<button>')
                    .attr('type', 'button')
                    .addClass('rkrs-cf-switch-button')
                    .attr('data-rkrs-cf-switch-key', key)
                    .attr('aria-pressed', 'false')
                    .text(text)
                    .appendTo($wrapper);
            });

            var $value = $field.find('.linked-form__field__value').first();
            $wrapper.appendTo($value.length ? $value : $field);
            updateRadioSwitcherButtons($field);
        }

        function scanRadioSwitcher($field) {
            var found = false;

            $field.find('.control-radio__label').each(function () {
                var $label = $(this);
                var $text = $label.find('.control-radio-label-text').first();
                var $input = $label.find('input[type="radio"]').first();

                if (!$text.length || !$input.length) {
                    return;
                }

                var existingKey = $input.attr('data-rkrs-cf-switch-key');
                if (existingKey) {
                    addSwitcherKey($field, existingKey);
                    rememberSwitcherLabel($field, existingKey, $text.text());
                    found = true;
                    return;
                }

                var text = ($text.text() || '').trim();
                var match = text.match(SWITCH_OPTION_RE);
                if (!match) {
                    return;
                }

                var key = normalizeGroupKey(match[1]);
                var cleanText = match[2].trim();

                if ($text.attr('data-rkrs-cf-original-text') === undefined) {
                    $text.attr('data-rkrs-cf-original-text', text);
                }
                $text.text(cleanText);
                $input.attr('data-rkrs-cf-switch-key', key);
                addSwitcherKey($field, key);
                rememberSwitcherLabel($field, key, cleanText);
                found = true;
            });

            if (found) {
                enhanceRadioSwitcher($field);
            }

            return found;
        }

        function scanSwitcherField($field) {
            var rememberedLabels = $field.data('rkrs_cf_switcher_labels') || {};
            for (var label in rememberedLabels) {
                if (rememberedLabels.hasOwnProperty(label)) {
                    addSwitcherKey($field, rememberedLabels[label]);
                }
            }
            scanSelectSwitcher($field);
            scanRadioSwitcher($field);
            hydrateSwitcherMetadata($field);
        }

        function scanAllSwitchers($fields) {
            $fields.each(function () {
                scanSwitcherField($(this));
            });
        }

        function getCurrentSwitcherKey($field) {
            var $selectedOption = $field.find('select option:selected[data-rkrs-cf-switch-key]').first();
            if ($selectedOption.length) {
                return $selectedOption.attr('data-rkrs-cf-switch-key');
            }

            var $selectedButton = $field.find(
                '.control--select--button, .control-select__button'
            ).first();
            if ($selectedButton.length) {
                var selectedText = $selectedButton.text().trim();
                var matchedKey = null;
                var switcherLabels = $field.data('rkrs_cf_switcher_labels') || {};

                if (switcherLabels[selectedText]) {
                    return switcherLabels[selectedText];
                }

                $field.find(OPTION_SELECTOR).each(function () {
                    var $option = $(this);
                    var optionText = $option.text().trim();
                    if (optionText === selectedText && $option.attr('data-rkrs-cf-switch-key')) {
                        matchedKey = $option.attr('data-rkrs-cf-switch-key');
                        return false;
                    }
                });

                if (matchedKey) {
                    return matchedKey;
                }
                return $selectedButton.attr('data-rkrs-cf-switch-key') || null;
            }

            var $selectedRadio = $field.find('input[type="radio"]:checked[data-rkrs-cf-switch-key]').first();
            if ($selectedRadio.length) {
                return $selectedRadio.attr('data-rkrs-cf-switch-key');
            }

            return null;
        }

        function initializeSwitchers() {
            $('.rkrs-cf-switcher-field').each(function () {
                var $field = $(this);
                setSwitcherSelection($field, getCurrentSwitcherKey($field), false);
            });
        }

        function restoreOptionTexts() {
            $('[data-rkrs-cf-original-text]').each(function () {
                var $el = $(this);
                var original = $el.attr('data-rkrs-cf-original-text');

                // A reused custom-select button may already show a newer choice.
                var checklistClean = $el.attr('data-rkrs-cf-checklist-clean-text');
                if (checklistClean !== undefined && $el.text().trim() !== checklistClean) {
                    $el.removeAttr('data-rkrs-cf-original-text data-rkrs-cf-checklist-clean-text');
                    return;
                }

                if ($el.is('option')) {
                    $el.text(original);
                } else if ($el.hasClass('control-radio-label-text')) {
                    $el.text(original);
                } else {
                    var $inner = $el.find('span').first();
                    if ($inner.length) {
                        $inner.text(original);
                        if ($inner.attr('title') !== undefined) {
                            $inner.attr('title', original);
                        }
                    } else {
                        $el.text(original);
                    }
                }

                $el.removeAttr('data-rkrs-cf-original-text');
                $el.removeAttr('data-rkrs-cf-checklist-clean-text');
                $el.removeAttr('data-rkrs-cf-switch-key');
            });

            $('[data-rkrs-cf-switch-key]').removeAttr('data-rkrs-cf-switch-key');
            $('[data-rkrs-cf-checklist-option-status]').removeAttr('data-rkrs-cf-checklist-option-status');
        }

        function cleanupEnhancements(restoreLabels) {
            $('.rkrs-cf-tooltip').remove();
            $('.rkrs-cf-field-note').remove();
            $('.rkrs-cf-chevron').remove();
            $('.rkrs-cf-group-dot').remove();
            $('.rkrs-cf-switch-buttons').remove();
            $('.rkrs-cf-checklist-progress, .rkrs-cf-checklist-advice, .rkrs-cf-checklist-indicator').remove();

            var $fields = $(FIELD_SELECTOR);
            $fields.each(function () {
                var $field = $(this);
                var $span = getLabelSpan($field);
                var current = $span.length ? $span.text().trim() : '';

                if (labelHasMarkers(current)) {
                    $field.data('rkrs_cf_original_label', current);
                } else if (restoreLabels && $field.data('rkrs_cf_rewritten')) {
                    var original = $field.data('rkrs_cf_original_label');
                    if (original !== undefined) {
                        setVisibleLabel($field, original);
                    }
                }

                $field.removeClass([
                    'rkrs-cf-processed',
                    'rkrs-cf-has-note',
                    'rkrs-cf-textarea-column',
                    'rkrs-cf-group-header',
                    'rkrs-cf-group-collapsed',
                    'rkrs-cf-group-member',
                    'rkrs-cf-group-member-last',
                    'rkrs-cf-group-empty',
                    'rkrs-cf-group-member-hidden',
                    'rkrs-cf-switch-hidden',
                    'rkrs-cf-switcher-field',
                    'rkrs-cf-radio-switcher',
                    'rkrs-cf-checklist-header',
                    'rkrs-cf-checklist-member',
                    'rkrs-cf-checklist-radio-column',
                    'rkrs-cf-checklist-blocked',
                    'rkrs-cf-checklist-complete',
                    'rkrs-cf-highlight',
                    'rkrs-cf-highlight-1',
                    'rkrs-cf-highlight-2',
                    'rkrs-cf-highlight-3',
                    'rkrs-cf-highlight-4',
                    'rkrs-cf-highlight-5',
                    'rkrs-cf-highlight-6',
                    'rkrs-cf-highlight-7',
                    'rkrs-cf-highlight-8',
                    'rkrs-cf-group-accent-default',
                    'rkrs-cf-group-accent-1',
                    'rkrs-cf-group-accent-2',
                    'rkrs-cf-group-accent-3',
                    'rkrs-cf-group-accent-4',
                    'rkrs-cf-group-accent-5',
                    'rkrs-cf-group-accent-6',
                    'rkrs-cf-group-accent-7',
                    'rkrs-cf-group-accent-8'
                ].join(' '));

                $field.removeData('rkrs_cf_group_object');
                $field.removeAttr('data-rkrs-cf-checklist-state');
                $field.removeData('rkrs_cf_switcher_keys');
                $field.removeData('rkrs_cf_rewritten');
            });

            restoreOptionTexts();
            state.groups = {};
        }

        function getGroupingScope($field) {
            var $scope = $field.closest('.linked-form').first();
            if (!$scope.length) {
                $scope = $field.closest('.linked-forms__group-wrapper_main, .company_contacts__list').first();
            }
            return $scope.length ? $scope[0] : $field[0].parentNode;
        }

        function getGroupScope(scopes, node) {
            for (var i = 0; i < scopes.length; i++) {
                if (scopes[i].node === node) {
                    return scopes[i];
                }
            }

            var scope = { node: node, groups: {} };
            scopes.push(scope);
            return scope;
        }

        function findGroupForMember(candidates, memberIndex) {
            if (!candidates || !candidates.length) {
                return null;
            }

            var selected = null;
            for (var i = 0; i < candidates.length; i++) {
                if (candidates[i].sourceIndex <= memberIndex) {
                    selected = candidates[i];
                } else {
                    break;
                }
            }

            // A member may be positioned above its header in the amoCRM field
            // settings. In that case bind it to the first following header.
            return selected || candidates[0];
        }

        function arrangeGroupMembers(group) {
            var $anchor = group.$header;
            group.$members.removeClass('rkrs-cf-group-member-last');
            group.$members.each(function () {
                var $member = $(this);
                var nextField = $anchor.nextAll('.linked-form__field').first()[0];
                if (nextField !== $member[0]) {
                    $member.insertAfter($anchor);
                }
                $anchor = $member;
            });
            group.$members.last().addClass('rkrs-cf-group-member-last');
            group.$header.toggleClass('rkrs-cf-group-empty', !group.$members.length);
        }

        function processFields() {
            if (accessState().status !== 'active' || !isActivated() || !isCardArea()) {
                return;
            }

            if (state.processing) {
                state.needsReprocess = true;
                return;
            }

            var $fields = $(FIELD_SELECTOR);
            if (!$fields.length) {
                if (state.retryCount < 15) {
                    state.retryCount += 1;
                    scheduleProcess(250);
                }
                return;
            }

            state.retryCount = 0;
            state.processing = true;

            try {
                cleanupEnhancements(true);

                var groupScopes = [];
                var fieldRecords = [];

                $fields.each(function (fieldIndex) {
                    var $field = $(this);
                    var scopeNode = getGroupingScope($field);
                    var groupScope = getGroupScope(groupScopes, scopeNode);

                    var originalLabel = getOriginalLabel($field);
                    var parsed = parseFieldLabel(originalLabel);
                    var $span = getLabelSpan($field);

                    if (!$span.length) {
                        return;
                    }

                    fieldRecords.push({
                        $field: $field,
                        parsed: parsed,
                        scope: groupScope,
                        sourceIndex: fieldIndex
                    });

                    var needsRewrite = !!(
                        parsed.groupRole || parsed.tooltip || parsed.note ||
                        parsed.textareaColumn || parsed.highlight || parsed.checklist ||
                        parsed.percent || parsed.tag || parsed.advice
                    );
                    if (needsRewrite) {
                        $field.addClass('rkrs-cf-processed');
                        $field.data('rkrs_cf_rewritten', true);
                        setVisibleLabel($field, parsed.label);
                    }

                    applyTooltip($field, parsed.tooltip, parsed.groupRole === 'header');
                    applyFieldNote($field, parsed.note, parsed.noteColor);
                    applyTextareaColumn($field, parsed.textareaColumn);
                    applyHighlight($field, parsed.highlight);

                    if (parsed.groupRole === 'header') {
                        var group = {
                            key: parsed.groupKey,
                            mode: parsed.groupMode,
                            accent: parsed.highlight,
                            checklist: parsed.checklist,
                            collapsed: false,
                            switcherVisible: true,
                            sourceIndex: fieldIndex,
                            $header: $field,
                            $members: $()
                        };

                        $field
                            .addClass('rkrs-cf-group-header ' + getGroupAccentClass(parsed.highlight))
                            .data('rkrs_cf_group_object', group);

                        var $groupLabel = $field.find('.linked-form__field__label').first();
                        $('<span>').addClass('rkrs-cf-chevron').prependTo($groupLabel);
                        $('<span>').addClass('rkrs-cf-group-dot').prependTo($groupLabel);

                        registerGroup(group);
                        if (!groupScope.groups[group.key]) {
                            groupScope.groups[group.key] = [];
                        }
                        groupScope.groups[group.key].push(group);
                    }
                });

                for (var recordIndex = 0; recordIndex < fieldRecords.length; recordIndex++) {
                    var record = fieldRecords[recordIndex];
                    if (record.parsed.groupRole !== 'member') {
                        continue;
                    }

                    var activeGroup = findGroupForMember(
                        record.scope.groups[record.parsed.groupKey],
                        record.sourceIndex
                    );
                    if (!activeGroup) {
                        continue;
                    }

                    record.$field
                        .addClass('rkrs-cf-group-member ' + getGroupAccentClass(activeGroup.accent))
                        .data('rkrs_cf_group_object', activeGroup);
                    activeGroup.$members = activeGroup.$members.add(record.$field);
                }

                for (var key in state.groups) {
                    if (!state.groups.hasOwnProperty(key)) {
                        continue;
                    }
                    for (var i = 0; i < state.groups[key].length; i++) {
                        arrangeGroupMembers(state.groups[key][i]);
                        initializeGroup(state.groups[key][i]);
                    }
                }

                scanAllSwitchers($fields);
                initializeSwitchers();
                scheduleValidationGroupCheck(0);
            } finally {
                state.processing = false;
                if (state.needsReprocess) {
                    state.needsReprocess = false;
                    scheduleProcess(60);
                }
            }
        }

        function scheduleProcess(delay) {
            if (state.processTimer) {
                clearTimeout(state.processTimer);
            }
            state.processTimer = setTimeout(function () {
                state.processTimer = null;
                processFields();
            }, typeof delay === 'number' ? delay : 40);
        }

        function mutationContainsFields(mutation) {
            var nodes = mutation.addedNodes || [];
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                if (!node || node.nodeType !== 1) {
                    continue;
                }
                if ($(node).is('.linked-form__field, .linked-form, .card-holder, .linked-forms__group-wrapper') ||
                    $(node).find('.linked-form__field').length) {
                    return true;
                }
            }

            nodes = mutation.removedNodes || [];
            for (var j = 0; j < nodes.length; j++) {
                var removed = nodes[j];
                if (!removed || removed.nodeType !== 1) {
                    continue;
                }
                if ($(removed).is('.linked-form__field') || $(removed).find('.linked-form__field').length) {
                    return true;
                }
            }

            return false;
        }

        function restoreTooltipAfterForeignMutation(mutation) {
            if (mutation.type !== 'attributes' || mutation.attributeName !== 'title') {
                return;
            }
            var $field = $(mutation.target).closest(FIELD_SELECTOR).first();
            if (!$field.length || !$field.hasClass('rkrs-cf-processed')) {
                return;
            }
            var original = String($field.data('rkrs_cf_original_label') || '');
            var parsed = parseFieldLabel(original);
            if (!parsed.tooltip || parsed.groupRole === 'header') {
                return;
            }
            var $label = $field.find('.linked-form__field__label').first();
            if ($label.length && $label.attr('title') !== parsed.tooltip) {
                $label.attr('title', parsed.tooltip);
            }
        }

        function startObserver() {
            if (typeof MutationObserver === 'undefined') {
                return;
            }

            var root = document.querySelector('.card-holder') || document.body;
            if (state.observer && state.observerRoot === root) {
                return;
            }

            stopObserver();
            state.observerRoot = root;
            state.observer = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    restoreTooltipAfterForeignMutation(mutations[i]);
                    if ($(mutations[i].target).closest('.rkrs-cf-checklist-member .linked-form__field__value').length) {
                        scheduleChecklistRefresh();
                    }
                    if ($(mutations[i].target).closest('.rkrs-cf-group-member').length) {
                        scheduleValidationGroupCheck(0);
                    }
                    if (mutationContainsRequiredValidationCounter(mutations[i])) {
                        scheduleValidationGroupCheck(0);
                    }
                    if (mutationContainsFields(mutations[i])) {
                        scheduleProcess(80);
                        break;
                    }
                }
            });

            state.observer.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['title', 'class', 'aria-invalid', 'data-invalid', 'value', 'checked', 'aria-selected']
            });
        }

        function stopObserver() {
            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }
            state.observerRoot = null;
        }

        function removeHelpPanel() {
            $(document).off(NS + '_help_drag');
            stopHelpTimers();
            state.helpExampleOpen = false;
            if (state.helpPanel) {
                state.helpPanel.remove();
                state.helpPanel = null;
            }
            state.helpStatus = null;
            state.helpTarget = null;
        }

        var HELP_GAP = 24;

        function clampHelpPosition(left, top) {
            var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            var width = state.helpPanel.outerWidth() || 720;
            var height = state.helpPanel.outerHeight() || Math.min(900, viewportHeight * 0.9);
            return {
                left: Math.max(12, Math.min(left, viewportWidth - width - 12)),
                top: Math.max(12, Math.min(top, viewportHeight - height - 12))
            };
        }

        function positionHelpUi() {
            if (!state.helpAnchor) {
                return;
            }

            var viewportWidth = window.innerWidth || document.documentElement.clientWidth;

            if (state.helpPanel) {
                if (!state.helpPosition) {
                    // Окно встаёт сразу справа от колонки полей, по её краю, и сужается под ширину браузера,
                    // чтобы не закрывать поля (1.0.135). Места мало — прижимается к правому краю. Дальше его двигает пользователь.
                    // 1.0.136 (Максим): от колонки полей — отступ HELP_GAP, по высоте — по центру окна браузера.
                    var fieldsRight = helpFieldsRight();
                    var room = viewportWidth - fieldsRight - HELP_GAP - 12;
                    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                    var panelWidth;
                    var left;
                    if (fieldsRight && room >= 560) {
                        panelWidth = Math.min(800, room);
                        state.helpPanel.css('width', panelWidth + 'px');
                        left = fieldsRight + HELP_GAP;
                    } else {
                        state.helpPanel.css('width', '');
                        panelWidth = state.helpPanel.outerWidth() || 800;
                        left = viewportWidth - panelWidth - 16;
                    }
                    var panelHeight = state.helpPanel.outerHeight() || Math.min(960, viewportHeight - 32);
                    state.helpPosition = clampHelpPosition(left, Math.round((viewportHeight - panelHeight) / 2));
                }

                state.helpPanel.css({
                    left: state.helpPosition.left + 'px',
                    top: state.helpPosition.top + 'px'
                });
            }

        }

        // Правый край колонки полей карточки: от редактора полей поднимаемся к самому широкому
        // родителю, который ещё уже половины окна (сама колонка, а не вся карточка).
        function helpFieldsRight() {
            var node = state.helpAnchor;
            if (!node || !document.documentElement.contains(node)) return 0;
            var limit = (window.innerWidth || document.documentElement.clientWidth) * 0.5;
            var right = node.getBoundingClientRect().right;
            for (var parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
                var rect = parent.getBoundingClientRect();
                if (rect.width >= limit) break;
                right = Math.max(right, rect.right);
            }
            return Math.round(right);
        }

        function bindHelpPanelDrag($header) {
            $header.attr('title', 'Перетащите окно за заголовок');
            $header.on('pointerdown' + NS, function (e) {
                if (e.button !== 0 || $(e.target).closest('button, a').length) return;
                e.preventDefault();
                var rect = state.helpPanel[0].getBoundingClientRect();
                var offsetX = e.clientX - rect.left;
                var offsetY = e.clientY - rect.top;
                var dragNS = NS + '_help_drag';
                state.helpPanel.addClass('is-dragging');
                $(document).off(dragNS)
                    .on('pointermove' + dragNS, function (event) {
                        if (!state.helpPanel) return;
                        state.helpPosition = clampHelpPosition(event.clientX - offsetX, event.clientY - offsetY);
                        positionHelpUi();
                    })
                    .on('pointerup' + dragNS + ' pointercancel' + dragNS, function () {
                        if (state.helpPanel) state.helpPanel.removeClass('is-dragging');
                        $(document).off(dragNS);
                    });
            });
        }

        function updateHelpTarget() {
            if (!state.helpTarget) return;
            var input = state.helpLastInput;
            var valid = input && document.documentElement.contains(input) && !input.disabled && !input.readOnly;
            var value = valid ? String(input.value || '') : '';
            if (state.helpTarget.val() !== value) state.helpTarget.val(value);
            state.helpTarget.prop('readOnly', !valid);
            state.helpTarget.attr('placeholder', valid ? 'Название пока пустое' : 'Выберите название поля или варианта в amoCRM');
            state.helpTarget.attr('title', valid ? 'Редактируйте название здесь — изменения сразу появятся в поле amoCRM' :
                'Сначала установите курсор в название поля или варианта');
            var $target = state.helpTarget.closest('.dfh-target').toggleClass('has-target', !!valid);
            $target.find('.dfh-target-clear').prop('hidden', !valid);
            resizeHelpTarget();
        }

        function resizeHelpTarget() {
            if (!state.helpTarget) return;
            var editor = state.helpTarget[0];
            editor.style.height = 'auto';
            editor.style.height = Math.min(96, Math.max(34, editor.scrollHeight + 2)) + 'px';
        }

        function scheduleHelpTargetUpdate() {
            // Focus may move from the CRM input into the helper, including its name editor.
            // Клик по кнопке окна может оставить фокус на body (Safari, перерисовка раздела) — выбранное поле при этом не теряем.
            setTimeout(function () {
                var active = document.activeElement;
                if (active && active !== document.body && active !== state.helpLastInput &&
                    !$(active).closest(HELP_CONTEXT_SELECTOR).length) {
                    state.helpLastInput = null;
                }
                updateHelpTarget();
            }, 0);
        }

        function getHelpInput() {
            var input = state.helpLastInput;
            if (!input || !document.documentElement.contains(input) || input.disabled || input.readOnly) {
                state.helpLastInput = null;
                updateHelpTarget();
                if (state.helpStatus) {
                    state.helpStatus.text('Сначала кликните в название поля или варианта в amoCRM');
                }
                return null;
            }
            if (state.helpTarget && document.activeElement === state.helpTarget[0] &&
                typeof input.setSelectionRange === 'function') {
                input.setSelectionRange(state.helpTarget[0].selectionStart, state.helpTarget[0].selectionEnd);
            }
            return input;
        }

        function setHelpInputValue(input, value, position, statusText) {
            var editingTarget = state.helpTarget && document.activeElement === state.helpTarget[0];
            input.value = value;
            if (typeof input.setSelectionRange === 'function') {
                input.setSelectionRange(position, position);
            }

            var event = document.createEvent('Event');
            event.initEvent('input', true, true);
            input.dispatchEvent(event);
            if (!editingTarget) input.focus();
            updateHelpTarget();
            if (editingTarget) state.helpTarget[0].setSelectionRange(position, position);

            if (state.helpStatus && statusText !== false) {
                state.helpStatus.text(statusText || 'Маркер вставлен');
            }
        }

        function applyHelpColor(input, color) {
            var value = String(input.value || '');
            var groupRe = /^\[([A-Za-zА-Яа-яЁё])([1234])?(?:\s+\/([1-8])\/)?\]\s*/;
            var standaloneRe = /^\[\/([1-8])\/\]\s*/;
            var groupMatch = value.match(groupRe);
            var result;
            var prefix;

            if (groupMatch) {
                var rest = value.substring(groupMatch[0].length);
                prefix = '[' + groupMatch[1] + (groupMatch[2] || '') + ' /' + color + '/]';
                result = prefix + (rest ? ' ' + rest : '');
                setHelpInputValue(input, result, prefix.length, 'Цвет добавлен внутрь маркера группы');
                return;
            }

            var standaloneMatch = value.match(standaloneRe);
            prefix = '[/' + color + '/]';
            if (standaloneMatch) {
                var standaloneRest = value.substring(standaloneMatch[0].length);
                result = prefix + (standaloneRest ? ' ' + standaloneRest : '');
            } else {
                result = prefix + (value ? ' ' + value : '');
            }
            setHelpInputValue(input, result, prefix.length, 'Цветной маркер добавлен');
        }

        function applyHelpGroupMarker(input, marker) {
            var value = String(input.value || '');
            var groupRe = /^\[([A-Za-zА-Яа-яЁё])([1234])?(?:\s+\/([1-8])\/)?\]\s*/;
            var standaloneRe = /^\[\/([1-8])\/\]\s*/;
            var newMatch = String(marker || '').trim().match(groupRe);
            if (!newMatch) {
                return;
            }

            var oldGroup = value.match(groupRe);
            var oldStandalone = value.match(standaloneRe);
            var color = newMatch[3] || (oldGroup && oldGroup[3]) || (oldStandalone && oldStandalone[1]) || null;
            var prefix = '[' + newMatch[1] + (newMatch[2] || '') + (color ? ' /' + color + '/' : '') + ']';
            var rest = value;

            if (oldGroup) {
                rest = value.substring(oldGroup[0].length);
            } else if (oldStandalone) {
                rest = value.substring(oldStandalone[0].length);
            }

            var result = prefix + (rest ? ' ' + rest : '');
            setHelpInputValue(input, result, prefix.length, oldGroup ? 'Маркер группы заменён' : 'Маркер группы добавлен');
        }

        function applyHelpSwitchMarker(input, marker) {
            var value = String(input.value || '');
            var switchRe = /^\[@([A-Za-zА-Яа-яЁё])\]\s*/;
            var newMatch = String(marker || '').trim().match(switchRe);
            if (!newMatch) {
                return;
            }

            var oldMatch = value.match(switchRe);
            var prefix = '[@' + newMatch[1] + ']';
            var rest = oldMatch ? value.substring(oldMatch[0].length) : value;
            var result = prefix + (rest ? ' ' + rest : '');
            setHelpInputValue(input, result, prefix.length, oldMatch ? 'Связанный маркер заменён' : 'Связанный маркер добавлен');
        }

        function applyHelpTooltip(input, marker) {
            var value = String(input.value || '').replace(/\s+$/, '');
            var tooltipRe = /\s*\{::[^}]*\}\s*$/;
            var cleanMarker = String(marker || '').trim();
            var result;

            if (tooltipRe.test(value)) {
                result = value.replace(tooltipRe, ' ' + cleanMarker);
            } else {
                result = value + (value ? ' ' : '') + cleanMarker;
            }
            setHelpInputValue(input, result, result.length, 'Подсказка добавлена в конец названия');
        }

        function applyHelpFieldNote(input, marker) {
            var value = String(input.value || '').replace(/\s+$/, '');
            var noteRe = /\s*\{:\s*[1-8]\s*=\s*[^}]*\}/;
            var cleanMarker = String(marker || '').trim();
            var result;

            if (noteRe.test(value)) {
                result = value.replace(noteRe, ' ' + cleanMarker);
            } else {
                result = value + (value ? ' ' : '') + cleanMarker;
            }
            setHelpInputValue(input, result, result.length, 'Цветная подпись добавлена');
        }

        function applyHelpTextareaColumn(input, marker) {
            var value = String(input.value || '').replace(/\s+$/, '');
            var columnRe = /\s*\{:\s*col\s*\}/i;
            var cleanMarker = String(marker || '').trim();
            var result;

            if (columnRe.test(value)) {
                result = value.replace(columnRe, ' ' + cleanMarker);
            } else {
                result = value + (value ? ' ' : '') + cleanMarker;
            }
            setHelpInputValue(input, result, result.length, 'Вертикальное отображение добавлено');
        }

        function applyHelpChecklistSuffix(input, marker) {
            var value = String(input.value || '').trim();
            var cleanMarker = String(marker || '').trim();
            var pattern = cleanMarker.indexOf('{!') === 0 ? /\s*\{![^}]*\}/g :
                cleanMarker.indexOf('{:tag') === 0 ? /\s*\{:\s*tag\s+[^}]*\}/gi :
                cleanMarker === '{:percent}' ? /\s*\{:\s*percent\s*\}/gi : /\s*\{:\s*checklist\s*\}/gi;
            value = value.replace(pattern, '').trim();
            // A formula suffix must remain last for compatibility with formula widgets.
            var formula = value.match(EXTERNAL_FORMULA_RE);
            if (formula) value = value.replace(EXTERNAL_FORMULA_RE, '').trim();
            var result = value + (value ? ' ' : '') + cleanMarker + (formula ? ' ' + formula[0].trim() : '');
            setHelpInputValue(input, result, result.length, 'Маркер чек-листа добавлен');
        }

        function insertHelpAction(action) {
            var input = getHelpInput();
            if (!input) {
                return;
            }

            var marker = String(action.insert || '');
            if (action.kind === 'checklist-group') {
                applyHelpGroupMarker(input, marker);
                applyHelpChecklistSuffix(input, '{:checklist}');
                return;
            }
            if (action.kind === 'checklist-suffix') {
                applyHelpChecklistSuffix(input, marker);
                return;
            }
            if (action.kind === 'checklist-option') {
                var optionValue = String(input.value || '').replace(/^\[[+-]\]\s*/, '');
                var optionResult = marker + optionValue;
                setHelpInputValue(input, optionResult, marker.length, 'Состояние ответа задано');
                return;
            }
            if (action.kind === 'color') {
                applyHelpColor(input, action.color);
                return;
            }
            if (action.kind === 'group') {
                applyHelpGroupMarker(input, marker);
                return;
            }
            if (action.kind === 'switch') {
                applyHelpSwitchMarker(input, marker);
                return;
            }
            if (action.kind === 'tooltip') {
                applyHelpTooltip(input, marker);
                return;
            }
            if (action.kind === 'field-note') {
                applyHelpFieldNote(input, marker);
                return;
            }
            if (action.kind === 'textarea-column') {
                applyHelpTextareaColumn(input, marker);
                return;
            }

            var value = String(input.value || '');
            var start = typeof input.selectionStart === 'number' ? input.selectionStart : value.length;
            var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
            var position = start + marker.length;
            setHelpInputValue(
                input,
                value.substring(0, start) + marker + value.substring(end),
                position,
                'Маркер вставлен'
            );
        }

        function closeHelpPanel() {
            state.helpCollapsed = true;
            removeHelpPanel();
        }

        function getTemplateEntity() {
            var entity = '';
            try { entity = window.APP.getBaseEntity(); } catch (e) {}
            if (['leads', 'contacts', 'companies', 'customers'].indexOf(entity) !== -1) return entity;
            var area = '';
            try { area = self.system().area || ''; } catch (e2) {}
            return { lcard: 'leads', ccard: 'contacts', comcard: 'companies', cucard: 'customers' }[area || currentAreaFromUrl()] || null;
        }

        function isTemplateAdmin() {
            try {
                var rights = window.APP.constant('user_rights') || {};
                if (rights.is_admin !== undefined) return [true, 1, '1', 'Y'].indexOf(rights.is_admin) !== -1;
            } catch (e) {}
            return true; // The API enforces permissions if the client does not expose them.
        }

        // ===== Окно «Справочник маркеров» в стиле «Меню amo» (1.0.134) =====
        // Разметка — lib/app/help-ui.js; здесь состояние окна, события, вставка маркеров и доступ.
        function helpAccessStatus() {
            var status = accessState().status;
            return status === 'expired' || status === 'error' ? status : 'active';
        }

        function helpContext() {
            var entity = getTemplateEntity();
            var version = '';
            try { version = typeof self.get_version === 'function' ? String(self.get_version() || '') : ''; } catch (e) {}
            return {
                section: state.helpFilter,
                letter: state.helpLetter,
                tipKind: state.helpTipKind,
                groups: state.helpGroups,
                exampleOpen: state.helpExampleOpen,
                wizard: state.wizard ? wizardView() : null,
                gwizard: state.gwizard ? groupView() : null,
                lwizard: state.lwizard ? linkedView() : null,
                vwizard: state.vwizard ? viewView() : null,
                hwizard: state.hwizard ? hlView() : null,
                twizard: state.twizard ? tipsView() : null,
                access: helpAccessStatus(),
                date: formatPaidTo(accessState().paidTo),
                client: false,
                contacts: CONTACTS,
                version: version,
                entity: entity,
                admin: isTemplateAdmin(),
                run: entity ? state.templateRuns[entity] : null,
                fields: templates.preview(),
                method: templates.method,
                methodUrl: templates.methodUrl
            };
        }

        function setHelpStatus(text) {
            if (state.helpStatus) state.helpStatus.text(text);
        }

        // Группы аккаунта для раздела «Связанные группы»: названия полей из amoCRM (API) и из открытого редактора.
        function collectHelpGroups(names) {
            var byKey = {};
            var order = [];
            names.forEach(function (name) {
                var text = String(name || '');
                var header = text.match(GROUP_HEADER_RE);
                var match = header || text.match(GROUP_MEMBER_RE);
                if (!match) return;
                var key = normalizeGroupKey(match[1]);
                if (!byKey[key]) {
                    byKey[key] = { key: key, name: '', count: 0 };
                    order.push(key);
                }
                if (header) byKey[key].name = byKey[key].name || removeWidgetMarkers(text);
                else byKey[key].count++;
            });
            return order.map(function (key) {
                if (!byKey[key].name) byKey[key].name = 'Группа ' + key;
                return byKey[key];
            });
        }

        function helpEditorNames() {
            return $(HELP_INPUT_SELECTOR).map(function () { return this.value; }).get();
        }

        function buildHelpGroups(status) {
            var saved = collectHelpGroups(state.helpGroupNames || []);
            var known = {};
            saved.forEach(function (group) { known[group.key] = true; });
            // Группа, которую только что разметили в редакторе и ещё не сохранили, тоже попадает в список.
            var fresh = collectHelpGroups(helpEditorNames()).filter(function (group) { return !known[group.key]; });
            state.helpGroups = { status: status, list: saved.concat(fresh) };
        }

        function fetchHelpFieldNames(entity) {
            var names = [];
            function loadPage(page) {
                return fetch('/api/v4/' + entity + '/custom_fields?limit=250&page=' + page, { credentials: 'same-origin' })
                    .then(function (response) {
                        if (response.status === 204) return names;
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json().then(function (payload) {
                            var batch = payload && payload._embedded && payload._embedded.custom_fields;
                            (Array.isArray(batch) ? batch : []).forEach(function (field) { names.push(field.name); });
                            // Не больше четырёх страниц (1000 полей): бережём лимит запросов amoCRM.
                            return payload && payload._links && payload._links.next && page < 4 ? loadPage(page + 1) : names;
                        });
                    });
            }
            return loadPage(1);
        }

        function loadHelpGroups() {
            var entity = getTemplateEntity();
            if (!entity) {
                buildHelpGroups('ready');
                return;
            }
            if (state.helpGroupsLoading) return;
            state.helpGroupsLoading = true;
            buildHelpGroups('loading');
            fetchHelpFieldNames(entity).then(function (names) {
                state.helpGroupNames = names;
                return 'ready';
            }).catch(function () {
                return 'error';
            }).then(function (status) {
                state.helpGroupsLoading = false;
                var before = JSON.stringify(state.helpGroups);
                buildHelpGroups(status);
                // Обновляем только блок «Ваши группы»: перерисовка всего раздела запускала пример заново (1.0.145).
                if (state.helpPanel && state.helpFilter === 'switch' && before !== JSON.stringify(state.helpGroups)) {
                    var $own = state.helpPanel.find('.dfh-own-wrap');
                    if ($own.length) $own.html(helpUi.ownGroups(state.helpGroups));
                    else if (!helpWizardOn()) renderHelpContent(true);
                }
            });
        }

        function stopHelpTimers() {
            state.helpTimers.forEach(function (timer) { clearInterval(timer); });
            state.helpTimers = [];
            clearHelpExample();
        }

        // Пример «Связанных групп» (1.0.139): свёрнут, пока не нажали «Показать». Слайды по очереди — список, потом переключатель;
        // доиграл слайд — сам идёт следующий. Паузы при наведении нет (1.0.144): пример открывается под мышью и вставал на паузу. Разметка — exampleBox() в help-ui.js; с 1.0.143 так же устроен пример «Чек-листов».
        var EXAMPLE_GROUPS = { F: ['Физ. лицо', 'Имя', 'Паспорт'], U: ['Юр. лицо', 'ИНН', 'Реквизиты'], I: ['ИП', 'ИНН', 'ОГРНИП'] };

        function clearHelpExample() {
            state.helpExampleTimers.forEach(function (timer) { clearTimeout(timer); });
            state.helpExampleTimers = [];
        }

        function exampleLater(fn, ms) {
            state.helpExampleTimers.push(setTimeout(fn, ms));
        }

        function resetExampleCard(card) {
            var $card = $(card);
            $card.find('.dfh-ex-grp').addClass('out').removeAttr('data-k').removeClass('was');
            $card.find('.dfh-ex-cur').css({ left: '90%', top: '86%' });
            $card.find('.dfh-ex-sel').addClass('empty').removeClass('press').find('.dfh-ex-v').text('Выбрать');
            $card.find('.dfh-ex-dd').removeClass('open').find('li').removeClass('hov');
            $card.find('.dfh-rad b').removeClass('on');
            $card.find('.dfh-hl-row').removeClass('on');
            $card.find('.dfh-tp-pop').removeClass('on');
            if ($card.attr('data-kind') === 'checklist') {
                $card.data('ck', ['none', 'none']);
                $card.find('.dfh-rad b[data-v="none"]').addClass('on');
                $card.find('.dfh-ck-bar i').attr('class', '');
                $card.find('.dfh-ck-p').text('0%');
                $card.find('.dfh-ck-h').removeClass('ok bad');
                $card.find('.dfh-ck-tip').prop('hidden', true);
            }
        }

        function setExampleAnswer($card, row, value) {
            var values = ($card.data('ck') || ['none', 'none']).slice();
            values[row] = value;
            $card.data('ck', values);
            var done = values.filter(function (item) { return item === 'ok'; }).length;
            var blocker = values.indexOf('bad') !== -1;
            values.forEach(function (item, index) {
                $card.find('[data-ck-row="' + index + '"] b').each(function () {
                    $(this).toggleClass('on', this.getAttribute('data-v') === item);
                });
                $card.find('.dfh-ck-bar i').eq(index).attr('class', item === 'none' ? '' : item);
            });
            $card.find('.dfh-ck-p').text(Math.round(done / values.length * 100) + '%');
            $card.find('.dfh-ck-h').toggleClass('bad', blocker).toggleClass('ok', !blocker && done === values.length);
            $card.find('.dfh-ck-tip').prop('hidden', values[1] !== 'bad');
        }

        function showExampleGroup(card, key) {
            var $grp = $(card).find('.dfh-ex-grp');
            var swap = $grp.hasClass('was');
            $grp.addClass('out was');
            exampleLater(function () {
                $grp.attr('data-k', key);
                $grp.find('.dfh-ex-gn').text(EXAMPLE_GROUPS[key][0]);
                $grp.find('.dfh-ex-g1').text(EXAMPLE_GROUPS[key][1]);
                $grp.find('.dfh-ex-g2').text(EXAMPLE_GROUPS[key][2]);
                $grp.removeClass('out');
            }, swap ? 320 : 40);
        }

        function exampleSteps(card) {
            var $card = $(card);
            var $cur = $card.find('.dfh-ex-cur');
            function moveTo(el) {
                if (!el) return;
                var c = card.getBoundingClientRect();
                var r = el.getBoundingClientRect();
                $cur.css({ left: (r.left - c.left + Math.min(r.width * 0.6, r.width - 10)) + 'px', top: (r.top - c.top + r.height * 0.55) + 'px' });
            }
            function click() {
                $cur.removeClass('click');
                void $cur[0].offsetWidth;
                $cur.addClass('click');
            }
            function park() { $cur.css({ left: '90%', top: '86%' }); }
            var wait = function (ms) { return [[ms, function () {}]]; };
            // 1.0.148: подсветка — полосы по очереди; расположение — просто показать слайд и перейти к следующему.
            if ($card.attr('data-kind') === 'highlight') {
                return wait(300).concat($card.find('[data-hl]').toArray().reduce(function (list, row) {
                    return list.concat([[550, function () { $(row).addClass('on'); }]]);
                }, []), wait(2600));
            }
            if ($card.attr('data-kind') === 'view') return wait(3500);
            if ($card.attr('data-kind') === 'tips') {
                var $info = $card.find('.dfh-tp-name i');
                var $pop = $card.find('.dfh-tp-pop');
                return [
                    [150, function () { moveTo($info[0]); }],
                    [500, function () { $pop.addClass('on'); }],
                    [2600, function () { $pop.removeClass('on'); park(); }],
                    [1200, function () {}]
                ];
            }
            if ($card.attr('data-kind') === 'checklist') {
                var answer = function (row, value) {
                    var button = $card.find('[data-ck-row="' + row + '"] [data-v="' + value + '"]')[0];
                    return [
                        [150, function () { moveTo(button); }],
                        [450, function () { click(); setExampleAnswer($card, row, value); }],
                        [250, park]
                    ];
                };
                return answer(0, 'ok').concat(wait(600), answer(1, 'bad'), wait(1600), answer(1, 'ok'), wait(1800));
            }
            if ($card.attr('data-kind') === 'list') {
                var $sel = $card.find('.dfh-ex-sel');
                var $dd = $card.find('.dfh-ex-dd');
                var pick = function (key) {
                    return [
                        [150, function () { moveTo($sel[0]); }],
                        [450, function () { click(); $sel.addClass('press'); $dd.addClass('open'); }],
                        [350, function () {
                            moveTo($dd.find('[data-o="' + key + '"]')[0]);
                            $dd.find('li').each(function () { $(this).toggleClass('hov', this.getAttribute('data-o') === key); });
                        }],
                        [450, click],
                        [150, function () {
                            $dd.removeClass('open');
                            $sel.removeClass('press empty').find('.dfh-ex-v').text(EXAMPLE_GROUPS[key][0]);
                            showExampleGroup(card, key);
                        }],
                        [250, park]
                    ];
                };
                return pick('F').concat(wait(1000), pick('U'), wait(1600));
            }
            var radio = function (key) {
                var button = $card.find('.dfh-rad [data-o="' + key + '"]')[0];
                return [
                    [150, function () { moveTo(button); }],
                    [450, function () {
                        click();
                        $card.find('.dfh-rad b').each(function () { $(this).toggleClass('on', this === button); });
                        showExampleGroup(card, key);
                    }],
                    [250, park]
                ];
            };
            return radio('F').concat(wait(1000), radio('U'), wait(1600));
        }

        function playHelpExample(index) {
            clearHelpExample();
            var $stage = state.helpPanel ? state.helpPanel.find('.dfh-ex-stage') : $();
            if (!$stage.length || $stage.prop('hidden')) return;
            var $slides = $stage.find('.dfh-ex-slide');
            var $dots = $stage.find('.dfh-ex-dot');
            index = (index + $slides.length) % $slides.length;
            state.helpExampleSlide = index;
            $slides.each(function (i) { this.hidden = i !== index; });
            $dots.each(function (i) {
                $(this).toggleClass('on', i === index).toggleClass('done', i < index);
                $(this).find('i b').css('width', i < index ? '100%' : '0');
            });
            var card = $slides.eq(index).find('.dfh-ex-card')[0];
            $stage.find('.dfh-ex-card').each(function () { resetExampleCard(this); });
            // «Уменьшить движение» в системе — сразу итог, без курсора и без автоперехода.
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                $(card).find('.dfh-ex-sel').removeClass('empty').find('.dfh-ex-v').text(EXAMPLE_GROUPS.U[0]);
                if ($(card).attr('data-kind') === 'highlight') return $(card).find('.dfh-hl-row').addClass('on');
                if ($(card).attr('data-kind') === 'view') return;
                if ($(card).attr('data-kind') === 'tips') return $(card).find('.dfh-tp-pop').addClass('on');
                if ($(card).attr('data-kind') === 'checklist') {
                    setExampleAnswer($(card), 0, 'ok');
                    setExampleAnswer($(card), 1, 'bad');
                    return;
                }
                $(card).find('.dfh-rad [data-o="U"]').addClass('on');
                showExampleGroup(card, 'U');
                return;
            }
            var steps = exampleSteps(card);
            var total = steps.reduce(function (sum, item) { return sum + item[0]; }, 0);
            var $bar = $dots.eq(index).find('i b');
            var i = 0;
            var elapsed = 0;
            (function next() {
                if (state.helpExamplePaused) return exampleLater(next, 200);
                if (i >= steps.length) return playHelpExample(index + 1);
                var item = steps[i++];
                exampleLater(function () {
                    item[1]();
                    elapsed += item[0];
                    $bar.css('width', Math.round(elapsed / total * 100) + '%');
                    next();
                }, item[0]);
            })();
        }

        function handleHelpExample(action, $button) {
            if (!state.helpPanel) return;
            if (action === 'open' || action === 'close') {
                state.helpExampleOpen = action === 'open';
                state.helpExamplePaused = false;
                var $box = state.helpPanel.find('.dfh-ex');
                $box.find('.dfh-ex-open').prop('hidden', state.helpExampleOpen).attr('aria-expanded', String(state.helpExampleOpen));
                $box.find('.dfh-ex-stage').prop('hidden', !state.helpExampleOpen);
                if (state.helpExampleOpen) {
                    playHelpExample(0);
                    $box.find('.dfh-ex-close').trigger('focus');
                } else {
                    clearHelpExample();
                    $box.find('.dfh-ex-open').trigger('focus');
                }
                return;
            }
            if (action === 'slide') return playHelpExample(parseInt($button.attr('data-slide'), 10) || 0);
            if (action === 'prev') return playHelpExample(state.helpExampleSlide - 1);
            if (action === 'next') return playHelpExample(state.helpExampleSlide + 1);
        }

        // Живые примеры в разделах вместо гифок. При «уменьшить движение» в системе не запускаются.
        function startHelpAnimations() {
            stopHelpTimers();
            if (!state.helpPanel) return;
            if (state.helpExampleOpen) playHelpExample(state.helpExampleSlide);
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            var $content = state.helpPanel.find('.dfh-content');

        }

        // «Куда вставляем» и подсказка внизу нужны только для ручной разметки. В мастерах «Группы полей» и «Чек-листы»
        // маркеры ставит виджет — строку прячем (Максим 18.11.2026, 2.0.1).
        function helpWizardOn() {
            if (state.helpFilter === 'group') return !(state.gwizard && state.gwizard.manual);
            if (state.helpFilter === 'checklist') return !(state.wizard && state.wizard.manual);
            if (state.helpFilter === 'switch') return !(state.lwizard && state.lwizard.manual);
            if (state.helpFilter === 'view') return !(state.vwizard && state.vwizard.manual);
            if (state.helpFilter === 'highlight' || state.helpFilter === 'tips') return true;
            return false;
        }

        function renderHelpTargetHint() {
            if (!state.helpPanel) return;
            var wizardOn = helpWizardOn();
            var hidden = wizardOn || helpUi.noTarget.indexOf(state.helpFilter) !== -1;
            state.helpPanel.find('.dfh-target').prop('hidden', hidden);
            if (state.helpStatus) {
                state.helpStatus.prop('hidden', wizardOn);
                if (!wizardOn && !state.helpStatus.text()) state.helpStatus.text('Кликните в название поля в amoCRM и нажмите «Вставить» у нужного маркера');
            }
            if (!hidden) resizeHelpTarget();
        }

        function renderHelpContent(keepScroll) {
            if (!state.helpPanel) return;
            var $content = state.helpPanel.find('.dfh-content');
            var scroll = keepScroll ? $content.scrollTop() : 0;
            $content.html(helpUi.content(helpContext())).scrollTop(scroll);
            renderHelpTargetHint();
            startHelpAnimations();
        }


        // ===== Мастера «Чек-листы» и «Группы полей» (2.0.0) =====
        // Человек называет заголовок, вписывает букву, выбирает или вписывает поля — маркеры в названиях ставит виджет через API
        // (POST — новые поля, PATCH — названия и варианты готовых). Готовый чек-лист или группу можно открыть и изменить.
        // Макеты: business/assets/mockups/dynamic-fields-checklists/wizard2.html, business/assets/mockups/dynamic-fields-groups/wizard.html.
        // Разметка — checklistWizard()/groupWizard() в help-ui.js.
        var WZ_ENTITY_NAMES = { leads: 'Сделки', contacts: 'Контакты', companies: 'Компании', customers: 'Покупатели' };
        var WZ_WHERE = { leads: 'в сделках', contacts: 'в контактах', companies: 'в компаниях', customers: 'в покупателях' };
        var WZ_LETTERS = 'ФКДОПРСТУХЦЧШЩЭЮЯАБВГЕЖЗИЛМН'.split('');
        var WZ_HEAD_RE = /^\s*\[([A-Za-zА-Яа-яЁё])([1-4])(?:\s+\/([1-8])\/)?\]\s*/;
        var WZ_MEMBER_RE = /^\s*\[([A-Za-zА-Яа-яЁё])(?:\s+\/([1-8])\/)?\]\s*/;
        var WZ_COLOR_RE = /^\s*\[\/([1-8])\/\]\s*/;
        var WZ_DONE_RE = /\{:\s*done\s+([A-Za-zА-Яа-яЁё])\s*\}/i;
        var WZ_CHECKLIST_RE = /\{:\s*checklist\s*\}/i;

        function wzClean(text) {
            var value = String(text || '').trim();
            var before;
            do {
                before = value;
                value = value.replace(/^\[(?:@?[A-Za-zА-Яа-яЁё][1-4]?(?:\s+\/[1-8]\/)?|\/[1-8]\/|[+-])\]\s*/, '')
                    .replace(/\s*\{[^{}]*\}\s*$/, '').trim();
            } while (value !== before);
            return value;
        }

        function wzText(text) {
            return String(text || '').replace(/[\[\]{}]/g, '').replace(/\s+/g, ' ').trim();
        }

        function wzLetter(text) {
            var letter = String(text || '').trim().toUpperCase();
            return /^[A-ZА-ЯЁ]$/.test(letter) ? letter : '';
        }

        function wzOptionValue(raw, value, advice) {
            var base = String(raw || '').trim().replace(/^\[[+-]\]\s*/, '').replace(/\s*\{![^}]*\}\s*$/, '');
            var tip = String(advice || '').replace(/[{}]/g, '').trim();
            return (value === 'ok' ? '[+] ' : value === 'bad' ? '[-] ' : '') + base + (value === 'bad' && tip ? ' {!' + tip + '}' : '');
        }

        function wzOptionState(raw) {
            var text = String(raw || '').trim();
            var mark = text.match(/^\[([+-])\]/);
            var advice = text.match(/\{!([^}]*)\}\s*$/);
            return { label: text.replace(/^\[[+-]\]\s*/, '').replace(/\s*\{![^}]*\}\s*$/, ''),
                value: mark ? (mark[1] === '+' ? 'ok' : 'bad') : 'none', advice: advice ? advice[1].trim() : '' };
        }

        // Маркер группы в начале названия: заголовок [Л3 /7/], поле [Л] или [Л /3/]. Цвет поля сохраняем в том же блоке.
        function wzSetMember(name, letter) {
            var text = String(name || '').trim();
            var member = text.match(WZ_MEMBER_RE);
            if (member && !WZ_HEAD_RE.test(text)) return '[' + letter + (member[2] ? ' /' + member[2] + '/' : '') + '] ' + text.slice(member[0].length);
            var color = text.match(WZ_COLOR_RE);
            if (color) return '[' + letter + ' /' + color[1] + '/] ' + text.slice(color[0].length);
            return '[' + letter + '] ' + text;
        }

        function wzStripMember(name) {
            var text = String(name || '').trim();
            var member = text.match(WZ_MEMBER_RE);
            if (!member || WZ_HEAD_RE.test(text)) return text;
            return (member[2] ? '[/' + member[2] + '/] ' : '') + text.slice(member[0].length);
        }

        function wzHeadName(title, letter, mode, color, checklistSuffix) {
            var name = '[' + letter + mode + (color ? ' /' + color + '/' : '') + '] ' + wzText(title);
            return checklistSuffix ? name + ' {:checklist}' : name;
        }

        // Хвост названия заголовка (подсказки {::…}, метка и т. п.) сохраняем при переименовании.
        function wzHeadRename(raw, title, letter, mode, color) {
            var text = String(raw || '').trim();
            var head = text.match(WZ_HEAD_RE);
            var rest = head ? text.slice(head[0].length) : text;
            var tail = '';
            var match;
            while ((match = rest.match(/\s*(\{[^{}]*\})\s*$/))) {
                tail = ' ' + match[1] + tail;
                rest = rest.slice(0, match.index);
            }
            return '[' + letter + mode + (color ? ' /' + color + '/' : '') + '] ' + (wzText(title) || rest.trim()) + tail;
        }

        function wzDoneName(raw, letter) {
            return String(raw || '').replace(new RegExp('\\s*' + WZ_DONE_RE.source, 'gi'), '').trim() + (letter ? ' {:done ' + letter + '}' : '');
        }

        function fetchWizardFields(entity) {
            var fields = [];
            function loadPage(page) {
                return fetch('/api/v4/' + entity + '/custom_fields?limit=250&page=' + page, { credentials: 'same-origin' }).then(function (response) {
                    if (response.status === 204) return fields;
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.json().then(function (payload) {
                        var batch = payload && payload._embedded && payload._embedded.custom_fields;
                        fields = fields.concat(Array.isArray(batch) ? batch : []);
                        return payload && payload._links && payload._links.next && page < 4 ? loadPage(page + 1) : fields;
                    });
                });
            }
            return loadPage(1);
        }

        function fetchWizardTabs(entity) {
            return fetch('/api/v4/' + entity + '/custom_fields/groups', { credentials: 'same-origin' }).then(function (response) {
                if (!response.ok) return {};
                return response.json().then(function (payload) {
                    var tabs = {};
                    var list = payload && payload._embedded && payload._embedded.custom_field_groups;
                    (Array.isArray(list) ? list : []).forEach(function (tab) { tabs[tab.id] = tab.name; });
                    return tabs;
                });
            }).catch(function () { return {}; });
        }

        // Разбор полей аккаунта: заголовки групп и чек-листов, их поля, флаги «100 %», занятые буквы.
        function wzScan(fields) {
            var heads = {};
            var members = {};
            var dones = {};
            fields.forEach(function (field) {
                var name = String(field.name || '');
                var head = name.match(WZ_HEAD_RE);
                var done = name.match(WZ_DONE_RE);
                if (head) {
                    var key = head[1].toUpperCase();
                    if (!heads[key]) heads[key] = { field: field, letter: key, mode: head[2], color: head[3] || '', checklist: WZ_CHECKLIST_RE.test(name),
                        title: wzClean(name) || name };
                } else if (done && field.type === 'checkbox') {
                    dones[done[1].toUpperCase()] = field;
                } else {
                    var member = name.match(WZ_MEMBER_RE);
                    if (member) (members[member[1].toUpperCase()] = members[member[1].toUpperCase()] || []).push(field);
                }
            });
            Object.keys(members).forEach(function (key) {
                members[key].sort(function (a, b) { return (Number(a.sort) || 0) - (Number(b.sort) || 0); });
            });
            var used = {};
            Object.keys(heads).concat(Object.keys(members)).forEach(function (key) { used[key] = true; });
            return { heads: heads, members: members, dones: dones, used: used };
        }

        function wzBusy(field, scan) {
            var name = String(field.name || '');
            return !!(field.is_predefined || WZ_HEAD_RE.test(name) || WZ_MEMBER_RE.test(name) || WZ_DONE_RE.test(name) || WZ_CHECKLIST_RE.test(name));
        }

        function wzFreeLetter(scan, title) {
            var first = wzLetter(String(title || '').trim().charAt(0));
            if (first && !scan.used[first]) return first;
            return WZ_LETTERS.filter(function (letter) { return !scan.used[letter]; })[0] || 'Ч';
        }

        function wizardRequest(entity, method, body) {
            return fetch('/api/v4/' + entity + '/custom_fields', {
                method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            }).then(function (response) {
                if (response.status === 401 || response.status === 403) throw new Error('rights');
                if (!response.ok) throw new Error('HTTP ' + response.status);
            });
        }

        // POST новых полей, затем PATCH пачками по 40 (как «Сбросить»). Повтор после ошибки не создаёт поля второй раз.
        function wizardSend(w, create, patch) {
            var chain = create.length && !w.created ? wizardRequest(w.entity, 'POST', create).then(function () { w.created = true; }) : Promise.resolve();
            for (var i = 0; i < patch.length; i += 40) {
                (function (batch, first) {
                    chain = chain.then(function () { return first ? null : resetWait(300); }).then(function () { return wizardRequest(w.entity, 'PATCH', batch); });
                })(patch.slice(i, i + 40), i === 0);
            }
            return chain;
        }

        function wizardFailMessage(error) {
            return error && error.message === 'rights' ? 'Создавать и менять поля может только администратор amoCRM.' :
                'amoCRM не приняла изменения. Проверьте лимит полей и права и нажмите кнопку ещё раз — уже созданное не задвоится.';
        }

        // Фокус и курсор в поле ввода переживают перерисовку мастера.
        function wizardRender($wrap, html) {
            var active = document.activeElement;
            var keep = null;
            if (active && $wrap[0] && $wrap[0].contains(active) && active.getAttribute) {
                keep = { attr: active.getAttribute('data-wz-input') ? 'data-wz-input' : active.getAttribute('data-gw-input') ? 'data-gw-input' :
                    active.getAttribute('data-lw-input') ? 'data-lw-input' : active.getAttribute('data-vw-input') ? 'data-vw-input' : active.getAttribute('data-hl-input') ? 'data-hl-input' : active.getAttribute('data-tp-input') ? 'data-tp-input' : null,
                    index: active.getAttribute('data-index'), opt: active.getAttribute('data-opt'), start: active.selectionStart, end: active.selectionEnd };
                if (keep.attr) keep.value = active.getAttribute(keep.attr);
            }
            $wrap.html(html);
            if (!keep || !keep.attr) return;
            var selector = '[' + keep.attr + '="' + keep.value + '"]' + (keep.index !== null ? '[data-index="' + keep.index + '"]' : '') + (keep.opt !== null ? '[data-opt="' + keep.opt + '"]' : '');
            var el = $wrap.find(selector)[0];
            if (el) {
                el.focus();
                try { el.setSelectionRange(keep.start, keep.end); } catch (e) {}
            }
        }

        // ----- Мастер чек-листа -----
        function wizardBase(status, entity) {
            return { status: status, entity: entity || null, step: 0, headQ: '', head: null, combo: false, letter: '', letterTouched: false,
                ltNote: '', note: '', edit: null, q: [], removed: [], pv: {}, fields: [], tabs: {}, scan: null, created: false, message: '',
                doneOn: true, doneMode: 'new', doneName: '', donePick: '', doneKeep: true,
                manual: state.wizard ? state.wizard.manual : false };
        }

        function wizardQuestion(name, type) {
            return { name: name, type: type || 'radiobutton', options: [
                { label: 'Да', value: 'ok', advice: '' }, { label: 'Не выяснено', value: 'none', advice: '' }, { label: 'Нет', value: 'bad', advice: '' }
            ] };
        }

        function loadWizard(force) {
            var entity = getTemplateEntity();
            if (!entity) {
                state.wizard = wizardBase('noentity');
                return renderWizard();
            }
            if (!force && state.wizard && state.wizard.entity === entity && ['ready', 'applying', 'done'].indexOf(state.wizard.status) !== -1) return renderWizard();
            var w = state.wizard = wizardBase('loading', entity);
            renderWizard();
            Promise.all([fetchWizardFields(entity), fetchWizardTabs(entity)]).then(function (result) {
                if (state.wizard !== w) return;
                w.fields = result[0];
                w.tabs = result[1];
                w.scan = wzScan(w.fields);
                w.status = 'ready';
                renderWizard();
            }, function () {
                if (state.wizard !== w) return;
                w.status = 'error';
                renderWizard();
            });
        }

        function wizardField(id) {
            var list = (state.wizard && state.wizard.fields) || [];
            return list.filter(function (field) { return String(field.id) === String(id); })[0] || null;
        }

        // Открыть готовый чек-лист в мастере: заголовок, вопросы (поля-пункты) и ответы — из названий полей.
        function wizardEnterEdit(letter) {
            var w = state.wizard;
            var head = w.scan.heads[letter];
            if (!head || !head.checklist) return;
            w.edit = letter;
            w.letter = letter;
            w.letterTouched = false;
            w.head = { id: head.field.id, name: head.title, existing: true };
            w.headQ = head.title;
            w.step = 0;
            w.ltNote = '';
            w.note = '';
            w.removed = [];
            w.pv = {};
            w.created = false;
            w.message = '';
            w.q = (w.scan.members[letter] || []).filter(function (field) { return field.type === 'select' || field.type === 'radiobutton'; }).map(function (field) {
                var enums = (field.enums || []).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
                return { id: field.id, raw: field.name, name: wzClean(field.name) || field.name, type: field.type, orig: true,
                    options: enums.map(function (item) {
                        var parsed = wzOptionState(item.value);
                        return { id: item.id, raw: item.value, sort: item.sort, label: parsed.label, value: parsed.value, advice: parsed.advice, orig: true };
                    }) };
            });
            var done = w.scan.dones[letter];
            w.doneExisting = done ? done.id : null;
            w.doneKeep = !!done;
            w.doneOn = !done;
            w.doneMode = 'new';
            w.doneName = '';
        }

        function wizardLetter() {
            var w = state.wizard;
            if (w.edit) return wzLetter(w.letter) || w.edit;
            if (w.letterTouched && wzLetter(w.letter)) return wzLetter(w.letter);
            var head = w.head && w.head.id ? wizardField(w.head.id) : null;
            return wzFreeLetter(w.scan, head ? wzClean(head.name) : (w.head ? w.head.name : w.headQ));
        }

        function wizardItems() {
            return state.wizard.q.map(function (question, index) {
                var filled = question.options.filter(function (option) { return wzText(option.label); });
                return { key: 'n' + index, index: index, id: question.id, raw: question.raw, label: wzText(question.name) || question.name, orig: !!question.orig, type: question.type,
                    typeName: question.type === 'select' ? 'Список' : 'Переключатель',
                    options: question.options.map(function (option) {
                        return { id: option.id, raw: option.raw, sort: option.sort, label: option.label, value: option.value, advice: option.advice, orig: !!option.orig };
                    }),
                    filled: filled.map(function (option) {
                        return { id: option.id, raw: option.raw, sort: option.sort, label: wzText(option.label), value: option.value, advice: option.advice, orig: !!option.orig };
                    }) };
            });
        }

        function wizardView() {
            var w = state.wizard;
            if (!w) return { status: 'loading' };
            if (['ready', 'applying', 'done'].indexOf(w.status) === -1) return { status: w.status, manual: w.manual };
            var scan = w.scan;
            var letter = wizardLetter();
            var items = wizardItems();
            var where = WZ_WHERE[w.entity] || '';
            var editHead = w.edit ? scan.heads[w.edit] : null;
            var ownHead = w.head && w.head.id && !w.edit ? wizardField(w.head.id) : null;
            var headTitle = wzText(w.head ? w.head.name : w.headQ) || (editHead ? editHead.title : 'Квалификация');
            var q = wzText(w.headQ).toLowerCase();
            var combo = w.fields.filter(function (field) {
                return field.type === 'text' && !wzBusy(field, scan) && (!q || String(field.name).toLowerCase().indexOf(q) !== -1);
            }).slice(0, 8).map(function (field) { return { id: field.id, label: field.name }; });
            var occupied = scan.used[letter] && letter !== w.edit;
            // Превью: ответ, выбранный кликом, иначе «Не выяснено».
            var done = 0;
            var blocked = 0;
            var tips = [];
            items.forEach(function (item) {
                var index = item.key in w.pv ? w.pv[item.key] : -1;
                if (index === -1) item.filled.some(function (option, i) { if (option.value === 'none') { index = i; return true; } return false; });
                item.previewIndex = index;
                item.previewValue = index > -1 && item.filled[index] ? item.filled[index].value : 'none';
                if (item.previewValue === 'ok') done++;
                if (item.previewValue === 'bad') {
                    blocked++;
                    tips.push(item.label + ': ' + (item.filled[index].advice || 'блокер — пункт не выполнен'));
                }
            });
            var changes = wizardPlan(true).rows;
            var emptyItem = items.filter(function (item) { return !item.filled.length; })[0];
            // Поле-флаг «100 %»: только «Флаг»; занятые другим чек-листом ({:done X}) выбрать нельзя.
            var doneFields = w.fields.filter(function (field) { return field.type === 'checkbox'; }).map(function (field) {
                var bound = String(field.name || '').match(WZ_DONE_RE);
                var owner = bound ? scan.heads[bound[1].toUpperCase()] : null;
                return { id: field.id, name: field.name, label: wzClean(field.name) || field.name, apiOnly: !!field.is_api_only,
                    busy: bound && bound[1].toUpperCase() !== (w.edit || letter) ? (owner ? owner.title : 'буква ' + bound[1]) : '' };
            });
            var donePicked = w.doneMode === 'pick' ? doneFields.filter(function (field) { return String(field.id) === String(w.donePick) && !field.busy; })[0] : null;
            var doneMissing = !w.doneExisting && w.doneOn && w.doneMode === 'pick' && !donePicked;
            var access = helpAccessStatus() === 'active';
            var admin = isTemplateAdmin();
            var noHead = !w.edit && !w.head;
            var existing = Object.keys(scan.heads).filter(function (key) { return scan.heads[key].checklist; }).map(function (key) {
                return { letter: key, name: scan.heads[key].title, count: (scan.members[key] || []).length };
            });
            return {
                status: w.status, manual: w.manual, step: w.step, message: w.message, letter: letter, where: where,
                entityName: WZ_ENTITY_NAMES[w.entity] || '', headTitle: headTitle, headQ: w.headQ, head: w.head, combo: w.combo, comboItems: combo,
                edit: w.edit ? { letter: w.edit, name: editHead ? editHead.title : '', raw: editHead ? editHead.field.name : '', count: (scan.members[w.edit] || []).length } : null,
                ownHead: ownHead ? ownHead.name : '', ltNote: w.ltNote || (occupied ? 'Буква «' + letter + '» уже занята — впишите другую.' : ''), note: w.note,
                existing: existing, items: items, changes: changes,
                preview: { percent: items.length ? Math.round(done * 100 / items.length) : 0, blocked: blocked > 0, complete: items.length > 0 && done === items.length, tips: tips },
                done: { on: w.doneOn, mode: w.doneMode, name: w.doneName, defaultName: headTitle + ' — выполнено', pick: w.donePick, fields: doneFields,
                    existing: w.doneExisting ? (wizardField(w.doneExisting) || {}).name : '', keep: w.doneKeep },
                canApply: access && admin && items.length > 0 && !emptyItem && !doneMissing && !noHead && !occupied && w.status === 'ready',
                applyNote: !access ? 'Создать можно после продления доступа' : !admin ? 'Создать может только администратор amoCRM' :
                    noHead ? 'Впишите название на шаге 1' : occupied ? 'Буква «' + letter + '» занята' :
                    !items.length ? 'Впишите вопросы на шаге 2' : emptyItem ? 'У вопроса «' + emptyItem.label + '» нет ответов' :
                    doneMissing ? 'Выберите поле «Флаг» для 100 % или создайте новое' : ''
            };
        }

        // План изменений чек-листа: строки «было → стало» (rows) и запросы create/patch.
        function wizardPlan(rowsOnly) {
            var w = state.wizard;
            var scan = w.scan;
            var letter = wizardLetter();
            var items = wizardItems();
            var rows = [];
            var create = [];
            var patch = [];
            var maxSort = 0;
            w.fields.forEach(function (field) { maxSort = Math.max(maxSort, Number(field.sort) || 0); });
            var editHead = w.edit ? scan.heads[w.edit] : null;
            var ownHead = !w.edit && w.head && w.head.id ? wizardField(w.head.id) : null;
            var target = editHead ? editHead.field.group_id : ownHead ? ownHead.group_id : null;
            var title = wzText(w.head ? w.head.name : w.headQ) || (editHead ? editHead.title : 'Квалификация');
            function placed(field, sort) {
                field.sort = sort;
                if (target) field.group_id = target;
                return field;
            }
            // Заголовок
            if (editHead) {
                var headNow = wzHeadRename(editHead.field.name, title, letter, editHead.mode, editHead.color);
                if (!WZ_CHECKLIST_RE.test(headNow)) headNow += ' {:checklist}';
                if (headNow !== editHead.field.name) {
                    rows.push({ was: 'было: ' + editHead.field.name, now: headNow });
                    patch.push({ id: editHead.field.id, name: headNow });
                }
            } else if (ownHead) {
                var ownNow = wzHeadName(wzClean(ownHead.name) || ownHead.name, letter, '4', '', true);
                rows.push({ was: 'было: ' + ownHead.name, now: ownNow });
                patch.push({ id: ownHead.id, name: ownNow });
            } else {
                var newHead = wzHeadName(title, letter, '4', '', true);
                rows.push({ was: 'новое поле «Текст»', now: newHead });
                create.push(placed({ type: 'text', name: newHead }, maxSort + 10));
            }
            // Вопросы
            items.forEach(function (item, index) {
                var enums = item.filled.map(function (option, k) { return { value: wzOptionValue(option.label, option.value, option.advice), sort: (k + 1) * 10 }; });
                if (!item.orig) {
                    var name = '[' + letter + '] ' + item.label;
                    rows.push({ was: 'новое поле «' + item.typeName + '»', now: name });
                    item.filled.forEach(function (option) { rows.push({ sub: true, was: 'ответ «' + option.label + '»', now: wzOptionValue(option.label, option.value, option.advice) }); });
                    create.push(placed({ type: item.type === 'select' ? 'select' : 'radiobutton', name: name, enums: enums }, maxSort + (index + 2) * 10));
                    return;
                }
                var field = wizardField(item.id);
                if (!field) return;
                var memberNow = wzSetMember(wzStripMember(field.name), letter);
                // Переименование: меняем только чистое название, маркеры и хвост сохраняем.
                var clean = wzClean(field.name);
                if (wzText(item.label) && wzText(item.label) !== clean) memberNow = memberNow.replace(clean, wzText(item.label));
                var enumRows = [];
                var nextSort = 0;
                (field.enums || []).forEach(function (en) { nextSort = Math.max(nextSort, Number(en.sort) || 0); });
                var enumList = (field.enums || []).map(function (en) {
                    var option = item.options.filter(function (o) { return o.id === en.id; })[0];
                    if (!option) return { id: en.id, value: en.value, sort: en.sort };
                    var value = wzOptionValue(wzText(option.label) || wzOptionState(en.value).label, option.value, option.advice);
                    if (value !== en.value) enumRows.push({ sub: true, was: 'было: ' + en.value, now: value });
                    return { id: en.id, value: value, sort: en.sort };
                });
                item.filled.filter(function (option) { return !option.orig; }).forEach(function (option) {
                    nextSort += 10;
                    var value = wzOptionValue(option.label, option.value, option.advice);
                    enumRows.push({ sub: true, was: 'новый ответ', now: value });
                    enumList.push({ value: value, sort: nextSort });
                });
                if (memberNow !== field.name || enumRows.length) {
                    rows.push({ was: 'было: ' + field.name, now: memberNow });
                    rows = rows.concat(enumRows);
                    patch.push({ id: field.id, name: memberNow, enums: enumList });
                }
            });
            // Убранные вопросы: снимаем маркер группы и отметки ответов, поле остаётся.
            w.removed.forEach(function (id) {
                var field = wizardField(id);
                if (!field) return;
                var name = wzStripMember(field.name);
                rows.push({ rm: true, was: 'было: ' + field.name, now: wzClean(field.name) + ' — уберём из чек-листа' });
                patch.push({ id: field.id, name: name, enums: (field.enums || []).map(function (en) {
                    return { id: en.id, value: String(en.value).replace(/^\[[+-]\]\s*/, '').replace(/\s*\{![^}]*\}\s*$/, ''), sort: en.sort };
                }) });
            });
            // Поле «100 %»
            var doneLetter = letter;
            if (w.doneExisting) {
                var doneField = wizardField(w.doneExisting);
                if (doneField) {
                    var doneNow = w.doneKeep ? wzDoneName(doneField.name, doneLetter) : wzDoneName(doneField.name, '');
                    if (doneNow !== doneField.name) {
                        rows.push(w.doneKeep ? { was: 'было: ' + doneField.name, now: doneNow } : { rm: true, was: 'было: ' + doneField.name, now: doneNow + ' — больше не отмечаем' });
                        patch.push({ id: doneField.id, name: doneNow });
                    }
                }
            } else if (w.doneOn) {
                var picked = w.doneMode === 'pick' ? wizardField(w.donePick) : null;
                if (picked) {
                    rows.push({ was: 'было: ' + picked.name, now: wzDoneName(picked.name, doneLetter) });
                    patch.push({ id: picked.id, name: wzDoneName(picked.name, doneLetter) });
                } else if (w.doneMode !== 'pick') {
                    var doneName = (wzText(w.doneName) || title + ' — выполнено') + ' {:done ' + doneLetter + '}';
                    rows.push({ was: 'новое поле «Флаг», только из API', now: doneName });
                    create.push(placed({ type: 'checkbox', is_api_only: true, name: doneName }, maxSort + (items.length + 2) * 10));
                }
            }
            return rowsOnly ? { rows: rows } : { rows: rows, create: create, patch: patch };
        }

        function renderWizard() {
            if (!state.helpPanel || state.helpFilter !== 'checklist') return;
            var $wrap = state.helpPanel.find('.dfh-wz-wrap');
            if ($wrap.length) wizardRender($wrap, helpUi.checklistWizard(wizardView()));
        }

        function applyWizard() {
            var w = state.wizard;
            var view = wizardView();
            if (!view.canApply) return;
            var plan = wizardPlan(false);
            if (!plan.create.length && !plan.patch.length) return;
            w.status = 'applying';
            w.message = '';
            renderWizard();
            wizardSend(w, plan.create, plan.patch).then(function () {
                if (state.wizard !== w) return;
                w.status = 'done';
                state.doneFields = {};
                state.gwizard = null;
                state.lwizard = null;
                renderWizard();
            }, function (error) {
                if (state.wizard !== w) return;
                w.status = 'ready';
                w.message = wizardFailMessage(error);
                renderWizard();
            });
        }

        function handleWizard(action, $el) {
            var w = state.wizard;
            if (action === 'manual' || action === 'auto') {
                if (w) w.manual = action === 'manual';
                else state.wizard = Object.assign(wizardBase('loading'), { manual: action === 'manual' });
                renderHelpContent(true);
                if (action === 'auto') loadWizard(false);
                return;
            }
            if (action === 'reload-fields' || action === 'again') return loadWizard(true);
            if (!w || w.status === 'applying' || w.status !== 'ready' && action !== 'go') return;
            var index = $el ? parseInt($el.attr('data-index'), 10) : NaN;
            var question = w.q[index];
            var opt = $el ? parseInt($el.attr('data-opt'), 10) : NaN;
            if (action === 'go') {
                if (!w.edit && !w.head && !wzText(w.headQ) && parseInt($el.attr('data-step'), 10) > 0) return state.helpPanel.find('[data-wz-input="head-q"]').trigger('focus');
                if (!w.edit && !w.head && wzText(w.headQ)) w.head = { name: wzText(w.headQ), isNew: true };
                w.step = Math.max(0, Math.min(3, parseInt($el.attr('data-step'), 10) || 0));
                w.combo = false;
            }
            if (action === 'head-new') { w.head = { name: wzText(w.headQ), isNew: true }; w.combo = false; }
            if (action === 'head-pick') {
                var picked = wizardField($el.attr('data-id'));
                if (picked) { w.head = { id: picked.id, name: wzClean(picked.name) || picked.name }; w.headQ = w.head.name; }
                w.combo = false;
            }
            if (action === 'head-clear') { w.head = null; w.combo = true; }
            if (action === 'edit') {
                var key = $el.attr('data-letter');
                if (w.scan.heads[key] && w.scan.heads[key].checklist) wizardEnterEdit(key);
            }
            if (action === 'new') {
                var fresh = wizardBase('ready', w.entity);
                fresh.fields = w.fields; fresh.tabs = w.tabs; fresh.scan = w.scan;
                state.wizard = w = fresh;
            }
            if (action === 'add') {
                var $input = state.helpPanel.find('[data-wz-input="new-item"]');
                var name = wzText($input.val());
                if (!name) return $input.trigger('focus');
                w.q.push(wizardQuestion(name));
            }
            if (action === 'del' && question) {
                if (question.orig && question.id) w.removed.push(question.id);
                w.q.splice(index, 1);
            }
            if (action === 'type' && question && !question.orig) question.type = $el.attr('data-type');
            if (action === 'ans' && question && question.options[opt]) question.options[opt].value = $el.attr('data-v');
            if (action === 'add-opt' && question) question.options.push({ label: '', value: 'none', advice: '' });
            if (action === 'del-opt' && question && question.options[opt] && !question.options[opt].orig) question.options.splice(opt, 1);
            if (action === 'pv') {
                var item = $el.attr('data-item');
                w.pv[item] = w.pv[item] === opt ? -1 : opt;
            }
            if (action === 'apply') return applyWizard();
            renderWizard();
            if (action === 'add') state.helpPanel.find('[data-wz-input="new-item"]').trigger('focus');
            if (action === 'add-opt') state.helpPanel.find('[data-wz-input="opt-label"][data-index="' + index + '"]').last().trigger('focus');
            if (action === 'head-clear') state.helpPanel.find('[data-wz-input="head-q"]').trigger('focus');
        }

        function wizardInput(kind, el) {
            var w = state.wizard;
            if (!w || w.status !== 'ready') return;
            var question = w.q[parseInt(el.getAttribute('data-index'), 10)];
            var option = question && question.options[parseInt(el.getAttribute('data-opt'), 10)];
            if (kind === 'head-q') { w.headQ = el.value; w.combo = true; return renderWizard(); }
            if (kind === 'head-name' && w.head) w.head.name = el.value;
            if (kind === 'letter') {
                var letter = wzLetter(el.value);
                if (!letter) return;
                if (!w.edit && w.scan.heads[letter] && w.scan.heads[letter].checklist) { wizardEnterEdit(letter); return renderWizard(); }
                w.letter = letter;
                w.letterTouched = true;
                w.ltNote = w.scan.used[letter] && letter !== w.edit ? 'Буква «' + letter + '» занята' + (w.scan.heads[letter] ? ': ' + (w.scan.heads[letter].checklist ? 'чек-лист' : 'группа') + ' «' + w.scan.heads[letter].title + '»' : '') + '. Впишите свободную.' : '';
                return renderWizard();
            }
            if (kind === 'item-name' && question) question.name = el.value;
            if (kind === 'opt-label' && option) option.label = el.value;
            if (kind === 'advice' && option) option.advice = el.value;
            if (kind === 'done-name') w.doneName = el.value;
        }

        function wizardChange(kind, el) {
            var w = state.wizard;
            if (!w) return;
            if (kind === 'done-on') w.doneOn = el.checked;
            if (kind === 'done-keep') w.doneKeep = el.checked;
            if (kind === 'done-mode') w.doneMode = el.value;
            if (kind === 'done-pick') w.donePick = el.value;
            renderWizard();
        }

        // ----- Мастер группы полей -----
        var GW_COLORS = ['7', '6', '5', '4', '3', '2', '1'];

        function groupBase(status, entity) {
            return { status: status, entity: entity || null, step: 0, headQ: '', head: null, combo: false, letter: '', letterTouched: false,
                ltNote: '', note: '', edit: null, mode: '2', color: '7', members: [], removed: [], fq: '', fqOpen: false, gopen: null, vals: {},
                fields: [], tabs: {}, scan: null, created: false, message: '', manual: state.gwizard ? state.gwizard.manual : false };
        }

        function loadGroupWizard(force) {
            var entity = getTemplateEntity();
            if (!entity) {
                state.gwizard = groupBase('noentity');
                return renderGroupWizard();
            }
            if (!force && state.gwizard && state.gwizard.entity === entity && ['ready', 'applying', 'done'].indexOf(state.gwizard.status) !== -1) return renderGroupWizard();
            var g = state.gwizard = groupBase('loading', entity);
            renderGroupWizard();
            Promise.all([fetchWizardFields(entity), fetchWizardTabs(entity)]).then(function (result) {
                if (state.gwizard !== g) return;
                g.fields = result[0];
                g.tabs = result[1];
                g.scan = wzScan(g.fields);
                g.status = 'ready';
                renderGroupWizard();
            }, function () {
                if (state.gwizard !== g) return;
                g.status = 'error';
                renderGroupWizard();
            });
        }

        function groupField(id) {
            var list = (state.gwizard && state.gwizard.fields) || [];
            return list.filter(function (field) { return String(field.id) === String(id); })[0] || null;
        }

        function groupEnterEdit(letter) {
            var g = state.gwizard;
            var head = g.scan.heads[letter];
            if (!head || head.checklist) return;
            g.edit = letter;
            g.letter = letter;
            g.letterTouched = false;
            g.head = { id: head.field.id, name: head.title, existing: true };
            g.headQ = head.title;
            g.mode = head.mode;
            g.color = head.color || '7';
            g.members = (g.scan.members[letter] || []).map(function (field) { return { id: field.id, orig: true }; });
            g.removed = [];
            g.step = 0;
            g.ltNote = '';
            g.note = '';
            g.gopen = null;
            g.vals = {};
            g.created = false;
            g.message = '';
        }

        function groupLetter() {
            var g = state.gwizard;
            if (g.edit) return wzLetter(g.letter) || g.edit;
            if (g.letterTouched && wzLetter(g.letter)) return wzLetter(g.letter);
            var head = g.head && g.head.id ? groupField(g.head.id) : null;
            return wzFreeLetter(g.scan, head ? wzClean(head.name) : (g.head ? g.head.name : g.headQ));
        }

        function groupMembers() {
            var g = state.gwizard;
            return g.members.map(function (member, index) {
                if (member.isNew) return { index: index, isNew: true, label: member.name, typeName: 'Текст, новое' };
                var field = groupField(member.id);
                return field ? { index: index, id: field.id, orig: !!member.orig, label: wzClean(field.name) || field.name, raw: field.name,
                    typeName: WZ_TYPE_NAMES[field.type] || field.type } : null;
            }).filter(Boolean);
        }

        var WZ_TYPE_NAMES = { text: 'Текст', numeric: 'Число', checkbox: 'Флаг', select: 'Список', multiselect: 'Мультисписок', date: 'Дата', url: 'Ссылка',
            textarea: 'Текстовая область', radiobutton: 'Переключатель', streetaddress: 'Адрес', smart_address: 'Адрес', birthday: 'День рождения',
            legal_entity: 'Юр. лицо', date_time: 'Дата и время', price: 'Цена', category: 'Категория', items: 'Предметы', monetary: 'Деньги' };

        function groupView() {
            var g = state.gwizard;
            if (!g) return { status: 'loading' };
            if (['ready', 'applying', 'done'].indexOf(g.status) === -1) return { status: g.status, manual: g.manual };
            var scan = g.scan;
            var letter = groupLetter();
            var members = groupMembers();
            var editHead = g.edit ? scan.heads[g.edit] : null;
            var title = wzText(g.head ? g.head.name : g.headQ) || (editHead ? editHead.title : '');
            var q = wzText(g.headQ).toLowerCase();
            var combo = g.fields.filter(function (field) {
                return field.type === 'text' && !wzBusy(field, scan) && (!q || String(field.name).toLowerCase().indexOf(q) !== -1);
            }).slice(0, 8).map(function (field) { return { id: field.id, label: field.name }; });
            var chosen = {};
            g.members.forEach(function (member) { if (member.id) chosen[member.id] = true; });
            var fq = wzText(g.fq).toLowerCase();
            var fqItems = fq ? g.fields.filter(function (field) {
                if (chosen[field.id] || (g.head && String(g.head.id) === String(field.id))) return false;
                if (g.removed.indexOf(field.id) !== -1) return String(field.name).toLowerCase().indexOf(fq) !== -1;
                return !wzBusy(field, scan) && String(field.name).toLowerCase().indexOf(fq) !== -1;
            }).slice(0, 8).map(function (field) { return { id: field.id, label: wzClean(field.name) || field.name, typeName: WZ_TYPE_NAMES[field.type] || field.type }; }) : [];
            var occupied = scan.used[letter] && letter !== g.edit;
            var existing = Object.keys(scan.heads).map(function (key) {
                var head = scan.heads[key];
                return { letter: key, name: head.title, color: head.color, checklist: head.checklist, count: (scan.members[key] || []).length };
            });
            var filled = members.filter(function (m) { return g.vals[m.index]; }).length;
            var closedAuto = g.mode === '1' ? true : g.mode === '2' ? !filled : g.mode === '3' ? false : members.length > 0 && filled === members.length;
            var access = helpAccessStatus() === 'active';
            var admin = isTemplateAdmin();
            var noHead = !g.edit && !g.head;
            return {
                status: g.status, manual: g.manual, step: g.step, message: g.message, letter: letter, where: WZ_WHERE[g.entity] || '',
                entityName: WZ_ENTITY_NAMES[g.entity] || '', title: title || 'Новая группа', headQ: g.headQ, head: g.head, combo: g.combo, comboItems: combo,
                edit: g.edit ? { letter: g.edit, name: editHead ? editHead.title : '', raw: editHead ? editHead.field.name : '', count: (scan.members[g.edit] || []).length } : null,
                ltNote: g.ltNote || (occupied ? 'Буква «' + letter + '» уже занята — впишите другую.' : ''), note: g.note, existing: existing,
                mode: g.mode, color: g.color, members: members, fq: g.fq, fqOpen: g.fqOpen, fqItems: fqItems, changes: groupPlan(true).rows,
                preview: { closed: g.gopen === null ? closedAuto : !g.gopen, vals: g.vals },
                canApply: access && admin && !noHead && !occupied && members.length > 0 && g.status === 'ready' && groupPlan(true).rows.length > 0,
                applyNote: !access ? 'Сохранить можно после продления доступа' : !admin ? 'Менять поля может только администратор amoCRM' :
                    noHead ? 'Впишите название на шаге 1' : occupied ? 'Буква «' + letter + '» занята' : !members.length ? 'Добавьте хотя бы одно поле на шаге 3' : ''
            };
        }

        function groupPlan(rowsOnly) {
            var g = state.gwizard;
            var scan = g.scan;
            var letter = groupLetter();
            var rows = [];
            var create = [];
            var patch = [];
            var maxSort = 0;
            g.fields.forEach(function (field) { maxSort = Math.max(maxSort, Number(field.sort) || 0); });
            var editHead = g.edit ? scan.heads[g.edit] : null;
            var ownHead = !g.edit && g.head && g.head.id ? groupField(g.head.id) : null;
            var firstMember = g.members.filter(function (m) { return m.id; })[0];
            var target = editHead ? editHead.field.group_id : ownHead ? ownHead.group_id : firstMember ? (groupField(firstMember.id) || {}).group_id : null;
            var title = wzText(g.head ? g.head.name : g.headQ) || (editHead ? editHead.title : '');
            function placed(field, sort) {
                field.sort = sort;
                if (target) field.group_id = target;
                return field;
            }
            if (editHead) {
                var headNow = wzHeadRename(editHead.field.name, title, letter, g.mode, g.color);
                if (headNow !== editHead.field.name) {
                    rows.push({ was: 'было: ' + editHead.field.name, now: headNow });
                    patch.push({ id: editHead.field.id, name: headNow });
                }
            } else if (ownHead) {
                var ownNow = wzHeadRename(ownHead.name, '', letter, g.mode, g.color);
                rows.push({ was: 'было: ' + ownHead.name, now: ownNow });
                patch.push({ id: ownHead.id, name: ownNow });
            } else if (title) {
                var newHead = wzHeadName(title, letter, g.mode, g.color, false);
                rows.push({ was: 'новое поле «Текст»', now: newHead });
                create.push(placed({ type: 'text', name: newHead }, maxSort + 10));
            }
            g.members.forEach(function (member, index) {
                if (member.isNew) {
                    var name = '[' + letter + '] ' + wzText(member.name);
                    rows.push({ was: 'новое поле «Текст»', now: name });
                    create.push(placed({ type: 'text', name: name }, maxSort + (index + 2) * 10));
                    return;
                }
                var field = groupField(member.id);
                if (!field) return;
                var now = wzSetMember(wzStripMember(field.name), letter);
                if (now !== field.name) {
                    rows.push({ was: 'было: ' + field.name, now: now });
                    patch.push({ id: field.id, name: now });
                }
            });
            g.removed.forEach(function (id) {
                var field = groupField(id);
                if (!field) return;
                rows.push({ rm: true, was: 'было: ' + field.name, now: (wzClean(field.name) || field.name) + ' — уберём из группы' });
                patch.push({ id: field.id, name: wzStripMember(field.name) });
            });
            // Сменили букву группы — переписываем и варианты, которые её показывают ([@Старая] → [@Новая]).
            if (g.edit && letter !== g.edit) {
                var switchRe = new RegExp('^\\s*\\[@' + g.edit + '\\]', 'i');
                g.fields.forEach(function (field) {
                    if (!Array.isArray(field.enums) || !field.enums.some(function (en) { return switchRe.test(en.value); })) return;
                    patch.push({ id: field.id, name: field.name, enums: field.enums.map(function (en) {
                        var value = String(en.value).replace(switchRe, '[@' + letter + ']');
                        if (value !== en.value) rows.push({ sub: true, was: 'вариант в «' + (wzClean(field.name) || field.name) + '»: ' + en.value, now: value });
                        return { id: en.id, value: value, sort: en.sort };
                    }) });
                });
            }
            return rowsOnly ? { rows: rows } : { rows: rows, create: create, patch: patch };
        }

        function renderGroupWizard() {
            if (!state.helpPanel || state.helpFilter !== 'group') return;
            var $wrap = state.helpPanel.find('.dfh-gw-wrap');
            if ($wrap.length) wizardRender($wrap, helpUi.groupWizard(groupView()));
        }

        function applyGroupWizard() {
            var g = state.gwizard;
            if (!groupView().canApply) return;
            var plan = groupPlan(false);
            g.status = 'applying';
            g.message = '';
            renderGroupWizard();
            wizardSend(g, plan.create, plan.patch).then(function () {
                if (state.gwizard !== g) return;
                g.status = 'done';
                // Поля изменились — другие мастера перечитают их при следующем открытии.
                state.wizard = null;
                state.lwizard = null;
                renderGroupWizard();
            }, function (error) {
                if (state.gwizard !== g) return;
                g.status = 'ready';
                g.message = wizardFailMessage(error);
                renderGroupWizard();
            });
        }

        function handleGroupWizard(action, $el) {
            var g = state.gwizard;
            if (action === 'manual' || action === 'auto') {
                if (g) g.manual = action === 'manual';
                else state.gwizard = Object.assign(groupBase('loading'), { manual: action === 'manual' });
                renderHelpContent(true);
                if (action === 'auto') loadGroupWizard(false);
                return;
            }
            if (action === 'reload-fields' || action === 'again') return loadGroupWizard(true);
            if (!g || g.status !== 'ready') return;
            var index = $el ? parseInt($el.attr('data-index'), 10) : NaN;
            if (action === 'go') {
                if (!g.edit && !g.head && !wzText(g.headQ) && parseInt($el.attr('data-step'), 10) > 0) return state.helpPanel.find('[data-gw-input="head-q"]').trigger('focus');
                if (!g.edit && !g.head && wzText(g.headQ)) g.head = { name: wzText(g.headQ), isNew: true };
                g.step = Math.max(0, Math.min(3, parseInt($el.attr('data-step'), 10) || 0));
                g.gopen = null;
                g.fqOpen = false;
                g.combo = false;
            }
            if (action === 'head-new') { g.head = { name: wzText(g.headQ), isNew: true }; g.combo = false; }
            if (action === 'head-pick') {
                var picked = groupField($el.attr('data-id'));
                if (picked) { g.head = { id: picked.id, name: wzClean(picked.name) || picked.name }; g.headQ = g.head.name; }
                g.combo = false;
            }
            if (action === 'head-clear') { g.head = null; g.combo = true; }
            if (action === 'edit') {
                var key = $el.attr('data-letter');
                var head = g.scan.heads[key];
                if (head && head.checklist) g.note = '«' + key + '» — чек-лист «' + head.title + '». Изменить его можно в разделе «Чек-листы».';
                else if (head) groupEnterEdit(key);
            }
            if (action === 'new') {
                var fresh = groupBase('ready', g.entity);
                fresh.fields = g.fields; fresh.tabs = g.tabs; fresh.scan = g.scan;
                state.gwizard = g = fresh;
            }
            if (action === 'mode') g.mode = $el.attr('data-mode');
            if (action === 'color') g.color = $el.attr('data-color');
            if (action === 'pick') {
                var id = Number($el.attr('data-id'));
                var was = g.removed.indexOf(id);
                if (was !== -1) { g.removed.splice(was, 1); g.members.push({ id: id, orig: true }); }
                else g.members.push({ id: id });
                g.fq = '';
                g.fqOpen = false;
            }
            if (action === 'create') {
                var name = wzText(g.fq);
                if (name) g.members.push({ isNew: true, name: name });
                g.fq = '';
                g.fqOpen = false;
            }
            if (action === 'del' && g.members[index]) {
                var member = g.members[index];
                if (member.orig && member.id) g.removed.push(member.id);
                g.members.splice(index, 1);
            }
            if (action === 'toggle') g.gopen = !!$el.closest('.dfh-gw-box').hasClass('closed');
            if (action === 'apply') return applyGroupWizard();
            renderGroupWizard();
            if (action === 'pick' || action === 'create') state.helpPanel.find('[data-gw-input="fq"]').trigger('focus');
            if (action === 'head-clear') state.helpPanel.find('[data-gw-input="head-q"]').trigger('focus');
        }

        function groupInput(kind, el) {
            var g = state.gwizard;
            if (!g || g.status !== 'ready') return;
            if (kind === 'head-q') { g.headQ = el.value; g.combo = true; return renderGroupWizard(); }
            if (kind === 'head-name' && g.head) g.head.name = el.value;
            if (kind === 'fq') { g.fq = el.value; g.fqOpen = !!wzText(el.value); return renderGroupWizard(); }
            if (kind === 'val') g.vals[el.getAttribute('data-index')] = el.value;
            if (kind === 'letter') {
                var letter = wzLetter(el.value);
                if (!letter) return;
                var head = g.scan.heads[letter];
                if (!g.edit && head && !head.checklist) { groupEnterEdit(letter); return renderGroupWizard(); }
                g.letter = letter;
                g.letterTouched = true;
                g.ltNote = g.scan.used[letter] && letter !== g.edit ? 'Буква «' + letter + '» занята' + (head ? ': ' + (head.checklist ? 'чек-лист' : 'группа') + ' «' + head.title + '»' : '') + '. Впишите свободную.' : '';
                renderGroupWizard();
            }
        }


        // ----- Мастер связанных групп (2.0.2, макет business/assets/mockups/dynamic-fields-linked-groups/wizard.html) -----
        // Поле «Переключатель»/«Список»: каждому варианту — группа ([@Буква] в начале варианта). Своё поле: варианты и тип не меняем.
        var LW_SWITCH_RE = /^\s*\[@([A-Za-zА-Яа-яЁё])\]\s*/;

        function linkedBase(status, entity) {
            return { status: status, entity: entity || null, step: 0, q: '', combo: false, field: null, type: 'radiobutton', opts: [], newOpt: '', pv: null,
                fields: [], scan: null, created: false, message: '', manual: state.lwizard ? state.lwizard.manual : false };
        }

        function linkedSwitchers(fields) {
            return fields.filter(function (field) {
                return (field.type === 'select' || field.type === 'radiobutton') && (field.enums || []).some(function (en) { return LW_SWITCH_RE.test(en.value); });
            });
        }

        function loadLinkedWizard(force) {
            var entity = getTemplateEntity();
            if (!entity) {
                state.lwizard = linkedBase('noentity');
                return renderLinkedWizard();
            }
            if (!force && state.lwizard && state.lwizard.entity === entity && ['ready', 'applying', 'done'].indexOf(state.lwizard.status) !== -1) return renderLinkedWizard();
            var l = state.lwizard = linkedBase('loading', entity);
            renderLinkedWizard();
            fetchWizardFields(entity).then(function (fields) {
                if (state.lwizard !== l) return;
                l.fields = fields;
                l.scan = wzScan(fields);
                l.status = 'ready';
                renderLinkedWizard();
            }, function () {
                if (state.lwizard !== l) return;
                l.status = 'error';
                renderLinkedWizard();
            });
        }

        function linkedField(id) {
            var list = (state.lwizard && state.lwizard.fields) || [];
            return list.filter(function (field) { return String(field.id) === String(id); })[0] || null;
        }

        function linkedPick(field) {
            var l = state.lwizard;
            l.field = { id: field.id, name: wzClean(field.name) || field.name, raw: field.name, type: field.type };
            l.q = l.field.name;
            l.combo = false;
            l.pv = null;
            l.opts = (field.enums || []).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }).map(function (en) {
                var sw = String(en.value).match(LW_SWITCH_RE);
                return { id: en.id, raw: en.value, sort: en.sort, label: String(en.value).replace(LW_SWITCH_RE, ''), g: sw ? sw[1].toUpperCase() : '', orig: true };
            });
        }

        function linkedGroups() {
            var scan = state.lwizard.scan;
            return Object.keys(scan.heads).filter(function (key) { return !scan.heads[key].checklist; }).map(function (key) {
                return { letter: key, name: scan.heads[key].title, color: scan.heads[key].color || '7',
                    fields: (scan.members[key] || []).map(function (field) { return wzClean(field.name) || field.name; }) };
            });
        }

        function linkedView() {
            var l = state.lwizard;
            if (!l) return { status: 'loading' };
            if (['ready', 'applying', 'done'].indexOf(l.status) === -1) return { status: l.status, manual: l.manual };
            var q = wzText(l.q).toLowerCase();
            var switchers = linkedSwitchers(l.fields);
            var combo = l.fields.filter(function (field) {
                return (field.type === 'select' || field.type === 'radiobutton') && !field.is_predefined && !wzBusy(field, l.scan) &&
                    switchers.indexOf(field) === -1 && (!q || String(field.name).toLowerCase().indexOf(q) !== -1);
            }).slice(0, 8).map(function (field) {
                return { id: field.id, label: field.name, typeName: WZ_TYPE_NAMES[field.type], count: (field.enums || []).length };
            });
            var groups = linkedGroups();
            var byLetter = {};
            groups.forEach(function (group) { byLetter[group.letter] = group; });
            var opts = l.opts.map(function (opt, i) { return { index: i, label: opt.label, g: opt.g, orig: !!opt.orig }; });
            var plan = linkedPlan(true);
            var pvOpt = l.pv !== null && l.opts[l.pv] ? l.opts[l.pv] : null;
            var radio = l.field && (l.field.isNew ? l.type === 'radiobutton' : l.field.type === 'radiobutton');
            var access = helpAccessStatus() === 'active';
            var admin = isTemplateAdmin();
            var linked = l.opts.filter(function (opt) { return opt.g && wzText(opt.label); }).length;
            return {
                status: l.status, manual: l.manual, step: l.step, message: l.message, where: WZ_WHERE[l.entity] || '',
                q: l.q, combo: l.combo, comboItems: combo, field: l.field, type: l.type, edit: !!(l.field && !l.field.isNew && switchers.some(function (f) { return f.id === l.field.id; })),
                existing: switchers.map(function (field) {
                    return { id: field.id, name: wzClean(field.name) || field.name, letters: (field.enums || []).map(function (en) {
                        var m = String(en.value).match(LW_SWITCH_RE); return m ? '[' + m[1].toUpperCase() + ']' : ''; }).filter(Boolean).join(' ') };
                }),
                groups: groups, opts: opts, newOpt: l.newOpt, changes: plan.rows, radio: radio,
                preview: { index: l.pv, group: pvOpt && pvOpt.g ? byLetter[pvOpt.g] || null : null,
                    hidden: l.opts.map(function (opt) { return opt.g && byLetter[opt.g] ? byLetter[opt.g].name : ''; }).filter(Boolean) },
                canApply: access && admin && !!l.field && linked > 0 && plan.rows.length > 0 && l.status === 'ready',
                applyNote: !access ? 'Сохранить можно после продления доступа' : !admin ? 'Менять поля может только администратор amoCRM' :
                    !l.field ? 'Впишите название или выберите поле на шаге 1' : !linked ? 'Привяжите группу хотя бы к одному варианту' : ''
            };
        }

        function linkedPlan(rowsOnly) {
            var l = state.lwizard;
            var rows = [];
            var create = [];
            var patch = [];
            if (!l.field) return { rows: rows, create: create, patch: patch };
            if (l.field.isNew) {
                var maxSort = 0;
                l.fields.forEach(function (field) { maxSort = Math.max(maxSort, Number(field.sort) || 0); });
                var opts = l.opts.filter(function (opt) { return wzText(opt.label); });
                rows.push({ was: 'новое поле «' + (l.type === 'select' ? 'Список' : 'Переключатель') + '»', now: wzText(l.field.name) });
                opts.forEach(function (opt) { rows.push({ sub: true, was: 'вариант', now: (opt.g ? '[@' + opt.g + '] ' : '') + wzText(opt.label) }); });
                create.push({ type: l.type === 'select' ? 'select' : 'radiobutton', name: wzText(l.field.name), sort: maxSort + 10,
                    enums: opts.map(function (opt, k) { return { value: (opt.g ? '[@' + opt.g + '] ' : '') + wzText(opt.label), sort: (k + 1) * 10 }; }) });
            } else {
                var field = linkedField(l.field.id);
                if (field) {
                    var changed = false;
                    var enums = (field.enums || []).map(function (en) {
                        var opt = l.opts.filter(function (o) { return o.id === en.id; })[0];
                        var value = opt ? (opt.g ? '[@' + opt.g + '] ' : '') + String(en.value).replace(LW_SWITCH_RE, '') : en.value;
                        if (value !== en.value) {
                            changed = true;
                            rows.push({ sub: true, was: 'вариант «' + String(en.value).replace(LW_SWITCH_RE, '') + '»' + (LW_SWITCH_RE.test(en.value) ? ': ' + en.value : ''), now: value });
                        }
                        return { id: en.id, value: value, sort: en.sort };
                    });
                    if (changed) patch.push({ id: field.id, name: field.name, enums: enums });
                }
            }
            return rowsOnly ? { rows: rows } : { rows: rows, create: create, patch: patch };
        }

        function renderLinkedWizard() {
            if (!state.helpPanel || state.helpFilter !== 'switch') return;
            var $wrap = state.helpPanel.find('.dfh-lw-wrap');
            if ($wrap.length) wizardRender($wrap, helpUi.linkedWizard(linkedView()));
        }

        function applyLinkedWizard() {
            var l = state.lwizard;
            if (!linkedView().canApply) return;
            var plan = linkedPlan(false);
            l.status = 'applying';
            l.message = '';
            renderLinkedWizard();
            wizardSend(l, plan.create, plan.patch).then(function () {
                if (state.lwizard !== l) return;
                l.status = 'done';
                state.wizard = null;
                state.gwizard = null;
                renderLinkedWizard();
            }, function (error) {
                if (state.lwizard !== l) return;
                l.status = 'ready';
                l.message = wizardFailMessage(error);
                renderLinkedWizard();
            });
        }

        function handleLinkedWizard(action, $el) {
            var l = state.lwizard;
            if (action === 'manual' || action === 'auto') {
                if (l) l.manual = action === 'manual';
                else state.lwizard = Object.assign(linkedBase('loading'), { manual: action === 'manual' });
                renderHelpContent(true);
                if (action === 'auto') loadLinkedWizard(false);
                return;
            }
            if (action === 'reload-fields' || action === 'again') return loadLinkedWizard(true);
            if (!l || l.status !== 'ready') return;
            var index = $el ? parseInt($el.attr('data-index'), 10) : NaN;
            if (action === 'go') {
                if (!l.field && !wzText(l.q) && parseInt($el.attr('data-step'), 10) > 0) return state.helpPanel.find('[data-lw-input="q"]').trigger('focus');
                if (!l.field && wzText(l.q)) { l.field = { name: wzText(l.q), isNew: true }; l.opts = [{ label: '', g: '' }, { label: '', g: '' }]; }
                l.step = Math.max(0, Math.min(2, parseInt($el.attr('data-step'), 10) || 0));
                l.combo = false;
            }
            if (action === 'field-new') { l.field = { name: wzText(l.q), isNew: true }; l.opts = [{ label: '', g: '' }, { label: '', g: '' }]; l.combo = false; l.pv = null; }
            if (action === 'field-pick' || action === 'edit') { var field = linkedField($el.attr('data-id')); if (field) linkedPick(field); }
            if (action === 'field-clear') { l.field = null; l.opts = []; l.combo = true; l.pv = null; }
            if (action === 'type') l.type = $el.attr('data-type');
            if (action === 'opt-add') {
                var name = wzText(l.newOpt);
                if (name) l.opts.push({ label: name, g: '' });
                l.newOpt = '';
            }
            if (action === 'opt-del' && l.opts[index] && !l.opts[index].orig) l.opts.splice(index, 1);
            if (action === 'pv') l.pv = l.pv === index ? null : index;
            if (action === 'apply') return applyLinkedWizard();
            renderLinkedWizard();
            if (action === 'opt-add') state.helpPanel.find('[data-lw-input="new-opt"]').trigger('focus');
            if (action === 'field-clear') state.helpPanel.find('[data-lw-input="q"]').trigger('focus');
        }

        function linkedInput(kind, el) {
            var l = state.lwizard;
            if (!l || l.status !== 'ready') return;
            var opt = l.opts[parseInt(el.getAttribute('data-index'), 10)];
            if (kind === 'q') { l.q = el.value; l.combo = true; return renderLinkedWizard(); }
            if (kind === 'opt' && opt && !opt.orig) opt.label = el.value;
            if (kind === 'new-opt') l.newOpt = el.value;
            if (kind === 'group' && opt) { opt.g = el.value; renderLinkedWizard(); }
            if (kind === 'pv') { l.pv = el.value === '' ? null : parseInt(el.value, 10); renderLinkedWizard(); }
        }


        // ----- «Расположение» без «Вставить» (2.0.3, макет business/assets/mockups/dynamic-fields-view/variants.html) -----
        // Список полей «Текстовая область» с {:col}, «+ Добавить поле» (поиск по текстовым областям или новое поле), крестик — убрать.
        var VW_COL_RE = /\s*\{:\s*col\s*\}/gi;

        function viewBase(status, entity) {
            return { status: status, entity: entity || null, fields: [], add: [], rm: [], newNames: [], created: false, adding: false, q: '', message: '',
                manual: state.vwizard ? state.vwizard.manual : false };
        }

        function loadViewWizard(force) {
            var entity = getTemplateEntity();
            if (!entity) {
                state.vwizard = viewBase('noentity');
                return renderViewWizard();
            }
            if (!force && state.vwizard && state.vwizard.entity === entity && ['ready', 'applying', 'done'].indexOf(state.vwizard.status) !== -1) return renderViewWizard();
            var v = state.vwizard = viewBase('loading', entity);
            renderViewWizard();
            fetchWizardFields(entity).then(function (fields) {
                if (state.vwizard !== v) return;
                v.fields = fields;
                v.status = 'ready';
                renderViewWizard();
            }, function () {
                if (state.vwizard !== v) return;
                v.status = 'error';
                renderViewWizard();
            });
        }

        function viewHasCol(field) {
            return /\{:\s*col\s*\}/i.test(String(field.name || ''));
        }

        function viewView() {
            var v = state.vwizard;
            if (!v) return { status: 'loading' };
            if (['ready', 'applying', 'done'].indexOf(v.status) === -1) return { status: v.status, manual: v.manual };
            var areas = v.fields.filter(function (field) { return field.type === 'textarea' && !field.is_predefined; });
            var q = wzText(v.q).toLowerCase();
            var rows = areas.filter(viewHasCol).map(function (field) {
                return { id: field.id, label: wzClean(field.name) || field.name, state: v.rm.indexOf(field.id) !== -1 ? 'rm' : '' };
            }).concat(v.add.map(function (id) {
                var field = areas.filter(function (f) { return f.id === id; })[0];
                return field ? { id: id, label: wzClean(field.name) || field.name, state: 'add' } : null;
            }).filter(Boolean)).concat(v.newNames.map(function (name, i) { return { index: i, label: name, state: 'new' }; }));
            var items = areas.filter(function (field) {
                return !viewHasCol(field) && v.add.indexOf(field.id) === -1 && (!q || String(field.name).toLowerCase().indexOf(q) !== -1);
            }).slice(0, 8).map(function (field) { return { id: field.id, label: wzClean(field.name) || field.name }; });
            var count = v.add.length + v.rm.length + v.newNames.length;
            var access = helpAccessStatus() === 'active';
            var admin = isTemplateAdmin();
            return { status: v.status, manual: v.manual, message: v.message, rows: rows, adding: v.adding, q: v.q, items: items, count: count,
                canApply: access && admin && count > 0 && v.status === 'ready',
                applyNote: !access ? 'Сохранить можно после продления доступа' : !admin ? 'Менять поля может только администратор amoCRM' : count ? 'Изменений: ' + count : 'Изменений нет' };
        }

        function renderViewWizard() {
            if (!state.helpPanel || state.helpFilter !== 'view') return;
            var $wrap = state.helpPanel.find('.dfh-vw-wrap');
            if ($wrap.length) wizardRender($wrap, helpUi.viewWizard(viewView()));
        }

        function applyViewWizard() {
            var v = state.vwizard;
            if (!viewView().canApply) return;
            var maxSort = 0;
            v.fields.forEach(function (field) { maxSort = Math.max(maxSort, Number(field.sort) || 0); });
            var byId = {};
            v.fields.forEach(function (field) { byId[field.id] = field; });
            var patch = v.add.map(function (id) { return { id: id, name: String(byId[id].name).replace(VW_COL_RE, '').trim() + ' {:col}' }; })
                .concat(v.rm.map(function (id) { return { id: id, name: String(byId[id].name).replace(VW_COL_RE, '').trim() }; }));
            var create = v.newNames.map(function (name, i) { return { type: 'textarea', name: name + ' {:col}', sort: maxSort + (i + 1) * 10 }; });
            v.status = 'applying';
            v.message = '';
            renderViewWizard();
            wizardSend(v, create, patch).then(function () {
                if (state.vwizard !== v) return;
                v.status = 'done';
                renderViewWizard();
            }, function (error) {
                if (state.vwizard !== v) return;
                v.status = 'ready';
                v.message = wizardFailMessage(error);
                renderViewWizard();
            });
        }

        function handleViewWizard(action, $el) {
            var v = state.vwizard;
            if (action === 'manual' || action === 'auto') {
                if (v) v.manual = action === 'manual';
                else state.vwizard = Object.assign(viewBase('loading'), { manual: action === 'manual' });
                renderHelpContent(true);
                if (action === 'auto') loadViewWizard(false);
                return;
            }
            if (action === 'reload-fields' || action === 'again') return loadViewWizard(true);
            if (!v || v.status !== 'ready') return;
            var id = $el ? Number($el.attr('data-id')) : NaN;
            if (action === 'adding') v.adding = true;
            if (action === 'pick') { v.add.push(id); v.q = ''; v.adding = false; }
            if (action === 'create') { var name = wzText(v.q); if (name) v.newNames.push(name); v.q = ''; v.adding = false; }
            if (action === 'rm' && v.rm.indexOf(id) === -1) v.rm.push(id);
            if (action === 'undo') v.rm.splice(v.rm.indexOf(id), 1);
            if (action === 'unadd') v.add.splice(v.add.indexOf(id), 1);
            if (action === 'uncreate') v.newNames.splice(parseInt($el.attr('data-index'), 10), 1);
            if (action === 'apply') return applyViewWizard();
            renderViewWizard();
            if (action === 'adding') state.helpPanel.find('[data-vw-input="q"]').trigger('focus');
        }


        // ----- «Подсветка» без «Вставить» (2.0.4, макет business/assets/mockups/dynamic-fields-view/highlight.html) -----
        // Поля с цветом ([/N/] или [Буква /N/] у поля группы), выбор цвета справа, «+ Добавить поле», крестик — снять цвет.
        var HL_COLOR_RE = /^\s*\[\/([1-8])\/\]\s*/;

        function hlState(name) {
            var text = String(name || '').trim();
            if (WZ_HEAD_RE.test(text)) return null;
            var member = text.match(WZ_MEMBER_RE);
            if (member) return { color: member[2] || '', group: member[1].toUpperCase() };
            var color = text.match(HL_COLOR_RE);
            return { color: color ? color[1] : '', group: '' };
        }

        function hlSet(name, color) {
            var text = String(name || '').trim();
            var member = text.match(WZ_MEMBER_RE);
            if (member && !WZ_HEAD_RE.test(text)) return '[' + member[1] + (color ? ' /' + color + '/' : '') + '] ' + text.slice(member[0].length);
            var rest = text.replace(HL_COLOR_RE, '');
            return color ? '[/' + color + '/] ' + rest : rest;
        }

        function hlBase(status, entity) {
            return { status: status, entity: entity || null, fields: [], colors: {}, rm: [], adds: [], news: [], open: '', adding: false, q: '', message: '', created: false };
        }

        function loadHlWizard(force) {
            var entity = getTemplateEntity();
            if (!entity) {
                state.hwizard = hlBase('noentity');
                return renderHlWizard();
            }
            if (!force && state.hwizard && state.hwizard.entity === entity && ['ready', 'applying', 'done'].indexOf(state.hwizard.status) !== -1) return renderHlWizard();
            var h = state.hwizard = hlBase('loading', entity);
            renderHlWizard();
            fetchWizardFields(entity).then(function (fields) {
                if (state.hwizard !== h) return;
                h.fields = fields;
                h.status = 'ready';
                renderHlWizard();
            }, function () {
                if (state.hwizard !== h) return;
                h.status = 'error';
                renderHlWizard();
            });
        }

        function hlView() {
            var h = state.hwizard;
            if (!h) return { status: 'loading' };
            if (['ready', 'applying', 'done'].indexOf(h.status) === -1) return { status: h.status };
            var byId = {};
            h.fields.forEach(function (field) { byId[field.id] = field; });
            var current = h.fields.filter(function (field) {
                var st = !field.is_predefined && hlState(field.name);
                return st && st.color;
            });
            var rows = current.map(function (field) {
                var st = hlState(field.name);
                var color = h.colors[field.id] || st.color;
                return { key: 'r' + field.id, id: field.id, label: wzClean(field.name) || field.name, typeName: WZ_TYPE_NAMES[field.type] || field.type, group: st.group,
                    color: color, state: h.rm.indexOf(field.id) !== -1 ? 'rm' : color !== st.color ? 'ch' : '' };
            }).concat(h.adds.map(function (add, i) {
                var field = byId[add.id];
                var st = hlState(field.name) || {};
                return { key: 'a' + i, index: i, id: add.id, label: wzClean(field.name) || field.name, typeName: WZ_TYPE_NAMES[field.type] || field.type, group: st.group, color: add.color, state: 'add' };
            })).concat(h.news.map(function (item, i) {
                return { key: 'n' + i, index: i, label: item.name, typeName: 'новое поле · Текст', color: item.color, state: 'new' };
            }));
            var taken = {};
            current.forEach(function (field) { taken[field.id] = true; });
            h.adds.forEach(function (add) { taken[add.id] = true; });
            var q = wzText(h.q).toLowerCase();
            var items = h.fields.filter(function (field) {
                return !taken[field.id] && !field.is_predefined && hlState(field.name) && !WZ_CHECKLIST_RE.test(field.name) && (!q || String(field.name).toLowerCase().indexOf(q) !== -1);
            }).slice(0, 8).map(function (field) { return { id: field.id, label: wzClean(field.name) || field.name, typeName: WZ_TYPE_NAMES[field.type] || field.type }; });
            var count = rows.filter(function (row) { return row.state; }).length;
            var access = helpAccessStatus() === 'active';
            var admin = isTemplateAdmin();
            return { status: h.status, message: h.message, rows: rows, open: h.open, adding: h.adding, q: h.q, items: items, count: count,
                canApply: access && admin && count > 0 && h.status === 'ready',
                applyNote: !access ? 'Сохранить можно после продления доступа' : !admin ? 'Менять поля может только администратор amoCRM' : count ? 'Изменений: ' + count : 'Изменений нет' };
        }

        function renderHlWizard() {
            if (!state.helpPanel || state.helpFilter !== 'highlight') return;
            var $wrap = state.helpPanel.find('.dfh-hl-wrap');
            if ($wrap.length) wizardRender($wrap, helpUi.hlWizard(hlView()));
        }

        function applyHlWizard() {
            var h = state.hwizard;
            if (!hlView().canApply) return;
            var byId = {};
            h.fields.forEach(function (field) { byId[field.id] = field; });
            var maxSort = 0;
            h.fields.forEach(function (field) { maxSort = Math.max(maxSort, Number(field.sort) || 0); });
            var patch = [];
            Object.keys(h.colors).forEach(function (id) {
                if (h.rm.indexOf(Number(id)) !== -1 || !byId[id]) return;
                var name = hlSet(byId[id].name, h.colors[id]);
                if (name !== byId[id].name) patch.push({ id: Number(id), name: name });
            });
            h.rm.forEach(function (id) { if (byId[id]) patch.push({ id: id, name: hlSet(byId[id].name, '') }); });
            h.adds.forEach(function (add) { if (byId[add.id]) patch.push({ id: add.id, name: hlSet(byId[add.id].name, add.color) }); });
            var create = h.news.map(function (item, i) { return { type: 'text', name: '[/' + item.color + '/] ' + item.name, sort: maxSort + (i + 1) * 10 }; });
            h.status = 'applying';
            h.message = '';
            renderHlWizard();
            wizardSend(h, create, patch).then(function () {
                if (state.hwizard !== h) return;
                h.status = 'done';
                state.gwizard = null;
                renderHlWizard();
            }, function (error) {
                if (state.hwizard !== h) return;
                h.status = 'ready';
                h.message = wizardFailMessage(error);
                renderHlWizard();
            });
        }

        function handleHlWizard(action, $el) {
            var h = state.hwizard;
            if (action === 'reload-fields' || action === 'again') return loadHlWizard(true);
            if (!h || h.status !== 'ready') return;
            var key = $el ? String($el.attr('data-key') || '') : '';
            var id = $el ? Number($el.attr('data-id')) : NaN;
            var index = $el ? parseInt($el.attr('data-index'), 10) : NaN;
            if (action === 'open') { h.open = h.open === key ? '' : key; h.adding = false; }
            if (action === 'color') {
                var color = $el.attr('data-color');
                if (key.charAt(0) === 'r') h.colors[key.slice(1)] = color;
                if (key.charAt(0) === 'a' && h.adds[+key.slice(1)]) h.adds[+key.slice(1)].color = color;
                if (key.charAt(0) === 'n' && h.news[+key.slice(1)]) h.news[+key.slice(1)].color = color;
                h.open = '';
            }
            if (action === 'adding') { h.adding = true; h.open = ''; }
            if (action === 'pick') { h.adds.push({ id: id, color: '1' }); h.q = ''; h.adding = false; }
            if (action === 'create') { var name = wzText(h.q); if (name) h.news.push({ name: name, color: '1' }); h.q = ''; h.adding = false; }
            if (action === 'rm' && h.rm.indexOf(id) === -1) h.rm.push(id);
            if (action === 'undo') h.rm.splice(h.rm.indexOf(id), 1);
            if (action === 'unadd') h.adds.splice(index, 1);
            if (action === 'unnew') h.news.splice(index, 1);
            if (action === 'apply') return applyHlWizard();
            renderHlWizard();
            if (action === 'adding') state.helpPanel.find('[data-hl-input="q"]').trigger('focus');
        }


        // ----- «Подсказки» без «Вставить» (2.0.5, макет business/assets/mockups/dynamic-fields-view/tips.html) -----
        // Поля с подсказкой: текст + вид справа («При наведении» {::…}, «Красная подпись» {:1= …}, «Зелёная подпись» {:2= …}), крестик — убрать.
        var TP_TIP_RE = /^\{::([^}]*)\}$/;
        var TP_NOTE_RE = /^\{:\s*([1-8])\s*=\s*([^}]*)\}$/;

        // Разбор хвоста названия: основа, хвостовые маркеры по порядку, подсказка и подпись. Формулу другого виджета {{=…}} не трогаем.
        function tpParse(name) {
            var text = String(name || '').trim();
            var formula = text.match(EXTERNAL_FORMULA_RE);
            if (formula) text = text.slice(0, formula.index).trim();
            var tokens = [];
            var m;
            while ((m = text.match(/\s*(\{[^{}]*\})\s*$/))) {
                tokens.unshift(m[1]);
                text = text.slice(0, m.index).trim();
            }
            var tip = null;
            var note = null;
            var rest = tokens.filter(function (token) {
                var t = token.match(TP_TIP_RE);
                if (t) { tip = t[1].trim(); return false; }
                var n = token.match(TP_NOTE_RE);
                if (n) { note = { color: n[1], text: n[2].trim() }; return false; }
                return true;
            });
            return { base: text, rest: rest, tip: tip, note: note, formula: formula ? formula[0].trim() : '' };
        }

        function tpBuild(name, tip, note) {
            var p = tpParse(name);
            var out = [p.base].concat(p.rest);
            if (tip) out.push('{::' + tip.replace(/[{}]/g, '') + '}');
            if (note) out.push('{:' + note.color + '= ' + note.text.replace(/[{}]/g, '') + '}');
            if (p.formula) out.push(p.formula);
            return out.join(' ').trim();
        }

        function tpBase(status, entity) {
            return { status: status, entity: entity || null, fields: [], rows: [], rm: [], adding: false, q: '', message: '', created: false };
        }

        function loadTipsWizard(force) {
            var entity = getTemplateEntity();
            if (!entity) {
                state.twizard = tpBase('noentity');
                return renderTipsWizard();
            }
            if (!force && state.twizard && state.twizard.entity === entity && ['ready', 'applying', 'done'].indexOf(state.twizard.status) !== -1) return renderTipsWizard();
            var t = state.twizard = tpBase('loading', entity);
            renderTipsWizard();
            fetchWizardFields(entity).then(function (fields) {
                if (state.twizard !== t) return;
                t.fields = fields;
                t.rows = [];
                fields.forEach(function (field) {
                    if (field.is_predefined) return;
                    var p = tpParse(field.name);
                    if (p.tip !== null) t.rows.push({ id: field.id, kind: 'hover', text: p.tip, orig: { kind: 'hover', text: p.tip } });
                    if (p.note) {
                        var kind = p.note.color === '1' ? 'red' : 'green';
                        t.rows.push({ id: field.id, kind: kind, text: p.note.text, color: p.note.color, orig: { kind: kind, text: p.note.text } });
                    }
                });
                t.status = 'ready';
                renderTipsWizard();
            }, function () {
                if (state.twizard !== t) return;
                t.status = 'error';
                renderTipsWizard();
            });
        }

        function tpRowState(t, row, i) {
            if (t.rm.indexOf(i) !== -1) return 'rm';
            if (!row.orig) return row.isNew ? 'new' : 'add';
            return row.kind !== row.orig.kind || wzText(row.text) !== row.orig.text ? 'ch' : '';
        }

        function tipsView() {
            var t = state.twizard;
            if (!t) return { status: 'loading' };
            if (['ready', 'applying', 'done'].indexOf(t.status) === -1) return { status: t.status };
            var byId = {};
            t.fields.forEach(function (field) { byId[field.id] = field; });
            var rows = t.rows.map(function (row, i) {
                var field = byId[row.id];
                return { index: i, label: row.isNew ? row.name : (wzClean(field.name) || field.name), typeName: row.isNew ? 'новое поле · Текст' : (WZ_HEAD_RE.test(field.name) ? 'заголовок группы' : WZ_TYPE_NAMES[field.type] || field.type),
                    kind: row.kind, text: row.text, state: tpRowState(t, row, i) };
            });
            // У поля может быть одна подсказка при наведении и одна подпись.
            var seen = {};
            var conflict = '';
            t.rows.forEach(function (row, i) {
                if (t.rm.indexOf(i) !== -1 || row.isNew) return;
                var slot = row.id + ':' + (row.kind === 'hover' ? 'tip' : 'note');
                if (seen[slot] && !conflict) conflict = rows[i].label;
                seen[slot] = true;
            });
            var taken = {};
            t.rows.forEach(function (row) { if (!row.isNew) taken[row.id] = true; });
            var q = wzText(t.q).toLowerCase();
            var items = t.fields.filter(function (field) {
                return !taken[field.id] && !field.is_predefined && (!q || String(field.name).toLowerCase().indexOf(q) !== -1);
            }).slice(0, 8).map(function (field) { return { id: field.id, label: wzClean(field.name) || field.name, typeName: WZ_HEAD_RE.test(field.name) ? 'заголовок группы' : WZ_TYPE_NAMES[field.type] || field.type }; });
            var count = rows.filter(function (row) { return row.state && (row.state === 'rm' || wzText(row.text)); }).length;
            var access = helpAccessStatus() === 'active';
            var admin = isTemplateAdmin();
            return { status: t.status, message: t.message, rows: rows, adding: t.adding, q: t.q, items: items, count: count,
                canApply: access && admin && count > 0 && !conflict && t.status === 'ready',
                applyNote: !access ? 'Сохранить можно после продления доступа' : !admin ? 'Менять поля может только администратор amoCRM' :
                    conflict ? 'У поля «' + conflict + '» две подсказки одного вида — оставьте одну' : count ? 'Изменений: ' + count : 'Изменений нет' };
        }

        function renderTipsWizard() {
            if (!state.helpPanel || state.helpFilter !== 'tips') return;
            var $wrap = state.helpPanel.find('.dfh-tp-wrap');
            if ($wrap.length) wizardRender($wrap, helpUi.tipsWizard(tipsView()));
        }

        function applyTipsWizard() {
            var t = state.twizard;
            if (!tipsView().canApply) return;
            var byId = {};
            t.fields.forEach(function (field) { byId[field.id] = field; });
            // Итог по каждому полю: какая подсказка и подпись должны остаться.
            var target = {};
            t.rows.forEach(function (row, i) {
                if (row.isNew) return;
                var p = target[row.id] || (target[row.id] = { tip: null, note: null, touched: false, start: tpParse(byId[row.id].name) });
                var st = tpRowState(t, row, i);
                if (st) p.touched = true;
                var text = wzText(row.text);
                if (st === 'rm' || !text) return;
                if (row.kind === 'hover') p.tip = text;
                else p.note = { color: row.kind === 'red' ? '1' : '2', text: text };
            });
            var patch = [];
            Object.keys(target).forEach(function (id) {
                var p = target[id];
                if (!p.touched) return;
                var name = tpBuild(byId[id].name, p.tip, p.note);
                if (name !== byId[id].name) patch.push({ id: Number(id), name: name });
            });
            var maxSort = 0;
            t.fields.forEach(function (field) { maxSort = Math.max(maxSort, Number(field.sort) || 0); });
            var create = t.rows.filter(function (row, i) { return row.isNew && t.rm.indexOf(i) === -1 && wzText(row.text); }).map(function (row, i) {
                return { type: 'text', name: tpBuild(row.name, row.kind === 'hover' ? wzText(row.text) : null,
                    row.kind === 'hover' ? null : { color: row.kind === 'red' ? '1' : '2', text: wzText(row.text) }), sort: maxSort + (i + 1) * 10 };
            });
            t.status = 'applying';
            t.message = '';
            renderTipsWizard();
            wizardSend(t, create, patch).then(function () {
                if (state.twizard !== t) return;
                t.status = 'done';
                renderTipsWizard();
            }, function (error) {
                if (state.twizard !== t) return;
                t.status = 'ready';
                t.message = wizardFailMessage(error);
                renderTipsWizard();
            });
        }

        function handleTipsWizard(action, $el) {
            var t = state.twizard;
            if (action === 'reload-fields' || action === 'again') return loadTipsWizard(true);
            if (!t || t.status !== 'ready') return;
            var index = $el ? parseInt($el.attr('data-index'), 10) : NaN;
            if (action === 'adding') t.adding = true;
            if (action === 'pick') { t.rows.push({ id: Number($el.attr('data-id')), kind: 'hover', text: '' }); t.q = ''; t.adding = false; }
            if (action === 'create') { var name = wzText(t.q); if (name) t.rows.push({ isNew: true, name: name, kind: 'hover', text: '' }); t.q = ''; t.adding = false; }
            if (action === 'rm' && t.rows[index]) {
                if (t.rows[index].orig) t.rm.push(index);
                else { t.rows.splice(index, 1); t.rm = t.rm.map(function (i) { return i > index ? i - 1 : i; }); }
            }
            if (action === 'undo') t.rm.splice(t.rm.indexOf(index), 1);
            if (action === 'apply') return applyTipsWizard();
            renderTipsWizard();
            if (action === 'adding') state.helpPanel.find('[data-tp-input="q"]').trigger('focus');
            if (action === 'pick' || action === 'create') state.helpPanel.find('[data-tp-input="text"]').last().trigger('focus');
        }

        function openHelpSection(id) {
            if (state.helpFilter !== id) {
                state.helpExampleOpen = false;
                state.helpExampleSlide = 0;
            }
            state.helpFilter = id;
            if (id === 'switch') loadHelpGroups();
            state.helpPanel.find('.dfh-nav-item').each(function () {
                this.setAttribute('aria-current', String(this.getAttribute('data-id') === id));
            });
            renderHelpContent(false);
            if (id === 'checklist') loadWizard(false);
            if (id === 'group') loadGroupWizard(false);
            if (id === 'switch') loadLinkedWizard(false);
            if (id === 'view') loadViewWizard(false);
            if (id === 'highlight') loadHlWizard(false);
            if (id === 'tips') loadTipsWizard(false);
        }

        // Срок доступа, красная полоса и кнопка шаблона — перерисовываются при каждой смене статуса доступа.
        function renderHelpAccess() {
            if (!state.helpPanel) return;
            var ctx = helpContext();
            var alert = helpUi.alert(ctx);
            state.helpPanel.find('.dfh-alert').html(alert).prop('hidden', !alert);
            state.helpPanel.find('.dfh-nav').html(helpUi.nav(ctx));
            state.helpPanel.find('.dfh-tpl-act').html(helpUi.templateAction(ctx));
        }

        function openHelpModal(html) {
            if (!state.helpPanel) return;
            state.helpPanel.find('.dfh-modal').html(html).prop('hidden', false).find('.dfh-x, .dfh-btn').first().trigger('focus');
        }

        function closeHelpModal() {
            if (!state.helpPanel) return;
            // Окно «Сбросить» закрыли до запуска — поиск маркеров бросаем, само оно больше не откроется.
            if (state.reset && state.reset.status !== 'run') state.reset = null;
            // Очищаем разметку, чтобы видео в окне шаблона перестало играть.
            state.helpPanel.find('.dfh-modal').prop('hidden', true).empty();
        }

        function helpVideoFrame(src, title) {
            return $('<iframe>').addClass('dfh-frame').attr({
                src: src,
                title: title,
                allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
                allowfullscreen: 'allowfullscreen',
                referrerpolicy: 'strict-origin-when-cross-origin'
            });
        }

        function runHelpTemplate() {
            var entity = getTemplateEntity();
            var status = (state.templateRuns[entity] || {}).status;
            if (!entity || !isTemplateAdmin() || status === 'loading' || status === 'complete') return;
            if (accessState().status !== 'active' || !isActivated()) return;
            state.templateRuns[entity] = { status: 'loading', message: 'Проверяем существующие поля и создаём недостающие…' };
            renderHelpAccess();
            templateClient.applyFormula(entity).then(function (result) {
                state.templateRuns[entity] = {
                    status: 'complete',
                    message: (result.created ? 'Создано полей: ' + result.created + '.' : 'Шаблон уже создан.') +
                        ' Сохраните текущие изменения и обновите страницу. Затем откройте настройки полей: названия и ответы можно редактировать.'
                };
                state.checklistMetadata = {};
                state.switcherMetadata = {};
                state.helpGroupNames = null;
            }).catch(function (error) {
                state.templateRuns[entity] = { status: 'error', message: error.message || 'Не удалось создать поля. Проверьте соединение и повторите.' };
            }).then(function () {
                // Окно могли закрыть, пока шёл запрос.
                renderHelpAccess();
            });
        }

        // Текст из поля окна → маркер. Фигурные скобки убираем: они закрыли бы маркер раньше времени.
        function helpFieldText(name) {
            var $field = state.helpPanel.find('[data-field="' + name + '"]');
            var text = String($field.val() || '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
            if (!text) {
                setHelpStatus('Сначала напишите текст');
                $field.trigger('focus');
            }
            return text;
        }

        function handleHelpAct(act, button) {
            if (act === 'close') return closeHelpPanel();
            if (act === 'modal-close') return closeHelpModal();
            if (act === 'contact') return openHelpModal(helpUi.contactDialog(helpContext()));
            if (act === 'reload') return window.location.reload();
            if (act === 'tpl-go') return runHelpTemplate();
            if (act === 'reset') return openReset();
            if (act === 'reset-go') return runReset('clear');
            if (act === 'reset-back') return runReset('restore');
            var text;
            if (act === 'advice') {
                text = helpFieldText('advice');
                if (text) insertHelpAction({ kind: 'checklist-suffix', insert: '{!' + text + '}' });
            } else if (act === 'tag') {
                text = helpFieldText('tag');
                if (text) insertHelpAction({ kind: 'checklist-suffix', insert: '{:tag ' + text + '}' });
            } else if (act === 'tip') {
                text = helpFieldText('tip');
                if (!text) return;
                if (state.helpTipKind === 'hover') insertHelpAction({ kind: 'tooltip', insert: '{::' + text + '}' });
                else insertHelpAction({ kind: 'field-note', insert: '{:' + (state.helpTipKind === 'red' ? '1' : '2') + '= ' + text + '}' });
            }
        }

        // ---- «Сбросить» (1.0.136, по макету business/assets/mockups/dynamic-fields-amo-style) ----
        // Находит маркеры виджета в названиях полей и вариантов списков во всём аккаунте и убирает их через API amoCRM
        // (данные в полях не меняются). Прежние названия сохраняются в этом браузере — их возвращает «Вернуть маркеры».
        // Запросы идут по очереди, с паузой, чтобы amoCRM не упёрлась в лимит (7 в секунду).
        var RESET_ENTITIES = [['leads', 'Сделки'], ['contacts', 'Контакты'], ['companies', 'Компании'], ['customers', 'Покупатели']];
        var RESET_KEY = 'rkrs_advanced_fields_reset_' + self.accountId;
        var RESET_BATCH = 40;

        function resetWait(ms) {
            return new Promise(function (resolve) { setTimeout(resolve, ms); });
        }

        function resetBackup() {
            try {
                var data = JSON.parse(window.localStorage.getItem(RESET_KEY) || 'null');
                return data && Array.isArray(data.items) && data.items.length ? data : null;
            } catch (e) {
                return null;
            }
        }

        function fetchResetFields(entity) {
            var list = [];
            function loadPage(page) {
                return fetch('/api/v4/' + entity + '/custom_fields?limit=250&page=' + page, { credentials: 'same-origin' })
                    .then(function (response) {
                        if (response.status === 204) return list;
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json().then(function (payload) {
                            var batch = payload && payload._embedded && payload._embedded.custom_fields;
                            (Array.isArray(batch) ? batch : []).forEach(function (field) { list.push(field); });
                            return payload && payload._links && payload._links.next
                                ? resetWait(250).then(function () { return loadPage(page + 1); })
                                : list;
                        });
                    });
            }
            return loadPage(1);
        }

        // Что поменяется: поле или его варианты, где после снятия маркеров название другое.
        function planReset(entity, fields) {
            var items = [];
            fields.forEach(function (field) {
                if (field.is_predefined) return;
                var name = removeWidgetMarkers(field.name) || field.name;
                var enums = Array.isArray(field.enums) && field.enums.length ? field.enums : null;
                var enumsChanged = false;
                var cleanEnums = enums && enums.map(function (item) {
                    var value = removeWidgetMarkers(item.value) || item.value;
                    if (value !== item.value) enumsChanged = true;
                    return { id: item.id, value: value, sort: item.sort };
                });
                if (name === field.name && !enumsChanged) return;
                items.push({
                    entity: entity,
                    id: field.id,
                    oldName: field.name,
                    name: name,
                    oldEnums: enumsChanged ? enums.map(function (item) { return { id: item.id, value: item.value, sort: item.sort }; }) : null,
                    enums: enumsChanged ? cleanEnums : null
                });
            });
            return items;
        }

        function resetChosen() {
            var r = state.reset;
            var items = [];
            RESET_ENTITIES.forEach(function (entity) {
                if (r.checked[entity[0]]) items = items.concat(r.found[entity[0]] || []);
            });
            return items;
        }

        function showReset() {
            if (!state.reset) return;
            var r = state.reset;
            openHelpModal(helpUi.resetDialog({
                status: r.status,
                entities: RESET_ENTITIES.map(function (entity) {
                    var found = r.found[entity[0]];
                    return { key: entity[0], title: entity[1], count: found ? found.length : 0, failed: !found, checked: !!r.checked[entity[0]] };
                }),
                chosen: r.status === 'ready' ? resetChosen() : [],
                backup: resetBackup(),
                done: r.done,
                total: r.total,
                failed: r.failed,
                mode: r.mode,
                message: r.message
            }));
        }

        function openReset() {
            if (state.reset && (state.reset.status === 'scan' || state.reset.status === 'run')) return showReset();
            var r = state.reset = { status: 'scan', found: {}, checked: {}, done: 0, total: 0, failed: 0 };
            showReset();
            var chain = Promise.resolve();
            RESET_ENTITIES.forEach(function (entity) {
                chain = chain.then(function () {
                    if (state.reset !== r) return; // нажали «Отмена» — дальше не ищем
                    return fetchResetFields(entity[0]).then(function (fields) {
                        r.found[entity[0]] = planReset(entity[0], fields);
                        r.checked[entity[0]] = r.found[entity[0]].length > 0;
                    }, function () {
                        r.found[entity[0]] = null; // покупатели выключены или нет прав — пропускаем
                    }).then(function () { return resetWait(250); });
                });
            });
            chain.then(function () {
                if (state.reset !== r) return;
                r.status = 'ready';
                showReset();
            });
        }

        function patchResetBatch(entity, batch) {
            return fetch('/api/v4/' + entity + '/custom_fields', {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batch.map(function (item) {
                    var row = { id: item.id, name: item.name };
                    if (item.enums) row.enums = item.enums;
                    return row;
                }))
            }).then(function (response) {
                if (response.status === 401 || response.status === 403) throw new Error('rights');
                if (!response.ok) throw new Error('HTTP ' + response.status);
            });
        }

        function runReset(mode) {
            var r = state.reset;
            if (!r || r.status === 'run') return;
            var items;
            if (mode === 'restore') {
                var backup = resetBackup();
                items = backup ? backup.items.map(function (item) {
                    return { entity: item.entity, id: item.id, name: item.oldName, enums: item.oldEnums };
                }) : [];
            } else {
                items = resetChosen();
                try {
                    window.localStorage.setItem(RESET_KEY, JSON.stringify({ date: Date.now(), items: items }));
                } catch (e) {}
            }
            if (!items.length) return;
            r.status = 'run';
            r.mode = mode;
            r.total = items.length;
            r.done = 0;
            r.failed = 0;
            r.message = '';
            showReset();

            var batches = [];
            RESET_ENTITIES.forEach(function (entity) {
                var own = items.filter(function (item) { return item.entity === entity[0]; });
                for (var i = 0; i < own.length; i += RESET_BATCH) batches.push({ entity: entity[0], items: own.slice(i, i + RESET_BATCH) });
            });
            var chain = Promise.resolve();
            batches.forEach(function (batch) {
                chain = chain.then(function () {
                    return patchResetBatch(batch.entity, batch.items).catch(function (error) {
                        r.failed += batch.items.length;
                        if (error && error.message === 'rights') r.message = 'Нет прав на изменение полей — это может сделать администратор amoCRM.';
                    }).then(function () {
                        r.done += batch.items.length;
                        var $bar = state.helpPanel && state.helpPanel.find('.dfh-rs-bar i');
                        if ($bar && $bar.length) {
                            $bar.css('width', Math.round(r.done / r.total * 100) + '%');
                            state.helpPanel.find('.dfh-rs-n').text(r.done);
                        }
                        return resetWait(300);
                    });
                });
            });
            chain.then(function () {
                if (mode === 'restore' && !r.failed) {
                    try { window.localStorage.removeItem(RESET_KEY); } catch (e) {}
                }
                r.status = 'done';
                showReset();
            });
        }

        function bindHelpPanel($panel) {
            $panel.on('change' + NS, '.dfh-rs-checks input', function () {
                if (!state.reset || state.reset.status !== 'ready') return;
                state.reset.checked[$(this).attr('data-entity')] = this.checked;
                showReset();
            });
            $panel.on('click' + NS, function (event) {
                var $target = $(event.target);
                var $modal = $target.closest('.dfh-modal');
                if ($modal.length && $target.is('.dfh-modal')) return closeHelpModal();

                var $wz = $target.closest('[data-wz]');
                if ($wz.length) {
                    event.preventDefault();
                    return handleWizard($wz.attr('data-wz'), $wz);
                }
                var $tp = $target.closest('[data-tp]');
                if ($tp.length) {
                    event.preventDefault();
                    return handleTipsWizard($tp.attr('data-tp'), $tp);
                }
                var $hl = $target.closest('[data-hl]');
                if ($hl.length) {
                    event.preventDefault();
                    return handleHlWizard($hl.attr('data-hl'), $hl);
                }
                var $vw = $target.closest('[data-vw]');
                if ($vw.length) {
                    event.preventDefault();
                    return handleViewWizard($vw.attr('data-vw'), $vw);
                }
                var $lw = $target.closest('[data-lw]');
                if ($lw.length) {
                    event.preventDefault();
                    return handleLinkedWizard($lw.attr('data-lw'), $lw);
                }
                var $gw = $target.closest('[data-gw]');
                if ($gw.length) {
                    if ($gw.is('input, select')) return;
                    event.preventDefault();
                    return handleGroupWizard($gw.attr('data-gw'), $gw);
                }
                // Клик мимо подсказки поиска — закрываем её.
                if (!$target.closest('.dfh-wz-cb').length) {
                    if (state.wizard && state.wizard.combo) { state.wizard.combo = false; renderWizard(); }
                    if (state.gwizard && (state.gwizard.combo || state.gwizard.fqOpen)) { state.gwizard.combo = false; state.gwizard.fqOpen = false; renderGroupWizard(); }
                    if (state.lwizard && state.lwizard.combo) { state.lwizard.combo = false; renderLinkedWizard(); }
                    if (state.vwizard && state.vwizard.adding) { state.vwizard.adding = false; renderViewWizard(); }
                    if (state.hwizard && (state.hwizard.adding || state.hwizard.open)) { state.hwizard.adding = false; state.hwizard.open = ''; renderHlWizard(); }
                    if (state.twizard && state.twizard.adding) { state.twizard.adding = false; renderTipsWizard(); }
                }

                var $example = $target.closest('[data-example]');
                if ($example.length) {
                    event.preventDefault();
                    return handleHelpExample($example.attr('data-example'), $example);
                }

                var $video = $target.closest('[data-video]');
                if ($video.length) {
                    if ($video.attr('data-video') === 'formula') {
                        $video.replaceWith(helpVideoFrame('https://www.youtube.com/embed/CO_JyyRhNd8?autoplay=1&rel=0', 'Видео о методике «Формула сделки»'));
                    } else {
                        $video.replaceWith(helpVideoFrame('https://kinescope.io/embed/3T7NET1dgefvDQp4KndhF9?autoplay=1&muted=1', 'Видеоинструкция «Динамические поля»'));
                    }
                    return;
                }

                var $act = $target.closest('[data-act]');
                if ($act.length) {
                    event.preventDefault();
                    return handleHelpAct($act.attr('data-act'), $act);
                }

                var $nav = $target.closest('.dfh-nav-item');
                if ($nav.length) return openHelpSection($nav.attr('data-id'));

                var $go = $target.closest('[data-go]');
                if ($go.length) {
                    event.preventDefault();
                    return openHelpSection($go.attr('data-go'));
                }

                if ($target.closest('[data-groups-refresh]').length) {
                    event.preventDefault();
                    setHelpStatus('Обновляем список групп…');
                    return loadHelpGroups();
                }

                var $letter = $target.closest('[data-letter]');
                if ($letter.length) {
                    state.helpLetter = $letter.attr('data-letter');
                    return renderHelpContent(true);
                }

                var $kind = $target.closest('[data-tk]');
                if ($kind.length) {
                    state.helpTipKind = $kind.attr('data-tk');
                    $kind.parent().children().each(function () {
                        this.setAttribute('aria-pressed', String(this === $kind[0]));
                    });
                    return;
                }

                if ($target.closest('[data-tpl]').length) {
                    return openHelpModal(helpUi.templateDialog(helpContext()));
                }

                var $insert = $target.closest('[data-insert]');
                if ($insert.length) {
                    insertHelpAction({ kind: $insert.attr('data-kind'), insert: $insert.attr('data-insert'), color: $insert.attr('data-color') });
                }
            });

            // Своя буква группы: одна русская или латинская буква — маркеры в разделе сразу пересобираются.
            $panel.on('change' + NS, '[data-wz-change]', function () { wizardChange(this.getAttribute('data-wz-change'), this); });
            $panel.on('input' + NS, '[data-wz-input]', function () { wizardInput(this.getAttribute('data-wz-input'), this); });
            $panel.on('input' + NS, '[data-gw-input]', function () { groupInput(this.getAttribute('data-gw-input'), this); });
            $panel.on('input' + NS, '[data-lw-input]', function () { linkedInput(this.getAttribute('data-lw-input'), this); });
            $panel.on('input' + NS, '[data-vw-input]', function () {
                if (!state.vwizard || state.vwizard.status !== 'ready') return;
                state.vwizard.q = this.value;
                renderViewWizard();
            });
            $panel.on('input' + NS, '[data-tp-input]', function () {
                var t = state.twizard;
                if (!t || t.status !== 'ready') return;
                var kind = this.getAttribute('data-tp-input');
                if (kind === 'q') { t.q = this.value; return renderTipsWizard(); }
                var row = t.rows[parseInt(this.getAttribute('data-index'), 10)];
                if (kind === 'text' && row) {
                    row.text = this.value;
                    var view = tipsView();
                    state.helpPanel.find('.dfh-tp-wrap .dfh-wz-sp').text(view.applyNote);
                    state.helpPanel.find('.dfh-tp-wrap [data-tp="apply"]').prop('disabled', !view.canApply);
                }
            });
            $panel.on('change' + NS, '[data-tp-change]', function () {
                var t = state.twizard;
                var row = t && t.rows[parseInt(this.getAttribute('data-index'), 10)];
                if (!row) return;
                row.kind = this.value;
                renderTipsWizard();
            });
            $panel.on('keydown' + NS, '[data-tp-input="q"]', function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    state.twizard.adding = false;
                    return renderTipsWizard();
                }
                if (event.key !== 'Enter' && event.keyCode !== 13) return;
                event.preventDefault();
                var first = state.helpPanel.find('[data-tp="pick"]').first();
                if (first.length) return handleTipsWizard('pick', first);
                if (wzText(this.value)) handleTipsWizard('create');
            });
            $panel.on('input' + NS, '[data-hl-input]', function () {
                if (!state.hwizard || state.hwizard.status !== 'ready') return;
                state.hwizard.q = this.value;
                renderHlWizard();
            });
            $panel.on('keydown' + NS, '[data-hl-input="q"]', function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    state.hwizard.adding = false;
                    return renderHlWizard();
                }
                if (event.key !== 'Enter' && event.keyCode !== 13) return;
                event.preventDefault();
                var first = state.helpPanel.find('[data-hl="pick"]').first();
                if (first.length) return handleHlWizard('pick', first);
                if (wzText(this.value)) handleHlWizard('create');
            });
            $panel.on('keydown' + NS, '[data-vw-input="q"]', function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    state.vwizard.adding = false;
                    return renderViewWizard();
                }
                if (event.key !== 'Enter' && event.keyCode !== 13) return;
                event.preventDefault();
                var first = state.helpPanel.find('[data-vw="pick"]').first();
                if (first.length) return handleViewWizard('pick', first);
                if (wzText(this.value)) handleViewWizard('create');
            });
            $panel.on('change' + NS, '[data-lw-change]', function () { linkedInput(this.getAttribute('data-lw-change'), this); });
            $panel.on('focusin' + NS, '[data-wz-input="head-q"], [data-gw-input="head-q"], [data-lw-input="q"]', function () {
                var w = this.hasAttribute('data-wz-input') ? state.wizard : this.hasAttribute('data-gw-input') ? state.gwizard : state.lwizard;
                if (!w || w.combo) return;
                w.combo = true;
                if (this.hasAttribute('data-wz-input')) renderWizard(); else if (this.hasAttribute('data-gw-input')) renderGroupWizard(); else renderLinkedWizard();
            });
            $panel.on('keydown' + NS, '[data-wz-input="new-item"], [data-wz-input="head-q"], [data-gw-input="head-q"], [data-gw-input="fq"], [data-lw-input="q"], [data-lw-input="new-opt"], [data-wz="pv"], [data-gw="toggle"], [data-lw="pv"]', function (event) {
                var space = event.key === ' ' && (this.getAttribute('data-wz') === 'pv' || this.getAttribute('data-gw') === 'toggle' || this.getAttribute('data-lw') === 'pv');
                if (event.key !== 'Enter' && event.keyCode !== 13 && !space) return;
                event.preventDefault();
                if (this.getAttribute('data-wz') === 'pv') return handleWizard('pv', $(this));
                if (this.getAttribute('data-gw') === 'toggle') return handleGroupWizard('toggle', $(this));
                if (this.getAttribute('data-lw') === 'pv') return handleLinkedWizard('pv', $(this));
                var lw = this.getAttribute('data-lw-input');
                if (lw === 'q' && wzText(this.value)) return handleLinkedWizard('field-new');
                if (lw === 'new-opt') return handleLinkedWizard('opt-add');
                var wz = this.getAttribute('data-wz-input');
                var gw = this.getAttribute('data-gw-input');
                if (wz === 'new-item') return handleWizard('add');
                if (wz === 'head-q' && wzText(this.value)) return handleWizard('head-new');
                if (gw === 'head-q' && wzText(this.value)) return handleGroupWizard('head-new');
                if (gw === 'fq' && wzText(this.value)) {
                    var first = state.helpPanel.find('[data-gw="pick"]').first();
                    return first.length ? handleGroupWizard('pick', first) : handleGroupWizard('create');
                }
            });

            $panel.on('input' + NS, '.dfh-own-input', function () {
                var letter = String(this.value || '').trim().toUpperCase();
                if (!/^[A-ZА-ЯЁ]$/.test(letter)) return;
                state.helpLetter = letter;
                renderHelpContent(true);
                var input = state.helpPanel.find('.dfh-own-input')[0];
                if (input) {
                    input.focus();
                    input.setSelectionRange(1, 1);
                }
            });

            $panel.on('keydown' + NS, '.dfh-input', function (event) {
                if (event.key !== 'Enter' && event.keyCode !== 13) return;
                event.preventDefault();
                $(this).closest('.dfh-form-row, .dfh-tp-form').find('[data-act]').trigger('click');
            });
        }

        // «Куда вставляем»: зеркало выбранного поля amoCRM. Название можно править прямо здесь.
        function bindHelpTarget($editor, $clear) {
            $editor
                .on('focus' + NS, function () {
                    updateHelpTarget();
                    var input = state.helpLastInput;
                    if (!this.readOnly && input) $(this).data('rkrs_cf_edit_start', { input: input, value: input.value });
                })
                .on('input' + NS, function () {
                    var input = getHelpInput();
                    if (!input) return;
                    var value = this.value;
                    var position = this.selectionStart;
                    if (input.tagName === 'INPUT') {
                        position = value.substring(0, position).replace(/[\r\n]+/g, ' ').length;
                        value = value.replace(/[\r\n]+/g, ' ');
                    }
                    setHelpInputValue(input, value, position, false);
                })
                .on('keydown' + NS, function (event) {
                    if ((event.key === 'Enter' || event.keyCode === 13) && state.helpLastInput &&
                        state.helpLastInput.tagName === 'INPUT' && !event.isComposing) {
                        event.preventDefault();
                        state.helpLastInput.focus();
                    }
                })
                .on('blur' + NS, function () {
                    var original = $(this).data('rkrs_cf_edit_start');
                    $(this).removeData('rkrs_cf_edit_start');
                    if (original && document.documentElement.contains(original.input) &&
                        typeof original.input.setSelectionRange === 'function') {
                        original.input.setSelectionRange(this.selectionStart, this.selectionEnd);
                    }
                    if (original && document.documentElement.contains(original.input) && original.input.value !== original.value) {
                        var event = document.createEvent('Event');
                        event.initEvent('change', true, true);
                        original.input.dispatchEvent(event);
                    }
                    scheduleHelpTargetUpdate();
                });

            $clear.on('click' + NS, function () {
                var input = getHelpInput();
                if (!input) return;
                var value = String(input.value || '');
                var clean = removeWidgetMarkers(value);
                if (clean !== value) {
                    setHelpInputValue(input, clean, clean.length, 'Маркеры виджета удалены');
                    var event = document.createEvent('Event');
                    event.initEvent('change', true, true);
                    input.dispatchEvent(event);
                } else {
                    setHelpStatus('В названии нет маркеров виджета');
                }
                if (state.helpTarget && document.documentElement.contains(input)) {
                    state.helpTarget[0].focus();
                    state.helpTarget.data('rkrs_cf_edit_start', { input: input, value: input.value });
                }
            });
        }

        function showHelpPanel() {
            if (state.helpPanel) {
                positionHelpUi();
                return;
            }
            includeCSS();
            if (!helpUi.sections.some(function (section) { return section.id === state.helpFilter; })) state.helpFilter = 'group';
            if (state.helpFilter === 'switch') loadHelpGroups();
            if (state.helpFilter === 'checklist') loadWizard(false);
            if (state.helpFilter === 'group') loadGroupWizard(false);
            if (state.helpFilter === 'switch') loadLinkedWizard(false);
            if (state.helpFilter === 'view') loadViewWizard(false);
            if (state.helpFilter === 'highlight') loadHlWizard(false);
            if (state.helpFilter === 'tips') loadTipsWizard(false);

            var ctx = helpContext();
            var $panel = $('<section>').addClass('rkrs-dfh')
                .attr({ role: 'dialog', 'aria-label': 'Динамические поля от Ракурс' })
                .html(helpUi.shell(ctx));
            state.helpPanel = $panel;
            state.helpStatus = $panel.find('.dfh-state').text('Кликните в название поля в amoCRM и нажмите «Вставить» у нужного маркера');
            state.helpTarget = $panel.find('.dfh-target-editor');

            bindHelpPanelDrag($panel.find('.dfh-head'));
            bindHelpTarget(state.helpTarget, $panel.find('.dfh-target-clear'));
            bindHelpPanel($panel);

            $panel.appendTo(document.body);
            renderHelpAccess();
            renderHelpContent(false);
            updateHelpTarget();
            positionHelpUi();
        }

        function removeHelpUi() {
            removeHelpPanel();
        }

        function syncHelpUi() {
            state.helpSyncTimer = null;
            if (accessState().status === 'checking' || !isActivated()) return;
            var anchor = document.querySelector('.card-cf__inner');
            if (!anchor) {
                state.helpAnchor = null;
                state.helpPosition = null;
                removeHelpUi();
                return;
            }

            if (state.helpAnchor !== anchor) {
                state.helpCollapsed = false;
                state.helpPosition = null;
                removeHelpUi();
            }
            state.helpAnchor = anchor;
            if (state.helpCollapsed) {
                removeHelpPanel();
            } else {
                showHelpPanel();
            }
        }

        function scheduleHelpSync(delay) {
            if (state.helpSyncTimer) {
                clearTimeout(state.helpSyncTimer);
            }
            state.helpSyncTimer = setTimeout(syncHelpUi, typeof delay === 'number' ? delay : 180);
        }

        function startHelpObserver() {
            bindHelpInputs();
            if (state.helpObserver || typeof MutationObserver === 'undefined') {
                scheduleHelpSync(0);
                return;
            }

            state.helpObserver = new MutationObserver(function (mutations) {
                if (state.helpLastInput && !document.documentElement.contains(state.helpLastInput)) {
                    state.helpLastInput = null;
                    updateHelpTarget();
                }
                var anchorAdded = false;
                var anchorRemoved = false;

                for (var mutationIndex = 0; mutationIndex < mutations.length; mutationIndex++) {
                    var mutation = mutations[mutationIndex];
                    var addedNodes = mutation.addedNodes || [];
                    var removedNodes = mutation.removedNodes || [];

                    for (var addedIndex = 0; addedIndex < addedNodes.length; addedIndex++) {
                        var addedNode = addedNodes[addedIndex];
                        if (!addedNode || addedNode.nodeType !== 1) {
                            continue;
                        }
                        if ((addedNode.classList && addedNode.classList.contains('card-cf__inner')) ||
                            (addedNode.querySelector && addedNode.querySelector('.card-cf__inner'))) {
                            anchorAdded = true;
                            break;
                        }
                    }

                    for (var removedIndex = 0; removedIndex < removedNodes.length; removedIndex++) {
                        var removedNode = removedNodes[removedIndex];
                        if (!removedNode || removedNode.nodeType !== 1) {
                            continue;
                        }
                        if (removedNode === state.helpAnchor ||
                            (state.helpAnchor && removedNode.contains && removedNode.contains(state.helpAnchor)) ||
                            (removedNode.classList && removedNode.classList.contains('card-cf__inner'))) {
                            anchorRemoved = true;
                            break;
                        }
                    }
                }

                if (anchorAdded) {
                    scheduleHelpSync(0);
                } else if (anchorRemoved) {
                    // amoCRM can replace the editor in two adjacent mutation batches.
                    // A short grace period prevents the panel from blinking during replacement.
                    scheduleHelpSync(180);
                }
            });
            state.helpObserver.observe(document.body, { childList: true, subtree: true });
            scheduleHelpSync(0);
        }

        function stopHelpObserver() {
            $(document).off(HNS);
            $(window).off(HNS);
            if (state.helpObserver) {
                state.helpObserver.disconnect();
                state.helpObserver = null;
            }
            if (state.helpSyncTimer) {
                clearTimeout(state.helpSyncTimer);
                state.helpSyncTimer = null;
            }
            state.helpAnchor = null;
            state.helpLastInput = null;
            state.helpCollapsed = false;
            removeHelpUi();
        }

        // Справочник маркеров: выбранное поле, Esc, размер окна. Отдельное пространство имён — работает и без оплаты,
        // когда остальная логика виджета выключена (1.0.133).
        var HNS = NS + '_help';
        function bindHelpInputs() {
            $(document).off(HNS);
            $(window).off(HNS);
            $(window).off('resize' + HNS + ' scroll' + HNS)
                .on('resize' + HNS, function () {
                    state.helpPosition = null;
                    positionHelpUi();
                    resizeHelpTarget();
                });

            $(document).on('focusin' + HNS,
                HELP_INPUT_SELECTOR,
                function () {
                    state.helpLastInput = this;
                    updateHelpTarget();
                    if (state.helpStatus) {
                        state.helpStatus.text('Нажмите на нужный маркер');
                    }
                }
            );

            $(document).on('input' + HNS,
                HELP_INPUT_SELECTOR,
                function () {
                    if (state.helpLastInput === this) updateHelpTarget();
                }
            );

            $(document).on('focusout' + HNS, HELP_INPUT_SELECTOR, function () {
                scheduleHelpTargetUpdate();
            });

            $(document).on('pointerdown' + HNS + ' focusin' + HNS, function (event) {
                if (state.helpLastInput && event.target !== state.helpLastInput &&
                    !$(event.target).closest(HELP_CONTEXT_SELECTOR).length) {
                    state.helpLastInput = null;
                    updateHelpTarget();
                }
            });

            $(document).on('keydown' + HNS, function (e) {
                if ((e.key === 'Escape' || e.keyCode === 27) && state.helpPanel && !state.helpPanel.find('.dfh-modal').prop('hidden')) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    closeHelpModal();
                    return;
                }
                if ((e.key === 'Escape' || e.keyCode === 27) && state.helpPanel) {
                    closeHelpPanel();
                }
            });

        }

        function bindGlobalActions() {
            $(document).off(NS);
            $(document).on('click' + NS, '.rkrs-cf-group-header', function (e) {
                if ($(e.target).closest('a, input, textarea, select, button, .rkrs-cf-checklist-advice').length) {
                    return;
                }
                toggleGroup($(this));
            });

            $(document).on('change' + NS, '.rkrs-cf-switcher-field select', function () {
                var $field = $(this).closest('.rkrs-cf-switcher-field');
                var key = $(this).find('option:selected').attr('data-rkrs-cf-switch-key') || null;
                setSwitcherSelection($field, key, true);
            });

            $(document).on('change' + NS, '.rkrs-cf-switcher-field input[type="radio"]', function () {
                if (!$(this).is(':checked')) {
                    return;
                }
                var $field = $(this).closest('.rkrs-cf-switcher-field');
                updateRadioSwitcherButtons($field);
                setSwitcherSelection($field, $(this).attr('data-rkrs-cf-switch-key') || null, true);
            });

            $(document).on('click' + NS, '.rkrs-cf-switch-button', function (e) {
                e.preventDefault();
                e.stopImmediatePropagation();

                var $button = $(this);
                var key = normalizeGroupKey($button.attr('data-rkrs-cf-switch-key'));
                var $field = $button.closest('.rkrs-cf-radio-switcher');
                var $target = $field.find('input[type="radio"][data-rkrs-cf-switch-key]').filter(function () {
                    return normalizeGroupKey($(this).attr('data-rkrs-cf-switch-key')) === key;
                }).first();

                if ($target.length) {
                    $target.prop('checked', true).trigger('change');
                }
            });

            $(document).on('change' + NS, 'input, textarea, select', function () {
                if (!$(this).closest(FIELD_SELECTOR).length) {
                    return;
                }
                var group = $(this).closest('.rkrs-cf-checklist-member').data('rkrs_cf_group_object');
                if (group) setValueGroupExpansion(group, false);
                setTimeout(refreshValueBasedGroups, 0);
            });

            $(document).on('input' + NS + ' change' + NS,
                '.rkrs-cf-group-member input, .rkrs-cf-group-member textarea, .rkrs-cf-group-member select',
                function (e) {
                    var group = $(this).closest('.rkrs-cf-group-member').data('rkrs_cf_group_object');
                    if (group && group.checklist) return;
                    if (!group || (group.mode !== '2' && group.mode !== '4')) {
                        return;
                    }

                    // Mode 4 must not collapse while the user is typing into
                    // the last empty field. Recalculate it only when editing
                    // is committed (change/blur in amoCRM).
                    if (group.mode === '4' && e.type === 'input') {
                        return;
                    }

                    setValueGroupExpansion(group, false);

                    // Let amoCRM finish updating custom controls before reading
                    // their current value.
                    setTimeout(function () {
                        group.collapsed = group.mode === '2'
                            ? !groupHasValue(group)
                            : groupAllFieldsHaveValue(group);
                        applyGroupState(group);
                    }, 0);
                }
            );

            $(document).on('mousedown' + NS + ' focusin' + NS,
                '.linked-form__field .control--select, .linked-form__field .control--select--button, .linked-form__field select',
                function () {
                    var $field = $(this).closest('.linked-form__field');
                    setTimeout(function () {
                        scanSwitcherField($field);
                    }, 0);
                }
            );

            $(document).on('click' + NS, '[data-rkrs-cf-switch-key]', function () {
                var $item = $(this);
                if ($item.is('option')) {
                    return;
                }

                var key = $item.attr('data-rkrs-cf-switch-key');
                var $field = $item.closest('.rkrs-cf-switcher-field');
                if ($item.is('input[type="radio"]') && !$item.is(':checked')) {
                    return;
                }
                if (!$field.length || !key) {
                    return;
                }

                if ($item.is('input[type="radio"]')) {
                    setSwitcherSelection($field, key, true);
                } else {
                    // A custom-select item is clicked before amoCRM commits
                    // the actual value. Confirm the selected value first so a
                    // click cannot show a group that disagrees with the field.
                    syncSwitcherSelection($field, key, 0);
                }
            });
        }

        function bindNavigation() {
            if (state.navBound) {
                return;
            }

            state.navBound = true;
            $(window).on('hashchange.rkrs_cf_nav popstate.rkrs_cf_nav', function () {
                setTimeout(function () {
                    if (isCardArea()) {
                        start();
                    }
                }, 120);
            });
        }

        function start() {
            if (accessState().status !== 'active' || !isActivated()) {
                return;
            }

            if (!state.filterLabels) state.filterLabels = createFilterLabels(document, removeWidgetMarkers);
            state.filterLabels.start();
            if (!isCardArea()) return;

            includeCSS();
            bindNavigation();
            bindGlobalActions();
            startObserver();
            startHelpObserver();
            state.started = true;
            state.retryCount = 0;
            scheduleProcess(0);

            for (var i = 0; i < state.startTimers.length; i++) {
                clearTimeout(state.startTimers[i]);
            }
            state.startTimers = [
                setTimeout(function () {
                    if (isCardArea()) {
                        startObserver();
                        scheduleProcess(0);
                    }
                }, 400),
                setTimeout(function () {
                    if (isCardArea()) {
                        startObserver();
                        scheduleProcess(0);
                    }
                }, 1000)
            ];
        }

        function destroy() {
            if (state.filterLabels) {
                state.filterLabels.stop();
                state.filterLabels = null;
            }
            if (state.checklistRefreshTimer) {
                clearTimeout(state.checklistRefreshTimer);
                state.checklistRefreshTimer = null;
            }
            state.checklistMetadata = {};
            state.checklistManualStates = {};
            if (state.processTimer) {
                clearTimeout(state.processTimer);
                state.processTimer = null;
            }
            if (state.validationGroupTimer) {
                clearTimeout(state.validationGroupTimer);
                state.validationGroupTimer = null;
            }

            for (var t = 0; t < state.startTimers.length; t++) {
                clearTimeout(state.startTimers[t]);
            }
            state.startTimers = [];

            stopObserver();
            stopHelpObserver();
            $(document).off(NS);
            $(window).off(NS);
            $(window).off('.rkrs_cf_nav');
            state.navBound = false;
            cleanupEnhancements(true);
            $('.rkrs-cf-formula-sink').remove();
            $('.rkrs-cf-label-text')
                .removeClass('rkrs-cf-label-text')
                .removeAttr('data-rkrs-cf-label-owner');
            state.started = false;
            state.retryCount = 0;
            state.needsReprocess = false;
        }

        // Future activation-backend hook. It only prepares data and never sends a request.
        self.parseFieldLabel = parseFieldLabel;
        self.labelHasMarkers = labelHasMarkers;
        self.removeWidgetMarkers = removeWidgetMarkers;

        function closeSettings() {
            if (form) form.destroy();
            form = null;
            if (modal) $(modal).removeClass('rkrs-fields-settings').find('.rkrs-df-settings-wrap, .rkrs-af-status').remove();
            settingsAccessHost = null;
            modal = null;
        }

        function renderSettings(target) {
            var $modal = $(target);
            if (!isActivated()) {
                $modal.find('.rkrs-df-settings-wrap, .rkrs-af-status').remove();
                settingsAccessHost = null;
                if (accessShown.status === 'unactivated') {
                    if (!form) form = activation.mount(self, target, access.refresh);
                    return;
                }
                if (form) form.destroy();
                form = null;
                var $status = $('<p role="status">').addClass('rkrs-af-status');
                if (accessShown.status === 'error') {
                    $status.text('Не удалось проверить доступ. ').append(
                        $('<button type="button">').text('Повторить').on('click', access.refresh));
                } else {
                    $status.text('Проверяем доступ…');
                }
                $modal.append($status);
                return;
            }
            if (form) form.destroy();
            form = null;
            $modal.find('.rkrs-af-status').remove();
            if (settingsAccessHost) return;

            // Окно в стиле самой amoCRM («Меню amo», стандарт с 05.11.2026, образец — «Счётчик недозвонов»):
            // логотип и название, срок доступа + «Продлить», как начать, маркеры, связь с нами, реквизиты.
            var version = '';
            try { version = typeof self.get_version === 'function' ? String(self.get_version() || '') : ''; } catch (e) {}

            function link(href, text, cls) {
                return $('<a>').attr({ href: href, target: '_blank', rel: 'noopener noreferrer' }).addClass(cls || '').text(text);
            }

            var $wrap = $('<div>').addClass('rkrs-df-settings-wrap');
            $wrap.append($('<div>').addClass('rkrs-df-settings-head')
                .append($('<img>').attr({ src: getWidgetAssetPath('images/logo_min.png'), alt: '', 'aria-hidden': 'true' }))
                .append($('<h1>').text('Динамические поля от Ракурс')));

            var $sum = $('<section>').addClass('rkrs-df-sum');
            settingsAccessHost = $('<div>').addClass('rkrs-df-sum-plan').attr({ role: 'status', 'aria-live': 'polite' });
            $sum.append(settingsAccessHost);

            var steps = [
                'Откройте настройки полей amoCRM — рядом с редактором поля появится справочник маркеров',
                'Добавьте маркер в начало или конец названия поля и сохраните поле',
                'Откройте карточку: маркер не виден, поле оформлено'
            ];
            var $steps = $('<ol>').addClass('rkrs-df-sum-steps');
            steps.forEach(function (text, index) {
                $steps.append($('<li>').append($('<span>').addClass('rkrs-df-sum-num').text(index + 1)).append($('<span>').text(text)));
            });
            $sum.append($('<div>').addClass('rkrs-df-sum-block')
                .append($('<h3>').text('Как начать'))
                .append($steps)
                .append($('<a>').addClass('rkrs-df-sum-guide')
                    .attr({ href: 'https://ssd.rkrs.ru/page/app/' + self.appName, target: '_blank', rel: 'noopener noreferrer' })
                    .append($('<span>').addClass('rkrs-df-sum-play').attr('aria-hidden', 'true').text('i'))
                    .append($('<span>').append($('<b>').text('Инструкция по настройке виджета')).append($('<small>').text('Все маркеры с примерами')))));

            // Видео по настройке вместо таблицы маркеров (Максим 12.11.2026): то же, что в панели-помощнике виджета.
            // Запускается только по нажатию. В описании при установке — отдельное «продающее» видео.
            $sum.append($('<div>').addClass('rkrs-df-sum-block')
                .append($('<h3>').text('Видео: как настроить за 7 минут'))
                .append($('<div>').addClass('rkrs-df-sum-video').append($('<iframe>').attr({
                    src: 'https://kinescope.io/embed/3T7NET1dgefvDQp4KndhF9?autoplay=0',
                    title: 'Как настроить маркеры за 7 минут',
                    allow: 'fullscreen; picture-in-picture; encrypted-media',
                    allowfullscreen: 'allowfullscreen'
                }))));

            var $msgs = $('<div>').addClass('rkrs-df-sum-msgs');
            CONTACTS.messengers.forEach(function (m) { $msgs.append(link(m.url, m.name, 'rkrs-df-sum-msg rkrs-df-sum-msg-' + m.key)); });
            $sum.append($('<div>').addClass('rkrs-df-sum-block rkrs-df-sum-contact-block')
                .append($('<h3>').text('Связаться с нами'))
                .append($('<p>').addClass('rkrs-df-sum-sub').text('Поможем разметить поля под вашу воронку — напишите в любой мессенджер.'))
                .append($msgs)
                .append($('<p>').addClass('rkrs-df-sum-contacts')
                    .append(link('tel:' + CONTACTS.phoneHref, CONTACTS.phone)).append(' · ')
                    .append(link('mailto:' + CONTACTS.email, CONTACTS.email)).append(' · ')
                    .append(link(CONTACTS.site, 'rkrs.ru'))));
            $sum.append($('<div>').addClass('rkrs-df-sum-legal')
                .append($('<p>').text(CONTACTS.legal))
                .append($('<p>').append(link(CONTACTS.policy, 'Политика конфиденциальности')).append(' · Версия ' + (version || '—'))));

            $wrap.append($sum);
            $modal.append($wrap);
            renderAccessStatus(settingsAccessHost);
        }

        self.callbacks = {
            render: function () { includeCSS(); requestStart(); return true; },
            init: function () { requestStart(); return true; },
            bind_actions: function () { requestStart(); return true; },
            settings: function (body) {
                var target = body && (body.nodeType === 1 ? body : body[0]);
                closeSettings();
                if (!target || self.get_settings().active !== 'Y') return true;
                includeCSS();
                modal = target;
                $(modal).addClass('rkrs-fields-settings');
                renderSettings(target);
                requestStart();
                access.refresh();
                return true;
            },
            onSave: function () { return !form || form.allowSave(); },
            loadElements: function () {
                requestStart();
                return Promise.resolve({});
            },

            linkCard: function () {
                requestStart();
                return Promise.resolve(true);
            },

            destroy: function () {
                access.stop();
                closeSettings();
                accessShown = { status: 'checking', paidTo: '' };
                stopNotice();
                $(window).off('.rkrs_af_access');
                settingsAccessHost = null;
                destroy();
                return true;
            }
        };
        return self;
    };
});
