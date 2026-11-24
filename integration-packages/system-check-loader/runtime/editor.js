define(['./card.js', './preferences.js'], function (card, preferences) {
    'use strict';

    return function edit(root, code, initial, ids, signal) {
        if (signal.aborted) return;
        root.innerHTML = `
        <header class="rkse-header">
            <div><h2>Карточка сделки</h2><p>Настройте содержимое и внешний вид блока Ракурса в сделке.</p></div>
            <span class="rkse-state" data-state role="status"></span>
        </header>
        <div class="rkse-layout">
            <form class="rkse-sheet">
                <fieldset class="rkse-group"><legend>Содержимое</legend>
                    <label class="rkse-field">Заголовок блока<input name="title" maxlength="60" required></label>
                    <label class="rkse-field">Текст в карточке сделки<textarea name="message" rows="2" maxlength="200" required></textarea></label>
                    <fieldset class="rkse-toggles"><legend>Данные в карточке</legend>
                        <label><input type="checkbox" name="account"> ID аккаунта</label>
                        <label><input type="checkbox" name="deal"> ID сделки</label>
                        <label><input type="checkbox" name="version"> Версия модуля</label>
                    </fieldset>
                </fieldset>
                <fieldset class="rkse-group"><legend>Оформление</legend>
                    <fieldset class="rkse-colors"><legend>Цвет полосы слева</legend>
                        <label><input type="radio" name="accent" value="#448aff"><span style="--swatch:#448aff">Синий</span></label>
                        <label><input type="radio" name="accent" value="#24956d"><span style="--swatch:#24956d">Зелёный</span></label>
                        <label><input type="radio" name="accent" value="#ad7228"><span style="--swatch:#ad7228">Янтарный</span></label>
                        <label><input type="radio" name="accent" value="#8270be"><span style="--swatch:#8270be">Фиолетовый</span></label>
                    </fieldset>
                    <label class="rkse-switch"><span>Компактные отступы</span><input type="checkbox" name="compact"></label>
                    <label class="rkse-switch"><span>Сворачивать блок при открытии сделки</span><input type="checkbox" name="collapsed"></label>
                </fieldset>
                <footer class="rkse-actions">
                    <button type="submit" class="rkse-primary">Сохранить</button>
                    <button type="button" data-reset>Вернуть стандартные</button>
                </footer>
            </form>
            <aside class="rkse-aside">
                <section class="rkse-preview"><h3>Предпросмотр в сделке</h3>
                    <div class="rkse-stage"><div class="rkse-sample" data-preview></div></div>
                </section>
                <section class="rkse-service"><h3>Тестовый бэкенд</h3>
                    <p>Обмен имитируется в этом браузере. Копия настроек привязана к аккаунту и виджету.</p>
                    <div class="rkse-request" data-request role="status"></div>
                    <button type="button" data-read>Загрузить повторно</button>
                    <label class="rkse-fault"><input type="checkbox" data-fail> Ошибка следующего запроса</label>
                </section>
            </aside>
        </div>`;
        const get = selector => root.querySelector(selector);
        const form = get('form'), fields = form.elements;
        const preview = get('[data-preview]'), state = get('[data-state]');
        const log = get('[data-request]'), readButton = get('[data-read]');
        const fail = get('[data-fail]'), saveButton = get('[type=submit]'), reset = get('[data-reset]');
        let record, busy = false, conflict = false, failed = false;

        function values() {
            return Object.fromEntries(Object.keys(card.defaults).map(key => {
                const field = fields.namedItem(key);
                return [key, typeof card.defaults[key] === 'boolean' ? field.checked : field.value.trim()];
            }));
        }
        function fill(config) {
            for (const [key, value] of Object.entries(config)) {
                const field = fields.namedItem(key);
                if (typeof value === 'boolean') field.checked = value;
                else field.value = value;
            }
        }
        function dirty() { return record && JSON.stringify(values()) !== JSON.stringify(record.config); }
        function update(resetOpen = false) {
            const config = values();
            if (record) {
                const open = resetOpen ? !config.collapsed : preview.querySelector('details')?.open;
                card.draw(preview, config, ids, open);
            } else {
                preview.textContent = busy ? 'Загружаем карточку…' : 'Ожидаем настройки';
            }
            for (const group of form.querySelectorAll('.rkse-group')) group.disabled = busy || !record;
            form.setAttribute('aria-busy', String(busy));
            saveButton.disabled = busy || conflict || !dirty() || !config.title || !config.message;
            reset.disabled = busy || !record || JSON.stringify(config) === JSON.stringify(card.defaults);
            readButton.disabled = busy || (dirty() && !conflict);
            readButton.textContent = conflict ? 'Загрузить сохранённое и сбросить правки' : 'Загрузить повторно';
            fail.disabled = busy;
            const mode = busy ? 'busy' : failed ? 'error' : dirty() ? 'dirty' : 'ready';
            state.dataset.mode = mode;
            state.textContent = busy ? 'Идёт обмен' : failed ? 'Ошибка запроса' : dirty() ? 'Есть изменения' : record?.revision ? 'Сохранено' : 'Исходные настройки';
        }
        async function request(method) {
            if (busy || signal.aborted) return;
            const saving = method === 'PUT';
            const next = values(), injectError = fail.checked;
            fail.checked = false;
            busy = true;
            failed = false;
            log.dataset.result = 'busy';
            log.textContent = method + ' · ' + (saving ? 'Сохраняем настройки…' : 'Загружаем настройки…');
            update();
            try {
                record = saving
                    ? await preferences.save(ids.account, code, record.revision, next, signal, injectError)
                    : await preferences.read(ids.account, code, initial, signal, injectError);
                if (signal.aborted) return;
                conflict = false;
                fill(record.config);
                log.dataset.result = 'ok';
                log.textContent = method + ' · 200 OK · ' + (saving ? 'Настройки сохранены' : 'Настройки получены');
            } catch (error) {
                if (signal.aborted) return;
                failed = true;
                conflict = error.code === 'conflict' || conflict;
                log.dataset.result = 'error';
                log.textContent = method + ' · ' + error.message;
            } finally {
                if (!signal.aborted) { busy = false; update(true); }
            }
        }
        form.oninput = event => update(event.target === fields.collapsed);
        reset.onclick = () => { fill(card.defaults); update(true); };
        form.onsubmit = event => {
            event.preventDefault();
            if (!saveButton.disabled) request('PUT');
        };
        readButton.onclick = () => request('GET');
        fill(card.defaults);
        request('GET');
    };
});
