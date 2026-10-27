/* 岛屿 · 全局 toast 与记忆总结状态弹窗
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 全应用不再显示底部气泡提示：报错 / 校验失败类消息用弹窗，其余（保存成功、已切换、进度等）一律不显示。
 * 所有旧的 toast(msg) 调用保持不变，统一走这里分流。 */
var ISLAND_NOTICE_ERR_RE = /失败|错误|出错|异常|无法|不能|未能|不支持|仅支持|只支持|请先|请至少|请输入|请选择|请填写|请检查|请确认|请允许|请控制|超时|无效|失效|必填|不可|被拒|拒绝|不存在|已经存在|至少保留|需要至少|需要先|需要以|未找到|没有找到|没有读到|没有识别到|没有可(?!清理)|没有权限|没有任何|缺少|未配置|未开启|未加载|未知的|不足|被禁|被阻|不一致|冲突|限制|上限|过大|太大|太长|太短|不合法|格式|为空|损坏|未授权|没有 Notification/;
var islandNoticeLast = { msg: '', t: 0 };

function islandNotify(msg){
  var text = String(msg == null ? '' : msg).trim();
  if (!text || !ISLAND_NOTICE_ERR_RE.test(text)) return;
  var now = Date.now();
  if (islandNoticeLast.msg === text && now - islandNoticeLast.t < 1500) return;
  islandNoticeLast = { msg: text, t: now };
  islandAlert(text, { title: /失败|错误|出错|异常/.test(text) ? '出错了' : '提示' });
}
window.islandNotify = islandNotify;

/* 备份导出成功弹窗（APK 里由原生桥弹出“已保存到…”，这里不重复弹） */
function islandBackupDone(title, msg){
  var cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return;
  islandAlert(msg, { title: title || '导出成功' });
}
window.islandBackupDone = islandBackupDone;

function toast(msg){ islandNotify(msg); }


function showMemorySummaryNotice(title, text, busy, duration){
  if (!pmMemoryNotice) return;
  clearTimeout(memoryNoticeTimer);
  if (pmMemoryNoticeTitle) pmMemoryNoticeTitle.textContent = String(title || '');
  if (pmMemoryNoticeText) pmMemoryNoticeText.textContent = String(text || '');
  if (pmMemoryNoticeSpinner) pmMemoryNoticeSpinner.classList.toggle('is-done', !busy);
  pmMemoryNotice.classList.add('is-open');
  pmMemoryNotice.setAttribute('aria-hidden', 'false');
  memoryNoticeTimer = setTimeout(function(){ hideMemorySummaryNotice(); }, Number(duration) || (busy ? 1400 : 1800));
}

function hideMemorySummaryNotice(){
  if (!pmMemoryNotice) return;
  clearTimeout(memoryNoticeTimer);
  pmMemoryNotice.classList.remove('is-open');
  pmMemoryNotice.setAttribute('aria-hidden', 'true');
}


/* ---------- 岛屿专属确认 / 输入弹窗 ----------
 * 取代系统自带的 window.confirm / window.prompt（样式丑、无法适配主题、在安卓 WebView 里还会显示站点域名）。
 * 用法：islandConfirm('确定删除吗？', {title:'删除', confirmText:'删除', cancelText:'取消', danger:true}).then(function(ok){ if (ok) ... });
 * 返回 Promise<boolean>；点遮罩 / 取消 / 键盘 Esc 都视为取消。多个弹窗同时请求时会排队依次显示。
 *
 * 输入弹窗：islandPrompt('给这个预设起个名字', {title:'新建预设', defaultValue:'新预设', placeholder:'', multiline:false, maxLength:40, confirmText:'保存'}).then(function(value){ if (value === null) return; ... });
 * 返回 Promise<string|null>：点确定得到输入框里的原文，取消 / Esc 得到 null（与 window.prompt 一致）。
 * 输入弹窗不响应点遮罩关闭，避免误触丢掉已经输入的内容。 */
var islandDialogEl = null, islandDialogQueue = [], islandDialogCurrent = null, islandDialogHideTimer = 0;

