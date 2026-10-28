/* 岛屿 · 聊天 · 新朋友（好友申请）
 * 两个方向：
 *   in  = 角色向用户发来的好友申请（用户同意 / 不同意，也可以只在验证信息里和角色聊）
 *   out = 用户搜角色的手机号 / 微信号后发出的好友申请（角色用主API决定同意 / 不同意 / 继续聊）
 * 数据存在 State.friendRequests（island.friendRequests）。
 * 经典脚本，需放在 js-apps-chat-persona.js 之后加载。 */
'use strict';

var friendsViewEl = $('friendsView');

var friendsTab = 'in';

var friendDetailEl = $('friendDetailView');

var friendDetailId = null;

var friendDetailSig = '';

var friendBusy = Object.create(null);

var friendDrafts = Object.create(null);

var friendAddBy = 'phone';

var friendAddFound = null;

var FRIEND_THREAD_MAX = 60;

var FRIEND_ICONS = {
  phone: '<path d="M6.6 3.8h3l1.4 4-2 1.4a11 11 0 0 0 5.8 5.8l1.4-2 4 1.4v3a1.8 1.8 0 0 1-2 1.8A15.6 15.6 0 0 1 4.8 5.8a1.8 1.8 0 0 1 1.8-2z"></path>',
  wechat: '<path d="M20 11.6c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.42L5 20l1-3.3C4.7 15.5 4 13.6 4 11.6 4 8 7.6 5.1 12 5.1s8 2.9 8 6.5z"></path>',
  person: '<circle cx="12" cy="8.6" r="3.4"></circle><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"></path>',
  state: '<circle cx="12" cy="12" r="8.5"></circle><path d="M8.4 12.3l2.5 2.5 4.8-5"></path>',
  send: '<path d="M12 18.5V6"></path><path d="M6.8 11.2 12 6l5.2 5.2"></path>'
};

function friendSvg(name, width){
  return '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="' + (width || 1.8) + '" viewBox="0 0 24 24">' + FRIEND_ICONS[name] + '</svg>';
}


/* ---------- 数据小工具 ---------- */
function friendList(){
  if (!Array.isArray(State.friendRequests)) State.friendRequests = [];
  return State.friendRequests;
}

function friendFindReq(id){
  var list = friendList();
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
  return null;
}

function friendLabel(persona){
  return String((persona && (persona.socialId || persona.name)) || '').trim() || '好友';
}

function friendViaText(via){ return via === 'wechat' ? '微信号' : '手机号'; }

function friendIsContact(name){
  return CONTACTS.some(function(c){ return c && c.name === name; });
}

function friendPendingUnseenCount(){
  return friendList().filter(function(r){
    return r && r.dir === 'in' && r.status === 'pending' && !r.seen && findPersona(r.name);
  }).length;
}

function friendAvatarInner(persona){
  if (persona && persona.avatar) return '<img src="' + escapeHTML(cachedImageSrc(persona.avatar)) + '" alt="">';
  return escapeHTML(friendLabel(persona).charAt(0));
}

function renderFriendBadges(){
  var n = friendPendingUnseenCount();
  var badge = $('friendsEntryBadge');
  if (badge) { badge.hidden = n <= 0; badge.textContent = n > 99 ? '99+' : String(n); }
  var dot = $('friendsTabDot');
  if (dot) dot.hidden = n <= 0;
  var segDot = $('friendsSegDot');
  if (segDot) segDot.hidden = n <= 0;
}


/* ---------- 角色发来的申请：创建 ---------- */
function friendCreateIncomingRequest(persona, via, text){
  var now = Date.now();
  friendList().push({
    id: genId('fr_'), name: persona.name, dir: 'in', via: via === 'wechat' ? 'wechat' : 'phone',
    status: 'pending', thread: [{ from: 'char', text: String(text || '').trim(), at: now }],
    createdAt: now, updatedAt: now, seen: false
  });
  saveFriendRequests();
  renderFriendBadges();
  renderFriendsView();
}


