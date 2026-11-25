define([], function () {
    'use strict';

    var PREFIX = 'RKRS_AF_FORMULA_';
    var AUTHOR = 'Олега Шевелёва';
    var METHOD = 'По методике ' + AUTHOR;
    var METHOD_URL = 'https://www.youtube.com/watch?v=CO_JyyRhNd8&t=1s';
    // Редакция 12.11.2026 (1.0.134): универсальные тексты для любого бизнеса, порядок и названия — как у автора методики
    // (ФВ → ОП → Д → ЛПР → ЗиС), блокер у ответа «нет» всех пяти полей. Коды полей (key) прежние — уже созданные шаблоны не задваиваются.
    // Канон текстов: business/products/dynamic-fields-templates/deal-formula.md.
    var DEFINITIONS = [
        { key: 'BUDGET', name: 'Финансовая возможность', tag: 'ФВ', yes: 'Да, может оплатить', no: 'Нет, оплатить не может',
            meaning: 'Клиент может заплатить нашу цену.',
            negative: 'Уточните, на какую сумму клиент рассчитывает. Предложите вариант дешевле или оплату частями.' },
        { key: 'NEED', name: 'Осознанная потребность', tag: 'ОП', yes: 'Да, хочет такое решение', no: 'Нет, пока присматривается',
            meaning: 'Клиент хочет именно такое решение.',
            negative: 'Спросите, что сейчас не устраивает. Покажите решение на его ситуации.' },
        { key: 'TRUST', name: 'Доверие', tag: 'Д', yes: 'Да, доверяет нам', no: 'Нет, сомневается',
            meaning: 'Клиент доверяет компании, продукту и менеджеру.',
            negative: 'Узнайте, что смущает. Покажите отзыв или пример похожего клиента.' },
        { key: 'DECISION', name: 'Лицо, принимающее решение', tag: 'ЛПР', yes: 'Да, решает сам', no: 'Нет, решает другой человек',
            meaning: 'Говорим с тем, кто принимает решение.',
            negative: 'Узнайте, кто принимает решение, и договоритесь о разговоре с ним.' },
        { key: 'TIMING', name: 'Здесь и сейчас', tag: 'ЗиС', yes: 'Да, готов решить сейчас', no: 'Нет, откладывает',
            meaning: 'Клиент готов решать сейчас.',
            negative: 'Узнайте, что мешает решить сейчас. Договоритесь о следующем шаге с датой.' }
    ];

    function preview() {
        return DEFINITIONS.map(function (field) {
            return { name: field.name, tag: field.tag, meaning: field.meaning,
                options: [field.yes, 'Не выяснено', field.no].concat(field.additionalYes || []), negativeAdvice: field.negative };
        });
    }

    function buildFields(key, startSort, groupId) {
        var fields = [{ code: PREFIX + 'HEADER', type: 'text',
            name: '[' + key + '4] Формула сделки {:checklist} {::' + METHOD + '}' }];
        DEFINITIONS.forEach(function (field) {
            fields.push({
                code: PREFIX + field.key,
                type: 'radiobutton',
                name: '[' + key + '] ' + field.name + ' {:tag ' + field.tag + '}',
                enums: [
                    { value: '[+] ' + field.yes, sort: 10 },
                    { value: 'Не выяснено', sort: 20 },
                    { value: '[-] ' + field.no + ' {!' + field.negative + '}', sort: 30 }
                ].concat((field.additionalYes || []).map(function (answer, index) {
                    return { value: '[+] ' + answer, sort: (index + 4) * 10 };
                }))
            });
        });
        return fields.map(function (field, index) {
            field.sort = startSort + (index + 1) * 10;
            if (groupId) field.group_id = groupId;
            return field;
        });
    }

    function plan(existing) {
        var byCode = Object.create(null);
        var used = Object.create(null);
        var key = null;
        var groupId = null;
        var sort = 0;
        existing.forEach(function (field) {
            byCode[field.code] = field;
            sort = Math.max(sort, Number(field.sort) || 0);
            var match = String(field.name || '').match(/^\[([A-Za-zА-Яа-яЁё])(?:[1-4])?(?:\s+\/[1-8]\/)?\]/);
            if (match) used[match[1].toUpperCase()] = true;
        });
        var ownFields = ['HEADER'].concat(DEFINITIONS.map(function (field) { return field.key; }));
        ownFields.forEach(function (suffix) {
            var field = byCode[PREFIX + suffix];
            if (!field) return;
            var match = String(field.name || '').match(/^\[([A-Za-zА-Яа-яЁё])/);
            if (!key && match) key = match[1].toUpperCase();
            if (!groupId && field.group_id) groupId = field.group_id;
        });
        if (ownFields.every(function (suffix) { return !!byCode[PREFIX + suffix]; })) {
            return { key: key || 'Ф', total: ownFields.length, missing: [] };
        }
        if (!key) {
            var letters = 'ФКДОПРСТУХЦЧШЩЭЮЯАБВГЕЖЗИЛМН'.split('');
            key = letters.filter(function (letter) { return !used[letter]; })[0];
        }
        if (!key) throw new Error('Нет свободной буквы для группы чек-листа. Освободите одну из букв и повторите.');
        var fields = buildFields(key, sort, groupId);
        return {
            key: key,
            total: fields.length,
            missing: fields.filter(function (field) { return !byCode[field.code]; })
        };
    }

    function createClient(fetcher, canCreate) {
        var inFlight = Object.create(null);

        function endpoint(entity) {
            if (['leads', 'contacts', 'companies', 'customers'].indexOf(entity) === -1) {
                throw new Error('Откройте карточку сделки, контакта, компании или покупателя.');
            }
            return '/api/v4/' + entity + '/custom_fields';
        }

        async function request(url, options) {
            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            var timer = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;
            var response;
            try {
                response = await fetcher(url, Object.assign({ credentials: 'same-origin' }, options,
                    controller ? { signal: controller.signal } : {}));
            } catch (networkError) {
                throw new Error('Не удалось связаться с amoCRM. Проверьте соединение и повторите создание.');
            } finally {
                if (timer) clearTimeout(timer);
            }
            if (!response.ok) {
                var message = response.status === 403 ? 'Создавать поля может только администратор amoCRM.' :
                    response.status === 401 ? 'Войдите в amoCRM и повторите создание.' :
                    response.status === 429 ? 'Слишком много запросов. Повторите создание позже.' :
                    'amoCRM не приняла запрос. Проверьте права и доступный лимит пользовательских полей.';
                var error = new Error(message);
                error.status = response.status;
                throw error;
            }
            if (response.status === 204) return { _embedded: { custom_fields: [] } };
            return response.json();
        }

        async function loadFields(entity) {
            var fields = [];
            for (var page = 1; page <= 1000; page++) {
                var payload = await request(endpoint(entity) + '?limit=250&page=' + page);
                var batch = payload && payload._embedded && payload._embedded.custom_fields;
                if (!Array.isArray(batch)) throw new Error('Не удалось прочитать список полей amoCRM. Повторите позже.');
                fields = fields.concat(batch);
                if (!(payload._links && payload._links.next) && batch.length < 250) return fields;
            }
            throw new Error('Не удалось прочитать все поля amoCRM. Повторите позже.');
        }

        async function apply(entity) {
            var url = endpoint(entity);
            var existing = await loadFields(entity);
            var proposal = plan(existing);
            if (!proposal.missing.length) return { created: 0, total: proposal.total, key: proposal.key };
            if (!canCreate()) throw new Error('Доступ к виджету не активен. Проверьте статус доступа в настройках.');
            try {
                var response = await request(url, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(proposal.missing)
                });
                var created = response && response._embedded && response._embedded.custom_fields;
                if (!Array.isArray(created) || plan(existing.concat(created)).missing.length) {
                    if (plan(await loadFields(entity)).missing.length) {
                        throw new Error('Созданы не все поля. Повторите создание: будут добавлены только недостающие.');
                    }
                }
                return { created: proposal.missing.length, total: proposal.total, key: proposal.key };
            } catch (error) {
                // A disconnected response can still follow a successful write. Check before retrying.
                if (error.status !== 401 && error.status !== 403) {
                    try {
                        if (!plan(await loadFields(entity)).missing.length) {
                            return { created: proposal.missing.length, total: proposal.total, key: proposal.key };
                        }
                    } catch (ignored) {}
                }
                throw error;
            }
        }

        return {
            applyFormula: function (entity) {
                if (inFlight[entity]) return inFlight[entity];
                inFlight[entity] = apply(entity).finally(function () { delete inFlight[entity]; });
                return inFlight[entity];
            }
        };
    }

    return { method: METHOD, author: AUTHOR, methodUrl: METHOD_URL,
        preview: preview, buildFields: buildFields, plan: plan, createClient: createClient };
});
