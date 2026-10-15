(function (root, factory) {
    if (typeof define === 'function') {
        define([], function () { return factory; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./constants'));
    } else {
        root.RkrsWtRules = factory(root.RkrsWtConstants);
    }
}(typeof self !== 'undefined' ? self : this, function (Constants) {
    'use strict';

    function uniqueNumbers(values) {
        var seen = {};
        return (Array.isArray(values) ? values : []).reduce(function (result, value) {
            var number = Number(value);
            if (Number.isFinite(number) && number > 0 && !seen[number]) {
                seen[number] = true;
                result.push(number);
            }
            return result;
        }, []).sort(function (a, b) { return a - b; });
    }

    function normalizePipelines(pipelines) {
        var byPipeline = {};
        (Array.isArray(pipelines) ? pipelines : []).forEach(function (pipeline) {
            var id = Number(pipeline && (pipeline.pipeline_id !== undefined ? pipeline.pipeline_id : pipeline.id));
            if (!Number.isFinite(id) || id <= 0) {
                return;
            }
            var statuses = pipeline.status_ids !== undefined ? pipeline.status_ids : pipeline.statuses;
            byPipeline[id] = uniqueNumbers((byPipeline[id] || []).concat(statuses || []));
        });
        return Object.keys(byPipeline).map(function (id) {
            return { pipeline_id: Number(id), status_ids: byPipeline[id] };
        }).sort(function (a, b) { return a.pipeline_id - b.pipeline_id; });
    }

    function normalizeRule(rule) {
        rule = rule || {};
        return {
            uid: String(rule.uid || rule.rule_uid || '').trim(),
            elementId: Number(rule.elementId || rule.element_id) || null,
            name: String(rule.name || '').trim(),
            users: uniqueNumbers(rule.users),
            pipelines: normalizePipelines(rule.pipelines),
            customerStatuses: uniqueNumbers(rule.customerStatuses || rule.customer_statuses),
            showModal: Boolean(rule.showModal !== undefined ? rule.showModal : rule.show_modal),
            denyExit: Boolean(rule.denyExit !== undefined ? rule.denyExit : rule.deny_exit),
            checkResponsible: Boolean(rule.checkResponsible !== undefined ? rule.checkResponsible : rule.check_responsible),
            customers: Boolean(rule.customers),
            enabled: rule.enabled === undefined ? true : Boolean(rule.enabled),
            archived: Boolean(rule.archived)
        };
    }

    function isUid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
    }

    function validateRule(input) {
        input = input || {};
        var rule = normalizeRule(input);
        var errors = [];
        [
            ['showModal', 'show_modal'],
            ['denyExit', 'deny_exit'],
            ['checkResponsible', 'check_responsible'],
            ['customers', 'customers'],
            ['enabled', 'enabled'],
            ['archived', 'archived']
        ].forEach(function (names) {
            var value = input[names[0]] !== undefined ? input[names[0]] : input[names[1]];
            if (value !== undefined && typeof value !== 'boolean') {
                errors.push('Поле ' + names[1] + ' должно быть boolean');
            }
        });
        if (!isUid(rule.uid)) {
            errors.push('Некорректный UID правила');
        }
        if (!rule.name) {
            errors.push('Не указано название правила');
        }
        if (!rule.users.length) {
            errors.push('Не выбран ни один пользователь');
        }
        if (!rule.customers && !rule.pipelines.length) {
            errors.push('Не выбран ни один этап сделки и не включены покупатели');
        }
        rule.pipelines.forEach(function (pipeline) {
            if (!pipeline.status_ids.length) {
                errors.push('Для воронки ' + pipeline.pipeline_id + ' не выбраны этапы');
            }
        });
        return { valid: errors.length === 0, errors: errors, rule: rule };
    }

    function createUid() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
            var random = Math.floor(Math.random() * 16);
            var value = character === 'x' ? random : (random & 3) | 8;
            return value.toString(16);
        });
    }

    function fieldValueMap(element) {
        return (element && Array.isArray(element.custom_fields_values) ? element.custom_fields_values : []).reduce(function (result, field) {
            if (field.field_id !== undefined) {
                result['id:' + field.field_id] = field;
            }
            if (field.field_code) {
                result['code:' + field.field_code] = field;
            }
            return result;
        }, {});
    }

    function fieldFor(map, storage, key) {
        var id = storage && storage.fields && storage.fields[key];
        var definition = Constants.FIELD_DEFINITIONS.filter(function (field) { return field.key === key; })[0];
        return (id && map['id:' + id]) || (definition && map['code:' + definition.code]) || null;
    }

    function scalarValue(field) {
        if (!field || !Array.isArray(field.values) || !field.values.length) {
            return null;
        }
        var first = field.values[0];
        return first && first.value !== undefined ? first.value : null;
    }

    function parseJsonField(field, fallback) {
        var value = scalarValue(field);
        if (Array.isArray(value) || (value && typeof value === 'object')) {
            return value;
        }
        if (typeof value !== 'string' || value.trim() === '') {
            return fallback;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            return { __invalidJson: true, value: value };
        }
    }

    function booleanField(field, storage, key, fallback) {
        if (!field || !Array.isArray(field.values) || !field.values.length) {
            return Boolean(fallback);
        }
        var entry = field.values[0] || {};
        var enumConfig = storage && storage.enums && storage.enums[key];
        if (enumConfig && entry.enum_id !== undefined) {
            if (Number(entry.enum_id) === Number(enumConfig.true)) {
                return true;
            }
            if (Number(entry.enum_id) === Number(enumConfig.false)) {
                return false;
            }
        }
        return entry.value === true || entry.value === 1 || entry.value === '1' || entry.value === 'Да';
    }

    function fromCatalogElement(element, storage) {
        var fields = fieldValueMap(element);
        var users = parseJsonField(fieldFor(fields, storage, 'users'), []);
        var pipelines = parseJsonField(fieldFor(fields, storage, 'pipelines'), []);
        var customerStatuses = parseJsonField(fieldFor(fields, storage, 'customer_statuses'), []);
        var parseErrors = [];
        [users, pipelines, customerStatuses].forEach(function (value) {
            if (value && value.__invalidJson) {
                parseErrors.push('Повреждено JSON-поле: ' + value.value);
            }
        });

        var rule = normalizeRule({
            uid: scalarValue(fieldFor(fields, storage, 'rule_uid')),
            elementId: element && element.id,
            name: element && element.name,
            users: users && users.__invalidJson ? [] : users,
            pipelines: pipelines && pipelines.__invalidJson ? [] : pipelines,
            customerStatuses: customerStatuses && customerStatuses.__invalidJson ? [] : customerStatuses,
            showModal: booleanField(fieldFor(fields, storage, 'show_modal'), storage, 'show_modal', false),
            denyExit: booleanField(fieldFor(fields, storage, 'deny_exit'), storage, 'deny_exit', false),
            checkResponsible: booleanField(fieldFor(fields, storage, 'check_responsible'), storage, 'check_responsible', false),
            customers: booleanField(fieldFor(fields, storage, 'customers'), storage, 'customers', false),
            enabled: booleanField(fieldFor(fields, storage, 'enabled'), storage, 'enabled', true),
            archived: booleanField(fieldFor(fields, storage, 'archived'), storage, 'archived', false)
        });
        var validation = validateRule(rule);
        validation.errors = parseErrors.concat(validation.errors);
        validation.valid = validation.errors.length === 0;
        validation.rule.valid = validation.valid;
        validation.rule.errors = validation.errors;
        return validation.rule;
    }

    function fieldPayload(storage, key, value) {
        var id = storage && storage.fields && storage.fields[key];
        if (!id) {
            throw new Error('Missing catalog field ID for ' + key);
        }
        var definition = Constants.FIELD_DEFINITIONS.filter(function (field) { return field.key === key; })[0];
        if (definition && definition.type === 'select') {
            var enumConfig = storage.enums && storage.enums[key];
            var entry = enumConfig && enumConfig[value ? 'true' : 'false'];
            return {
                field_id: id,
                values: [entry ? { enum_id: entry } : { value: value ? '1' : '0' }]
            };
        }
        return { field_id: id, values: [{ value: String(value) }] };
    }

    function toCatalogFields(input, storage, onlyKeys) {
        var rule = normalizeRule(input);
        var values = {
            rule_uid: rule.uid,
            users: JSON.stringify(rule.users),
            pipelines: JSON.stringify(rule.pipelines),
            customer_statuses: JSON.stringify(rule.customerStatuses),
            show_modal: rule.showModal,
            deny_exit: rule.denyExit,
            check_responsible: rule.checkResponsible,
            customers: rule.customers,
            enabled: rule.enabled,
            archived: rule.archived
        };
        var keys = onlyKeys || Constants.FIELD_KEYS;
        return keys.map(function (key) {
            return fieldPayload(storage, key, values[key]);
        });
    }

    function runtimeRule(input) {
        var rule = normalizeRule(input);
        return {
            uid: rule.uid,
            name: rule.name,
            users: rule.users,
            pipelines: rule.pipelines,
            customer_statuses: rule.customerStatuses,
            show_modal: rule.showModal,
            deny_exit: rule.denyExit,
            check_responsible: rule.checkResponsible,
            customers: rule.customers,
            enabled: rule.enabled
        };
    }

    function RuleEngine(rules, currentUserId) {
        this.currentUserId = Number(currentUserId) || 0;
        this.rulesByUser = new Map();
        (Array.isArray(rules) ? rules : []).forEach(function (source) {
            var validation = validateRule(source);
            var rule = validation.rule;
            if (!validation.valid || !rule.enabled || rule.archived) {
                return;
            }
            rule.users.forEach(function (userId) {
                if (!this.rulesByUser.has(userId)) {
                    this.rulesByUser.set(userId, []);
                }
                this.rulesByUser.get(userId).push(rule);
            }, this);
        }, this);
    }

    RuleEngine.prototype.myRules = function () {
        return this.rulesByUser.get(this.currentUserId) || [];
    };

    RuleEngine.prototype.match = function (context) {
        context = context || {};
        var currentUserId = Number(context.currentUserId || this.currentUserId);
        var entityType = context.entityType;
        var matches = this.myRules().filter(function (rule) {
            if (rule.checkResponsible && Number(context.responsibleUserId) !== currentUserId) {
                return false;
            }
            if (entityType === 'leads') {
                return rule.pipelines.some(function (pipeline) {
                    return pipeline.pipeline_id === Number(context.pipelineId) &&
                        pipeline.status_ids.indexOf(Number(context.statusId)) !== -1;
                });
            }
            if (entityType === 'customers') {
                if (!rule.customers) {
                    return false;
                }
                return !rule.customerStatuses.length || rule.customerStatuses.indexOf(Number(context.statusId)) !== -1;
            }
            return false;
        });
        return {
            matches: matches,
            denyExit: matches.some(function (rule) { return rule.denyExit; }),
            showModal: matches.some(function (rule) { return rule.showModal; })
        };
    };

    return {
        uniqueNumbers: uniqueNumbers,
        normalizePipelines: normalizePipelines,
        normalizeRule: normalizeRule,
        isUid: isUid,
        validateRule: validateRule,
        createUid: createUid,
        fromCatalogElement: fromCatalogElement,
        toCatalogFields: toCatalogFields,
        runtimeRule: runtimeRule,
        RuleEngine: RuleEngine
    };
}));
