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

function renderChats(){
  var list = $('chatList'); if (!list) return;
  var rows = getSortedVisibleChats();
  var chatRoot = $('chatApp');
  if (chatRoot) chatRoot.classList.toggle('has-pinned-chats', rows.some(function(row){ return !!(row.chat && row.chat.pinned); }));
  if (!rows.length) { list.innerHTML = '<li class="empty-state">还没有会话<br>点右上角 ＋ 添加人设开始</li>'; updatePMBackBadge(); updateHomeChatBadge(); return; }
  var now = Date.now();
  list.innerHTML = rows.map(function(r, i){
    var c = r.chat;
    var badge = '';
    var displayName = (typeof getSessionCharDisplayName === 'function' ? getSessionCharDisplayName(c.name) : c.name) || c.name;
    var sessionCharAvatar = c.sessionSettings && c.sessionSettings.charAvatar;
    var displayAvatar = sessionCharAvatar || c.avatar || (typeof getAvatar === 'function' ? getAvatar(c.name) : null) || null;
    if (Number(c.unread) > 0) badge = '<span class="chat-unread-badge">' + (Number(c.unread) > 99 ? '99+' : Number(c.unread)) + '</span>';
    else if (c.markedUnread) badge = '<span class="chat-unread-badge is-dot" aria-label="未读"></span>';
    return '<li class="list-item' + (c.pinned ? ' is-pinned' : '') + '" data-name="' + escapeHTML(c.name) + '">' +
      '<div class="chat-avatar-wrap">' + avatarHTML(displayName, i, displayAvatar) + badge + '</div>' +
      '<div class="li-main">' +
        '<div class="li-top">' +
          '<span class="li-name">' + escapeHTML(displayName) + '</span>' +
          '<span class="li-time">' + escapeHTML(formatChatListTime(r.ts, now)) + '</span>' +
        '</div>' +
        '<div class="li-bottom">' +
          '<span class="li-preview">' + escapeHTML(c.preview || '') + '</span>' +
        '</div>' +
      '</div></li>';
  }).join('');
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
  var p = document.querySelector('#chatList .list-item.is-pressing');
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
      try { saveMessages(name); } catch (e) {}
      try { saveChats(); } catch (e) {}
      renderChats();
      toast('已删除该聊天');
    });
    return;
  }
  try { saveChats(); } catch (e) {}
  renderChats();
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
  var items = [
    [isUnread ? 'read' : 'unread', isUnread ? '标为已读' : '标为未读'],
    ['pin', c.pinned ? '取消置顶' : '置顶聊天'],
    ['hide', '不显示该聊天'],
    ['delete', '删除该聊天']
  ];
  var el = document.createElement('div');
  el.className = 'chat-list-menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = '<div class="chat-list-menu-mask" data-clm-close></div><div class="chat-list-menu-box">' +
    items.map(function(it){ return '<button type="button" role="menuitem" class="chat-list-menu-item' + (it[0] === 'delete' ? ' is-danger' : '') + '" data-clm="' + it[0] + '">' + it[1] + '</button>'; }).join('') +
    '</div>';
  host.appendChild(el);
  chatListMenuEl = el;
  var box = el.querySelector('.chat-list-menu-box');
  var vw = window.innerWidth, vh = window.innerHeight;
  var bw = box.offsetWidth, bh = box.offsetHeight;
  var left = Math.max(10, Math.min(x - bw / 2, vw - bw - 10));
  var top = y + 10;
  if (top + bh > vh - 10) top = Math.max(10, y - bh - 10);
  box.style.left = left + 'px';
  box.style.top = top + 'px';
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

function initChatListLongPress(){
  var list = $('chatList');
  if (!list || list.__longPressBound) return;
  list.__longPressBound = true;
  var timer = 0, startX = 0, startY = 0, pressItem = null, suppressUntil = 0;

  function cancel(){ clearTimeout(timer); timer = 0; pressItem = null; }

  list.addEventListener('pointerdown', function(e){
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var item = e.target.closest('.list-item');
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
    var item = e.target.closest('.list-item');
    if (!item || !item.dataset.name) return;
    e.preventDefault();
    if (chatListMenuEl) return;
    cancel();
    suppressUntil = Date.now() + 700;
    openChatListMenu(item, e.clientX, e.clientY);
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeChatListMenu(); });
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


function renderContacts(){
  var box = $('contactList'); if (!box) return;
  if (!CONTACTS.length) { box.innerHTML = '<div class="empty-state">还没有联系人<br>点右上角 ＋ 添加人设</div>'; return; }
  var groups = {};
  CONTACTS.forEach(function(c){
    var letter = getContactInitial(c && c.name);
    (groups[letter] = groups[letter] || []).push(c);
  });
  var html = '';
  Object.keys(groups).sort(function(a,b){ return contactInitialRank(a) - contactInitialRank(b); }).forEach(function(letter){
    groups[letter].sort(function(a,b){ return compareContactNames(a && a.name, b && b.name); });
    html += '<div class="group-letter">' + escapeHTML(letter) + '</div>';
    groups[letter].forEach(function(c, i){
      var sessionChat = typeof findChatByName === 'function' ? findChatByName(c.name) : null;
      var sessionSettings = sessionChat && sessionChat.sessionSettings && typeof sessionChat.sessionSettings === 'object' ? sessionChat.sessionSettings : null;
      var displayName = (typeof getSessionCharDisplayName === 'function' ? getSessionCharDisplayName(c.name) : c.name) || c.name;
      var displayAvatar = (sessionSettings && sessionSettings.charAvatar) || c.avatar || null;
      html += '<div class="list-item" data-name="' + escapeHTML(c.name) + '">' +
        avatarHTML(displayName, i + (letter.charCodeAt(0) || 0), displayAvatar) +
        '<div class="li-main"><div class="li-top"><span class="li-name">' + escapeHTML(displayName) + '</span></div>' +
        '</div></div>';
    });
  });
  box.innerHTML = html;
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
