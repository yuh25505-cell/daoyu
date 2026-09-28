// Capacitor's native bridge injects window.Capacitor into the WebView, but the
// registerPlugin() helper only exists when @capacitor/core is bundled into the web app.
// This app is plain static JS (no bundler), so provide a minimal registerPlugin() on top
// of the bridge's own Plugins map / nativePromise so app.js can call the native plugin.
(function () {
  var C = window.Capacitor;
  if (!C || typeof C.registerPlugin === 'function') return;
  C.registerPlugin = function (name) {
    if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
    if (typeof C.nativePromise !== 'function') return {};
    return new Proxy({}, {
      get: function (_target, method) {
        if (typeof method !== 'string' || method === 'then') return undefined;
        return function (options) {
          return C.nativePromise(name, method, options || {});
        };
      }
    });
  };
})();