/* ---------- 主API：写验证信息 / 回复验证 ---------- */
function friendPersonaContext(p){
  var user = getActiveUserPersona() || {};
  var parts = [];
  if (p.gender && p.gender !== 'unspecified') {
    parts.push('【角色性别】\n' + (({ male: '男', female: '女', nonbinary: '非二元性别' })[p.gender] || String(p.gender)));
  }
  if (p.desc) parts.push('【角色人设】\n' + String(p.desc).trim());
  var acct = [];
  if (p.socialId) acct.push('社交软件网名：' + p.socialId);
  if (p.phone) acct.push('手机号：' + p.phone);
  if (p.wechatId) acct.push('微信号：' + p.wechatId);
  if (acct.length) parts.push('【角色账号信息】\n' + acct.join('\n'));
  var up = '【对方（用户）】\n名字叫「' + (user.name || '我') + '」，社交网名「' + getActiveUserSocialId() + '」。';
  if (user.desc) up += '\n' + String(user.desc).trim();
  parts.push(up);
  return parts;
}

function friendCleanLine(text){
  var t = String(typeof stripThinkTags === 'function' ? stripThinkTags(text) : text || '').trim();
  t = t.replace(/^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/g, '').trim();
  return t;
}

/* 返回 Promise<string>：角色会写的那一句验证信息 */
function friendGenerateVerifyText(p, via){
  var user = getActiveUserPersona() || {};
  var prompt = [
    '你是角色「' + p.name + '」。现在你要通过' + friendViaText(via) + '搜到「' + (user.name || '我') + '」，并向 TA 发出好友申请，需要写一句验证信息。',
    '要求：',
    '1. 完全符合角色的人设、性格、说话习惯，以及你和对方之间的关系设定。',
    '2. 像真人加好友时随手打的话，一到两句，不超过 40 个字。',
    '3. 只输出这句验证信息本身，不要加引号，不要加任何说明。',
    '',
    friendPersonaContext(p).join('\n\n')
  ].join('\n');
  var cfg = Object.assign({}, getApiConfig(), { temperature: 0.9 });
  return callApiOnce([
    { role: 'system', content: '你是角色扮演助手，只输出角色会写的验证信息本身，不要解释。' },
    { role: 'user', content: prompt }
  ], cfg).then(function(text){
    var line = friendCleanLine(text).split(/\r?\n/)[0].trim().slice(0, 80);
    if (!line) throw new Error('主API没有返回内容');
    return line;
  });
}

function friendParseDecision(text){
  var raw = String(typeof stripThinkTags === 'function' ? stripThinkTags(text) : text || '').trim();
  var m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      var obj = JSON.parse(m[0]);
      var d = String(obj.decision || 'keep').toLowerCase();
      if (['accept', 'decline', 'keep'].indexOf(d) < 0) d = 'keep';
      return { reply: String(obj.reply == null ? '' : obj.reply).trim(), decision: d };
    } catch (e) {}
  }
  return { reply: raw, decision: 'keep' };
}

/* 让角色看完验证对话后回复。返回 Promise<{reply, decision}> */
function friendCharTurn(req){
  var persona = findPersona(req.name);
  if (!persona) return Promise.reject(new Error('这个角色已经不存在了'));
  var user = getActiveUserPersona() || {};
  var uname = user.name || '我';
  var viaName = friendViaText(req.via);
  var sys = [
    '你正在扮演「' + persona.name + '」。始终保持第一人称、即时聊天口吻，不跳出角色，不提 AI、系统、提示词。'
  ].concat(friendPersonaContext(persona));
  if (req.dir === 'out') {
    sys.push([
      '【当前情境｜新朋友验证】',
      '「' + uname + '」通过你的' + viaName + '找到了你，向你发来好友申请，对方还在等你决定要不要通过。',
      '你可以选择：keep＝先继续聊几句、暂时不决定；accept＝通过；decline＝不通过。',
      '完全按照你的人设、你对对方的了解和此刻的心情自由决定，不要为了推进而随便通过，也不要无故刁难。',
      '回复要像真人聊天，一两句口语，不要写动作描写和旁白。选择 decline 时 reply 可以简短说明，也可以是空字符串。',
      '只输出一个 JSON 对象，不要输出别的文字：{"reply":"你要对对方说的话","decision":"keep 或 accept 或 decline"}'
    ].join('\n'));
  } else {
    sys.push([
      '【当前情境｜新朋友验证】',
      '你通过' + viaName + '向「' + uname + '」发出了好友申请，对方还没有决定通过，并在验证信息里回复了你。',
      '请自然地回复对方，一两句口语，不要写动作描写和旁白，不要催对方通过，也不要替对方做决定。只输出你要说的话本身。'
    ].join('\n'));
  }
  if (typeof buildCharacterLanguageInstruction === 'function') {
    try { sys.push(buildCharacterLanguageInstruction(persona)); } catch (e) {}
  }
  var lines = req.thread.slice(-30).map(function(t){
    return (t.from === 'char' ? '你' : uname) + '：' + t.text;
  });
  var ask = '验证对话记录（按时间顺序）：\n' + lines.join('\n') + '\n\n' + (req.dir === 'out' ? '请现在按要求输出 JSON。' : '请现在回复对方。');
  return callApiOnce([
    { role: 'system', content: sys.join('\n\n') },
    { role: 'user', content: ask }
  ], getApiConfig()).then(function(text){
    var out = req.dir === 'out' ? friendParseDecision(text) : { reply: friendCleanLine(text), decision: 'keep' };
    if (!out.reply && out.decision === 'keep') throw new Error('TA 没有回复内容');
    return out;
  });
}

