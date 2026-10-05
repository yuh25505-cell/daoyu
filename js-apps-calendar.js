/* 岛屿 · 日历 App：桌面「日历」小组件（4×2：左图右历，占主屏幕网格 4 列 × 2 行）
 * 「日历」App 本体尚未开发，完成后把底部 registerApp 的回调换成真正的打开函数即可。
 * 样式见 css-apps-calendar.css；所有 js 文件以经典脚本方式共享全局作用域。 */
'use strict';

var CAL_PHOTO_SIZE = 640;      /* 导入的图片裁成正方形后的边长（px），控制存储体积 */
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


function handleCalendarPhotoFile(file){
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
  if (file.size > IMAGE_IMPORT_MAX_BYTES) { toast('图片不能超过 20MB'); return; }
  squarePhotoFromFile(file, CAL_PHOTO_SIZE).then(function(data){
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
}


registerApp('日历', function(){ toast('日历 · 开发中'); });
