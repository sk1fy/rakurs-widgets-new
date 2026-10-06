define(['jquery', './backend-client.js'], function ($, BackendClient) {
  'use strict';

  return function () {
    var self = this;
    var namespace = '.amoproTester';
    var rootSelector = '.amopro-tester';
    var settingsSelector = '.amopro-settings';
    var pollGeneration = 0;
    var destroyed = false;

    function lang() {
      return self.i18n('tester') || {};
    }

    function text(key, fallback) {
      return lang()[key] || fallback || key;
    }

    function escapeHtml(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function savedSettings() {
      return self.get_settings() || {};
    }

    function client() {
      return BackendClient.create(self, savedSettings().backend_url);
    }

    function ensureStylesheet() {
      var widgetCode = savedSettings().widget_code || 'amopro';
      var id = 'amopro-tester-style-' + String(widgetCode).replace(/[^a-z0-9_-]/gi, '');
      if (!document.getElementById(id)) {
        $('<link>', {
          id: id,
          rel: 'stylesheet',
          href: self.params.path + '/style.css?v=' + encodeURIComponent(self.get_version())
        }).appendTo(document.head);
      }
    }

    function cardId() {
      var id = 0;
      try {
        id = window.APP && APP.constant ? APP.constant('card_id') : 0;
        id = id || (window.APP && APP.data && APP.data.current_card
          ? APP.data.current_card.id
          : 0);
      } catch (error) {
        id = 0;
      }
      return Number(id) || 0;
    }

    function randomUUID() {
      var cryptoApi = window.crypto || {};
      return BackendClient.newIdempotencyKey(
        typeof cryptoApi.randomUUID === 'function'
          ? cryptoApi.randomUUID.bind(cryptoApi)
          : null
      );
    }

    function compact(value) {
      if (value === undefined) {
        return '';
      }
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }

    function log(label, value) {
      var output = $(rootSelector + ' [data-role="log"]');
      if (!output.length) {
        return;
      }
      var time = new Date().toLocaleTimeString();
      var line = '[' + time + '] ' + label + (value === undefined ? '' : ': ' + compact(value));
      output.text((output.text() ? output.text() + '\n' : '') + line);
      output.scrollTop(output[0].scrollHeight);
    }

    function errorDetails(error) {
      var details = { message: error && error.message ? error.message : 'request_failed' };
      if (error && error.status) {
        details.status = error.status;
      }
      if (error && error.requestId) {
        details.request_id = error.requestId;
      }
      return details;
    }

    function setStatus(message, tone) {
      var status = $(rootSelector + ' [data-role="status"]');
      status.attr('data-tone', tone || 'neutral');
      status.find('[data-role="status-text"]').text(message);
    }

    function setBusy(button, busy) {
      $(button).prop('disabled', Boolean(busy));
    }

    function run(button, task) {
      setBusy(button, true);
      setStatus(text('running'), 'neutral');
      return Promise.resolve().then(task).then(function (result) {
        setStatus(text('ready'), 'success');
        return result;
      }).catch(function (error) {
        setStatus(text('request_failed'), 'danger');
        log(text('request_failed'), errorDetails(error));
      }).then(function () {
        setBusy(button, false);
      });
    }

    function pollJob(api, jobId, generation, startedAt) {
      if (destroyed || generation !== pollGeneration) {
        return Promise.resolve(null);
      }
      if (Date.now() - startedAt > 60000) {
        return Promise.reject(new Error('job_poll_timeout'));
      }

      return api.job(jobId).then(function (job) {
        log(text('job_update'), { job_id: job.job_id, status: job.status, attempts: job.attempts });
        if (BackendClient.TERMINAL_STATUSES[job.status]) {
          if (job.status === 'completed') {
            log(text('job_complete'), job.result || { status: job.status });
          } else {
            log(text('job_failed'), job.error || { status: job.status });
          }
          return job;
        }
        return new Promise(function (resolve) {
          window.setTimeout(resolve, 1200);
        }).then(function () {
          return pollJob(api, jobId, generation, startedAt);
        });
      });
    }

    function submitJob(button, enqueue) {
      return run(button, function () {
        var api = client();
        var generation = ++pollGeneration;
        return enqueue(api).then(function (accepted) {
          log(text('job_accepted'), accepted);
          return pollJob(api, accepted.job_id, generation, Date.now());
        });
      });
    }

    function value(name) {
      return $(rootSelector + ' [name="' + name + '"]').val();
    }

    function positive(name, allowZero) {
      return BackendClient.positiveInteger(value(name), Boolean(allowZero));
    }

    function panelHtml() {
      var leadId = cardId();
      var configured = Boolean(savedSettings().backend_url);
      return '' +
        '<div class="amopro-tester" data-configured="' + (configured ? 'true' : 'false') + '">' +
          '<div class="amopro-tester__header">' +
            '<div class="amopro-tester__title">' + escapeHtml(text('title')) + '</div>' +
            '<div class="amopro-tester__subtitle">' + escapeHtml(text('subtitle')) + '</div>' +
          '</div>' +
          '<div class="amopro-tester__status" data-role="status" data-tone="neutral">' +
            '<span class="amopro-tester__dot"></span>' +
            '<span data-role="status-text">' + escapeHtml(configured ? text('ready') : text('not_configured')) + '</span>' +
          '</div>' +
          '<div class="amopro-tester__actions">' +
            '<button type="button" class="amopro-tester__button" data-action="bootstrap">' + escapeHtml(text('bootstrap')) + '</button>' +
            '<button type="button" class="amopro-tester__button amopro-tester__button--primary" data-action="ping">' + escapeHtml(text('ping')) + '</button>' +
          '</div>' +
          '<div class="amopro-tester__section">' +
            '<div class="amopro-tester__section-title">' + escapeHtml(text('lead_section')) + '</div>' +
            '<div class="amopro-tester__hint">' + escapeHtml(text('lead_id')) + ': ' + escapeHtml(leadId || '—') + '</div>' +
            '<div class="amopro-tester__grid">' +
              fieldHtml('pipeline_id', 'pipeline_id') +
              fieldHtml('status_id', 'status_id') +
              '<button type="button" class="amopro-tester__button amopro-tester__button--primary amopro-tester__field--wide" data-action="set-status"' + (leadId ? '' : ' disabled') + '>' + escapeHtml(text('set_status')) + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="amopro-tester__section">' +
            '<div class="amopro-tester__section-title">' + escapeHtml(text('rule_section')) + '</div>' +
            '<div class="amopro-tester__grid">' +
              fieldHtml('source_pipeline_id', 'source_pipeline_id') +
              fieldHtml('source_status_id', 'source_status_id') +
              fieldHtml('target_pipeline_id', 'target_pipeline_id') +
              fieldHtml('target_status_id', 'target_status_id') +
              fieldHtml('expected_revision', 'expected_revision', '0') +
              '<label class="amopro-tester__check"><input type="checkbox" name="enabled" checked> ' + escapeHtml(text('enabled')) + '</label>' +
              '<button type="button" class="amopro-tester__button amopro-tester__button--primary amopro-tester__field--wide" data-action="configure-rule">' + escapeHtml(text('configure_rule')) + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="amopro-tester__section">' +
            '<div class="amopro-tester__log-head"><span class="amopro-tester__section-title">' + escapeHtml(text('log')) + '</span>' +
              '<button type="button" class="amopro-tester__clear" data-action="clear">' + escapeHtml(text('clear')) + '</button></div>' +
            '<pre class="amopro-tester__log" data-role="log"></pre>' +
          '</div>' +
        '</div>';
    }

    function fieldHtml(name, label, defaultValue) {
      return '<label class="amopro-tester__field">' +
        '<span class="amopro-tester__label">' + escapeHtml(text(label)) + '</span>' +
        '<input class="amopro-tester__input" inputmode="numeric" name="' + escapeHtml(name) + '" value="' + escapeHtml(defaultValue || '') + '">' +
      '</label>';
    }

    function bindPanel() {
      var root = $(rootSelector);
      root.off(namespace);

      root.on('click' + namespace, '[data-action="clear"]', function () {
        root.find('[data-role="log"]').text('');
      });

      root.on('click' + namespace, '[data-action="bootstrap"]', function () {
        var button = this;
        run(button, function () {
          return client().bootstrap().then(function (response) {
            log(text('bootstrap_ok'), response);
          });
        });
      });

      root.on('click' + namespace, '[data-action="ping"]', function () {
        var button = this;
        submitJob(button, function (api) {
          return api.ping(randomUUID());
        });
      });

      root.on('click' + namespace, '[data-action="set-status"]', function () {
        var button = this;
        submitJob(button, function (api) {
          var command;
          try {
            command = {
              lead_id: BackendClient.positiveInteger(cardId()),
              pipeline_id: positive('pipeline_id'),
              status_id: positive('status_id')
            };
          } catch (error) {
            throw new Error(text('invalid_number'));
          }
          return api.setLeadStatus(command, randomUUID());
        });
      });

      root.on('click' + namespace, '[data-action="configure-rule"]', function () {
        var button = this;
        submitJob(button, function (api) {
          var command;
          try {
            command = {
              source_pipeline_id: positive('source_pipeline_id'),
              source_status_id: positive('source_status_id'),
              target_pipeline_id: positive('target_pipeline_id'),
              target_status_id: positive('target_status_id'),
              enabled: root.find('[name="enabled"]').prop('checked'),
              expected_revision: positive('expected_revision', true)
            };
          } catch (error) {
            throw new Error(text('invalid_number'));
          }
          return api.configureLeadStatusRule(command, randomUUID());
        });
      });
    }

    function settingsHtml() {
      var settings = savedSettings();
      var oauthHref = '#';
      try {
        var origin = BackendClient.normalizeBaseUrl(settings.backend_url);
        var code = String(settings.integration_code || '').trim();
        if (code) {
          oauthHref = origin + '/oauth/amocrm/start?integration_code=' + encodeURIComponent(code);
        }
      } catch (error) {
        oauthHref = '#';
      }
      return '<div class="amopro-settings">' +
        '<div class="amopro-settings__title">' + escapeHtml(text('settings_title')) + '</div>' +
        '<div class="amopro-settings__help">' + escapeHtml(text('settings_help')) + '</div>' +
        '<div class="amopro-settings__actions">' +
          '<a class="amopro-tester__button amopro-tester__button--primary" data-action="oauth" href="' + escapeHtml(oauthHref) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(text('authorize')) + '</a>' +
          '<button type="button" class="amopro-tester__button" data-action="settings-bootstrap">' + escapeHtml(text('settings_bootstrap')) + '</button>' +
        '</div>' +
        '<div class="amopro-settings__result" data-role="settings-result">' + escapeHtml(text('saved_values_hint')) + '</div>' +
      '</div>';
    }

    function setSettingsResult(message, isError) {
      $(settingsSelector + ' [data-role="settings-result"]')
        .css('color', isError ? '#bf3c4a' : '#16825d')
        .text(message);
    }

    function bindSettings() {
      var root = $(settingsSelector);
      root.off(namespace);

      root.on('click' + namespace, '[data-action="oauth"]', function (event) {
        var settings = savedSettings();
        try {
          BackendClient.normalizeBaseUrl(settings.backend_url);
        } catch (error) {
          event.preventDefault();
          setSettingsResult(text('invalid_backend'), true);
          return;
        }
        var code = String(settings.integration_code || '').trim();
        if (!code) {
          event.preventDefault();
          setSettingsResult(text('missing_code'), true);
          return;
        }
        setSettingsResult(text('oauth_opened'), false);
      });

      root.on('click' + namespace, '[data-action="settings-bootstrap"]', function () {
        var button = this;
        $(button).prop('disabled', true);
        try {
          client().bootstrap().then(function (response) {
            setSettingsResult(text('bootstrap_ok') + ': ' + compact(response), false);
          }).catch(function (error) {
            setSettingsResult(text('request_failed') + ': ' + compact(errorDetails(error)), true);
          }).then(function () {
            $(button).prop('disabled', false);
          });
        } catch (error) {
          setSettingsResult(text('invalid_backend'), true);
          $(button).prop('disabled', false);
        }
      });
    }

    this.callbacks = {
      render: function () {
        destroyed = false;
        ensureStylesheet();
        if (self.system().area === 'lcard' && cardId()) {
          self.render_template({
            caption: { class_name: 'amopro-tester__caption' },
            body: '',
            render: panelHtml()
          });
        }
        return true;
      },

      init: function () {
        return true;
      },

      bind_actions: function () {
        if (self.system().area === 'lcard') {
          bindPanel();
        }
        return true;
      },

      settings: function (modalBody) {
        var host = document.getElementById('widget_settings__fields_wrapper') ||
          (modalBody && modalBody.length ? modalBody[0] : modalBody);
        if (host && !$(host).find(settingsSelector).length) {
          $(host).append(settingsHtml());
        }
        bindSettings();
        return true;
      },

      onSave: function () {
        return true;
      },

      destroy: function () {
        destroyed = true;
        pollGeneration += 1;
        $(rootSelector).off(namespace);
        $(settingsSelector).off(namespace);
        return true;
      }
    };

    return this;
  };
});
