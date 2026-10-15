(function (root, factory) {
    if (typeof define === 'function') {
        define([], function () { return factory; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./constants'), require('./rules'));
    } else {
        root.RkrsWtCatalogRepository = factory(root.RkrsWtConstants, root.RkrsWtRules);
    }
}(typeof self !== 'undefined' ? self : this, function (Constants, Rules) {
    'use strict';

    function StorageError(message, code, details) {
        this.name = 'StorageError';
        this.message = message;
        this.code = code || 'STORAGE_ERROR';
        this.details = details;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, StorageError);
        }
    }
    StorageError.prototype = Object.create(Error.prototype);
    StorageError.prototype.constructor = StorageError;

    function embedded(response, key) {
        return response && response._embedded && Array.isArray(response._embedded[key]) ? response._embedded[key] : [];
    }

    function fieldDefinitionPayload(definition, index) {
        var payload = {
            name: definition.name,
            type: definition.type,
            code: definition.code,
            sort: (index + 1) * 10,
            is_visible: false,
            is_required: false
        };
        if (definition.type === 'select') {
            payload.enums = [
                { value: '0', sort: 10 },
                { value: '1', sort: 20 }
            ];
        }
        return payload;
    }

    function storageFromFields(catalog, fields) {
        var metadata = {
            catalog_id: Number(catalog.id),
            fields: {},
            enums: {}
        };
        fields.forEach(function (field) {
            var definition = Constants.FIELD_BY_CODE[field.code];
            if (!definition) {
                return;
            }
            metadata.fields[definition.key] = Number(field.id);
            if (definition.type === 'select') {
                metadata.enums[definition.key] = {};
                (field.enums || []).forEach(function (entry) {
                    var enumId = Number(entry.id || entry.enum_id);
                    if (String(entry.value) === '1') {
                        metadata.enums[definition.key].true = enumId;
                    }
                    if (String(entry.value) === '0') {
                        metadata.enums[definition.key].false = enumId;
                    }
                });
            }
        });
        return metadata;
    }

    function CatalogRepository(api) {
        this.api = api;
    }

    CatalogRepository.prototype.storageFromFields = function (catalog, fields) {
        return storageFromFields(catalog, fields);
    };

    CatalogRepository.prototype.listCatalogs = async function () {
        var response = await this.api.get('/api/v4/catalogs', { limit: 250 });
        return embedded(response, 'catalogs');
    };

    CatalogRepository.prototype.getCatalog = function (catalogId) {
        return this.api.get('/api/v4/catalogs/' + Number(catalogId), null, 'CATALOG:' + Number(catalogId));
    };

    CatalogRepository.prototype.verifyCatalog = async function (storage, accountId) {
        var catalog = await this.getCatalog(storage.catalog_id);
        if (Number(catalog.id) !== Number(storage.catalog_id) || catalog.type !== 'regular') {
            throw new StorageError('Служебный каталог имеет неожиданный тип или ID', 'INVALID_CATALOG', catalog);
        }
        if (accountId && Number(catalog.account_id) !== Number(accountId)) {
            throw new StorageError('Служебный каталог принадлежит другому аккаунту', 'WRONG_ACCOUNT', catalog);
        }
        return catalog;
    };

    CatalogRepository.prototype.createCatalog = async function () {
        var catalogs = await this.listCatalogs();
        if (catalogs.length >= Constants.CATALOG_LIMIT) {
            throw new StorageError('В аккаунте уже используется максимум из 10 списков', 'CATALOG_LIMIT');
        }
        var response = await this.api.post('/api/v4/catalogs', [{
            name: Constants.CATALOG_NAME,
            type: 'regular',
            can_add_elements: false,
            can_link_multiple: false,
            request_id: 'rkrs-wt-storage-v1'
        }]);
        var catalog = embedded(response, 'catalogs')[0];
        if (!catalog || !catalog.id) {
            throw new StorageError('amoCRM не вернула созданный каталог', 'CREATE_CATALOG_EMPTY', response);
        }
        return catalog;
    };

    CatalogRepository.prototype.createMissingFields = async function (catalogId, existingFields) {
        existingFields = Array.isArray(existingFields) ? existingFields : [];
        var existingCodes = existingFields.reduce(function (result, field) {
            if (field.code) { result[field.code] = true; }
            return result;
        }, {});
        var definitions = Constants.FIELD_DEFINITIONS.filter(function (definition) {
            return !existingCodes[definition.code];
        });
        if (!definitions.length) {
            return storageFromFields({ id: catalogId }, existingFields);
        }
        var payload = definitions.map(fieldDefinitionPayload);
        var response;
        try {
            response = await this.api.post('/api/v4/catalogs/' + Number(catalogId) + '/custom_fields', payload);
        } catch (error) {
            if (Number(error && error.status) !== 400 && Number(error && error.status) !== 422) {
                throw error;
            }
            // Some amoCRM accounts accept is_deletable only on PATCH although
            // catalog capabilities expose the flag. Re-read the possibly
            // partially created schema, then retry missing fields without the
            // disputed create-only properties.
            existingFields = await this.getFields(catalogId);
            existingCodes = existingFields.reduce(function (result, field) {
                if (field.code) { result[field.code] = true; }
                return result;
            }, {});
            definitions = Constants.FIELD_DEFINITIONS.filter(function (definition) {
                return !existingCodes[definition.code];
            });
            if (!definitions.length) {
                return storageFromFields({ id: catalogId }, existingFields);
            }
            payload = definitions.map(fieldDefinitionPayload);
            response = await this.api.post('/api/v4/catalogs/' + Number(catalogId) + '/custom_fields', payload);
        }
        var fields = existingFields.concat(embedded(response, 'custom_fields'));
        try {
            await this.api.patch('/api/v4/catalogs/' + Number(catalogId) + '/custom_fields', fields.map(function (field) {
                return { id: Number(field.id), name: field.name, is_deletable: false, is_visible: false };
            }));
        } catch (protectionError) {
            // Storage remains functional and hidden even if this account does
            // not allow changing is_deletable through v4.
        }
        var storage = storageFromFields({ id: catalogId }, fields);
        var missing = Constants.FIELD_KEYS.filter(function (key) { return !storage.fields[key]; });
        if (missing.length) {
            throw new StorageError('amoCRM создала не все поля: ' + missing.join(', '), 'FIELDS_INCOMPLETE', response);
        }
        return storage;
    };

    CatalogRepository.prototype.createFields = function (catalogId) {
        return this.createMissingFields(catalogId, []);
    };

    CatalogRepository.prototype.createStorage = async function () {
        var catalog = await this.createCatalog();
        var storage = await this.createFields(catalog.id);
        storage.catalog_id = Number(catalog.id);
        return { catalog: catalog, storage: storage };
    };

    CatalogRepository.prototype.getFields = async function (catalogId) {
        return this.api.getAllPages('/api/v4/catalogs/' + Number(catalogId) + '/custom_fields', 'custom_fields', { limit: 250, maxPages: 5 });
    };

    CatalogRepository.prototype.verifyFields = async function (storage) {
        var fields = await this.getFields(storage.catalog_id);
        var byId = fields.reduce(function (result, field) {
            result[Number(field.id)] = field;
            return result;
        }, {});
        var errors = [];
        Constants.FIELD_DEFINITIONS.forEach(function (definition) {
            var field = byId[Number(storage.fields[definition.key])];
            if (!field) {
                errors.push('Отсутствует поле ' + definition.code);
                return;
            }
            if (field.code !== definition.code || field.type !== definition.type) {
                errors.push('Поле ' + definition.code + ' имеет неверный code или type');
            }
            if (field.is_visible !== false) {
                errors.push('Поле ' + definition.code + ' не скрыто');
            }
            if (definition.type === 'select') {
                var values = (field.enums || []).map(function (entry) { return String(entry.value); });
                if (values.indexOf('0') === -1 || values.indexOf('1') === -1) {
                    errors.push('Поле ' + definition.code + ' не содержит enum 0/1');
                }
            }
        });
        return { valid: errors.length === 0, errors: errors, fields: fields, storage: storageFromFields({ id: storage.catalog_id }, fields) };
    };

    CatalogRepository.prototype.getRules = async function (storage) {
        var elements = await this.api.getAllPages('/api/v4/catalogs/' + Number(storage.catalog_id) + '/elements', 'elements', { limit: 250, maxPages: 20 });
        return elements.filter(function (element) { return !element.is_deleted; }).map(function (element) {
            return Rules.fromCatalogElement(element, storage);
        });
    };

    CatalogRepository.prototype.createRule = async function (storage, input) {
        var validation = Rules.validateRule(input);
        if (!validation.valid) {
            throw new StorageError(validation.errors.join('. '), 'INVALID_RULE', validation);
        }
        var rule = validation.rule;
        var response = await this.api.post('/api/v4/catalogs/' + Number(storage.catalog_id) + '/elements', [{
            name: rule.name,
            request_id: rule.uid,
            custom_fields_values: Rules.toCatalogFields(rule, storage)
        }]);
        var element = embedded(response, 'elements')[0];
        if (!element) {
            throw new StorageError('amoCRM не вернула созданное правило', 'CREATE_RULE_EMPTY', response);
        }
        rule.elementId = Number(element.id);
        rule.valid = true;
        rule.errors = [];
        return rule;
    };

    CatalogRepository.prototype.updateRule = async function (storage, currentInput, nextInput) {
        if (nextInput === undefined) {
            nextInput = currentInput;
        }
        var validation = Rules.validateRule(nextInput);
        var current = Rules.normalizeRule(currentInput);
        if (!validation.valid || !current.elementId) {
            throw new StorageError(validation.errors.join('. ') || 'Не указан element_id', 'INVALID_RULE', validation);
        }
        var rule = validation.rule;
        rule.elementId = current.elementId;
        var values = [
            ['rule_uid', current.uid, rule.uid],
            ['users', current.users, rule.users],
            ['pipelines', current.pipelines, rule.pipelines],
            ['customer_statuses', current.customerStatuses, rule.customerStatuses],
            ['show_modal', current.showModal, rule.showModal],
            ['deny_exit', current.denyExit, rule.denyExit],
            ['check_responsible', current.checkResponsible, rule.checkResponsible],
            ['customers', current.customers, rule.customers],
            ['enabled', current.enabled, rule.enabled],
            ['archived', current.archived, rule.archived]
        ];
        var changedKeys = values.filter(function (entry) {
            return JSON.stringify(entry[1]) !== JSON.stringify(entry[2]);
        }).map(function (entry) { return entry[0]; });
        if (!changedKeys.length && current.name === rule.name) {
            return rule;
        }
        var payload = { name: rule.name };
        if (changedKeys.length) {
            payload.custom_fields_values = Rules.toCatalogFields(rule, storage, changedKeys);
        }
        var response = await this.api.patch(
            '/api/v4/catalogs/' + Number(storage.catalog_id) + '/elements/' + rule.elementId,
            payload
        );
        var element = embedded(response, 'elements')[0] || response;
        if (element && element.id) {
            rule.elementId = Number(element.id);
        }
        rule.valid = true;
        rule.errors = [];
        return rule;
    };

    CatalogRepository.prototype.archiveRule = function (storage, input) {
        var rule = Rules.normalizeRule(input);
        rule.enabled = false;
        rule.archived = true;
        return this.updateRule(storage, input, rule);
    };

    CatalogRepository.prototype.createRulesBatch = async function (storage, rules) {
        var source = Array.isArray(rules) ? rules : [];
        var created = [];
        for (var offset = 0; offset < source.length; offset += 50) {
            var chunkRules = source.slice(offset, offset + 50).map(function (input) {
                var validation = Rules.validateRule(input);
                if (!validation.valid) {
                    throw new StorageError(validation.errors.join('. '), 'INVALID_RULE', validation);
                }
                return validation.rule;
            });
            var chunk = chunkRules.map(function (rule) {
                return {
                    name: rule.name,
                    request_id: rule.uid,
                    custom_fields_values: Rules.toCatalogFields(rule, storage)
                };
            });
            if (chunk.length) {
                var response = await this.api.post('/api/v4/catalogs/' + Number(storage.catalog_id) + '/elements', chunk);
                var responseElements = embedded(response, 'elements');
                var byRequestId = responseElements.reduce(function (result, element) {
                    if (element.request_id) { result[element.request_id] = element; }
                    return result;
                }, {});
                created = created.concat(chunkRules.map(function (rule, index) {
                    var element = byRequestId[rule.uid] || responseElements[index];
                    if (!element || !element.id) {
                        throw new StorageError('amoCRM не вернула ID восстановленного правила ' + rule.uid, 'RESTORE_RULE_EMPTY', response);
                    }
                    rule.elementId = Number(element.id);
                    rule.valid = true;
                    rule.errors = [];
                    return rule;
                }));
            }
        }
        return created;
    };

    CatalogRepository.prototype.restoreStorage = async function (snapshotRules) {
        var created = await this.createStorage();
        var rules = await this.createRulesBatch(created.storage, snapshotRules || []);
        return { catalog: created.catalog, storage: created.storage, rules: rules };
    };

    return {
        CatalogRepository: CatalogRepository,
        StorageError: StorageError,
        fieldDefinitionPayload: fieldDefinitionPayload,
        storageFromFields: storageFromFields,
        embedded: embedded
    };
}));