function friendPushThread(req, from, text){
  if (!text) return;
  req.thread.push({ from: from, text: String(text), at: Date.now() });
  if (req.thread.length > FRIEND_THREAD_MAX) req.thread.splice(0, req.thread.length - FRIEND_THREAD_MAX);
  req.updatedAt = Date.now();
}

function friendRunCharTurn(req){
  if (!req || friendBusy[req.id]) return;
  friendBusy[req.id] = true;
  renderFriendsView();
  friendCharTurn(req).then(function(out){
    if (req.status !== 'pending') return;
    friendPushThread(req, 'char', out.reply);
    if (req.dir === 'out') {
      if (out.decision === 'accept') friendFinalizeAccepted(req);
      else if (out.decision === 'decline') { req.status = 'declined'; req.handledAt = Date.now(); }
    }
  }).catch(function(err){
    islandAlert('没有收到 TA 的回复：' + (err && err.message ? err.message : '未知原因') + '\n\n可以点「获取回复」再试一次。', { title: '没有回复' });
  }).then(function(){
    delete friendBusy[req.id];
    saveFriendRequests();
    renderFriendBadges();
    renderFriendsView();
  });
}


/* ---------- 同意 / 不同意 ---------- */
/* 成为好友：放进「消息」「联系人」，验证时说过的话变成聊天的第一批消息 */
function friendFinalizeAccepted(req){
  var persona = findPersona(req.name);
  if (!persona) return;
  var name = req.name;
  req.status = 'accepted';
  req.handledAt = Date.now();
  req.updatedAt = Date.now();
  if (!Array.isArray(MESSAGES[name])) MESSAGES[name] = [];
  var list = MESSAGES[name];
  req.thread.forEach(function(t){
    list.push({ id: genId('msg_'), from: t.from === 'char' ? 'them' : 'me', text: t.text, createdAt: t.at });
  });
  list.push({ id: genId('sys_'), from: 'me', type: 'system', systemType: 'friend_added', text: '你们已成为好友，现在可以开始聊天了', createdAt: Date.now() });
  var last = req.thread.length ? req.thread[req.thread.length - 1].text : '';
  addPersonaToLists(name, persona.avatar, last || '你们已成为好友，现在可以开始聊天了');
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i] && CHATS[i].name === name) { CHATS[i].preview = last || CHATS[i].preview; CHATS[i].time = '刚刚'; break; }
  }
  saveMessages(name);
  saveChats();
  renderChats();
  renderContacts();
}

function friendAccept(id){
  var req = friendFindReq(id);
  if (!req || req.status !== 'pending' || friendBusy[id]) return;
  friendFinalizeAccepted(req);
  saveFriendRequests();
  renderFriendBadges();
  renderFriendsView();
}

function friendDecline(id){
  var req = friendFindReq(id);
  if (!req || req.status !== 'pending' || friendBusy[id]) return;
  var p = findPersona(req.name);
  islandConfirm('不同意「' + friendLabel(p) + '」的好友申请吗？', { title: '不同意', confirmText: '不同意', cancelText: '再想想' }).then(function(ok){
    if (!ok || req.status !== 'pending') return;
    req.status = 'declined';
    req.handledAt = Date.now();
    req.updatedAt = Date.now();
    saveFriendRequests();
    renderFriendBadges();
    renderFriendsView();
  });
}

