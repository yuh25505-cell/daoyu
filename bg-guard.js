(function () {
  'use strict';

  // bg-guard: while an AI request (cross-origin POST) is in flight, hold keep-alive temporarily
  // (silent audio + Android foreground service + Web Lock), even if the user's switch is off,
  // so a reply that is being generated is not cut off when the user switches app / screen.
  // (Reply delivery and per-message system notifications live in app.js itself.)
  if (window.__islandBgGuardLoaded) return;
  window.__islandBgGuardLoaded = true;

  var inflight = 0;
  var genSeq = 0;

  function KA() { return window.IslandKeepAlive || null; }

  function beginRequest() {
    inflight++;
    var k = KA();
    if (k) k.hold('generation');
    var finished = false;
    var unlock = null;
    try {
      if (navigator.locks && navigator.locks.request) {
        navigator.locks.request('island-generation-' + (++genSeq), function () {
          return new Promise(function (resolve) {
            unlock = resolve;
            if (finished) resolve();
          });
        }).catch(function () {});
      }
    } catch (e) {}
    var safety = setTimeout(end, 10 * 60 * 1000);
    function end() {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      inflight = Math.max(0, inflight - 1);
      if (unlock) unlock();
      var k2 = KA();
      if (k2) k2.release('generation', 30000);
    }
    return end;
  }

  function shouldTrack(input, init) {
    var method = (init && init.method) || (input && input.method) || 'GET';
    if (String(method).toUpperCase() !== 'POST') return false;
    var url = typeof input === 'string' ? input : ((input && input.url) || String(input));
    var u = new URL(url, location.href);
    if (u.origin === location.origin) return false;
    return u.protocol === 'http:' || u.protocol === 'https:';
  }

  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      var track = false;
      try { track = shouldTrack(input, init); } catch (e) { track = false; }
      if (!track) return origFetch.apply(this, arguments);
      var end = beginRequest();
      var p;
      try { p = origFetch.apply(this, arguments); } catch (e) { end(); throw e; }
      return p.then(function (res) {
        try {
          // The request is only "done" once the (possibly streamed) body has been fully received.
          var clone = res.clone();
          if (clone.body && clone.body.getReader) {
            var reader = clone.body.getReader();
            (function pump() {
              reader.read().then(function (r) { if (r.done) end(); else pump(); }, end);
            })();
          } else {
            clone.arrayBuffer().then(end, end);
          }
        } catch (e) { end(); }
        return res;
      }, function (err) { end(); throw err; });
    };
  }

  window.IslandBgGuard = {
    status: function () { return { inflight: inflight }; }
  };
})();
