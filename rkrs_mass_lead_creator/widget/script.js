/** rkrs_mass_lead_creator — тонкий AMD-загрузчик прототипа. UI находится в UMD-бандле. */
define([], function () {
    var ASSETS = '__RKRS_MASS_LEADS_ASSETS_URL__';
    var appPromise = null;
    var loadedApp = null;
    var nextInstanceId = 0;
    var LOAD_TIMEOUT = 15000;

    function timeout(promise, onTimeout) {
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () {
                if (onTimeout) { onTimeout(); }
                reject(new Error('Превышено время ожидания загрузки'));
            }, LOAD_TIMEOUT);
            promise.then(function (value) {
                clearTimeout(timer);
                resolve(value);
            }, function (error) {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    function validateApp(app) {
        ['registerWidgetInstance', 'mountPanel', 'openSettings', 'unmountAll'].forEach(function (key) {
            if (!app || typeof app[key] !== 'function') {
                throw new Error('Некорректный модуль: ' + key);
            }
        });
        return app;
    }

    function loadApp() {
        if (appPromise) { return appPromise; }
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var bundleUrl;
        var request = Promise.resolve().then(function () {
            var options = { cache: 'no-cache' };
            if (controller) { options.signal = controller.signal; }
            return fetch(ASSETS + '/release.json', options);
        }).then(function (response) {
            if (!response.ok) { throw new Error('release HTTP ' + response.status); }
            return response.json();
        });
        var attempt = timeout(request, function () {
            if (controller) { controller.abort(); }
        }).then(function (release) {
            if (!release || typeof release.js !== 'string'
                || !/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*\.js$/.test(release.js)
                || release.js.split('/').some(function (part) { return !part || part === '.' || part === '..'; })) {
                throw new Error('Некорректное поле release.js');
            }
            bundleUrl = ASSETS + '/' + release.js;
            return timeout(new Promise(function (resolve, reject) {
                require([bundleUrl], resolve, reject);
            }));
        }).then(validateApp).then(function (app) {
            loadedApp = app;
            return app;
        });
        appPromise = attempt;
        attempt.catch(function () {
            if (appPromise === attempt) {
                appPromise = null;
                if (bundleUrl && typeof require.undef === 'function') {
                    try { require.undef(bundleUrl); } catch (ignored) { /* Повторная попытка всё равно доступна. */ }
                }
            }
        });
        return attempt;
    }

    function constant(name) {
        try { return typeof AMOCRM !== 'undefined' && AMOCRM.constant(name); }
        catch (ignored) { return null; }
    }

    return function () {
        var self = this;
        var instanceId = ++nextInstanceId;
        var alive = true;
        var generation = 0;
        var registeredGeneration = -1;
        var registrationPromise = null;
        var errorNode = null;
        self.appName = 'rkrs_mass_lead_creator';

        function clearError() {
            if (errorNode && errorNode.parentNode) { errorNode.parentNode.removeChild(errorNode); }
            errorNode = null;
        }

        function showError(error, target) {
            try {
                if (typeof console !== 'undefined') { console.error('[rkrs_mass_lead_creator] Ошибка загрузки прототипа:', error); }
                if (typeof document === 'undefined') { return; }
                if (!errorNode) {
                    errorNode = document.createElement('div');
                    errorNode.id = 'rkrs-mass-leads-loader-error-' + instanceId;
                    errorNode.className = 'rkrs-mass-leads-loader-error';
                    errorNode.setAttribute('role', 'status');
                    errorNode.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9999;max-width:320px;padding:14px 18px;border:1px solid #ff7979;border-radius:10px;background:#193247;color:#fff;font:14px/1.5 Arial,sans-serif;';
                    errorNode.textContent = 'Ракурс: не удалось загрузить прототип. Следующее открытие виджета повторит попытку.';
                    (target || document.body).appendChild(errorNode);
                }
            } catch (ignored) { /* Ошибка прототипа не должна влиять на CRM. */ }
        }

        function context(settingsTarget) {
            var account = constant('account') || {};
            var user = constant('user') || {};
            var area = '';
            try { area = AMOCRM.widgets.system.area || ''; } catch (ignored) { /* Preview без CRM. */ }
            return {
                widget: self,
                accountId: account.id || null,
                userId: user.id || constant('user_id') || null,
                subdomain: account.subdomain || '',
                area: area,
                settingsTarget: settingsTarget || null
            };
        }

        function run(method, settingsTarget) {
            if (!alive) { return; }
            var scheduledGeneration = generation;
            loadApp().then(function (app) {
                if (!alive || scheduledGeneration !== generation) { return; }
                if (registeredGeneration !== generation) {
                    registrationPromise = Promise.resolve(app.registerWidgetInstance(self)).catch(function (error) {
                        if (registeredGeneration === scheduledGeneration) { registeredGeneration = -1; }
                        throw error;
                    });
                    registeredGeneration = generation;
                }
                return registrationPromise.then(function () {
                    if (!alive || scheduledGeneration !== generation) { return; }
                    clearError();
                    return app[method](context(settingsTarget));
                });
            }).catch(function (error) {
                if (alive && scheduledGeneration === generation) { showError(error, settingsTarget); }
            });
        }

        this.callbacks = {
            init: function () {
                if (!alive) { alive = true; generation += 1; }
                run('mountPanel');
                return true;
            },
            render: function () { run('mountPanel'); return true; },
            bind_actions: function () { return true; },
            settings: function (modalBody) {
                var target = modalBody && (modalBody.nodeType === 1 ? modalBody : modalBody[0]);
                if (!target || typeof target.appendChild !== 'function') { target = null; }
                run('openSettings', target);
                return true;
            },
            onSave: function () { return true; },
            destroy: function () {
                if (!alive) { return true; }
                alive = false;
                generation += 1;
                clearError();
                if (loadedApp && registeredGeneration >= 0) {
                    try {
                        Promise.resolve(loadedApp.unmountAll(self)).catch(function (error) {
                            console.error('[rkrs_mass_lead_creator] Ошибка очистки прототипа:', error);
                        });
                    } catch (error) {
                        console.error('[rkrs_mass_lead_creator] Ошибка очистки прототипа:', error);
                    }
                }
                registeredGeneration = -1;
                return true;
            }
        };
        return this;
    };
});
