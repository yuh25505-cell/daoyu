(function () {
  'use strict';

  // Background keep-alive switch (设置 → 通知 → 后台保活).
  //  - Web / PWA : loops a 30 s inaudible audio clip (+ Media Session) so the browser keeps the page alive.
  //  - Android APK: additionally starts a native foreground service (silent AudioTrack + wake lock)
  //                 via the IslandNative plugin, and can request the battery-optimization exemption.
  //  - window.IslandKeepAlive.hold()/release(): bg-guard.js uses these to protect AI generation
  //    even when the switch is off (temporary keep-alive while a request is in flight).
  if (window.__islandKeepAliveLoaded) return;
  window.__islandKeepAliveLoaded = true;

  var LS_KEY = 'island.keepAlive';
  // Older builds stored the flag in IndexedDB; read it once as a fallback.
  var LEGACY_DB = 'Island';
  var LEGACY_STORE = 'kv';
  var LEGACY_KEY = 'island.keepAlive';

  var enabled = false;          // the user's switch
  var holds = Object.create(null);
  var holdCount = 0;            // temporary holds (AI generation in flight)
  var releaseTimer = null;
  var runtimeOn = false;        // audio / service actually running
  var guardText = '已启用';
  var audioEl = null;
  var audioUrl = null;
  var bound = false;
  var nativeStartedAt = 0;

  function desired() { return enabled || holdCount > 0; }

  function toast(msg) {
    try {
      var el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('is-show');
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { el.classList.remove('is-show'); }, 2600);
    } catch (e) {}
  }

  // ---------- native bridge (APK only) ----------
  function nativePlugin() {
    try {
      var C = window.Capacitor;
      if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
      if (typeof C.registerPlugin !== 'function') return null;
      return C.registerPlugin('IslandNative');
    } catch (e) { return null; }
  }

  function nativeStart() {
    var N = nativePlugin();
    if (!N || typeof N.startKeepAlive !== 'function') return;
    nativeStartedAt = Date.now();
    N.startKeepAlive().catch(function () {
      toast('原生保活服务启动失败');
    });
  }

  function nativeStop() {
    var N = nativePlugin();
    if (!N || typeof N.stopKeepAlive !== 'function') return;
    N.stopKeepAlive().catch(function () {});
  }

  // The notification's "关闭保活" button stops the service without telling the page.
  function syncNative() {
    var N = nativePlugin();
    if (!N || !desired()) return;
    if (Date.now() - nativeStartedAt < 3000) return;
    N.isKeepAliveRunning().then(function (r) {
      if (!r || r.running) return;
      if (r.userStopped) {
        holds = Object.create(null);
        holdCount = 0;
        setEnabled(false);
        toast('已通过通知关闭后台保活');
      } else {
        nativeStart(); // killed by the system: bring it back while we are in the foreground
      }
    }).catch(function () {});
  }

  function refreshBattery() {
    var N = nativePlugin();
    var stateEl = document.getElementById('keepAliveBatteryState');
    if (!N || !stateEl) return;
    N.isIgnoringBatteryOptimizations().then(function (r) {
      stateEl.textContent = r && r.ignoring ? '已忽略（推荐）' : '未忽略';
    }).catch(function () { stateEl.textContent = '未知'; });
  }

  // ---------- persistence ----------
  function legacyRead() {
    return new Promise(function (resolve) {
      var req;
      try { req = indexedDB.open(LEGACY_DB); } catch (e) { resolve(false); return; }
      req.onerror = function () { resolve(false); };
      req.onupgradeneeded = function () { try { req.transaction.abort(); } catch (e) {} };
      req.onsuccess = function () {
        var db = req.result;
        try {
          if (!db.objectStoreNames.contains(LEGACY_STORE)) { db.close(); resolve(false); return; }
          var r = db.transaction([LEGACY_STORE], 'readonly').objectStore(LEGACY_STORE).get(LEGACY_KEY);
          r.onsuccess = function () { db.close(); resolve(!!(r.result && r.result.value && r.result.value.enabled)); };
          r.onerror = function () { db.close(); resolve(false); };
        } catch (e) { try { db.close(); } catch (e2) {} resolve(false); }
      };
    });
  }

  function load() {
    try {
      var v = localStorage.getItem(LS_KEY);
      if (v !== null) return Promise.resolve(v === '1');
    } catch (e) {}
    return legacyRead();
  }

  function save(v) {
    try { localStorage.setItem(LS_KEY, v ? '1' : '0'); }
    catch (e) { toast('保活设置保存失败'); }
  }

  // ---------- keep-alive audio ----------
  // 30 s of mono 16-bit 8 kHz PCM: a 20 Hz sine at amplitude 40/32768 (about -58 dBFS).
  // Phones cannot reproduce 20 Hz at that level, so it is inaudible, yet browsers still treat it as
  // real playback. Browsers ignore all-zero audio and clips shorter than ~5 s (no media
  // notification, no background priority).
  // 20 Hz x 30 s is a whole number of cycles, so the loop is seamless.
  // The Android foreground service (patch_keepalive.mjs) plays the same signal.
  function buildSilentWav() {
    var rate = 8000, seconds = 30, n = rate * seconds;
    var buf = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      v.setInt16(44 + i * 2, Math.round(40 * Math.sin(2 * Math.PI * 20 * i / rate)), true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  function ensureAudio() {
    if (audioEl) return audioEl;
    try {
      audioUrl = URL.createObjectURL(buildSilentWav());
      audioEl = new Audio(audioUrl);
      audioEl.loop = true;
      audioEl.volume = 1;
      audioEl.setAttribute('playsinline', '');
      audioEl.setAttribute('preload', 'auto');
      // Publish the media notification only once playback has really started.
      audioEl.addEventListener('playing', function () { if (desired()) setMediaSession(true); });
      // The system or another app can pause us (calls, audio focus); come back if still wanted.
      audioEl.addEventListener('pause', function () {
        if (desired()) setTimeout(function () { if (desired()) startAudio(); }, 600);
      });
    } catch (e) { audioEl = null; }
    return audioEl;
  }

  function startAudio() {
    var el = ensureAudio();
    if (!el) return;
    bindResume();
    try {
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* needs a user gesture; retried on next touch */ });
    } catch (e) {}
  }

  function stopAudio() {
    if (!audioEl) return;
    try { audioEl.pause(); audioEl.currentTime = 0; } catch (e) {}
  }

  function setMediaSession(on) {
    if (!('mediaSession' in navigator)) return;
    try {
      if (on) {
        if (typeof MediaMetadata === 'function') {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: '岛屿',
            artist: '后台保活中',
            album: '岛屿',
            artwork: [
              { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: './icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
          });
        }
        navigator.mediaSession.playbackState = 'playing';
        var off = function () { setEnabled(false); };
        navigator.mediaSession.setActionHandler('pause', off);
        navigator.mediaSession.setActionHandler('stop', off);
      } else {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
      }
    } catch (e) {}
  }

  function resume() {
    if (desired() && audioEl && audioEl.paused) startAudio();
    else if (desired() && !audioEl) startAudio();
  }

  function bindResume() {
    if (bound) return;
    bound = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      resume();
      syncNative();
      refreshBattery();
    });
    document.addEventListener('touchstart', resume, { passive: true });
    document.addEventListener('click', resume);
    window.addEventListener('pageshow', resume);
  }

  // ---------- state / UI ----------
  function render() {
    var toggle = document.getElementById('keepAliveToggle');
    var hint = document.getElementById('keepAliveHint');
    if (toggle) {
      toggle.classList.toggle('is-on', enabled);
      toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
    }
    if (hint) {
      hint.textContent = enabled ? '已开启' : (holdCount > 0 ? '关闭（AI 生成中，临时保活）' : '关闭');
    }
  }

  // Start / stop the audio + native service according to switch OR temporary holds.
  function applyRuntime(force) {
    var on = desired();
    if (!force && on === runtimeOn) return;
    runtimeOn = on;
    if (on) {
      startAudio();
      setMediaSession(true);
      nativeStart();
    } else {
      stopAudio();
      setMediaSession(false);
      nativeStop();
    }
  }

  function apply(force) {
    applyRuntime(force);
    render();
  }

  function setEnabled(next) {
    enabled = !!next;
    apply(false);
    save(enabled);
  }

  window.IslandKeepAlive = {
    isEnabled: function () { return enabled; },
    isActive: function () { return runtimeOn; },
    hold: function (key) {
      key = key || 'default';
      holds[key] = (holds[key] || 0) + 1;
      holdCount++;
      if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
      apply(false);
    },
    release: function (key, graceMs) {
      key = key || 'default';
      if (!holds[key]) return;
      holds[key]--;
      holdCount = Math.max(0, holdCount - 1);
      if (holdCount === 0) {
        if (releaseTimer) clearTimeout(releaseTimer);
        releaseTimer = setTimeout(function () {
          releaseTimer = null;
          apply(false);
        }, typeof graceMs === 'number' ? graceMs : 30000);
      }
      render();
    },
    setGuardState: function (text) {
      guardText = String(text || '');
      var el = document.getElementById('bgGuardState');
      if (el) el.textContent = guardText;
    }
  };

  function mount() {
    if (document.getElementById('keepAliveToggle')) return;
    var panel = document.querySelector('.settings-panel[data-panel="notifications"] .panel-scroll');
    if (!panel) return;

    var isNative = !!nativePlugin();
    var note = isNative
      ? '开启后会启动一个前台服务（通知栏会显示“岛屿正在后台运行”）并循环播放几乎无声的音频、保持 CPU 唤醒，尽量避免角色主动消息的后台定时器被系统暂停或回收。AI 生成回复期间即使开关关闭也会自动临时保活。会增加耗电；部分国产系统还需要在系统设置中允许“自启动”和“后台运行”，并建议下方“忽略电池优化”。'
      : '开启后循环播放一段几乎无声的音频，通知中心会出现“岛屿 · 后台保活中”的媒体卡片，帮助减少角色主动消息的后台定时器被浏览器暂停的概率。AI 生成回复期间即使开关关闭也会自动临时保活。浏览器要求先有一次点按才能播放；不保证在所有设备和省电策略下都生效，会消耗少量电量。';

    var html =
      '<div class="settings-section-title">后台保活</div>' +
      '<div class="appearance-menu notification-menu">' +
      '<button type="button" class="appearance-row" id="keepAliveToggle" role="switch" aria-checked="false">' +
      '<span class="appearance-copy"><strong>静音音频保活</strong><em id="keepAliveHint">关闭</em></span>' +
      '<span aria-hidden="true" class="appearance-switch"></span>' +
      '</button>' +
      '<div class="notification-status-row"><span>AI 生成保护</span><strong id="bgGuardState">' + guardText + '</strong></div>' +
      (isNative
        ? '<div class="notification-status-row"><span>电池优化</span><strong id="keepAliveBatteryState">未检查</strong></div>' +
          '<div class="notification-actions"><button class="appearance-upload-btn" id="keepAliveBatteryBtn" type="button">忽略电池优化</button></div>'
        : '') +
      '<div class="notification-status-row" style="white-space:normal;line-height:1.5;padding-top:6px;">' +
      '<span style="color:var(--fg-faint);font-size:12px;">' + note + '</span>' +
      '</div>' +
      '</div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    while (wrap.firstChild) panel.appendChild(wrap.firstChild);

    var toggle = document.getElementById('keepAliveToggle');
    if (toggle) toggle.addEventListener('click', function () { setEnabled(!enabled); });

    var batteryBtn = document.getElementById('keepAliveBatteryBtn');
    if (batteryBtn) {
      batteryBtn.addEventListener('click', function () {
        var N = nativePlugin();
        if (!N) return;
        N.requestIgnoreBatteryOptimizations().catch(function () {
          toast('无法打开系统电池设置，请在系统设置中手动操作');
        });
      });
      refreshBattery();
    }
    render();
  }

  function boot() {
    mount();
    load().then(function (v) {
      enabled = !!v;
      apply(true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // The notifications panel may be built lazily; keep trying briefly.
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (document.getElementById('keepAliveToggle') || tries > 40) { clearInterval(timer); return; }
    mount();
  }, 500);
})();