function friendSendReply(id){
  var req = friendFindReq(id);
  if (!req || req.status !== 'pending' || friendBusy[id]) return;
  var text = String(friendDrafts[id] || '').trim();
  if (!text) return;
  if (!isApiReady()) {
    islandAlert('还没有配置主API，TA 没法回复。请先到「设置」里把主API配置好。', { title: '没有主API' });
    return;
  }
  friendPushThread(req, 'user', text);
  delete friendDrafts[id];
  saveFriendRequests();
  friendRunCharTurn(req);
}

function friendRetry(id){
  var req = friendFindReq(id);
  if (!req || req.status !== 'pending' || friendBusy[id]) return;
  if (!isApiReady()) {
    islandAlert('还没有配置主API，TA 没法回复。请先到「设置」里把主API配置好。', { title: '没有主API' });
    return;
  }
  friendRunCharTurn(req);
}


/* ---------- 新朋友页面 ---------- */
function friendThreadHTML(req){
  var html = req.thread.map(function(t){
    return '<div class="fr-msg ' + (t.from === 'char' ? 'is-char' : 'is-me') + '"><span>' + escapeHTML(t.text) + '</span></div>';
  }).join('');
  if (friendBusy[req.id]) html += '<div class="fr-msg is-char"><span class="fr-typing"><i></i><i></i><i></i></span></div>';
  return html;
}

function friendStateText(req){
  if (req.status === 'accepted') return req.dir === 'out' ? '对方已同意' : '已同意';
  if (req.status === 'declined') return req.dir === 'out' ? '对方不同意' : '已拒绝';
  return req.dir === 'out' ? '等待对方验证' : '待处理';
}

function friendInfoHTML(req, p){
  return '<div class="fr-top"><div class="fr-avatar">' + friendAvatarInner(p) + '</div>' +
    '<div class="fr-id">' + escapeHTML(friendLabel(p)) + '</div></div>' +
    '<div class="fr-row"><span class="fr-row-icon">' + friendSvg(req.via === 'wechat' ? 'wechat' : 'phone', 1.8) + '</span>' +
    '<span class="fr-row-label">来源</span><span class="fr-row-value">' + friendViaText(req.via) + '</span></div>' +
    '<div class="fr-row"><span class="fr-row-icon">' + friendSvg('state', 1.8) + '</span>' +
    '<span class="fr-row-label">状态</span><span class="fr-row-value">' + friendStateText(req) + '</span></div>';
}

/* 列表里的摘要卡片：只看 ID、来源、状态、验证消息第一条，点一下进入详情 */
function friendCardHTML(req){
  var p = findPersona(req.name);
  var first = req.thread.length ? req.thread[0].text : '';
  return '<article class="fr-card is-link" data-fr-id="' + escapeHTML(req.id) + '" data-fr-open="1" role="button" tabindex="0">' +
    friendInfoHTML(req, p) +
    (first ? '<div class="fr-first">' + escapeHTML(first) + '</div>' : '') +
    '</article>';
}

/* 详情子页面：完整验证对话 + 回复 + 同意 / 不同意 */
function friendDetailBodyHTML(req){
  return '<article class="fr-card" data-fr-id="' + escapeHTML(req.id) + '">' + friendInfoHTML(req, findPersona(req.name)) + '</article>' +
    '<div class="fr-detail-thread">' + friendThreadHTML(req) + '</div>';
}

function friendDetailFootHTML(req){
  var busy = !!friendBusy[req.id];
  var last = req.thread.length ? req.thread[req.thread.length - 1] : null;
  var html = '';
  if (req.status === 'pending') {
    if (!busy && last && last.from === 'user') html += '<button class="fr-retry" data-fr-act="retry" type="button">获取回复</button>';
    html += '<div class="fr-reply"><input autocomplete="off" class="fr-reply-input" data-fr-draft="' + escapeHTML(req.id) + '" maxlength="200" placeholder="回复验证信息" type="text" value="' + escapeHTML(friendDrafts[req.id] || '') + '"' + (busy ? ' disabled' : '') + '/>' +
      '<button aria-label="发送" class="fr-send" data-fr-act="send" type="button"' + (busy ? ' disabled' : '') + '>' + friendSvg('send', 2.2) + '</button></div>';
    if (req.dir === 'in') {
      html += '<div class="fr-actions"><button class="fr-btn" data-fr-act="decline" type="button"' + (busy ? ' disabled' : '') + '>不同意</button>' +
        '<button class="fr-btn is-solid" data-fr-act="accept" type="button"' + (busy ? ' disabled' : '') + '>同意</button></div>';
    }
  } else if (req.status === 'accepted') {
    html += '<div class="fr-actions"><button class="fr-btn is-solid" data-fr-act="chat" type="button">发消息</button></div>';
  }
  return html;
}

