/* 岛屿 · 主屏幕第二页：滑动分页、照片组件、天气组件（真实定位）、ins 消息时间戳
 * 样式见 css-apps-home-page2.css；所有 js 文件以经典脚本方式共享全局作用域。 */
'use strict';

var PAGE2_PHOTO_SIZE = 800;     /* 照片 / 天气背景裁成正方形后的边长（px），控制存储体积 */


/* ============================== 分页 ============================== */

function currentHomePage(){
  var pages = $('homePages');
  if (!pages) return 0;
  return Math.round(pages.scrollLeft / Math.max(pages.clientWidth, 1));
}

function updateHomeDots(){
  var i = currentHomePage();
  $$('#homeDots i').forEach(function(d, k){ d.classList.toggle('on', k === i); });
}

function goHomePage(i){
  var pages = $('homePages');
  if (!pages) return;
  pages.scrollTo({ left: i * pages.clientWidth, behavior: 'smooth' });
}

/* 触屏用原生 scroll-snap 滑动；桌面浏览器的鼠标没有“滑动”，补一个拖拽，方便网页版预览。 */
function bindHomePager(){
  var pages = $('homePages');
  if (!pages) return;
  pages.addEventListener('scroll', updateHomeDots, { passive: true });
  window.addEventListener('resize', function(){ pages.scrollLeft = currentHomePage() * pages.clientWidth; updateHomeDots(); });

  var drag = null, moved = false;
  pages.addEventListener('pointerdown', function(e){
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest && e.target.closest('input,textarea')) return;
    drag = { x: e.clientX, left: pages.scrollLeft, page: currentHomePage() };
    moved = false;
  });
  window.addEventListener('pointermove', function(e){
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (!moved && Math.abs(dx) > 6) { moved = true; pages.classList.add('is-dragging'); }
    if (moved) pages.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', function(e){
    if (!drag) return;
    var d = drag; drag = null;
    if (!moved) return;
    pages.classList.remove('is-dragging');
    var dx = e.clientX - d.x, w = pages.clientWidth;
    var target = d.page + (dx < -w * 0.18 ? 1 : (dx > w * 0.18 ? -1 : 0));
    goHomePage(Math.max(0, Math.min(1, target)));
  });
  /* 拖动结束时会触发一次 click：拦下来，避免误点到图标 */
  pages.addEventListener('click', function(e){
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
  }, true);
  updateHomeDots();
}


/* ============================== 照片（2×2） ============================== */

function renderPhoto2(){
  var a = normalizeHomeAppearance();
  var data = a.photo2Photo || '';
  var img = $('photo2Img'), empty = $('photo2Empty');
  if (img) {
    if (data) { if (img.getAttribute('src') !== data) img.src = data; }
    else img.removeAttribute('src');
    img.hidden = !data;
  }
  if (empty) empty.hidden = !!data;
  var state = $('photo2State'); if (state) state.textContent = data ? (/^https?:/i.test(data) ? '已使用图床链接' : '已使用本地图片') : '未选择照片';
  var pick = $('photo2Pick'); if (pick) pick.textContent = data ? '更换照片' : '选择照片';
  var clear = $('photo2Clear'); if (clear) clear.hidden = !data;
}

function setPage2Image(field, data, msg){
  var a = normalizeHomeAppearance();
  a[field] = data;
  applyHomeAppearance();
  saveSettings();
  if (msg) toast(msg);
}

function handlePage2File(field, file, okMsg){
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
  if (file.size > IMAGE_IMPORT_MAX_BYTES) { toast('图片不能超过 20MB'); return; }
  squarePhotoFromFile(file, PAGE2_PHOTO_SIZE).then(function(data){
    setPage2Image(field, data, okMsg);
  }).catch(function(){ toast('读取图片失败'); });
}

function importPage2Url(field, title, okMsg){
  promptImageUrl(title).then(function(url){
    if (!url) return;
    setPage2Image(field, url, okMsg);
  });
}

function clearPage2Image(field, msg){
  var a = normalizeHomeAppearance();
  if (!a[field]) return;
  setPage2Image(field, '', msg);
}

