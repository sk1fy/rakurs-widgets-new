(function (factory) {
  if (typeof define === "function" && define.amd) {
    define(["jquery"], factory);
  } else if (typeof window !== "undefined") {
    window.RkrsActivationForm = factory(window.jQuery);
  }
})(function ($) {
  // Форма активации v3 (17.11.2026): одна узкая карточка, у платных сверху листок «N дней»; список «Что даст активация» убран.
  // v2 (06.11.2026) — «польза рядом с формой», одно поле телефона.
  // Номер принимается в любом виде (+7…, 8…, 7…, 00…, скобки, пробелы — в т.ч. автозаполнение браузера):
  // код страны и «8» снимаются, страна определяется по коду, лишние цифры не обрезаются, а подсвечиваются.
  // На сервер уходит тот же формат, что и раньше: code (цифры кода) + phone (номер по маске страны) + country.
  var BASE_URL = "https://ssd.rkrs.ru";
  var CSS_ID = "rkrs-activation-form-styles";
  var SUPPORT_WA = "https://wa.me/79214377886";

  // Запасной список стран: форма работает сразу, даже если /api/account/phoneList не ответил.
  var FALLBACK_COUNTRIES = [
    { name: "Россия", dialCode: "+7", mask: "(###) ###-##-##" },
    { name: "Казахстан", dialCode: "+7", mask: "(###) ###-##-##" },
    { name: "Беларусь", dialCode: "+375", mask: "(##) ###-##-##" },
    { name: "Узбекистан", dialCode: "+998", mask: "(##) ###-##-##" },
    { name: "Киргизия", dialCode: "+996", mask: "(###) ###-###" },
    { name: "Армения", dialCode: "+374", mask: "(##) ###-###" },
    { name: "Грузия", dialCode: "+995", mask: "(###) ###-###" },
    { name: "Азербайджан", dialCode: "+994", mask: "(##) ###-##-##" },
    { name: "Таджикистан", dialCode: "+992", mask: "(##) ###-##-##" },
    { name: "Украина", dialCode: "+380", mask: "(##) ###-##-##" },
  ];
  // Маски, где длина номера известна точно (как в прежней проверке minLengthByMask).
  var STRICT_MASKS = ["(###) ###-##-##", "(##) ###-##-##", "(###) ####", "(###) ###-###", "(##) ###-###"];

  function getApp() {
    return window.APP || null;
  }

  function injectStyles(selector) {
    var host = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!host || host.querySelector("#" + CSS_ID)) return;
    var style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = FORM_CSS;
    host.appendChild(style);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function daysWord(n) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return "день";
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "дня";
    return "дней";
  }

  // ---------- телефон: чистая логика (без DOM) ----------
  function normCountry(c) {
    var mask = String(c.mask || "").trim() || "(###) ###-####";
    return {
      name: String(c.name || "").trim(),
      code: String(c.dialCode || "").replace(/\D/g, ""),
      mask: mask,
      len: mask.split("#").length - 1,
      strict: STRICT_MASKS.indexOf(mask) !== -1,
    };
  }

  function makePhone(list) {
    var countries = list.map(normCountry).filter(function (c) { return c.name && c.code; });
    var ru = countries.find(function (c) { return c.name === "Россия"; }) || countries[0];
    var kz = countries.find(function (c) { return c.name === "Казахстан"; }) || ru;

    function by7(nat) {
      return /^[67]/.test(nat) ? kz : ru;
    }
    function byCode(d) {
      var best = null;
      countries.forEach(function (c) {
        if (d.indexOf(c.code) === 0 && (!best || c.code.length > best.code.length)) best = c;
      });
      return best;
    }
    function pick(c, nat) {
      return c.code === "7" ? by7(nat) : c;
    }
    function status(country, nat) {
      var st;
      if (!nat.length) st = "empty";
      else if (nat.length > country.len) st = "long";
      else if (nat.length === country.len) st = "ok";
      else if (!country.strict && nat.length >= 6) st = "ok";
      else st = "short";
      return { country: country, nat: nat, st: st };
    }
    function parse(raw, cur) {
      var s = String(raw || "").trim();
      var intl = s.charAt(0) === "+";
      var d = s.replace(/\D/g, "");
      if (!intl && d.indexOf("00") === 0) {
        intl = true;
        d = d.slice(2);
      }
      var m, nat;
      if (intl) {
        m = byCode(d);
        if (m) return status(pick(m, d.slice(m.code.length)), d.slice(m.code.length));
        return status(cur, d);
      }
      if (cur.code === "7" && d.length === 11 && /^[78]/.test(d)) {
        nat = d.slice(1);
        return status(by7(nat), nat);
      }
      if (d.length > cur.len) {
        m = byCode(d);
        if (m) {
          nat = d.slice(m.code.length);
          var mm = pick(m, nat);
          if (nat.length === mm.len) return status(mm, nat);
        }
      }
      if (cur.code === "7" && d.length === 10) return status(by7(d), d);
      return status(cur, d);
    }
    function fmt(nat, mask) {
      var i = 0, out = "";
      for (var k = 0; k < mask.length; k++) {
        var ch = mask.charAt(k);
        if (ch === "#") {
          if (i >= nat.length) break;
          out += nat.charAt(i++);
        } else if (i < nat.length) out += ch;
      }
      if (i < nat.length) out += " " + nat.slice(i);
      return out;
    }
    return { countries: countries, ru: ru, parse: parse, fmt: fmt, status: status };
  }

  // ---------- разметка ----------
  // Листок календаря «N дней» — тот же, что в описании виджета в Маркете (согласовано Максимом 17.11.2026).
  function calHtml(days) {
    return '<div class="rkrs-af__cal" aria-label="' + days + " " + daysWord(days) + '"><i></i><b>' + days + "</b><span>" + daysWord(days) + "</span></div>";
  }

  function formHtml(isPaid, trialDays, coreContact) {
    var days = parseInt(trialDays, 10) > 0 ? parseInt(trialDays, 10) : 14;
    var title = isPaid ? "Для активации тестового периода заполните форму" : "Активация виджета";
    // Промокод — у всех виджетов, и у FREE (Максим 07.11.2026); у FREE без объяснений, зачем он.
    var promo = coreContact ? "" :
      '<button type="button" class="rkrs-af__link" data-rkrs="promo-toggle">У меня есть промокод</button>' +
      '<label class="rkrs-af__field" data-rkrs="promo" hidden><span>Промокод</span>' +
      '<input class="rkrs-af__input" type="text" name="rkrs_promocode" autocomplete="off" data-rkrs="promo-input" /></label>';
    return (
      '<div class="rkrs-af rkrs-af--single' + (isPaid ? " rkrs-af--card" : "") + '">' +
      '<form class="rkrs-af__main" novalidate>' +
      '<div class="rkrs-af__lead">' + (isPaid ? calHtml(days) : "") +
      '<div><h2 class="rkrs-af__title">' + title + '</h2><p class="rkrs-af__sub">Займёт полминуты</p></div></div>' +
      '<div class="rkrs-af__field"><span>Телефон</span>' +
      '<div class="rkrs-af__phone" data-rkrs="phone-box">' +
      '<span class="rkrs-af__cc"><span data-rkrs="cc-label">+7</span><select data-rkrs="cc" aria-label="Страна"></select></span>' +
      '<input type="tel" inputmode="tel" autocomplete="tel" name="rkrs_phone" aria-label="Телефон" data-rkrs="phone" placeholder="(000) 000-00-00" />' +
      "</div>" +
      '<span class="rkrs-af__hint" data-rkrs="hint" aria-live="polite">Укажите действующий номер: только по нему мы подтвердим, что аккаунт ваш, и сможем помочь с виджетом</span>' +
      "</div>" +
      '<label class="rkrs-af__field"><span>Как к вам обращаться</span>' +
      '<input class="rkrs-af__input" type="text" name="rkrs_name" autocomplete="given-name" data-rkrs="name" maxlength="512" placeholder="Имя" /></label>' +
      promo +
      '<div class="rkrs-af__error" data-rkrs="error" hidden></div>' +
      '<button type="submit" class="rkrs-af__btn" data-rkrs="submit"><span data-rkrs="submit-text">Активировать доступ</span>' +
      '<span data-rkrs="submit-wait" hidden>Подождите, идёт активация…</span></button>' +
      '<p class="rkrs-af__foot">' + (coreContact
        ? 'Нажимая «Активировать доступ», вы разрешаете связаться с вами по указанному телефону по вопросам работы виджета.'
        : 'Поддержку оказываем только по этому номеру — так мы защищаем ваш аккаунт.') + '</p>' +
      "</form></div>"
    );
  }

  function successBodyHtml(appName, hasSettings) {
    var settingsBtn =
      hasSettings === false
        ? ""
        : '<a href="/settings/widgets/' + esc(appName) + '" target="_blank" class="rkrs-af__btn rkrs-af__btn--inline">Перейти в настройки</a>';
    return (
      '<div class="rkrs-af rkrs-af--single"><div class="rkrs-af__done">' +
      '<div class="rkrs-af__tick">✓</div>' +
      '<h2 class="rkrs-af__title">Доступ активирован</h2>' +
      '<p class="rkrs-af__sub">Виджет готов к работе</p>' +
      settingsBtn +
      "</div></div>"
    );
  }

  // ---------- поведение ----------
  class ActivationRakurs {
    constructor(root, props = {}) {
      ActivationRakurs.propsData = props;
      this.root = root;
      this.onSubmit = props.onSubmit;
      this.q = (k) => root.querySelector('[data-rkrs="' + k + '"]');
      this.phone = makePhone(FALLBACK_COUNTRIES);
      this.cur = this.phone.ru;
      this.fillCountries();

      fetch(BASE_URL + "/api/account/phoneList")
        .then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then((data) => {
          if (!data || !Array.isArray(data.data) || !data.data.length) return;
          const curName = this.cur.name;
          this.phone = makePhone(data.data);
          this.cur = this.phone.countries.find((c) => c.name === curName) || this.phone.ru;
          this.fillCountries();
          this.render(this.phone.status(this.cur, this.digits()), false);
        })
        .catch(() => {
          // Форма уже использует встроенный список стран.
        });

      const theme = document.documentElement.getAttribute("data-color-scheme");
      document.body.classList.toggle("dark-theme", theme === "dark");

      const inp = this.q("phone");
      inp.addEventListener("input", () => this.render(this.phone.parse(inp.value, this.cur), inp.selectionStart === inp.value.length));
      inp.addEventListener("change", () => this.render(this.phone.parse(inp.value, this.cur), true));
      inp.addEventListener("blur", () => this.render(this.phone.parse(inp.value, this.cur), true));
      this.q("cc").addEventListener("change", (e) => {
        this.cur = this.phone.countries[parseInt(e.target.value, 10)] || this.cur;
        this.render(this.phone.status(this.cur, this.digits()), true);
      });
      this.q("name").addEventListener("input", (e) => e.target.classList.remove("rkrs-af--bad"));

      const toggle = this.q("promo-toggle");
      if (toggle) {
        toggle.addEventListener("click", () => {
          this.q("promo").hidden = false;
          toggle.hidden = true;
          this.q("promo-input").focus();
        });
      }
      root.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        this.submit();
      });
      if (props.initialName) this.q("name").value = props.initialName;
      this.render(this.phone.parse(props.initialPhone || "", this.cur), Boolean(props.initialPhone));
    }

    callBackInstallSubmit(callback = () => {}) {
      ActivationRakurs.callbackInstall = callback;
    }

    digits() {
      return this.q("phone").value.replace(/\D/g, "");
    }

    fillCountries() {
      const sel = this.q("cc");
      sel.innerHTML = "";
      this.phone.countries.forEach((c, i) => {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = c.name + " +" + c.code;
        sel.appendChild(o);
      });
      sel.value = String(this.phone.countries.indexOf(this.cur));
    }

    render(r, reformat) {
      const p = this.phone;
      this.cur = r.country;
      this.last = r;
      this.q("cc").value = String(p.countries.indexOf(this.cur));
      this.q("cc-label").textContent = "+" + this.cur.code;
      const inp = this.q("phone");
      inp.placeholder = p.fmt("0".repeat(this.cur.len), this.cur.mask);
      if (reformat) inp.value = p.fmt(r.nat, this.cur.mask);
      const hint = this.q("hint");
      let text = "Укажите действующий номер: только по нему мы подтвердим, что аккаунт ваш, и сможем помочь с виджетом";
      let cls = "";
      if (r.st === "ok") {
        text = "✓ Сохраним: +" + this.cur.code + " " + p.fmt(r.nat, this.cur.mask) + " · " + this.cur.name;
        cls = "ok";
      } else if (r.st === "short") {
        text = "Не хватает цифр: " + r.nat.length + " из " + this.cur.len;
        cls = "bad";
      } else if (r.st === "long") {
        text = "Лишние цифры: " + r.nat.length + " вместо " + this.cur.len + " — проверьте номер";
        cls = "bad";
      }
      hint.textContent = text;
      hint.className = "rkrs-af__hint" + (cls ? " rkrs-af__hint--" + cls : "");
      this.q("phone-box").classList.toggle("rkrs-af--bad", r.st === "long");
    }

    showError(message) {
      const el = this.q("error");
      el.textContent = message;
      el.hidden = false;
      this.setBusy(false);
    }

    setBusy(busy) {
      this.q("submit").disabled = busy;
      this.q("submit-text").hidden = busy;
      this.q("submit-wait").hidden = !busy;
    }

    submit() {
      const r = this.phone.parse(this.q("phone").value, this.cur);
      this.render(r, true);
      const nameEl = this.q("name");
      const name = nameEl.value.trim();
      let ok = true;
      if (r.st !== "ok") {
        ok = false;
        this.q("phone-box").classList.add("rkrs-af--bad");
        if (r.st === "empty") {
          const hint = this.q("hint");
          hint.textContent = "Укажите телефон";
          hint.className = "rkrs-af__hint rkrs-af__hint--bad";
        }
      }
      if (!name) {
        ok = false;
        nameEl.classList.add("rkrs-af--bad");
      }
      if (!ok) return;
      this.q("error").hidden = true;
      const promo = this.q("promo-input");
      this.setBusy(true);
      this.sendData({
        phone: this.phone.fmt(r.nat, r.country.mask),
        name: name,
        country: r.country.name,
        code: r.country.code,
        promocode: promo ? promo.value.trim() : "",
      });
    }

    async sendData(data) {
      const phone = data.code + data.phone;
      const app = getApp();
      try {
        if (this.onSubmit) {
          const confirmed = await this.onSubmit({ name: data.name, phone: "+" + phone });
          if (!confirmed) {
            this.showError("Не удалось активировать доступ. Попробуйте ещё раз или напишите нам.");
            return;
          }
          $(this.root).html(successBodyHtml(ActivationRakurs.propsData.appName || "", ActivationRakurs.propsData.hasSettings));
          return;
        }
        const response = await fetch(BASE_URL + "/api/widget/install", {
          method: "POST",
          headers: { "Content-Type": "application/json;charset=utf-8" },
          body: JSON.stringify(Object.assign({}, data, { phoneFormat: phone }, ActivationRakurs.propsData, {
            version: ActivationRakurs.version,
            user: app.constant("user"),
            account: app.constant("account"),
          })),
        });
        if (response.status !== 200) {
          this.showError("Не удалось активировать доступ. Попробуйте ещё раз или напишите нам.");
          return;
        }
        await response.json();
        $('input[name="phone"]').val(phone);
        $('input[name="name"]').val(data.name);
        $('input[name="countryName"]').val(data.country);
        $(this.root).html(successBodyHtml(ActivationRakurs.propsData.appName || "", ActivationRakurs.propsData.hasSettings));
        setTimeout(() => {
          $(".widget_settings_block__controls .js-widget-save").trigger("click");
          setTimeout(() => ActivationRakurs.callbackInstall(), 1000);
        }, 200);
      } catch (error) {
        this.showError("Ошибка сети. Проверьте подключение и попробуйте ещё раз.");
      }
    }
  }

  ActivationRakurs.version = 2;
  ActivationRakurs.propsData = {};
  ActivationRakurs.callbackInstall = function () {};

  // Рендерим форму в свой под-контейнер, НЕ затирая контейнер настроек amoCRM:
  // в нём лежат скрытые input'ы (phone/name/...), которые amoCRM сохраняет по своей кнопке.
  function renderInHost(selector, html) {
    var $host = $(selector);
    var $root = $host.find("#rkrs-activation-root");
    if (!$root.length) {
      $host.prepend('<div id="rkrs-activation-root"></div>');
      $root = $host.find("#rkrs-activation-root");
    }
    $root.html(html);
    return $root.get(0);
  }

  function renderFallback(selector) {
    var html =
      '<div class="rkrs-af rkrs-af--single"><div class="rkrs-af__done">' +
      '<p class="rkrs-af__sub">Не удалось загрузить форму активации. Обновите страницу или напишите нам:</p>' +
      '<a class="rkrs-af__link-strong" href="' + SUPPORT_WA + '" target="_blank" rel="noopener noreferrer">Написать в WhatsApp</a>' +
      '<p class="rkrs-af__foot">+7 (921) 437-78-86 · amo@rkrs.ru</p>' +
      "</div></div>";
    try {
      renderInHost(selector, html);
    } catch (error) {
      // Окно настроек уже закрыто или его контейнер недоступен.
    }
  }

  function mount(selector, opts) {
    try {
      var app = getApp();
      var accountId = app && app.constant("account") ? app.constant("account").id : null;
      if (!accountId) {
        injectStyles(selector);
        renderFallback(selector);
        return;
      }
      injectStyles(selector);
      var isPaid = opts.isPaid !== false;
      var root = renderInHost(selector, formHtml(isPaid, opts.trialDays, Boolean(opts.onSubmit)));
      window.rakurs = new ActivationRakurs(root, {
        accountId: accountId,
        appName: opts.appName,
        isPaid: isPaid,
        hasSettings: opts.hasSettings !== false,
        onSubmit: opts.onSubmit,
        initialName: opts.initialName,
        initialPhone: opts.initialPhone,
      });
      window.rakurs.callBackInstallSubmit(opts.onSuccess || function () {});
    } catch (error) {
      renderFallback(selector);
    }
  }

  var RkrsActivationForm = {
    /**
     * selector — куда монтировать; opts: { appName, isPaid, trialDays, hasSettings, isActive, onSuccess }
     * trialDays — срок теста: TOP — 90, PRO — 7 (КА — 14). Не передан — 14.
     * accountId/user/account модуль берёт сам из APP.constant.
     * isActive:true — настройки виджета уже сохранены (get_settings().active === "Y") → сразу success-экран.
     * hasSettings:false — у виджета нет страницы настроек, кнопку «Перейти в настройки» не рисуем.
     */
    render: function (selector, opts) {
      opts = opts || {};
      if (opts.isActive === true && opts.appName) {
        injectStyles(selector);
        renderInHost(selector, successBodyHtml(opts.appName, opts.hasSettings));
        return;
      }
      mount(selector, opts);
    },
    // для тестов: логика телефона без DOM
    _phone: makePhone,
    _fallbackCountries: FALLBACK_COUNTRIES,
  };

  // Цвета и шрифт — как в окнах amoCRM («Меню amo»). Всё под .rkrs-af, чтобы не задеть amoCRM.
  var FORM_CSS =
    ".widget_settings_block__controls_top button{visibility:hidden}.widget_settings_block__descr{display:none}" +
    ".rkrs-af{--af-text:#363b44;--af-text-2:#6b6d72;--af-text-3:#92989b;--af-bg:#fff;--af-bg-2:#f5f5f5;--af-line:#e3e3e3;--af-line-2:#c5c5c5;" +
    "--af-blue:#4c8bf7;--af-blue-hover:#3f7de6;--af-blue-soft:#edf3fe;--af-link:#0057a9;--af-ok:#2e9e5b;--af-ok-soft:#eaf7ef;--af-bad:#e5484d;" +
    "font-family:'PT Sans','Helvetica Neue',Arial,sans-serif;color:var(--af-text);background:var(--af-bg);border:1px solid var(--af-line);border-radius:6px;overflow:hidden;" +
    "display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));max-width:820px;margin:20px auto;box-sizing:border-box;text-align:left}" +
    ".rkrs-af *{box-sizing:border-box}.rkrs-af [hidden]{display:none!important}" +
    ".rkrs-af--single{grid-template-columns:minmax(0,1fr);max-width:480px}" +
    ".rkrs-af--card{max-width:440px}.rkrs-af--card .rkrs-af__main{padding:28px 30px 24px;gap:18px}.rkrs-af--card .rkrs-af__title{font-size:20px}" +
    ".rkrs-af__lead{display:flex;align-items:center;gap:20px}.rkrs-af__lead>div:last-child{min-width:0}" +
    ".rkrs-af__cal{flex:none;position:relative;width:84px;padding:24px 0 10px;border:2px solid #2a1b00;border-radius:4px;background:#fff8e6;transform:rotate(-4deg);box-shadow:3px 3px 0 #2a1b00;text-align:center;color:#2a1b00;line-height:1}" +
    ".rkrs-af__cal i{position:absolute;left:0;right:0;top:0;height:15px;background:linear-gradient(135deg,#f6b12f,#e08a00);border-bottom:2px solid #2a1b00}" +
    ".rkrs-af__cal b{display:block;font-size:38px;font-weight:700;letter-spacing:-.02em}" +
    ".rkrs-af__cal span{display:block;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-top:3px}" +
    ".rkrs-af__main{padding:28px 28px 24px;display:grid;gap:16px;align-content:start;margin:0}" +
    ".rkrs-af__title{margin:0;font-size:22px;font-weight:700;color:var(--af-text);line-height:1.25}" +
    ".rkrs-af__sub{margin:4px 0 0;color:var(--af-text-2);font-size:15px}" +
    ".rkrs-af__field{display:grid;gap:6px;margin:0;cursor:default}.rkrs-af__field>span{font-size:13px;color:var(--af-text-2)}" +
    ".rkrs-af__phone{display:flex;border:1px solid var(--af-line-2);border-radius:4px;background:var(--af-bg)}" +
    ".rkrs-af__phone:focus-within,.rkrs-af__input:focus{border-color:var(--af-blue);box-shadow:0 0 0 3px var(--af-blue-soft);outline:none}" +
    ".rkrs-af__cc{position:relative;display:flex;align-items:center;gap:6px;padding:0 10px 0 12px;border-right:1px solid var(--af-line);font-size:15px;white-space:nowrap;color:var(--af-text)}" +
    ".rkrs-af__cc:after{content:'';width:6px;height:6px;border-right:1.5px solid var(--af-text-3);border-bottom:1.5px solid var(--af-text-3);transform:rotate(45deg) translateY(-2px)}" +
    ".rkrs-af__cc select{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer;font-size:15px}" +
    ".rkrs-af__phone input,.rkrs-af__input{font:16px 'PT Sans','Helvetica Neue',Arial,sans-serif;color:var(--af-text);padding:10px 12px;min-width:0;width:100%;height:auto;line-height:1.3;background:transparent;border:0;outline:none;box-shadow:none}" +
    ".rkrs-af__phone input{flex:1}" +
    ".rkrs-af__input{border:1px solid var(--af-line-2);border-radius:4px;background:var(--af-bg)}" +
    ".rkrs-af__phone input::placeholder,.rkrs-af__input::placeholder{color:var(--af-text-3)}" +
    ".rkrs-af .rkrs-af--bad{border-color:var(--af-bad)!important}" +
    ".rkrs-af__hint{font-size:13px;min-height:19px;color:var(--af-text-3)}.rkrs-af__hint--ok{color:var(--af-ok)}.rkrs-af__hint--bad{color:var(--af-bad)}" +
    ".rkrs-af__link{justify-self:start;background:none;border:0;border-bottom:1px dashed currentColor;padding:0;color:var(--af-link);font:14px 'PT Sans','Helvetica Neue',Arial,sans-serif;cursor:pointer}" +
    ".rkrs-af__error{color:var(--af-bad);font-size:14px}" +
    ".rkrs-af__btn{font:700 15px 'PT Sans','Helvetica Neue',Arial,sans-serif;color:#fff;background:var(--af-blue);border:0;border-radius:4px;padding:12px 18px;cursor:pointer;width:100%;text-decoration:none;text-align:center}" +
    ".rkrs-af__btn:hover{background:var(--af-blue-hover)}.rkrs-af__btn:disabled{opacity:.7;cursor:wait}" +
    ".rkrs-af__btn--inline{display:inline-block;width:auto;padding:12px 40px;margin-top:10px;color:#fff!important}" +
    ".rkrs-af__btn:focus-visible,.rkrs-af__link:focus-visible{outline:2px solid var(--af-blue);outline-offset:2px}" +
    ".rkrs-af__foot{margin:0;font-size:13px;color:var(--af-text-2);line-height:1.45}.rkrs-af__foot a,.rkrs-af__link-strong{color:var(--af-link)}" +
    ".rkrs-af__done{display:grid;gap:8px;justify-items:center;text-align:center;padding:36px 24px}" +
    ".rkrs-af__tick{width:48px;height:48px;border-radius:50%;background:var(--af-ok-soft);color:var(--af-ok);display:grid;place-items:center;font-size:24px;font-weight:700}" +
    ".dark-theme .rkrs-af{--af-text:#e5eaf3;--af-text-2:#aab3bd;--af-text-3:#7f8992;--af-bg:#1b2229;--af-bg-2:#222b33;--af-line:#2f3a44;--af-line-2:#44515c;--af-blue-soft:#1f3350;--af-link:#7fb0ff;--af-ok-soft:#173326}";

  return RkrsActivationForm;
});
