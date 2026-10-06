/** amoCRM AMD adapter. Authentication is provided by the documented SDK. */
define([], function () {
  var ASSETS = "https://2-26-66-187.sslip.io/widget-assets";
  var API = "https://2-26-66-187.sslip.io/api/v1/widget/distribution";
  var BUNDLE = "rkrs-distribution.ce6a9cbc0f0ae97f.umd.js";
  var pending,
    loaded,
    sequence = 0;
  function load() {
    if (pending) return pending;
    var settled = false,
      attempt;
    function forget() {
      if (typeof require.undef === "function") {
        try {
          require.undef(ASSETS + "/" + BUNDLE);
        } catch (ignored) {
          /* next render remains available */
        }
      }
    }
    attempt = new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        settled = true;
        if (pending === attempt) pending = null;
        forget();
        reject(new Error("Не удалось загрузить модуль"));
      }, 15000);
      require([ASSETS + "/" + BUNDLE], function (app) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (
          !app ||
          typeof app.mount !== "function" ||
          typeof app.destroy !== "function"
        ) {
          if (pending === attempt) pending = null;
          forget();
          reject(new Error("Некорректный модуль"));
          return;
        }
        loaded = app;
        resolve(app);
      }, function (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (pending === attempt) pending = null;
        forget();
        reject(error);
      });
    });
    pending = attempt;
    return attempt;
  }
  return function () {
    var self = this,
      alive = true,
      generation = 0,
      id = ++sequence,
      host = null,
      identity = "";
    function dispose() {
      generation++;
      if (loaded) loaded.destroy(self);
      if (host) host.remove();
      host = null;
    }
    function show(mode, target) {
      alive = true;
      var account, user, card;
      try {
        var crm = typeof APP !== "undefined" ? APP : AMOCRM;
        account = crm.constant("account") || {};
        user = crm.constant("user") || {};
        card = (crm.data && crm.data.current_card) || {};
        card = Object.assign({}, card);
        card.id = card.id || crm.constant("card_id");
      } catch (e) {
        account = {};
        user = {};
        card = {};
      }
      if (mode === "card" && !/^[1-9][0-9]*$/.test(String(card.id || ""))) {
        dispose();
        return;
      }
      var next = [mode, account.id, user.id, card.id].join(":");
      if (
        identity !== next ||
        (host && (!host.isConnected || (target && !target.contains(host))))
      ) {
        dispose();
        identity = next;
      }
      if (!host) {
        host = document.createElement("div");
        host.id = "rkrs-distribution-" + id;
        if (target) target.appendChild(host);
        else if (mode === "card") {
          self.render_template({
            caption: {
              class_name: "rkrs-distribution-caption",
              html: "Распределение сделок",
            },
            body: "",
            render: '<div id="rkrs-distribution-slot-' + id + '"></div>',
          });
          var slot = document.getElementById("rkrs-distribution-slot-" + id);
          if (!slot) {
            host = null;
            return;
          }
          slot.appendChild(host);
        } else return;
        host.textContent = "Загрузка распределения…";
      }
      var gen = generation;
      load()
        .then(function (app) {
          if (!alive || gen !== generation) return;
          app.mount({
            widget: self,
            target: host,
            mode: mode,
            leadId: mode === "card" ? String(card.id || "") : "",
            identity: next,
            apiUrl: API,
          });
        })
        .catch(function () {
          if (alive && gen === generation && host)
            host.textContent =
              "Не удалось загрузить распределение. Откройте виджет повторно.";
        });
    }
    // Keep amoCRM's field as the saved action value; render names in our select.
    var dpRequests = [];
    var dpSaveChecks = [];
    function mountGroupPicker(container) {
      var settings = (self.get_settings && self.get_settings()) || {};
      var scope = container && container.nodeType ? container : null;
      var marker = document.getElementsByClassName(
        "digital-pipeline__short-task_widget-style_" + (settings.widget_code || ""),
      )[0];
      // dpSettings often has no argument. The SDK marker is inside the action,
      // while the settings inputs live in its parent send_widget_hook container.
      if (!scope || !scope.querySelector('input[name="groupId"]')) {
        scope = marker;
        while (scope && !scope.querySelector('input[name="groupId"]'))
          scope = scope.parentElement;
        // Never search the whole document for another widget's settings.
        if (scope === document.body || scope === document.documentElement) return;
      }
      if (!scope) return;
      var field = scope.querySelector('input[name="groupId"]');
      if (!field || scope.querySelector('[data-rkrs-dp-groups]')) return;
      var labels = (self.i18n && self.i18n("dp")) || {};
      function label(key, fallback) { return labels[key] || fallback; }
      var wrapper = document.createElement("div");
      wrapper.setAttribute("data-rkrs-dp-groups", "loading");
      var select = document.createElement("select");
      select.setAttribute("aria-label", label("group", "Группа распределения"));
      select.style.cssText = "width:100%;min-height:36px;padding:6px;border:1px solid #ccc;border-radius:3px;background:white;color:#333;";
      var status = document.createElement("div");
      status.setAttribute("role", "status");
      status.style.cssText = "margin-top:6px;font-size:12px;color:#697583;";
      var retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = label("retry", "Повторить загрузку");
      retry.hidden = true;
      wrapper.appendChild(select); wrapper.appendChild(status); wrapper.appendChild(retry);
      field.parentNode.insertBefore(wrapper, field.nextSibling);
      field.hidden = true;
      field.style.display = "none";
      var keyField = scope.querySelector('input[name="key"]');
      var keySequence = 0;
      var keyBusy = false;
      var groupReady = false;
      if (keyField) {
        keyField.hidden = true;
        keyField.style.display = "none";
        // Hide the SDK's own key label/row, without hiding the group control.
        var row = keyField.parentElement;
        while (row && row !== scope && !row.contains(field)) {
          if (row.textContent.trim() === labels.key) row.hidden = true;
          row = row.parentElement;
        }
        var previous = keyField.previousElementSibling;
        if (previous && previous.textContent.trim() === labels.key) previous.hidden = true;
      }
      function sync(input, value) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      dpSaveChecks.push(function () {
        return !wrapper.isConnected || !!(keyField && keyField.value && field.value && !keyBusy);
      });
      function requestId() {
        var crypto = window.crypto;
        if (crypto.randomUUID) return crypto.randomUUID();
        var bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        return Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); })
          .join("").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
      }
      function connectGroup() {
        if (!present() || !field.value || !keyField) return;
        var selected = field.value;
        var attempt = ++keySequence;
        keyBusy = true; retry.hidden = true;
        status.textContent = label("connecting", "Подключаем группу к TeamOS…");
        var request;
        function connectionFailed(xhr) {
          if (!present() || attempt !== keySequence || selected !== field.value) return;
          keyBusy = false; retry.hidden = false;
          status.textContent = xhr && xhr.status === 403
            ? label("connect_forbidden", "Нет прав на настройку подключения. Обратитесь к администратору.")
            : label("connect_error", "Не удалось настроить подключение. Повторите попытку.");
        }
        try {
          request = self.$authorizedAjax({
            url: API + "/runtime", type: "POST", dataType: "json",
            contentType: "application/json",
            data: JSON.stringify({ kind: "dp_settings", write: true, groupId: selected, requestId: requestId() }),
            timeout: 11000,
          });
          dpRequests.push(request);
          request.done(function (response) {
            if (!present() || attempt !== keySequence || selected !== field.value) return;
            if (!response || response.state !== "connected" || response.groupId !== selected ||
                typeof response.key !== "string" || !/^dp_[A-Za-z0-9_-]{32,128}$/.test(response.key)) {
              connectionFailed(); return;
            }
            sync(keyField, response.key);
            keyBusy = false; retry.hidden = true;
            status.textContent = label("connected", "Подключено к TeamOS") +
              (response.groupName ? " · " + response.groupName : "");
          });
          request.fail(connectionFailed);
        } catch (error) { connectionFailed(); }
      }
      select.addEventListener("change", function () {
        keySequence++; keyBusy = false;
        sync(field, select.value);
        // A credential for another group must never accompany the new selection.
        if (keyField) sync(keyField, "");
        if (select.value) connectGroup();
        else status.textContent = label("group_help", "Выберите группу по названию.");
      });
      function option(value, text, disabled) {
        var item = document.createElement("option");
        item.value = value; item.textContent = text; item.disabled = !!disabled;
        select.appendChild(item);
      }
      function currentPlaceholder(text) {
        select.textContent = "";
        option("", text);
        if (field.value) option(field.value, label("saved_group", "Сохранённая группа — проверяем доступность"), true);
        select.value = field.value || "";
      }
      function present() { return alive && wrapper.isConnected; }
      function failed(xhr) {
        if (!present()) return;
        wrapper.setAttribute("data-rkrs-dp-groups", "error");
        currentPlaceholder(label("unavailable", "Группы недоступны"));
        select.disabled = true; retry.hidden = false;
        status.textContent = xhr && xhr.status === 403
          ? label("forbidden", "Нет доступа к группам распределения. Обратитесь к администратору.")
          : label("load_error", "Не удалось загрузить группы. Повторите загрузку; сохранённый выбор не изменён.");
      }
      function fetchGroups() {
        if (!present()) return;
        groupReady = false;
        retry.hidden = true; select.disabled = true;
        wrapper.setAttribute("data-rkrs-dp-groups", "loading");
        currentPlaceholder(label("loading", "Загружаем группы…"));
        status.textContent = "";
        if (typeof self.$authorizedAjax !== "function") { failed(); return; }
        var req;
        try {
          req = self.$authorizedAjax({
            url: API + "/runtime", type: "POST", dataType: "json",
            contentType: "application/json", data: JSON.stringify({ kind: "groups" }), timeout: 11000,
          });
          dpRequests.push(req);
          req.done(function (response) {
            if (!present()) return;
            if (!response || !Array.isArray(response.items)) { failed(); return; }
            var groups = response.items.filter(function (g) {
              return g && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(g.id)) && typeof g.name === "string" && g.name.trim();
            });
            groups.sort(function (a, b) { return a.name.localeCompare(b.name); });
            select.textContent = "";
            option("", label("choose_group", "Выберите группу"));
            var found = false;
            groups.forEach(function (g) {
              option(String(g.id), g.name);
              if (String(g.id) === field.value) found = true;
            });
            if (field.value && !found)
              option(field.value, label("missing_group", "Сохранённая группа недоступна — выберите другую"), true);
            select.value = field.value || "";
            groupReady = groups.length > 0;
            select.disabled = groups.length === 0;
            retry.hidden = groups.length !== 0;
            wrapper.setAttribute("data-rkrs-dp-groups", "ready");
            status.textContent = groups.length === 0
              ? label("no_groups", "Нет доступных групп. Создайте группу в TeamOS и повторите загрузку.")
              : field.value && !found
                ? label("missing_help", "Предыдущий выбор сохранён. Проверьте доступ к группе или выберите доступную.")
                : label("group_help", "Выберите группу по названию. Подключение настроится автоматически.");
            if (found && keyField) connectGroup();
          });
          req.fail(failed);
        } catch (error) { failed(); }
      }
      retry.addEventListener("click", function () {
        if (groupReady && field.value && keyField) connectGroup();
        else fetchGroups();
      });
      fetchGroups();
    }

    // amoCRM "custom" settings field contract (docs: /integrations/custom_settings):
    // the widget is given <code>_custom_content (its own UI) and <code>_custom
    // (hidden input that stores a JSON string or number). Changes are reflected in
    // the form by triggering "change" on the hidden input. We bind our existing
    // distribution settings UI to that field - no credentials, no extra secret.
    function bindCustomSettings(body) {
      var parent = body && (body.nodeType ? body : body[0]);
      parent = parent || document.getElementById("widget_settings__fields_wrapper");
      if (!parent) return;
      var target = parent.querySelector('[data-amopro-distribution-settings]');
      if (!target) {
        target = document.createElement("section");
        target.setAttribute("data-amopro-distribution-settings", "");
        parent.appendChild(target);
      }
      show("settings", target);
    }

    self.callbacks = {
      render: function () {
        show("card");
        return true;
      },
      init: function () {
        return true;
      },
      bind_actions: function () {
        return true;
      },
      settings: function (body) {
        bindCustomSettings(body);
        return true;
      },
      advancedSettings: function () {
        show("settings", document.getElementById("list_page_holder"));
        return true;
      },
      dpSettings: function (body) {
        alive = true;
        mountGroupPicker(body && (body.nodeType ? body : body[0]));
        return true;
      },
      onSave: function () {
        return dpSaveChecks.every(function (check) { return check(); });
      },
      destroy: function () {
        alive = false;
        dpRequests.forEach(function (request) { if (request && request.abort) request.abort(); });
        dpRequests = [];
        dpSaveChecks = [];
        dispose();
        identity = "";
        return true;
      },
    };
    return self;
  };
});
