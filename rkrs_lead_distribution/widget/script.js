/** amoCRM AMD adapter. Authentication is provided by the documented SDK. */
define([], function () {
  var ASSETS = "__RKRS_DISTRIBUTION_ASSETS_URL__";
  var API = "__RKRS_DISTRIBUTION_API_URL__";
  var BUNDLE = "__RKRS_DISTRIBUTION_BUNDLE__";
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
        card = crm.data.current_card || {};
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
    // Compact group picker for the Digital Pipeline action settings only.
    // Follows the documented WEB SDK contract: locate the scoped container by
    // widget_code and write the UUID into the widget's own groupId field so that
    // amoCRM saves it as part of the action settings (action.settings.widget.settings.groupId).
    function mountGroupPicker(container) {
      try {
        var scope =
          container && container.nodeType
            ? container
            : document.querySelector(
                ".digital-pipeline__short-task_widget-style_" +
                  (((self.get_settings && self.get_settings()) || {})
                    .widget_code || ""),
              );
        if (!scope || !scope.querySelector) return;
        var holder =
          scope.querySelector('[data-action="send_widget_hook"]') || scope;
        var field =
          holder.querySelector('input[name="groupId"]') ||
          scope.querySelector('input[name="groupId"]');
        if (!field || scope.querySelector("[data-rkrs-dp-groups]")) return;
        var status = document.createElement("div");
        status.setAttribute("data-rkrs-dp-groups", "loading");
        status.textContent = "Загружаем группы…";
        if (field.parentNode)
          field.parentNode.insertBefore(status, field.nextSibling);
        if (typeof self.$authorizedAjax !== "function") {
          status.textContent =
            "Авторизация amoCRM недоступна — введите идентификатор группы вручную.";
          status.setAttribute("data-rkrs-dp-groups", "fallback");
          return;
        }
        var req = self.$authorizedAjax({
          url: API + "/runtime",
          type: "POST",
          dataType: "json",
          contentType: "application/json",
          data: JSON.stringify({ kind: "groups" }),
          timeout: 11000,
        });
        req.done(function (response) {
          var groups = (response && response.items) || [];
          if (!groups.length) {
            status.textContent =
              "Группы распределения не найдены — введите идентификатор вручную.";
            status.setAttribute("data-rkrs-dp-groups", "fallback");
            return;
          }
          var select = document.createElement("select");
          select.setAttribute("aria-label", "Группа распределения");
          select.setAttribute("data-rkrs-dp-groups", "ready");
          var placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = "Выберите группу";
          select.appendChild(placeholder);
          for (var i = 0; i < groups.length; i += 1) {
            var g = groups[i] || {};
            var option = document.createElement("option");
            option.value = String(g.id || "");
            option.textContent = String(g.name || g.id || "Группа");
            select.appendChild(option);
          }
          select.value = field.value || "";
          select.addEventListener("change", function () {
            field.value = select.value;
            field.dispatchEvent(new Event("input", { bubbles: true }));
            field.dispatchEvent(new Event("change", { bubbles: true }));
          });
          status.parentNode.replaceChild(select, status);
        });
        req.fail(function () {
          status.textContent =
            "Не удалось загрузить группы — введите идентификатор группы вручную.";
          status.setAttribute("data-rkrs-dp-groups", "fallback");
        });
      } catch (ignored) {
        /* the amoCRM field remains available for manual entry */
      }
    }

    // amoCRM "custom" settings field contract (docs: /integrations/custom_settings):
    // the widget is given <code>_custom_content (its own UI) and <code>_custom
    // (hidden input that stores a JSON string or number). Changes are reflected in
    // the form by triggering "change" on the hidden input. We bind our existing
    // distribution settings UI to that field - no credentials, no extra secret.
    function customNode(suffix) {
      var node = document.querySelector('[id$="' + suffix + '"]');
      return node && node.id && node.id !== suffix ? node : null;
    }
    function bindCustomSettings(body) {
      var target =
        customNode("_custom_content") ||
        (body && (body.nodeType ? body : body[0]));
      show("settings", target);
      var hidden = customNode("_custom");
      if (hidden) {
        hidden.value = JSON.stringify({ widget: "rkrs-lead-distribution" });
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      }
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
        mountGroupPicker(body && (body.nodeType ? body : body[0]));
        return true;
      },
      onSave: function () {
        return true;
      },
      destroy: function () {
        alive = false;
        dispose();
        identity = "";
        return true;
      },
    };
    return self;
  };
});