function renderFriendDetail(){
  if (!friendDetailEl || !friendDetailId) return;
  var req = friendFindReq(friendDetailId);
  if (!req || !findPersona(req.name)) { closeFriendDetail(); return; }
  var scroll = $('friendDetailScroll'), foot = $('friendDetailFoot');
  if (!scroll || !foot) return;
  var sig = req.id + '|' + req.thread.length + '|' + req.status + '|' + (friendBusy[req.id] ? 1 : 0);
  if (sig === friendDetailSig && friendDetailEl.classList.contains('is-open')) return;
  var keepFocus = document.activeElement && document.activeElement.hasAttribute && document.activeElement.hasAttribute('data-fr-draft');
  var wasBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
  var fresh = friendDetailSig.split('|')[0] !== req.id;
  scroll.innerHTML = friendDetailBodyHTML(req);
  foot.innerHTML = friendDetailFootHTML(req);
  friendDetailSig = sig;
  if (fresh || wasBottom || friendBusy[req.id]) scroll.scrollTop = scroll.scrollHeight;
  if (keepFocus && req.status === 'pending' && !friendBusy[req.id]) {
    var input = foot.querySelector('[data-fr-draft]');
    if (input) { input.focus(); }
  }
}

function openFriendDetail(id){
  var req = friendFindReq(id);
  if (!req || !friendDetailEl) return;
  releaseInputFocus();
  friendDetailId = id;
  friendDetailSig = '';
  friendDetailEl.classList.add('is-open');
  friendDetailEl.setAttribute('aria-hidden', 'false');
  renderFriendDetail();
}

function closeFriendDetail(){
  if (!friendDetailEl) return;
  friendDetailEl.classList.remove('is-open');
  friendDetailEl.setAttribute('aria-hidden', 'true');
  friendDetailId = null;
  friendDetailSig = '';
  var input = friendDetailEl.querySelector('[data-fr-draft]');
  if (input) input.blur();
}

function renderFriendsView(){
  var box = $('friendsScroll');
  if (!box || !friendsViewEl) return;
  var top = box.scrollTop;
  var items = friendList().filter(function(r){
    return r && r.dir === friendsTab && findPersona(r.name);
  }).sort(function(a, b){
    var pa = a.status === 'pending' ? 1 : 0, pb = b.status === 'pending' ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
  });
  box.innerHTML = items.length
    ? items.map(friendCardHTML).join('')
    : '<div class="fr-empty">' + (friendsTab === 'in' ? '没有新的好友申请' : '还没有发出的申请') + '</div>';
  box.scrollTop = top;
  $$('.friends-seg-btn[data-friends-tab]', friendsViewEl).forEach(function(btn){
    var on = btn.dataset.friendsTab === friendsTab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  renderFriendDetail();
  if (friendsViewEl.classList.contains('is-open') && friendsTab === 'in') {
    var changed = false;
    friendList().forEach(function(r){ if (r && r.dir === 'in' && !r.seen) { r.seen = true; changed = true; } });
    if (changed) { saveFriendRequests(); renderFriendBadges(); }
  }
}

function setFriendsTab(tab){
  friendsTab = tab === 'out' ? 'out' : 'in';
  renderFriendsView();
}

function openFriendsView(tab){
  if (!friendsViewEl) return;
  releaseInputFocus();
  friendsViewEl.classList.add('is-open');
  friendsViewEl.setAttribute('aria-hidden', 'false');
  setFriendsTab(tab || 'in');
}

function closeFriendsView(){
  if (!friendsViewEl) return;
  closeFriendDetail();
  closeFriendAddSheet();
  friendsViewEl.classList.remove('is-open');
  friendsViewEl.setAttribute('aria-hidden', 'true');
}


/* ---------- 添加朋友弹层（搜手机号 / 微信号） ---------- */
function friendNormPhone(v){
  var d = String(v || '').replace(/\D/g, '');
  if (d.length === 13 && d.indexOf('86') === 0) d = d.slice(2);
  return d;
}

function friendFindByAccount(by, raw){
  var list = State.personas || [];
  if (by === 'wechat') {
    var w = String(raw || '').trim().toLowerCase();
    if (!w) return null;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].wechatId && String(list[i].wechatId).toLowerCase() === w) return list[i];
    return null;
  }
  var ph = friendNormPhone(raw);
  if (ph.length < 6) return null;
  for (var j = 0; j < list.length; j++) if (list[j] && list[j].phone && friendNormPhone(list[j].phone) === ph) return list[j];
  return null;
}

