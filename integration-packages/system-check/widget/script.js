define(['./lib/installation-activation.js'], function (Activation) {
    'use strict';
    return function () {
        var widget = this;
        var activation;
        var slotId = 'rkrs-system-check-account';

        this.callbacks = {
            init: function () { Activation.sync(widget); return true; },
            bind_actions: function () { return true; },
            onSave: function () { return !activation || activation.allowSave(); },
            settings: function (modalBody) {
                var target = modalBody && (modalBody.nodeType === 1 ? modalBody : modalBody[0]);
                if (activation) { activation.destroy(); }
                activation = Activation.mount(widget, target);
                return true;
            },
            render: function () {
                if (widget.system().area !== 'lcard') { return true; }
                var slot = document.getElementById(slotId);
                if (!slot) {
                    widget.render_template({
                        caption: { class_name: 'rkrs-system-check-caption', html: 'Ракурс — проверка установки' },
                        body: '',
                        render: '<p id="' + slotId + '"></p>'
                    });
                    slot = document.getElementById(slotId);
                }
                if (slot) Activation.showWhenActivated(widget, slot, function () {
                    var account = window.APP.constant('account');
                    slot.textContent = 'Виджет загружен. Аккаунт amoCRM: ' + (account && account.id || 'ID недоступен');
                });
                return true;
            },
            destroy: function () {
                if (activation) { activation.destroy(); activation = null; }
                var slot = document.getElementById(slotId);
                if (slot) { slot.remove(); }
                return true;
            }
        };
        return this;
    };
});
