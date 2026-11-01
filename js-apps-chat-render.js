/* 岛屿 · 聊天 · 会话列表 / 通讯录 / 动态 / 我 的渲染
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 头像 / 图片多为很长的 base64 data URI：每次渲染都内联会让 HTML 解析和图片解码变慢。
   同一张图只转换一次为 blob URL 并缓存，之后重复使用，浏览器也只解码一次。 */
var imageSrcCache = Object.create(null);
function cachedImageSrc(src){
  src = String(src || '');
  if (src.length < 4000 || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(src)) return src;
  var key = src.length + ':' + src.slice(-48) + ':' + src.slice(22, 70);
  if (imageSrcCache[key]) return imageSrcCache[key];
  try {
    var comma = src.indexOf(',');
    var mime = (src.slice(5, comma).split(';')[0]) || 'image/png';
    var bin = atob(src.slice(comma + 1));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return (imageSrcCache[key] = URL.createObjectURL(new Blob([bytes], { type:mime })));
  } catch(e) { return src; }
}

function avatarHTML(name, index, avatar, extraClass){
  var deg = 130 + (index * 37) % 120;
  var inner = avatar ? '<img src="' + cachedImageSrc(avatar) + '" alt="">' : escapeHTML(String(name || '?').charAt(0));
  return '<div class="avatar ' + (extraClass || '') + ' chat-message__avatar" style="--deg:' + deg + 'deg">' + inner + '</div>';
}