function friendSetAddAvatar(persona){
  var el = $('friendAddAvatar');
  if (!el) return;
  el.classList.toggle('has-user', !!persona);
  el.innerHTML = persona ? friendAvatarInner(persona) : friendSvg('person', 1.7);
}

function friendUpdateAddSend(){
  var btn = $('friendAddSend');
  if (btn) btn.disabled = !(friendAddFound && friendAddFound.state === 'ok');
}

function renderFriendAddResult(){
  var box = $('friendAddResult');
  if (!box) return;
  var f = friendAddFound;
  if (!f) { box.innerHTML = ''; friendSetAddAvatar(null); friendUpdateAddSend(); return; }
  friendSetAddAvatar(f.persona);
  var html = '';
  if (!f.persona) {
    html = '<div class="fr-card"><div class="fr-row"><span class="fr-row-icon">' + friendSvg('person', 1.8) + '</span><span class="fr-row-label">结果</span><span class="fr-row-value">没有找到该用户</span></div></div>';
  } else {
    var texts = { ok: '', friend: '已是好友', pendingOut: '已发送过申请', pendingIn: 'TA 已向你发来申请' };
    html = '<div class="fr-card">' +
      '<div class="fr-row"><span class="fr-row-icon">' + friendSvg('person', 1.8) + '</span><span class="fr-row-label">用户</span><span class="fr-row-value">' + escapeHTML(friendLabel(f.persona)) + '</span></div>';
    if (f.state === 'ok') {
      html += '<textarea class="fr-verify-input" id="friendAddVerify" maxlength="80" placeholder="填写验证信息" rows="3">' + escapeHTML('我是' + getActiveUserSocialId()) + '</textarea>';
    } else {
      html += '<div class="fr-row"><span class="fr-row-icon">' + friendSvg('state', 1.8) + '</span><span class="fr-row-label">状态</span><span class="fr-row-value">' + texts[f.state] + '</span></div>';
    }
    html += '</div>';
  }
  box.innerHTML = html;
  friendUpdateAddSend();
}

function setFriendAddBy(by){
  friendAddBy = by === 'wechat' ? 'wechat' : 'phone';
  var input = $('friendAddInput');
  if (input) {
    input.value = '';
    input.placeholder = friendAddBy === 'wechat' ? '输入微信号' : '输入手机号';
    input.setAttribute('inputmode', friendAddBy === 'wechat' ? 'text' : 'tel');
  }
  $$('[data-add-by]', $('friendAddSheet')).forEach(function(btn){
    var on = btn.dataset.addBy === friendAddBy;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  friendAddFound = null;
  renderFriendAddResult();
}

function openFriendAddSheet(){
  var sheet = $('friendAddSheet'), mask = $('friendAddMask');
  if (!sheet || !mask) return;
  releaseInputFocus();
  setFriendAddBy('phone');
  sheet.classList.add('is-open');
  mask.classList.add('is-open');
}

function closeFriendAddSheet(){
  var sheet = $('friendAddSheet'), mask = $('friendAddMask');
  if (!sheet || !mask) return;
  sheet.classList.remove('is-open');
  mask.classList.remove('is-open');
  var input = $('friendAddInput');
  if (input) input.blur();
}

function friendSearch(){
  var input = $('friendAddInput');
  var raw = input ? input.value.trim() : '';
  if (!raw) return;
  var p = friendFindByAccount(friendAddBy, raw);
  if (!p) { friendAddFound = { persona: null, state: 'none' }; renderFriendAddResult(); return; }
  var state = 'ok';
  if (friendIsContact(p.name)) state = 'friend';
  else {
    friendList().forEach(function(r){
      if (!r || r.name !== p.name || r.status !== 'pending') return;
      state = r.dir === 'in' ? 'pendingIn' : 'pendingOut';
    });
  }
  friendAddFound = { persona: p, state: state };
  renderFriendAddResult();
}

function friendSendRequest(){
  var f = friendAddFound;
  if (!f || f.state !== 'ok' || !f.persona) return;
  if (!isApiReady()) {
    islandAlert('还没有配置主API，TA 没法回复。请先到「设置」里把主API配置好。', { title: '没有主API' });
    return;
  }
  var verify = $('friendAddVerify');
  var text = (verify && verify.value.trim()) || ('我是' + getActiveUserSocialId());
  var list = friendList();
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].name === f.persona.name && list[i].dir === 'out' && list[i].status === 'declined') list.splice(i, 1);
  }
  var now = Date.now();
  var req = {
    id: genId('fr_'), name: f.persona.name, dir: 'out', via: friendAddBy, status: 'pending',
    thread: [{ from: 'user', text: text, at: now }], createdAt: now, updatedAt: now, seen: true
  };
  list.push(req);
  saveFriendRequests();
  closeFriendAddSheet();
  setFriendsTab('out');
  friendRunCharTurn(req);
}


