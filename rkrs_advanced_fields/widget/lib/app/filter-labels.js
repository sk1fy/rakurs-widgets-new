define([], function () {
    'use strict';

    var ROOT = '.filter__form, .filter-search';
    var FIELD = '.filter__custom_settings__item';
    var ATTRIBUTES = ['placeholder', 'data-before', 'data-title-before', 'title', 'aria-label'];
    var ATTRIBUTE_SELECTOR = ATTRIBUTES.map(function (name) { return '[' + name + ']'; }).join(',');
    var TEXT_SELECTOR = [
        '.date_filter__period',
        '.date_filter__period_item .custom_select__title',
        '.control--select--list--item-inner',
        '.control--select--button-inner',
        '.checkboxes_dropdown__label_title',
        '.checkboxes_dropdown__title-item',
        '.control-select__option',
        '.control-select__list__item',
        'option[value]'
    ].join(',');

    return function (document, removeMarkers) {
        var changes = new Map();
        var observer = null;
        var timer = null;
        var view = document.defaultView;

        function clean(value) {
            var result = removeMarkers(value);
            if (result === value) return value;
            result = result.replace(/\s+(:\s*)$/, '$1');
            // A field with a marker-only name must still have a visible caption.
            if (!result.trim() || result.trim() === ':') return value;
            return value.match(/^\s*/)[0] + result.trim() + value.match(/\s*$/)[0];
        }

        function update(node, attribute) {
            var original = attribute ? node.getAttribute(attribute) : node.nodeValue;
            if (!original) return;
            var label = clean(original);
            if (label === original) return;
            var records = changes.get(node) || {};
            records[attribute || 'text'] = { original: original, clean: label };
            changes.set(node, records);
            if (attribute) node.setAttribute(attribute, label);
            else node.nodeValue = label;
        }

        function scan() {
            changes.forEach(function (_, node) { if (!node.isConnected) changes.delete(node); });
            document.querySelectorAll(ROOT).forEach(function (root) {
                root.querySelectorAll(ATTRIBUTE_SELECTOR).forEach(function (element) {
                    if (!element.closest(FIELD) || element.closest('.card-cf__inner, [contenteditable="true"]')) return;
                    ATTRIBUTES.forEach(function (attribute) { update(element, attribute); });
                });
                root.querySelectorAll(TEXT_SELECTOR).forEach(function (element) {
                    if (!element.closest(FIELD) || element.closest('.card-cf__inner, [contenteditable="true"]')) return;
                    // Keep inputs, option IDs and event handlers intact; only edit caption text nodes.
                    var walker = document.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
                    var node;
                    while ((node = walker.nextNode())) {
                        if (!node.parentElement.closest('input, textarea, script, style, [contenteditable="true"]')) update(node, null);
                    }
                });
            });
        }

        function relevant(mutation) {
            var element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
            if (element && element.closest(ROOT)) return true;
            return Array.prototype.some.call(mutation.addedNodes || [], function (node) {
                return node.nodeType === 1 && (node.matches(ROOT) || node.querySelector(ROOT));
            });
        }

        return {
            start: function () {
                if (observer || !document.body) return;
                scan();
                observer = new view.MutationObserver(function (mutations) {
                    if (timer !== null || !mutations.some(relevant)) return;
                    timer = view.setTimeout(function () { timer = null; scan(); }, 0);
                });
                observer.observe(document.body, {
                    subtree: true, childList: true, characterData: true,
                    attributes: true, attributeFilter: ATTRIBUTES
                });
            },
            stop: function () {
                if (observer) observer.disconnect();
                observer = null;
                if (timer !== null) view.clearTimeout(timer);
                timer = null;
                changes.forEach(function (records, node) {
                    Object.keys(records).forEach(function (attribute) {
                        var record = records[attribute];
                        var current = attribute === 'text' ? node.nodeValue : node.getAttribute(attribute);
                        if (current !== record.clean) return;
                        if (attribute === 'text') node.nodeValue = record.original;
                        else node.setAttribute(attribute, record.original);
                    });
                });
                changes.clear();
            }
        };
    };
});
