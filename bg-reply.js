(function () {
  'use strict';

  // 1) Reply guard: detects when an AI reply is being generated (chat-completion requests) and
  //    keeps the page alive meanwhile (Web Lock + keep-alive hold), so switching screens or apps
  //    does not freeze the request.
  // 2) Per-message system notifications: every new Char message bubble that appears while the
  //    user is not looking at that chat (other screen or app in background) is shown as its own
  //    system notification, like WeChat.
  if (window.__islandBgReplyLoaded) return;
  window.__islandBgReplyLoaded = true;

  var PREF_KEY = 'island.msgNotify';
  var startedAt = Date.now();
  var notifyOn = true;
  try { notifyOn = localStorage.getItem(PREF_KEY) !== '0'; } catch (e) {}

  var gen = { active: 0, seen: false, lastEnd: 0 };
  var recent = [];            // notifications seen recently: { b: body, t: time, own: bool }
  var ownDepth = 0;           // >0 while this script itself is posting a notification
  var seq = 0;
  var seenNodes = typeof WeakSet === 'function' ? new WeakSet() : null;
  var lastChatShownAt = 0;
  var chatWasVisible = false;
  var lockWanted = false, lockRelease = null, lockTimer = null;

  var REPLY_GRACE_MS = 90000; // messages keep arriving (one by one) for a while after the request ends

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

  function nativePlugin() {
    try {
      var C = window.Capacitor;
      if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
      if (typeof C.registerPlugin !== 'function') return null;
      return C.registerPlugin('IslandNative');
    } catch (e) { return null; }
  }

  // ---------- notification bookkeeping (avoid duplicates with the app's own notifications) ----------
  function sameBody(a, b) {
    if (!a || !b) return false;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }
  function recordShown(body, own) {
    recent.push({ b: String(body || ''), t: Date.now(), own: !!own });
    if (recent.length > 40) recent.shift();
  }
  function wasShown(body, own) {
    var now = Date.now();
    for (var i = recent.length - 1; i >= 0; i--) {
      var r = recent[i];
      if (now - r.t > 30000) break;
      if (r.own === !!own && sameBody(r.b, body)) return true;
    }
    return false;
  }

  (function wrapNativeNotifications() {
    try {
      var C = window.Capacitor;
      if (C && typeof C.nativePromise === 'function' && !C.__islandNotifyWrapped) {
        var orig = C.nativePromise;
        C.nativePromise = function (plugin, method, opts) {
          if (plugin === 'IslandNative' && method === 'showWebNotification' && opts && ownDepth === 0) {
            var body = String(opts.body || '');
            if (body) {
              if (wasShown(body, true)) return Promise.resolve({ shown: true, state: 'granted' });
              recordShown(body, false);
            }
          }
          return orig.apply(this, arguments);
        };
        C.__islandNotifyWrapped = true;
      }
    } catch (e) {}
    try {
      var proto = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
      if (proto && typeof proto.showNotification === 'function' && !proto.__islandNotifyWrapped) {
        var origShow = proto.showNotification;
        proto.showNotification = function (title, options) {
          var body = String((options && options.body) || '');
          if (ownDepth === 0 && body) {
            if (wasShown(body, true)) return Promise.resolve();
            recordShown(body, false);
          }
          return origShow.apply(this, arguments);
        };
        proto.__islandNotifyWrapped = true;
      }
    } catch (e) {}
  })();

  function showSystemNotification(title, body) {
    var tag = 'island-msg-' + Date.now() + '-' + (seq++);
    recordShown(body, true);
    var N = nativePlugin();
    if (N) {
      ownDepth++;
      try {
        return N.showWebNotification({ title: title, body: body, tag: tag, url: '' }).catch(function () {});
      } finally { ownDepth--; }
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    var opts = { body: body, tag: tag, icon: './icon-192.png', badge: './icon-192.png', renotify: true, data: { url: './' } };
    var fallback = function () { try { new Notification(title, opts); } catch (e) {} };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        return navigator.serviceWorker.getRegistration().then(function (reg) {
          if (!reg) { fallback(); return; }
          ownDepth++;
          try { return reg.showNotification(title, opts); } finally { ownDepth--; }
        }).catch(fallback);
      }
    } catch (e) {}
    fallback();
  }

  // ---------- AI reply tracking ----------
  function setLock(on) {
    lockWanted = on;
    if (on) {
      if (lockRelease || !navigator.locks || typeof navigator.locks.request !== 'function') return;
      try {
        navigator.locks.request('island-generating', function () {
          return new Promise(function (resolve) {
            lockRelease = resolve;
            if (!lockWanted) { resolve(); lockRelease = null; }
          });
        }).catch(function () {});
      } catch (e) {}
    } else if (lockRelease) {
      try { lockRelease(); } catch (e) {}
      lockRelease = null;
    }
  }

  function genStart() {
    gen.active++;
    gen.seen = true;
    clearTimeout(lockTimer);
    setLock(true);
    if (window.IslandKeepAlive) window.IslandKeepAlive.hold('reply');
    var finished = false;
    return function genEnd() {
      if (finished) return;
      finished = true;
      gen.active = Math.max(0, gen.active - 1);
      gen.lastEnd = Date.now();
      if (gen.active === 0) {
        clearTimeout(lockTimer);
        lockTimer = setTimeout(function () { if (gen.active === 0) setLock(false); }, REPLY_GRACE_MS);
      }
      if (window.IslandKeepAlive) window.IslandKeepAlive.release('reply', REPLY_GRACE_MS);
    };
  }

  function isChatCompletionRequest(init) {
    try {
      var body = init && init.body;
      return typeof body === 'string' && body.indexOf('"messages"') >= 0;
    } catch (e) { return false; }
  }

  (function wrapFetch() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function' || origFetch.__islandWrapped) return;
    var wrapped = function (input, init) {
      if (!isChatCompletionRequest(init)) return origFetch.apply(this, arguments);
      var done = genStart();
      var p;
      try { p = origFetch.apply(this, arguments); } catch (e) { done(); throw e; }
      return p.then(function (res) {
        try {
          // The reply may be streamed: only count it as finished once the whole body has arrived.
          res.clone().arrayBuffer().then(done, done);
        } catch (e) { done(); }
        return res;
      }, function (err) { done(); throw err; });
    };
    wrapped.__islandWrapped = true;
    window.fetch = wrapped;
  })();

  // ---------- is the user looking at the chat right now? ----------
  function elementOnScreen(el) {
    if (!el) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 8 && r.bottom > 8 &&
      r.left < window.innerWidth - 8 && r.top < window.innerHeight - 8;
  }
  function chatVisible() {
    try {
      return elementOnScreen(document.getElementById('chatApp')) &&
        elementOnScreen(document.getElementById('pmView'));
    } catch (e) { return false; }
  }
  function appForeground() { return document.visibilityState === 'visible'; }

  setInterval(function () {
    var v = chatVisible();
    if (v && !chatWasVisible) lastChatShownAt = Date.now();
    chatWasVisible = v;
  }, 400);

  function shouldNotify() {
    if (!notifyOn) return false;
    if (Date.now() - startedAt < 4000) return false;          // initial render
    if (Date.now() - lastChatShownAt < 1500) return false;    // chat history just rendered
    if (appForeground() && chatVisible()) return false;       // already reading this chat
    if (gen.seen) return gen.active > 0 || Date.now() - gen.lastEnd < REPLY_GRACE_MS;
    return true;
  }

  // ---------- per-message notifications ----------
  function describeMessage(node) {
    try {
      if (node.classList.contains('chat-message--voice')) return '[语音]';
      if (node.querySelector('.chat-bubble--sticker')) return '[表情]';
      var t = node.querySelector('.chat-bubble--text, .chat-message__transcript');
      var s = t ? (t.textContent || '').trim() : '';
      if (s) return s.length > 120 ? s.slice(0, 120) + '…' : s;
      if (node.querySelector('.chat-bubble img')) return '[图片]';
      var c = node.querySelector('.chat-message__content');
      s = c ? (c.textContent || '').trim() : '';
      if (s) return s.length > 120 ? s.slice(0, 120) + '…' : s;
    } catch (e) {}
    return '[新消息]';
  }

  function chatTitle() {
    var el = document.getElementById('pmTitle');
    var t = el ? (el.textContent || '').trim() : '';
    return t || '岛屿';
  }

  function collectReceived(records) {
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (!n || n.nodeType !== 1) continue;
        if (n.matches && n.matches('.chat-message--received')) out.push(n);
        else if (n.querySelectorAll) {
          var inner = n.querySelectorAll('.chat-message--received');
          for (var k = 0; k < inner.length; k++) out.push(inner[k]);
        }
      }
    }
    return out;
  }

  function onMutations(records) {
    var nodes = collectReceived(records);
    if (!nodes.length) return;
    // Many bubbles at once means the whole history was re-rendered, not new messages.
    if (nodes.length > 5) return;
    if (!shouldNotify()) return;
    var title = chatTitle();
    nodes.forEach(function (node) {
      if (seenNodes) { if (seenNodes.has(node)) return; seenNodes.add(node); }
      var body = describeMessage(node);
      if (wasShown(body, false)) return; // the app already posted this one itself
      showSystemNotification(title, body);
    });
  }

  function startObserver() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', startObserver); return; }
    try {
      new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  startObserver();

  // ---------- settings UI ----------
  function renderToggle() {
    var toggle = document.getElementById('msgNotifyToggle');
    var hint = document.getElementById('msgNotifyHint');
    if (toggle) {
      toggle.classList.toggle('is-on', notifyOn);
      toggle.setAttribute('aria-checked', notifyOn ? 'true' : 'false');
    }
    if (hint) hint.textContent = notifyOn ? '已开启' : '关闭';
  }

  function mount() {
    if (document.getElementById('msgNotifyToggle')) return;
    var panel = document.querySelector('.settings-panel[data-panel="notifications"] .panel-scroll');
    if (!panel) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="settings-section-title">新消息通知</div>' +
      '<div class="appearance-menu notification-menu">' +
      '<button type="button" class="appearance-row" id="msgNotifyToggle" role="switch" aria-checked="true">' +
      '<span class="appearance-copy"><strong>角色回复逐条弹系统通知</strong><em id="msgNotifyHint">已开启</em></span>' +
      '<span aria-hidden="true" class="appearance-switch"></span>' +
      '</button>' +
      '<div class="notification-status-row" style="white-space:normal;line-height:1.5;padding-top:6px;">' +
      '<span style="color:var(--fg-faint);font-size:12px;">角色的每一条回复都会像微信一样单独弹出系统通知。你正在查看该聊天窗口时不会弹；在岛屿的其他界面或切到后台时会弹。需要先在上方“系统权限”里允许通知。</span>' +
      '</div>' +
      '</div>';
    while (wrap.firstChild) panel.appendChild(wrap.firstChild);
    var toggle = document.getElementById('msgNotifyToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        notifyOn = !notifyOn;
        try { localStorage.setItem(PREF_KEY, notifyOn ? '1' : '0'); } catch (e) { toast('设置保存失败'); }
        renderToggle();
      });
    }
    renderToggle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (document.getElementById('msgNotifyToggle') || tries > 40) { clearInterval(timer); return; }
    mount();
  }, 500);

  window.IslandBgReply = { gen: gen, notify: showSystemNotification };
})();