function userAvatarHTML(){
  var u = getActiveUserPersona();
  var sessionAvatar = (typeof getSessionUserAvatar === 'function' && currentName) ? getSessionUserAvatar(currentName) : null;
  var avatar = sessionAvatar || (u && u.avatar) || null;
  var inner = avatar ? '<img src="' + cachedImageSrc(avatar).replace(/"/g, '&quot;') + '" alt="">' : escapeHTML(String(u && (u.name || u.socialId) || '我').charAt(0));
  return '<div class="avatar avatar-sm chat-message__avatar chat-message__user-avatar" data-avatar-owner="user" style="--deg:40deg">' + inner + '</div>';
}


/* ===== 消息列表：排序 / 时间 / 长按菜单 ===== */

/* 该会话最后一条消息（char 或 user 发的都算）的时间戳；没有带时间的消息时退回 chat.lastTs。 */
function chatListLastTs(c){
  var list = c && MESSAGES && MESSAGES[c.name];
  if (Array.isArray(list)) {
    for (var i = list.length - 1; i >= 0; i--) {
      var ts = chatMessageCreatedAt(list[i]);
      if (ts) { c.lastTs = ts; return ts; }
    }
  }
  var fb = Number(c && c.lastTs) || 0;
  return fb > 0 ? fb : 0;
}

/* 右侧时间：当天 时:分；昨天；一周内 周x；同年 月日；跨年 年月日。 */
function formatChatListTime(ts, nowTs){
  ts = Number(ts) || 0;
  if (!ts) return '';
  var now = new Date(nowTs || Date.now());
  var d = new Date(ts);
  var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var diff = Math.round((today0 - day0) / 86400000);
  if (diff <= 0) return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  if (diff === 1) return '昨天';
  if (diff < 7) return '周' + '日一二三四五六'.charAt(d.getDay());
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

/* 联系人里已有聊天记录、但列表里没有条目的（例如被“删除该聊天”后又重新聊起），自动补回会话。 */
function ensureChatEntriesFromMessages(){
  var added = false;
  (Array.isArray(CONTACTS) ? CONTACTS : []).forEach(function(ct){
    if (!ct || !ct.name) return;
    var msgs = MESSAGES && MESSAGES[ct.name];
    if (!Array.isArray(msgs) || !msgs.length) return;
    for (var i = 0; i < CHATS.length; i++) if (CHATS[i].name === ct.name) return;
    CHATS.push({ name: ct.name, preview: '', time: '', unread: 0, avatar: ct.avatar });
    try { updateChatPreviewAfterMessageMutation(ct.name); } catch (e) {}
    added = true;
  });
  if (added) { try { saveChats(); } catch (e) {} }
}

/* 排序后的可见会话：置顶在前；各自按最后消息时间从新到旧；“不显示”的会话在有新消息时自动回来。 */
function getSortedVisibleChats(){
  ensureChatEntriesFromMessages();
  var rows = [];
  CHATS.forEach(function(c, idx){
    if (!c) return;
    var ts = chatListLastTs(c);
    if (c.hidden) {
      if (ts && ts > (Number(c.hiddenAt) || 0)) { c.hidden = false; c.hiddenAt = 0; }
      else return;
    }
    rows.push({ chat: c, ts: ts, idx: idx });
  });
  rows.sort(function(a, b){
    var pa = a.chat.pinned ? 1 : 0, pb = b.chat.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    if (a.ts !== b.ts) return b.ts - a.ts;
    return a.idx - b.idx;
  });
  return rows;
}

function chatListBadgeHTML(c){
  if (Number(c.unread) > 0) return '<span class="chat-unread-badge">' + (Number(c.unread) > 99 ? '99+' : Number(c.unread)) + '</span>';
  if (c.markedUnread) return '<span class="chat-unread-badge">1</span>';
  return '';
}

function chatListDisplay(c, i){
  var displayName = (typeof getSessionCharDisplayName === 'function' ? getSessionCharDisplayName(c.name) : c.name) || c.name;
  var sessionCharAvatar = c.sessionSettings && c.sessionSettings.charAvatar;
  var displayAvatar = sessionCharAvatar || c.avatar || (typeof getAvatar === 'function' ? getAvatar(c.name) : null) || null;
  return { name: displayName, avatar: avatarHTML(displayName, i, displayAvatar) };
}

/* 消息页顶部：英文日期 + 未读总数 */
function updateChatListHead(){
  var dateEl = $('clDate');
  if (dateEl) {
    var d = new Date();
    var text = '';
    try { text = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) {}
    dateEl.textContent = text.toUpperCase();
  }
  var total = 0;
  CHATS.forEach(function(c){
    if (!c) return;
    total += Number(c.unread) > 0 ? Number(c.unread) : (c.markedUnread ? 1 : 0);
  });
  var unreadEl = $('clUnread');
  if (unreadEl) unreadEl.textContent = (total > 99 ? '99+' : pad2(total)) + ' UNREAD';
}

var chatFavsExpanded = false;
var chatLocateIndex = -1;

/* 漏斗：依次定位有未读消息的会话（特别关注 + 最近会话，按屏幕上从上到下的顺序） */
function locateNextUnreadChat(){
  var targets = [];
  var panel = document.querySelector('.tab-panel[data-panel="chats"]');
  if (!panel) return;
  $$('#chatFavsRow .cl-fav, #chatList .list-item', panel).forEach(function(el){
    var c = findChatByName(el.dataset.name);
    if (c && (Number(c.unread) > 0 || c.markedUnread)) targets.push(el);
  });
  if (!targets.length) { toast('没有未读消息'); return; }
  var favs = $('chatFavs');
  var needExpand = false;
  chatLocateIndex = (chatLocateIndex + 1) % targets.length;
  var el = targets[chatLocateIndex];
  if (favs && el.classList.contains('cl-fav') && !chatFavsExpanded) {
    var idx = $$('.cl-fav', favs).indexOf(el);
    if (idx >= 4) { chatFavsExpanded = true; renderChats(); needExpand = true; }
  }
  if (needExpand) el = document.querySelector('#chatFavsRow .cl-fav[data-name="' + (window.CSS && CSS.escape ? CSS.escape(el.dataset.name) : el.dataset.name.replace(/"/g, '\\"')) + '"]') || el;
  try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
  el.classList.remove('is-locate');
  void el.offsetWidth;
  el.classList.add('is-locate');
  setTimeout(function(){ el.classList.remove('is-locate'); }, 1600);
}

function renderChats(){
  var list = $('chatList'); if (!list) return;
  var rows = getSortedVisibleChats();
  var chatRoot = $('chatApp');
  var pinnedRows = rows.filter(function(row){ return !!(row.chat && row.chat.pinned); });
  var normalRows = rows.filter(function(row){ return !(row.chat && row.chat.pinned); });
  if (chatRoot) chatRoot.classList.toggle('has-pinned-chats', pinnedRows.length > 0);
  updateChatListHead();

  var favs = $('chatFavs'), favsRow = $('chatFavsRow'), favsMore = $('chatFavsMore'), favsMoreText = $('chatFavsMoreText');
  if (favs && favsRow) {
    favs.hidden = !pinnedRows.length;
    favs.style.display = '';
    if (pinnedRows.length <= 4) chatFavsExpanded = false;
    favs.classList.toggle('is-expanded', chatFavsExpanded);
    if (favsMoreText) favsMoreText.textContent = chatFavsExpanded ? '收起' : '查看全部';
    favsRow.innerHTML = pinnedRows.map(function(r, i){
      var c = r.chat;
      var disp = chatListDisplay(c, i);
      return '<div class="cl-fav" data-name="' + escapeHTML(c.name) + '">' +
        '<div class="cl-fav-avatar">' + disp.avatar + chatListBadgeHTML(c) + '</div>' +
        '<span class="cl-fav-name">' + escapeHTML(disp.name) + '</span>' +
      '</div>';
    }).join('');
  }

  var listHead = document.querySelector('.cl-sec-head--list');
  if (listHead) listHead.style.display = '';
  if (!rows.length) { list.innerHTML = '<li class="empty-state">还没有会话<br>点右上角编辑按钮添加人设开始</li>'; updatePMBackBadge(); updateHomeChatBadge(); return; }
  var now = Date.now();
  list.innerHTML = normalRows.map(function(r, i){
    var c = r.chat;
    var disp = chatListDisplay(c, i + pinnedRows.length);
    var badge = chatListBadgeHTML(c);
    return '<li class="list-item" data-name="' + escapeHTML(c.name) + '">' +
      '<div class="chat-avatar-wrap">' + disp.avatar + '</div>' +
      '<div class="li-main">' +
        '<div class="li-top">' +
          '<span class="li-name">' + escapeHTML(disp.name) + '</span>' +
          '<span class="li-time">' + escapeHTML(formatChatListTime(r.ts, now)) + '</span>' +
        '</div>' +
        '<div class="li-bottom">' +
          '<span class="li-preview">' + escapeHTML(c.preview || '') + '</span>' +
          badge +
        '</div>' +
      '</div></li>';
  }).join('');
  var activeSearch = $('chatSearchInput');
  if (activeSearch && activeSearch.value) { var chatPanel = activeSearch.closest('.tab-panel'); if (chatPanel) filterPanel(chatPanel, activeSearch.value); }
  updatePMBackBadge();
  updateHomeChatBadge();
}

/* 主屏幕「聊天」App 图标右上角：所有会话未读总数（手动标为未读的算 1 条）。 */
function updateHomeChatBadge(){
  var total = 0;
  CHATS.forEach(function(c){
    if (!c) return;
    total += Number(c.unread) > 0 ? Number(c.unread) : (c.markedUnread ? 1 : 0);
  });
  var label = total > 99 ? '99+' : String(total);
  $$('.app[data-app="聊天"]').forEach(function(app){
    var b = app.querySelector('.app-unread-badge');
    if (total <= 0) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'app-unread-badge'; b.setAttribute('aria-hidden', 'true'); app.appendChild(b); }
    b.textContent = label;
  });
}

/* 私聊界面返回键右侧：其它会话的未读总数（手动标为未读的算 1 条），超过 99 显示 99+。 */
function updatePMBackBadge(){
  var el = $('pmBackBadge'); if (!el) return;
  var total = 0;
  CHATS.forEach(function(c){
    if (!c || c.name === currentName) return;
    total += Number(c.unread) > 0 ? Number(c.unread) : (c.markedUnread ? 1 : 0);
  });
  el.textContent = total > 99 ? '99+' : String(total);
  el.hidden = total <= 0;
}

function findChatByName(name){
  for (var i = 0; i < CHATS.length; i++) if (CHATS[i] && CHATS[i].name === name) return CHATS[i];
  return null;
}

/* ---- 长按菜单 ---- */
var chatListMenuEl = null, chatListMenuName = '';

function closeChatListMenu(){
  if (chatListMenuEl) { chatListMenuEl.remove(); chatListMenuEl = null; }
  chatListMenuName = '';
  var p = document.querySelector('#chatList .list-item.is-pressing, #chatFavsRow .cl-fav.is-pressing');
  if (p) p.classList.remove('is-pressing');
}

function chatListMenuAction(action, name){
  var c = findChatByName(name);
  if (!c) return;
  if (action === 'unread') {
    c.markedUnread = true;
  } else if (action === 'read') {
    c.unread = 0; c.markedUnread = false;
  } else if (action === 'pin') {
    c.pinned = !c.pinned; c.pinnedAt = c.pinned ? Date.now() : 0;
  } else if (action === 'hide') {
    c.hidden = true; c.hiddenAt = Date.now();
  } else if (action === 'delete') {
    islandConfirm('删除后，与「' + name + '」的聊天记录会一并清除，且无法恢复。', { title: '删除该聊天', confirmText: '删除', danger: true }).then(function(ok){
      if (!ok) return;
      for (var i = CHATS.length - 1; i >= 0; i--) if (CHATS[i] && CHATS[i].name === name) CHATS.splice(i, 1);
      MESSAGES[name] = [];
      IslandDB.chatDeleteAll(name).then(function(){
        resetChatMessageCacheState(name, [], {hasMore:false,hasNewer:false,count:0,globalNewestSeq:0});
        try { saveChats(); } catch (e) {}
        renderChats();
        if (typeof renderContacts === 'function') renderContacts();
        toast('已删除该聊天');
      }).catch(function(err){ toast('删除聊天失败：' + ((err && err.message) || '本机存储错误')); });
    });
    return;
  }
  try { saveChats(); } catch (e) {}
  renderChats();
  if (typeof renderContacts === 'function') renderContacts();
}

function openChatListMenu(item, x, y){
  var name = item && item.dataset && item.dataset.name;
  var c = name && findChatByName(name);
  var host = $('chatApp');
  if (!c || !host) return;
  closeChatListMenu();
  chatListMenuName = name;
  item.classList.add('is-pressing');
  var isUnread = !!(c.unread || c.markedUnread);
  var ICONS = {
    unread: '<path d="M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5z"></path><path d="M4 8l8 5.5L20 8"></path>',
    read: '<path d="M3.5 10.2l8.5-6 8.5 6V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17z"></path><path d="M4 10.8l8 5.4 8-5.4"></path>',
    pin: '<path d="M14.6 4.4l5 5-2.8 1.1-3.4 3.4.5 3.5-1.4 1.4-8-8 1.4-1.4 3.5.5 3.4-3.4z"></path><path d="M9 15l-5 5"></path>',
    hide: '<path d="M3.5 3.5l17 17"></path><path d="M10.6 6.1A9.4 9.4 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.4 2.2-2.9 3.5M6.6 7.6C4.6 8.9 3.2 10.7 2.5 12c1 1.8 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.8"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>',
    delete: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10 11v6M14 11v6"></path>'
  };
  function menuItem(key, label){
    return '<button type="button" role="menuitem" class="chat-list-menu-item' + (key === 'delete' ? ' is-danger' : '') + '" data-clm="' + key + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[key] + '</svg>' +
      '<span>' + label + '</span></button>';
  }
  var title = chatListDisplay(c, 0).name;
  var el = document.createElement('div');
  el.className = 'chat-list-menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = '<div class="chat-list-menu-mask" data-clm-close></div><div class="chat-list-menu-box">' +
    '<div class="chat-list-menu-title">' + escapeHTML(title) + '</div>' +
    '<div class="chat-list-menu-line"></div>' +
    '<div class="chat-list-menu-group">' +
      menuItem(isUnread ? 'read' : 'unread', isUnread ? '标为已读' : '标为未读') +
      menuItem('pin', c.pinned ? '取消置顶' : '置顶聊天') +
      menuItem('hide', '不显示该聊天') +
    '</div>' +
    '<div class="chat-list-menu-line"></div>' +
    '<div class="chat-list-menu-group">' + menuItem('delete', '删除该聊天') + '</div>' +
    '</div>';
  host.appendChild(el);
  chatListMenuEl = el;
  var box = el.querySelector('.chat-list-menu-box');
  var origin = el.getBoundingClientRect();
  var vw = origin.width, vh = origin.height;
  var bw = box.offsetWidth, bh = box.offsetHeight;
  x -= origin.left; y -= origin.top;
  var left = Math.max(10, Math.min(x - bw / 2, vw - bw - 10));
  var top = y + 10;
  if (top + bh > vh - 10) top = Math.max(10, y - bh - 10);
  box.style.left = left + 'px';
  box.style.top = top + 'px';
  box.style.transformOrigin = Math.max(0, Math.min(bw, x - left)) + 'px ' + Math.max(0, Math.min(bh, y - top)) + 'px';
  var openedAt = Date.now();
  el.addEventListener('click', function(e){
    if (Date.now() - openedAt < 450) return;   /* 抬手瞬间的残余点击不算 */
    var btn = e.target.closest('[data-clm]');
    if (btn) { var nm = chatListMenuName; closeChatListMenu(); chatListMenuAction(btn.dataset.clm, nm); return; }
    if (e.target.closest('[data-clm-close]')) closeChatListMenu();
  });
  /* 安卓长按会在菜单出现后再补发一次 contextmenu，落在遮罩上；只拦截，不能关闭菜单。 */
  el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
}

/* 右上角编辑按钮：弹出「添加人设 / 创建群聊」菜单 */
function openChatAddMenu(btn){
  var host = $('chatApp');
  if (!host || !btn) return;
  if (chatListMenuEl) { closeChatListMenu(); return; }
  var ICONS = {
    persona: '<circle cx="10" cy="8.5" r="3.6"></circle><path d="M3.5 19.5c.6-3.4 3.2-5.4 6.5-5.4 1.2 0 2.3.3 3.2.8"></path><path d="M18 14v6M15 17h6"></path>',
    group: '<circle cx="9" cy="8.5" r="3.3"></circle><path d="M2.8 19c.5-3.2 3-5 6.2-5 1 0 2 .2 2.8.6"></path><path d="M15.6 5.6a3 3 0 0 1 0 5.8"></path><path d="M18 14v6M15 17h6"></path>'
  };
  function menuItem(key, label){
    return '<button type="button" role="menuitem" class="chat-list-menu-item" data-clm="' + key + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[key] + '</svg>' +
      '<span>' + label + '</span></button>';
  }
  var el = document.createElement('div');
  el.className = 'chat-list-menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = '<div class="chat-list-menu-mask" data-clm-close></div><div class="chat-list-menu-box is-compact">' +
    '<div class="chat-list-menu-group">' + menuItem('persona', '添加人设') + menuItem('group', '创建群聊') + '</div></div>';
  host.appendChild(el);
  chatListMenuEl = el;
  var box = el.querySelector('.chat-list-menu-box');
  /* 固定在编辑按钮正下方：菜单右边缘对齐图标右边缘，从右上角弹开。
     坐标以菜单容器自身为准（iOS Safari 的顶部安全区会让容器与屏幕顶端错位），不再直接用屏幕坐标。 */
  var origin = el.getBoundingClientRect();
  var r = btn.getBoundingClientRect();
  var vw = origin.width;
  var bw = box.offsetWidth;
  var iconRight = r.left - origin.left + r.width / 2 + 10.5;
  var left = Math.max(10, Math.min(iconRight - bw, vw - bw - 10));
  box.style.left = left + 'px';
  box.style.top = (r.bottom - origin.top + 4) + 'px';
  box.style.transformOrigin = Math.max(0, Math.min(bw, r.left - origin.left + r.width / 2 - left)) + 'px 0px';
  el.addEventListener('click', function(e){
    var item = e.target.closest('[data-clm]');
    if (item) {
      var key = item.dataset.clm;
      closeChatListMenu();
      if (key === 'persona') openSheet();
      else if (key === 'group') toast('创建群聊功能开发中');
      return;
    }
    if (e.target.closest('[data-clm-close]')) closeChatListMenu();
  });
  el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
}

function initChatListLongPress(){
  var ITEM_SEL = '.list-item, .cl-fav';
  var timer = 0, startX = 0, startY = 0, pressItem = null, suppressUntil = 0;
  function cancel(){ clearTimeout(timer); timer = 0; pressItem = null; }

  function bindList(list){
    if (!list || list.__longPressBound) return;
    list.__longPressBound = true;

    list.addEventListener('pointerdown', function(e){
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var item = e.target.closest(ITEM_SEL);
      if (!item || !item.dataset.name) return;
      cancel();
      pressItem = item; startX = e.clientX; startY = e.clientY;
      timer = setTimeout(function(){
        var it = pressItem; timer = 0; pressItem = null;
        if (!it) return;
        suppressUntil = Date.now() + 700;
        openChatListMenu(it, startX, startY);
      }, 480);
    });
    list.addEventListener('pointermove', function(e){
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(t){ list.addEventListener(t, cancel); });
    list.addEventListener('scroll', cancel, true);

    /* 长按抬手后的 click 不再进入聊天；桌面端右键也能唤出菜单。 */
    list.addEventListener('click', function(e){
      if (Date.now() < suppressUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    list.addEventListener('contextmenu', function(e){
      var item = e.target.closest(ITEM_SEL);
      if (!item || !item.dataset.name) return;
      e.preventDefault();
      if (chatListMenuEl) return;
      cancel();
      suppressUntil = Date.now() + 700;
      openChatListMenu(item, e.clientX, e.clientY);
    });
  }

  bindList($('chatList'));
  bindList($('chatFavsRow'));
  var scroller = document.querySelector('.cl-scroll');
  if (scroller && !scroller.__longPressCancelBound) { scroller.__longPressCancelBound = true; scroller.addEventListener('scroll', cancel, { passive: true }); }
  if (!document.__chatListEscBound) {
    document.__chatListEscBound = true;
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeChatListMenu(); });
  }
}

initChatListLongPress();

/* 应用从后台回到前台时，正停留的聊天里积累的未读视为已读。 */
document.addEventListener('visibilitychange', function(){
  if (document.hidden || !currentName) return;
  var c = findChatByName(currentName);
  if (c && (c.unread || c.markedUnread)) { c.unread = 0; c.markedUnread = false; renderChats(); try { saveChats(); } catch (e) {} }
});


// 联系人首字母：中文按拼音首字母，英文按 A-Z，其它字符归入 #。
// 中文拼音表在构建时生成并随应用一起打包，避免浏览器环境不支持 GBK/GB2312 编码导致全部落入 #。
function getContactInitial(name){
  name = String(name || '').trim();
  if (!name) return '#';
  var first = Array.from(name)[0] || '';
  if (/^[A-Za-z]$/.test(first)) return first.toUpperCase();
  if (window.HAN_PINYIN_INITIALS && window.HAN_PINYIN_INITIALS[first]) return window.HAN_PINYIN_INITIALS[first];
  return '#';
}

function contactInitialRank(letter){
  letter = String(letter || '#').toUpperCase();
  if (/^[A-Z]$/.test(letter)) return letter.charCodeAt(0) - 65;
  return 26;
}

function compareContactNames(a, b){
  var la = getContactInitial(a), lb = getContactInitial(b);
  var ra = contactInitialRank(la), rb = contactInitialRank(lb);
  if (ra !== rb) return ra - rb;
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN');
}


/* 好友是否被置顶（置顶的好友归到“特别关心”，不再出现在“我的好友”里） */
function isContactPinned(name){
  var c = typeof findChatByName === 'function' ? findChatByName(name) : null;
  return !!(c && c.pinned);
}

/* 联系人 / 特别关心 共用的一行好友 */
function contactRowHTML(c, avatarIndex){
  var sessionChat = typeof findChatByName === 'function' ? findChatByName(c.name) : null;
  var sessionSettings = sessionChat && sessionChat.sessionSettings && typeof sessionChat.sessionSettings === 'object' ? sessionChat.sessionSettings : null;
  var displayName = (typeof getSessionCharDisplayName === 'function' ? getSessionCharDisplayName(c.name) : c.name) || c.name;
  var displayAvatar = (sessionSettings && sessionSettings.charAvatar) || c.avatar || null;
  return '<div class="list-item" data-name="' + escapeHTML(c.name) + '">' +
    avatarHTML(displayName, avatarIndex, displayAvatar) +
    '<div class="li-main"><div class="li-top"><span class="li-name">' + escapeHTML(displayName) + '</span></div>' +
    '</div>' +
    '<svg class="ct-chev" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M9.5 5.5 16 12l-6.5 6.5"></path></svg>' +
    '</div>';
}

function renderContacts(){
  var box = $('contactList'); if (!box) return;
  var countEl = $('contactsCount');
  if (countEl) countEl.textContent = CONTACTS.length + ' FRIENDS';
  renderFavorites();
  if (!CONTACTS.length) {
    box.innerHTML = '<div class="empty-state">还没有联系人<br>点右上角编辑按钮添加人设</div>';
    if (typeof renderFriendBadges === 'function') renderFriendBadges();
    return;
  }
  var groups = {};
  var shown = 0;
  CONTACTS.forEach(function(c){
    if (isContactPinned(c && c.name)) return;
    var letter = getContactInitial(c && c.name);
    (groups[letter] = groups[letter] || []).push(c);
    shown++;
  });
  if (!shown) {
    box.innerHTML = '<div class="empty-state">好友都在特别关心里</div>';
    if (typeof renderFriendBadges === 'function') renderFriendBadges();
    return;
  }
  var html = '';
  Object.keys(groups).sort(function(a,b){ return contactInitialRank(a) - contactInitialRank(b); }).forEach(function(letter){
    groups[letter].sort(function(a,b){ return compareContactNames(a && a.name, b && b.name); });
    html += '<div class="group-letter">' + escapeHTML(letter) + '</div>';
    groups[letter].forEach(function(c, i){
      html += contactRowHTML(c, i + (letter.charCodeAt(0) || 0));
    });
  });
  box.innerHTML = html;
  if (typeof renderFriendBadges === 'function') renderFriendBadges();
}


/* ---------- 特别关心：被置顶的好友单独列在这里 ---------- */
function renderFavorites(){
  var box = $('favoritesList'); if (!box) return;
  var rows = [];
  CONTACTS.forEach(function(c, idx){
    if (!c || !isContactPinned(c.name)) return;
    rows.push({ c: c, ts: chatListLastTs(findChatByName(c.name)), idx: idx });
  });
  rows.sort(function(a, b){
    if (a.ts !== b.ts) return b.ts - a.ts;
    return a.idx - b.idx;
  });
  if (!rows.length) { box.innerHTML = '<div class="fr-empty">还没有特别关心的好友</div>'; return; }
  box.innerHTML = rows.map(function(r, i){ return contactRowHTML(r.c, i); }).join('');
}

function openFavoritesView(){
  var v = $('favoritesView'); if (!v) return;
  releaseInputFocus();
  renderFavorites();
  v.classList.add('is-open');
  v.setAttribute('aria-hidden', 'false');
}

function closeFavoritesView(){
  var v = $('favoritesView'); if (!v) return;
  v.classList.remove('is-open');
  v.setAttribute('aria-hidden', 'true');
}


function renderMoments(){
  var box = $('momentList'); if (!box) return;
  if (!MOMENTS.length) { box.innerHTML = '<div class="empty-state">还没有朋友圈动态</div>'; return; }
  box.innerHTML = MOMENTS.map(function(m, i){
    var deg = 130 + (i * 41) % 130;
    var imgs = '';
    if (m.imgs > 0) {
      var cls = m.imgs === 1 ? 'moment-images single' : 'moment-images';
      var cells = '';
      for (var k = 0; k < m.imgs; k++) cells += '<div class="mi" style="--deg:' + (deg + k * 18) + 'deg"></div>';
      imgs = '<div class="' + cls + '">' + cells + '</div>';
    }
    return '<article class="moment">' + avatarHTML(m.name, i) +
      '<div class="moment-main"><div class="moment-name">' + escapeHTML(m.name) + '</div>' +
      '<p class="moment-text">' + escapeHTML(m.text) + '</p>' + imgs +
      '<div class="moment-foot"><span class="moment-time">' + escapeHTML(m.time) + '</span>' +
      '<button class="moment-act js-like" type="button" data-likes="' + (m.likes || 0) + '">赞 ' + (m.likes || 0) + '</button>' +
      '<button class="moment-act" type="button">评论 ' + (m.comments || 0) + '</button></div></div></article>';
  }).join('');
}


function renderAll(){
  renderChats();
  renderContacts();
  renderMoments();
  renderMeCard();
  renderUserPersonas();
  renderWorldbooks();
}


function renderMeCard(){
  var u = getActiveUserPersona();
  var elAv = $('meAvatar');
  var elName = $('meName');
  var elSign = $('meSign');
  var elState = $('userPersonaState');

  var socialId = String(u.socialId || u.name || '我').trim() || '我';
  if (elAv) {
    elAv.innerHTML = u.avatar ? '<img src="' + u.avatar + '" alt="">' : escapeHTML(socialId.charAt(0));
  }
  if (elName) elName.textContent = socialId;
  if (elSign) elSign.textContent = String(u.signature || '').trim();
  if (elState) elState.textContent = State.userPersonas.length + ' 个';
}


function renderUserPersonas(){
  var box = $('userPersonaList'); if (!box) return;
  if (!State.userPersonas.length) {
    box.innerHTML = '<div class="empty-state">还没有角色<br>点右上角 ＋ 添加</div>';
    return;
  }
  var activeId = State.settings.activeUserPersonaId;
  var checkSvg = '<svg class="up-check" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M5 12.5 10 17.5 19 7"/></svg>';

  box.innerHTML = State.userPersonas.map(function(u, i){
    var deg = 130 + (i * 37) % 120;
    var inner = u.avatar ? '<img src="' + u.avatar + '" alt="">' : escapeHTML(String(u.name || '?').charAt(0));
    var av = '<div class="avatar" style="--deg:' + deg + 'deg">' + inner + '</div>';
    var subtitle = (u.id === activeId ? '当前使用 · ' : '') + '点击查看和编辑';

    return '<div class="list-item ' + (u.id === activeId ? 'is-active' : '') +
      '" data-userid="' + escapeHTML(u.id) + '">' +
      av +
      '<div class="li-main"><div class="li-top"><span class="li-name">' + escapeHTML(u.name || '未命名') + '</span></div>' +
      '<div class="li-bottom"><span class="li-preview">' + subtitle + '</span></div></div>' +
      checkSvg + '</div>';
  }).join('');
}


function refreshApiState(){
  var el = $('apiState'); if (!el) return;
  var c = getApiConfig();
  if (isApiReady()) { el.textContent = '已启用'; el.classList.add('ok'); el.classList.remove('err'); }
  else if (c && c.baseUrl && c.apiKey && c.model) { el.textContent = '已配置'; el.classList.remove('ok', 'err'); }
  else { el.textContent = '未配置'; el.classList.remove('ok', 'err'); }
}
