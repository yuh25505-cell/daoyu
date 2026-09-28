(function () {
  function show(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.whiteSpace = 'normal';
    t.style.wordBreak = 'break-all';
    t.style.width = '92%';
    t.style.maxWidth = '92%';
    t.style.fontSize = '12px';
    t.style.textAlign = 'left';
    t.style.lineHeight = '1.4';
    t.classList.add('is-show');
    clearTimeout(window.__capDiagTimer);
    window.__capDiagTimer = setTimeout(function () { t.classList.remove('is-show'); }, 20000);
  }
  function run() {
    try {
      var C = window.Capacitor;
      var msg = 'CapDiag Cap=' + !!C;
      var hdrs = (C && C.PluginHeaders) || [];
      var names = [];
      for (var i = 0; i < hdrs.length; i++) names.push(hdrs[i].name);
      msg += ' hdrCount=' + names.length + ' hasIsland=' + (names.indexOf('IslandNative') >= 0);
      msg += ' hdr=' + names.join(',');
      var P = C.registerPlugin('IslandNative');
      msg += ' fn=' + typeof P.getNotificationPermissionState;
      if (typeof P.getNotificationPermissionState === 'function') {
        P.getNotificationPermissionState({}).then(function (r) {
          show(msg + ' res=' + JSON.stringify(r));
        }).catch(function (e) {
          show(msg + ' err=' + (e && e.message));
        });
      } else {
        show(msg);
      }
    } catch (e) {
      show('CapDiag exception ' + (e && e.message));
    }
  }
  if (document.readyState === 'complete') setTimeout(run, 1500);
  else window.addEventListener('load', function () { setTimeout(run, 1500); });
})();