function bindImageSlot(opts){
  var input = $(opts.input);
  var openPicker = function(){ if (input) input.click(); };
  opts.pickers.forEach(function(id){ var el = $(id); if (el) el.addEventListener('click', openPicker); });
  var url = $(opts.url); if (url) url.addEventListener('click', function(){ importPage2Url(opts.field, opts.urlTitle, opts.okMsg); });
  var clear = $(opts.clear); if (clear) clear.addEventListener('click', function(){ clearPage2Image(opts.field, opts.clearMsg); });
  if (input) input.addEventListener('change', function(){
    handlePage2File(opts.field, input.files && input.files[0], opts.okMsg);
    input.value = '';
  });
}


/* ============================== ins 消息：时间戳开关 / 清除自定义图标 ============================== */

function renderInsClock(){
  var home = $('home');
  if (!home) return;
  var d = new Date();
  var t = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  [['ins2Time', 'data-ins2-time'], ['insR2Time', 'data-insr2-time']].forEach(function(x){
    var el = $(x[0]);
    if (el && home.getAttribute(x[1]) !== 'off' && el.textContent !== t) el.textContent = t;
  });
}

function renderInsTimeToggle(){
  var a = normalizeHomeAppearance();
  var home = $('home');
  if (home) { home.setAttribute('data-ins2-time', a.ins2Time ? 'on' : 'off'); home.setAttribute('data-insr2-time', a.insR2Time ? 'on' : 'off'); }
  [['ins2TimeToggle', a.ins2Time], ['insR2TimeToggle', a.insR2Time]].forEach(function(x){
    var tg = $(x[0]);
    if (tg) { tg.classList.toggle('is-on', !!x[1]); tg.setAttribute('aria-checked', x[1] ? 'true' : 'false'); }
  });
  renderInsClock();
}

function customIconCount(){
  return Object.keys(normalizeHomeAppearance().iconData || {}).length;
}

function renderClearIconsState(){
  var el = $('clearCustomIconsState');
  if (!el) return;
  var n = customIconCount();
  el.textContent = n ? ('已导入 ' + n + ' 个自定义图标，点击全部清除') : '当前没有自定义图标';
}

function clearAllCustomIcons(){
  var n = customIconCount();
  if (!n) { toast('当前没有自定义图标'); return; }
  islandConfirm('清除全部 ' + n + ' 个自己导入的图标，恢复为默认图标？此操作不可撤销。', { title: '清除自定义图标', confirmText: '清除', danger: true }).then(function(ok){
    if (!ok) return;
    var a = normalizeHomeAppearance();
    a.iconData = {};
    applyHomeAppearance();
    saveSettings();
    toast('已清除自定义图标');
  });
}


var INS_TEXT_MAX = 40;
var INS_BUBBLES = [['ins2Text', 'ins2Text'], ['insR2Text', 'insR2Text']];

function renderInsTexts(){
  var a = normalizeHomeAppearance();
  INS_BUBBLES.forEach(function(b){
    var el = $(b[0]);
    if (el && document.activeElement !== el && el.textContent !== a[b[1]]) el.textContent = a[b[1]];
    var inp = $(b[0] + 'Input');
    if (inp && document.activeElement !== inp && inp.value !== a[b[1]]) inp.value = a[b[1]];
  });
}

/* 气泡平时不可编辑（滑动、误触屏幕都不会弹键盘），只有点一下气泡文字才进入编辑，失焦后恢复。
 * 设置 › 外观 › 主屏幕 · ins 消息 里的输入框是另一处入口，两边实时同步。 */
