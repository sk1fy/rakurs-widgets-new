define(['./card.js'], function (card) {
    'use strict';

    function storageKey(account, code) {
        if (!account || !code) throw Error('Не удалось определить аккаунт и код виджета.');
        return 'rkrs.loader.settings-demo.v1:' + encodeURIComponent(account) + ':' + encodeURIComponent(code);
    }

    // The mock has the same asynchronous boundary as a remote service. Only
    // the eight display preferences pass through it; activation stays in Core.
    function wait(signal, fail) {
        return new Promise((resolve, reject) => {
            signal.throwIfAborted();
            const abort = () => {
                clearTimeout(timer);
                reject(signal.reason);
            };
            const timer = setTimeout(() => {
                signal.removeEventListener('abort', abort);
                if (fail) reject(Error('503 · Тестовый сервис временно недоступен.'));
                else resolve();
            }, 700);
            signal.addEventListener('abort', abort, { once: true });
        });
    }

    function stored(key, initial) {
        let raw;
        try { raw = localStorage.getItem(key); }
        catch (_) { throw Error('Браузер запретил чтение локальных настроек.'); }
        if (raw === null) return { revision: 0, config: card.decode(initial) };
        try {
            const result = JSON.parse(raw);
            if (!Number.isSafeInteger(result.revision) || result.revision < 1 || !result.config) throw Error();
            return { revision: result.revision, config: card.decode(result.config) };
        } catch (_) { throw Error('Не удалось прочитать сохранённую тестовую версию.'); }
    }

    async function read(account, code, initial, signal, fail = false) {
        await wait(signal, fail);
        return stored(storageKey(account, code), initial);
    }

    async function save(account, code, expected, next, signal, fail = false) {
        await wait(signal, fail);
        const key = storageKey(account, code);
        function write() {
            signal.throwIfAborted();
            if (stored(key).revision !== expected) {
                const error = Error('В другой вкладке уже сохранены изменения. Загрузите их перед новой правкой.');
                error.code = 'conflict';
                throw error;
            }
            const record = { revision: expected + 1, config: card.decode(next) };
            try { localStorage.setItem(key, JSON.stringify(record)); }
            catch (_) { throw Error('Браузер не смог сохранить тестовые настройки.'); }
            return record;
        }
        return navigator.locks ? navigator.locks.request(key, { signal }, write) : write();
    }

    return { read, save };
});
