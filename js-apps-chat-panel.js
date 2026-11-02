/* 岛屿 · 聊天 · 加号工具面板与用户资料页
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function toolIcon(path){
  return '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' + path + '</svg>';
}

function toolStroke(path, w){
  return '<g fill="none" stroke="currentColor" stroke-width="' + (w || 2.2) + '" stroke-linecap="round" stroke-linejoin="round">' + path + '</g>';
}

function buildToolsPanel(){
  var brainHalf = '<path d="M12 5.2c-.6-1.4-2-2.2-3.5-2-1.6.2-2.7 1.5-2.6 3-1.5.4-2.5 1.8-2.3 3.3.1 1 .6 1.8 1.3 2.3-.5.8-.6 1.8-.2 2.7.4 1 1.3 1.6 2.3 1.8.2 1.6 1.6 2.8 3.2 2.7 1.1 0 2-.6 2.5-1.5"/><path d="M8.6 9.4c1 0 1.8.7 1.8 1.7"/><path d="M7.9 14c1.1 0 2-.6 2.4-1.6"/>';
  var tools = [
    { name:'图片', icon: toolIcon('<path fill-rule="evenodd" d="M5.2 4h13.6A2.7 2.7 0 0 1 21.5 6.7v10.6a2.7 2.7 0 0 1-2.7 2.7H5.2a2.7 2.7 0 0 1-2.7-2.7V6.7A2.7 2.7 0 0 1 5.2 4zM4.4 17.6h15.2v-.5l-3.9-5.6a.8.8 0 0 0-1.3 0l-1.7 2.4-2.6-3.9a.8.8 0 0 0-1.3 0z"/>') },
    { name:'拍摄', icon: toolIcon('<path fill-rule="evenodd" d="M9.2 4h5.6l1.2 2h3A2.5 2.5 0 0 1 21.5 8.5v9a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 17.5v-9A2.5 2.5 0 0 1 5 6h3zM12 9.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/><circle cx="12" cy="13" r="2.1"/>') },
    { name:'语音通话', icon: toolIcon('<path transform="translate(-.2 4.4) scale(.82)" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/><rect x="13.800" y="2.800" width="5.600" height="5.200" rx="1.300"/><path d="M20 4.900l2.300-1.400v4.100L20 6.200z"/>') },
    { name:'位置', icon: toolIcon('<path fill-rule="evenodd" d="M12 22s7-6.1 7-12.1a7 7 0 1 0-14 0C5 15.900 12 22 12 22zm0-9.6a2.6 2.6 0 1 0 0-5.200 2.600 2.600 0 0 0 0 5.200z"/>') },
    { name:'文件', icon: toolIcon('<path d="M3 8.6V6.5A1.500 1.500 0 0 1 4.500 5h4.700l2 2.200h8.300A1.500 1.500 0 0 1 21 8.700V9H3z"/><path d="M3 10.300h18v7.200a2.500 2.500 0 0 1-2.500 2.500h-13A2.500 2.500 0 0 1 3 17.500z"/>') },
    { name:'转账', icon: toolIcon(toolStroke('<path d="M4 8.500h15.500"/><path d="M15.800 4.800l3.700 3.700-3.700 3.700"/><path d="M20 15.500H4.500"/><path d="M8.200 11.800l-3.700 3.700 3.700 3.700"/>', 2)) },
    { name:'语言', icon: toolIcon('<rect x="8.800" y="2.800" width="6.400" height="11.600" rx="3.200"/>' + toolStroke('<path d="M5.200 11.200a6.800 6.800 0 0 0 13.600 0"/><path d="M12 18v3"/><path d="M8.500 21h7"/>', 2)) },
    { name:'角色卡', icon: toolIcon('<path fill-rule="evenodd" d="M5.500 5h13A3 3 0 0 1 21.500 8v8a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM8.200 8.700a1.900 1.900 0 1 0 0 3.800 1.900 1.900 0 0 0 0-3.800zM4.900 16.200h6.600a3.300 3.300 0 0 0-6.600 0zM13 9.400a.8.800 0 0 0 0 1.600h5a.8.800 0 0 0 0-1.600zM13 13a.8.800 0 0 0 0 1.600h5A.8.800 0 0 0 18 13z"/>') },
    { name:'记忆', icon: toolIcon(toolStroke(brainHalf + '<g transform="translate(24 0) scale(-1 1)">' + brainHalf + '</g><path d="M12 5.200v14.600"/>', 1.7)) },
  ];
  var html = '<div class="tool-grid">';
  tools.forEach(function(t){
    html += '<button class="tool-item" type="button" data-tool="' + t.name + '">' +
      '<span class="tool-icon">' + t.icon + '</span><span class="tool-label">' + t.name + '</span></button>';
  });
  html += '</div>'; return html;
}

var pmPanelPopTimer = null;

function pmPanelPop(){
  if (!pmPanel) return;
  pmPanel.classList.remove('is-popping');
  void pmPanel.offsetWidth;
  pmPanel.classList.add('is-popping');
  clearTimeout(pmPanelPopTimer);
  pmPanelPopTimer = setTimeout(function(){ if (pmPanel) pmPanel.classList.remove('is-popping'); }, 950);
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
  pmPanel.classList.add('is-tools-panel');
  pmPanelInner.innerHTML = buildToolsPanel();
  pmPanel.classList.add('is-open');
  pmPanelPop();
  if (pmEmojiBtn) pmEmojiBtn.classList.remove('is-on');
  if (pmPlusBtn) pmPlusBtn.classList.toggle('is-on', mode === 'tools');
}

var pmPanelClassTimer = null;

function closePanel(){
  clearStickerSelection();
  panelMode = null;
  if (pmPanel) {
    pmPanel.classList.remove('is-open');
    clearTimeout(pmPanelClassTimer);
    pmPanelClassTimer = setTimeout(function(){
      if (pmPanel && !pmPanel.classList.contains('is-open')) {
        pmPanel.classList.remove('is-sticker-panel');
        pmPanel.classList.remove('is-sticker-manage');
        pmPanel.classList.remove('is-tools-panel');
      }
    }, 340);
  }
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