function startInsEdit(el, e){
  if (el.isContentEditable) return;
  el.contentEditable = 'plaintext-only';
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.focus();
  var r = null;
  try {
    if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(e.clientX, e.clientY);
    else if (document.caretPositionFromPoint) {
      var cp = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (cp) { r = document.createRange(); r.setStart(cp.offsetNode, cp.offset); r.collapse(true); }
    }
  } catch (err) { r = null; }
  if (!r || !el.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
  var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}

function bindInsBubble(id, field){
  var el = $(id);
  if (!el) return;
  el.contentEditable = 'false';
  el.addEventListener('click', function(e){ startInsEdit(el, e); });
  el.addEventListener('input', function(){
    var t = el.textContent.replace(/[\r\n]+/g, ' ');
    if (t.length > INS_TEXT_MAX) {
      t = t.slice(0, INS_TEXT_MAX); el.textContent = t;
      var r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    normalizeHomeAppearance()[field] = t;
    var inp = $(id + 'Input'); if (inp && inp.value !== t) inp.value = t;
    scheduleSettingsSave(300);
  });
  el.addEventListener('paste', function(e){
    e.preventDefault();
    var txt = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, txt);
  });
  el.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  el.addEventListener('blur', function(){ el.contentEditable = 'false'; el.scrollLeft = 0; saveSettings(); });
}

function bindInsTextInputs(){
  INS_BUBBLES.forEach(function(b){
    var inp = $(b[0] + 'Input');
    if (inp) {
      inp.addEventListener('input', function(){
        var a = normalizeHomeAppearance();
        a[b[1]] = inp.value.replace(/[\r\n]+/g, ' ').slice(0, INS_TEXT_MAX);
        var el = $(b[0]); if (el) el.textContent = a[b[1]];
        scheduleSettingsSave(300);
      });
      inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      inp.addEventListener('blur', function(){ saveSettings(); });
    }
    bindInsBubble(b[0], b[1]);
  });
}


/* ============================== 天气（2×2，真实定位） ============================== */

var W2_CACHE_KEY = 'island.weather2.cache';
var W2_TTL = 20 * 60 * 1000;        /* 缓存多久算新鲜 */
var W2_RETRY_GAP = 60 * 1000;       /* 失败后至少隔多久才自动重试（点按组件不受限） */
var w2State = { busy: false, lastTry: 0, data: null, error: '' };
w2State.data = (function(){ try { var c = JSON.parse(localStorage.getItem('island.weather2.cache') || 'null'); return c && c.data && c.data.daily ? c : null; } catch (e) { return null; } })();

/* WMO 天气代码 → 中文 + 图标 */
function w2Info(code){
  var c = Number(code);
  if (c === 0) return { t: '晴', i: 'sun' };
  if (c === 1) return { t: '晴间多云', i: 'partly' };
  if (c === 2) return { t: '多云', i: 'partly' };
  if (c === 3) return { t: '阴', i: 'cloud' };
  if (c === 45 || c === 48) return { t: '雾', i: 'fog' };
  if (c >= 51 && c <= 55) return { t: '毛毛雨', i: 'rain' };
  if (c === 56 || c === 57 || c === 66 || c === 67) return { t: '冻雨', i: 'rain' };
  if (c === 61) return { t: '小雨', i: 'rain' };
  if (c === 63) return { t: '中雨', i: 'rain' };
  if (c === 65) return { t: '大雨', i: 'rain' };
  if (c === 80 || c === 81) return { t: '阵雨', i: 'rain' };
  if (c === 82) return { t: '强阵雨', i: 'rain' };
  if (c === 71) return { t: '小雪', i: 'snow' };
  if (c === 73) return { t: '中雪', i: 'snow' };
  if (c === 75) return { t: '大雪', i: 'snow' };
  if (c === 77) return { t: '雪粒', i: 'snow' };
  if (c === 85 || c === 86) return { t: '阵雪', i: 'snow' };
  if (c === 95) return { t: '雷暴', i: 'storm' };
  if (c === 96 || c === 99) return { t: '雷暴冰雹', i: 'storm' };
  return { t: '—', i: 'cloud' };
}

var W2_CLOUD = 'M6.5 17a4 4 0 0 1-.6-7.96 5.5 5.5 0 0 1 10.6-1.2A4.6 4.6 0 0 1 17 17z';
var W2_CLOUD_HI = 'M6.5 14.5a3.6 3.6 0 0 1-.5-7.16 5 5 0 0 1 9.6-1.1 4.1 4.1 0 0 1 .9 8.26z';
var W2_ICONS = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
  partly: '<circle cx="8.4" cy="8.2" r="3"/><path d="M8.4 2.6v1M2.8 8.2h1M4.4 4.2l.7.7M12.4 4.2l-.7.7"/><path d="M8.6 19.5a3.7 3.7 0 0 1-.4-7.4 5 5 0 0 1 9.5.9 3.3 3.3 0 0 1-.4 6.5z"/>',
  cloud: '<path d="' + W2_CLOUD + '"/>',
  fog: '<path d="M4 9h16M3 13h18M6 17h12"/>',
  rain: '<path d="' + W2_CLOUD_HI + '"/><path d="M8 18.2l-.9 2.6M12.2 18.2l-.9 2.6M16.4 18.2l-.9 2.6"/>',
  snow: '<path d="' + W2_CLOUD_HI + '"/><path d="M8 19v.01M12 20.6v.01M16 19v.01" stroke-width="2.6"/>',
  storm: '<path d="' + W2_CLOUD_HI + '"/><path d="M12.8 14.6l-2.6 3.6h3.2l-1.6 3.2"/>'
};
function w2Icon(name){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (W2_ICONS[name] || W2_ICONS.cloud) + '</svg>';
}

