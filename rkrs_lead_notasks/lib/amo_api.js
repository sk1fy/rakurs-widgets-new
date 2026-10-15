(function (root, factory) {
    if (typeof define === 'function') {
        define([], function () { return factory; });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./request_queue'));
    } else {
        root.RkrsWtAmoApi = factory(root.RkrsWtRequestQueue);
    }
}(typeof self !== 'undefined' ? self : this, function (QueueModule) {
    'use strict';

    function ApiError(message, options) {
        options = options || {};
        this.name = 'ApiError';
        this.message = message || 'amoCRM API request failed';
        this.status = Number(options.status) || 0;
        this.code = options.code || 'API_ERROR';
        this.response = options.response;
        this.path = options.path || '';
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ApiError);
        }
    }
    ApiError.prototype = Object.create(Error.prototype);
    ApiError.prototype.constructor = ApiError;

    function appendQuery(path, params) {
        if (!params) {
            return path;
        }
        var pairs = [];
        Object.keys(params).forEach(function (key) {
            var value = params[key];
            if (value === undefined || value === null || value === '') {
                return;
            }
            if (Array.isArray(value)) {
                value.forEach(function (entry) {
                    pairs.push(encodeURIComponent(key + '[]') + '=' + encodeURIComponent(entry));
                });
                return;
            }
            pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
        });
        if (!pairs.length) {
            return path;
        }
        return path + (path.indexOf('?') === -1 ? '?' : '&') + pairs.join('&');
    }

    function AmoApiClient($, options) {
        options = options || {};
        if (!$ || typeof $.ajax !== 'function') {
            throw new Error('AmoApiClient requires jQuery.ajax');
        }
        this.$ = $;
        this.queue = options.queue || new QueueModule.RequestQueue(options.queueOptions);
        this.requests = new Set();
        this.destroyed = false;
    }

    AmoApiClient.prototype._ajax = function (method, path, body) {
        var self = this;
        return new Promise(function (resolve, reject) {
            if (self.destroyed) {
                reject(new ApiError('API client was destroyed', { code: 'CLIENT_DESTROYED', path: path }));
                return;
            }

            var options = {
                url: path,
                method: method,
                dataType: 'json',
                headers: { Accept: 'application/hal+json, application/json' }
            };
            if (body !== undefined && body !== null) {
                options.contentType = 'application/json';
                options.processData = false;
                options.data = JSON.stringify(body);
            }

            var xhr = self.$.ajax(options);
            self.requests.add(xhr);
            xhr.done(function (data) {
                self.requests.delete(xhr);
                resolve(data === undefined ? null : data);
            });
            xhr.fail(function (jqXHR, textStatus, errorThrown) {
                self.requests.delete(xhr);
                var response = jqXHR && (jqXHR.responseJSON || jqXHR.responseText);
                var status = Number(jqXHR && jqXHR.status) || 0;
                var code = textStatus === 'abort' ? 'ABORTED' : 'HTTP_' + status;
                reject(new ApiError(errorThrown || textStatus || 'amoCRM API request failed', {
                    status: status,
                    code: code,
                    response: response,
                    path: path
                }));
            });
        });
    };

    AmoApiClient.prototype.request = function (method, path, options) {
        options = options || {};
        method = String(method || 'GET').toUpperCase();
        var url = appendQuery(path, options.query);
        var key = options.dedupeKey;
        if (key === undefined && method === 'GET') {
            key = method + ':' + url;
        }
        var self = this;
        return this.queue.enqueue(function () {
            return self._ajax(method, url, options.body);
        }, { key: key, retry: options.retry });
    };

    AmoApiClient.prototype.get = function (path, query, dedupeKey) {
        return this.request('GET', path, { query: query, dedupeKey: dedupeKey });
    };

    AmoApiClient.prototype.post = function (path, body, options) {
        return this.request('POST', path, { body: body, dedupeKey: '', retry: options && options.retry });
    };

    AmoApiClient.prototype.patch = function (path, body) {
        return this.request('PATCH', path, { body: body, dedupeKey: '' });
    };

    AmoApiClient.prototype.getAllPages = async function (path, embeddedKey, options) {
        options = options || {};
        var maxPages = Number(options.maxPages) || 20;
        var page = 1;
        var result = [];
        while (page <= maxPages) {
            var query = Object.assign({}, options.query || {}, { page: page, limit: options.limit || 250 });
            var response = await this.get(path, query, 'PAGE:' + path + ':' + page + ':' + JSON.stringify(query));
            var values = response && response._embedded && response._embedded[embeddedKey];
            if (options.requireComplete && response && !Array.isArray(values)) {
                throw new ApiError('Invalid paginated response', { code: 'INVALID_RESPONSE', path: path });
            }
            if (Array.isArray(values)) {
                result = result.concat(values);
            }
            if (!response || !response._links || !response._links.next) {
                break;
            }
            if (page === maxPages && options.requireComplete) {
                throw new ApiError('Pagination limit reached before all results were read', { code: 'INCOMPLETE_PAGINATION', path: path });
            }
            page += 1;
        }
        return result;
    };

    AmoApiClient.prototype.abortAll = function () {
        this.requests.forEach(function (xhr) {
            if (xhr && typeof xhr.abort === 'function') {
                xhr.abort();
            }
        });
        this.requests.clear();
        this.queue.cancelAll('API requests were aborted');
    };

    AmoApiClient.prototype.destroy = function () {
        this.destroyed = true;
        this.abortAll();
        this.queue.destroy();
    };

    return {
        AmoApiClient: AmoApiClient,
        ApiError: ApiError,
        appendQuery: appendQuery
    };
}));
