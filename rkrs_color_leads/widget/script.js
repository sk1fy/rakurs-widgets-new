/* Engineering shell only. PV-03 must bind its route path/read gateway before installation.
 * Deliberately no legacy bootstrap and no guessed route API or direct CRM fallback. */
define([], function () {
  var ASSETS = "__RKRS_COLOR_ASSETS_URL__";
  var BUNDLE = "__RKRS_COLOR_BUNDLE__";
  var API = "__RKRS_COLOR_API_URL__";
  return function () {
    this.callbacks = {
      render: function () { return true; },
      init: function () { return false; },
      bind_actions: function () { return false; },
      settings: function () { return false; },
      advancedSettings: function () { return false; },
      onSave: function () { return false; },
      destroy: function () { return true; }
    };
    // Constants are reserved for the shared build; no automatic activation.
    this.engineeringConfiguration = {assets:ASSETS,bundle:BUNDLE,api:API,activationAllowed:false};
    return this;
  };
});