function ensureIslandDialog(){
  if (islandDialogEl) return islandDialogEl;
  var el = document.createElement('div');
  el.className = 'island-dialog';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="island-dialog-backdrop"></div>' +
    '<section class="island-dialog-panel" role="alertdialog" aria-modal="true">' +
      '<h3 class="island-dialog-title"></h3>' +
      '<p class="island-dialog-message"></p>' +
      '<input class="island-dialog-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" hidden>' +
      '<textarea class="island-dialog-input is-multiline" rows="4" autocomplete="off" spellcheck="false" hidden></textarea>' +
      '<div class="island-dialog-actions">' +
        '<button type="button" class="island-dialog-btn is-cancel"></button>' +
        '<button type="button" class="island-dialog-btn is-confirm"></button>' +
      '</div>' +
    '</section>';
  document.body.appendChild(el);
  el.querySelector('.island-dialog-backdrop').addEventListener('click', function(){
    if (islandDialogCurrent && islandDialogCurrent.kind === 'prompt') return;
    closeIslandDialog(false);
  });
  el.querySelector('input.island-dialog-input').addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); closeIslandDialog(true); }
  });
  el.querySelector('.is-cancel').addEventListener('click', function(){ closeIslandDialog(false); });
  el.querySelector('.is-confirm').addEventListener('click', function(){ closeIslandDialog(true); });
  document.addEventListener('keydown', function(e){
    if (islandDialogCurrent && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); closeIslandDialog(false); }
  });
  islandDialogEl = el;
  return el;
}

function islandConfirm(message, opts){
  opts = opts || {};
  return new Promise(function(resolve){
    islandDialogQueue.push({ message:String(message == null ? '' : message), opts:opts, resolve:resolve });
    if (!islandDialogCurrent) showNextIslandDialog();
  });
}

function islandAlert(message, opts){
  opts = Object.assign({}, opts || {}, { hideCancel: true });
  if (!opts.confirmText) opts.confirmText = '知道了';
  return islandConfirm(message, opts).then(function(){ return true; });
}

function islandPrompt(message, opts){
  opts = opts || {};
  return new Promise(function(resolve){
    islandDialogQueue.push({ kind:'prompt', message:String(message == null ? '' : message), opts:opts, resolve:resolve });
    if (!islandDialogCurrent) showNextIslandDialog();
  });
}

/* 导入图床链接：弹出输入框 → 检查格式 → 真的把图加载一遍确认能用。返回 Promise<string|null>。 */
function checkImageLoads(url){
  return new Promise(function(resolve){
    var img = new Image(), done = false;
    var finish = function(ok){ if (done) return; done = true; clearTimeout(timer); img.onload = img.onerror = null; resolve(ok); };
    var timer = setTimeout(function(){ finish(false); }, 12000);
    img.onload = function(){ finish(true); };
    img.onerror = function(){ finish(false); };
    img.src = url;
  });
}

function promptImageUrl(title){
  return islandPrompt('粘贴图床里的图片直链（建议 https，以 .jpg / .png / .webp 等结尾更稳）。', { title: title || '导入图片链接', placeholder: 'https://example.com/image.jpg', confirmText: '使用', maxLength: 1000 }).then(function(v){
    if (v === null) return null;
    v = String(v).trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) { toast('链接需要以 http:// 或 https:// 开头'); return null; }
    if (!isImageSrc(v)) { toast('链接里有不支持的字符（空格、引号、括号）'); return null; }
    toast('正在检查链接…');
    return checkImageLoads(v).then(function(ok){
      if (!ok) { toast('这个链接无法作为图片加载，请确认是图片直链'); return null; }
      return v;
    });
  });
}

