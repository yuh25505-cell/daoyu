/* 岛屿 · 桌面（主屏幕）：时钟、图标、Dock、壁纸、主题、桌面点击分发
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function tick(){
  var d = new Date();
  var hm = d.getHours() + ':' + pad(d.getMinutes());
  renderCalendarWidget();
}


/* 主屏幕 4×6 网格：行高 = 一个应用图标格（图标 + 名称）的实际高度。
 * 日历（4×2）、音乐（2×2）按网格跨行，高度因此自动跟随图标大小 / 名称开关 / 字号。 */
function syncHomeGridRows(){
  var home = $('home');
  var grid = $('homeGrid');
  var app = grid && grid.querySelector('.app');
  if (!home || !app) return;
  var rowH = app.offsetHeight;
  if (!rowH) return;
  /* 主屏幕不再上下滚动：先按默认行距量，若 6 行放不进可用高度（小屏手机），就把行距收紧到刚好放下。 */
  home.style.removeProperty('--home-gap-y');
  var gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
  var body = grid.parentElement;
  if (body) {
    var cs = getComputedStyle(body);
    var avail = body.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (avail > 0 && rowH * 6 + gap * 5 > avail) {
      gap = Math.max(4, Math.floor((avail - rowH * 6) / 5));
      home.style.setProperty('--home-gap-y', gap + 'px');
    }
  }
  home.style.setProperty('--home-row-h', rowH + 'px');
  home.style.setProperty('--cal-widget-h', (rowH * 2 + gap) + 'px');
  /* 2 行高度不足 150px（例如关闭图标名称）时，音乐组件进入紧凑模式，给封面多留空间。 */
  home.setAttribute('data-grid-compact', (rowH * 2 + gap) < 150 ? 'on' : 'off');
}


function bindHomeGridEvents(){
  syncHomeGridRows();
  var firstApp = document.querySelector('#homeGrid .app');
  if (firstApp && window.ResizeObserver) new ResizeObserver(syncHomeGridRows).observe(firstApp);
  window.addEventListener('resize', syncHomeGridRows);
}


function getSystemTheme(){
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}


function setAppIconVisual(iconEl, appName, imageData){
  if (!iconEl) return;
  iconEl.classList.toggle('has-custom-image', !!imageData);
  iconEl.innerHTML = '';
  if (imageData) {
    var img = document.createElement('img');
    img.src = imageData;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    iconEl.appendChild(img);
  } else {
    var glyph = document.createElement('span');
    glyph.className = 'app-glyph';
    glyph.textContent = appName.charAt(0);
    glyph.setAttribute('aria-hidden', 'true');
    iconEl.appendChild(glyph);
  }
}


function renderHomeAppIcons(){
  var a = normalizeHomeAppearance();
  $$('.home .app').forEach(function(app){
    var icon = app.querySelector('.app-icon');
    var name = app.getAttribute('data-app') || '';
    if (icon && HOME_APP_NAMES.indexOf(name) >= 0) setAppIconVisual(icon, name, a.iconData[name] || '');
  });
}


function renderHomeIconLibrary(){
  var host = $('iconLibrary');
  if (!host) return;
  var a = normalizeHomeAppearance();
  host.innerHTML = '';
  HOME_APP_NAMES.forEach(function(name){
    var item = document.createElement('div');
    item.className = 'icon-library-item';
    item.setAttribute('data-icon-editor', name);
    var preview = document.createElement('div');
    preview.className = 'app-icon icon-library-preview';
    setAppIconVisual(preview, name, a.iconData[name] || '');
    var label = document.createElement('div');
    label.className = 'icon-library-name';
    label.textContent = name;
    var actions = document.createElement('div');
    actions.className = 'icon-library-actions';
    var upload = document.createElement('button');
    upload.className = 'icon-library-btn';
    upload.type = 'button';
    upload.setAttribute('data-icon-upload', name);
    upload.textContent = '选择';
    var clear = document.createElement('button');
    clear.className = 'icon-library-btn';
    clear.type = 'button';
    clear.setAttribute('data-icon-clear', name);
    clear.textContent = '移除';
    clear.hidden = !a.iconData[name];
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    input.setAttribute('data-icon-input', name);
    actions.appendChild(upload);
    actions.appendChild(clear);
    item.appendChild(preview);
    item.appendChild(label);
    item.appendChild(actions);
    item.appendChild(input);
    host.appendChild(item);
  });
}


