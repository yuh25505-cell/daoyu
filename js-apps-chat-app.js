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
  if (typeof closeFavoritesView === 'function') closeFavoritesView();
  chatApp.classList.remove('is-open');
  chatApp.setAttribute('aria-hidden', 'true');
  exitSearchAll();
  closeSheet();
  closeUserSheet();
}

var CHAT_TAB_ORDER = ['chats', 'contacts', 'moments', 'me'];

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
  if (typeof closeFavoritesView === 'function') closeFavoritesView();
  if (chatApp) chatApp.classList.toggle('is-chats-tab-active', name === 'chats');

  var prevName = '';
  $$('.tab-panel').forEach(function(p){
    if (p.classList.contains('is-active')) prevName = p.dataset.panel;
    p.classList.toggle('is-active', p.dataset.panel === name);
  });
  var nextIdx = CHAT_TAB_ORDER.indexOf(name);

  $$('.chat-tab').forEach(function(t){ t.classList.toggle('is-active', t.dataset.tab === name); });
  if (nextIdx >= 0) setChatTabPill(nextIdx, !!instant || prevName === name);
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
  panel.classList.toggle('is-filtering', !!key);
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
