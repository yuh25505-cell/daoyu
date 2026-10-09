/* 岛屿 · 公共工具函数与请求侧时间事实
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var $  = function(id){ return document.getElementById(id); };

var $$ = function(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

function releaseInputFocus(){
  var active = document.activeElement;
  if (active && typeof active.blur === 'function' && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || '')) active.blur();
}

function clone(o){ return JSON.parse(JSON.stringify(o)); }

function pad(n){ return n < 10 ? '0' + n : '' + n; }

function escapeHTML(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function assignArray(target, source){
  target.length = 0;
  if (Array.isArray(source)) source.forEach(function(item){ target.push(item); });
}

function genId(prefix){
  return (prefix || 'x_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}


/* 请求侧时间事实：只负责提供“现在是什么”和“距离上次对话多久”，不让模型自行推算。 */
function getSeasonLabel(month){
  if (month >= 3 && month <= 5) return '春季';
  if (month >= 6 && month <= 8) return '夏季';
  if (month >= 9 && month <= 11) return '秋季';
  return '冬季';
}

function getWeekdayLabel(day){
  return ['周日','周一','周二','周三','周四','周五','周六'][day] || '';
}

function formatElapsedForPrompt(seconds){
  if (seconds == null) return '首次对话';
  var sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec < 60) return '刚刚';
  var min = Math.floor(sec / 60);
  if (min < 60) return min + '分钟';
  var hour = Math.floor(min / 60);
  var restMin = min % 60;
  if (hour < 24) return restMin ? hour + '小时' + restMin + '分钟' : hour + '小时';
  var day = Math.floor(hour / 24);
  var restHour = hour % 24;
  if (day < 7) return restHour ? day + '天' + restHour + '小时' : day + '天';
  return day + '天';
}

function getLatestMessageTimestamp(list, excludeId){
  if (!Array.isArray(list)) return null;
  for (var i = list.length - 1; i >= 0; i--) {
    var item = list[i];
    if (!item || (excludeId && item.id === excludeId)) continue;
    var ts = Number(item.createdAt || item.timestamp || 0);
    if (ts > 0 && Number.isFinite(ts)) return ts;
  }
  return null;
}

function getLatestUserMessageId(name){
  ensureMessageIds(name);
  var list = MESSAGES[name] || [];
  for (var i = list.length - 1; i >= 0; i--) {
    var item = list[i];
    if (item && item.from === 'me' && (item.createdAt || item.timestamp) && item.id) return String(item.id);
  }
  return '';
}

function buildCurrentTimeFacts(){
  var now = new Date();
  return [
    '【当前真实时间｜请求侧注入事实】',
    'current_date: ' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
    'current_time: ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
    'weekday: ' + getWeekdayLabel(now.getDay()),
    'season: ' + getSeasonLabel(now.getMonth() + 1)
  ].join('\n');
}

function buildTimeContext(name, options){
  var now = new Date();
  var nowTs = now.getTime();
  var list = MESSAGES[name] || [];
  var excludeId = options && options.excludeMessageId ? String(options.excludeMessageId) : '';
  var lastTs = getLatestMessageTimestamp(list, excludeId);
  var elapsed = lastTs ? Math.max(0, Math.floor((nowTs - lastTs) / 1000)) : null;
  var date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  var time = pad(now.getHours()) + ':' + pad(now.getMinutes());
  var weekday = getWeekdayLabel(now.getDay());
  var season = getSeasonLabel(now.getMonth() + 1);

  return [
    '【时间上下文｜请求侧注入事实】',
    'current_date: ' + date,
    'current_time: ' + time,
    'weekday: ' + weekday,
    'season: ' + season,
    'time_since_last_message: ' + formatElapsedForPrompt(elapsed),
    'elapsed_seconds: ' + (elapsed == null ? 'null' : String(elapsed)),
    '说明：以上时间字段来自本次请求生成的真实时间；elapsed_seconds 仅表示距离上一条可用聊天消息经过了多久，不证明任何剧情事件已经完成。'
  ].join('\n');
}


/* 本地图片导入：居中裁成正方形并压缩为 JPEG data URL（主屏幕日历 / 音乐组件共用）。 */
var IMAGE_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

function squarePhotoFromFile(file, size){
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function(){
      try {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) throw new Error('empty image');
        var side = Math.min(w, h);
        var out = Math.min(size, side);
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