/* ---------- 事件 ---------- */
function bindFriendsEvents(){
  var entry = $('friendsEntry');
  if (entry) entry.addEventListener('click', function(){ openFriendsView('in'); });
  var back = $('friendsBack');
  if (back) back.addEventListener('click', closeFriendsView);
  var addBtn = $('friendsAddBtn');
  if (addBtn) addBtn.addEventListener('click', openFriendAddSheet);

  var seg = $('friendsSeg');
  if (seg) seg.addEventListener('click', function(e){
    var btn = e.target.closest('[data-friends-tab]');
    if (btn) setFriendsTab(btn.dataset.friendsTab);
  });

  function handleAct(e){
    var btn = e.target.closest('[data-fr-act]');
    if (!btn || btn.disabled || !friendDetailId) return;
    var id = friendDetailId;
    var act = btn.dataset.frAct;
    if (act === 'accept') friendAccept(id);
    else if (act === 'decline') friendDecline(id);
    else if (act === 'send') friendSendReply(id);
    else if (act === 'retry') friendRetry(id);
    else if (act === 'chat') { var req = friendFindReq(id); if (req) { closeFriendsView(); openPM(req.name); } }
  }

  var scroll = $('friendsScroll');
  if (scroll) {
    scroll.addEventListener('click', function(e){
      var card = e.target.closest('[data-fr-open]');
      if (card && card.dataset.frId) openFriendDetail(card.dataset.frId);
    });
    scroll.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('[data-fr-open]');
      if (!card || !card.dataset.frId) return;
      e.preventDefault();
      openFriendDetail(card.dataset.frId);
    });
  }

  var detailBack = $('friendDetailBack');
  if (detailBack) detailBack.addEventListener('click', closeFriendDetail);
  var foot = $('friendDetailFoot');
  if (foot) {
    foot.addEventListener('click', handleAct);
    foot.addEventListener('input', function(e){
      var input = e.target.closest('[data-fr-draft]');
      if (input) friendDrafts[input.dataset.frDraft] = input.value;
    });
    foot.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      var input = e.target.closest('[data-fr-draft]');
      if (!input) return;
      e.preventDefault();
      friendDrafts[input.dataset.frDraft] = input.value;
      friendSendReply(input.dataset.frDraft);
    });
  }

  var mask = $('friendAddMask');
  if (mask) mask.addEventListener('click', closeFriendAddSheet);
  var close = $('friendAddClose');
  if (close) close.addEventListener('click', closeFriendAddSheet);
  var send = $('friendAddSend');
  if (send) send.addEventListener('click', friendSendRequest);
  var sheetSeg = $('friendAddSeg');
  if (sheetSeg) sheetSeg.addEventListener('click', function(e){
    var btn = e.target.closest('[data-add-by]');
    if (btn) setFriendAddBy(btn.dataset.addBy);
  });
  var go = $('friendAddSearch');
  if (go) go.addEventListener('click', friendSearch);
  var input = $('friendAddInput');
  if (input) {
    input.addEventListener('input', function(){
      var c = friendAddBy === 'wechat' ? input.value.replace(/[^A-Za-z0-9_\-]/g, '') : input.value.replace(/[^\d+\- ]/g, '');
      if (c !== input.value) input.value = c;
      if (friendAddFound) { friendAddFound = null; renderFriendAddResult(); }
    });
    input.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      friendSearch();
    });
  }
}

bindFriendsEvents();
