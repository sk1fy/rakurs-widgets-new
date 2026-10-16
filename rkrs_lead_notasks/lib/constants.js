(function (root, factory) {
    if (typeof define === 'function') {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RkrsWtConstants = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var FIELD_DEFINITIONS = [
        { key: 'rule_uid', code: 'RKRS_WT_RULE_UID', name: 'UID правила', type: 'text' },
        { key: 'users', code: 'RKRS_WT_USERS', name: 'Пользователи (JSON)', type: 'text' },
        { key: 'pipelines', code: 'RKRS_WT_PIPELINES', name: 'Воронки и этапы (JSON)', type: 'text' },
        { key: 'customer_statuses', code: 'RKRS_WT_CUSTOMER_STATUSES', name: 'Статусы покупателей (JSON)', type: 'text' },
        { key: 'show_modal', code: 'RKRS_WT_SHOW_MODAL', name: 'Показывать окно', type: 'select' },
        { key: 'deny_exit', code: 'RKRS_WT_DENY_EXIT', name: 'Запрещать выход', type: 'select' },
        { key: 'check_responsible', code: 'RKRS_WT_CHECK_RESP', name: 'Проверять ответственного', type: 'select' },
        { key: 'customers', code: 'RKRS_WT_CUSTOMERS', name: 'Применять к покупателям', type: 'select' },
        { key: 'enabled', code: 'RKRS_WT_ENABLED', name: 'Правило активно', type: 'select' },
        { key: 'archived', code: 'RKRS_WT_ARCHIVED', name: 'Правило архивировано', type: 'select' }
    ];

    var FIELD_KEYS = FIELD_DEFINITIONS.map(function (field) {
        return field.key;
    });

    var FIELD_BY_CODE = FIELD_DEFINITIONS.reduce(function (result, field) {
        result[field.code] = field;
        return result;
    }, {});

    return {
        APP_NAME: 'rkrs_lead_notasks',
        BUILD_VERSION: '1.2.2',
        EVENT_NAMESPACE: '.rkrs_lead_notasks',
        STYLE_ID: 'rkrs-lead-notasks-style',
        CATALOG_NAME: '_ПРАВИЛА_ЗАПРЕТ_СДЕЛОК_БЕЗ_ЗАДАЧ',
        CATALOG_LIMIT: 10,
        SCHEMA_VERSION: 1,
        REQUEST_INTERVAL_MS: 1000,
        TASK_CACHE_TTL_MS: 30000,
        FIELD_DEFINITIONS: FIELD_DEFINITIONS,
        FIELD_KEYS: FIELD_KEYS,
        FIELD_BY_CODE: FIELD_BY_CODE,
        RUNTIME_SETTING_NAME: 'runtime_config',
        TASK_STATE: {
            HAS_TASK: 'HAS_TASK',
            NO_TASK: 'NO_TASK',
            UNKNOWN: 'UNKNOWN'
        }
    };
}));