function showNextIslandDialog(){
  if (islandDialogCurrent || !islandDialogQueue.length) return;
  var item = islandDialogQueue.shift();
  var el = ensureIslandDialog();
  clearTimeout(islandDialogHideTimer);
  var o = item.opts;
  var title = el.querySelector('.island-dialog-title');
  title.textContent = o.title || '';
  title.hidden = !o.title;
  var msgEl = el.querySelector('.island-dialog-message');
  msgEl.textContent = item.message;
  msgEl.hidden = !item.message;
  var inputEl = el.querySelector('input.island-dialog-input'), areaEl = el.querySelector('textarea.island-dialog-input');
  inputEl.hidden = true; areaEl.hidden = true;
  item.field = null;
  if (item.kind === 'prompt') {
    var field = o.multiline ? areaEl : inputEl;
    field.hidden = false;
    field.value = o.defaultValue == null ? '' : String(o.defaultValue);
    field.placeholder = o.placeholder || '';
    if (o.maxLength) field.maxLength = Number(o.maxLength); else field.removeAttribute('maxlength');
    item.field = field;
  }
  el.querySelector('.is-cancel').textContent = o.cancelText || '取消';
  el.querySelector('.is-cancel').hidden = !!o.hideCancel;
  var confirmBtn = el.querySelector('.is-confirm');
  confirmBtn.textContent = o.confirmText || (item.kind === 'prompt' ? '保存' : '确定');
  confirmBtn.classList.toggle('is-danger', !!o.danger);
  islandDialogCurrent = item;
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  void el.offsetWidth;          /* 强制一次回流，让进入动画能生效 */
  el.classList.add('is-show');
  if (item.field) setTimeout(function(){ try { if (islandDialogCurrent === item) { item.field.focus(); item.field.select(); } } catch(e) {} }, 140);
}

function closeIslandDialog(result){
  var item = islandDialogCurrent;
  if (!item || !islandDialogEl) return;
  islandDialogCurrent = null;
  var el = islandDialogEl;
  el.classList.remove('is-show');
  el.setAttribute('aria-hidden', 'true');
  var value = item.kind === 'prompt' ? (result ? item.field.value : null) : !!result;
  try { if (item.field) item.field.blur(); } catch(e) {}
  try { item.resolve(value); } catch(e) {}
  clearTimeout(islandDialogHideTimer);
  islandDialogHideTimer = setTimeout(function(){
    if (!islandDialogCurrent) el.classList.remove('is-open');
    showNextIslandDialog();
  }, 190);
}


/* ---------- 岛屿专属单选弹窗（替代系统 <select> 下拉）----------
 * islandSelect([{value,label}], {title, value}).then(function(v){ v === null 表示取消 })
 * enhanceIslandSelect(selectEl, title)：隐藏原生 <select>，换成一个点击后弹出岛屿弹窗的按钮；
 * 原 select 仍留在 DOM 里，value / change 事件照常工作，代码里直接 select.value = 'x' 也会同步显示。 */
var islandSelectEl = null, islandSelectResolve = null, islandSelectHideTimer = 0;

function ensureIslandSelect(){
  if (islandSelectEl) return islandSelectEl;
  var el = document.createElement('div');
  el.className = 'island-dialog island-select-dialog';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="island-dialog-backdrop"></div>' +
    '<section class="island-dialog-panel island-select-panel" role="dialog" aria-modal="true">' +
      '<h3 class="island-dialog-title"></h3>' +
      '<div class="island-select-list" role="listbox"></div>' +
      '<div class="island-dialog-actions"><button type="button" class="island-dialog-btn is-cancel">取消</button></div>' +
    '</section>';
  document.body.appendChild(el);
  el.querySelector('.island-dialog-backdrop').addEventListener('click', function(){ closeIslandSelect(null); });
  el.querySelector('.is-cancel').addEventListener('click', function(){ closeIslandSelect(null); });
  el.querySelector('.island-select-list').addEventListener('click', function(e){
    var item = e.target.closest('.island-select-item');
    if (item) closeIslandSelect(item.dataset.value);
  });
  document.addEventListener('keydown', function(e){
    if (islandSelectResolve && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); closeIslandSelect(null); }
  });
  islandSelectEl = el;
  return el;
}

function islandSelect(options, opts){
  opts = opts || {};
  if (islandSelectResolve) closeIslandSelect(null);
  return new Promise(function(resolve){
    var el = ensureIslandSelect();
    clearTimeout(islandSelectHideTimer);
    var title = el.querySelector('.island-dialog-title');
    title.textContent = opts.title || ''; title.hidden = !opts.title;
    var cur = opts.value == null ? '' : String(opts.value);
    el.querySelector('.island-select-list').innerHTML = (options || []).map(function(o){
      var on = String(o.value) === cur;
      return '<button type="button" class="island-select-item' + (on ? ' is-on' : '') + '" role="option" aria-selected="' + (on ? 'true' : 'false') + '" data-value="' + escapeHTML(String(o.value)) + '">' +
        '<span>' + escapeHTML(String(o.label)) + '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></svg>' +
      '</button>';
    }).join('');
    islandSelectResolve = resolve;
    el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false');
    void el.offsetWidth; el.classList.add('is-show');
  });
}

