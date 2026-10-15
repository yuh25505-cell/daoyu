/* 岛屿 · 系统栏（状态栏 / 导航栏）图标颜色自适应
 *
 * 目标：状态栏的时间、电量、信号、WiFi 等图标，要跟着"它正下方实际看到的画面"自动变黑 / 变白，
 *       而不是只跟系统深色模式走。日间 / 夜间 / 深色壁纸 / 浅色壁纸 / 聊天自定义背景 都适用。
 *
 * 做法：不给状态栏加任何独立背景（保持与软件融为一体），只读取状态栏正下方的真实颜色：
 *   1. 在屏幕顶部（状态栏区域）和底部（导航栏区域）各取 3 个点，用 elementsFromPoint 拿到从上到下的所有图层；
 *   2. 逐层把背景色 / 背景图（壁纸、聊天背景）叠加起来；背景图会截取对应条带算平均色，
 *      夜间壁纸压暗（filter: brightness）也会计入；
 *   3. 算出相对亮度：亮 → 用深色图标，暗 → 用浅色图标；
 *   4. APK 里调用原生 IslandNative.setSystemBarStyle（WindowInsetsController，安卓原生做法）；
 *      网页 / PWA 里同步 <meta name="theme-color">，由浏览器自动挑选图标颜色。
 *
 * 触发时机：主题 / 壁纸 / 页面切换 / 弹窗 / 动画结束 / 旋转 / 回到前台，均自动重新判断（节流，不影响性能）。
 * 调试：控制台执行 IslandSystemBars.state() 可查看当前判断结果。 */
