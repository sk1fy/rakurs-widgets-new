define(['module', './lib/installation-activation.js', './editor.js', './card.js'],
function (module, activation, edit, card) {
    'use strict';
    const stylesheet = new URL('style.css', module.uri).href;
    const editorStyles = new URL('editor.css', module.uri).href;
    const release = new URL(module.uri).pathname.split('/').at(-2);
    return function createApp(widget) {
        let form, slot, editor, styles;
        let saved;
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
                if (editor) editor.remove();
                editor = document.createElement('section');
                editor.className = 'rkrs-loader-editor';
                target.append(editor);
                loadStyles(target);
                edit(editor, widget.get_settings().widget_code, { ...ids(), deal: '12345 (пример)' }, raw => {
                    saved = raw;
                    widget.set_settings?.({ ...widget.get_settings(), card_config: raw });
                });
            },
            render() {
                activation.sync(widget);
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
                card.draw(slot, card.decode(saved ?? settings.card_config), ids());
            },
            onSave() { return !form || form.allowSave(); },
            destroy() {
                if (form) form.destroy();
                if (slot) slot.remove();
                if (editor) editor.remove();
                if (styles) styles.remove();
            }
        };
    };
});
