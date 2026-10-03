(function () {
  'use strict';

  // bg-guard: keeps AI replies running while the user switches screens / apps, and raises one
  // system notification per incoming character message (like a chat app), in the web build and
  // in the APK. Loaded from api-backup.js; works without touching app.js internals.
  //
  //  1. Generation protection: while an AI request (cross-origin POST) is in flight, keep-alive is
  //     held temporarily (silent audio + Android foreground service + Web Lock), even if the
  //     user's switch is off.
  //  2. Abort guard: AbortController.abort() calls made by page-lifecycle events (hide / blur /
  //     pagehide ...) or by closePM() (leaving a chat) are ignored while a request is in flight.
  //  3. Message notifications: after anything is persisted (localStorage / IndexedDB writes),
  //     diff window.Island.backup() and notify every new incoming message, unless the user is
  //     looking at a chat right now. The app's own chat notifications are replaced by these
  //     (only once this monitor has proven it can read the data) so nothing is duplicated.
  if (window.__islandBgGuardLoaded) return;
  window.__islandBgGuardLoaded = true;

  var DEBUG = false;
  function log() {
    if (!DEBUG) return;
    try { console.debug.apply(console, ['[bg-guard]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function KA() { return window.IslandKeepAlive || null; }
  function setState(text) { var k = KA(); if (k && k.setGuardState) k.setGuardState(text); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var inflight = 0;
  var lifecycleDepth = 0;
  var genSeq = 0;
  var healthy = false;

  // ---------------------------------------------------------------- 1. generation protection
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

  (function wrapFetch() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function') return;
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
  })();

  // ---------------------------------------------------------------- 2. abort guard
  (function guardAborts() {
    function enterLifecycle() {
      lifecycleDepth++;
      setTimeout(function () { lifecycleDepth = Math.max(0, lifecycleDepth - 1); }, 0);
    }
    ['visibilitychange', 'pagehide', 'freeze', 'blur', 'resume', 'pageshow'].forEach(function (t) {
      try { window.addEventListener(t, enterLifecycle, true); } catch (e) {}
      try { document.addEventListener(t, enterLifecycle, true); } catch (e) {}
    });

    if (typeof AbortController !== 'function') return;
    var nativeAbort = AbortController.prototype.abort;
    AbortController.prototype.abort = function () {
      try {
        if (inflight > 0) {
          var stack = String(new Error().stack || '');
          if (lifecycleDepth > 0 || /\bclosePM\b/.test(stack)) {
            log('ignored abort (lifecycle / leaving chat while generating)');
            return;
          }
        }
      } catch (e) {}
      return nativeAbort.apply(this, arguments);
    };
  })();

  // ---------------------------------------------------------------- 3. message notifications
  function nativeCap() {
    var C = window.Capacitor;
    return (C && typeof C.isNativePlatform === 'function' && C.isNativePlatform()) ? C : null;
  }

  var origNativePromise = null;
  (function wrapNative() {
    var C = nativeCap();
    if (!C || typeof C.nativePromise !== 'function') return;
    var orig = C.nativePromise;
    origNativePromise = function (plugin, method, options) { return orig.call(C, plugin, method, options); };
    C.nativePromise = function (plugin, method, options) {
      try {
        // Replace the app's own per-chat notification once our monitor is healthy.
        if (healthy && plugin === 'IslandNative' && method === 'showWebNotification' &&
            options && String(options.tag || '').indexOf('island-chat-') === 0) {
          log('dropped app chat notification');
          return Promise.resolve({ shown: true, state: 'granted', dropped: true });
        }
      } catch (e) {}
      return orig.call(C, plugin, method, options);
    };
  })();

  function shouldDropAppNotification(opts) {
    return !!(healthy && opts && opts.data && opts.data.island === 'chat' && !opts.data.bg);
  }

  (function wrapServiceWorkerNotification() {
    try {
      if (!window.ServiceWorkerRegistration || !ServiceWorkerRegistration.prototype.showNotification) return;
      var orig = ServiceWorkerRegistration.prototype.showNotification;
      ServiceWorkerRegistration.prototype.showNotification = function (title, opts) {
        if (shouldDropAppNotification(opts)) { log('dropped app SW chat notification'); return Promise.resolve(); }
        return orig.apply(this, arguments);
      };
    } catch (e) {}
  })();

  function deliver(title, body, id) {
    var C = nativeCap();
    if (C && origNativePromise) {
      return origNativePromise('IslandNative', 'showWebNotification', {
        title: title, body: body, tag: 'island-msg-' + id, url: ''
      }).catch(function () {});
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return Promise.resolve(false);
    var opts = {
      body: body, tag: 'island-msg-' + id, icon: './icon-192.png', badge: './icon-192.png',
      data: { island: 'chat', name: title, url: './', bg: 1 }
    };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        return navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.showNotification) return reg.showNotification(title, opts);
          return new Notification(title, opts);
        }).catch(function () {});
      }
      return Promise.resolve(new Notification(title, opts));
    } catch (e) { return Promise.resolve(false); }
  }

  // ---- reading the app's data (window.Island.backup(), same API the backup page uses) ----
  function isMsg(m) { return !!m && typeof m === 'object' && typeof m.from === 'string'; }
  function isMsgArray(a) { return Array.isArray(a) && a.length > 0 && isMsg(a[a.length - 1]); }

  function mapFrom(obj, allowEmpty) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    var out = {}, any = false;
    Object.keys(obj).forEach(function (k) {
      if (isMsgArray(obj[k])) { out[k] = obj[k]; any = true; }
    });
    return (any || allowEmpty) ? out : null;
  }

  function findMaps(data) {
    if (!data || typeof data !== 'object') return null;
    var m = mapFrom(data.messages, true);
    if (m) return m;
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var v = data[keys[i]];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        var mm = mapFrom(v, false);
        if (mm) return mm;
      }
    }
    if (Array.isArray(data.chats)) {
      var out = {}, any = false;
      data.chats.forEach(function (c) {
        if (c && c.name && isMsgArray(c.messages)) { out[c.name] = c.messages; any = true; }
      });
      if (any) return out;
    }
    return null;
  }

  function readSnapshot() {
    var b = window.Island.backup();
    var data = (b && b.data) || b;
    var maps = findMaps(data);
    if (!maps) return null;
    return { maps: maps, settings: (data && data.settings) || null };
  }

  function msgKey(m) {
    if (m.id != null && m.id !== '') return 'i' + m.id;
    return 'k' + (m.createdAt || '') + '|' + m.from + '|' + String(m.text || '').slice(0, 60);
  }

  function isIncoming(m) { return m.from === 'them' || m.role === 'assistant'; }

  function isRecent(m, now, windowMs) {
    var t = Number(m.createdAt || m.ts);
    if (!isFinite(t) || t <= 0) return true;
    return now - t <= windowMs;
  }

  function bodyOf(m) {
    var text = m.text != null ? String(m.text) : '';
    var type = String(m.type || '');
    var out;
    if (type === 'voice') out = '[语音] ' + String(m.transcript || m.aiTranscript || '');
    else if (type === 'sticker' || type === 'emoji') out = '[表情包]';
    else if (type === 'image' || type === 'photo') out = '[图片]';
    else if (type === 'location') out = '[位置] ' + String(m.name || m.address || '');
    else if (type === 'file') out = '[文件] ' + String(m.fileName || m.name || '');
    else if (type === 'chat_record') out = '[聊天记录]';
    else out = text;
    out = String(out || text || '').replace(/\s+/g, ' ').trim();
    return (out || '[新消息]').slice(0, 160);
  }

  function notifEnabled(settings) {
    try {
      if (settings && typeof settings === 'object') {
        var keys = Object.keys(settings);
        for (var i = 0; i < keys.length; i++) {
          var v = settings[keys[i]];
          if (/^notif/i.test(keys[i]) && v && typeof v === 'object' && typeof v.enabled === 'boolean') return v.enabled;
        }
      }
      var t = document.getElementById('notificationEnabledToggle');
      if (t) {
        var a = t.getAttribute('aria-checked');
        if (a === 'true') return true;
        if (a === 'false') return false;
        if (t.checked === true) return true;
        if (t.checked === false) return false;
      }
    } catch (e) {}
    return true;
  }

  // The user is looking at a chat right now (app visible + chat panel on screen): no banner needed.
  function chatOnScreen() {
    try {
      if (document.visibilityState !== 'visible') return false;
      var p = document.getElementById('pmPanel');
      if (!p) return false;
      var cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (p.getAttribute('aria-hidden') === 'true') return false;
      var r = p.getBoundingClientRect();
      var vw = window.innerWidth || document.documentElement.clientWidth || 0;
      return r.width > 50 && r.right > 8 && r.left < vw - 8;
    } catch (e) { return false; }
  }

  var seenByChat = Object.create(null);
  var baselineDone = false;
  var monitorStarted = false;
  var failures = 0;
  var lastDiffMs = 0;
  var diffTimer = null;

  function deliverAll(items) {
    if (items.length > 8) items = items.slice(items.length - 8);
    items.forEach(function (it, idx) {
      setTimeout(function () { deliver(it.name, bodyOf(it.msg), uid()); }, idx * 120);
    });
  }

  function runDiff() {
    var t0 = Date.now();
    var snap = null;
    try { snap = readSnapshot(); } catch (e) { snap = null; }
    lastDiffMs = Date.now() - t0;
    if (!snap) {
      failures++;
      if (failures >= 3 && healthy) { healthy = false; setState('未识别消息数据（使用应用自带通知）'); }
      else if (failures >= 3) setState('未识别消息数据（使用应用自带通知）');
      return;
    }
    failures = 0;
    var now = Date.now();
    var fresh = [];
    Object.keys(snap.maps).forEach(function (name) {
      var list = snap.maps[name];
      var firstTime = !seenByChat[name];
      var seen = seenByChat[name] || (seenByChat[name] = Object.create(null));
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!isMsg(m)) continue;
        var key = msgKey(m);
        if (seen[key]) continue;
        seen[key] = 1;
        if (!baselineDone) continue;                              // first pass = existing history
        if (firstTime && !isRecent(m, now, 60000)) continue;      // a chat we have not seen before
        if (!isIncoming(m) || m.type === 'system') continue;
        if (!isRecent(m, now, 10 * 60000)) continue;
        fresh.push({ name: name, msg: m });
      }
    });
    healthy = true;
    setState('正常');
    if (!baselineDone) { baselineDone = true; return; }
    if (!fresh.length) return;
    if (!notifEnabled(snap.settings)) return;
    if (chatOnScreen()) return;
    deliverAll(fresh);
  }

  function scheduleDiff() {
    if (!monitorStarted || diffTimer) return;
    var delay = Math.max(350, lastDiffMs * 6);
    if (chatOnScreen()) delay = Math.max(delay, 2500);
    diffTimer = setTimeout(function () { diffTimer = null; runDiff(); }, delay);
  }

  (function hookPersistence() {
    try {
      var setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        var r = setItem.apply(this, arguments);
        try { scheduleDiff(); } catch (e) {}
        return r;
      };
    } catch (e) {}
    try {
      ['put', 'add'].forEach(function (fn) {
        var orig = IDBObjectStore.prototype[fn];
        if (!orig) return;
        IDBObjectStore.prototype[fn] = function () {
          var r = orig.apply(this, arguments);
          try { scheduleDiff(); } catch (e) {}
          return r;
        };
      });
    } catch (e) {}
  })();

  document.addEventListener('visibilitychange', function () { scheduleDiff(); });
  // Safety net for storage paths we do not see: poll slowly while the page is hidden.
  setInterval(function () { if (document.hidden) scheduleDiff(); }, 30000);

  var monitorTries = 0;
  function startMonitor() {
    if (!window.Island || typeof window.Island.backup !== 'function') {
      if (++monitorTries < 20) setTimeout(startMonitor, 1500);
      else setState('未检测到岛屿数据接口');
      return;
    }
    monitorStarted = true;
    runDiff();
  }
  setTimeout(startMonitor, 2500);

  window.IslandBgGuard = {
    debug: function (on) { DEBUG = !!on; return DEBUG; },
    status: function () {
      return { healthy: healthy, inflight: inflight, baselineDone: baselineDone, chats: Object.keys(seenByChat).length };
    }
  };
})();
