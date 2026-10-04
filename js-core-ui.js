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
