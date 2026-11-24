define(['module', './lib/installation-activation.js', './editor.js', './card.js', './preferences.js'],
function (module, activation, edit, card, preferences) {
    'use strict';
    const stylesheet = new URL('style.css', module.uri).href;
    const editorStyles = new URL('editor.css', module.uri).href;
    const release = new URL(module.uri).pathname.split('/').at(-2);
    return function createApp(widget) {
        let form, slot, editor, styles;
        let pageRequest, cardRequest;
        function loadStyles(target) {
            if (styles) styles.remove();
            styles = document.createElement('link');
            styles.rel = 'stylesheet';
            styles.href = editorStyles;
            target.append(styles);
        }
        function ids() {
            const account = window.APP.constant('account');
            const deal = window.APP.data?.current_card?.id || location.pathname.match(/\/leads\/detail\/(\d+)/)?.[1];
            return { account: account?.id, deal, version: release };
        }
        return {
            init() { activation.sync(widget); },
            settings(target) {
                if (form) form.destroy();
                if (target) loadStyles(target);
                form = activation.mount(widget, target, stylesheet);
            },
            advancedSettings(target) {
                pageRequest?.abort();
                pageRequest = new AbortController();
                if (editor) editor.remove();
                editor = document.createElement('section');
                editor.className = 'rkrs-loader-editor';
                target.append(editor);
                loadStyles(target);
                const page = editor;
                const settings = widget.get_settings();
                const signal = pageRequest.signal;
                activation.showWhenActivated(widget, page, () =>
                    edit(page, settings.widget_code, settings.card_config, { ...ids(), deal: '12345 (пример)' }, signal));
            },
            render() {
                if (widget.system().area !== 'lcard') return;
                const id = 'rkrs-loader-check-account';
                if (!document.getElementById(id)) {
                    widget.render_template({
                        caption: { class_name: 'rkrs-loader-check-caption', html: 'Ракурс — проверка загрузчика' },
                        body: '', render: '<div id="' + id + '"></div>'
                    });
                }
                slot = document.getElementById(id);
                if (!slot) return;
                const settings = widget.get_settings();
                cardRequest?.abort();
                cardRequest = new AbortController();
                const signal = cardRequest.signal;
                const target = slot, current = ids();
                activation.showWhenActivated(widget, target, async () => {
                    if (signal.aborted) return;
                    target.textContent = 'Загружаем настройки…';
                    try {
                        const record = await preferences.read(current.account, settings.widget_code, settings.card_config, signal);
                        if (!signal.aborted && target.isConnected) card.draw(target, record.config, current);
                    } catch (error) {
                        if (!signal.aborted && target.isConnected) target.textContent = error.message;
                    }
                });
            },
            onSave() { return !form || form.allowSave(); },
            destroy() {
                pageRequest?.abort();
                cardRequest?.abort();
                if (form) form.destroy();
                if (slot) slot.remove();
                if (editor) editor.remove();
                if (styles) styles.remove();
            }
        };
    };
});