function handleHomeAppIconFile(appName, file){
  if (HOME_APP_NAMES.indexOf(appName) < 0 || !file) return;
  if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
  if (file.size > 8 * 1024 * 1024) { toast('图片不能超过 8MB'); return; }
  var reader = new FileReader();
  reader.onload = function(){
    var data = String(reader.result || '');
    if (!data) return;
    var a = normalizeHomeAppearance();
    a.iconData[appName] = data;
    applyHomeAppearance();
    saveSettings();
    toast('已更换' + appName + '图标');
  };
  reader.onerror = function(){ toast('读取图片失败'); };
  reader.readAsDataURL(file);
}


function clearHomeAppIcon(appName){
  var a = normalizeHomeAppearance();
  if (!a.iconData[appName]) return;
  delete a.iconData[appName];
  applyHomeAppearance();
  saveSettings();
  toast('已恢复' + appName + '默认图标');
}


function applyHomeAppearance(){
  var a = normalizeHomeAppearance();
  var home = $('home');
  var wallpaper = document.querySelector('.wallpaper');
  if (home) {
    home.setAttribute('data-icon-theme', a.iconTheme);
    home.setAttribute('data-icon-shape', a.iconShape);
    home.setAttribute('data-icon-size', a.iconSize);
    home.setAttribute('data-icon-labels', a.iconLabels ? 'on' : 'off');
    home.style.setProperty('--dark-icon-brightness', String(1 - a.dimDarkIconAmount / 100));
    home.setAttribute('data-dim-dark-wallpaper', a.dimDarkWallpaper ? 'on' : 'off');
    home.setAttribute('data-widget-calendar', a.widgets.calendar && a.widgets.calendar.enabled ? 'on' : 'off');
    home.setAttribute('data-widget-music', a.widgets.music && a.widgets.music.enabled ? 'on' : 'off');
    home.setAttribute('data-widget-polaroid', a.widgets.polaroid && a.widgets.polaroid.enabled ? 'on' : 'off');
  }
  var dock = document.querySelector('.dock');
  if (dock) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var baseAlpha = dark ? 0.045 : 0.66;
    var effectiveAlpha = baseAlpha * (1 - a.dockTransparency / 100);
    dock.style.setProperty('--dock-radius', a.dockRadius + 'px');
    dock.style.setProperty('--dock-effective-alpha', String(Math.max(0, Math.min(1, effectiveAlpha))));
  }
  renderHomeAppIcons();
  renderCalendarPhoto();
  renderMusicCover();
  renderPolaroidPhoto();
  syncHomeGridRows();
  if (wallpaper) {
    wallpaper.setAttribute('data-wallpaper', a.wallpaper);
    wallpaper.setAttribute('data-dim-dark', a.dimDarkWallpaper ? 'on' : 'off');
    wallpaper.style.setProperty('--dark-wallpaper-brightness', String(1 - a.dimDarkWallpaperAmount / 100));
    wallpaper.classList.toggle('is-custom', !!a.wallpaperData);
    if (a.wallpaperData) wallpaper.style.backgroundImage = 'url(\"' + a.wallpaperData + '\")';
    else wallpaper.style.backgroundImage = '';
  }
  renderHomeAppearanceOptions();
}


