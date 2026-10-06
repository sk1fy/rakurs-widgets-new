define(['jquery'], function ($) {
  'use strict';

  var TERMINAL_STATUSES = {
    completed: true,
    failed: true,
    dead: true,
    cancelled: true
  };

  function normalizeBaseUrl(value) {
    var raw = String(value || '').trim();
    var parsed;

    try {
      parsed = new URL(raw);
    } catch (error) {
      throw new Error('invalid_backend_url');
    }

    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname && parsed.pathname !== '/')
    ) {
      throw new Error('invalid_backend_url');
    }

    return parsed.origin;
  }

  function positiveInteger(value, allowZero) {
    var raw = String(value === undefined || value === null ? '' : value).trim();
    if (!/^\d+$/.test(raw)) {
      throw new Error('invalid_integer');
    }

    var number = Number(raw);
    if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1)) {
      throw new Error('invalid_integer');
    }
    return number;
  }

  function newIdempotencyKey(randomUUID) {
    if (typeof randomUUID === 'function') {
      return randomUUID();
    }
    return 'widget-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function requestError(xhr, textStatus, errorThrown) {
    var status = xhr && Number(xhr.status) ? Number(xhr.status) : 0;
    var requestId = xhr && typeof xhr.getResponseHeader === 'function'
      ? xhr.getResponseHeader('X-Request-ID')
      : '';
    var responseText = xhr && typeof xhr.responseText === 'string'
      ? xhr.responseText.trim().replace(/\s+/g, ' ').slice(0, 180)
      : '';
    var message = responseText || errorThrown || textStatus || 'request_failed';
    var error = new Error(message);
    error.status = status;
    error.requestId = requestId || '';
    return error;
  }

  function create(widget, baseUrl) {
    var origin = normalizeBaseUrl(baseUrl);

    if (!widget || typeof widget.get_settings !== 'function' || !$ || typeof $.ajax !== 'function') {
      throw new Error('authorized_ajax_unavailable');
    }

    function request(path, options) {
      var input = options || {};
      var ajaxOptions = {
        url: origin + path,
        method: input.method || 'GET',
        dataType: 'json',
        timeout: input.timeout || 20000,
        headers: input.headers || {}
      };

      if (input.body !== undefined) {
        ajaxOptions.data = JSON.stringify(input.body);
        ajaxOptions.contentType = 'application/json; charset=UTF-8';
        ajaxOptions.processData = false;
      }

      return new Promise(function (resolve, reject) {
        var settings = widget.get_settings();
        var clientUUID = settings && settings.oauth_client_uuid;
        if (typeof clientUUID !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientUUID)) {
          reject(new Error('invalid_oauth_client_uuid'));
          return;
        }
        // authorizedAjax caches JWTs for 25 minutes; this backend consumes each jti once.
        // Fetch via the same amoCRM endpoint without caching, never persist the JWT.
        try {
          $.ajax({
            url: '/ajax/v2/integrations/' + encodeURIComponent(clientUUID) + '/disposable_token',
            method: 'GET',
            dataType: 'json',
            cache: false,
            timeout: ajaxOptions.timeout
          }).done(function (data) {
            if (!data || typeof data.token !== 'string' || !data.token) {
              reject(new Error('invalid_amocrm_token_response'));
              return;
            }
            ajaxOptions.headers = Object.assign({}, ajaxOptions.headers, { 'X-Auth-Token': data.token });
            ajaxOptions.xhrFields = { withCredentials: false };
            try {
              $.ajax(ajaxOptions).done(resolve).fail(function (xhr, textStatus, errorThrown) {
                reject(requestError(xhr, textStatus, errorThrown));
              });
            } catch (error) {
              reject(new Error('backend_request_failed'));
            }
          }).fail(function (xhr) {
            var error = new Error('amocrm_token_request_failed');
            error.status = xhr && Number(xhr.status) ? Number(xhr.status) : 0;
            reject(error);
          });
        } catch (error) {
          reject(new Error('amocrm_token_request_failed'));
        }
      });
    }

    return {
      bootstrap: function () {
        return request('/api/v1/widget/bootstrap');
      },
      ping: function (idempotencyKey) {
        return request('/api/v1/widget/actions/ping', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey }
        });
      },
      setLeadStatus: function (command, idempotencyKey) {
        return request('/api/v1/widget/actions/leads/set-status', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: command
        });
      },
      configureLeadStatusRule: function (command, idempotencyKey) {
        return request('/api/v1/widget/workflow-rules/lead-status/configure', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: command
        });
      },
      job: function (jobId) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
          return Promise.reject(new Error('invalid_job_id'));
        }
        return request('/api/v1/widget/jobs/' + encodeURIComponent(jobId));
      }
    };
  }

  return {
    TERMINAL_STATUSES: TERMINAL_STATUSES,
    normalizeBaseUrl: normalizeBaseUrl,
    positiveInteger: positiveInteger,
    newIdempotencyKey: newIdempotencyKey,
    create: create
  };
});

