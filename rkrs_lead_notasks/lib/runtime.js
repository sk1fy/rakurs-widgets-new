(function (root, factory) {
    if (typeof define === 'function') {
        define([], function () { return factory; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./constants'), require('./rules'), require('./snapshot'), require('./task_assignment'));
    } else {
        root.RkrsWtRuntime = factory(root.RkrsWtConstants, root.RkrsWtRules, root.RkrsWtSnapshot, root.RkrsWtTaskAssignment);
    }
}(typeof self !== 'undefined' ? self : this, function (Constants, Rules, Snapshot, TaskAssignment) {
    'use strict';

    function safeNumber(value) {
        var number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    function entityPage(entities, page, pageSize) {
        entities = Array.isArray(entities) ? entities : [];
        pageSize = Math.max(1, Number(pageSize) || 10);
        page = Math.max(1, Number(page) || 1);
        return entities.slice((page - 1) * pageSize, page * pageSize);
    }

    function paginationPages(currentPage, pageCount) {
        var visibleCount = Math.min(5, pageCount);
        var firstPage = Math.max(1, Math.min(currentPage - 2, pageCount - visibleCount + 1));
        var pages = [];
        for (var page = firstPage; page < firstPage + visibleCount; page += 1) {
            pages.push(page);
        }
        return pages;
    }

    function globalValue(name) {
        if (typeof window !== 'undefined' && window[name]) {
            return window[name];
        }
        if (typeof globalThis !== 'undefined' && globalThis[name]) {
            return globalThis[name];
        }
        return null;
    }

    function readConstant(name) {
        var app = globalValue('APP') || globalValue('AMOCRM');
        try {
            return app && typeof app.constant === 'function' ? app.constant(name) : null;
        } catch (error) {
            return null;
        }
    }

    function currentCardModel() {
        var app = globalValue('APP') || globalValue('AMOCRM');
        return app && app.data && app.data.current_card ? app.data.current_card : null;
    }

    function callNumber(target, method) {
        try {
            if (!target || typeof target[method] !== 'function') {
                return null;
            }
            var value = target[method]();
            return safeNumber(value && typeof value === 'object' ? (value.id || value.value) : value);
        } catch (error) {
            return null;
        }
    }

    function modelNumber(model, keys) {
        var sources = [
            model,
            model && model.attributes,
            model && model.model,
            model && model.model && model.model.attributes
        ];
        for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
            var source = sources[sourceIndex];
            if (!source) { continue; }
            for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
                var value = source[keys[keyIndex]];
                var number = safeNumber(value && typeof value === 'object' ? (value.id || value.value) : value);
                if (number) { return number; }
            }
        }
        if (model && typeof model.get === 'function') {
            for (var getIndex = 0; getIndex < keys.length; getIndex += 1) {
                try {
                    var fetched = model.get(keys[getIndex]);
                    var fetchedNumber = safeNumber(fetched && typeof fetched === 'object' ? (fetched.id || fetched.value) : fetched);
                    if (fetchedNumber) { return fetchedNumber; }
                } catch (error) {}
            }
        }
        return null;
    }

    function CardContextResolver(widget, $) {
        this.widget = widget;
        this.$ = $;
    }

    function normalizeArea(area) {
        area = String(area || '');
        if (area === 'lcard' || area.indexOf('lcard-') === 0 || area === 'leads_card') { return 'lcard'; }
        if (area === 'cucard' || area.indexOf('cucard-') === 0 || area === 'customers_card') { return 'cucard'; }
        if (area === 'llist' || area === 'leads' || area === 'leads_pipeline' || area === 'leads-pipeline' || area === 'leads-list') { return 'llist'; }
        if (area === 'culist' || area === 'customers' || area === 'customers-list') { return 'culist'; }
        if (area === 'todo' || area === 'tasks' || area === 'tlist' || area === 'tline' || area === 'tcalendar' || area.indexOf('todo-') === 0) { return 'todo'; }
        return area;
    }

    CardContextResolver.prototype.area = function () {
        var area = '';
        try {
            area = this.widget && typeof this.widget.system === 'function' ? this.widget.system().area : '';
        } catch (error) {}
        if (area && area !== 'everywhere' && area !== 'outer_space') {
            return normalizeArea(area);
        }
        var amo = globalValue('AMOCRM');
        try {
            area = amo && typeof amo.getWidgetsArea === 'function' ? amo.getWidgetsArea() : '';
        } catch (error2) {}
        if (area && area !== 'everywhere' && area !== 'outer_space') {
            return normalizeArea(area);
        }
        var href = typeof location !== 'undefined' ? String(location.pathname || '') : '';
        if (/\/leads\/detail\//.test(href)) { return 'lcard'; }
        if (/\/customers\/detail\//.test(href)) { return 'cucard'; }
        if (/\/leads/.test(href)) { return 'llist'; }
        if (/\/customers/.test(href)) { return 'culist'; }
        if (/\/todo(?:\/|$)/.test(href)) { return 'todo'; }
        return '';
    };

    CardContextResolver.prototype.resolve = function () {
        var area = this.area();
        if (area !== 'lcard' && area !== 'cucard') {
            return null;
        }
        var model = currentCardModel();
        var cardElement = readConstant('card_element') || {};
        var user = readConstant('user') || {};
        var entityType = area === 'lcard' ? 'leads' : 'customers';
        var entityId = modelNumber(model, ['id']) || safeNumber(cardElement.id);
        var statusId = callNumber(model, 'getStatusId') || modelNumber(model, ['status_id', 'lead[STATUS]']) || safeNumber(cardElement.status_id);
        var pipelineId = callNumber(model, 'getSinglePipelineId') || modelNumber(model, ['pipeline_id', 'lead[PIPELINE_ID]']) || safeNumber(cardElement.pipeline_id);
        var responsibleUserId = callNumber(model, 'getMainUser') || modelNumber(model, ['main_user', 'main_user_id', 'responsible_user_id', 'lead[MAIN_USER_ID]']) || safeNumber(cardElement.responsible_user_id || cardElement.main_user_id);

        if (entityType === 'leads') {
            var $status = this.$('#card_status_view_mode').first();
            pipelineId = pipelineId || safeNumber($status.attr('data-pipeline-id'));
            statusId = statusId || safeNumber($status.attr('data-status-id'));
        }
        if (!responsibleUserId) {
            responsibleUserId = safeNumber(this.$('[name="MAIN_USER_ID"], [name="responsible_user_id"]').first().val());
        }
        if (!entityId && typeof location !== 'undefined') {
            var match = String(location.pathname || '').match(/\/(?:leads|customers)\/detail\/(\d+)/);
            entityId = match ? safeNumber(match[1]) : null;
        }
        return {
            accountId: safeNumber((readConstant('account') || {}).id),
            entityType: entityType,
            entityId: entityId,
            pipelineId: pipelineId,
            statusId: statusId,
            responsibleUserId: responsibleUserId,
            currentUserId: safeNumber(user.id)
        };
    };

    function TaskChecker(api, $, options) {
        options = options || {};
        this.api = api;
        this.$ = $;
        this.ttl = Number(options.ttl) || Constants.TASK_CACHE_TTL_MS;
        this.cache = new Map();
        this.generation = 0;
        this.destroyed = false;
    }

    TaskChecker.prototype.key = function (context) {
        return context.entityType + ':' + context.entityId + ':responsible:' + (Number(context.responsibleUserId) || 0);
    };

    TaskChecker.prototype.localState = function () {
        var $tasks = this.$('.notes-wrapper__tasks').first();
        if (!$tasks.length) {
            return Constants.TASK_STATE.UNKNOWN;
        }
        if ($tasks.hasClass('empty') || $tasks.find('.notes-wrapper__tasks-empty, .feed-empty').length) {
            return Constants.TASK_STATE.NO_TASK;
        }
        var activeSelectors = [
            '.card-task:not(.card-task_completed):not(.completed)',
            '.notes-wrapper__task:not(.is-completed):not(.completed)',
            '[data-entity="task"]:not(.is-completed):not(.completed)'
        ].join(',');
        if ($tasks.find(activeSelectors).length) {
            return Constants.TASK_STATE.HAS_TASK;
        }
        return Constants.TASK_STATE.UNKNOWN;
    };

    TaskChecker.prototype.getCached = function (key) {
        var cached = this.cache.get(key);
        if (!cached || cached.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return cached.result;
    };

    TaskChecker.prototype.setCached = function (key, result) {
        this.cache.set(key, { result: result, expiresAt: Date.now() + this.ttl });
        return result;
    };

    TaskChecker.prototype.peek = function (context) {
        if (!context || !context.entityId || !context.entityType) {
            return null;
        }
        return this.getCached(this.key(context));
    };

    TaskChecker.prototype.check = async function (context, options) {
        options = options || {};
        if (this.destroyed) { return { state: Constants.TASK_STATE.UNKNOWN, source: 'destroyed' }; }
        if (!context || !context.entityId || !context.entityType) {
            return { state: Constants.TASK_STATE.UNKNOWN, source: 'context' };
        }
        if (!Number(context.responsibleUserId)) {
            return { state: Constants.TASK_STATE.UNKNOWN, source: 'responsible-context' };
        }
        var key = this.key(context);
        var generation = this.generation;
        var cached = !options.force ? this.getCached(key) : null;
        if (cached) {
            return cached;
        }
        try {
            var response = await this.api.get('/api/v4/tasks', {
                'filter[entity_type]': context.entityType,
                'filter[entity_id]': context.entityId,
                'filter[is_completed]': 0,
                'filter[responsible_user_id]': Number(context.responsibleUserId),
                limit: 1
            }, 'TASK:' + key);
            var tasks = response && response._embedded && response._embedded.tasks;
            if (response && !Array.isArray(tasks)) {
                return { state: Constants.TASK_STATE.UNKNOWN, source: 'api-response' };
            }
            if (this.destroyed) { return { state: Constants.TASK_STATE.UNKNOWN, source: 'destroyed' }; }
            if (generation !== this.generation) { return this.check(context, { force: true, forceApi: true }); }
            return this.setCached(key, {
                state: Array.isArray(tasks) && tasks.some(function (task) {
                    return TaskAssignment.matchesResponsible(task, context);
                }) ? Constants.TASK_STATE.HAS_TASK : Constants.TASK_STATE.NO_TASK,
                source: 'api'
            });
        } catch (error) {
            return { state: Constants.TASK_STATE.UNKNOWN, source: 'api', error: error };
        }
    };

    TaskChecker.prototype.invalidate = function (context) {
        this.generation += 1;
        if (context && context.entityId && context.entityType) {
            var prefix = context.entityType + ':' + context.entityId + ':responsible:';
            this.cache.forEach(function (value, key) {
                if (key.indexOf(prefix) === 0) { this.cache.delete(key); }
            }, this);
        }
    };

    TaskChecker.prototype.clear = function () {
        this.generation += 1;
        this.cache.clear();
    };

    TaskChecker.prototype.destroy = function () {
        this.destroyed = true;
        this.clear();
    };

    function AmoUiAdapter(widget, $, Modal) {
        this.widget = widget;
        this.$ = $;
        this.Modal = Modal;
        this.activeModals = [];
        this.entitiesModal = null;
    }

    AmoUiAdapter.prototype.openTaskCreator = function () {
        var app = globalValue('APP') || globalValue('AMOCRM');
        try {
            var compose = app && app.data && app.data.card_page && app.data.card_page.notes && app.data.card_page.notes._compose;
            if (compose && typeof compose.setCompose === 'function') {
                compose.setCompose('task');
                return true;
            }
        } catch (error) {}
        var $button = this.$('.feed-first-task-lite__inner, .js-switcher-task').first();
        if ($button.length) {
            $button.trigger('click');
            return true;
        }
        return false;
    };

    AmoUiAdapter.prototype.notify = function (message, type) {
        var amo = globalValue('AMOCRM');
        try {
            if (amo && amo.notifications && typeof amo.notifications.show_message === 'function') {
                amo.notifications.show_message({ text: message, date: Math.ceil(Date.now() / 1000), type: type || 'error' });
                return;
            }
        } catch (error) {}
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[rkrs_lead_notasks] ' + message);
        }
    };

    AmoUiAdapter.prototype.showBlockModal = function (callbacks) {
        callbacks = callbacks || {};
        var self = this;
        if (!this.Modal) {
            this.notify('У ответственного за карточку нет активной задачи. Создайте ему задачу перед выходом.');
            return null;
        }
        var modal = new this.Modal({
            class_name: 'rkrs-wt-block-modal',
            disable_overlay_click: true,
            init: function ($body) {
                var instance = this;
                var html = '<div class="rkrs-wt-dialog">' +
                    '<h2>У ответственного нет активной задачи</h2>' +
                    '<p>Перед выходом создайте задачу ответственному за карточку. Задачи других сотрудников не закрывают это условие.</p>' +
                    '<div class="rkrs-wt-dialog__actions">' +
                    '<button type="button" class="button-input js-rkrs-wt-cancel">Отмена</button>' +
                    '<button type="button" class="button-input button-input_blue js-rkrs-wt-create-task">Создать задачу</button>' +
                    '</div>' +
                    '<div class="rkrs-wt-dialog__brand">Виджет от Ракурс</div>' +
                    '</div>';
                $body.trigger('modal:loaded').html(html).trigger('modal:centrify');
                $body.off(Constants.EVENT_NAMESPACE)
                    .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-cancel', function () {
                        if (callbacks.onCancel) { callbacks.onCancel(); }
                        instance.destroy();
                    })
                    .on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-create-task', function () {
                        self.openTaskCreator();
                        if (callbacks.onCreate) { callbacks.onCreate(); }
                        instance.destroy();
                    });
            }
        });
        this.activeModals.push(modal);
        return modal;
    };

    AmoUiAdapter.prototype.showEntitiesModal = function (entities, entityType) {
        if (!this.Modal || !entities.length) {
            return null;
        }
        var $ = this.$;
        if (this.entitiesModal && typeof this.entitiesModal.destroy === 'function') {
            try { this.entitiesModal.destroy(); } catch (error) {}
            this.entitiesModal = null;
        }
        var title = entityType === 'customers' ? 'У вас имеются следующие покупатели без задач:' : 'Сделки без задачи у ответственного:';
        var pageSize = 10;
        var modal = new this.Modal({
            class_name: 'rkrs-wt-list-modal',
            disable_overlay_click: false,
            init: function ($body) {
                var instance = this;
                var currentPage = 1;
                var pageCount = Math.max(1, Math.ceil(entities.length / pageSize));
                var $dialog = $('<div>').addClass('rkrs-wt-dialog rkrs-wt-dialog_list');
                var $title = $('<div>').addClass('rkrs-wt-list-title');
                $title.append($('<h2>').text(title));
                $title.append($('<span>').addClass('rkrs-wt-list-count').text(entities.length));
                $dialog.append($title);
                var $header = $('<div>').addClass('rkrs-wt-entities__header');
                $header.append($('<span>').text('Название'));
                $header.append($('<span>').text(entityType === 'customers' ? 'Статус' : 'Этап'));
                $header.append($('<span>').text('Бюджет'));
                $dialog.append($header);
                var $list = $('<div>').addClass('rkrs-wt-entities');
                $dialog.append($list);
                var $pagination = $('<div>').addClass('rkrs-wt-pagination');
                var $footer = $('<div>').addClass('rkrs-wt-list-footer');
                $footer.append($pagination);
                var $brand = $('<div>').addClass('rkrs-wt-list-brand').attr('aria-label', 'Ракурс');
                $brand.append('<svg viewBox="0 0 79 79" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    '<rect x="13" y="41" width="13" height="22" rx="3" fill="currentColor" opacity=".35"/>' +
                    '<rect x="33" y="31" width="13" height="32" rx="3" fill="currentColor" opacity=".65"/>' +
                    '<rect x="53" y="13" width="13" height="50" rx="3" fill="#5cc4bf"/>' +
                    '</svg>');
                $brand.append($('<span>').text('Ракурс'));
                $footer.append($brand);
                $dialog.append($footer);

                function renderPagination() {
                    $pagination.empty().toggle(pageCount > 1);
                    if (pageCount <= 1) { return; }
                    var pages = paginationPages(currentPage, pageCount);
                    $pagination.append($('<button type="button">').addClass('rkrs-wt-page js-rkrs-wt-page').attr('data-page', 1).attr('aria-label', 'Первая страница').attr('title', 'В начало').prop('disabled', currentPage === 1).text('«'));
                    $pagination.append($('<button type="button">').addClass('rkrs-wt-page js-rkrs-wt-page').attr('data-page', currentPage - 1).attr('aria-label', 'Предыдущая страница').prop('disabled', currentPage === 1).text('‹'));
                    if (pages[0] > 1) {
                        $pagination.append($('<span>').addClass('rkrs-wt-page-ellipsis').text('…'));
                    }
                    pages.forEach(function (page) {
                        $pagination.append($('<button type="button">')
                            .addClass('rkrs-wt-page js-rkrs-wt-page' + (page === currentPage ? ' is-active' : ''))
                            .attr('data-page', page)
                            .attr('aria-label', 'Страница ' + page)
                            .attr('aria-current', page === currentPage ? 'page' : null)
                            .text(page));
                    });
                    if (pages[pages.length - 1] < pageCount) {
                        $pagination.append($('<span>').addClass('rkrs-wt-page-ellipsis').text('…'));
                    }
                    $pagination.append($('<button type="button">').addClass('rkrs-wt-page js-rkrs-wt-page').attr('data-page', currentPage + 1).attr('aria-label', 'Следующая страница').prop('disabled', currentPage === pageCount).text('›'));
                    $pagination.append($('<button type="button">').addClass('rkrs-wt-page js-rkrs-wt-page').attr('data-page', pageCount).attr('aria-label', 'Последняя страница').attr('title', 'В конец').prop('disabled', currentPage === pageCount).text('»'));
                }

                function renderPage() {
                    $list.empty();
                    entityPage(entities, currentPage, pageSize).forEach(function (entity) {
                        var $row = $('<div>').addClass('rkrs-wt-entity');
                        var $link = $('<a>')
                            .addClass('rkrs-wt-entity__name')
                            .attr('href', '/' + entityType + '/detail/' + entity.id)
                            .text(entity.name || ('#' + entity.id));
                        $row.append($link);
                        $row.append($('<span>').addClass('rkrs-wt-entity__stage').text(entity.stage || entity.meta || '—'));
                        $row.append($('<span>').addClass('rkrs-wt-entity__budget').text(entity.budget || '0 ₽'));
                        $list.append($row);
                    });
                    renderPagination();
                }

                instance.updateEntities = function (updatedEntities) {
                    entities = updatedEntities;
                    if (!entities.length) {
                        instance.destroy();
                        return;
                    }
                    pageCount = Math.ceil(entities.length / pageSize);
                    currentPage = Math.min(currentPage, pageCount);
                    $title.find('.rkrs-wt-list-count').text(entities.length);
                    renderPage();
                };
                instance.entityType = entityType;

                $body.off(Constants.EVENT_NAMESPACE).on('click' + Constants.EVENT_NAMESPACE, '.js-rkrs-wt-page', function () {
                    var nextPage = Number($(this).attr('data-page'));
                    if (nextPage < 1 || nextPage > pageCount || nextPage === currentPage) { return; }
                    currentPage = nextPage;
                    renderPage();
                });
                renderPage();
                $body.trigger('modal:loaded').empty().append($dialog).css('width', '860px').trigger('modal:centrify');
            }
        });
        this.activeModals.push(modal);
        this.entitiesModal = modal;
        var self = this;
        var destroy = modal.destroy;
        modal.destroy = function () {
            this.updateEntities = null;
            if (self.entitiesModal === this) { self.entitiesModal = null; }
            self.activeModals = self.activeModals.filter(function (item) { return item !== modal; });
            return destroy.apply(this, arguments);
        };
        return modal;
    };

    AmoUiAdapter.prototype.destroy = function () {
        this.activeModals.forEach(function (modal) {
            try { if (modal && typeof modal.destroy === 'function') { modal.destroy(); } } catch (error) {}
        });
        this.activeModals = [];
        this.entitiesModal = null;
    };

    function CardGuard(options) {
        this.$ = options.$;
        this.resolver = options.resolver;
        this.engine = options.engine;
        this.taskChecker = options.taskChecker;
        this.ui = options.ui;
        this.isActive = options.isActive || function () { return true; };
        this.pendingNavigation = null;
        this.bypassOnce = false;
        this.checking = false;
        this.blockModal = null;
        this.bound = false;
        this.clickHandler = this._onClick.bind(this);
        this.beforeUnloadHandler = this._onBeforeUnload.bind(this);
        this.beforeUnloadBound = false;
        this.lifecycle = 0;
        this.destroyed = false;
        this.navigationSelector = [
            '.js-back-button',
            '#left_menu a',
            '.nav__menu-wrapper a',
            '.nav__top a',
            '.nav__notifications a',
            'a[href]',
            '[data-href]'
        ].join(',');
    }

    function isPageNavigationTarget(target) {
        if (!target || !target.getAttribute) {
            return Boolean(target);
        }
        if (String(target.getAttribute('target') || '').toLowerCase() === '_blank' || target.hasAttribute('download')) {
            return false;
        }
        var href = String(target.getAttribute('href') || target.getAttribute('data-href') || '').trim();
        if (!href) {
            return !target.matches || target.matches('.js-back-button');
        }
        if (/^(?:#|javascript:|mailto:|tel:)/i.test(href)) {
            return false;
        }
        if (typeof location !== 'undefined' && typeof URL !== 'undefined') {
            try {
                var destination = new URL(href, location.href);
                var current = new URL(location.href);
                if (destination.origin === current.origin &&
                    destination.pathname === current.pathname &&
                    destination.search === current.search) {
                    return false;
                }
            } catch (error) {}
        }
        return true;
    }

    CardGuard.prototype.bind = function () {
        if (this.bound || typeof document === 'undefined') {
            return;
        }
        this.destroyed = false;
        document.addEventListener('click', this.clickHandler, true);
        this.bound = true;
        if (this.isActive()) { this.primeCurrent(); }
    };

    CardGuard.prototype._setUnloadBlocked = function (blocked) {
        blocked = Boolean(blocked);
        if (typeof window === 'undefined') {
            this.beforeUnloadBound = blocked;
            return;
        }
        if (blocked && !this.beforeUnloadBound) {
            window.addEventListener('beforeunload', this.beforeUnloadHandler);
            this.beforeUnloadBound = true;
        } else if (!blocked && this.beforeUnloadBound) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
            this.beforeUnloadBound = false;
        }
    };

    CardGuard.prototype._onBeforeUnload = function (event) {
        if (this.destroyed || !this.isActive() || this.bypassOnce) { return undefined; }
        var context = this.resolver.resolve();
        if (!context || !context.entityId || !this.engine.match(context).denyExit) {
            this._setUnloadBlocked(false);
            return undefined;
        }
        var cached = this.taskChecker.peek(context);
        if (!cached || cached.state !== Constants.TASK_STATE.NO_TASK) {
            this._setUnloadBlocked(false);
            return undefined;
        }
        event.preventDefault();
        event.returnValue = true;
        return true;
    };

    CardGuard.prototype.primeCurrent = async function () {
        if (this.destroyed || !this.isActive()) {
            this._setUnloadBlocked(false);
            return null;
        }
        var context = this.resolver.resolve();
        if (!context || !context.entityId || !this.engine.match(context).denyExit) {
            this._setUnloadBlocked(false);
            return null;
        }
        var key = this.taskChecker.key(context);
        var lifecycle = this.lifecycle;
        var result = await this.taskChecker.check(context, { force: true, forceApi: true });
        if (this.destroyed || lifecycle !== this.lifecycle || !this.isActive()) { return result; }
        var current = this.resolver.resolve();
        if (!current || this.taskChecker.key(current) !== key || !this.engine.match(current).denyExit) {
            return result;
        }
        this._setUnloadBlocked(result.state === Constants.TASK_STATE.NO_TASK);
        return result;
    };

    CardGuard.prototype.unbind = function () {
        this.destroyed = true;
        this.lifecycle += 1;
        if (this.bound && typeof document !== 'undefined') {
            document.removeEventListener('click', this.clickHandler, true);
        }
        this.bound = false;
        this.pendingNavigation = null;
        this.checking = false;
        this._setUnloadBlocked(false);
        if (this.blockModal && typeof this.blockModal.destroy === 'function') {
            try { this.blockModal.destroy(); } catch (error) {}
        }
        this.blockModal = null;
    };

    CardGuard.prototype._navigationTarget = function (event) {
        var target = event.target && event.target.closest ? event.target.closest(this.navigationSelector) : null;
        if (!target || target.closest('.rkrs-wt-block-modal, .rkrs-wt-list-modal')) {
            return null;
        }
        return isPageNavigationTarget(target) ? target : null;
    };

    CardGuard.prototype._onClick = function (event) {
        if (this.destroyed || !this.isActive() || this.bypassOnce || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        var target = this._navigationTarget(event);
        if (!target) {
            return;
        }
        var context = this.resolver.resolve();
        if (!context || !context.entityId || !this.engine.match(context).denyExit) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
        this.pendingNavigation = {
            target: target,
            href: target.getAttribute && (target.getAttribute('href') || target.getAttribute('data-href'))
        };
        if (this.checking || this.blockModal) {
            return;
        }
        this._checkAndContinue(context);
    };

    CardGuard.prototype._checkAndContinue = async function (context) {
        this.checking = true;
        var lifecycle = this.lifecycle;
        var result = await this.taskChecker.check(context, { force: true, forceApi: true });
        if (this.destroyed || lifecycle !== this.lifecycle) { return; }
        this.checking = false;
        if (!this.isActive()) { this.pendingNavigation = null; this._setUnloadBlocked(false); return; }
        var current = this.resolver.resolve();
        if (!current) { this.pendingNavigation = null; this._setUnloadBlocked(false); return; }
        if (!this.engine.match(current).denyExit) { this.replayPending(); return; }
        if (this.taskChecker.key(current) !== this.taskChecker.key(context)) {
            return this._checkAndContinue(current);
        }
        if (result.state === Constants.TASK_STATE.HAS_TASK) {
            this._setUnloadBlocked(false);
            this.replayPending();
            return;
        }
        if (result.state === Constants.TASK_STATE.UNKNOWN) {
            this._setUnloadBlocked(false);
            this.ui.notify('Не удалось проверить наличие задачи. Выход разрешён; попробуйте проверить карточку ещё раз.');
            this.replayPending();
            return;
        }
        this._setUnloadBlocked(true);
        var self = this;
        this.blockModal = this.ui.showBlockModal({
            onCancel: function () {
                self.pendingNavigation = null;
                self.blockModal = null;
            },
            onCreate: function () {
                self.blockModal = null;
            }
        });
    };

    CardGuard.prototype.recheckPending = async function () {
        if (this.destroyed || !this.isActive() || !this.pendingNavigation) {
            return;
        }
        var context = this.resolver.resolve();
        if (!context) {
            return;
        }
        var lifecycle = this.lifecycle;
        var result = await this.taskChecker.check(context, { force: true, forceApi: true });
        if (this.destroyed || lifecycle !== this.lifecycle || !this.isActive()) { return; }
        var current = this.resolver.resolve();
        if (!current || this.taskChecker.key(current) !== this.taskChecker.key(context)) { return; }
        this._setUnloadBlocked(result.state === Constants.TASK_STATE.NO_TASK);
        if (result.state === Constants.TASK_STATE.HAS_TASK || result.state === Constants.TASK_STATE.UNKNOWN) {
            if (result.state === Constants.TASK_STATE.UNKNOWN) {
                this.ui.notify('Не удалось повторно проверить задачу. Выход разрешён.');
            }
            this.replayPending();
        }
    };

    CardGuard.prototype.replayPending = function () {
        var pending = this.pendingNavigation;
        this.pendingNavigation = null;
        if (this.blockModal && typeof this.blockModal.destroy === 'function') {
            try { this.blockModal.destroy(); } catch (error) {}
        }
        this.blockModal = null;
        if (this.destroyed || !this.isActive() || !pending) {
            return;
        }
        this.bypassOnce = true;
        this._setUnloadBlocked(false);
        try {
            if (pending.href && !/^javascript:/i.test(pending.href) && typeof window !== 'undefined') {
                window.location.assign(pending.href);
            } else if (pending.target && typeof pending.target.click === 'function') {
                pending.target.click();
            }
        } finally {
            var self = this;
            setTimeout(function () { self.bypassOnce = false; }, 0);
        }
    };

    function ListModalService(options) {
        this.api = options.api;
        this.engine = options.engine;
        this.ui = options.ui;
        this.accountId = Number(options.accountId) || 0;
        this.userId = Number(options.userId) || 0;
        this.snapshotHash = options.snapshotHash || 'none';
        this.storage = options.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
        this.lastChecks = {};
        this.pendingChecks = new Set();
        this.emptyRetryMs = Number(options.emptyRetryMs) || 30000;
        this.taskBatchSize = Number(options.taskBatchSize) || 50;
        var activeTab = options.isActive || function () {
            return typeof document === 'undefined' || document.visibilityState !== 'hidden';
        };
        this.destroyed = false;
        var self = this;
        this.isActive = function () { return !self.destroyed && activeTab(); };
        this.generation = 0;
    }

    ListModalService.prototype.resetThrottle = function () {
        this.lastChecks = {};
        this.generation += 1;
    };

    ListModalService.prototype.destroy = function () {
        this.destroyed = true;
        this.resetThrottle();
    };

    ListModalService.prototype._sessionKey = function (entityType) {
        return ['rkrs_wt_modal_v3', this.accountId, this.userId, this.snapshotHash, entityType].join(':');
    };

    ListModalService.prototype._statusQuery = function (rules) {
        var pairs = [];
        var seen = {};
        rules.forEach(function (rule) {
            rule.pipelines.forEach(function (pipeline) {
                pipeline.status_ids.forEach(function (statusId) {
                    var key = pipeline.pipeline_id + ':' + statusId;
                    if (!seen[key]) {
                        seen[key] = true;
                        pairs.push({ pipeline_id: pipeline.pipeline_id, status_id: statusId });
                    }
                });
            });
        });
        return pairs;
    };

    ListModalService.prototype._leadsWithoutTasks = async function (rules) {
        var statuses = this._statusQuery(rules);
        if (!statuses.length) { return []; }
        var response = await this._fetchLeadCandidates({ statuses: statuses, responsibleOnly: true });
        if (!this.isActive()) { return []; }
        return this._filterTaskless('leads', this._uniqueEntities(response));
    };

    ListModalService.prototype._fetchLeadCandidates = async function (group) {
        var query = ['limit=250'];
        group.statuses.forEach(function (status, index) {
            query.push('filter%5Bstatuses%5D%5B' + index + '%5D%5Bpipeline_id%5D=' + status.pipeline_id);
            query.push('filter%5Bstatuses%5D%5B' + index + '%5D%5Bstatus_id%5D=' + status.status_id);
        });
        if (group.responsibleOnly) {
            query.push('filter%5Bresponsible_user_id%5D=' + this.userId);
        }
        var queryString = query.join('&');
        var entities = [];
        for (var page = 1; page <= 100; page += 1) {
            if (!this.isActive()) { return []; }
            var path = '/api/v4/leads?' + queryString + '&page=' + page;
            var response = await this.api.get(path, null, 'LEAD_CANDIDATES:' + path);
            var candidates = response && response._embedded && response._embedded.leads;
            if (response && !Array.isArray(candidates)) { throw new Error('Некорректный список сделок'); }
            candidates = candidates || [];
            entities = entities.concat(candidates.filter(function (entity) {
                return Number(entity.responsible_user_id) === this.userId;
            }, this));
            if (!response || !response._links || !response._links.next) { return entities; }
        }
        throw new Error('Превышен лимит страниц сделок; список не полностью проверен');
    };

    ListModalService.prototype._uniqueEntities = function (entities) {
        var seen = {};
        return entities.filter(function (entity) {
            var id = Number(entity && entity.id);
            if (!id || seen[id]) { return false; }
            seen[id] = true;
            return true;
        });
    };

    ListModalService.prototype._filterTaskless = async function (entityType, entities) {
        if (!entities.length) {
            return [];
        }
        var ids = entities.map(function (entity) { return Number(entity.id); });
        var tasks = [];
        for (var offset = 0; offset < ids.length; offset += this.taskBatchSize) {
            if (!this.isActive()) { return []; }
            var batchTasks = await this.api.getAllPages('/api/v4/tasks', 'tasks', {
                limit: 250,
                maxPages: 10,
                requireComplete: true,
                query: {
                    'filter[entity_type]': entityType,
                    'filter[entity_id]': ids.slice(offset, offset + this.taskBatchSize),
                    'filter[is_completed]': 0,
                    'filter[responsible_user_id]': this.userId
                }
            });
            tasks = tasks.concat(batchTasks);
        }
        var byId = entities.reduce(function (result, entity) {
            result[Number(entity.id)] = entity;
            return result;
        }, {});
        var withTask = tasks.reduce(function (result, task) {
            var entity = byId[Number(task.entity_id)];
            var responsible = entityType === 'leads' ? entity && entity.responsible_user_id : this.userId;
            if (entity && TaskAssignment.matchesResponsible(task, { entityType: entityType, entityId: entity.id, responsibleUserId: responsible })) {
                result[Number(task.entity_id)] = true;
            }
            return result;
        }.bind(this), {});
        return entities.filter(function (entity) { return !withTask[Number(entity.id)]; });
    };

    ListModalService.prototype._leadStageNames = async function () {
        if (!this.isActive()) { return {}; }
        var response = await this.api.get('/api/v4/leads/pipelines', { limit: 250 }, 'LEAD_PIPELINE_NAMES');
        var pipelines = response && response._embedded && response._embedded.pipelines || [];
        return pipelines.reduce(function (result, pipeline) {
            var pipelineName = pipeline.name || ('Воронка #' + pipeline.id);
            var statuses = pipeline._embedded && pipeline._embedded.statuses || [];
            statuses.forEach(function (status) {
                result[Number(pipeline.id) + ':' + Number(status.id)] = pipelineName + '  ›  ' + (status.name || ('Этап #' + status.id));
            });
            return result;
        }, {});
    };

    ListModalService.prototype._customerStatusQuery = function (rules) {
        var allStatuses = rules.some(function (rule) { return !rule.customerStatuses.length; });
        var seen = {};
        var statuses = [];
        rules.forEach(function (rule) {
            rule.customerStatuses.forEach(function (statusId) {
                statusId = Number(statusId);
                if (statusId && !seen[statusId]) {
                    seen[statusId] = true;
                    statuses.push(statusId);
                }
            });
        });
        return { all: allStatuses, statuses: statuses };
    };

    ListModalService.prototype._fetchCustomerCandidates = async function (group) {
        var query = { limit: 250 };
        if (!group.all) { query['filter[status_id]'] = group.statuses; }
        if (group.responsibleOnly) { query['filter[responsible_user_id]'] = this.userId; }
        var key = 'CUSTOMER_CANDIDATES:' + JSON.stringify(query);
        var response = await this.api.get('/api/v4/customers', query, key);
        if (this.isActive() && response && response._links && response._links.next) {
            if (!this.customerLimitNotified) {
                this.customerLimitNotified = true;
                this.ui.notify('Список покупателей ограничен первыми 250 карточками для каждого набора условий. Запрет выхода проверяется отдельно в карточке, если он включён.');
            }
        }
        if (response && (!response._embedded || !Array.isArray(response._embedded.customers))) { throw new Error('Некорректный список покупателей'); }
        return response && response._embedded && response._embedded.customers || [];
    };

    ListModalService.prototype._customersWithoutTasks = async function (rules) {
        var unrestricted = this._customerStatusQuery(rules.filter(function (rule) { return !rule.checkResponsible; }));
        var responsible = this._customerStatusQuery(rules.filter(function (rule) { return rule.checkResponsible; }));
        var unrestrictedKeys = unrestricted.statuses.reduce(function (result, statusId) {
            result[statusId] = true;
            return result;
        }, {});
        if (!responsible.all) {
            responsible.statuses = responsible.statuses.filter(function (statusId) { return !unrestrictedKeys[statusId]; });
        }
        var groups = [];
        if (unrestricted.all || unrestricted.statuses.length) {
            groups.push({ all: unrestricted.all, statuses: unrestricted.statuses, responsibleOnly: false });
        }
        if (!unrestricted.all && (responsible.all || responsible.statuses.length)) {
            groups.push({ all: responsible.all, statuses: responsible.statuses, responsibleOnly: true });
        }
        var responses = await Promise.all(groups.map(this._fetchCustomerCandidates.bind(this)));
        if (!this.isActive()) { return []; }
        return this._filterTaskless('customers', this._uniqueEntities([].concat.apply([], responses)));
    };

    ListModalService.prototype.run = async function (area) {
        if (!this.isActive()) { return []; }
        var entityType = area === 'llist' || area === 'todo' ? 'leads' : area === 'culist' ? 'customers' : '';
        if (!entityType) {
            return [];
        }
        var rules = this.engine.myRules().filter(function (rule) {
            return rule.showModal && (entityType === 'leads' || rule.customers);
        });
        if (!rules.length) {
            return [];
        }
        var key = this._sessionKey(entityType);
        if (this.pendingChecks.has(key) || this.lastChecks[key] && Date.now() - this.lastChecks[key] < this.emptyRetryMs) {
            return [];
        }
        this.lastChecks[key] = Date.now();
        this.pendingChecks.add(key);
        var generation = this.generation;
        try {
            var entities = entityType === 'leads' ? await this._leadsWithoutTasks(rules) : await this._customersWithoutTasks(rules);
            if (!this.isActive() || generation !== this.generation) { return []; }
            var self = this;
            entities = entities.filter(function (entity) {
                var context = {
                    entityType: entityType,
                    entityId: Number(entity.id),
                    pipelineId: Number(entity.pipeline_id),
                    statusId: Number(entity.status_id),
                    responsibleUserId: Number(entity.responsible_user_id),
                    currentUserId: self.userId
                };
                return self.engine.match(context).showModal;
            });
            var stageNames = entityType === 'leads' && entities.length ? await this._leadStageNames() : {};
            if (!this.isActive() || generation !== this.generation) { return []; }
            entities = entities.map(function (entity) {
                var amount = Number(entity.price) || 0;
                return {
                    id: Number(entity.id),
                    name: entity.name,
                    stage: entityType === 'leads' ? (stageNames[Number(entity.pipeline_id) + ':' + Number(entity.status_id)] || ('Воронка #' + entity.pipeline_id + '  ›  этап #' + entity.status_id)) : ('Статус #' + entity.status_id),
                    budget: amount.toLocaleString('ru-RU') + ' ₽'
                };
            });
            if (this.ui.entitiesModal && this.ui.entitiesModal.entityType === entityType &&
                typeof this.ui.entitiesModal.updateEntities === 'function') {
                this.ui.entitiesModal.updateEntities(entities);
            } else if (entities.length) {
                this.ui.showEntitiesModal(entities, entityType);
            }
            return entities;
        } catch (error) {
            if (!this.isActive() || generation !== this.generation) { return []; }
            this.ui.notify('Не удалось сформировать список карточек без задач.');
            return [];
        } finally {
            this.pendingChecks.delete(key);
        }
    };

    function RuntimeController(options) {
        this.widget = options.widget;
        this.runtimeConfig = options.runtimeConfig;
        this.$ = options.$;
        this.Modal = options.Modal;
        this.api = options.api;
        this.accountId = Number(options.accountId) || 0;
        this.started = false;
        this.bound = false;
        this.observer = null;
        this.observerRoot = null;
        this.taskContainerObserver = null;
        this.taskContainerRoot = null;
        this.observerTimer = null;
        this.observerRetryTimer = null;
        this.observerRetryCount = 0;
        this.engine = null;
        this.resolver = null;
        this.taskChecker = null;
        this.guard = null;
        this.ui = null;
        this.listModal = null;
        this.areaEventsBound = false;
        this.areaChangeTimer = null;
        this.areaChangeHandler = this._onAreaChange.bind(this);
        this.visibilityHandler = this._onVisibilityChange.bind(this);
        this.assignment = null;
        this.refreshTimer = null;
        this.cardKey = '';
        this.lastTaskRefresh = 0;
    }

    RuntimeController.prototype._isActiveTab = function () {
        return typeof document === 'undefined' || document.visibilityState !== 'hidden';
    };

    RuntimeController.prototype.init = function () {
        if (this.started) {
            this._runAreaServices();
            return true;
        }
        var settings = {};
        try { settings = this.widget.get_settings() || {}; } catch (error) {}
        var parsed = Snapshot.parseRuntimeConfig(this.runtimeConfig === undefined ? settings.runtime_config : this.runtimeConfig);
        var user = readConstant('user') || {};
        var userId = safeNumber(user.id);
        this.started = true;
        if (!parsed.config || parsed.fatal || !userId) {
            return true;
        }
        this.engine = new Rules.RuleEngine(parsed.rules, userId);
        if (!this.engine.myRules().length) {
            return true;
        }
        this.resolver = new CardContextResolver(this.widget, this.$);
        this.taskChecker = new TaskChecker(this.api, this.$);
        this.ui = new AmoUiAdapter(this.widget, this.$, this.Modal);
        this.guard = new CardGuard({
            $: this.$,
            resolver: this.resolver,
            engine: this.engine,
            taskChecker: this.taskChecker,
            ui: this.ui,
            isActive: this._isActiveTab.bind(this)
        });
        this.listModal = new ListModalService({
            api: this.api,
            engine: this.engine,
            ui: this.ui,
            accountId: this.accountId,
            userId: userId,
            snapshotHash: parsed.config.published && parsed.config.published.hash,
            isActive: this._isActiveTab.bind(this)
        });
        this.assignment = new TaskAssignment.TaskAssignmentController({
            $: this.$, Modal: this.Modal, api: this.api, accountId: this.accountId, resolver: this.resolver,
            engine: this.engine, taskChecker: this.taskChecker, ui: this.ui,
            isActive: this._isActiveTab.bind(this), onChanged: this._onTaskChanged.bind(this)
        });
        this._runAreaServices();
        return true;
    };

    RuntimeController.prototype._runAreaServices = function () {
        if (this._isActiveTab() && this.listModal && this.resolver) {
            this.listModal.run(this.resolver.area());
        }
    };

    RuntimeController.prototype._onVisibilityChange = function () {
        if (!this._isActiveTab()) { return; }
        if (this.listModal) { this.listModal.resetThrottle(); }
        this._runAreaServices();
        if (this.guard) { this.guard.primeCurrent(); }
    };

    RuntimeController.prototype._onAreaChange = function () {
        var self = this;
        clearTimeout(this.areaChangeTimer);
        this.areaChangeTimer = setTimeout(function () {
            if (self.listModal) { self.listModal.resetThrottle(); }
            if (self.taskChecker) { self.taskChecker.clear(); }
            self._runAreaServices();
            self._syncTaskObserver();
            if (self.guard) { self.guard.primeCurrent(); }
        }, 0);
    };

    RuntimeController.prototype._syncTaskObserver = function () {
        var area = this.resolver ? this.resolver.area() : '';
        if (area === 'lcard' || area === 'cucard') {
            this._bindTaskObserver();
            return;
        }
        if (this.observer) { this.observer.disconnect(); }
        if (this.taskContainerObserver) { this.taskContainerObserver.disconnect(); }
        clearTimeout(this.observerTimer);
        clearTimeout(this.observerRetryTimer);
        this.observer = null;
        this.observerRoot = null;
        this.taskContainerObserver = null;
        this.taskContainerRoot = null;
        this.observerRetryTimer = null;
        this.observerRetryCount = 0;
    };

    RuntimeController.prototype.bind = function () {
        this.init();
        if (!this.guard) {
            return true;
        }
        if (!this.bound) {
            this.guard.bind();
            this.bound = true;
        }
        if (!this.areaEventsBound && typeof document !== 'undefined') {
            this.$(document)
                .off('page:changed' + Constants.EVENT_NAMESPACE, this.areaChangeHandler)
                .on('page:changed' + Constants.EVENT_NAMESPACE, this.areaChangeHandler)
                .off('visibilitychange' + Constants.EVENT_NAMESPACE, this.visibilityHandler)
                .on('visibilitychange' + Constants.EVENT_NAMESPACE, this.visibilityHandler);
            if (typeof window !== 'undefined') {
                this.$(window)
                    .off('popstate' + Constants.EVENT_NAMESPACE, this.areaChangeHandler)
                    .on('popstate' + Constants.EVENT_NAMESPACE, this.areaChangeHandler);
            }
            this.areaEventsBound = true;
        }
        this._syncTaskObserver();
        if (this.assignment) { this.assignment.bind(); }
        if (!this.refreshTimer) {
            var self = this;
            this.refreshTimer = setInterval(function () {
                if (!self._isActiveTab()) { return; }
                var context = self.resolver && self.resolver.resolve();
                var key = context ? self.taskChecker.key(context) : '';
                if (key !== self.cardKey) {
                    self.cardKey = key;
                    if (self.taskChecker) { self.taskChecker.clear(); }
                    if (self.guard) { self.guard.primeCurrent(); }
                    self.lastTaskRefresh = Date.now();
                } else if (context && Date.now() - self.lastTaskRefresh >= 30000) {
                    self.lastTaskRefresh = Date.now();
                    self.guard.primeCurrent();
                }
                // Keep reminding on the list even after the manager closes
                // the modal. run() gates areas, rules, visibility and polling.
                if (self.listModal && self.resolver) {
                    self.listModal.run(self.resolver.area());
                }
            }, 1000);
        }
        return true;
    };

    RuntimeController.prototype._onTaskChanged = function (context) {
        this.lastTaskRefresh = Date.now();
        if (this.taskChecker) { this.taskChecker.invalidate(context); }
        if (this.listModal) { this.listModal.resetThrottle(); }
        if (this.guard) {
            this.guard.recheckPending();
            this.guard.primeCurrent();
        }
        if (this.ui && this.ui.entitiesModal) { this._runAreaServices(); }
    };

    RuntimeController.prototype._scheduleTaskRecheck = function () {
        var self = this;
        clearTimeout(this.observerTimer);
        this.observerTimer = setTimeout(function () {
            var context = self.resolver && self.resolver.resolve();
            if (context) { self._onTaskChanged(context); }
        }, 150);
    };

    function isTaskMutation(mutation) {
        var selector = '.card-task, .card-task-wrapper, .notes-wrapper__tasks';
        function related(node) {
            if (!node || node.nodeType !== 1) { return false; }
            if (node.closest && node.closest('.feed-compose_task')) { return false; }
            return Boolean(node.matches && node.matches(selector) || node.closest && node.closest(selector));
        }
        if (related(mutation.target)) { return true; }
        return Array.prototype.some.call(mutation.addedNodes || [], function (node) {
            return related(node) || node.nodeType === 1 && node.querySelector && node.querySelector(selector);
        }) || Array.prototype.some.call(mutation.removedNodes || [], function (node) {
            return related(node) || node.nodeType === 1 && node.querySelector && node.querySelector(selector);
        });
    }

    RuntimeController.prototype._bindTaskObserver = function () {
        if (typeof MutationObserver === 'undefined') {
            return;
        }
        var self = this;
        var container = this.$('.notes-wrapper').first()[0];
        if (container && (!this.taskContainerObserver || this.taskContainerRoot !== container)) {
            if (this.taskContainerObserver) {
                this.taskContainerObserver.disconnect();
            }
            this.taskContainerRoot = container;
            this.taskContainerObserver = new MutationObserver(function (mutations) {
                var currentRoot = self.$('.notes-wrapper__tasks').first()[0];
                if (currentRoot !== self.observerRoot) {
                    self._bindTaskObserver();
                    self._scheduleTaskRecheck();
                } else if (mutations.some(isTaskMutation)) {
                    self._scheduleTaskRecheck();
                }
            });
            this.taskContainerObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }
        var root = this.$('.notes-wrapper__tasks').first()[0];
        if (!root) {
            if (!this.observerRetryTimer && this.observerRetryCount < 3) {
                var delays = [250, 750, 1500];
                this.observerRetryTimer = setTimeout(function () {
                    self.observerRetryTimer = null;
                    self.observerRetryCount += 1;
                    self._bindTaskObserver();
                }, delays[this.observerRetryCount]);
            }
            return;
        }
        if (this.observer && this.observerRoot === root && root.isConnected !== false) {
            return;
        }
        if (this.observer) {
            this.observer.disconnect();
        }
        clearTimeout(this.observerRetryTimer);
        this.observerRetryTimer = null;
        this.observerRetryCount = 0;
        this.observerRoot = root;
        this.observer = new MutationObserver(function () {
            if (self.observerRoot && self.observerRoot.isConnected === false) {
                self.observer.disconnect();
                self.observer = null;
                self.observerRoot = null;
                self._bindTaskObserver();
                return;
            }
            self._scheduleTaskRecheck();
        });
        this.observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    };

    RuntimeController.prototype.destroy = function () {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
        if (this.assignment) { this.assignment.destroy(); }
        if (this.listModal) { this.listModal.destroy(); }
        if (this.guard) { this.guard.unbind(); }
        if (this.observer) { this.observer.disconnect(); }
        if (this.taskContainerObserver) { this.taskContainerObserver.disconnect(); }
        clearTimeout(this.observerTimer);
        clearTimeout(this.observerRetryTimer);
        if (this.taskChecker) { this.taskChecker.destroy(); }
        if (this.ui) { this.ui.destroy(); }
        if (this.areaEventsBound && typeof document !== 'undefined') {
            this.$(document)
                .off('page:changed' + Constants.EVENT_NAMESPACE, this.areaChangeHandler)
                .off('visibilitychange' + Constants.EVENT_NAMESPACE, this.visibilityHandler);
            if (typeof window !== 'undefined') {
                this.$(window).off('popstate' + Constants.EVENT_NAMESPACE, this.areaChangeHandler);
            }
        }
        clearTimeout(this.areaChangeTimer);
        if (this.api) { this.api.destroy(); }
        this.observer = null;
        this.observerRoot = null;
        this.taskContainerObserver = null;
        this.taskContainerRoot = null;
        this.observerRetryTimer = null;
        this.observerRetryCount = 0;
        this.started = false;
        this.bound = false;
        this.areaEventsBound = false;
        this.areaChangeTimer = null;
        return true;
    };

    return {
        CardContextResolver: CardContextResolver,
        TaskChecker: TaskChecker,
        AmoUiAdapter: AmoUiAdapter,
        CardGuard: CardGuard,
        ListModalService: ListModalService,
        RuntimeController: RuntimeController,
        safeNumber: safeNumber,
        entityPage: entityPage,
        paginationPages: paginationPages,
        normalizeArea: normalizeArea,
        isPageNavigationTarget: isPageNavigationTarget,
        isTaskMutation: isTaskMutation
    };
}));