(function () {
  'use strict';

  /* 相对亮度超过该值就当作"浅色背景"（用深色图标）。数值越大，越倾向用白色图标。 */
  var LIGHT_THRESHOLD = 0.28;
  /* 迟滞：亮度离阈值很近时保持上一次结果，避免来回闪。 */
  var HYSTERESIS = 0.04;

  var imgCache = {};
  var imgKeys = [];
  var sampleCache = {};
  var sampleCount = 0;
  var probe = null;
  var plugin = null;
  var started = false;
  var timer = 0;
  var settleTimer = 0;
  var last = { topLight: null, bottomLight: null, topLum: null, bottomLum: null, hex: '' };

  /* ---------- 颜色工具 ---------- */
  function parseColor(s) {
    if (!s) return null;
    var m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,\/]\s*([\d.]+%?))?\s*\)$/);
    if (m) return [+m[1], +m[2], +m[3], alphaOf(m[4])];
    m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
    if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, alphaOf(m[4])];
    return null;
  }
  function alphaOf(v) {
    if (v === undefined) return 1;
    return v.charAt(v.length - 1) === '%' ? parseFloat(v) / 100 : parseFloat(v);
  }
  function lin(c) {
    c = Math.max(0, Math.min(255, c)) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function lum(rgb) {
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  }
  function toHex(rgb) {
    function h(v) { v = Math.round(Math.max(0, Math.min(255, v))); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
  }
  function decide(l, prev) {
    if (prev !== null && Math.abs(l - LIGHT_THRESHOLD) < HYSTERESIS) return prev;
    return l > LIGHT_THRESHOLD;
  }

  /* ---------- 安全区高度（状态栏 / 手势条高度） ---------- */
  function insets() {
    try {
      if (!probe || !probe.isConnected) {
        probe = document.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
          'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
        (document.body || document.documentElement).appendChild(probe);
      }
      var cs = getComputedStyle(probe);
      return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    } catch (e) {
      return { top: 0, bottom: 0 };
    }
  }

  /* ---------- 背景图取样（壁纸 / 聊天背景） ---------- */
  function firstUrl(bg) {
    var i = bg.indexOf('url(');
    if (i < 0) return null;
    var start = i + 4;
    var q = bg.charAt(start);
    if (q === '"' || q === "'") {
      var end = bg.indexOf(q + ')', start + 1);
      return end < 0 ? null : bg.slice(start + 1, end);
    }
    var end2 = bg.indexOf(')', start);
    return end2 < 0 ? null : bg.slice(start, end2);
  }

  function getImg(src) {
    var key = src.length + ':' + src.slice(0, 96) + ':' + src.slice(-48);
    var e = imgCache[key];
    if (e) return e;
    e = imgCache[key] = { key: key, state: 'loading', img: new Image() };
    imgKeys.push(key);
    /* 壁纸是 base64 大图，只保留最近 4 张，避免占用内存。 */
    while (imgKeys.length > 4) delete imgCache[imgKeys.shift()];
    e.img.onload = function () { e.state = 'ready'; schedule(0); };
    e.img.onerror = function () { e.state = 'fail'; };
    try { if (!/^(data|blob):/.test(src)) e.img.crossOrigin = 'anonymous'; } catch (_) {}
    e.img.src = src;
    return e;
  }

  function pct(token) {
    var m = /^(-?[\d.]+)%$/.exec(token || '');
    return m ? parseFloat(m[1]) / 100 : 0.5;
  }

  /* 按 background-size / position 计算：屏幕上的条带对应图片里的哪一块，取其平均色。 */
  function sampleImg(e, el, cs, edge, bandH) {
    if (e.state !== 'ready') return null;
    var iw = e.img.naturalWidth, ih = e.img.naturalHeight;
    if (!iw || !ih) return null;
    var W = window.innerWidth, H = (window.IslandViewport && window.IslandViewport.height()) || window.innerHeight;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var pos = (cs.backgroundPosition || '50% 50%').split(/\s+/);
    var size = cs.backgroundSize || 'cover';
    var ck = [e.key, edge, W, H, bandH, r.left | 0, r.top | 0, r.width | 0, r.height | 0, pos.join(','), size].join('|');
    if (sampleCache[ck]) return sampleCache[ck];

    var s;
    if (size === 'contain') s = Math.min(r.width / iw, r.height / ih);
    else if (size === 'auto' || size === 'auto auto') s = 1;
    else s = Math.max(r.width / iw, r.height / ih); /* cover，及其它情况按 cover 近似 */
    var offX = (r.width - iw * s) * pct(pos[0]);
    var offY = (r.height - ih * s) * pct(pos[1]);
    var bandY = edge === 'top' ? 0 : H - bandH;
    var sx = (0 - r.left - offX) / s;
    var sy = (bandY - r.top - offY) / s;
    var sw = W / s, sh = bandH / s;
    /* 条带落在图片之外（如 contain 留白）→ 不由这张图决定，交给下一层。 */
    if (sy + sh <= 0 || sy >= ih || sx + sw <= 0 || sx >= iw) return null;
    var x0 = Math.max(0, sx), y0 = Math.max(0, sy);
    var x1 = Math.min(iw, sx + sw), y1 = Math.min(ih, sy + sh);
    if (x1 - x0 < 1 || y1 - y0 < 0.5) return null;

    var out = null;
    try {
      var cv = document.createElement('canvas');
      cv.width = 24; cv.height = 4;
      var cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(e.img, x0, y0, x1 - x0, y1 - y0, 0, 0, 24, 4);
      var d = cx.getImageData(0, 0, 24, 4).data;
      var R = 0, G = 0, B = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) continue;
        R += d[i]; G += d[i + 1]; B += d[i + 2]; n++;
      }
      if (n) out = [R / n, G / n, B / n];
    } catch (err) {
      out = null; /* 跨域图片会污染画布，取不到就交给下一层（背景色 / 主题色）。 */
    }
    if (++sampleCount > 24) { sampleCache = {}; sampleCount = 0; }
    sampleCache[ck] = out;
    return out;
  }

  /* ---------- 叠加某一点上所有图层，得到肉眼看到的颜色 ---------- */
  function themeBase() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? [0, 0, 0] : [243, 243, 243];
  }

  function colorAt(x, y, edge, bandH) {
    var stack;
    try {
      stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    } catch (e) { stack = []; }
    var acc = [0, 0, 0], a = 0;
    for (var i = 0; i < stack.length && a < 0.985; i++) {
      var el = stack[i];
      if (!el || el === probe) continue;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      var op = parseFloat(cs.opacity);
      if (!(op > 0)) continue;

      var layer = null, la = 0;
      var bg = cs.backgroundImage;
      if (bg && bg !== 'none') {
        var src = firstUrl(bg);
        if (src) {
          var c = sampleImg(getImg(src), el, cs, edge, bandH);
          if (c) { layer = c; la = 1; }
        }
      }
      if (!layer) {
        var col = parseColor(cs.backgroundColor);
        if (col && col[3] > 0) { layer = [col[0], col[1], col[2]]; la = col[3]; }
      }
      if (!layer) continue;

      /* 夜间壁纸压暗：filter: brightness(x) */
      var f = cs.filter;
      if (f && f !== 'none') {
        var bm = f.match(/brightness\(\s*([\d.]+)(%?)\s*\)/);
        if (bm) {
          var k = parseFloat(bm[1]);
          if (bm[2]) k /= 100;
          layer = [Math.min(255, layer[0] * k), Math.min(255, layer[1] * k), Math.min(255, layer[2] * k)];
        }
      }
      la *= Math.min(1, op);
      var w = la * (1 - a);
      acc[0] += layer[0] * w; acc[1] += layer[1] * w; acc[2] += layer[2] * w;
      a += w;
    }
    if (a < 0.999) {
      var base = themeBase(), rest = 1 - a;
      acc[0] += base[0] * rest; acc[1] += base[1] * rest; acc[2] += base[2] * rest;
    }
    return acc;
  }

  function average(list) {
    var r = 0, g = 0, b = 0;
    for (var i = 0; i < list.length; i++) { r += list[i][0]; g += list[i][1]; b += list[i][2]; }
    return [r / list.length, g / list.length, b / list.length];
  }

  function compute() {
    var ins = insets();
    var topH = Math.max(ins.top, 24);
    var botH = Math.max(ins.bottom, 20);
    var W = window.innerWidth, H = (window.IslandViewport && window.IslandViewport.height()) || window.innerHeight;
    var xs = [W * 0.2, W * 0.5, W * 0.8];
    var top = average(xs.map(function (x) { return colorAt(x, topH / 2, 'top', topH); }));
    var bottom = average(xs.map(function (x) { return colorAt(x, H - botH / 2, 'bottom', botH); }));
    return { top: top, bottom: bottom };
  }

  /* ---------- 输出：APK 走原生，网页同步 theme-color ---------- */
  function getPlugin() {
    if (plugin) return plugin;
    try {
      var C = window.Capacitor;
      if (C && typeof C.isNativePlatform === 'function' && C.isNativePlatform() && typeof C.registerPlugin === 'function') {
        plugin = C.registerPlugin('IslandNative');
      }
    } catch (e) { plugin = null; }
    return plugin;
  }

  function pushNative(topLight, bottomLight) {
    var P = getPlugin();
    if (!P) return;
    try {
      var r = P.setSystemBarStyle({ lightStatusBar: topLight, lightNavigationBar: bottomLight });
      if (r && typeof r.catch === 'function') r.catch(function () {});
    } catch (e) {}
  }

  function apply(res, force) {
    var tl = decide(lum(res.top), last.topLight);
    var bl = decide(lum(res.bottom), last.bottomLight);
    var changed = tl !== last.topLight || bl !== last.bottomLight;
    last.topLight = tl; last.bottomLight = bl;
    last.topLum = lum(res.top); last.bottomLum = lum(res.bottom);

    /* 网页 / PWA：theme-color 跟随状态栏下方的真实颜色，浏览器会据此自动选黑 / 白图标。 */
    var hex = toHex(res.top);
    /* iOS 主屏幕 App 不写 theme-color（会给状态栏单独上色），状态栏保持透明 */
    if (hex !== last.hex && !document.documentElement.hasAttribute('data-vh-fix')) {
      last.hex = hex;
      var meta = document.getElementById('themeColorMeta') || document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', hex);
    }
    if (changed || force) pushNative(tl, bl);
  }

  function refresh(force) {
    try { apply(compute(), force === true); } catch (e) {}
  }

  /* 节流：连续变化时最多每 140ms 判断一次；最后一次变化后 520ms 再补判一次，等过渡动画结束。 */
  function schedule(delay) {
    if (!timer) {
      timer = setTimeout(function () { timer = 0; refresh(false); }, delay == null ? 140 : delay);
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { refresh(false); }, 520);
  }

  function start() {
    if (started) return;
    started = true;
    try {
      var mo = new MutationObserver(function () { schedule(); });
      mo.observe(document.documentElement, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-theme', 'data-wallpaper']
      });
    } catch (e) {}
    document.addEventListener('transitionend', function () { schedule(); }, true);
    document.addEventListener('animationend', function () { schedule(); }, true);
    window.addEventListener('resize', function () { schedule(); });
    window.addEventListener('orientationchange', function () { schedule(); });
    window.addEventListener('pageshow', function () { refresh(true); });
    window.addEventListener('focus', function () { refresh(true); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { refresh(true); schedule(); }
    });
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onMq = function () { schedule(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    } catch (e) {}

    refresh(true);
    /* 启动层淡出、状态读取完成后各补判一次。 */
    setTimeout(function () { refresh(true); }, 700);
    setTimeout(function () { refresh(true); }, 3800);
  }

  window.IslandSystemBars = {
    refresh: function () { refresh(true); },
    state: function () {
      return {
        statusBarIcons: last.topLight === null ? null : (last.topLight ? 'dark' : 'light'),
        navigationBarIcons: last.bottomLight === null ? null : (last.bottomLight ? 'dark' : 'light'),
        topLuminance: last.topLum, bottomLuminance: last.bottomLum, themeColor: last.hex,
        native: !!getPlugin()
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.addEventListener('load', function () { refresh(true); });
})();