function w2Enabled(){
  var a = normalizeHomeAppearance();
  return !!(a.widgets.weather2 && a.widgets.weather2.enabled);
}

function w2LoadCache(){
  try {
    var raw = localStorage.getItem(W2_CACHE_KEY);
    var c = raw ? JSON.parse(raw) : null;
    return c && c.data && c.data.daily ? c : null;
  } catch (e) { return null; }
}

function w2SaveCache(c){
  try { localStorage.setItem(W2_CACHE_KEY, JSON.stringify(c)); } catch (e) {}
}

function renderWeather2Bg(){
  var a = normalizeHomeAppearance();
  var data = a.weather2Bg || '';
  var img = $('weather2BgImg'), box = $('weather2');
  if (img) {
    if (data) { if (img.getAttribute('src') !== data) img.src = data; }
    else img.removeAttribute('src');
    img.hidden = !data;
  }
  if (box) box.classList.toggle('has-bg', !!data);
  var state = $('weather2BgState'); if (state) state.textContent = data ? (/^https?:/i.test(data) ? '已使用图床链接' : '已使用本地图片') : '未选择背景';
  var pick = $('weather2BgPick'); if (pick) pick.textContent = data ? '更换背景' : '选择背景';
  var clear = $('weather2BgClear'); if (clear) clear.hidden = !data;
}

function renderWeather2(){
  var cityEl = $('weather2City'), tempEl = $('weather2Temp'), condEl = $('weather2Cond'), daysEl = $('weather2Days'), box = $('weather2');
  if (!cityEl || !tempEl || !condEl || !daysEl) return;
  var c = w2State.data;
  if (box) box.classList.toggle('is-loading', w2State.busy);
  if (!c) {
    cityEl.textContent = w2State.busy ? '定位中…' : '天气';
    tempEl.textContent = '--°';
    condEl.textContent = w2State.error || '';
    daysEl.innerHTML = '';
    return;
  }
  var d = c.data, cur = d.current || {};
  var todayCode = d.daily.weather_code[0];
  cityEl.textContent = w2State.busy ? '定位中…' : (c.city || '当前位置');
  var t = Number.isFinite(Number(cur.temperature_2m)) ? Number(cur.temperature_2m) : (Number(d.daily.temperature_2m_max[0]) + Number(d.daily.temperature_2m_min[0])) / 2;
  tempEl.textContent = Math.round(t) + '°';
  condEl.textContent = w2Info(cur.weather_code !== undefined ? cur.weather_code : todayCode).t;
  var labels = ['今天', '明天', '后天'];
  daysEl.innerHTML = labels.map(function(label, i){
    var info = w2Info(d.daily.weather_code[i]);
    var lo = Math.round(d.daily.temperature_2m_min[i]), hi = Math.round(d.daily.temperature_2m_max[i]);
    return '<div class="weather2-day" title="' + info.t + '"><b>' + label + '</b>' + w2Icon(info.i) + '<span>' + lo + '°/' + hi + '°</span></div>';
  }).join('');
}

/* 先用设备定位；若超时 / 不可用（网页版常见），退回 IP 大致定位，保证天气总能出来；权限被拒绝则不退回。 */
function w2Locate(fresh){
  return getPositionRobust(fresh).then(function(pos){
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  }, function(err){
    if (err && err.code === 1) throw err;
    return w2FetchJson('https://get.geojs.io/v1/ip/geo.json').then(function(j){
      var lat = parseFloat(j && j.latitude), lon = parseFloat(j && j.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw err;
      return { lat: lat, lon: lon, approx: true };
    }).catch(function(){ throw err; });
  });
}

function w2FetchJson(url){
  return fetch(url, { cache: 'no-store' }).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function w2FetchWeather(lat, lon){
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) +
    '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3';
  return w2FetchJson(url);
}

function w2FetchCity(lat, lon){
  var url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) + '&localityLanguage=zh';
  return w2FetchJson(url).then(function(j){
    return (j && (j.city || j.locality || j.principalSubdivision)) || '';
  }).catch(function(){ return ''; });
}

