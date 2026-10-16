/* 岛屿 · 自定义铃声
 * 两条铃声，都可以导入本地音频文件：
 *   message：角色发来消息时的提示音（不在该聊天页、或应用在后台时播放，与系统通知同步）
 *   call   ：角色发起语音通话时的来电铃声（循环播放，接听 / 拒绝 / 超时后停止）
 * 音频以 ArrayBuffer 存在 State.settings.sounds 里（和自定义字体同一套存法），随完整备份 / 主题以外的系统设置一起导出导入。
 * 后台能不能响，取决于页面是否还活着：保活开关、AI 生成保护（bg-guard）都会让页面保持运行；
 * 播放铃声时本模块也会临时申请一次保活，保证铃声放得完。
 * 所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var IslandSounds = (function(){
  var KINDS = ['message', 'call'];
  var LABELS = { message: '消息铃声', call: '来电铃声' };
  var MAX_BYTES = 4 * 1024 * 1024;      /* 单个铃声文件上限 4MB，避免撑大本机存档与备份 */
  var MESSAGE_CAP_MS = 10000;           /* 消息提示音最长播放 10 秒（文件更长也会截断） */
  var CALL_CAP_MS = 45000;              /* 来电铃声最长响 45 秒 */
  var MESSAGE_GAP_MS = 2500;            /* 连续多条消息只响一次 */
  var PREVIEW_CAL_MS = 8000;

  var players = {};                     /* kind -> { audio, key } */
  var urls = {};                        /* kind -> blob url */
  var ringing = false, ringTimer = 0, msgTimer = 0, lastMsgAt = 0, msgHeld = false;
  var previewKind = '', previewTimer = 0;
  var activated = false;

  function toastSafe(msg){ try { toast(msg); } catch(e) {} }

  function isBuf(v){ return v instanceof ArrayBuffer || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v)); }
  function bufOf(v){
    if (v instanceof ArrayBuffer) return v;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
  }

  /* ---------- 配置 ---------- */
  function getConfig(){
    if (!State.settings || typeof State.settings !== 'object') State.settings = {};
    var cfg = State.settings.sounds && typeof State.settings.sounds === 'object' ? State.settings.sounds : {};
    var vol = Number(cfg.volume);
    cfg.volume = Number.isFinite(vol) ? Math.max(0, Math.min(100, Math.round(vol))) : 80;
    KINDS.forEach(function(k){
      var it = cfg[k];
      if (!it || typeof it !== 'object' || !isBuf(it.data) || !(it.data.byteLength > 0)) cfg[k] = null;
    });
    State.settings.sounds = cfg;
    return cfg;
  }
  function item(kind){ return getConfig()[kind] || null; }
  function has(kind){ return !!item(kind); }

  /* ---------- 播放器 ---------- */
  function keyOf(it){ return it ? (it.name + '|' + it.data.byteLength) : ''; }

  function ensurePlayer(kind){
    var it = item(kind);
    if (!it) { dropPlayer(kind); return null; }
    var key = keyOf(it), cur = players[kind];
    if (cur && cur.key === key) return cur.audio;
    dropPlayer(kind);
    var url;
    try { url = URL.createObjectURL(new Blob([bufOf(it.data)], { type: it.mime || 'audio/mpeg' })); }
    catch(e) { return null; }
    urls[kind] = url;
    var a = new Audio();
    a.preload = 'auto';
    a.src = url;
    a.setAttribute('playsinline', '');
    players[kind] = { audio: a, key: key };
    return a;
  }

  function dropPlayer(kind){
    var cur = players[kind];
    if (cur) { try { cur.audio.pause(); } catch(e) {} try { cur.audio.removeAttribute('src'); cur.audio.load(); } catch(e) {} }
    delete players[kind];
    if (urls[kind]) { try { URL.revokeObjectURL(urls[kind]); } catch(e) {} delete urls[kind]; }
  }

  function volume(){ return getConfig().volume / 100; }

  function KA(){ return window.IslandKeepAlive || null; }
  function hold(key){ try { var k = KA(); if (k) k.hold(key); } catch(e) {} }
  function release(key, grace){ try { var k = KA(); if (k) k.release(key, grace); } catch(e) {} }

  /* 浏览器要求用户点过页面才允许自动播放声音。第一次点击 / 触摸后标记为“已激活”，
   * 同时给每个播放器做一次静音预热（iOS Safari 需要在手势里对每个 audio 元素各 play 一次）。 */
  function primeAll(){
    KINDS.forEach(function(k){
      var a = ensurePlayer(k); if (!a) return;
      try {
        a.muted = true;
        var p = a.play();
        var back = function(){ try { a.pause(); a.currentTime = 0; } catch(e) {} a.muted = false; };
        if (p && p.then) p.then(back, back); else back();
      } catch(e) { try { a.muted = false; } catch(e2) {} }
    });
  }
  function onGesture(){
    if (activated) return;
    activated = true;
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function(ev){ document.removeEventListener(ev, onGesture, true); });
    primeAll();
  }
  function bindActivation(){
    try { if (navigator.userActivation && navigator.userActivation.hasBeenActive) activated = true; } catch(e) {}
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function(ev){ document.addEventListener(ev, onGesture, true); });
  }

  function stopAudio(a){ try { a.pause(); a.currentTime = 0; a.loop = false; } catch(e) {} }

  /* ---------- 消息提示音 ----------
   * 返回 true：已由本模块负责出声（调用方应把系统通知设为静音，避免两个声音叠在一起）。 */
  function playMessage(){
    if (!has('message') && !(ringing && has('call'))) return false;
    if (ringing) return true;                      /* 来电铃声正在响：通话通知不再叠加消息音 */
    if (!has('message')) return false;
    if (!activated) return false;                  /* 还没有用户手势：播不出来，让系统通知照常响 */
    var now = Date.now();
    if (now - lastMsgAt < MESSAGE_GAP_MS) return true;
    var a = ensurePlayer('message'); if (!a) return false;
    lastMsgAt = now;
    try {
      a.loop = false; a.muted = false; a.volume = volume(); a.currentTime = 0;
      if (!msgHeld) { msgHeld = true; hold('ringtone-message'); }
      var done = function(){ clearTimeout(msgTimer); msgTimer = 0; if (msgHeld) { msgHeld = false; release('ringtone-message', 8000); } };
      a.onended = done; a.onerror = done;
      var p = a.play();
      if (p && p.catch) p.catch(done);
      clearTimeout(msgTimer);
      msgTimer = setTimeout(function(){ stopAudio(a); done(); }, MESSAGE_CAP_MS);
      return true;
    } catch(e) { return false; }
  }

  /* ---------- 来电铃声 ---------- */
  function startCallRing(){
    stopCallRing();
    if (!has('call') || !activated) return false;
    var a = ensurePlayer('call'); if (!a) return false;
    try {
      a.loop = true; a.muted = false; a.volume = volume(); a.currentTime = 0;
      ringing = true;
      hold('ringtone-call');
      var p = a.play();
      if (p && p.catch) p.catch(function(){ stopCallRing(); });
      clearTimeout(ringTimer);
      ringTimer = setTimeout(stopCallRing, CALL_CAP_MS);
      return true;
    } catch(e) { ringing = false; return false; }
  }

  function stopCallRing(){
    clearTimeout(ringTimer); ringTimer = 0;
    var cur = players.call;
    if (cur) stopAudio(cur.audio);
    if (ringing) { ringing = false; release('ringtone-call', 5000); }
  }

  function isRinging(){ return ringing; }

  /* ---------- 试听 ---------- */
  function stopPreview(){
    clearTimeout(previewTimer); previewTimer = 0;
    if (previewKind) {
      var cur = players[previewKind];
      if (cur) stopAudio(cur.audio);
      previewKind = '';
    }
    renderSettings();
  }

  function preview(kind){
    if (previewKind === kind) { stopPreview(); return; }
    stopPreview(); stopCallRing();
    var a = ensurePlayer(kind);
    if (!a) { toastSafe('还没有导入' + LABELS[kind]); return; }
    try {
      a.loop = kind === 'call'; a.muted = false; a.volume = volume(); a.currentTime = 0;
      previewKind = kind;
      var end = function(){ if (previewKind === kind) stopPreview(); };
      a.onended = end; a.onerror = end;
      var p = a.play();
      if (p && p.catch) p.catch(function(){ end(); toastSafe('播放失败，请再点一次'); });
      previewTimer = setTimeout(end, kind === 'call' ? PREVIEW_CAL_MS : MESSAGE_CAP_MS);
      renderSettings();
    } catch(e) { previewKind = ''; }
  }

  /* ---------- 导入 / 清除 ---------- */
  function looksLikeAudio(file){
    var type = String(file.type || '').toLowerCase();
    if (type.indexOf('audio/') === 0) return true;
    return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|mp4)$/i.test(String(file.name || ''));
  }

  function mimeFor(file){
    var type = String(file.type || '').toLowerCase();
    if (type.indexOf('audio/') === 0) return type;
    var ext = (String(file.name || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    return ({ mp3:'audio/mpeg', m4a:'audio/mp4', mp4:'audio/mp4', aac:'audio/aac', wav:'audio/wav', ogg:'audio/ogg', oga:'audio/ogg', opus:'audio/ogg', flac:'audio/flac', webm:'audio/webm' })[ext.toLowerCase()] || 'audio/mpeg';
  }

  /* 导入前先试着加载一遍，播不了的格式当场提示，不会存进去 */
  function canDecode(buffer, mime){
    return new Promise(function(resolve){
      var url, a;
      try { url = URL.createObjectURL(new Blob([buffer], { type: mime })); a = new Audio(); } catch(e) { resolve(0); return; }
      var settled = false;
      var finish = function(ok){
        if (settled) return; settled = true;
        clearTimeout(timer);
        try { a.removeAttribute('src'); a.load(); } catch(e) {}
        try { URL.revokeObjectURL(url); } catch(e) {}
        resolve(ok);
      };
      var timer = setTimeout(function(){ finish(0); }, 6000);
      a.preload = 'metadata';
      a.onloadedmetadata = function(){ finish(Number.isFinite(a.duration) ? a.duration : 1); };
      a.onerror = function(){ finish(0); };
      a.src = url;
    });
  }

  function importFile(kind, file){
    if (KINDS.indexOf(kind) < 0 || !file) return Promise.resolve(false);
    if (!looksLikeAudio(file)) { toastSafe('请选择音频文件（mp3 / m4a / wav / ogg 等）'); return Promise.resolve(false); }
    if (file.size > MAX_BYTES) { toastSafe('文件太大了（上限 4MB），请选择更短的铃声'); return Promise.resolve(false); }
    return new Promise(function(resolve){
      var reader = new FileReader();
      reader.onerror = function(){ toastSafe('读取音频失败'); resolve(false); };
      reader.onload = function(){
        var buffer = reader.result, mime = mimeFor(file);
        canDecode(buffer, mime).then(function(duration){
          if (!duration) { toastSafe('这个音频无法播放，请换一个格式（推荐 mp3）'); resolve(false); return; }
          stopPreview(); if (kind === 'call') stopCallRing();
          var cfg = getConfig();
          cfg[kind] = { name: String(file.name || LABELS[kind]), mime: mime, size: buffer.byteLength, duration: Math.round(duration * 10) / 10, data: buffer };
          dropPlayer(kind);
          saveSettings().then(function(){
            renderSettings();
            if (activated) primeAll();
            toastSafe(LABELS[kind] + '已导入');
            resolve(true);
          }, function(){ toastSafe('保存失败，存储空间可能不足'); resolve(false); });
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function clear(kind){
    if (!has(kind)) return;
    stopPreview(); if (kind === 'call') stopCallRing();
    getConfig()[kind] = null;
    dropPlayer(kind);
    saveSettings();
    renderSettings();
    toastSafe('已恢复默认' + LABELS[kind]);
  }

  /* ---------- 备份：ArrayBuffer ↔ base64 ---------- */
  function toBackup(sounds){
    if (!sounds || typeof sounds !== 'object') return sounds;
    var out = { volume: Number.isFinite(Number(sounds.volume)) ? Number(sounds.volume) : 80 };
    KINDS.forEach(function(k){
      var it = sounds[k];
      if (!it || !isBuf(it.data)) { out[k] = null; return; }
      out[k] = { name: it.name || '', mime: it.mime || 'audio/mpeg', size: it.data.byteLength, duration: it.duration || 0, dataBase64: arrayBufferToBase64(bufOf(it.data)) };
    });
    return out;
  }

  function fromBackup(sounds){
    if (!sounds || typeof sounds !== 'object' || Array.isArray(sounds)) return { volume: 80, message: null, call: null };
    var out = { volume: Number.isFinite(Number(sounds.volume)) ? Math.max(0, Math.min(100, Number(sounds.volume))) : 80 };
    KINDS.forEach(function(k){
      var it = sounds[k];
      out[k] = null;
      if (!it || typeof it !== 'object') return;
      try {
        if (typeof it.dataBase64 === 'string' && it.dataBase64) {
          var buf = base64ToArrayBuffer(it.dataBase64);
          out[k] = { name: it.name || '', mime: it.mime || 'audio/mpeg', size: buf.byteLength, duration: it.duration || 0, data: buf };
        } else if (isBuf(it.data) && it.data.byteLength) {
          out[k] = Object.assign({}, it, { data: bufOf(it.data) });
        }
      } catch(e) { console.warn('[岛屿] 备份中的铃声解码失败：', k, e); }
    });
    return out;
  }

  /* ---------- 设置页 ---------- */
  function fmtSize(n){ return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  function renderSettings(){
    if (!State || !State.settings) return;
    var cfg = getConfig();
    KINDS.forEach(function(k){
      var it = cfg[k], cap = k === 'message' ? 'Message' : 'Call';
      var state = document.getElementById('sound' + cap + 'State');
      if (state) {
        if (it) state.textContent = it.name + ' · ' + fmtSize(it.size || it.data.byteLength) + (it.duration ? ' · ' + it.duration + ' 秒' : '');
        else state.textContent = k === 'message' ? '默认（跟随系统通知声音）' : '默认（无铃声，仅显示来电弹窗）';
      }
      var prev = document.getElementById('sound' + cap + 'PreviewBtn');
      if (prev) { prev.disabled = !it; prev.textContent = previewKind === k ? '停止' : '试听'; }
      var reset = document.getElementById('sound' + cap + 'ResetBtn');
      if (reset) reset.disabled = !it;
    });
    var range = document.getElementById('soundVolumeRange');
    if (range && document.activeElement !== range) range.value = String(cfg.volume);
    paintVolume(cfg.volume);
  }

  function paintVolume(v){
    var range = document.getElementById('soundVolumeRange'), val = document.getElementById('soundVolumeValue');
    if (range) range.style.setProperty('--dock-range-pct', v + '%');
    if (val) val.textContent = v + '%';
  }

  function bindSettings(){
    KINDS.forEach(function(k){
      var cap = k === 'message' ? 'Message' : 'Call';
      var btn = document.getElementById('sound' + cap + 'ImportBtn');
      var input = document.getElementById('sound' + cap + 'FileInput');
      var prev = document.getElementById('sound' + cap + 'PreviewBtn');
      var reset = document.getElementById('sound' + cap + 'ResetBtn');
      if (btn && input) {
        btn.addEventListener('click', function(){ input.click(); });
        input.addEventListener('change', function(){
          var file = input.files && input.files[0];
          input.value = '';
          if (file) importFile(k, file);
        });
      }
      if (prev) prev.addEventListener('click', function(){ preview(k); });
      if (reset) reset.addEventListener('click', function(){ clear(k); });
    });
    var range = document.getElementById('soundVolumeRange');
    if (range) {
      var apply = function(v){
        var cfg = getConfig();
        cfg.volume = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
        paintVolume(cfg.volume);
        KINDS.forEach(function(k){ if (players[k]) players[k].audio.volume = cfg.volume / 100; });
      };
      if (typeof bindSmoothRange === 'function') bindSmoothRange(range, apply, function(){ scheduleSettingsSave(200); });
      else { range.addEventListener('input', function(){ apply(range.value); }); range.addEventListener('change', function(){ scheduleSettingsSave(200); }); }
    }
    renderSettings();
  }

  bindActivation();
  document.addEventListener('DOMContentLoaded', bindSettings);
  document.addEventListener('visibilitychange', function(){ if (document.hidden) stopPreview(); });

  return {
    has: has, playMessage: playMessage, startCallRing: startCallRing, stopCallRing: stopCallRing, isRinging: isRinging,
    preview: preview, importFile: importFile, clear: clear, render: renderSettings,
    toBackup: toBackup, fromBackup: fromBackup
  };
})();

function renderSoundSettings(){ try { IslandSounds.render(); } catch(e) {} }