function renderHomeAppearanceOptions(){
  var a = normalizeHomeAppearance();
  $$('[data-home-icon-theme]').forEach(function(btn){
    var on = btn.dataset.homeIconTheme === a.iconTheme;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  $$('[data-home-icon-shape]').forEach(function(btn){
    var on = btn.dataset.homeIconShape === a.iconShape;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  var dimWallpaper = $('dimDarkWallpaperToggle');
  if (dimWallpaper) { dimWallpaper.classList.toggle('is-on', a.dimDarkWallpaper); dimWallpaper.setAttribute('aria-checked', a.dimDarkWallpaper ? 'true' : 'false'); }
  $$('[data-home-icon-size]').forEach(function(btn){
    var on = btn.dataset.homeIconSize === a.iconSize;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  var labels = $('homeIconLabelsToggle');
  if (labels) {
    labels.classList.toggle('is-on', a.iconLabels);
    labels.setAttribute('aria-checked', a.iconLabels ? 'true' : 'false');
  }
  var dimWallpaperAmount = $('dimDarkWallpaperAmount');
  var dimIconAmount = $('dimDarkIconAmount');
  if (dimWallpaperAmount) { dimWallpaperAmount.value = String(a.dimDarkWallpaperAmount); dimWallpaperAmount.disabled = a.dimDarkWallpaperLocked; dimWallpaperAmount.style.setProperty('--range-pct', a.dimDarkWallpaperAmount + '%'); }
  if (dimIconAmount) { dimIconAmount.value = String(a.dimDarkIconAmount); dimIconAmount.disabled = a.dimDarkIconLocked; dimIconAmount.style.setProperty('--range-pct', a.dimDarkIconAmount + '%'); }
  var dockRadiusRange = $('dockRadiusRange');
  var dockTransparencyRange = $('dockTransparencyRange');
  var dockRadiusValue = $('dockRadiusValue');
  var dockTransparencyValue = $('dockTransparencyValue');
  if (dockRadiusRange) { dockRadiusRange.value = String(a.dockRadius); dockRadiusRange.disabled = a.dockRadiusLocked; dockRadiusRange.style.setProperty('--dock-range-pct', (a.dockRadius / 40 * 100) + '%'); }
  if (dockTransparencyRange) { dockTransparencyRange.value = String(a.dockTransparency); dockTransparencyRange.disabled = a.dockTransparencyLocked; dockTransparencyRange.style.setProperty('--dock-range-pct', a.dockTransparency + '%'); }
  if (dockRadiusValue) dockRadiusValue.textContent = String(a.dockRadius) + 'px';
  if (dockTransparencyValue) dockTransparencyValue.textContent = String(a.dockTransparency) + '%';
  var dockRadiusLock = $('dockRadiusLock');
  var dockTransparencyLock = $('dockTransparencyLock');
  if (dockRadiusLock) { dockRadiusLock.classList.toggle('is-on', a.dockRadiusLocked); dockRadiusLock.setAttribute('aria-pressed', a.dockRadiusLocked ? 'true' : 'false'); dockRadiusLock.textContent = a.dockRadiusLocked ? '已锁定' : '锁定'; }
  if (dockTransparencyLock) { dockTransparencyLock.classList.toggle('is-on', a.dockTransparencyLocked); dockTransparencyLock.setAttribute('aria-pressed', a.dockTransparencyLocked ? 'true' : 'false'); dockTransparencyLock.textContent = a.dockTransparencyLocked ? '已锁定' : '锁定'; }
  var dimWallpaperAmountValue = $('dimDarkWallpaperAmountValue');
  var dimIconAmountValue = $('dimDarkIconAmountValue');
  if (dimWallpaperAmountValue) dimWallpaperAmountValue.textContent = String(a.dimDarkWallpaperAmount) + '%';
  if (dimIconAmountValue) dimIconAmountValue.textContent = String(a.dimDarkIconAmount) + '%';
  var dimWallpaperLock = $('dimDarkWallpaperLock');
  var dimIconLock = $('dimDarkIconLock');
  if (dimWallpaperLock) { dimWallpaperLock.classList.toggle('is-on', a.dimDarkWallpaperLocked); dimWallpaperLock.setAttribute('aria-pressed', a.dimDarkWallpaperLocked ? 'true' : 'false'); dimWallpaperLock.textContent = a.dimDarkWallpaperLocked ? '已锁定' : '锁定'; }
  if (dimIconLock) { dimIconLock.classList.toggle('is-on', a.dimDarkIconLocked); dimIconLock.setAttribute('aria-pressed', a.dimDarkIconLocked ? 'true' : 'false'); dimIconLock.textContent = a.dimDarkIconLocked ? '已锁定' : '锁定'; }
  var wallpaperState = $('wallpaperState');
  if (wallpaperState) wallpaperState.textContent = a.wallpaperData ? '已使用本地图片' : '未选择本地图片';
  $$('.widget-card').forEach(function(card){
    var key = card.dataset.widgetCard;
    var cfg = a.widgets[key] || {enabled:false,size:'medium'};
    card.classList.toggle('is-on', cfg.enabled);
    card.querySelectorAll('[data-widget-size]').forEach(function(btn){
      var on = btn.dataset.widgetSize === cfg.size;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  });
  renderHomeIconLibrary();
}


function setHomeIconOption(kind, value){
  var a = normalizeHomeAppearance();
  if (kind === 'theme' && ['mono','solid','outline','glass','borderless'].indexOf(value) >= 0) { a.iconTheme = value; if (value === 'borderless') a.iconBorder = 'none'; }
  if (kind === 'shape' && ['square','soft','round','pill'].indexOf(value) >= 0) a.iconShape = value;
  if (kind === 'size' && ['small','medium','large'].indexOf(value) >= 0) a.iconSize = value;
  applyHomeAppearance();
  saveSettings();
}


function setDockSetting(kind, value){
  var a = State.settings && State.settings.homeAppearance;
  if (!a) return;
  var n = Number(value);
  if (!Number.isFinite(n)) return;
  if (kind === 'radius') { if (a.dockRadiusLocked) return; a.dockRadius = Math.max(0, Math.min(40, Math.round(n))); }
  if (kind === 'transparency') { if (a.dockTransparencyLocked) return; a.dockTransparency = Math.max(0, Math.min(100, Math.round(n))); }
  var dock = document.querySelector('.dock');
  var range = kind === 'radius' ? $('dockRadiusRange') : $('dockTransparencyRange');
  var valueEl = kind === 'radius' ? $('dockRadiusValue') : $('dockTransparencyValue');
  if (range) range.style.setProperty('--dock-range-pct', kind === 'radius' ? (a.dockRadius / 40 * 100) + '%' : a.dockTransparency + '%');
  if (valueEl) valueEl.textContent = kind === 'radius' ? String(a.dockRadius) + 'px' : String(a.dockTransparency) + '%';
  if (dock) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var baseAlpha = dark ? 0.045 : 0.66;
    var effectiveAlpha = baseAlpha * (1 - a.dockTransparency / 100);
    dock.style.setProperty('--dock-radius', a.dockRadius + 'px');
    dock.style.setProperty('--dock-effective-alpha', String(Math.max(0, Math.min(1, effectiveAlpha))));
  }
  scheduleSettingsSave(120);
}


function setDockLock(kind, on){
  var a = normalizeHomeAppearance();
  if (kind === 'radius') a.dockRadiusLocked = !!on;
  if (kind === 'transparency') a.dockTransparencyLocked = !!on;
  applyHomeAppearance();
  saveSettings();
}


function setDimDarkAmount(kind, value){
  var a = State.settings && State.settings.homeAppearance;
  if (!a) return;
  var n = Math.max(0, Math.min(100, Number(value) || 0));
  var home = $('home');
  var wallpaper = document.querySelector('.wallpaper');
  var range = kind === 'wallpaper' ? $('dimDarkWallpaperAmount') : $('dimDarkIconAmount');
  var valueEl = kind === 'wallpaper' ? $('dimDarkWallpaperAmountValue') : $('dimDarkIconAmountValue');
  if (kind === 'wallpaper') {
    if (a.dimDarkWallpaperLocked) return;
    a.dimDarkWallpaperAmount = n;
    if (wallpaper) wallpaper.style.setProperty('--dark-wallpaper-brightness', String(1 - n / 100));
  }
  if (kind === 'icon') {
    if (a.dimDarkIconLocked) return;
    a.dimDarkIconAmount = n;
    if (home) home.style.setProperty('--dark-icon-brightness', String(1 - n / 100));
  }
  if (range) range.style.setProperty('--range-pct', n + '%');
  if (valueEl) valueEl.textContent = String(n) + '%';
  scheduleSettingsSave(120);
}


function setDimDarkLock(kind, on){
  var a = normalizeHomeAppearance();
  if (kind === 'wallpaper') a.dimDarkWallpaperLocked = !!on;
  if (kind === 'icon') a.dimDarkIconLocked = !!on;
  applyHomeAppearance();
  saveSettings();
}


function setDimDarkWallpaper(on){
  var a = normalizeHomeAppearance();
  a.dimDarkWallpaper = !!on;
  applyHomeAppearance();
  saveSettings();
}


function setHomeIconLabels(on){
  var a = normalizeHomeAppearance();
  a.iconLabels = !!on;
  applyHomeAppearance();
  saveSettings();
}


function setWidgetEnabled(key, on){
  var a = normalizeHomeAppearance();
  if (!a.widgets[key]) return;
  a.widgets[key].enabled = !!on;
  applyHomeAppearance();
  saveSettings();
}


function setWidgetSize(key, size){
  var a = normalizeHomeAppearance();
  if (!a.widgets[key] || ['small','medium','large'].indexOf(size) < 0) return;
  a.widgets[key].size = size;
  applyHomeAppearance();
  saveSettings();
}


function handleWallpaperFile(file){
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
  if (file.size > 8 * 1024 * 1024) { toast('图片不能超过 8MB'); return; }
  var reader = new FileReader();
  reader.onload = function(){
    var a = normalizeHomeAppearance();
    a.wallpaperData = String(reader.result || '');
    if (!a.wallpaperData) return;
    applyHomeAppearance();
    saveSettings();
    toast('已应用自定义壁纸');
  };
  reader.onerror = function(){ toast('读取图片失败'); };
  reader.readAsDataURL(file);
}


function applyChatAppearance(){
  var pref = (State.settings && State.settings.chatAppearance) || 'mono';
  if (pref !== 'mono' && pref !== 'soft') pref = 'mono';
  if (State.settings) State.settings.chatAppearance = pref;
  if (chatApp) chatApp.setAttribute('data-chat-appearance', pref);
  renderChatAppearanceOptions();
}


function renderChatAppearanceOptions(){
  var pref = (State.settings && State.settings.chatAppearance) || 'mono';
  $$('.chat-theme-option').forEach(function(el){ var on = el.dataset.chatAppearanceChoice === pref; el.classList.toggle('is-on', on); el.setAttribute('aria-checked', on ? 'true' : 'false'); });
  var state = $('chatAppearanceState');
  if (state) state.textContent = pref === 'soft' ? '柔和' : 'Mono';
}


function setChatAppearance(pref){
  if (pref !== 'mono' && pref !== 'soft') pref = 'mono';
  State.settings.chatAppearance = pref;
  applyChatAppearance();
  saveSettings();
  toast(pref === 'soft' ? '聊天外观：柔和' : '聊天外观：Mono');
}


function openChatAppearance(){
  var view = $('chatAppearanceView');
  if (!view) return;
  applyChatAppearance();
  view.classList.add('is-open');
  view.setAttribute('aria-hidden', 'false');
}


function closeChatAppearance(){
  var view = $('chatAppearanceView');
  if (!view) return;
  view.classList.remove('is-open');
  view.setAttribute('aria-hidden', 'true');
}


function applyThemePreference(){
  var pref = (State.settings && State.settings.theme) || 'system';
  var actual = pref === 'system' ? getSystemTheme() : (pref === 'dark' ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', actual);
  document.documentElement.style.colorScheme = actual;
  var meta = $('themeColorMeta');
  if (meta) meta.setAttribute('content', actual === 'dark' ? '#000000' : '#f3f3f3');
  var appleStyle = actual === 'dark' ? 'black-translucent' : 'default';
  var appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleMeta) appleMeta.setAttribute('content', appleStyle);
  renderThemeOptions();
  applyHomeAppearance();
  if (document.documentElement.classList.contains('pm-open')) requestAnimationFrame(syncPMChrome);
}


function renderThemeOptions(){
  var pref = (State.settings && State.settings.theme) || 'system';
  $$('#themeMenu .theme-option').forEach(function(el){ var on = el.dataset.themeChoice === pref; el.classList.toggle('is-on', on); el.setAttribute('aria-checked', on ? 'true' : 'false'); });
  var stateText = pref === 'system' ? '跟随系统' : (pref === 'dark' ? '夜间' : '日间');
  $$('.theme-state').forEach(function(state){ state.textContent = stateText; });
}


function setThemePreference(pref){
  if (pref !== 'system' && pref !== 'light' && pref !== 'dark') pref = 'system';
  State.settings.theme = pref;
  applyThemePreference();
  saveSettings();
  toast(pref === 'system' ? '已跟随系统' : (pref === 'dark' ? '已切换到夜间' : '已切换到日间'));
}

function bindHomeThemeEvents(){
  tick();
  applyThemePreference();
  setInterval(tick, 1000);
  var mediaTheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mediaTheme) {
    var handleSystemTheme = function(){ if ((State.settings && State.settings.theme) === 'system') applyThemePreference(); };
    if (mediaTheme.addEventListener) mediaTheme.addEventListener('change', handleSystemTheme);
    else if (mediaTheme.addListener) mediaTheme.addListener(handleSystemTheme);
  }
}

function bindHomeVisibilityEvents(){
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) { tick(); handleNotificationDeepLink(); } else { runProactiveMessage(false); } });
}

function bindHomeAppClickEvents(){

  $$('.home .app').forEach(function(btn){
    btn.addEventListener('click', function(){
      var name = btn.getAttribute('data-app');
      var openApp = APP_REGISTRY[name];
      if (typeof openApp === 'function') { openApp(); return; }
      toast(name + ' · 开发中');
    });
  });
}
