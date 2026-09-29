(function () {
  'use strict';

  var DB_NAME = 'Island';
  var STORE = 'kv';
  var KEY = 'island.keepAlive';

  // 0.2s of silent 8-bit PCM WAV, looped. Kept intentionally tiny.
  var SILENT_WAV =
    'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAGAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

  function toast(msg) {
    try {
      var el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('is-show');
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { el.classList.remove('is-show'); }, 2400);
    } catch (e) {}
  }

  function openStore() {
    return new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB_NAME); } catch (e) { reject(e); return; }
      req.onsuccess = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) { db.close(); reject(new Error('store missing')); return; }
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('open failed')); };
      req.onupgradeneeded = function () {
        // The main app hasn't created its store yet; nothing to read/write yet.
        try { req.transaction.abort(); } catch (e) {}
      };
    });
  }

  function readEnabled() {
    return openStore().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction([STORE], 'readonly');
          var r = tx.objectStore(STORE).get(KEY);
          r.onsuccess = function () { resolve(!!(r.result && r.result.value && r.result.value.enabled)); };
          r.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).catch(function () { return false; });
  }

  function writeEnabled(enabled) {
    return openStore().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction([STORE], 'readwrite');
          tx.objectStore(STORE).put({ key: KEY, value: { enabled: enabled } });
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).catch(function () { return false; });
  }

  var audioEl = null;
  var resumeBound = false;
  var currentEnabled = false;

  function ensureAudio() {
    if (!audioEl) {
      try {
        audioEl = new Audio(SILENT_WAV);
        audioEl.loop = true;
        audioEl.volume = 0.01;
        audioEl.setAttribute('playsinline', '');
        audioEl.setAttribute('preload', 'auto');
      } catch (e) { audioEl = null; }
    }
    return audioEl;
  }

  function bindResume() {
    if (resumeBound) return;
    resumeBound = true;
    var retry = function () { if (currentEnabled) startAudio(); };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) retry(); });
    document.addEventListener('touchstart', retry, { passive: true });
    document.addEventListener('click', retry);
    window.addEventListener('pageshow', retry);
  }

  function startAudio() {
    var el = ensureAudio();
    if (!el) return;
    bindResume();
    try {
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  function stopAudio() {
    if (!audioEl) return;
    try { audioEl.pause(); audioEl.currentTime = 0; } catch (e) {}
  }

  function render() {
    var toggle = document.getElementById('keepAliveToggle');
    var hint = document.getElementById('keepAliveHint');
    if (toggle) { toggle.classList.toggle('is-on', currentEnabled); toggle.setAttribute('aria-checked', currentEnabled ? 'true' : 'false'); }
    if (hint) hint.textContent = currentEnabled ? '已开启' : '关闭';
  }

  function apply() {
    if (currentEnabled) startAudio(); else stopAudio();
    render();
  }

  function mount() {
    if (document.getElementById('keepAliveToggle')) return;
    var panel = document.querySelector('.settings-panel[data-panel="notifications"] .panel-scroll');
    if (!panel) return;

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="settings-section-title">后台保活</div>' +
      '<div class="appearance-menu notification-menu">' +
      '<button type="button" class="appearance-row" id="keepAliveToggle" role="switch" aria-checked="false">' +
      '<span class="appearance-copy"><strong>静音音频保活</strong><em id="keepAliveHint">关闭</em></span>' +
      '<span aria-hidden="true" class="appearance-switch"></span>' +
      '</button>' +
      '<div class="notification-status-row" style="white-space:normal;line-height:1.5;padding-top:6px;">' +
      '<span style="color:var(--fg-faint);font-size:12px;">开启后循环播放一段几乎无声的音频，帮助减少角色主动消息的后台定时器被系统暂停/回收的概率；不保证在所有设备和省电策略下都生效，会消耗少量电量。</span>' +
      '</div>' +
      '</div>';
    while (wrap.firstChild) panel.appendChild(wrap.firstChild);

    var toggle = document.getElementById('keepAliveToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        currentEnabled = !currentEnabled;
        apply();
        writeEnabled(currentEnabled).then(function (ok) {
          if (!ok) toast('保活设置保存失败');
        });
      });
    }
    render();
  }

  function boot() {
    mount();
    readEnabled().then(function (enabled) {
      currentEnabled = enabled;
      apply();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // The notifications panel may be built/populated lazily; keep trying briefly.
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (document.getElementById('keepAliveToggle') || tries > 40) { clearInterval(timer); return; }
    mount();
  }, 500);
})();
