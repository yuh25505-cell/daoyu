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
  switchTab('chats', true);
}

function closeChatApp(){
  if (!chatApp) return;
  releaseInputFocus();
  closePM(); closeUP(); closeChatAppearance();
  if (typeof closeFriendsView === 'function') closeFriendsView();
  chatApp.classList.remove('is-open');
  chatApp.setAttribute('aria-hidden', 'true');
  exitSearchAll();
  closeSheet();
  closeUserSheet();
}

var CHAT_TAB_ORDER = ['chats', 'contacts', 'moments', 'me'];
var chatTabCleanupTimer = 0;

function setChatTabPill(index, instant){
  var nav = document.querySelector('.chat-tabs');
  if (!nav) return;
  var prev = nav.style.getPropertyValue('--tab-i');
  if (instant) nav.classList.add('is-no-anim');
  nav.style.setProperty('--tab-i', String(index));
  if (instant) {
    void nav.offsetWidth;
    nav.classList.remove('is-no-anim');
    nav.classList.remove('is-flow');
    return;
  }
  if (prev !== String(index)) {
    nav.classList.remove('is-flow');
    void nav.offsetWidth;
    nav.classList.add('is-flow');
    clearTimeout(nav.__flowTimer);
    nav.__flowTimer = setTimeout(function(){ nav.classList.remove('is-flow'); }, 640);
  }
}

function switchTab(name, instant){
  releaseInputFocus();
  closePM(); closeUP(); closeChatAppearance();
  if (typeof closeFriendsView === 'function') closeFriendsView();
  if (chatApp) chatApp.classList.toggle('is-chats-tab-active', name === 'chats');

  var panels = $$('.tab-panel');
  var prevPanel = null;
  panels.forEach(function(p){ if (p.classList.contains('is-active')) prevPanel = p; });
  var prevName = prevPanel ? prevPanel.dataset.panel : '';
  var prevIdx = CHAT_TAB_ORDER.indexOf(prevName);
  var nextIdx = CHAT_TAB_ORDER.indexOf(name);
  var reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  var animate = !instant && !reduce && prevPanel && prevName !== name && nextIdx >= 0 && prevIdx >= 0 && chatApp && chatApp.classList.contains('is-open');

  clearTimeout(chatTabCleanupTimer);
  panels.forEach(function(p){ p.classList.remove('is-leaving', 'is-entering'); });

  panels.forEach(function(p){
    var on = p.dataset.panel === name;
    if (animate && !on && p === prevPanel) {
      p.style.setProperty('--tab-dx', (nextIdx > prevIdx ? 1 : -1) * 26 + 'px');
      p.classList.add('is-leaving');
    }
    if (animate && on) {
      p.style.setProperty('--tab-dx', (nextIdx > prevIdx ? 1 : -1) * 26 + 'px');
      p.classList.add('is-entering');
    }
    p.classList.toggle('is-active', on);
  });
  if (animate) {
    chatTabCleanupTimer = setTimeout(function(){
      $$('.tab-panel').forEach(function(p){ p.classList.remove('is-leaving', 'is-entering'); });
    }, 420);
  }

  $$('.chat-tab').forEach(function(t){ t.classList.toggle('is-active', t.dataset.tab === name); });
  if (nextIdx >= 0) setChatTabPill(nextIdx, !!instant || !animate && prevName === name);
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
  var favs = $('chatFavs');
  var clearBtn = $('chatSearchClear');
  if (clearBtn && panel.contains(clearBtn)) clearBtn.hidden = !key;
  if (favs && panel.contains(favs)) {
    var favItems = $$('.cl-fav', favs);
    var anyFav = !favItems.length;
    favItems.forEach(function(el){ if (el.style.display !== 'none') anyFav = true; });
    favs.style.display = anyFav ? '' : 'none';
    var listHead = panel.querySelector('.cl-sec-head--list');
    var anyRow = false;
    $$('#chatList .list-item', panel).forEach(function(el){ if (el.style.display !== 'none') anyRow = true; });
    if (listHead) listHead.style.display = (key && !anyRow) ? 'none' : '';
  }
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