function closeIslandSelect(value){
  var resolve = islandSelectResolve;
  if (!resolve || !islandSelectEl) return;
  islandSelectResolve = null;
  var el = islandSelectEl;
  el.classList.remove('is-show'); el.setAttribute('aria-hidden', 'true');
  try { resolve(value); } catch(e) {}
  clearTimeout(islandSelectHideTimer);
  islandSelectHideTimer = setTimeout(function(){ if (!islandSelectResolve) el.classList.remove('is-open'); }, 190);
}

function enhanceIslandSelect(sel, title, inheritClass){
  if (!sel || sel.__islandSelect) return;
  sel.__islandSelect = true;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'island-select-trigger' + (inheritClass ? ' ' + sel.className : '');
  btn.innerHTML = '<span class="island-select-trigger-text"></span><svg class="island-select-trigger-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 9.5 5.5 5.5 5.5-5.5"/></svg>';
  var text = btn.querySelector('.island-select-trigger-text');
  function sync(){
    var o = sel.options[sel.selectedIndex];
    text.textContent = o ? o.textContent : '';
  }
  sel.style.display = 'none';
  sel.parentNode.insertBefore(btn, sel.nextSibling);
  /* 代码里给 select.value 赋值时同步按钮文字 */
  try {
    var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get: function(){ return desc.get.call(sel); },
      set: function(v){ desc.set.call(sel, v); sync(); }
    });
  } catch(e) {}
  sel.addEventListener('change', sync);
  /* 选项被重新渲染（innerHTML）或 disabled 变化时同步按钮 */
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function(){ sync(); btn.disabled = !!sel.disabled; btn.hidden = !!sel.hidden; })
      .observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
  }
  btn.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    if (btn.disabled) return;
    var label = sel.closest('label'); 
    var heading = title || sel.getAttribute('aria-label') || (label && label.querySelector('span') ? label.querySelector('span').textContent : '');
    if (!heading) { var f = sel.closest('.api-field'); var l = f && f.querySelector('.api-label'); heading = l ? l.textContent : ''; }
    var options = Array.prototype.map.call(sel.options, function(o){ return { value: o.value, label: o.textContent }; });
    islandSelect(options, { title: heading, value: sel.value }).then(function(v){
      if (v === null || v === sel.value) return;
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  sync();
}

function enhanceSettingsSelects(){
  ['apiStream','sttLanguage','visionEnabled','visionScope','notificationMinInterval','notificationMaxInterval'].forEach(function(id){
    var el = document.getElementById(id); if (el) enhanceIslandSelect(el);
  });
  /* 聊天记忆总结预设 / 通话记录 char 筛选 / 世界书局部挂载角色：沿用各自原有样式 */
  [['pmMemorySummaryPreset','总结格式预设'],['phoneRecentCharFilter','按 char 筛选通话'],['worldbookMountTarget','选择局部挂载角色']].forEach(function(it){
    var el = document.getElementById(it[0]); if (el) enhanceIslandSelect(el, it[1], true);
  });
}


/* ---------- 岛屿专属日期弹窗（替代系统 <input type="date"> 选择器）----------
 * islandDatePicker({title, value:'YYYY-MM-DD', min, max}).then(function(v){ v === null 表示取消 })
 * enhanceIslandDate(inputEl, title)：隐藏原生日期输入框，换成点击后弹出岛屿日期弹窗的按钮；
 * 原 input 仍留在 DOM 里，value / min / max / change 事件照常工作，代码里直接 input.value = 'x' 也会同步显示。 */
var islandDateEl = null, islandDateResolve = null, islandDateHideTimer = 0, islandDateState = null;
var ISLAND_DATE_WEEK = ['日','一','二','三','四','五','六'];

function islandDatePad(n){ return (n < 10 ? '0' : '') + n; }
function islandDateKey(y, m, d){ return y + '-' + islandDatePad(m + 1) + '-' + islandDatePad(d); }
function islandDateParse(s){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return { y:Number(m[1]), m:Number(m[2]) - 1, d:Number(m[3]) };
}
function islandDateLabel(s){
  var p = islandDateParse(s);
  return p ? p.y + '年' + (p.m + 1) + '月' + p.d + '日' : '';
}

function ensureIslandDate(){
  if (islandDateEl) return islandDateEl;
  var el = document.createElement('div');
  el.className = 'island-dialog island-date-dialog';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="island-dialog-backdrop"></div>' +
    '<section class="island-dialog-panel island-date-panel" role="dialog" aria-modal="true">' +
      '<h3 class="island-dialog-title"></h3>' +
      '<div class="island-date-nav">' +
        '<button type="button" class="island-date-arrow" data-date-nav="-1" aria-label="上一页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 6.5-5.5 5.5 5.5 5.5"/></svg></button>' +
        '<button type="button" class="island-date-head"></button>' +
        '<button type="button" class="island-date-arrow" data-date-nav="1" aria-label="下一页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 6.5 5.5 5.5-5.5 5.5"/></svg></button>' +
      '</div>' +
      '<div class="island-date-body"></div>' +
      '<div class="island-dialog-actions">' +
        '<button type="button" class="island-dialog-btn is-cancel">取消</button>' +
        '<button type="button" class="island-dialog-btn is-confirm">确定</button>' +
      '</div>' +
    '</section>';
  document.body.appendChild(el);
  el.querySelector('.island-dialog-backdrop').addEventListener('click', function(){ closeIslandDate(null); });
  el.querySelector('.is-cancel').addEventListener('click', function(){ closeIslandDate(null); });
  el.querySelector('.is-confirm').addEventListener('click', function(){
    if (islandDateState && islandDateState.selected) closeIslandDate(islandDateState.selected);
  });
  el.querySelector('.island-date-head').addEventListener('click', function(){
    if (!islandDateState) return;
    islandDateState.mode = islandDateState.mode === 'months' ? 'days' : 'months';
    renderIslandDate();
  });
  Array.prototype.forEach.call(el.querySelectorAll('[data-date-nav]'), function(btn){
    btn.addEventListener('click', function(){
      var st = islandDateState; if (!st) return;
      var step = Number(btn.getAttribute('data-date-nav'));
      if (st.mode === 'months') st.y += step;
      else {
        st.m += step;
        if (st.m < 0) { st.m = 11; st.y -= 1; }
        if (st.m > 11) { st.m = 0; st.y += 1; }
      }
      renderIslandDate();
    });
  });
  el.querySelector('.island-date-body').addEventListener('click', function(e){
    var st = islandDateState; if (!st) return;
    var dayBtn = e.target.closest('[data-date]');
    if (dayBtn && !dayBtn.disabled) {
      st.selected = dayBtn.getAttribute('data-date');
      renderIslandDate();
      return;
    }
    var monBtn = e.target.closest('[data-month]');
    if (monBtn && !monBtn.disabled) {
      st.m = Number(monBtn.getAttribute('data-month'));
      st.mode = 'days';
      renderIslandDate();
    }
  });
  document.addEventListener('keydown', function(e){
    if (islandDateResolve && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); closeIslandDate(null); }
  });
  islandDateEl = el;
  return el;
}

