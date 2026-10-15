(function (root, factory) {
    if (typeof define === 'function') {
        define([], function () { return factory; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./constants'));
    } else {
        root.RkrsWtTaskAssignment = factory(root.RkrsWtConstants);
    }
}(typeof self !== 'undefined' ? self : this, function (Constants) {
    'use strict';

    function matchesResponsible(task, context) {
        return Boolean(task && context && Number(context.responsibleUserId) > 0 &&
            Number(task.entity_id) === Number(context.entityId) &&
            task.entity_type === context.entityType &&
            Number(task.responsible_user_id) === Number(context.responsibleUserId) &&
            (task.is_completed === false || task.is_completed === 0));
    }

    function taskPayload(context, draft) {
        var text = String(draft.text || '').trim();
        var deadline = Number(draft.completeTill);
        var taskType = Number(draft.taskTypeId);
        if (!text || !Number.isFinite(deadline) || deadline <= 0 || !Number.isInteger(taskType) || taskType <= 0) {
            throw new Error('Укажите текст, срок и существующий тип задачи.');
        }
        if (!Number(context.responsibleUserId) || !Number(context.entityId) || context.entityType !== 'leads') {
            throw new Error('Не удалось определить ответственного за сделку.');
        }
        return {
            entity_id: Number(context.entityId),
            entity_type: 'leads',
            responsible_user_id: Number(context.responsibleUserId),
            text: text,
            task_type_id: taskType,
            complete_till: Math.floor(deadline),
            duration: Math.max(0, Number(draft.duration) || 0)
        };
    }

    function OwnerTaskService(api, checker) {
        this.api = api;
        this.checker = checker;
        this.pending = new Map();
    }

    OwnerTaskService.prototype.create = function (context, draft) {
        var key = context.entityType + ':' + context.entityId;
        if (this.pending.has(key)) { return this.pending.get(key); }
        var self = this;
        var operation = (async function () {
            var payload = taskPayload(context, draft);
            var lead = await self.api.get('/api/v4/leads/' + payload.entity_id);
            if (!lead || Number(lead.responsible_user_id) !== payload.responsible_user_id) {
                throw new Error('Ответственный за сделку изменился. Откройте создание задачи заново.');
            }
            self.checker.invalidate(context);
            var state = await self.checker.check(context, { force: true, forceApi: true });
            if (state.state === Constants.TASK_STATE.HAS_TASK) { return { alreadyExists: true }; }
            if (state.state !== Constants.TASK_STATE.NO_TASK) {
                throw new Error('Не удалось проверить задачи ответственного. Попробуйте позже.');
            }
            // POST is never retried automatically: an ambiguous response may already have created the task.
            var response = await self.api.post('/api/v4/tasks', [payload], { retry: false });
            self.checker.invalidate(context);
            var created = response && response._embedded && response._embedded.tasks || [];
            if (!created.some(function (task) { return matchesResponsible(task, context); })) {
                var confirmed = await self.checker.check(context, { force: true, forceApi: true });
                if (confirmed.state !== Constants.TASK_STATE.HAS_TASK) {
                    throw new Error('Сервер не подтвердил задачу. Проверьте ленту сделки перед повторным созданием.');
                }
            }
            return { alreadyExists: false };
        }());
        this.pending.set(key, operation);
        return operation.finally(function () { self.pending.delete(key); });
    };

    function formDraft($form) {
        var date = String($form.find('[name="date"]').val() || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        var time = String($form.find('[name="time"]').val() || '').match(/^(\d{2}):(\d{2})$/);
        var deadline = date && time ? new Date(Number(date[3]), Number(date[2]) - 1, Number(date[1]), Number(time[1]), Number(time[2])) : null;
        var valid = deadline && deadline.getFullYear() === Number(date[3]) && deadline.getMonth() === Number(date[2]) - 1 &&
            deadline.getDate() === Number(date[1]) && Number(time[1]) < 24 && Number(time[2]) < 60;
        return {
            text: $form.find('[name="body"]').val() || $form.find('.js-task-text-textarea').text(),
            completeTill: valid ? Math.floor(deadline.getTime() / 1000) : 0,
            taskTypeId: Number($form.find('[name="type"]:checked').val()),
            duration: Number($form.find('[name="duration"]').val()) || 0
        };
    }

    function TaskAssignmentController(options) {
        this.$ = options.$;
        this.Modal = options.Modal;
        this.resolver = options.resolver;
        this.engine = options.engine;
        this.checker = options.taskChecker;
        this.ui = options.ui;
        this.onChanged = options.onChanged || function () {};
        this.isActive = options.isActive || function () { return true; };
        this.service = new OwnerTaskService(options.api, this.checker);
        this.form = null;
        this.formKey = '';
        this.noticeKey = '';
        this.timer = null;
        this.modal = null;
        this.destroyed = false;
        this.clickHandler = this._onClick.bind(this);
    }

    TaskAssignmentController.prototype.context = function () {
        var context = this.resolver.resolve();
        if (!context || context.entityType !== 'leads' || !context.responsibleUserId) { return null; }
        var match = this.engine.match(context);
        return match.showModal || match.denyExit ? context : null;
    };

    TaskAssignmentController.prototype._userName = function (id) {
        try {
            var app = typeof window !== 'undefined' && (window.APP || window.AMOCRM);
            var users = app && app.constant('managers') || {};
            var user = users[id];
            return user && (user.title || user.name || user.full_name) || ('Сотрудник #' + id);
        } catch (error) { return 'Сотрудник #' + id; }
    };

    TaskAssignmentController.prototype.sync = function () {
        if (!this.isActive() || this.destroyed) { return; }
        var context = this.context();
        var $form = this.$('.feed-compose_task').first();
        if (!context || !$form.length || !$form.find('.js-task-main_user').length) {
            this.$('.rkrs-wt-task-warning').remove();
            this.form = null;
            this.formKey = '';
            return;
        }
        var key = context.entityId + ':' + context.responsibleUserId;
        var $input = $form.find('.js-task-main_user');
        if (this.form !== $form[0] || this.formKey !== key) {
            this.form = $form[0];
            this.formKey = key;
            this.noticeKey = '';
            $input.val(context.responsibleUserId).trigger('change');
            $form.find('.js-feed-users .js-multisuggest-item')
                .attr('data-id', context.responsibleUserId)
                .attr('data-title', this._userName(context.responsibleUserId))
                .attr('title', this._userName(context.responsibleUserId))
                .text(this._userName(context.responsibleUserId));
        }
        var mismatch = Number($input.val()) !== Number(context.responsibleUserId);
        var $warning = $form.find('.rkrs-wt-task-warning');
        if (mismatch && !$warning.length) {
            $warning = this.$('<div>').addClass('rkrs-wt-task-warning').attr('role', 'status');
            $warning.append(this.$('<span>').text('Задача назначена другому сотруднику. Она не закроет условие для ответственного за сделку.'));
            $warning.append(this.$('<button type="button">').addClass('rkrs-wt-task-owner-button').text('Создать отдельную задачу ответственному'));
            $form.append($warning);
        } else if (!mismatch && $warning.length) {
            $warning.remove();
        }
    };

    TaskAssignmentController.prototype._onClick = function (event) {
        var target = event.target && event.target.closest && event.target.closest('.rkrs-wt-task-owner-button, .feed-compose_task .js-task-submit');
        if (!target) { return; }
        this.sync();
        var context = this.context();
        if (!context) { return; }
        var $form = this.$(target).closest('.feed-compose_task');
        if (target.classList.contains('rkrs-wt-task-owner-button')) {
            event.preventDefault();
            event.stopPropagation();
            this.showConfirmation(context, formDraft($form));
        } else if (Number($form.find('.js-task-main_user').val()) !== Number(context.responsibleUserId)) {
            var notice = this.formKey + ':' + $form.find('.js-task-main_user').val();
            if (this.noticeKey !== notice) {
                this.noticeKey = notice;
                this.ui.notify('Задача назначена другому сотруднику. Сделка останется в списке, пока у ответственного нет своей задачи.');
            }
        }
    };

    TaskAssignmentController.prototype.showConfirmation = function (context, draft) {
        if (!this.Modal || this.modal) { return; }
        try { taskPayload(context, draft); } catch (error) { this.ui.notify(error.message); return; }
        var self = this;
        var $ = this.$;
        var modal = new this.Modal({
            class_name: 'rkrs-wt-owner-task-modal',
            init: function ($body) {
                var instance = this;
                var $dialog = $('<div>').addClass('rkrs-wt-dialog rkrs-wt-owner-task-dialog');
                $dialog.append($('<h2>').text('Задача ответственному за сделку'));
                $dialog.append($('<p>').text('Исполнитель: ' + self._userName(context.responsibleUserId)));
                var $text = $('<textarea>').addClass('rkrs-wt-owner-task-text').attr('aria-label', 'Текст задачи').val(draft.text);
                var deadline = new Date(draft.completeTill * 1000);
                function pad(value) { return String(value).padStart(2, '0'); }
                var $deadline = $('<input type="datetime-local">').addClass('rkrs-wt-owner-task-deadline').attr('aria-label', 'Срок задачи')
                    .val(deadline.getFullYear() + '-' + pad(deadline.getMonth() + 1) + '-' + pad(deadline.getDate()) + 'T' + pad(deadline.getHours()) + ':' + pad(deadline.getMinutes()));
                $dialog.append($('<label>').text('Текст задачи').append($text));
                $dialog.append($('<label>').text('Срок задачи').append($deadline));
                $dialog.append($('<p>').text('Будет создана отдельная задача. Задача другого сотрудника сохранится в его форме.'));
                var $error = $('<p>').attr('role', 'alert');
                $dialog.append($error);
                var $save = $('<button type="button">').addClass('button-input button-input_blue').text('Создать задачу');
                var $cancel = $('<button type="button">').addClass('button-input').text('Отмена');
                $dialog.append($('<div>').addClass('rkrs-wt-dialog__actions').append($cancel).append($save));
                $cancel.on('click', function () { instance.destroy(); });
                $save.on('click', async function () {
                    if ($save.prop('disabled')) { return; }
                    $save.prop('disabled', true);
                    $error.text('');
                    try {
                        var current = self.context();
                        if (!current || current.entityId !== context.entityId || current.responsibleUserId !== context.responsibleUserId) {
                            throw new Error('Карточка или ответственный изменились. Откройте создание задачи заново.');
                        }
                        var result = await self.service.create(context, Object.assign({}, draft, {
                            text: $text.val(), completeTill: new Date($deadline.val()).getTime() / 1000
                        }));
                        if (self.destroyed) { return; }
                        self.ui.notify(result.alreadyExists ? 'У ответственного уже есть задача. Дополнительная задача не создана.' : 'Задача ответственному создана.', 'success');
                        self.onChanged(context);
                        instance.destroy();
                    } catch (error) {
                        $error.text(error.message || 'Не удалось создать задачу. Проверьте ленту перед повторной попыткой.');
                        $save.prop('disabled', false);
                        self.checker.invalidate(context);
                    }
                });
                $body.trigger('modal:loaded').empty().append($dialog).trigger('modal:centrify');
            }
        });
        var destroy = modal.destroy;
        modal.destroy = function () {
            self.modal = null;
            return destroy.apply(this, arguments);
        };
        this.modal = modal;
    };

    TaskAssignmentController.prototype.bind = function () {
        if (this.timer || typeof document === 'undefined') { return; }
        document.addEventListener('click', this.clickHandler, true);
        this.sync();
        this.timer = setInterval(this.sync.bind(this), 500);
    };

    TaskAssignmentController.prototype.destroy = function () {
        this.destroyed = true;
        clearInterval(this.timer);
        this.timer = null;
        if (typeof document !== 'undefined') { document.removeEventListener('click', this.clickHandler, true); }
        this.$('.rkrs-wt-task-warning').remove();
        if (this.modal) { this.modal.destroy(); }
    };

    return { matchesResponsible: matchesResponsible, taskPayload: taskPayload, formDraft: formDraft,
        OwnerTaskService: OwnerTaskService, TaskAssignmentController: TaskAssignmentController };
}));
