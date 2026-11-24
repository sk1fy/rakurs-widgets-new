define([], function () {
  'use strict';
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
      return out;
    }
    return { countries: countries, ru: ru, parse: parse, fmt: fmt, status: status };
  }

  return makePhone(FALLBACK_COUNTRIES);
});
