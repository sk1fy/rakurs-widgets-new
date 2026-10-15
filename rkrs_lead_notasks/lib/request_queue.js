(function (root, factory) {
    if (typeof define === 'function') {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RkrsWtRequestQueue = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function QueueCancelledError(message) {
        this.name = 'QueueCancelledError';
        this.message = message || 'Request queue was cancelled';
        this.code = 'QUEUE_CANCELLED';
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, QueueCancelledError);
        }
    }
    QueueCancelledError.prototype = Object.create(Error.prototype);
    QueueCancelledError.prototype.constructor = QueueCancelledError;

    function statusOf(error) {
        return Number(error && (error.status || error.statusCode || error.httpStatus)) || 0;
    }

    function RequestQueue(options) {
        options = options || {};
        this.minInterval = Number(options.minInterval) || 1000;
        this.retry429 = options.retry429 || [1000, 2000];
        this.retry5xx = options.retry5xx === undefined ? 1 : Number(options.retry5xx);
        this.queue = [];
        this.deduped = new Map();
        this.processing = false;
        this.destroyed = false;
        this.lastStartedAt = 0;
        this.generation = 0;
        this.now = options.now || function () { return Date.now(); };
        this.setTimer = options.setTimer || function (callback, delay) {
            return setTimeout(callback, delay);
        };
    }

    RequestQueue.prototype._delay = function (milliseconds) {
        var self = this;
        return new Promise(function (resolve) {
            self.setTimer(resolve, Math.max(0, milliseconds));
        });
    };

    RequestQueue.prototype._waitForSlot = function (additionalDelay) {
        var sinceLastStart = this.now() - this.lastStartedAt;
        var intervalDelay = Math.max(0, this.minInterval - sinceLastStart);
        return this._delay(Math.max(intervalDelay, Number(additionalDelay) || 0));
    };

    RequestQueue.prototype._runItem = async function (item) {
        var attempt429 = 0;
        var attempt5xx = 0;
        var retryDelay = 0;

        while (true) {
            if (this.destroyed || item.generation !== this.generation) {
                throw new QueueCancelledError();
            }

            await this._waitForSlot(retryDelay);

            if (this.destroyed || item.generation !== this.generation) {
                throw new QueueCancelledError();
            }

            this.lastStartedAt = this.now();

            try {
                var result = await item.task({
                    attempt429: attempt429,
                    attempt5xx: attempt5xx
                });
                if (this.destroyed || item.generation !== this.generation) {
                    throw new QueueCancelledError();
                }
                return result;
            } catch (error) {
                if (this.destroyed || item.generation !== this.generation) {
                    throw new QueueCancelledError();
                }
                var status = statusOf(error);
                if (item.retry === false) { throw error; }
                if (status === 429 && attempt429 < this.retry429.length) {
                    retryDelay = this.retry429[attempt429];
                    attempt429 += 1;
                    continue;
                }
                if (status >= 500 && status <= 599 && attempt5xx < this.retry5xx) {
                    retryDelay = this.minInterval;
                    attempt5xx += 1;
                    continue;
                }
                throw error;
            }
        }
    };

    RequestQueue.prototype._drain = async function () {
        if (this.processing) {
            return;
        }

        this.processing = true;
        while (this.queue.length) {
            var item = this.queue.shift();
            try {
                item.resolve(await this._runItem(item));
            } catch (error) {
                item.reject(error);
            } finally {
                if (item.key && this.deduped.get(item.key) === item.promise) {
                    this.deduped.delete(item.key);
                }
            }
        }
        this.processing = false;
    };

    RequestQueue.prototype.enqueue = function (task, options) {
        options = options || {};
        var key = options.key || '';
        if (this.destroyed) {
            return Promise.reject(new QueueCancelledError());
        }
        if (key && this.deduped.has(key)) {
            return this.deduped.get(key);
        }

        var item = {
            task: task,
            key: key,
            retry: options.retry,
            generation: this.generation
        };
        item.promise = new Promise(function (resolve, reject) {
            item.resolve = resolve;
            item.reject = reject;
        });

        if (key) {
            this.deduped.set(key, item.promise);
        }
        this.queue.push(item);
        this._drain();
        return item.promise;
    };

    RequestQueue.prototype.cancelAll = function (reason) {
        this.generation += 1;
        var error = new QueueCancelledError(reason);
        this.queue.splice(0).forEach(function (item) {
            item.reject(error);
        });
        this.deduped.clear();
    };

    RequestQueue.prototype.destroy = function () {
        this.destroyed = true;
        this.cancelAll('Request queue was destroyed');
    };

    return {
        RequestQueue: RequestQueue,
        QueueCancelledError: QueueCancelledError
    };
}));
