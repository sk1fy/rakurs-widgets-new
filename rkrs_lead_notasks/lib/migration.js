(function (factory) {
    if (typeof define === 'function') { define([], function () { return factory; }); }
    else if (typeof module === 'object' && module.exports) { module.exports = factory; }
}(function (Constants, Rules, Snapshot) {
    'use strict';
    var MAX_BYTES = 1048576;
    function fail(code) { var error = new Error(code); error.code = code; throw error; }
    function bytes(value) { return unescape(encodeURIComponent(JSON.stringify(value))).length; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function id(value) { return /^[1-9][0-9]*$/.test(String(value)) && Number.isSafeInteger(Number(value)); }
    function strictIds(values) { return Array.isArray(values) && values.every(id); }
    function canonical(input) {
        var r = Rules.normalizeRule(input);
        return { ruleUid: r.uid, name: r.name, users: r.users.map(String), pipelines: r.pipelines.map(function (p) { return { pipelineId: String(p.pipeline_id), statusIds: p.status_ids.map(String) }; }),
            customerStatuses: r.customerStatuses.map(String), showModal: r.showModal, denyExit: r.denyExit, checkResponsible: r.checkResponsible, customers: r.customers, enabled: r.enabled, archived: r.archived };
    }
    function validateRules(rules) {
        if (!Array.isArray(rules) || rules.length > 1000) { fail('source_rules_incomplete'); }
        var seen = {};
        rules.forEach(function (r) {
            if (Rules.isUid(r.uid) && r.uid !== r.uid.toLowerCase()) { fail('source_noncanonical_uid'); }
            if (!Rules.isUid(r.uid) || seen[r.uid.toLowerCase()]) { fail('source_duplicate_or_missing_uid'); }
            seen[r.uid.toLowerCase()] = true;
            if (!strictIds(r.users) || !strictIds(r.customerStatuses || r.customer_statuses || []) || !Array.isArray(r.pipelines) || !r.pipelines.every(function (p) { return id(p.pipeline_id) && strictIds(p.status_ids); }) || !Rules.validateRule(r).valid || r.valid === false) { fail('source_invalid_rule'); }
        });
    }
    function runtime(value) {
        var parsed = typeof value === 'string' ? JSON.parse(value) : clone(value);
        if (typeof parsed === 'string') { parsed = JSON.parse(parsed); }
        if (!parsed || parsed.schema_version !== 1 || !parsed.storage || !id(parsed.storage.catalog_id)) { fail('source_invalid_runtime'); }
        validateRules(parsed.rules);
        if (!parsed.published || !Number.isSafeInteger(parsed.published.revision) || parsed.published.revision < 1 || parsed.published.hash !== Snapshot.hashRules(parsed.rules)) { fail('source_invalid_runtime_checksum'); }
        return parsed;
    }
    function Migration(options) {
        this.verifyStandalone = options.verifyStandalone; this.repository = options.repository; this.settings = options.settings; this.accountId = String(options.accountId);
        this.storage = options.storage; this.uuid = options.uuid || function () { return crypto.randomUUID(); }; this.now = options.now || Date.now;
    }
    Migration.prototype.missingCatalogRuntime = function (request, config, settings, error) {
        if (!config || String(config.storage.catalog_id) !== String(request.catalogId) || !config.storage.fields || Object.keys(config.storage.fields).length !== Constants.FIELD_KEYS.length || new Set(Object.values(config.storage.fields).map(String)).size !== Constants.FIELD_KEYS.length || !Constants.FIELD_KEYS.every(function (key) { return id(config.storage.fields[key]); })) { fail('source_invalid_runtime_storage'); }
        var raw = { runtimeConfig: settings.runtime_config, catalogReadError: { code: 'catalog_not_found', status: Number(error.status) } };
        var result = { complete: true, sourceChecksum: Snapshot.hashRules(config.rules), fetchedAt: new Date(this.now()).toISOString(), payload: { rules: config.rules.map(canonical), raw: raw, catalogId: String(request.catalogId), fieldIds: config.storage.fields, code: 'RKRS_WT_RULE_UID', discrepancies: [{ path: 'catalog', code: 'catalog_invalid', message: 'Каталог удалён; выбран полный опубликованный runtime_config' }] } };
        if (bytes(result) > MAX_BYTES - 16384) { fail('source_payload_too_large'); }
        this.backup(raw, settings);
        return result;
    };
    Migration.prototype.capture = async function (request) {
        if (!request || !id(request.catalogId)) { fail('source_invalid_catalog'); }
        var settings = this.settings(), config;
        try { config = runtime(settings.runtime_config); } catch (error) { if (request.kind === 'runtime_config') { throw error; } }
        var savedStorage = config && config.storage;
        var catalog, fields;
        try {
            catalog = await this.repository.verifyCatalog({ catalog_id: request.catalogId }, this.accountId);
            fields = await this.repository.api.getAllPages('/api/v4/catalogs/' + request.catalogId + '/custom_fields', 'custom_fields', { limit: 250, maxPages: 5, requireComplete: true });
        } catch (error) {
            if (request.kind === 'runtime_config' && [404, 410].includes(Number(error.status))) { return this.missingCatalogRuntime(request, config, settings, error); }
            throw error;
        }
        if (request.kind === 'runtime_config') {
            if (!config || String(config.storage.catalog_id) !== String(request.catalogId) || !config.storage.fields || Object.keys(config.storage.fields).length !== Constants.FIELD_KEYS.length || new Set(Object.values(config.storage.fields).map(String)).size !== Constants.FIELD_KEYS.length || !Constants.FIELD_KEYS.every(function (key) { return id(config.storage.fields[key]); })) { fail('source_invalid_runtime_storage'); }
            var runtimeElements;
            try { runtimeElements = await this.repository.api.getAllPages('/api/v4/catalogs/' + request.catalogId + '/elements', 'elements', { limit: 250, maxPages: 5, requireComplete: true }); }
            catch (error) { if ([404, 410].includes(Number(error.status))) { return this.missingCatalogRuntime(request, config, settings, error); } throw error; }
            var runtimeDiscrepancies = [];
            try {
                var actualStorage = this.repository.storageFromFields(catalog, fields);
                var catalogRules = runtimeElements.filter(function (e) { return !e.is_deleted; }).map(function (e) { return Rules.fromCatalogElement(e, actualStorage); });
                validateRules(catalogRules);
                if (Snapshot.hashRules(catalogRules) !== Snapshot.hashRules(config.rules)) { runtimeDiscrepancies.push({ path: 'runtime_config', code: 'catalog_runtime_divergence', message: 'runtime=' + Snapshot.hashRules(config.rules) + '; catalog=' + Snapshot.hashRules(catalogRules) }); }
            } catch (error) { runtimeDiscrepancies.push({ path: 'catalog', code: 'catalog_invalid', message: 'Каталог содержит повреждённые правила; выбран опубликованный runtime_config' }); }
            var runtimeResult = { complete: true, sourceChecksum: Snapshot.hashRules(config.rules), fetchedAt: new Date(this.now()).toISOString(), payload: { rules: config.rules.map(canonical), raw: { catalog: catalog, fields: fields, elements: runtimeElements, runtimeConfig: settings.runtime_config }, catalogId: String(request.catalogId), fieldIds: config.storage.fields, code: 'RKRS_WT_RULE_UID', discrepancies: runtimeDiscrepancies } };
            if (bytes(runtimeResult) > MAX_BYTES - 16384) { fail('source_payload_too_large'); }
            this.backup(runtimeResult.payload.raw, settings);
            return runtimeResult;
        }
        var codes = {}, fieldIDs = {};
        fields.forEach(function (field) {
            if (!id(field.id) || fieldIDs[field.id]) { fail('source_duplicate_field'); } fieldIDs[field.id] = true;
            if (Constants.FIELD_BY_CODE[field.code]) { if (codes[field.code]) { fail('source_duplicate_code'); } codes[field.code] = field; }
        });
        Constants.FIELD_DEFINITIONS.forEach(function (definition) {
            var f = codes[definition.code];
            if (!f || f.type !== definition.type || savedStorage && Number(savedStorage.catalog_id) === Number(request.catalogId) && Number(savedStorage.fields[definition.key]) !== Number(f.id)) { fail('source_field_mismatch'); }
            if (definition.type === 'select') {
                var values = (f.enums || []).map(function (e) { return String(e.value); });
                if (values.filter(function (v) { return v === '0'; }).length !== 1 || values.filter(function (v) { return v === '1'; }).length !== 1) { fail('source_invalid_boolean_schema'); }
            }
        });
        var metadata = this.repository.storageFromFields(catalog, fields);
        var elements = await this.repository.api.getAllPages('/api/v4/catalogs/' + request.catalogId + '/elements', 'elements', { limit: 250, maxPages: 5, requireComplete: true });
        var seen = {};
        elements.forEach(function (element) {
            if (!id(element.id) || seen[element.id]) { fail('source_duplicate_element'); } seen[element.id] = true;
            if (element.is_deleted) { return; }
            var values = {};
            (element.custom_fields_values || []).forEach(function (field) {
                if (values[field.field_id]) { fail('source_duplicate_value'); } values[field.field_id] = field;
                if (field.field_code && codes[field.field_code] && Number(codes[field.field_code].id) !== Number(field.field_id)) { fail('source_field_mismatch'); }
            });
            Constants.FIELD_DEFINITIONS.forEach(function (definition) {
                var f = values[metadata.fields[definition.key]];
                if (!f || !Array.isArray(f.values) || f.values.length !== 1) { fail('source_missing_value'); }
                var value = f.values[0];
                if (definition.type === 'select' && !['0', '1'].includes(String(value.value)) && ![metadata.enums[definition.key].true, metadata.enums[definition.key].false].includes(Number(value.enum_id))) { fail('source_invalid_boolean'); }
                if (['users', 'customer_statuses', 'pipelines'].includes(definition.key)) {
                    var raw = typeof value.value === 'string' ? JSON.parse(value.value) : value.value;
                    if (definition.key === 'pipelines' ? !Array.isArray(raw) || !raw.every(function (p) { return id(p.pipeline_id) && strictIds(p.status_ids); }) : !strictIds(raw)) { fail('source_invalid_ids'); }
                }
            });
        });
        var rules = elements.filter(function (e) { return !e.is_deleted; }).map(function (e) { return Rules.fromCatalogElement(e, metadata); });
        validateRules(rules);
        var checksum = Snapshot.hashRules(rules), discrepancies = [];
        if (!config) { discrepancies.push({ path: 'runtime_config', code: 'runtime_config_invalid', message: 'Опубликованный runtime_config отсутствует или повреждён; выбран каталог' }); }
        else if (Snapshot.hashRules(config.rules) !== checksum || Number(config.storage.catalog_id) !== Number(request.catalogId)) { discrepancies.push({ path: 'runtime_config', code: 'catalog_runtime_divergence', message: 'runtime=' + Snapshot.hashRules(config.rules) + '; catalog=' + checksum }); }
        var selected = request.kind === 'runtime_config' ? config.rules : rules;
        var result = { complete: true, sourceChecksum: Snapshot.hashRules(selected), fetchedAt: new Date(this.now()).toISOString(), payload: { rules: selected.map(canonical), raw: { catalog: catalog, fields: fields, elements: elements, runtimeConfig: settings.runtime_config }, catalogId: String(request.catalogId), fieldIds: metadata.fields, code: 'RKRS_WT_RULE_UID', discrepancies: discrepancies } };
        if (bytes(result) > MAX_BYTES - 16384) { fail('source_payload_too_large'); }
        this.backup(result.payload.raw, settings);
        return result;
    };
    Migration.prototype.backup = function (raw, settings) {
        if (!this.storage || typeof this.storage.setItem !== 'function') { fail('migration_backup_unavailable'); }
        var backup = { schemaVersion: 1, accountId: this.accountId, createdAt: new Date(this.now()).toISOString(), settings: { runtime_config: settings.runtime_config, teamos_enabled: settings.teamos_enabled, version: settings.version }, source: raw };
        var key = 'rkrs-wt-migration:' + this.accountId + ':' + this.uuid();
        var encoded = JSON.stringify(backup);
        if (this.storage.getItem(key) !== null) { fail('migration_backup_exists'); }
        try { this.storage.setItem(key, encoded); if (this.storage.getItem(key) !== encoded) { fail('migration_backup_unavailable'); } }
        catch (error) { fail('migration_backup_unavailable'); }
        return key;
    };
    // A runtime session only contains the current actor's projection. It must
    // never be used to reconstruct a complete autonomous configuration.
    Migration.prototype.prepareStandalone = async function (receipt, confirmation) {
        var fullExport = receipt && receipt.export;
        if (receipt && bytes(receipt) > MAX_BYTES) { fail('source_payload_too_large'); }
        if (!receipt || receipt.state !== 'completed' || receipt.targetMode !== 'standalone' || !receipt.scope || !fullExport || !fullExport.scope || !['companyId', 'accountId', 'bindingId', 'bindingRevision', 'installationId', 'integrationId', 'product', 'generation'].every(function (key) { return receipt.scope[key] === fullExport.scope[key]; }) || !Number.isSafeInteger(fullExport.scope.modeEpoch) || receipt.scope.modeEpoch !== fullExport.scope.modeEpoch + 1 || !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.expiresAt) <= this.now()) { fail('migration_mode_receipt_required'); }
        if (typeof this.verifyStandalone !== 'function') { fail('migration_mode_verification_required'); }
        await this.verifyStandalone(receipt.scope);
        if (!confirmation || confirmation.confirm !== true) { fail('migration_confirmation_required'); }
        if (!fullExport || fullExport.complete !== true || fullExport.projection !== 'full' || !fullExport.scope || String(fullExport.scope.accountId) !== this.accountId || fullExport.targetMode !== 'standalone' || !Array.isArray(fullExport.runtimeRules) || !Number.isFinite(Date.parse(fullExport.expiresAt)) || Date.parse(fullExport.expiresAt) <= this.now()) { fail('migration_full_export_required'); }
        if (fullExport.dynamicLoss === true && confirmation.acceptDynamicLoss !== true) { fail('migration_dynamic_loss_confirmation_required'); }
        validateRules(fullExport.runtimeRules);
        if (Snapshot.hashRules(fullExport.runtimeRules) !== fullExport.exportChecksum) { fail('migration_export_checksum_mismatch'); }
        if (!fullExport.runtimeRules.length && confirmation.confirmEmpty !== true) { fail('migration_empty_confirmation_required'); }
        var before = JSON.stringify(this.settings());
        var original = this.settings(), parsed = runtime(original.runtime_config);
        var snapshot = await this.capture({ kind: 'runtime_config', catalogId: String(parsed.storage.catalog_id) });
        var backupKey = this.backup(snapshot.payload.raw, original);
        // A separate catalog makes partial CRM writes harmless to the running
        // autonomous catalog. The saved runtime setting changes only on Save.
        var restored = await this.repository.restoreStorage(fullExport.runtimeRules);
        if (JSON.stringify(this.settings()) !== before) { fail('migration_source_changed'); }
        var reread = await this.repository.getRules(restored.storage);
        validateRules(reread);
        if (Snapshot.hashRules(reread) !== fullExport.exportChecksum) { fail('migration_write_verification_failed'); }
        var sourceAfter = await this.capture({ kind: 'runtime_config', catalogId: String(parsed.storage.catalog_id) });
        if (JSON.stringify(sourceAfter.payload.raw) !== JSON.stringify(snapshot.payload.raw) || JSON.stringify(this.settings()) !== before) { fail('migration_source_changed'); }
        await this.verifyStandalone(receipt.scope);
        return { scope: receipt.scope, backupKey: backupKey, config: Snapshot.compile(restored.storage, reread, parsed.published), expectedSettings: before, dynamicRulesFrozen: fullExport.dynamicLoss === true };
    };
    return { Migration: Migration, validateRules: validateRules, canonical: canonical, runtime: runtime, bytes: bytes };
}));