function renderIslandDate(){
  var st = islandDateState, el = islandDateEl;
  if (!st || !el) return;
  var head = el.querySelector('.island-date-head');
  var body = el.querySelector('.island-date-body');
  var today = new Date();
  var todayKey = islandDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  var html = '';
  if (st.mode === 'months') {
    head.textContent = st.y + '年';
    for (var i = 0; i < 12; i++) {
      var first = islandDateKey(st.y, i, 1), last = islandDateKey(st.y, i, 31);
      var off = (st.min && last < st.min) || (st.max && first > st.max);
      var on = st.cur && st.cur.y === st.y && st.cur.m === i;
      html += '<button type="button" class="island-date-month' + (on ? ' is-on' : '') + '" data-month="' + i + '"' + (off ? ' disabled' : '') + '>' + (i + 1) + '月</button>';
    }
    body.className = 'island-date-body is-months';
    body.innerHTML = html;
  } else {
    head.textContent = st.y + '年' + (st.m + 1) + '月';
    var weekHtml = '';
    for (var w = 0; w < 7; w++) weekHtml += '<span>' + ISLAND_DATE_WEEK[w] + '</span>';
    var firstDay = new Date(st.y, st.m, 1).getDay();
    var total = new Date(st.y, st.m + 1, 0).getDate();
    var cells = '';
    for (var b = 0; b < firstDay; b++) cells += '<span class="island-date-blank"></span>';
    for (var d = 1; d <= total; d++) {
      var key = islandDateKey(st.y, st.m, d);
      var dis = (st.min && key < st.min) || (st.max && key > st.max);
      var cls = 'island-date-day' + (key === st.selected ? ' is-on' : '') + (key === todayKey ? ' is-today' : '');
      cells += '<button type="button" class="' + cls + '" data-date="' + key + '"' + (dis ? ' disabled' : '') + '>' + d + '</button>';
    }
    body.className = 'island-date-body';
    body.innerHTML = '<div class="island-date-week">' + weekHtml + '</div><div class="island-date-grid">' + cells + '</div>';
  }
  el.querySelector('.is-confirm').disabled = !st.selected;
}

