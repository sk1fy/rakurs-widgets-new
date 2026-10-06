/* Preserve the existing diagnostic widget and add distribution in its own host. */
define(['jquery', './lib/legacy-widget.js', './lib/distribution-adapter.js'], function ($, Legacy, Distribution) {
  'use strict';
  return function () {
    var self = this;
    Legacy.call(self);
    var legacy = self.callbacks;
    var facade = Object.create(self);
    ['get_settings', 'i18n', 'system', 'get_version', '$authorizedAjax'].forEach(function (name) {
      if (typeof self[name] === 'function') {
        facade[name] = function () { return self[name].apply(self, arguments); };
      }
    });
    facade.render_template = function (template) {
      var root = document.querySelector('.amopro-tester');
      if (!root || !root.parentNode) return;
      var section = root.parentNode.querySelector('[data-amopro-distribution-card]');
      if (!section) {
        section = document.createElement('section');
        section.setAttribute('data-amopro-distribution-card', '');
        root.parentNode.appendChild(section);
      }
      section.innerHTML = '<h3>Распределение сделок</h3>' + template.render;
    };
    Distribution.call(facade);
    var distribution = facade.callbacks;
    function both(name, args) {
      var first = typeof legacy[name] === 'function' ? legacy[name].apply(self, args) : true;
      var second = typeof distribution[name] === 'function' ? distribution[name].apply(facade, args) : true;
      return first !== false && second !== false;
    }
    self.callbacks = {
      render: function () {
        legacy.render.apply(self, arguments);
        if (self.system().area === 'lcard') distribution.render.apply(facade, arguments);
        return true;
      },
      init: function () { return both('init', arguments); },
      bind_actions: function () { return both('bind_actions', arguments); },
      settings: function () { return both('settings', arguments); },
      advancedSettings: function () { return distribution.advancedSettings.apply(facade, arguments); },
      dpSettings: function () { return distribution.dpSettings.apply(facade, arguments); },
      onSave: function () { return both('onSave', arguments); },
      destroy: function () { return both('destroy', arguments); }
    };
    return self;
  };
});
