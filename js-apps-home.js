/* 岛屿 · 桌面（主屏幕）：时钟、图标、Dock、壁纸、主题、桌面点击分发
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function tick(){
  if (document.hidden) return;   /* 页面在后台时不更新：省电，也避免回到前台前白白重排 */
  var d = new Date();
  var hm = d.getHours() + ':' + pad(d.getMinutes());
  renderCalendarWidget();
  if (typeof renderInsClock === 'function') renderInsClock();
}


/* 主屏幕 4×6 网格：行高 = 一个应用图标格（图标 + 名称）的实际高度。
 * 日历（4×2）、音乐（2×2）按网格跨行，高度因此自动跟随图标大小 / 名称开关 / 字号。 */
/* 组件（日历 4×2 / 音乐 2×2 / 拍立得 2×2）占两行，高度 = 2×行高 + 行距。
 * 关闭图标名称后一个图标格只剩图标本身（约 58px），两行只有 ~130px，日历月历、音乐控制栏会被挤扁、裁掉。
 * 因此行高设一个下限，保证两行高度不低于 WIDGET_MIN_H；开着名称时行高本来就更高，不受影响。 */
var WIDGET_MIN_H = 156;

function syncHomeGridRows(){
  var home = $('home');
  var grid = $('homeGrid');
  var app = grid && grid.querySelector('.app');
  if (!home || !app) return;
  var rowMeasured = app.offsetHeight;
  if (!rowMeasured) return;
  var rowFor = function(g){ return Math.max(rowMeasured, Math.ceil((WIDGET_MIN_H - g) / 2)); };
  var rowH = rowMeasured;
  /* 主屏幕不再上下滚动：先按默认行距量，若 6 行放不进可用高度（小屏手机），就把行距收紧到刚好放下。 */
  home.style.removeProperty('--home-gap-y');
  var gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
  rowH = rowFor(gap);
  var body = grid.parentElement;
  if (body) {
    var cs = getComputedStyle(body);
    var avail = body.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (avail > 0 && rowH * 6 + gap * 5 > avail) {
      gap = Math.max(4, Math.floor((avail - rowH * 6) / 5));
      home.style.setProperty('--home-gap-y', gap + 'px');
      rowH = rowFor(gap); /* 行距收紧后，两行高度会变小，行高相应补回去 */
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


/* ---------- 「无边框」图标主题的实心 SVG 符号 ---------- */
var FLAT_GLYPHS = {
  '聊天': '<path d="M12 3.2c-5 0-9 3.4-9 7.6 0 2.3 1.2 4.3 3.1 5.7-.1 1.3-.7 2.5-1.6 3.4-.3.3-.1.9.4.9 2-.2 3.7-1 4.7-1.7.8.2 1.6.2 2.4.2 5 0 9-3.4 9-7.6S17 3.2 12 3.2z"/>',
  '屿年': '<path d="M2.5999999999999996 17.2A9.4 9.4 0 0 1 21.4 17.2H19.4A7.4 7.4 0 0 0 4.6 17.2Z"/><path d="M5.8 17.2A6.2 6.2 0 0 1 18.2 17.2H16.2A4.2 4.2 0 0 0 7.8 17.2Z"/><path d="M9.0 17.2A3.0 3.0 0 0 1 15.0 17.2Z"/><path d="M19.4 2.6l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85z"/>',
  '相册': '<path fill-rule="evenodd" d="M5.6 3.6h12.8A2.6 2.6 0 0 1 21 6.2v11.6a2.6 2.6 0 0 1-2.6 2.6H5.6A2.6 2.6 0 0 1 3 17.8V6.2a2.6 2.6 0 0 1 2.6-2.6zM9 7.4a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM5.2 18l4.1-4.7 3 3 2.5-2.8L19 18z"/>',
  '日历': '<path fill-rule="evenodd" d="M7.2 2.6c.6 0 1 .4 1 1V5h7.6V3.6c0-.6.4-1 1-1s1 .4 1 1V5h.2A2.8 2.8 0 0 1 21 7.8v10.4a2.8 2.8 0 0 1-2.8 2.8H5.8A2.8 2.8 0 0 1 3 18.2V7.8A2.8 2.8 0 0 1 5.8 5H6.2V3.6c0-.6.4-1 1-1zM6.8 10.8h2.4v2.4H6.8zm4 0h2.4v2.4h-2.4zm4 0h2.4v2.4h-2.4zM6.8 15.2h2.4v2.4H6.8zm4 0h2.4v2.4h-2.4z"/>',
  '备忘录': '<path fill-rule="evenodd" d="M7.4 3h9.2A3.4 3.4 0 0 1 20 6.4v11.2a3.4 3.4 0 0 1-3.4 3.4H7.4A3.4 3.4 0 0 1 4 17.6V6.4A3.4 3.4 0 0 1 7.4 3zM8 7.6h8v1.7H8zm0 3.6h8v1.7H8zm0 3.6h5v1.7H8z"/>',
  '天气': '<circle cx="8.2" cy="8.4" r="3.7" opacity=".7"/><path d="M7.6 20a4.3 4.3 0 0 1-.4-8.6 5.6 5.6 0 0 1 10.6 1.4A3.6 3.6 0 0 1 17.4 20z"/>',
  '时钟': '<path fill-rule="evenodd" d="M12 2.4a9.6 9.6 0 1 0 0 19.2 9.6 9.6 0 0 0 0-19.2zM11 6.4h2v5.4l3.5 2.1-1 1.7-4.5-2.7z"/>',
  '设置': '<g><rect x="10.1" y="2.4" width="3.8" height="4.6" rx="1.2"/><rect x="10.1" y="2.4" width="3.8" height="4.6" rx="1.2" transform="rotate(45 12 12)"/><rect x="10.1" y="2.4" width="3.8" height="4.6" rx="1.2" transform="rotate(90 12 12)"/><rect x="10.1" y="2.4" width="3.8" height="4.6" rx="1.2" transform="rotate(135 12 12)"/><rect x="10.1" y="2.4" width="3.8" height="4.6" rx="1.2" transform="rotate(180 12 12)"/><rect x="10.1" y="2.4" width="3.8" height="4.6" rx="1.2" transform="rotate(225 12 12)"/><rect x="10.1" y="2.4" width="3.8" height="4.6" rx="1.2" transform="rotate(270 12 12)"/><rect x="10.1" y="2.4" width="3.8" height="4.6" rx="1.2" transform="rotate(315 12 12)"/></g><path fill-rule="evenodd" d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8zM12 8.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z"/>',
  '电话': '<path transform="rotate(-135 12 12)" d="M3.2 9.4c0-1.2.6-2 1.7-2.5 4.2-1.7 10.7-1.7 14.2 0 1.1.5 1.7 1.3 1.7 2.5v1.3c0 .9-.6 1.5-1.5 1.6l-2.6.3c-.8.1-1.4-.4-1.5-1.2l-.2-1.7c-.1-.5-.4-.8-.9-.9-1.3-.2-2.6-.2-3.9 0-.5.1-.8.4-.9.9l-.2 1.7c-.1.8-.7 1.3-1.5 1.2l-2.6-.3c-.9-.1-1.5-.7-1.5-1.6z"/>',
  '倒数日': '<path d="M2.91 15.83Q4.7 14.34 5.74 13.39Q6.78 12.43 7.49 11.39Q8.21 10.34 8.21 9.35Q8.21 8.6 7.86 8.17Q7.51 7.75 6.82 7.75Q6.12 7.75 5.72 8.27Q5.33 8.8 5.33 9.75H2.3Q2.34 8.19 2.97 7.15Q3.6 6.1 4.64 5.6Q5.68 5.11 6.94 5.11Q9.13 5.11 10.24 6.23Q11.35 7.35 11.35 9.15Q11.35 11.11 10.01 12.79Q8.67 14.47 6.59 16.07H11.55V18.62H2.34V16.29Q2.96 15.79 2.91 15.83ZM17.11 5.09Q18.49 5.09 19.47 5.57Q20.45 6.04 20.96 6.87Q21.46 7.7 21.46 8.72Q21.46 9.94 20.86 10.7Q20.25 11.46 19.44 11.73V11.81Q20.49 12.16 21.09 12.96Q21.7 13.77 21.7 15.04Q21.7 16.18 21.18 17.05Q20.65 17.92 19.65 18.41Q18.65 18.91 17.28 18.91Q15.07 18.91 13.76 17.83Q12.45 16.74 12.38 14.56H15.42Q15.44 15.37 15.88 15.84Q16.32 16.3 17.17 16.3Q17.88 16.3 18.28 15.89Q18.67 15.48 18.67 14.8Q18.67 13.92 18.11 13.52Q17.55 13.13 16.32 13.13H15.74V10.58H16.32Q17.26 10.58 17.84 10.26Q18.41 9.94 18.41 9.11Q18.41 8.45 18.05 8.08Q17.68 7.71 17.04 7.71Q16.34 7.71 16 8.14Q15.66 8.56 15.61 9.18H12.54Q12.61 7.22 13.83 6.15Q15.04 5.09 17.11 5.09Z"/>',
  '世界书': '<path d="M2.8 5.8c3.1-.9 6.2-.6 8.4 1v13c-2.3-1.5-5.4-1.8-8.4-.9z"/><path d="M21.2 5.8c-3.1-.9-6.2-.6-8.4 1v13c2.3-1.5 5.4-1.8 8.4-.9z"/>',
  '相遇': '<circle cx="8.2" cy="8.2" r="3"/><path d="M2.6 19.6a5.6 5.6 0 0 1 11.2 0z"/><circle cx="15.8" cy="8.2" r="3" opacity=".72"/><path d="M10.2 19.6a5.6 5.6 0 0 1 11.2 0z" opacity=".72"/>',
  '关联账号': '<circle cx="9" cy="8" r="3.4"/><path d="M2.6 20a6.4 6.4 0 0 1 12.8 0z"/><path d="M18.1 10.2h1.9v2.7h2.7v1.9H20v2.7h-1.9v-2.7h-2.7v-1.9h2.7z"/>',
  '论坛': '<path fill-rule="evenodd" d="M5.5 3.5h13A2.5 2.5 0 0 1 21 6v9a2.5 2.5 0 0 1-2.5 2.5H12L7.5 21v-3.5h-2A2.5 2.5 0 0 1 3 15V6a2.5 2.5 0 0 1 2.5-2.5zM7 7.4h10V9H7zm0 3.4h6.4v1.6H7z"/>',
  '文学城': '<rect x="2.8" y="10.6" width="5.2" height="9.6" rx="1.1"/><rect x="9.4" y="3.6" width="5.2" height="16.6" rx="1.1"/><rect x="16" y="8" width="5.2" height="12.2" rx="1.1"/>',
  '情侣空间': '<path d="M12 20.6 4.2 12.9a4.6 4.6 0 0 1 0-6.6 4.8 4.8 0 0 1 6.7 0L12 7.4l1.1-1.1a4.8 4.8 0 0 1 6.7 0 4.6 4.6 0 0 1 0 6.6z"/>',
  '预设': '<rect x="3" y="5.1" width="8.6" height="1.8" rx=".9"/><rect x="18.4" y="5.1" width="2.6" height="1.8" rx=".9"/><circle cx="15" cy="6" r="2.8"/><rect x="3" y="11.1" width="2.1" height="1.8" rx=".9"/><rect x="11.9" y="11.1" width="9.1" height="1.8" rx=".9"/><circle cx="8.5" cy="12" r="2.8"/><rect x="3" y="17.1" width="9.6" height="1.8" rx=".9"/><rect x="19.4" y="17.1" width="1.6" height="1.8" rx=".8"/><circle cx="16" cy="18" r="2.8"/>',
  '番外笺': '<path fill-rule="evenodd" d="M5 5h14a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 19 19H5a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 5 5zM4.6 8.4 12 14l7.4-5.6-1-1.4L12 11.7 5.6 7z"/>',
  '美团': '<path d="M8.2 9.5V7.2a3.8 3.8 0 0 1 7.6 0v2.3h-1.8V7.2a2 2 0 0 0-4 0v2.3z"/><path d="M5.8 9.8h12.4l1 9.7a1.6 1.6 0 0 1-1.6 1.8H6.4a1.6 1.6 0 0 1-1.6-1.8z"/>',
  '栖迟': '<path d="M19.6 14.6A8.4 8.4 0 0 1 9.4 4.4a8.4 8.4 0 1 0 10.2 10.2z"/><path d="M18.6 3.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
  '音乐': '<ellipse cx="7" cy="17.8" rx="3.1" ry="2.7"/><ellipse cx="17" cy="15.8" rx="3.1" ry="2.7"/><rect x="8.9" y="5.6" width="2" height="12.2"/><rect x="18.9" y="3.6" width="2" height="12.2"/><path d="M8.9 5.2l12-2.6v4l-12 2.6z"/>'
};

function getHomeIconTheme(){
  var t = State.settings && State.settings.homeAppearance && State.settings.homeAppearance.iconTheme;
  return ['default','borderless'].indexOf(t) >= 0 ? t : 'default';
}

/* ---------- 「默认」图标主题：12 张透明 PNG，作为本地静态资源随网页 / APK 一起打包（见 icons/ 目录）----------
 * 图标自带圆角与底色，不再叠加底板或圆角裁切；用户自定义上传的图片优先级仍然更高。 */
var DEFAULT_ICON_FILES = {
  '聊天': 'icons/chat.png',
  '屿年': 'icons/yunian.png',
  '相册': 'icons/photos.png',
  '日历': 'icons/calendar.png',
  '备忘录': 'icons/notes.png',
  '天气': 'icons/weather.png',
  '时钟': 'icons/clock.png',
  '设置': 'icons/settings.png',
  '电话': 'icons/phone.png',
  '倒数日': 'icons/countdowndays.png',
  '世界书': 'icons/worldbook.png',
  '音乐': 'icons/music.png',
  /* 第二页桌面 */
  '相遇': 'icons/xiangyu.png',
  '关联账号': 'icons/guanlianzhanghao.png',
  '论坛': 'icons/luntan.png',
  '文学城': 'icons/wenxuecheng.png',
  '情侣空间': 'icons/qinglvkongjian.png',
  '预设': 'icons/yushe.png',
  '番外笺': 'icons/fanwaijian.png',
  '美团': 'icons/meituan.png',
  '栖迟': 'icons/xichi.png'
};

function setAppIconVisual(iconEl, appName, imageData){
  if (!iconEl) return;
  var theme = getHomeIconTheme();
  var flat = theme === 'borderless';
  var builtin = theme === 'default' && !imageData && !!DEFAULT_ICON_FILES[appName];
  /* 主题 / 名称 / 自定义图片都没变就不重建，避免开关一点就把 12 个图标全部拆了重建 */
  var visKey = theme + '|' + appName;
  if (iconEl.__visKey === visKey && iconEl.__visData === (imageData || '') && iconEl.firstChild) return;
  iconEl.__visKey = visKey;
  iconEl.__visData = imageData || '';
  iconEl.classList.toggle('has-custom-image', !!imageData);
  iconEl.classList.toggle('is-flat', flat && !imageData);
  iconEl.classList.toggle('is-default-icon', builtin);
  iconEl.innerHTML = '';
  if (builtin) {
    var dimg = document.createElement('img');
    dimg.src = DEFAULT_ICON_FILES[appName];
    dimg.alt = '';
    dimg.decoding = 'async';
    dimg.draggable = false;
    dimg.setAttribute('aria-hidden', 'true');
    iconEl.appendChild(dimg);
  } else if (imageData) {
    var img = document.createElement('img');
    img.src = imageData;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    iconEl.appendChild(img);
  } else if (flat && FLAT_GLYPHS[appName]) {
    /* 无边框：只留一枚实心符号，没有底板、没有边线 */
    var fh = document.createElement('span');
    fh.className = 'flat-glyph';
    fh.setAttribute('aria-hidden', 'true');
    fh.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor">' + FLAT_GLYPHS[appName] + '</svg>';
    iconEl.appendChild(fh);
  }
}


/* 启动时第一次 applyHomeAppearance 用的是默认设置，若此时就画图标，会先闪一下默认主题的底板/边框，
 * 读到用户真正的主题后再换掉。所以在存档读完之前不画桌面图标，读完后一次画对。 */
var HOME_ICONS_READY = false;

function renderHomeAppIcons(){
  if (!HOME_ICONS_READY) return;
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
  var libSig = getHomeIconTheme() + '#' + HOME_APP_NAMES.map(function(name){ var d = a.iconData[name] || ''; return d.length + ':' + d.slice(-16); }).join('|');
  if (host.__libSig === libSig && host.firstChild) return;
  host.__libSig = libSig;
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
    var urlBtn = document.createElement('button');
    urlBtn.className = 'icon-library-btn';
    urlBtn.type = 'button';
    urlBtn.setAttribute('data-icon-url', name);
    urlBtn.textContent = '链接';
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
    actions.appendChild(urlBtn);
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


function importHomeAppIconUrl(appName){
  if (HOME_APP_NAMES.indexOf(appName) < 0) return;
  promptImageUrl(appName + ' 图标链接').then(function(url){
    if (!url) return;
    var a = normalizeHomeAppearance();
    a.iconData[appName] = url;
    applyHomeAppearance();
    saveSettings();
    toast('已更换' + appName + '图标');
  });
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
  applyIslandScale(a);
  if (home) {
    home.setAttribute('data-icon-theme', a.iconTheme);
    home.setAttribute('data-dock-bg', a.dockNoBackground ? 'off' : 'on');
    applyIconLabelStyle(a);
    home.setAttribute('data-icon-labels', a.iconLabels ? 'on' : 'off');
    home.style.setProperty('--dark-icon-brightness', String(1 - a.dimDarkIconAmount / 100));
    home.setAttribute('data-dim-dark-wallpaper', a.dimDarkWallpaper ? 'on' : 'off');
    home.setAttribute('data-widget-calendar', a.widgets.calendar && a.widgets.calendar.enabled ? 'on' : 'off');
    home.setAttribute('data-widget-music', a.widgets.music && a.widgets.music.enabled ? 'on' : 'off');
    home.setAttribute('data-widget-polaroid', a.widgets.polaroid && a.widgets.polaroid.enabled ? 'on' : 'off');
    ['photo2','weather2','ins2'].forEach(function(k){ home.setAttribute('data-widget-' + k, a.widgets[k] && a.widgets[k].enabled ? 'on' : 'off'); });
    var mctl = a.widgets.music && a.widgets.music.controlColor;
    mctl = (mctl === 'black' || mctl === 'white') ? mctl : 'auto';
    if (home.getAttribute('data-music-ctl') !== mctl) home.setAttribute('data-music-ctl', mctl);
    var paper = a.widgets.polaroid && a.widgets.polaroid.paper === 'black' ? 'black' : 'white';
    if (home.getAttribute('data-polaroid-paper') !== paper) home.setAttribute('data-polaroid-paper', paper);
    applyCalendarWidgetStyle(a);
  }
  var dock = document.querySelector('.dock');
  if (dock) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var baseAlpha = dark ? 0.045 : 0.66;
    var effectiveAlpha = baseAlpha * (1 - a.dockTransparency / 100);
    dock.style.setProperty('--dock-radius', a.dockRadius + 'px');
    dock.style.setProperty('--dock-effective-alpha', String(Math.max(0, Math.min(1, effectiveAlpha))));
  }
  applyHomeVars(a);
  renderHomeAppIcons();
  renderCalendarPhoto();
  renderMusicCover();
  renderPolaroidPhoto();
  if (typeof renderHomePage2 === 'function') renderHomePage2();
  syncHomeGridRows();
  if (wallpaper) {
    wallpaper.setAttribute('data-wallpaper', a.wallpaper);
    wallpaper.setAttribute('data-dim-dark', a.dimDarkWallpaper ? 'on' : 'off');
    wallpaper.style.setProperty('--dark-wallpaper-brightness', String(1 - a.dimDarkWallpaperAmount / 100));
    wallpaper.classList.toggle('is-custom', !!a.wallpaperData);
    /* 壁纸是 base64 大字符串：只在真正变化时才重设，否则每次开关都会重新解析数 MB 的样式值 */
    if (wallpaper.__wpData !== (a.wallpaperData || '')) {
      wallpaper.__wpData = a.wallpaperData || '';
      if (a.wallpaperData) wallpaper.style.backgroundImage = 'url(\"' + a.wallpaperData + '\")';
      else wallpaper.style.backgroundImage = '';
    }
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
  renderHomeSliders(a);
  /* 「默认」主题的 PNG 自带圆角，圆角拉条无意义：该主题下隐藏整段「图标调节」 */
  $$('[data-icon-hide-in]').forEach(function(el){ el.classList.toggle('is-theme-hidden', el.getAttribute('data-icon-hide-in') === a.iconTheme); });
  var dimWallpaper = $('dimDarkWallpaperToggle');
  if (dimWallpaper) { dimWallpaper.classList.toggle('is-on', a.dimDarkWallpaper); dimWallpaper.setAttribute('aria-checked', a.dimDarkWallpaper ? 'true' : 'false'); }
  var scaleIn = $('islandScaleInput'); if (scaleIn && document.activeElement !== scaleIn) scaleIn.value = String(a.islandScale);
  var lsIn = $('labelSizeInput'); if (lsIn && document.activeElement !== lsIn) lsIn.value = String(a.labelSize);
  var lcPick = $('labelColorPicker'); if (lcPick) lcPick.value = a.labelColor;
  var lcIn = $('labelColorInput'); if (lcIn && document.activeElement !== lcIn) lcIn.value = a.labelColor.toUpperCase();
  var dockBg = $('dockNoBgToggle');
  if (dockBg) { dockBg.classList.toggle('is-on', a.dockNoBackground); dockBg.setAttribute('aria-checked', a.dockNoBackground ? 'true' : 'false'); }
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
  if (wallpaperState) wallpaperState.textContent = a.wallpaperData ? (/^https?:/i.test(a.wallpaperData) ? '已使用图床链接' : '已使用本地图片') : '未选择本地图片';
  renderCalendarStyleControls(a);
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


/* 点击开关 / 选项后：先同步刷新控件外观（很轻，动画立刻开始），
 * 再等这一帧画完后才做整屏重应用与存盘，避免点击瞬间主线程被占满导致开关"卡一下"。 */
var _homeApplyQueued = false;
function queueHomeAppearanceApply(){
  renderHomeAppearanceOptions();
  if (!_homeApplyQueued) {
    _homeApplyQueued = true;
    afterPaint(function(){ _homeApplyQueued = false; applyHomeAppearance(); });
  }
  scheduleSettingsSave(260);
}


function setHomeIconOption(kind, value){
  var a = normalizeHomeAppearance();
  if (kind === 'theme' && ['default','borderless'].indexOf(value) >= 0) {
    /* 切换主题：数值换成该主题自己的一组（applyHomeAppearance → normalize 会读 themeParams）。
     * 与「锁定」无关——锁定只是防误触拉条，不会让数值卡在上一个主题。 */
    a.iconTheme = value;
  }
  queueHomeAppearanceApply();
}


function setDockSetting(kind, value){
  var a = State.settings && State.settings.homeAppearance;
  if (!a) return;
  var n = Number(value);
  if (!Number.isFinite(n)) return;
  if (kind === 'radius') { if (a.dockRadiusLocked) return; a.dockRadius = Math.max(0, Math.min(40, Math.round(n))); a.dockShapeV2 = true; }
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
  scheduleSettingsSave(900);
}


function setDockLock(kind, on){
  var a = normalizeHomeAppearance();
  if (kind === 'radius') a.dockRadiusLocked = !!on;
  if (kind === 'transparency') a.dockTransparencyLocked = !!on;
  queueHomeAppearanceApply();
}


/* ---------- 拉条自定义调节（图标圆角 / Dock 模糊度）----------
 * 每条拉条都带「锁定」：锁定后拉条置灰、数值不可再改，设置会随外观一起保存。 */
var HOME_SLIDERS = {
  iconRadius:  { lockKey: 'iconRadiusLocked',  min: 0, max: 50,  unit: '%' },
  dockBlur:    { lockKey: 'dockBlurLocked',    min: 0, max: 60,  unit: 'px' }
};

/* 写入全局 CSS 变量：桌面、Dock 与设置里的图标预览共用同一组参数。 */
var _homeVarCache = {};
function applyHomeVars(a){
  var rootStyle = document.documentElement.style;
  /* 这些变量挂在根节点上，每写一次都会让整棵样式树失效重算：只写真正变化的那几个 */
  var st = { setProperty: function(k, v){ if (_homeVarCache[k] === v) return; _homeVarCache[k] = v; rootStyle.setProperty(k, v); } };
  st.setProperty('--icon-radius', a.iconRadius + '%');
  st.setProperty('--dock-blur', a.dockBlur + 'px');
}

function paintHomeSlider(name, a){
  var d = HOME_SLIDERS[name];
  var range = $(name + 'Range'), valueEl = $(name + 'Value'), lock = $(name + 'Lock');
  var v = a[name], locked = a[d.lockKey] === true;
  if (range) {
    range.value = String(v);
    range.disabled = locked;
    range.style.setProperty('--dock-range-pct', ((v - d.min) / (d.max - d.min) * 100) + '%');
  }
  if (valueEl) valueEl.textContent = String(v) + d.unit;
  if (lock) {
    lock.classList.toggle('is-on', locked);
    lock.setAttribute('aria-pressed', locked ? 'true' : 'false');
    lock.textContent = locked ? '已锁定' : '锁定';
  }
}

/* 拖动中的轻量绘制：只更新轨道进度和数值文字。
 * 原来每次 input 都走 paintHomeSlider，会把 range.value 回写给正在拖的拉条，造成"手指和滑块打架"。 */
function paintHomeSliderLive(name, a){
  var d = HOME_SLIDERS[name];
  var range = $(name + 'Range'), valueEl = $(name + 'Value');
  var v = a[name];
  if (range) range.style.setProperty('--dock-range-pct', ((v - d.min) / (d.max - d.min) * 100) + '%');
  if (valueEl) valueEl.textContent = String(v) + d.unit;
}

function renderHomeSliders(a){
  Object.keys(HOME_SLIDERS).forEach(function(name){ paintHomeSlider(name, a); });
}

function setHomeSlider(name, value){
  var d = HOME_SLIDERS[name];
  var a = State.settings && State.settings.homeAppearance;
  if (!d || !a || a[d.lockKey] === true) return;
  var n = Number(value);
  if (!Number.isFinite(n)) return;
  a[name] = Math.max(d.min, Math.min(d.max, Math.round(n)));
  /* 同步写进当前主题自己的那一组，切换主题时才不会串值 */
  if (!a.themeParams) a.themeParams = {};
  if (a.iconTheme === 'borderless' && name === 'iconRadius') {
    if (!a.themeParams.borderless) a.themeParams.borderless = {};
    a.themeParams.borderless[name] = a[name];
  }
  paintHomeSliderLive(name, a);
  applyHomeVars(a);
  scheduleSettingsSave(900);
}

function setHomeSliderLock(name, on){
  var d = HOME_SLIDERS[name];
  if (!d) return;
  var a = normalizeHomeAppearance();
  a[d.lockKey] = !!on;
  paintHomeSlider(name, a);
  scheduleSettingsSave(200);
}

function bindHomeSliders(){
  Object.keys(HOME_SLIDERS).forEach(function(name){
    var range = $(name + 'Range');
    if (range) {
      bindSmoothRange(range, function(v){ setHomeSlider(name, v); }, function(){ scheduleSettingsSave(200); });
    }
    var lock = $(name + 'Lock');
    if (lock) lock.addEventListener('click', function(){
      setHomeSliderLock(name, !normalizeHomeAppearance()[HOME_SLIDERS[name].lockKey]);
    });
  });
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
  scheduleSettingsSave(900);
}


function setDimDarkLock(kind, on){
  var a = normalizeHomeAppearance();
  if (kind === 'wallpaper') a.dimDarkWallpaperLocked = !!on;
  if (kind === 'icon') a.dimDarkIconLocked = !!on;
  queueHomeAppearanceApply();
}


function setDimDarkWallpaper(on){
  var a = normalizeHomeAppearance();
  a.dimDarkWallpaper = !!on;
  queueHomeAppearanceApply();
}


/* ---------- 屏幕比例 / 图标名称样式 / 无 Dock 背景 ---------- */
function labelShadowFor(hex){
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  /* 浅色字配深色柔边，深色字配浅色柔边：在任何壁纸（尤其白色/浅色）上都能看清 */
  return lum >= 0.55
    ? '0 0 1px rgba(0,0,0,.34), 0 1px 3px rgba(0,0,0,.20)'
    : '0 0 1px rgba(255,255,255,.55), 0 1px 3px rgba(255,255,255,.30)';
}

/* 全局屏幕比例：给 <html> 写比例变量；≠100% 时 body 整体缩放并按 1/比例 放大尺寸，刚好铺满屏幕 */
function getIslandScale(){
  var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--island-scale'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function applyIslandScale(a){
  var root = document.documentElement;
  var z = Math.max(0.7, Math.min(1.3, (Number(a.islandScale) || 100) / 100));
  root.style.setProperty('--island-scale', String(z));
  if (Math.abs(z - 1) < 0.001) root.removeAttribute('data-scaled');
  else root.setAttribute('data-scaled', '1');
}

function applyIconLabelStyle(a){
  var home = $('home'); if (!home) return;
  home.style.setProperty('--label-size', a.labelSize + 'px');
  home.style.setProperty('--label-color', a.labelColor);
  home.style.setProperty('--label-shadow', labelShadowFor(a.labelColor));
}

function setIslandScale(v){
  var a = normalizeHomeAppearance();
  var n = Number(v);
  if (!Number.isFinite(n)) { renderHomeAppearanceOptions(); return; }
  a.islandScale = Math.max(70, Math.min(130, Math.round(n)));
  applyHomeAppearance(); saveSettings();
}

function setLabelSize(v){
  var a = normalizeHomeAppearance();
  var n = Number(v);
  if (!Number.isFinite(n)) { renderHomeAppearanceOptions(); return; }
  a.labelSize = Math.max(8, Math.min(18, Math.round(n)));
  applyHomeAppearance(); saveSettings();
}

function setLabelColor(v){
  var a = normalizeHomeAppearance();
  var t = String(v || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(t)) t = t.replace(/(.)/g, '$1$1');
  if (!/^[0-9a-fA-F]{6}$/.test(t)) { renderHomeAppearanceOptions(); toast('颜色格式应为 #RRGGBB'); return; }
  a.labelColor = '#' + t.toLowerCase();
  applyHomeAppearance(); saveSettings();
}

function setDockNoBackground(on){
  var a = normalizeHomeAppearance();
  a.dockNoBackground = !!on;
  queueHomeAppearanceApply();
}

function setHomeIconLabels(on){
  var a = normalizeHomeAppearance();
  a.iconLabels = !!on;
  queueHomeAppearanceApply();
}


/* ---------- 组件背景：默认 / 毛玻璃（日历 / 音乐 / 拍立得通用）---------- */
/* 每个组件各有一套：属性 data-<前缀>-bg 决定用不用毛玻璃，变量 --<前缀>-glass-blur / --<前缀>-glass-k 决定模糊与透明。
 * 控件 id：<key>BgChips（样式按钮）、<key>GlassControls（拉条容器）、<key>GlassBlurRange/Value、<key>GlassTransparencyRange/Value。 */
var GLASS_WIDGETS = { calendar: 'cal', music: 'music', polaroid: 'polaroid' };

function widgetGlassConfig(a, key){
  var c = a && a.widgets && a.widgets[key];
  return {
    style: c && ['glass','black','white'].indexOf(c.bgStyle) >= 0 ? c.bgStyle : 'default',
    blur: c && Number.isFinite(Number(c.glassBlur)) ? Number(c.glassBlur) : 20,
    transparency: c && Number.isFinite(Number(c.glassTransparency)) ? Number(c.glassTransparency) : 40
  };
}

function calendarWidgetConfig(a){ return widgetGlassConfig(a, 'calendar'); }

/* 把样式写到桌面（拉条拖动时也走这里，很轻） */
function applyWidgetGlassStyle(a, key){
  var home = $('home'); if (!home) return;
  var p = GLASS_WIDGETS[key]; if (!p) return;
  var c = widgetGlassConfig(a || normalizeHomeAppearance(), key);
  if (home.getAttribute('data-' + p + '-bg') !== c.style) home.setAttribute('data-' + p + '-bg', c.style);
  home.style.setProperty('--' + p + '-glass-blur', c.blur + 'px');
  home.style.setProperty('--' + p + '-glass-k', String(Math.max(0, Math.min(1, 1 - c.transparency / 100))));
}

function applyCalendarWidgetStyle(a){
  a = a || normalizeHomeAppearance();
  Object.keys(GLASS_WIDGETS).forEach(function(key){ applyWidgetGlassStyle(a, key); });
}

function renderWidgetGlassSlider(rangeId, valueId, value, max, unit){
  var range = $(rangeId), valueEl = $(valueId);
  if (range) {
    if (document.activeElement !== range) range.value = String(value);
    range.style.setProperty('--dock-range-pct', (value / max * 100) + '%');
  }
  if (valueEl) valueEl.textContent = value + unit;
}
var renderCalendarGlassSlider = renderWidgetGlassSlider;

function renderWidgetGlassSliders(a, key){
  var c = widgetGlassConfig(a, key);
  renderWidgetGlassSlider(key + 'GlassBlurRange', key + 'GlassBlurValue', c.blur, 40, 'px');
  renderWidgetGlassSlider(key + 'GlassTransparencyRange', key + 'GlassTransparencyValue', c.transparency, 100, '%');
}

function renderMusicControlColor(a){
  var v = a && a.widgets && a.widgets.music && a.widgets.music.controlColor;
  v = (v === 'black' || v === 'white') ? v : 'auto';
  $$('#musicCtlChips [data-ctl]').forEach(function(btn){
    var on = btn.dataset.ctl === v;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function setMusicControlColor(value){
  var a = normalizeHomeAppearance();
  if (!a.widgets.music) return;
  a.widgets.music.controlColor = (value === 'black' || value === 'white') ? value : 'auto';
  queueHomeAppearanceApply();
}

function renderPolaroidPaperControls(a){
  var paper = a && a.widgets && a.widgets.polaroid && a.widgets.polaroid.paper === 'black' ? 'black' : 'white';
  $$('#polaroidPaperChips [data-paper]').forEach(function(btn){
    var on = btn.dataset.paper === paper;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function setPolaroidPaper(value){
  var a = normalizeHomeAppearance();
  if (!a.widgets.polaroid) return;
  a.widgets.polaroid.paper = value === 'black' ? 'black' : 'white';
  queueHomeAppearanceApply();
}

function renderCalendarStyleControls(a){
  renderPolaroidPaperControls(a);
  renderMusicControlColor(a);
  Object.keys(GLASS_WIDGETS).forEach(function(key){
    var c = widgetGlassConfig(a, key);
    $$('#' + key + 'BgChips [data-bg-style]').forEach(function(btn){
      var on = btn.dataset.bgStyle === c.style;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var box = $(key + 'GlassControls'); if (box) box.hidden = c.style !== 'glass';
    renderWidgetGlassSliders(a, key);
  });
}

function setWidgetBgStyle(key, style){
  var a = normalizeHomeAppearance();
  if (!a.widgets[key]) return;
  var allowed = key === 'calendar' ? ['glass','black','white'] : ['glass'];
  a.widgets[key].bgStyle = allowed.indexOf(style) >= 0 ? style : 'default';
  queueHomeAppearanceApply();
}
function setCalendarBgStyle(style){ setWidgetBgStyle('calendar', style); }

/* 拉条拖动：只改变量与数值，不整屏重应用；松手后统一存盘 */
function setWidgetGlassSetting(key, kind, value){
  var a = State.settings && State.settings.homeAppearance;
  if (!a || !a.widgets || !a.widgets[key]) return;
  var n = Number(value); if (!Number.isFinite(n)) return;
  if (kind === 'blur') a.widgets[key].glassBlur = Math.max(0, Math.min(40, Math.round(n)));
  else a.widgets[key].glassTransparency = Math.max(0, Math.min(100, Math.round(n)));
  applyWidgetGlassStyle(a, key);
  renderWidgetGlassSliders(a, key);
}
function setCalendarGlassSetting(kind, value){ setWidgetGlassSetting('calendar', kind, value); }


function setWidgetEnabled(key, on){
  var a = normalizeHomeAppearance();
  if (!a.widgets[key]) return;
  a.widgets[key].enabled = !!on;
  queueHomeAppearanceApply();
}


function setWidgetSize(key, size){
  var a = normalizeHomeAppearance();
  if (!a.widgets[key] || ['small','medium','large'].indexOf(size) < 0) return;
  a.widgets[key].size = size;
  queueHomeAppearanceApply();
}


function importWallpaperUrl(){
  promptImageUrl('壁纸图片链接').then(function(url){
    if (!url) return;
    var a = normalizeHomeAppearance();
    a.wallpaperData = url;
    applyHomeAppearance();
    saveSettings();
    toast('已应用自定义壁纸');
  });
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
