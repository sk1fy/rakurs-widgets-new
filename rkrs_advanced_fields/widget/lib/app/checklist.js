define([], function () {
    'use strict';

    var SUFFIX_RE = /\s*(?:\{:\s*(checklist|percent)\s*\}|\{:\s*tag\s+([^}]+)\}|\{!([^}]+)\})\s*$/i;

    function peelSuffix(label) {
        var match = String(label).match(SUFFIX_RE);
        if (!match) return null;
        var result = { label: String(label).slice(0, match.index).trim() };
        if (match[1]) result[match[1].toLowerCase()] = true;
        if (match[2]) result.tag = match[2].trim();
        if (match[3]) result.advice = match[3].trim();
        return result;
    }

    function parseOption(text) {
        var label = String(text || '').trim();
        var suffix = peelSuffix(label);
        var advice = '';
        if (suffix && suffix.advice) {
            advice = suffix.advice;
            label = suffix.label;
        }
        var match = label.match(/^\[([+-])\]\s*/);
        return {
            label: match ? label.slice(match[0].length).trim() : label,
            status: match ? (match[1] === '+' ? 'done' : 'blocked') : 'pending',
            advice: advice,
            marked: !!match
        };
    }

    function summarize(items) {
        var done = 0;
        var blocked = 0;
        var next = null;
        for (var i = 0; i < items.length; i++) {
            if (items[i].status === 'done') done++;
            else if (items[i].status === 'blocked') blocked++;
            if (items[i].status !== 'done' && (!next ||
                (next.status !== 'blocked' && items[i].status === 'blocked'))) {
                next = items[i];
            }
        }
        return {
            total: items.length,
            done: done,
            blocked: blocked,
            complete: items.length > 0 && done === items.length,
            percent: items.length ? Math.round(done * 100 / items.length) : 0,
            next: next
        };
    }

    function getAdviceItems(items, next) {
        return items.filter(function (item) {
            return !!item.answerAdvice || item === next && !!(item.loading || item.metadataFailed);
        })
            .sort(function (a, b) {
                return (b.status === 'blocked' ? 1 : 0) - (a.status === 'blocked' ? 1 : 0);
            });
    }

    return {
        hasMarkers: function (label) { return SUFFIX_RE.test(label); },
        peelSuffix: peelSuffix,
        parseOption: parseOption,
        getAdviceItems: getAdviceItems,
        summarize: summarize
    };
});