/* force：点按组件时强制刷新；否则缓存新鲜就不动，失败后也隔一阵再自动重试 */
function refreshWeather2(force){
  if (w2State.busy || !w2Enabled()) return;
  var now = Date.now();
  var cache = w2State.data ? { ts: w2State.data.ts } : null;
  if (!force) {
    if (cache && now - cache.ts < W2_TTL) return;
    if (now - w2State.lastTry < W2_RETRY_GAP) return;
  }
  w2State.busy = true; w2State.lastTry = now; w2State.error = '';
  renderWeather2();
  if (force) toast('正在重新定位…');
  w2Locate(force).then(function(p){
    var prev = w2State.data;
    var sameSpot = prev && Math.abs(prev.lat - p.lat) < 0.05 && Math.abs(prev.lon - p.lon) < 0.05 && prev.city;
    return Promise.all([w2FetchWeather(p.lat, p.lon), sameSpot ? Promise.resolve(prev.city) : w2FetchCity(p.lat, p.lon)]).then(function(r){
      var c = { ts: Date.now(), lat: p.lat, lon: p.lon, city: r[1] || (prev && prev.city) || '', data: r[0] };
      w2State.data = c; w2SaveCache(c);
    });
  }).catch(function(err){
    if (err && typeof err.code === 'number' && err.code === 1) w2State.error = '未授权定位，点按重试';
    else if (err && typeof err.code === 'number' && err.code > 0) w2State.error = '定位失败，点按重试';
    else w2State.error = '天气获取失败，点按重试';
    if (force) toast(w2State.error.replace('，点按重试', ''));
  }).then(function(){
    w2State.busy = false;
    renderWeather2();
  });
}

function bindWeather2(){
  renderWeather2();
  var box = $('weather2');
  if (box) {
    box.addEventListener('click', function(){ refreshWeather2(true); });
    box.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); refreshWeather2(true); } });
  }
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) refreshWeather2(false); });
  setInterval(function(){ if (!document.hidden) refreshWeather2(false); }, 10 * 60 * 1000);
  refreshWeather2(false);
}


/* ============================== 汇总 ============================== */

/* applyHomeAppearance 每次都会调用：只做轻量渲染；组件刚被打开时顺带取一次天气。 */
function renderHomePage2(){
  renderPhoto2();
  renderInsTimeToggle();
  renderClearIconsState();
  renderInsTexts();
  renderWeather2Bg();
  if (w2Enabled()) refreshWeather2(false);
}

function bindHomePage2Events(){
  bindHomePager();
  bindImageSlot({ field: 'photo2Photo', input: 'photo2Input', pickers: ['photo2Btn', 'photo2Pick'], url: 'photo2Url', clear: 'photo2Clear',
    urlTitle: '照片链接', okMsg: '已更换照片', clearMsg: '已移除照片' });
  bindImageSlot({ field: 'weather2Bg', input: 'weather2BgInput', pickers: ['weather2BgPick'], url: 'weather2BgUrl', clear: 'weather2BgClear',
    urlTitle: '天气背景图片链接', okMsg: '已更换天气背景', clearMsg: '已移除天气背景' });
  bindWeather2();
  [['ins2TimeToggle', 'ins2Time'], ['insR2TimeToggle', 'insR2Time']].forEach(function(x){
    var tg = $(x[0]);
    if (tg) tg.addEventListener('click', function(){ var a = normalizeHomeAppearance(); a[x[1]] = !a[x[1]]; queueHomeAppearanceApply(); });
  });
  var ci = $('clearCustomIcons'); if (ci) ci.addEventListener('click', clearAllCustomIcons);
  bindInsTextInputs();
  renderInsTexts();
  renderPhoto2();
  renderWeather2Bg();
}
