(function (root, factory) {
    if (typeof define === 'function') {
        define([], function () { return factory; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./constants'), require('./rules'), require('./snapshot'));
    } else {
        root.RkrsWtSettingsController = factory(root.RkrsWtConstants, root.RkrsWtRules, root.RkrsWtSnapshot);
    }
}(typeof self !== 'undefined' ? self : this, function (Constants, Rules, Snapshot) {
    'use strict';

    function errorStatus(error) {
        return Number(error && error.status) || 0;
    }

    function SettingsController(options) {
        this.widget = options.widget;
        this.$ = options.$;
        this.api = options.api;
        this.repository = options.repository;
        this.accountId = Number(options.accountId) || 0;
        this.$body = null;
        this.$root = null;
        this.$host = null;
        this.persistedConfig = null;
        this.draftConfig = null;
        this.rules = [];
        this.referenceData = null;
        this.referencePromise = null;
        this.pendingMutation = Promise.resolve();
        this.destroyed = false;
        this.dirty = false;
        this.storageState = 'unknown';
        this.bootstrapKey = 'rkrs_wt_bootstrap:' + this.accountId;
        this.closeObserver = null;
        this.saving = false;
        this.closedWhileSaving = false;
        this.allowProvisionOnSave = false;
        this.provisionRequested = false;
    }

    SettingsController.prototype._settings = function () {
        try { return this.widget.get_settings() || {}; } catch (error) { return {}; }
    };

    SettingsController.prototype._installStatus = function () {
        try { return String(this.widget.get_install_status() || ''); } catch (error) { return ''; }
    };

    SettingsController.prototype._isDisabling = function (data) {
        if (data && (data.active === false || data.active === 0 || data.active === 'N' || data.enabled === false)) {
            return true;
        }
        if (!this.$body) {
            return false;
        }
        var $switch = this.$body.find([
            'input[name="widget_active"]',
            'input.js-widget-active',
            '.widget_settings_block__switch input[type="checkbox"]',
            '.widget_settings_block__switcher input[type="checkbox"]'
        ].join(',')).first();
        return Boolean($switch.length && !$switch.prop('checked'));
    };

    SettingsController.prototype._hiddenInput = function () {
        var widgetCode = this._settings().widget_code || (this.widget.params && this.widget.params.widget_code) || '';
        var $input = this.$body && this.$body.find('input[name="' + Constants.RUNTIME_SETTING_NAME + '"]').first();
        if (!$input || !$input.length) {
            $input = this.$('input[name="' + Constants.RUNTIME_SETTING_NAME + '"], #' + widgetCode + '_custom').first();
        }
        return $input;
    };

    SettingsController.prototype._stage = function (config) {
        this.draftConfig = config;
        var $input = this._hiddenInput();
        if (!$input.length) {
            throw new Error('Не найден системный hidden input runtime_config');
        }
        $input.val(JSON.stringify(config)).trigger('change');
    };

    SettingsController.prototype._publishedHash = function () {
        return this.persistedConfig && this.persistedConfig.published && this.persistedConfig.published.hash || '';
    };

    SettingsController.prototype._updateDraft = function () {
        if (!this.draftConfig || !this.draftConfig.storage) {
            return;
        }
        var next = Snapshot.compile(
            this.draftConfig.storage,
            this.rules,
            this.persistedConfig && this.persistedConfig.published
        );
        this._stage(next);
        this.dirty = next.published.hash !== this._publishedHash();
        this._renderPublishState();
    };

    SettingsController.prototype._renderPublishState = function () {
        if (!this.$root) {
            return;
        }
        var $state = this.$root.find('.js-rkrs-wt-publish-state');
        $state.toggleClass('is-dirty', this.dirty);
        $state.text(this.dirty ? 'Есть неопубликованные изменения' : 'Все изменения опубликованы');
        var revision = this.persistedConfig && this.persistedConfig.published && this.persistedConfig.published.revision;
        this.$root.find('.js-rkrs-wt-revision').text(revision ? ('Версия ' + revision) : 'Версия ещё не опубликована');
    };

    SettingsController.prototype._renderShell = function () {
        this.$body.find('.widget_settings_block__descr').hide();
        this.$body.find('.rkrs-wt-settings-host').remove();

        var $fieldsWrapper = this.$body.find('#widget_settings__fields_wrapper').first();
        if (!$fieldsWrapper.length) {
            $fieldsWrapper = this.$('#widget_settings__fields_wrapper').first();
        }
        var $hiddenItem = this._hiddenInput().closest('.widget_settings_block__item_field');
        var $anchor = $fieldsWrapper.find('.widget_settings_block__item_field').last();

        this.$host = this.$('<div>')
            .addClass('widget_settings_block__item_field rkrs-wt-settings-host');
        this.$root = this.$('<div>').addClass('rkrs-wt-settings');
        this.$host.append(this.$root);

        if ($hiddenItem.length) {
            $hiddenItem.after(this.$host).hide();
        } else if ($anchor.length) {
            $anchor.after(this.$host);
        } else if ($fieldsWrapper.length) {
            $fieldsWrapper.append(this.$host);
        } else {
            var $settingsBlock = this.$body.find('.widget_settings_block').first();
            ($settingsBlock.length ? $settingsBlock : this.$body).append(this.$host);
        }
        this._renderLoading('Загружаем правила…');
    };

    SettingsController.prototype._renderLoading = function (message) {
        this.$root.html(
            '<div class="rkrs-wt-settings__header">' +
                '<img src="' + this._asset('images/rakurs_logo_icon.svg') + '" alt="">' +
                '<div><h2>Контроль карточек без задач</h2><p>' + String(message || '') + '</p></div>' +
            '</div>' +
            '<div class="rkrs-wt-skeleton"><span></span><span></span><span></span></div>'
        );
    };

    SettingsController.prototype._asset = function (path) {
        var base = '';
        try { base = this.widget.params.path || this.widget.params.cdn_path || this._settings().path || ''; } catch (error) {}
        return base + '/' + String(path).replace(/^\/+/, '');
    };

    SettingsController.prototype._renderInstall = function (options) {
        options = options || {};
        var title = options.title || 'Служебное хранилище ещё не создано';
        var text = options.text || 'Создайте технический список amoCRM. В нём будут храниться правила администратора.';
        this.$root.html(
            '<div class="rkrs-wt-settings__header">' +
                '<img src="' + this._asset('images/rakurs_logo_icon.svg') + '" alt="">' +
                '<div><h2>Контроль карточек без задач</h2><p>Работает без внешнего сервера</p></div>' +
            '</div>' +
            '<section class="rkrs-wt-empty">' +
                '<h3>' + title + '</h3><p>' + text + '</p>' +
                '<button type="button" class="button-input button-input_blue js-rkrs-wt-provision">Создать хранилище</button>' +
            '</section>'
        );
    };

    SettingsController.prototype._renderStorageError = function (error) {
        var status = errorStatus(error);
        var title = 'Не удалось прочитать служебное хранилище';
        var message = error && error.message ? String(error.message) : 'Повторите попытку или проверьте права администратора.';
        var action = '<button type="button" class="button-input js-rkrs-wt-reload">Проверить снова</button>';
        if (error && error.code === 'CATALOG_LIMIT') {
            title = 'Достигнут лимит списков';
            message = 'В аккаунте используются все 10 списков. Освободите один список и повторите восстановление.';
        } else if (status === 403 || status === 401) {
            title = 'Недостаточно прав';
            message = 'Откройте настройки под администратором с доступом к спискам. Автоматическое восстановление не запущено.';
        } else if (status === 404) {
            title = 'Служебный каталог удалён';
            message = 'Менеджеры продолжают работать по опубликованному snapshot. Каталог можно восстановить из него.';
            action = '<button type="button" class="button-input button-input_blue js-rkrs-wt-restore">Восстановить каталог</button>';
        }
        this.$root.html(
            '<div class="rkrs-wt-settings__header"><div><h2>Контроль карточек без задач</h2></div></div>' +
            '<section class="rkrs-wt-error"><h3></h3><p class="js-rkrs-wt-storage-error-message"></p>' + action + '</section>'
        );
        this.$root.find('.rkrs-wt-error h3').text(title);
        this.$root.find('.js-rkrs-wt-storage-error-message').text(message);
        var details = [];
        if (status) { details.push('HTTP: ' + status); }
        if (error && error.code) { details.push('Код: ' + error.code); }
        if (error && error.path) { details.push('Запрос: ' + error.path); }
        if (error && error.response) {
            var responseText;
            try { responseText = JSON.stringify(error.response, null, 2); }
            catch (jsonError) { responseText = String(error.response); }
            details.push('Ответ amoCRM:\n' + responseText.slice(0, 5000));
        }
        if (details.length) {
            var $details = this.$('<details>').addClass('rkrs-wt-error-details');
            $details.append(this.$('<summary>').text('Технические детали'));
            $details.append(this.$('<pre>').text(details.join('\n')));
            this.$root.find('.rkrs-wt-error').append($details);
        }
        if (typeof console !== 'undefined' && console.error) {
            console.error('[rkrs_lead_notasks] storage error', error);
        }
    };

    SettingsController.prototype.init = async function ($body) {
        this.$body = $body;
        var parsed = Snapshot.parseRuntimeConfig(this._settings().runtime_config);
        this.persistedConfig = parsed.config;
        this.draftConfig = parsed.config;
        this.allowProvisionOnSave = ['install', 'not_configured'].indexOf(this._installStatus()) !== -1;
        this._renderShell();
        this._bindActions();
        this._observeClose();
        if (!parsed.config || !parsed.config.storage) {
            this.storageState = 'missing';
            this._renderInstall();
            return;
        }
        await this.reload();
    };

    SettingsController.prototype._observeClose = function () {
        if (typeof MutationObserver === 'undefined' || !this.$body || !this.$body[0] || !this.$body[0].parentNode) {
            return;
        }
        var self = this;
        var bodyNode = this.$body[0];
        var watchedNode = this.$body.closest('.modal, .modal-window, .widget-settings').first()[0] || bodyNode;
        var observerRoot = watchedNode.parentNode || bodyNode.parentNode;
        this.closeObserver = new MutationObserver(function () {
            if (typeof document !== 'undefined' && !document.documentElement.contains(bodyNode)) {
                if (self.saving) {
                    self.closedWhileSaving = true;
                } else {
                    self.destroy();
                }
            }
        });
        this.closeObserver.observe(observerRoot, { childList: true });
    };

    SettingsController.prototype.reload = async function () {
        if (!this.draftConfig || !this.draftConfig.storage) {
            this._renderInstall();
            return;
        }
        this._renderLoading('Проверяем каталог и загружаем правила…');
        try {
            await this.repository.verifyCatalog(this.draftConfig.storage, this.accountId);
            this.rules = await this.repository.getRules(this.draftConfig.storage);
            this.storageState = 'ready';
            this.dirty = Snapshot.hashRules(this.rules) !== this._publishedHash();
            this._renderRules();
        } catch (error) {
            this.storageState = errorStatus(error) === 404 ? 'missing' : 'error';
            this._renderStorageError(error);
        }
    };

    SettingsController.prototype._ruleSummary = function (rule) {
        var pipelines = rule.pipelines.length;
        var statuses = rule.pipelines.reduce(function (total, pipeline) { return total + pipeline.status_ids.length; }, 0);
        return rule.users.length + ' пользователей · ' + pipelines + ' воронок / ' + statuses + ' этапов';
    };

    SettingsController.prototype._renderRules = function () {
        var self = this;
        this.$root.html(
            '<div class="rkrs-wt-settings__header">' +
                '<img src="' + this._asset('images/rakurs_logo_icon.svg') + '" alt="">' +
                '<div><h2>Контроль карточек без задач</h2><p>Каталог — черновик, основная кнопка «Сохранить» публикует snapshot.</p></div>' +
            '</div>' +
            '<div class="rkrs-wt-toolbar">' +
                '<div><span class="rkrs-wt-publish-state js-rkrs-wt-publish-state"></span><small class="js-rkrs-wt-revision"></small></div>' +
                '<div class="rkrs-wt-toolbar__actions">' +
                    '<button type="button" class="button-input js-rkrs-wt-verify">Проверить правила</button>' +
                    '<button type="button" class="button-input button-input_blue js-rkrs-wt-add">Добавить правило</button>' +
                '</div>' +
            '</div>' +
            '<div class="rkrs-wt-message js-rkrs-wt-message" hidden></div>' +
            '<div class="rkrs-wt-rules js-rkrs-wt-rules"></div>' +
            '<div class="rkrs-wt-editor-host js-rkrs-wt-editor-host"></div>'
        );
        var visibleRules = this.rules.filter(function (rule) { return !rule.archived; });
        var $list = this.$root.find('.js-rkrs-wt-rules');
        if (!visibleRules.length) {
            $list.append('<div class="rkrs-wt-empty rkrs-wt-empty_compact"><h3>Правил пока нет</h3><p>Добавьте первое правило для выбранных пользователей и этапов.</p></div>');
        }
        visibleRules.forEach(function (rule) {
            var validClass = rule.valid === false ? ' is-invalid' : '';
            var $card = self.$('<article>').addClass('rkrs-wt-rule' + validClass).attr('data-rule-uid', rule.uid);
            var $head = self.$('<div>').addClass('rkrs-wt-rule__head');
            $head.append(self.$('<div>').append(self.$('<h3>').text(rule.name)).append(self.$('<p>').text(self._ruleSummary(rule))));
            $head.append(self.$('<span>').addClass('rkrs-wt-badge ' + (rule.enabled ? 'is-on' : 'is-off')).text(rule.enabled ? 'Вкл' : 'Выкл'));
            $card.append($head);
            if (rule.valid === false) {
                $card.append(self.$('<div>').addClass('rkrs-wt-rule__warning').text('Повреждено: ' + (rule.errors || []).join(', ')));
            }
            var flags = [
                ['Окно', rule.showModal],
                ['Запрет выхода', rule.denyExit],
                ['Ответственный', rule.checkResponsible],
                ['Покупатели', rule.customers]
            ];
            var $flags = self.$('<div>').addClass('rkrs-wt-rule__flags');
            flags.forEach(function (flag) {
                $flags.append(self.$('<span>').append(self.$('<b>').text(flag[0])).append(document.createTextNode(flag[1] ? 'Да' : 'Нет')));
            });
            $card.append($flags);
            $card.append(
                '<div class="rkrs-wt-rule__actions">' +
                    '<button type="button" class="button-input js-rkrs-wt-edit">Изменить</button>' +
                    '<button type="button" class="button-input js-rkrs-wt-toggle">' + (rule.enabled ? 'Выключить' : 'Включить') + '</button>' +
                    '<button type="button" class="button-input button-input_red js-rkrs-wt-archive">Удалить</button>' +
                '</div>'
            );
            $list.append($card);
        });
        this._renderPublishState();
    };

    SettingsController.prototype._message = function (text, type) {
        var $message = this.$root.find('.js-rkrs-wt-message');
        if (!$message.length) { return; }
        $message.removeAttr('hidden').removeClass('is-error is-success').addClass(type === 'error' ? 'is-error' : 'is-success').text(text);
    };

    SettingsController.prototype._findRule = function (uid) {
        return this.rules.filter(function (rule) { return rule.uid === uid; })[0] || null;
    };

    SettingsController.prototype._queueMutation = function (operation) {
        var self = this;
        var execution = this.pendingMutation.catch(function () {}).then(operation);
        this.pendingMutation = execution;
        execution.catch(function (error) {
            self._message(error.message || 'Не удалось сохранить правило', 'error');
        });
        return execution;
    };

    SettingsController.prototype._loadReferenceData = function () {
        if (this.referenceData) {
            return Promise.resolve(this.referenceData);
        }
        if (this.referencePromise) {
            return this.referencePromise;
        }
        var self = this;
        this.referencePromise = Promise.all([
            this.api.getAllPages('/api/v4/users', 'users', { limit: 250, maxPages: 10 }),
            this.api.get('/api/v4/leads/pipelines', { limit: 250 }, 'SETTINGS_PIPELINES'),
            this.api.get('/api/v4/customers/statuses', { limit: 250 }, 'SETTINGS_CUSTOMER_STATUSES').catch(function () {
                return { _embedded: { statuses: [] } };
            })
        ]).then(function (responses) {
            self.referenceData = {
                users: responses[0].filter(function (user) { return user.active !== false; }),
                pipelines: responses[1] && responses[1]._embedded && responses[1]._embedded.pipelines || [],
                customerStatuses: responses[2] && responses[2]._embedded && responses[2]._embedded.statuses || []
            };
            return self.referenceData;
        }).finally(function () {
            self.referencePromise = null;
        });
        return this.referencePromise;
    };

    SettingsController.prototype._renderEditor = async function (rule) {
        var $host = this.$root.find('.js-rkrs-wt-editor-host');
        $host.html(
            '<section class="rkrs-wt-editor rkrs-wt-editor_loading" aria-busy="true" aria-label="Загрузка редактора правила">' +
                '<div class="rkrs-wt-editor__title">' +
                    '<div class="rkrs-wt-editor__title-main"><span class="rkrs-wt-editor__mark" aria-hidden="true">✓</span><div><h3>' + (rule ? 'Изменить правило' : 'Новое правило') + '</h3><p>Подготавливаем настройки правила…</p></div></div>' +
                    '<button type="button" class="js-rkrs-wt-editor-close" aria-label="Закрыть">×</button>' +
                '</div>' +
                '<div class="rkrs-wt-editor__content">' +
                    '<div class="rkrs-wt-editor__section rkrs-wt-editor-skeleton__section">' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_heading"></span>' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_caption"></span>' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_input"></span>' +
                    '</div>' +
                    '<div class="rkrs-wt-editor__section rkrs-wt-editor-skeleton__section">' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_heading"></span>' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_caption"></span>' +
                        '<div class="rkrs-wt-editor-skeleton__grid"><span class="rkrs-wt-skeleton"></span><span class="rkrs-wt-skeleton"></span><span class="rkrs-wt-skeleton"></span><span class="rkrs-wt-skeleton"></span></div>' +
                    '</div>' +
                    '<div class="rkrs-wt-editor__section rkrs-wt-editor-skeleton__section">' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_heading"></span>' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_caption"></span>' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_panel"></span>' +
                        '<span class="rkrs-wt-skeleton rkrs-wt-skeleton_panel"></span>' +
                    '</div>' +
                '</div>' +
                '<div class="rkrs-wt-editor__footer"><span class="rkrs-wt-skeleton rkrs-wt-skeleton_button"></span></div>' +
                '<span class="rkrs-wt-visually-hidden" role="status">Загружаем пользователей и воронки…</span>' +
            '</section>'
        );
        try {
            var data = await this._loadReferenceData();
            if (this.destroyed) { return; }
            this._buildEditor(rule, data, $host);
        } catch (error) {
            $host.html('<div class="rkrs-wt-error"><h3>Не удалось открыть редактор</h3><p>Проверьте права администратора на пользователей и воронки.</p></div>');
        }
    };

    SettingsController.prototype._appendMissingIds = function ($list, selectedIds, known, kind, attribute) {
        var $ = this.$;
        var knownIds = known.reduce(function (result, item) { result[Number(item.id)] = true; return result; }, {});
        selectedIds.filter(function (id) { return !knownIds[Number(id)]; }).forEach(function (id) {
            var $label = $('<label>').addClass('rkrs-wt-option is-missing');
            var attrs = { type: 'checkbox', checked: 'checked' };
            attrs[attribute || 'data-missing-id'] = id;
            $label.append($('<input>').attr(attrs));
            $label.append($('<span>').text('Удалённый ' + kind + ' #' + id));
            $list.append($label);
        });
    };

    SettingsController.prototype._buildEditor = function (input, data, $host) {
        var self = this;
        var rule = Rules.normalizeRule(input || {
            uid: Rules.createUid(),
            name: '', users: [], pipelines: [], customerStatuses: [],
            showModal: false, denyExit: true, checkResponsible: true,
            customers: false, enabled: true, archived: false
        });
        var selectedUsers = rule.users.reduce(function (result, id) { result[id] = true; return result; }, {});
        var selectedPipelines = rule.pipelines.reduce(function (result, pipeline) {
            result[pipeline.pipeline_id] = pipeline.status_ids.reduce(function (statuses, id) { statuses[id] = true; return statuses; }, {});
            return result;
        }, {});
        var selectedCustomerStatuses = rule.customerStatuses.reduce(function (result, id) { result[id] = true; return result; }, {});
        var $editor = this.$('<section>').addClass('rkrs-wt-editor').attr('data-rule-uid', rule.uid);
        $editor.append('<div class="rkrs-wt-editor__title"><div class="rkrs-wt-editor__title-main"><span class="rkrs-wt-editor__mark" aria-hidden="true">✓</span><div><h3>' + (input ? 'Изменить правило' : 'Новое правило') + '</h3><p>Настройте область действия и поведение контроля задач.</p></div></div><button type="button" class="js-rkrs-wt-editor-close" aria-label="Закрыть">×</button></div>');
        var $content = this.$('<div>').addClass('rkrs-wt-editor__content');
        $editor.append($content);
        var $name = this.$('<label>').addClass('rkrs-wt-field rkrs-wt-editor__section').append('<span class="rkrs-wt-section-heading"><strong>Название правила</strong><small>Показывается только администраторам</small></span>');
        $name.append(this.$('<input>').attr({ type: 'text', name: 'rule_name', placeholder: 'Например, Отдел новых продаж' }).val(input ? rule.name : ''));
        $content.append($name);

        var $users = this.$('<div>').addClass('rkrs-wt-field rkrs-wt-editor__section').append('<span class="rkrs-wt-section-heading"><strong>Пользователи</strong><small>Для кого действует правило</small></span>');
        var $userPicker = this.$('<details>').addClass('rkrs-wt-user-picker').prop('open', rule.users.length === 0);
        var $userSummary = this.$('<summary>');
        var $userSummaryMain = this.$('<span>').addClass('rkrs-wt-user-picker__summary-main');
        $userSummaryMain.append(this.$('<strong>').text('Выбранные пользователи'));
        $userSummaryMain.append(this.$('<span>').addClass('rkrs-wt-user-picker__selection js-rkrs-wt-user-summary'));
        $userSummary.append($userSummaryMain);
        $userSummary.append(this.$('<span>').addClass('rkrs-wt-selection-count js-rkrs-wt-user-count'));
        $userPicker.append($userSummary);
        var $userPickerBody = this.$('<div>').addClass('rkrs-wt-user-picker__body');
        var $userTools = this.$('<div>').addClass('rkrs-wt-selection-tools');
        $userTools.append(this.$('<input>').attr({ type: 'search', class: 'js-rkrs-wt-user-search', placeholder: 'Найти пользователя…', 'aria-label': 'Найти пользователя' }));
        $userTools.append('<span class="rkrs-wt-selection-count js-rkrs-wt-user-count"></span>');
        $userTools.append('<button type="button" class="rkrs-wt-text-button js-rkrs-wt-select-users" data-action="all">Выбрать видимых</button>');
        $userTools.append('<button type="button" class="rkrs-wt-text-button js-rkrs-wt-select-users" data-action="none">Снять выбор</button>');
        $userPickerBody.append($userTools);
        var $userList = this.$('<div>').addClass('rkrs-wt-options rkrs-wt-options_users');
        data.users.forEach(function (user) {
            var userName = user.name || ('Пользователь #' + user.id);
            var $label = self.$('<label>').addClass('rkrs-wt-option').attr('data-search-text', String(userName).toLowerCase());
            $label.append(self.$('<input>').attr({ type: 'checkbox', 'data-user-id': user.id }).prop('checked', Boolean(selectedUsers[Number(user.id)])));
            $label.append(self.$('<span>').text(userName));
            $userList.append($label);
        });
        this._appendMissingIds($userList, rule.users, data.users, 'пользователь', 'data-user-id');
        $userPickerBody.append($userList);
        $userPicker.append($userPickerBody);
        $users.append($userPicker);
        $content.append($users);

        var $pipelines = this.$('<div>').addClass('rkrs-wt-field rkrs-wt-editor__section').append('<span class="rkrs-wt-section-heading"><strong>Воронки и этапы</strong><small>Раскройте нужную воронку и выберите этапы</small></span>');
        data.pipelines.forEach(function (pipeline) {
            var statuses = pipeline._embedded && pipeline._embedded.statuses || [];
            var selectedForPipeline = rule.pipelines.filter(function (item) { return item.pipeline_id === Number(pipeline.id); })[0];
            var selectedCount = selectedForPipeline ? selectedForPipeline.status_ids.length : 0;
            var $pipeline = self.$('<details>').addClass('rkrs-wt-pipeline').prop('open', selectedCount > 0);
            var $summary = self.$('<summary>');
            $summary.append(self.$('<strong>').text(pipeline.name || ('Воронка #' + pipeline.id)));
            $summary.append(self.$('<span>').addClass('rkrs-wt-pipeline__count').text(selectedCount + ' из ' + statuses.length));
            $pipeline.append($summary);
            var $pipelineBody = self.$('<div>').addClass('rkrs-wt-pipeline__body');
            $pipelineBody.append('<div class="rkrs-wt-pipeline__tools"><button type="button" class="rkrs-wt-text-button js-rkrs-wt-select-pipeline" data-action="all">Выбрать все</button><button type="button" class="rkrs-wt-text-button js-rkrs-wt-select-pipeline" data-action="none">Снять выбор</button></div>');
            var $statusList = self.$('<div>').addClass('rkrs-wt-pipeline__options');
            statuses.forEach(function (status) {
                var $label = self.$('<label>').addClass('rkrs-wt-option');
                $label.append(self.$('<input>').attr({
                    type: 'checkbox',
                    'data-pipeline-id': pipeline.id,
                    'data-status-id': status.id
                }).prop('checked', Boolean(selectedPipelines[Number(pipeline.id)] && selectedPipelines[Number(pipeline.id)][Number(status.id)])));
                $label.append(self.$('<span>').text(status.name || ('Этап #' + status.id)));
                $statusList.append($label);
            });
            if (selectedForPipeline) {
                var knownStatusIds = statuses.reduce(function (result, status) {
                    result[Number(status.id)] = true;
                    return result;
                }, {});
                selectedForPipeline.status_ids.filter(function (statusId) {
                    return !knownStatusIds[Number(statusId)];
                }).forEach(function (statusId) {
                    var $missingStatus = self.$('<label>').addClass('rkrs-wt-option is-missing');
                    $missingStatus.append(self.$('<input>').attr({
                        type: 'checkbox',
                        checked: 'checked',
                        'data-pipeline-id': pipeline.id,
                        'data-status-id': statusId
                    }));
                    $missingStatus.append(self.$('<span>').text('Удалённый этап #' + statusId));
                    $statusList.append($missingStatus);
                });
            }
            $pipelineBody.append($statusList);
            $pipeline.append($pipelineBody);
            $pipelines.append($pipeline);
        });
        rule.pipelines.filter(function (pipeline) {
            return !data.pipelines.some(function (known) { return Number(known.id) === pipeline.pipeline_id; });
        }).forEach(function (pipeline) {
            var $missing = self.$('<details open>').addClass('rkrs-wt-pipeline is-missing');
            $missing.append(self.$('<summary>').append(self.$('<strong>').text('Удалённая воронка #' + pipeline.pipeline_id)).append(self.$('<span>').addClass('rkrs-wt-pipeline__count')));
            var $missingBody = self.$('<div>').addClass('rkrs-wt-pipeline__body');
            var $missingList = self.$('<div>').addClass('rkrs-wt-pipeline__options');
            pipeline.status_ids.forEach(function (statusId) {
                var $label = self.$('<label>').addClass('rkrs-wt-option is-missing');
                $label.append(self.$('<input>').attr({ type: 'checkbox', checked: 'checked', 'data-pipeline-id': pipeline.pipeline_id, 'data-status-id': statusId }));
                $label.append(self.$('<span>').text('Удалённый этап #' + statusId));
                $missingList.append($label);
            });
            $missingBody.append($missingList);
            $missing.append($missingBody);
            $pipelines.append($missing);
        });
        $content.append($pipelines);

        var $behavior = this.$('<div>').addClass('rkrs-wt-editor__section');
        $behavior.append('<div class="rkrs-wt-section-heading"><strong>Поведение правила</strong><small>Что видит пользователь и когда срабатывает контроль</small></div>');
        var $flags = this.$('<div>').addClass('rkrs-wt-flags');
        [
            ['show_modal', 'Окно со списком карточек без задач', rule.showModal],
            ['deny_exit', 'Запрещать выход без активной задачи', rule.denyExit],
            ['check_responsible', 'Проверять ответственного', rule.checkResponsible],
            ['customers', 'Применять к покупателям', rule.customers],
            ['enabled', 'Правило активно', rule.enabled]
        ].forEach(function (flag) {
            var $label = self.$('<label>').addClass('rkrs-wt-switch');
            $label.append(self.$('<input>').attr({ type: 'checkbox', name: flag[0] }).prop('checked', flag[2]));
            $label.append(self.$('<span>').text(flag[1]));
            $flags.append($label);
        });
        $behavior.append($flags);
        $content.append($behavior);

        var $customerStatuses = this.$('<div>').addClass('rkrs-wt-field rkrs-wt-editor__section js-rkrs-wt-customer-statuses').append('<span class="rkrs-wt-section-heading"><strong>Статусы покупателей</strong><small>Если ничего не выбрано — применяются все статусы</small></span>');
        var $customerList = this.$('<div>').addClass('rkrs-wt-options');
        data.customerStatuses.forEach(function (status) {
            var $label = self.$('<label>').addClass('rkrs-wt-option');
            $label.append(self.$('<input>').attr({ type: 'checkbox', 'data-customer-status-id': status.id }).prop('checked', Boolean(selectedCustomerStatuses[Number(status.id)])));
            $label.append(self.$('<span>').text(status.name || ('Статус #' + status.id)));
            $customerList.append($label);
        });
        this._appendMissingIds($customerList, rule.customerStatuses, data.customerStatuses, 'статус', 'data-customer-status-id');
        $customerStatuses.append($customerList).toggle(rule.customers);
        $content.append($customerStatuses);
        $editor.append('<div class="rkrs-wt-editor__footer"><div class="rkrs-wt-editor__error js-rkrs-wt-editor-error" role="alert" hidden></div><div class="rkrs-wt-editor__actions"><button type="button" class="button-input js-rkrs-wt-editor-close">Отмена</button><button type="button" class="button-input button-input_blue js-rkrs-wt-editor-save">Сохранить правило</button></div></div>');
        $host.empty().append($editor);
        this._refreshEditorCounts($editor);
        $editor.find('[name="rule_name"]').trigger('focus');
    };

    SettingsController.prototype._refreshEditorCounts = function ($editor) {
        var self = this;
        var $selectedUsers = $editor.find('input[data-user-id]:checked');
        var selectedUsers = $selectedUsers.length;
        var totalUsers = $editor.find('input[data-user-id]').length;
        $editor.find('.js-rkrs-wt-user-count').text(selectedUsers + ' из ' + totalUsers);
        var selectedNames = $selectedUsers.map(function () {
            return self.$(this).closest('.rkrs-wt-option').find('span').first().text();
        }).get();
        var $summary = $editor.find('.js-rkrs-wt-user-summary').empty();
        if (!selectedNames.length) {
            $summary.append(self.$('<span>').addClass('rkrs-wt-user-picker__empty').text('Никто не выбран'));
        } else {
            selectedNames.slice(0, 3).forEach(function (name) {
                $summary.append(self.$('<span>').addClass('rkrs-wt-user-chip').text(name));
            });
            if (selectedNames.length > 3) {
                $summary.append(self.$('<span>').addClass('rkrs-wt-user-chip rkrs-wt-user-chip_more').text('ещё ' + (selectedNames.length - 3)));
            }
        }
        $editor.find('.rkrs-wt-pipeline').each(function () {
            var $pipeline = self.$(this);
            var selected = $pipeline.find('input[data-status-id]:checked').length;
            var total = $pipeline.find('input[data-status-id]').length;
            $pipeline.find('.rkrs-wt-pipeline__count').first().text(selected + ' из ' + total);
        });
    };

    SettingsController.prototype._readEditor = function ($editor) {
        var pipelines = {};
        $editor.find('input[data-pipeline-id][data-status-id]:checked').each(function () {
            var pipelineId = Number(this.getAttribute('data-pipeline-id'));
            var statusId = Number(this.getAttribute('data-status-id'));
            if (!pipelines[pipelineId]) { pipelines[pipelineId] = []; }
            pipelines[pipelineId].push(statusId);
        });
        return Rules.normalizeRule({
            uid: $editor.attr('data-rule-uid'),
            elementId: (this._findRule($editor.attr('data-rule-uid')) || {}).elementId,
            name: $editor.find('[name="rule_name"]').val(),
            users: $editor.find('input[data-user-id]:checked').map(function () {
                return Number(this.getAttribute('data-user-id'));
            }).get(),
            pipelines: Object.keys(pipelines).map(function (pipelineId) {
                return { pipeline_id: Number(pipelineId), status_ids: pipelines[pipelineId] };
            }),
            customerStatuses: $editor.find('input[data-customer-status-id]:checked').map(function () { return Number(this.getAttribute('data-customer-status-id')); }).get(),
            showModal: $editor.find('[name="show_modal"]').prop('checked'),
            denyExit: $editor.find('[name="deny_exit"]').prop('checked'),
            checkResponsible: $editor.find('[name="check_responsible"]').prop('checked'),
            customers: $editor.find('[name="customers"]').prop('checked'),
            enabled: $editor.find('[name="enabled"]').prop('checked'),
            archived: false
        });
    };

    SettingsController.prototype._saveEditor = function ($editor) {
        var self = this;
        var next = this._readEditor($editor);
        var validation = Rules.validateRule(next);
        if (!validation.valid) {
            $editor.find('.js-rkrs-wt-editor-error').removeAttr('hidden').text(validation.errors.join('. '));
            return;
        }
        var current = this._findRule(next.uid);
        var $button = $editor.find('.js-rkrs-wt-editor-save').prop('disabled', true).text('Сохраняем…');
        this._queueMutation(async function () {
            var saved = current ?
                await self.repository.updateRule(self.draftConfig.storage, current, next) :
                await self.repository.createRule(self.draftConfig.storage, next);
            if (current) {
                self.rules = self.rules.map(function (rule) { return rule.uid === saved.uid ? saved : rule; });
            } else {
                self.rules.push(saved);
            }
            self._updateDraft();
            self._renderRules();
            self._message('Правило сохранено в каталог. Нажмите основную кнопку «Сохранить», чтобы опубликовать изменения.', 'success');
        }).catch(function () {
            $button.prop('disabled', false).text('Сохранить правило');
        });
    };

    SettingsController.prototype._resumeBootstrap = async function () {
        var catalogId = null;
        try {
            if (typeof localStorage !== 'undefined') {
                catalogId = Number(localStorage.getItem(this.bootstrapKey)) || null;
            }
        } catch (error) {}
        if (!catalogId) {
            return null;
        }
        var catalog;
        try {
            catalog = await this.repository.getCatalog(catalogId);
        } catch (error) {
            if (errorStatus(error) === 404) {
                try { localStorage.removeItem(this.bootstrapKey); } catch (storageError) {}
                return null;
            }
            throw error;
        }
        var fields = await this.repository.getFields(catalogId);
        var storage = this.repository.storageFromFields(catalog, fields);
        var complete = Constants.FIELD_KEYS.every(function (key) { return Boolean(storage.fields[key]); });
        if (!complete) {
            storage = await this.repository.createMissingFields(catalogId, fields);
        }
        return { catalog: catalog, storage: storage };
    };

    SettingsController.prototype.provision = async function () {
        this.provisionRequested = true;
        this._renderLoading('Создаём каталог и служебные поля…');
        try {
            var created = await this._resumeBootstrap();
            var resumed = Boolean(created);
            if (!created) {
                var catalog = await this.repository.createCatalog();
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(this.bootstrapKey, String(catalog.id));
                    }
                } catch (error) {}
                created = { catalog: catalog, storage: await this.repository.createFields(catalog.id) };
            }
            this.rules = resumed ? await this.repository.getRules(created.storage) : [];
            this.persistedConfig = null;
            this.draftConfig = Snapshot.compile(created.storage, this.rules, { revision: 0 });
            this._stage(this.draftConfig);
            this.dirty = true;
            this.storageState = 'ready';
            this._renderRules();
            this._message('Хранилище создано. Нажмите основную кнопку «Установить/Сохранить», чтобы закрепить конфигурацию.', 'success');
            return this.draftConfig;
        } catch (error) {
            if (error.code === 'CATALOG_LIMIT') {
                this._renderInstall({
                    title: 'Достигнут лимит списков',
                    text: 'В аккаунте используются все 10 списков. Освободите один список и повторите создание.'
                });
            } else {
                this._renderStorageError(error);
            }
            throw error;
        }
    };

    SettingsController.prototype._reconcileRestoredRules = async function (storage, snapshotRules) {
        var targetRules = [];
        var targetByUid = {};
        (Array.isArray(snapshotRules) ? snapshotRules : []).forEach(function (input) {
            var validation = Rules.validateRule(input);
            if (!validation.valid) {
                var invalidError = new Error('Snapshot содержит повреждённое правило: ' + validation.errors.join('. '));
                invalidError.code = 'INVALID_SNAPSHOT_RULE';
                throw invalidError;
            }
            if (targetByUid[validation.rule.uid]) {
                var duplicateError = new Error('Snapshot содержит повторяющийся RULE_UID ' + validation.rule.uid);
                duplicateError.code = 'DUPLICATE_RULE_UID';
                throw duplicateError;
            }
            targetByUid[validation.rule.uid] = validation.rule;
            targetRules.push(validation.rule);
        });

        var existingRules = await this.repository.getRules(storage);
        var existingByUid = existingRules.reduce(function (result, rule) {
            if (rule.uid) { result[rule.uid] = rule; }
            return result;
        }, {});
        var unexpected = existingRules.filter(function (rule) { return !targetByUid[rule.uid]; });
        if (unexpected.length) {
            var unexpectedError = new Error('В восстанавливаемом каталоге найдены правила, которых нет в snapshot. Публикация остановлена.');
            unexpectedError.code = 'RESTORE_UNEXPECTED_RULES';
            throw unexpectedError;
        }

        var missing = [];
        for (var index = 0; index < targetRules.length; index += 1) {
            var target = targetRules[index];
            var existing = existingByUid[target.uid];
            if (!existing) {
                missing.push(target);
            } else if (Snapshot.hashRules([existing]) !== Snapshot.hashRules([target])) {
                await this.repository.updateRule(storage, existing, target);
            }
        }
        if (missing.length) {
            await this.repository.createRulesBatch(storage, missing);
        }

        var reconciled = await this.repository.getRules(storage);
        if (Snapshot.hashRules(reconciled) !== Snapshot.hashRules(targetRules)) {
            var mismatchError = new Error('Восстановленный каталог не совпадает с опубликованным snapshot. Публикация остановлена.');
            mismatchError.code = 'RESTORE_MISMATCH';
            throw mismatchError;
        }
        return reconciled;
    };

    SettingsController.prototype.restore = async function () {
        var snapshotRules = this.persistedConfig && this.persistedConfig.rules || [];
        this._renderLoading('Восстанавливаем каталог из опубликованного snapshot…');
        try {
            var resumed = await this._resumeBootstrap();
            var storage;
            if (resumed) {
                storage = resumed.storage;
            } else {
                var catalog = await this.repository.createCatalog();
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(this.bootstrapKey, String(catalog.id));
                    }
                } catch (bootstrapError) {}
                storage = await this.repository.createFields(catalog.id);
            }
            this.rules = await this._reconcileRestoredRules(storage, snapshotRules);
            this.draftConfig = Snapshot.compile(storage, this.rules, this.persistedConfig && this.persistedConfig.published);
            this._stage(this.draftConfig);
            this.dirty = true;
            this.storageState = 'ready';
            this._renderRules();
            this._message('Каталог восстановлен. Нажмите основную кнопку «Сохранить», чтобы опубликовать новый catalog_id.', 'success');
        } catch (error) {
            this._renderStorageError(error);
        }
    };

    SettingsController.prototype.verifyStorage = async function () {
        this._message('Проверяем поля хранилища…');
        try {
            var result = await this.repository.verifyFields(this.draftConfig.storage);
            if (!result.valid) {
                this._message('Повреждена структура: ' + result.errors.join('. ') + '. Для восстановления используйте опубликованный snapshot.', 'error');
                this.$root.find('.js-rkrs-wt-message').append(
                    this.$('<button type="button">')
                        .addClass('button-input js-rkrs-wt-restore')
                        .text('Восстановить в новом каталоге')
                );
                return result;
            }
            this._message('Структура каталога и служебных полей корректна.', 'success');
            return result;
        } catch (error) {
            this._message(error.message || 'Не удалось проверить структуру', 'error');
            return { valid: false, errors: [error.message] };
        }
    };

    SettingsController.prototype._mutateRule = function (uid, mutation, confirmation) {
        var self = this;
        var current = this._findRule(uid);
        if (!current) { return; }
        if (confirmation && typeof window !== 'undefined' && !window.confirm(confirmation)) {
            return;
        }
        var next = Rules.normalizeRule(current);
        mutation(next);
        this._queueMutation(async function () {
            var saved = await self.repository.updateRule(self.draftConfig.storage, current, next);
            self.rules = self.rules.map(function (rule) { return rule.uid === uid ? saved : rule; });
            self._updateDraft();
            self._renderRules();
        });
    };

    SettingsController.prototype._bindActions = function () {
        var self = this;
        this.$body.off(Constants.EVENT_NAMESPACE)
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-provision', function () { self.provision().catch(function () {}); })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-reload', function () { self.reload(); })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-restore', function () { self.restore(); })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-verify', function () { self.verifyStorage(); })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-add', function () { self._renderEditor(null); })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-edit', function () {
                self._renderEditor(self._findRule(self.$(this).closest('.rkrs-wt-rule').attr('data-rule-uid')));
            })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-editor-close', function () {
                self.$root.find('.js-rkrs-wt-editor-host').empty();
            })
            .on('change' + Constants.EVENT_NAMESPACE, '.rkrs-wt-editor [name="customers"]', function () {
                self.$(this).closest('.rkrs-wt-editor').find('.js-rkrs-wt-customer-statuses').toggle(this.checked);
            })
            .on('input' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-user-search', function () {
                var query = String(self.$(this).val() || '').toLowerCase().trim();
                self.$(this).closest('.rkrs-wt-editor__section').find('.rkrs-wt-options_users .rkrs-wt-option').each(function () {
                    var $option = self.$(this);
                    $option.toggle(!query || String($option.attr('data-search-text') || $option.text()).toLowerCase().indexOf(query) !== -1);
                });
            })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-select-users', function () {
                var $editor = self.$(this).closest('.rkrs-wt-editor');
                var checked = self.$(this).attr('data-action') === 'all';
                var $inputs = checked ? $editor.find('.rkrs-wt-options_users .rkrs-wt-option:visible input[data-user-id]') : $editor.find('input[data-user-id]');
                $inputs.prop('checked', checked);
                self._refreshEditorCounts($editor);
            })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-select-pipeline', function () {
                var $editor = self.$(this).closest('.rkrs-wt-editor');
                var checked = self.$(this).attr('data-action') === 'all';
                self.$(this).closest('.rkrs-wt-pipeline').find('input[data-status-id]').prop('checked', checked);
                self._refreshEditorCounts($editor);
            })
            .on('change' + Constants.EVENT_NAMESPACE, '.rkrs-wt-editor input[type="checkbox"]', function () {
                self._refreshEditorCounts(self.$(this).closest('.rkrs-wt-editor'));
            })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-editor-save', function () {
                self._saveEditor(self.$(this).closest('.rkrs-wt-editor'));
            })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-toggle', function () {
                var uid = self.$(this).closest('.rkrs-wt-rule').attr('data-rule-uid');
                self._mutateRule(uid, function (rule) { rule.enabled = !rule.enabled; });
            })
            .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-archive', function () {
                var uid = self.$(this).closest('.rkrs-wt-rule').attr('data-rule-uid');
                self._mutateRule(uid, function (rule) { rule.enabled = false; rule.archived = true; }, 'Архивировать правило? Оно исчезнет из списка после сохранения.');
            });
    };

    SettingsController.prototype.onSave = async function (data) {
        this.saving = true;
        try {
            if (this._isDisabling(data)) {
                return true;
            }
            if (!this.draftConfig || !this.draftConfig.storage) {
                if (!this.allowProvisionOnSave && !this.provisionRequested) {
                    return true;
                }
                await this.provision();
            }
            await this.pendingMutation;
            if (this.storageState !== 'ready') {
                return true;
            }
            if (this.persistedConfig && !this.dirty) {
                return true;
            }
            if (this.storageState === 'ready') {
                // Re-read the source of truth before publication to include manual
                // API edits and reduce stale saves by two administrator tabs.
                try {
                    this.rules = await this.repository.getRules(this.draftConfig.storage);
                } catch (error) {
                    // Catalog mutations already succeeded before draft staging.
                    // A transient refresh failure must not make deactivation or
                    // native settings save impossible; publish the staged model.
                }
                var catalogHash = Snapshot.hashRules(this.rules);
                if (this.persistedConfig && catalogHash === this._publishedHash()) {
                    this.dirty = false;
                    this._renderPublishState();
                    return true;
                }
                this.draftConfig = Snapshot.compile(
                    this.draftConfig.storage,
                    this.rules,
                    this.persistedConfig && this.persistedConfig.published
                );
                this._stage(this.draftConfig);
                this.persistedConfig = this.draftConfig;
                this.dirty = false;
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.removeItem(this.bootstrapKey);
                    }
                } catch (error) {}
                this._renderPublishState();
            }
            return true;
        } finally {
            this.saving = false;
            if (this.closedWhileSaving) {
                this.destroy();
            }
        }
    };

    SettingsController.prototype.destroy = function () {
        if (this.destroyed) { return; }
        this.destroyed = true;
        if (this.closeObserver) { this.closeObserver.disconnect(); }
        if (this.$body) { this.$body.off(Constants.EVENT_NAMESPACE); }
        if (this.api) { this.api.destroy(); }
        if (this.$host) { this.$host.remove(); }
        else if (this.$root) { this.$root.remove(); }
        this.$host = null;
        this.$root = null;
    };

    return { SettingsController: SettingsController };
}));
