/* 岛屿 · 全局 toast 与记忆总结状态弹窗
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var toastEl = $('toast'), toastTimer = null;

function toast(msg){
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toastEl.classList.remove('is-show'); }, 1800);
}


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

function islandPrompt(message, opts){
  opts = opts || {};
  return new Promise(function(resolve){
    islandDialogQueue.push({ kind:'prompt', message:String(message == null ? '' : message), opts:opts, resolve:resolve });
    if (!islandDialogCurrent) showNextIslandDialog();
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