function islandDatePicker(opts){
  opts = opts || {};
  if (islandDateResolve) closeIslandDate(null);
  return new Promise(function(resolve){
    var el = ensureIslandDate();
    clearTimeout(islandDateHideTimer);
    var title = el.querySelector('.island-dialog-title');
    title.textContent = opts.title || ''; title.hidden = !opts.title;
    var cur = islandDateParse(opts.value);
    var base = cur || (function(){ var t = new Date(); return { y:t.getFullYear(), m:t.getMonth(), d:t.getDate() }; })();
    var min = islandDateParse(opts.min) ? opts.min : '';
    var max = islandDateParse(opts.max) ? opts.max : '';
    if (!cur && max) {
      var mp = islandDateParse(max), nowKey = islandDateKey(base.y, base.m, base.d);
      if (nowKey > max) base = mp;
    }
    islandDateState = { y:base.y, m:base.m, mode:'days', selected: cur ? opts.value : '', cur:cur, min:min, max:max };
    islandDateResolve = resolve;
    renderIslandDate();
    el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false');
    void el.offsetWidth; el.classList.add('is-show');
  });
}

function closeIslandDate(value){
  var resolve = islandDateResolve;
  if (!resolve || !islandDateEl) return;
  islandDateResolve = null;
  islandDateState = null;
  var el = islandDateEl;
  el.classList.remove('is-show'); el.setAttribute('aria-hidden', 'true');
  try { resolve(value); } catch(e) {}
  clearTimeout(islandDateHideTimer);
  islandDateHideTimer = setTimeout(function(){ if (!islandDateResolve) el.classList.remove('is-open'); }, 190);
}

function enhanceIslandDate(input, title){
  if (!input || input.__islandDate) return;
  input.__islandDate = true;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'island-date-trigger';
  btn.innerHTML = '<span class="island-date-trigger-text"></span><svg class="island-date-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  var text = btn.querySelector('.island-date-trigger-text');
  function sync(){
    var label = islandDateLabel(input.value);
    text.textContent = label || '选择日期';
    btn.classList.toggle('is-empty', !label);
  }
  input.style.display = 'none';
  input.parentNode.insertBefore(btn, input.nextSibling);
  try {
    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function(){ return desc.get.call(input); },
      set: function(v){ desc.set.call(input, v); sync(); }
    });
  } catch(e) {}
  input.addEventListener('change', sync);
  btn.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    var label = input.closest('label');
    var heading = title || input.getAttribute('aria-label') || (label && label.querySelector('span') ? label.querySelector('span').textContent : '选择日期');
    islandDatePicker({ title:heading, value:input.value, min:input.min, max:input.max }).then(function(v){
      if (v === null || v === input.value) return;
      input.value = v;
      input.dispatchEvent(new Event('change', { bubbles:true }));
    });
  });
  sync();
}
