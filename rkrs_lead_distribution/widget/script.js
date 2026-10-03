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
        show("settings", body && (body.nodeType ? body : body[0]));
        return true;
      },
      advancedSettings: function () {
        show("settings", document.getElementById("list_page_holder"));
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
