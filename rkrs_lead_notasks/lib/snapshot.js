(function (root, factory) {
    if (typeof define === 'function') {
        define([], function () { return factory; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./constants'), require('./rules'));
    } else {
        root.RkrsWtSnapshot = factory(root.RkrsWtConstants, root.RkrsWtRules);
    }
}(typeof self !== 'undefined' ? self : this, function (Constants, Rules) {
    'use strict';

    function stableRule(input) {
        var rule = Rules.normalizeRule(input);
        return {
            uid: rule.uid,
            name: rule.name,
            users: rule.users,
            pipelines: rule.pipelines.map(function (pipeline) {
                return {
                    pipeline_id: pipeline.pipeline_id,
                    status_ids: pipeline.status_ids
                };
            }),
            customer_statuses: rule.customerStatuses,
            show_modal: rule.showModal,
            deny_exit: rule.denyExit,
            check_responsible: rule.checkResponsible,
            customers: rule.customers,
            enabled: rule.enabled,
            archived: rule.archived
        };
    }

    function normalizeRules(rules) {
        return (Array.isArray(rules) ? rules : []).map(stableRule).sort(function (a, b) {
            return a.uid.localeCompare(b.uid);
        });
    }

    function canonicalRulesJson(rules) {
        return JSON.stringify(normalizeRules(rules));
    }

    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }

    // Small synchronous SHA-256 implementation so publishing also works in
    // older amoCRM webviews where SubtleCrypto is unavailable.
    function sha256(text) {
        var ascii = unescape(encodeURIComponent(String(text)));
        var byteLength = ascii.length;
        var maxWord = Math.pow(2, 32);
        var words = [];
        var hash = sha256._hash || [];
        var constants = sha256._constants || [];
        var primeCounter = constants.length;
        var candidate = 2;

        function isPrime(number) {
            var factor;
            for (factor = 2; factor * factor <= number; factor += 1) {
                if (number % factor === 0) {
                    return false;
                }
            }
            return true;
        }

        while (primeCounter < 64) {
            if (isPrime(candidate)) {
                if (primeCounter < 8) {
                    hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
                }
                constants[primeCounter] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
                primeCounter += 1;
            }
            candidate += 1;
        }
        sha256._hash = hash;
        sha256._constants = constants;

        ascii += '\x80';
        while (ascii.length % 64 !== 56) {
            ascii += '\x00';
        }
        for (var index = 0; index < ascii.length; index += 1) {
            var character = ascii.charCodeAt(index);
            if (character >> 8) {
                throw new Error('SHA-256 accepts UTF-8 bytes only');
            }
            words[index >> 2] |= character << (((3 - index) % 4) * 8);
        }
        var bitLength = byteLength * 8;
        words[words.length] = Math.floor(bitLength / maxWord);
        words[words.length] = bitLength;

        var workingHash = hash.slice(0);
        for (var block = 0; block < words.length; block += 16) {
            var oldHash = workingHash.slice(0);
            var schedule = words.slice(block, block + 16);
            for (var round = 0; round < 64; round += 1) {
                var w15 = schedule[round - 15];
                var w2 = schedule[round - 2];
                var a = workingHash[0];
                var e = workingHash[4];
                var temp1 = workingHash[7] +
                    (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
                    ((e & workingHash[5]) ^ ((~e) & workingHash[6])) +
                    constants[round] +
                    (schedule[round] = round < 16 ? schedule[round] : (
                        schedule[round - 16] +
                        (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                        schedule[round - 7] +
                        (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                    ) | 0);
                var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
                    ((a & workingHash[1]) ^ (a & workingHash[2]) ^ (workingHash[1] & workingHash[2]));
                workingHash = [(temp1 + temp2) | 0].concat(workingHash);
                workingHash[4] = (workingHash[4] + temp1) | 0;
                workingHash.pop();
            }
            for (var hashIndex = 0; hashIndex < 8; hashIndex += 1) {
                workingHash[hashIndex] = (workingHash[hashIndex] + oldHash[hashIndex]) | 0;
            }
        }

        return workingHash.map(function (value) {
            return ('00000000' + (value >>> 0).toString(16)).slice(-8);
        }).join('');
    }

    function hashRules(rules) {
        return sha256(canonicalRulesJson(rules));
    }

    function parseJson(value) {
        if (value === undefined || value === null || value === '') {
            return null;
        }
        if (typeof value === 'object') {
            return value;
        }
        try {
            var parsed = JSON.parse(String(value));
            if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
            }
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function parseRuntimeConfig(value) {
        var source = parseJson(value);
        var errors = [];
        var fatal = false;
        if (!source || typeof source !== 'object') {
            return { valid: false, fatal: true, errors: ['Настройка runtime_config отсутствует или повреждена'], config: null, rules: [] };
        }
        if (Number(source.schema_version) !== Constants.SCHEMA_VERSION) {
            errors.push('Неподдерживаемая версия схемы: ' + source.schema_version);
            fatal = true;
        }
        if (!source.storage || !Number(source.storage.catalog_id)) {
            errors.push('Не указан catalog_id');
        }
        if (!source.storage || !source.storage.fields) {
            errors.push('Не сохранена карта полей каталога');
        }
        var rules = [];
        (Array.isArray(source.rules) ? source.rules : []).forEach(function (input) {
            var validation = Rules.validateRule(input);
            if (validation.valid) {
                rules.push(validation.rule);
            } else {
                errors.push('Правило ' + (input && (input.name || input.uid) || 'без названия') + ': ' + validation.errors.join(', '));
            }
        });
        if (source.published && source.published.hash && hashRules(source.rules || []) !== source.published.hash) {
            errors.push('Hash опубликованных правил не совпадает с содержимым snapshot');
            fatal = true;
        }
        return { valid: errors.length === 0, fatal: fatal, errors: errors, config: source, rules: fatal ? [] : rules };
    }

    function compile(storage, rules, published) {
        var normalized = normalizeRules(rules);
        var previousRevision = Number(published && published.revision) || 0;
        return {
            schema_version: Constants.SCHEMA_VERSION,
            storage: storage,
            published: {
                revision: previousRevision + 1,
                hash: hashRules(normalized),
                published_at: Math.floor(Date.now() / 1000)
            },
            rules: normalized
        };
    }

    function empty(storage) {
        return compile(storage, [], { revision: 0 });
    }

    return {
        stableRule: stableRule,
        normalizeRules: normalizeRules,
        canonicalRulesJson: canonicalRulesJson,
        sha256: sha256,
        hashRules: hashRules,
        parseRuntimeConfig: parseRuntimeConfig,
        compile: compile,
        empty: empty
    };
}));
