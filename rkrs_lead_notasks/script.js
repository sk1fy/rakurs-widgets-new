define([
    'jquery',
    'lib/components/base/modal',
    './lib/constants.js?v=1.1.1',
    './lib/request_queue.js?v=1.1.1',
    './lib/amo_api.js?v=1.1.1',
    './lib/rules.js?v=1.1.1',
    './lib/snapshot.js?v=1.1.1',
    './lib/catalog_repository.js?v=1.1.1',
    './lib/runtime.js?v=1.1.1',
    './lib/settings_controller.js?v=1.1.1',
    './lib/task_assignment.js?v=1.1.1',
    './lib/teamos.js?v=1.1.1',
    './lib/deployment.js?v=1.1.1',
    './lib/teamos_controller.js?v=1.1.1'
], function ($, Modal, Constants, QueueModule, ApiFactory, RulesFactory, SnapshotFactory, CatalogFactory, RuntimeFactory, SettingsFactory, TaskAssignmentFactory, TeamOSFactory, Deployment, TeamControllerFactory) {
    'use strict';

    var ApiModule = ApiFactory(QueueModule);
    var RulesModule = RulesFactory(Constants);
    var SnapshotModule = SnapshotFactory(Constants, RulesModule);
    var CatalogModule = CatalogFactory(Constants, RulesModule);
    var TaskAssignmentModule = TaskAssignmentFactory(Constants);
    var RuntimeModule = RuntimeFactory(Constants, RulesModule, SnapshotModule, TaskAssignmentModule);
    var TeamOS = TeamOSFactory(SnapshotModule, RulesModule);
    var TeamController = TeamControllerFactory(TeamOS);
    var SettingsModule = SettingsFactory(Constants, RulesModule, SnapshotModule);

    return function () {
        var self = this;
        var runtimeController = null;
        var settingsController = null;
        var managedConfig;
        var managedKey = '';
        var team = new TeamController(self, $, Deployment, function (good) {
            var key = good ? JSON.stringify(good.scope) + ':' + good.version : '';
            if (key === managedKey) { return; }
            managedKey = key; managedConfig = good ? good.config : undefined;
            if (runtimeController) { runtimeController.destroy(); runtimeController = null; }
            if (good) { var runtime = ensureRuntime(); if (runtime) { runtime.bind(); runtime.init(); } }
        });

        self.appName = Constants.APP_NAME;
        if (window.console && typeof console.info === 'function') {
            console.info('[rkrs_lead_notasks] loaded v' + Constants.BUILD_VERSION + ' (standalone / TeamOS)');
        }
        self.accountId = (function () {
            try { return Number(APP.constant('account').id) || 0; } catch (error) {}
            try { return Number(AMOCRM.constant('account').id) || 0; } catch (error2) {}
            return 0;
        }());

        self.getTemplate = function (template, params, callback) {
            params = typeof params === 'object' ? params : {};
            return self.render({
                href: '/templates/' + template + '.twig',
                base_path: self.params.path,
                load: callback
            }, params);
        };

        function version() {
            try { return self.get_version(); } catch (error) {}
            try { return self.get_settings().version || '1'; } catch (error2) {}
            return '1';
        }

        function assetBase() {
            try {
                return self.params.path || self.params.cdn_path || self.get_settings().path || '';
            } catch (error) {
                return '';
            }
        }

        function includeCss() {
            var href = assetBase() + '/style.css?v=' + encodeURIComponent(version());
            var element = document.getElementById(Constants.STYLE_ID);
            if (element) {
                if (element.getAttribute('href') !== href) {
                    element.setAttribute('href', href);
                }
                return;
            }
            $('<link>', {
                id: Constants.STYLE_ID,
                rel: 'stylesheet',
                type: 'text/css',
                href: href
            }).appendTo('head');
        }

    function area() {
        var value = '';
        try { value = self.system().area || ''; } catch (error) {}
        if (value && value !== 'everywhere' && value !== 'outer_space') { return value; }
        try { value = AMOCRM.getWidgetsArea() || ''; } catch (error2) {}
        if (value && value !== 'everywhere' && value !== 'outer_space') { return value; }
        var path = typeof location !== 'undefined' ? String(location.pathname || '') : '';
        if (/\/(?:leads|customers)\/detail\//.test(path)) {
            return path.indexOf('/customers/') !== -1 ? 'customers_card' : 'leads_card';
        }
        if (/\/leads/.test(path)) { return 'leads_pipeline'; }
        if (/\/customers/.test(path)) { return 'customers'; }
        if (/\/todo(?:\/|$)/.test(path)) { return 'todo'; }
        return '';
    }

        function isRuntimeArea() {
        var currentArea = area();
        return currentArea.indexOf('todo-') === 0 || ['lcard', 'lcard-0', 'llist', 'cucard', 'cucard-0', 'culist', 'todo', 'tasks', 'tlist', 'tline', 'tcalendar', 'leads_card', 'customers_card', 'leads', 'leads_pipeline', 'leads-pipeline', 'leads-list', 'customers', 'customers-list'].indexOf(currentArea) !== -1;
        }

        function createApi() {
            var queue = new QueueModule.RequestQueue({
                minInterval: Constants.REQUEST_INTERVAL_MS,
                retry429: [1000, 2000],
                retry5xx: 1
            });
            return new ApiModule.AmoApiClient($, { queue: queue });
        }

        function ensureRuntime() {
            if (!isRuntimeArea() || (team.enabled() && !managedConfig)) {
                return null;
            }
            if (!runtimeController) {
                runtimeController = new RuntimeModule.RuntimeController({
                    widget: self,
                    $: $,
                    Modal: Modal,
                    api: createApi(),
                    accountId: self.accountId,
                    runtimeConfig: managedConfig
                });
            }
            return runtimeController;
        }

        self.callbacks = {
            render: function () {
                includeCss();
                var runtime = ensureRuntime();
                if (runtime) { runtime.bind(); }
                return true;
            },

            init: function () {
                includeCss();
                team.start();
                var runtime = ensureRuntime();
                if (runtime) { runtime.init(); }
                return true;
            },

            bind_actions: function () {
                var runtime = ensureRuntime();
                if (runtime) { runtime.bind(); }
                return true;
            },

            settings: function ($body) {
                includeCss();
                if (settingsController) {
                    settingsController.destroy();
                    settingsController = null;
                }
                if (team.enabled()) { team.render($body); return true; }
                var api = createApi();
                settingsController = new SettingsModule.SettingsController({
                    widget: self,
                    $: $,
                    api: api,
                    repository: new CatalogModule.CatalogRepository(api),
                    accountId: self.accountId
                });
                settingsController.init($body).then(function () { team.render($body); }).catch(function (error) {
                    if (window.console && console.error) {
                        console.error('[rkrs_lead_notasks] settings init failed', error);
                    }
                });
                return true;
            },

            onSave: function (data) {
                return settingsController ? settingsController.onSave(data) : true;
            },

            loadElements: function () {
                var runtime = ensureRuntime();
                if (runtime) { runtime.init(); }
                return Promise.resolve({});
            },

            linkCard: function () {
                var runtime = ensureRuntime();
                if (runtime) { runtime.bind(); }
                return Promise.resolve(true);
            },

            destroy: function () {
                team.destroy(); managedConfig = undefined; managedKey = "";
                if (runtimeController) {
                    runtimeController.destroy();
                    runtimeController = null;
                }
                if (settingsController) {
                    settingsController.destroy();
                    settingsController = null;
                }
                return true;
            }
        };

        return this;
    };
});
