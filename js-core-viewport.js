/* 岛屿 · 视口修正（iOS 添加到主屏幕后的全屏适配）
 *
 * 背景：iOS 27 的主屏幕 App 把页面区域放在状态栏下方——视口（innerHeight）比屏幕矮一个状态栏，
 * 且 safe-area-inset-top 为 0，系统还会在状态栏区域叠一层模糊。直接按这个视口排版，
 * 就会出现「状态栏有独立底色」或「底栏被挤出 / 留空白」。
 *
 * 做法（只在「iOS + 已添加到主屏幕」时介入，浏览器标签页、安卓、APK 完全不受影响）：
 *   1. 用 screen 的真实尺寸得到整屏高度，写到 --app-h；整屏高度 - 视口高度 = 状态栏高度，写到 --app-sat；
 *   2. 给 <html> 打 data-vh-fix：CSS 让 <body> 绝对定位、整屏高，html 比视口高出一个状态栏，文档因此可滚动 --app-sat；
 *   3. 把文档滚到底并锁住（window.scrollTo(0, sat)），body 整体上移，正好铺满整个屏幕：
 *      顶部在状态栏下透出页面内容，底部贴到屏幕底边；内容用 --island-sat 自己让开状态栏；
 *   4. 键盘弹出（输入框聚焦）时不重算、不锁定，避免聊天输入栏跳动；旋转 / 回到前台 / 页面显示时重新量。 */
(function () {
  'use strict';
  var d = document, root = d.documentElement, ua = navigator.userAgent || '';
  var isIPhone = /iPhone|iPod/.test(ua);
  var isIOS = isIPhone || /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function isStandalone() {
    try {
      if (navigator.standalone === true) return true;
      return !!(window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches));
    } catch (e) { return false; }
  }

  var standalone = isStandalone();
  if (isIOS) root.setAttribute('data-ios', '1');
  if (standalone) root.setAttribute('data-standalone', '1');

  /* theme-color 会被系统拿来给状态栏区域单独上色：主屏幕 App 里直接移除，状态栏保持透明。 */
  if (isIOS && standalone) {
    try {
      var tcs = d.querySelectorAll('meta[name="theme-color"]');
      for (var ti = 0; ti < tcs.length; ti++) tcs[ti].parentNode.removeChild(tcs[ti]);
    } catch (e) {}
  }

  var lastH = 0, lastSat = 0, timers = [], lockQueued = false;

  function editing() {
    var a = d.activeElement;
    if (!a) return false;
    return a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  /* 把文档滚到 sat：body 绝对定位，随文档上移 sat，正好铺满整屏。 */
  function lockScroll() {
    if (!lastSat || editing()) return;
    if (Math.abs((window.scrollY || 0) - lastSat) > 0.5) {
      try { window.scrollTo(0, lastSat); } catch (e) {}
    }
  }

  function measure() {
    if (!(isIOS && standalone)) return;
    if (editing()) return; /* 键盘弹出时保持原状 */
    var sw = screen.width || 0, sh = screen.height || 0;
    if (!sw || !sh) return;
    var portrait = window.innerHeight >= window.innerWidth;
    var full = portrait ? Math.max(sw, sh) : Math.min(sw, sh);
    var h = Math.max(window.innerHeight || 0, full);
    if (!h) return;
    if (h !== lastH) {
      lastH = h;
      root.style.setProperty('--app-h', h + 'px');
    }
    var sat = Math.max(0, Math.round(h - (window.innerHeight || h)));
    if (sat !== lastSat) {
      lastSat = sat;
      root.style.setProperty('--app-sat', sat + 'px');
    }
    if (!root.hasAttribute('data-vh-fix')) root.setAttribute('data-vh-fix', '1');
    lockScroll();
  }

  /* iOS 在启动 / 旋转 / 回到前台后，尺寸有时晚几百毫秒才更新：多补量几次。 */
  function settle() {
    measure();
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [60, 200, 450, 900, 1600].map(function (ms) { return setTimeout(measure, ms); });
  }

  measure();
  d.addEventListener('DOMContentLoaded', settle);
  window.addEventListener('load', settle);
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  window.addEventListener('pageshow', settle);
  window.addEventListener('focus', settle);
  d.addEventListener('visibilitychange', function () { if (!d.hidden) settle(); });
  /* 输入框失焦（键盘收起）后重新量一次并重新锁定。 */
  d.addEventListener('focusout', function () { setTimeout(measure, 350); }, true);
  /* 系统把文档滚回去时（回前台、旋转等），立刻滚回来。 */
  window.addEventListener('scroll', function () {
    if (lockQueued) return;
    lockQueued = true;
    requestAnimationFrame(function () { lockQueued = false; lockScroll(); });
  }, { passive: true });

  window.IslandViewport = {
    /* 供其它脚本（如系统栏取色）取“真正的整屏高度”。 */
    height: function () { return lastH || window.innerHeight; },
    refresh: settle
  };
})();
