define(['./card.js', './preferences.js'], function (card, preferences) {
    'use strict';
    return async function edit(root, code, ids, saved) {
        root.textContent = 'Загружаем настройки…';
        let raw;
        try {
            raw = (await preferences.read(code)).card_config || '';
            card.decode(raw);
        } catch (error) { root.textContent = error.message; return; }
        if (!root.isConnected) return;
        root.innerHTML = `<h3>Карточка сделки</h3>
<div class="layout">
<form>
<fieldset class="fields"><legend>Содержимое</legend>
<label class="form-label">Заголовок блока<input class="form-control" name="title" value="Ракурс — проверка загрузчика" maxlength="60" required></label>
<label class="form-label">Текст в карточке сделки<textarea class="form-control" name="message" rows="2" maxlength="200" required>Виджет подключён</textarea></label>
<label><input class="form-check-input" name="account" type="checkbox" checked> Показывать ID аккаунта</label>
<label><input class="form-check-input" name="deal" type="checkbox"> Показывать ID сделки</label>
<label><input class="form-check-input" name="version" type="checkbox" checked> Показывать версию модуля</label>
</fieldset>
<fieldset class="fields"><legend>Оформление</legend>
<label class="form-label">Цвет полосы слева<select class="form-select" name="accent"><option value="#448aff">Синий</option><option value="#24956d">Зелёный</option><option value="#ad7228">Янтарный</option><option value="#8270be">Фиолетовый</option></select></label>
<label><input class="form-check-input" name="compact" type="checkbox"> Компактный вид</label></fieldset>
<fieldset><legend>При открытии сделки</legend>
<label><input class="form-check-input" name="collapsed" type="checkbox"> Сворачивать блок до заголовка</label></fieldset>
<div class="viz-row"><button class="btn btn-primary" type="submit">Сохранить</button><button class="btn btn-secondary" type="button" data-reset>Вернуть стандартные</button></div>
<small role="status" aria-live="polite"></small>
</form>
<section><span class="meta">Предпросмотр в сделке</span><hr>
<div data-preview></div></section></div>`;
        const form = root.querySelector('form');
        const fields = form.elements;
        const preview = root.querySelector('[data-preview]');
        const save = form.querySelector('[type=submit]');
        const reset = form.querySelector('[data-reset]');
        const status = form.querySelector('[role=status]');
        let busy = false;
        function fill(config) {
            for (const [key, value] of Object.entries(config)) {
                if (typeof value === 'boolean') fields[key].checked = value;
                else fields[key].value = value;
            }
        }
        function values() {
            return Object.fromEntries(Object.keys(card.defaults).map(key => [key,
                fields[key].type === 'checkbox' ? fields[key].checked : fields[key].value.trim()]));
        }
        function update(resetOpen) {
            const config = values();
            const open = resetOpen ? !config.collapsed : preview.querySelector('details')?.open;
            card.draw(preview, config, ids, open);
            const json = JSON.stringify(config);
            save.disabled = busy || !config.title || !config.message || json === JSON.stringify(card.decode(raw));
            reset.disabled = busy || json === JSON.stringify(card.defaults);
        }
        fill(card.decode(raw));
        update(true);
        form.oninput = e => { status.textContent = ''; update(e.target === fields.collapsed); };
        reset.onclick = () => { fill(card.defaults); update(true); status.textContent = 'Для применения нажмите «Сохранить».'; };
        form.onsubmit = async e => {
            e.preventDefault();
            if (save.disabled || busy) return;
            busy = true;
            const next = values();
            update(false);
            status.textContent = 'Сохранение…';
            try {
                raw = await preferences.save(code, raw, next);
                saved(raw);
                status.textContent = 'Настройки сохранены';
            } catch (error) { status.textContent = error.message; }
            finally { busy = false; update(false); }
        };
    };
});
