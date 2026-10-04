/* 岛屿 · 聊天 · 加号工具面板与用户资料页
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function toolIcon(path){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
}

function buildToolsPanel(){
  var tools = [
    { name:'图片', icon: toolIcon('<rect x="3.5" y="4.5" width="17" height="15" rx="4"/><circle cx="9" cy="10" r="1.7"/><path d="M4.5 17.2l4.2-4a2 2 0 0 1 2.7 0l3.2 3"/><path d="M14 15.5l1.4-1.3a2 2 0 0 1 2.7 0l2.4 2.3"/>') },
    { name:'拍摄', icon: toolIcon('<path d="M3.5 8.5a2.5 2.5 0 0 1 2.5-2.5h1.6l1.2-2h6.4l1.2 2H18a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z"/><circle cx="12" cy="12.5" r="3.4"/>') },
    { name:'语音通话', icon: toolIcon('<path d="M7.2 3.8 9.4 8l-2 2.2a12 12 0 0 0 6.4 6.4l2.2-2 4.2 2.2-1 3.2c-.3.9-1.2 1.4-2.1 1.2C10.4 19.7 4.3 13.6 2.8 6.9c-.2-.9.3-1.8 1.2-2.1z"/>') },
    { name:'位置', icon: toolIcon('<path d="M12 21s6.5-5.4 6.5-10.4a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.4" r="2.4"/>') },
    { name:'文件', icon: toolIcon('<path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/>') },
    { name:'转账', icon: toolIcon('<path d="M5 8h9.5"/><path d="M14.5 8l-3-3"/><path d="M19 16H9.5"/><path d="M9.5 16l3 3"/>') },
    { name:'语言', icon: toolIcon('<circle cx="12" cy="12" r="8.5"/><path d="M3.8 9.2h16.4M3.8 14.8h16.4M12 3.5c2.2 2.3 3.4 5.1 3.4 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.4-5.1-3.4-8.5S9.8 5.8 12 3.5z"/>') },
    { name:'角色卡', icon: toolIcon('<circle cx="12" cy="8.5" r="3.4"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/>') },
    { name:'记忆', icon: toolIcon('<path d="M12 6.2C10.4 4.9 8.3 4.4 5.5 4.4v13.4c2.8 0 4.9.5 6.5 1.8 1.6-1.3 3.7-1.8 6.5-1.8V4.4c-2.8 0-4.9.5-6.5 1.8z"/><path d="M12 6.2v13.4"/>') },
  ];
  var html = '<div class="tool-grid">';
  tools.forEach(function(t){
    html += '<button class="tool-item" type="button" data-tool="' + t.name + '">' +
      '<span class="tool-icon">' + t.icon + '</span><span>' + t.name + '</span></button>';
  });
  html += '</div>'; return html;
}

function openPanel(mode){
  releaseInputFocus();
  if (!pmPanel) return;
  if (panelMode === mode) { closePanel(); return; }
  if (mode === 'sticker') {
    openStickerPanel();
    return;
  }
  panelMode = mode;
  pmPanel.classList.remove('is-sticker-panel');
  pmPanelInner.innerHTML = buildToolsPanel();
  pmPanel.classList.add('is-open');
  if (pmEmojiBtn) pmEmojiBtn.classList.remove('is-on');
  if (pmPlusBtn) pmPlusBtn.classList.toggle('is-on', mode === 'tools');
}

function closePanel(){
  clearStickerSelection();
  panelMode = null;
  if (pmPanel) { pmPanel.classList.remove('is-open'); pmPanel.classList.remove('is-sticker-panel'); pmPanel.classList.remove('is-sticker-manage'); }
  if (pmEmojiBtn) pmEmojiBtn.classList.remove('is-on');
  if (pmPlusBtn) pmPlusBtn.classList.remove('is-on');
}

var upView = $('upView');

function openUP(){
  if (!upView) return;
  releaseInputFocus();
  renderUserPersonas();
  upView.classList.add('is-open');
  upView.setAttribute('aria-hidden', 'false');
}

function closeUP(){
  if (!upView) return;
  upView.classList.remove('is-open');
  upView.setAttribute('aria-hidden', 'true');
}
