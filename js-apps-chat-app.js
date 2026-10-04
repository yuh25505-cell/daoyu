/* 岛屿 · 聊天 · App 入口与标签页
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var chatApp = $('chatApp');

function openChatApp(){
  if (!chatApp) return;
  releaseInputFocus();
  closeSettingsApp();
  closeChatAppearance();
  applyChatAppearance();
  chatApp.classList.add('is-open');
  chatApp.setAttribute('aria-hidden', 'false');
  switchTab('chats');
}

function closeChatApp(){
  if (!chatApp) return;
  releaseInputFocus();
  closePM(); closeUP(); closeChatAppearance();
  chatApp.classList.remove('is-open');
  chatApp.setAttribute('aria-hidden', 'true');
  exitSearchAll();
  closeSheet();
  closeUserSheet();
}

function switchTab(name){
  releaseInputFocus();
  closePM(); closeUP(); closeChatAppearance();
  $$('.tab-panel').forEach(function(p){ p.classList.toggle('is-active', p.dataset.panel === name); });
  $$('.chat-tab').forEach(function(t){ t.classList.toggle('is-active', t.dataset.tab === name); });
  exitSearchAll();
}

function exitSearchAll(){
  $$('.tab-panel').forEach(function(p){
    p.classList.remove('is-searching');
    var input = p.querySelector('.search-input');
    if (input) input.value = '';
    filterPanel(p, '');
  });
}

function filterPanel(panel, q){
  var key = q.trim().toLowerCase();
  $$('[data-name]', panel).forEach(function(el){
    var hit = !key || el.dataset.name.toLowerCase().indexOf(key) !== -1;
    el.style.display = hit ? '' : 'none';
  });
  $$('.group-letter', panel).forEach(function(letter){
    var next = letter.nextElementSibling;
    var any = false;
    while (next && !next.classList.contains('group-letter')) {
      if (next.style.display !== 'none') { any = true; break; }
      next = next.nextElementSibling;
    }
    letter.style.display = any ? '' : 'none';
  });
}

registerApp('聊天', function(){ openChatApp(); });
