/* 岛屿 · 聊天 · 会话列表 / 通讯录 / 动态 / 我 的渲染
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function avatarHTML(name, index, avatar, extraClass){
  var deg = 130 + (index * 37) % 120;
  var inner = avatar ? '<img src="' + avatar + '" alt="">' : escapeHTML(String(name || '?').charAt(0));
  return '<div class="avatar ' + (extraClass || '') + ' chat-message__avatar" style="--deg:' + deg + 'deg">' + inner + '</div>';
}


function userAvatarHTML(){
  var u = getActiveUserPersona();
  var inner = u.avatar ? '<img src="' + u.avatar + '" alt="">' : escapeHTML(String(u.name || '我').charAt(0));
  return '<div class="avatar avatar-sm chat-message__avatar chat-message__user-avatar" data-avatar-owner="user" style="--deg:40deg">' + inner + '</div>';
}


function renderChats(){
  var list = $('chatList'); if (!list) return;
  if (!CHATS.length) { list.innerHTML = '<li class="empty-state">还没有会话<br>点右上角 ＋ 添加人设开始</li>'; return; }
  list.innerHTML = CHATS.map(function(c, i){
    return '<li class="list-item" data-name="' + escapeHTML(c.name) + '">' +
      avatarHTML(c.name, i, c.avatar) +
      '<div class="li-main">' +
        '<div class="li-top">' +
          '<span class="li-name">' + escapeHTML(c.name) + '</span>' +
          '<span class="li-time">' + escapeHTML(c.time || '') + '</span>' +
        '</div>' +
        '<div class="li-bottom">' +
          '<span class="li-preview">' + escapeHTML(c.preview || '') + '</span>' +
          (c.unread ? '<span class="badge">' + c.unread + '</span>' : '') +
        '</div>' +
      '</div></li>';
  }).join('');
}


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
      html += '<div class="list-item" data-name="' + escapeHTML(c.name) + '">' +
        avatarHTML(c.name, i + (letter.charCodeAt(0) || 0), c.avatar) +
        '<div class="li-main"><div class="li-top"><span class="li-name">' + escapeHTML(c.name) + '</span></div>' +
        '<div class="li-bottom"><span class="li-preview">点击开始对话</span></div></div></div>';
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
