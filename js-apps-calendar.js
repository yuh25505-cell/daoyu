/* 岛屿 · 日历 App：桌面「日历」小组件（4×2：左图右历）
 * 「日历」App 本体尚未开发，完成后把底部 registerApp 的回调换成真正的打开函数即可。
 * 样式见 css-apps-calendar.css；所有 js 文件以经典脚本方式共享全局作用域。 */
'use strict';

var CAL_PHOTO_SIZE = 640;      /* 导入的图片裁成正方形后的边长（px），控制存储体积 */
var CAL_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
var _calRenderedKey = '';


/* 月日历：每秒由 tick() 调用，只在日期变化（跨天）时才重绘。 */
function renderCalendarWidget(force){
  var host = $('calDays');
  if (!host) return;
  var d = new Date();
  var y = d.getFullYear(), m = d.getMonth(), today = d.getDate();
  var key = y + '-' + m + '-' + today;
  if (!force && key === _calRenderedKey) return;
  _calRenderedKey = key;
  var lead = new Date(y, m, 1).getDay();
  var total = new Date(y, m + 1, 0).getDate();
  var html = '';
  for (var i = 0; i < lead; i++) html += '<span class="cal-day is-blank"></span>';
  for (var n = 1; n <= total; n++) {
    html += n === today
      ? '<span class="cal-day is-today" aria-current="date">' + n + '</span>'
      : '<span class="cal-day">' + n + '</span>';
  }
  host.innerHTML = html;
  host.style.setProperty('--cal-rows', String(Math.ceil((lead + total) / 7)));
  var elMonth = $('calMonth'); if (elMonth) elMonth.textContent = (m + 1) + '月';
  var elYear = $('calYear'); if (elYear) elYear.textContent = String(y);
}


/* 组件高度 = 桌面图标网格的 2 行（含行距），随图标大小 / 标签开关 / 字号自动跟随。 */
function syncCalendarWidgetHeight(){
  var home = $('home');
  var grid = document.querySelector('.app-grid');
  var app = grid && grid.querySelector('.app');
  if (!home || !app) return;
  var rowH = app.offsetHeight;
  if (!rowH) return;
  var gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
  home.style.setProperty('--cal-widget-h', (rowH * 2 + gap) + 'px');
}


/* 左侧图片 + 设置页「日历」卡片里的状态。 */
function renderCalendarPhoto(){
  var a = normalizeHomeAppearance();
  var data = a.calendarPhoto || '';
  var img = $('calPhotoImg'), empty = $('calPhotoEmpty');
  if (img) {
    if (data) { if (img.getAttribute('src') !== data) img.src = data; }
    else img.removeAttribute('src');
    img.hidden = !data;
  }
  if (empty) empty.hidden = !!data;
  var state = $('calendarPhotoState'); if (state) state.textContent = data ? '已使用本地图片' : '未选择图片';
  var pick = $('calendarPhotoPick'); if (pick) pick.textContent = data ? '更换图片' : '选择图片';
  var clear = $('calendarPhotoClear'); if (clear) clear.hidden = !data;
}


/* 居中裁成正方形并压缩：不论原图多大，存进设置的只有几十 KB。 */
function calendarPhotoFromFile(file){
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function(){
      try {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) throw new Error('empty image');
        var side = Math.min(w, h);
        var out = Math.min(CAL_PHOTO_SIZE, side);
        var canvas = document.createElement('canvas');
        canvas.width = out; canvas.height = out;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, out, out);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch (err) { reject(err); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}


function handleCalendarPhotoFile(file){
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
  if (file.size > CAL_PHOTO_MAX_BYTES) { toast('图片不能超过 20MB'); return; }
  calendarPhotoFromFile(file).then(function(data){
    var a = normalizeHomeAppearance();
    a.calendarPhoto = data;
    applyHomeAppearance();
    saveSettings();
    toast('已更换日历图片');
  }).catch(function(){ toast('读取图片失败'); });
}


function clearCalendarPhoto(){
  var a = normalizeHomeAppearance();
  if (!a.calendarPhoto) return;
  a.calendarPhoto = '';
  applyHomeAppearance();
  saveSettings();
  toast('已移除日历图片');
}


function bindCalendarWidgetEvents(){
  var input = $('calPhotoInput');
  var openPicker = function(){ if (input) input.click(); };
  var photoBtn = $('calPhotoBtn'); if (photoBtn) photoBtn.addEventListener('click', openPicker);
  var pick = $('calendarPhotoPick'); if (pick) pick.addEventListener('click', openPicker);
  var clear = $('calendarPhotoClear'); if (clear) clear.addEventListener('click', clearCalendarPhoto);
  if (input) input.addEventListener('change', function(){
    handleCalendarPhotoFile(input.files && input.files[0]);
    input.value = '';
  });
  renderCalendarWidget(true);
  syncCalendarWidgetHeight();
  var firstApp = document.querySelector('.app-grid .app');
  if (firstApp && window.ResizeObserver) new ResizeObserver(syncCalendarWidgetHeight).observe(firstApp);
  window.addEventListener('resize', syncCalendarWidgetHeight);
}


registerApp('日历', function(){ toast('日历 · 开发中'); });
