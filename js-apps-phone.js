/* 岛屿 · 电话 App
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var phoneApp = $('phoneApp'), phoneBack = $('phoneBack'), phoneContactsBack = $('phoneContactsBack'), phoneFavoritesBack = $('phoneFavoritesBack'), phoneContactDetailBack = $('phoneContactDetailBack'), phoneDetailBack = $('phoneDetailBack'), phoneRecentList = $('phoneRecentList'), phoneRecentManage = $('phoneRecentManage'), phoneRecentSelection = $('phoneRecentSelection'), phoneRecentCharFilter = $('phoneRecentCharFilter'), phoneRecentSelectAll = $('phoneRecentSelectAll'), phoneRecentSelectionCount = $('phoneRecentSelectionCount'), phoneRecentDelete = $('phoneRecentDelete'), phoneRecentCancel = $('phoneRecentCancel'), phoneContactList = $('phoneContactList'), phoneFavoriteList = $('phoneFavoriteList'), phoneContactCallList = $('phoneContactCallList'), phoneContactDetailTitle = $('phoneContactDetailTitle'), phoneDetailTitle = $('phoneDetailTitle'), phoneDetailScroll = $('phoneDetailScroll'), phoneDetailFavorite = $('phoneDetailFavorite'), phoneBottomNav = $('phoneBottomNav');



var phoneCurrentPanel = 'recent';

var phoneDetailReturnPanel = 'recent';

var phoneCurrentContactName = '';

var phoneRecentManageMode = false;

var phoneRecentSelectedSessions = {};

var phoneRecentCharFilterValue = '';


function phoneCallBySessionId(sessionId){
  sessionId = String(sessionId || '');
  for (var i = 0; i < (State.phoneCalls || []).length; i++) {
    if (String(State.phoneCalls[i] && State.phoneCalls[i].sessionId || '') === sessionId) return State.phoneCalls[i];
  }
  return null;
}


function getPhoneRecentSelectedSessionIds(){
  return Object.keys(phoneRecentSelectedSessions).filter(function(sessionId){ return !!phoneRecentSelectedSessions[sessionId]; });
}


function phoneRecentSelectionVisibleRows(){
  var filter = String(phoneRecentCharFilterValue || '');
  return phoneSortedCalls(function(record){
    return !filter || String(record && record.name || '') === filter;
  });
}


function populatePhoneRecentCharFilter(){
  if (!phoneRecentCharFilter) return;
  var names = {};
  phoneSortedCalls().forEach(function(record){
    var name = String(record && record.name || '').trim();
    if (name) names[name] = true;
  });
  var options = Object.keys(names).sort(function(a,b){ return a.localeCompare(b, 'zh-Hans-CN'); });
  if (phoneRecentCharFilterValue && !names[phoneRecentCharFilterValue]) phoneRecentCharFilterValue = '';
  phoneRecentCharFilter.innerHTML = ['<option value="">全部 char · ' + phoneSortedCalls().length + ' 条</option>']
    .concat(options.map(function(name){
      var count = phoneSortedCalls(function(record){ return String(record && record.name || '') === name; }).length;
      return '<option value="' + escapeHTML(name) + '">' + escapeHTML(name) + ' · ' + count + ' 条</option>';
    })).join('');
  phoneRecentCharFilter.value = phoneRecentCharFilterValue;
}


function updatePhoneRecentSelectionUI(){
  var count = getPhoneRecentSelectedSessionIds().length;
  if (phoneRecentSelectionCount) phoneRecentSelectionCount.textContent = '已选 ' + count + ' 条';
  if (phoneRecentDelete) phoneRecentDelete.disabled = count === 0;
  if (phoneRecentSelectAll) {
    var visible = phoneRecentSelectionVisibleRows();
    var allSelected = visible.length > 0 && visible.every(function(record){ return !!phoneRecentSelectedSessions[String(record.sessionId || '')]; });
    phoneRecentSelectAll.textContent = allSelected ? '取消全选' : '全选当前';
  }
  if (phoneRecentManage) {
    phoneRecentManage.textContent = phoneRecentManageMode ? '完成' : '选择';
    phoneRecentManage.setAttribute('aria-label', phoneRecentManageMode ? '完成选择' : '选择通话记录');
  }
}


function setPhoneRecentSelectionMode(enabled){
  phoneRecentManageMode = !!enabled;
  if (!phoneRecentManageMode) {
    phoneRecentSelectedSessions = {};
    phoneRecentCharFilterValue = '';
  }
  if (phoneRecentSelection) phoneRecentSelection.hidden = !phoneRecentManageMode;
  populatePhoneRecentCharFilter();
  updatePhoneRecentSelectionUI();
  renderPhoneRecentList();
}


function togglePhoneRecentSelection(sessionId, forceValue){
  sessionId = String(sessionId || '');
  if (!sessionId) return;
  var next = typeof forceValue === 'boolean' ? forceValue : !phoneRecentSelectedSessions[sessionId];
  if (next) phoneRecentSelectedSessions[sessionId] = true;
  else delete phoneRecentSelectedSessions[sessionId];
  updatePhoneRecentSelectionUI();
}


function togglePhoneRecentSelectAllVisible(){
  var rows = phoneRecentSelectionVisibleRows();
  if (!rows.length) return;
  var allSelected = rows.every(function(record){ return !!phoneRecentSelectedSessions[String(record.sessionId || '')]; });
  rows.forEach(function(record){
    var sessionId = String(record.sessionId || '');
    if (allSelected) delete phoneRecentSelectedSessions[sessionId];
    else phoneRecentSelectedSessions[sessionId] = true;
  });
  updatePhoneRecentSelectionUI();
  renderPhoneRecentList();
}


function deletePhoneCallSessions(sessionIds){
  var wanted = {};
  (Array.isArray(sessionIds) ? sessionIds : []).forEach(function(sessionId){
    sessionId = String(sessionId || '').trim();
    if (sessionId) wanted[sessionId] = true;
  });
  var ids = Object.keys(wanted);
  if (!ids.length) return Promise.resolve(false);

  var before = Array.isArray(State.phoneCalls) ? State.phoneCalls : [];
  var removed = 0;
  var nextCalls = before.filter(function(record){
    var sessionId = String(record && record.sessionId || '');
    if (wanted[sessionId]) { removed++; return false; }
    return true;
  });
  State.phoneCalls = nextCalls;

  var changedMessageKeys = [];
  Object.keys(MESSAGES || {}).forEach(function(name){
    var rows = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
    var filtered = rows.filter(function(msg){
      return !(msg && msg.type === 'voice_call' && wanted[String(msg.callSessionId || '')]);
    });
    if (filtered.length !== rows.length) {
      MESSAGES[name] = filtered;
      changedMessageKeys.push(name);
    }
  });

  phoneRecentSelectedSessions = {};
  return Promise.all([savePhoneCalls()].concat(changedMessageKeys.map(function(name){ return saveMessages(name); }))).then(function(){
    renderPhoneLists();
    populatePhoneRecentCharFilter();
    updatePhoneRecentSelectionUI();
    if (phoneCurrentPanel === 'call-detail' && phoneDetailFavorite) {
      var currentId = phoneDetailFavorite.dataset.phoneCallFavorite || '';
      if (wanted[currentId]) closePhoneDetail();
    }
    if (removed > 0 || changedMessageKeys.length) {
      toast('已完整删除 ' + removed + ' 条通话记录');
      return true;
    }
    return false;
  });
}


function getVoiceCallMessages(name, sessionId){
  name = String(name || '');
  sessionId = String(sessionId || '');
  var rows = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  return rows.filter(function(msg){
    return msg && msg.type === 'voice_call' && String(msg.callSessionId || '') === sessionId;
  }).sort(function(a,b){ return Number(a.createdAt || 0) - Number(b.createdAt || 0); });
}


function ensurePhoneCallRecord(name, sessionId, startedAt){
  name = String(name || '').trim();
  sessionId = String(sessionId || '').trim();
  if (!name || !sessionId) return null;
  var record = phoneCallBySessionId(sessionId);
  if (!record) {
    record = {
      id:genId('phone_call_'),
      sessionId:sessionId,
      name:name,
      startedAt:Number(startedAt || Date.now()),
      endedAt:0,
      durationMs:0,
      status:'ongoing',
      messageCount:0,
      preview:'',
      favorite:false,
      updatedAt:Date.now()
    };
    State.phoneCalls.unshift(record);
  }
  if (typeof record.favorite !== 'boolean') record.favorite = !!record.favorite;
  record.name = name;
  if (!record.startedAt) record.startedAt = Number(startedAt || Date.now());
  record.updatedAt = Date.now();
  savePhoneCalls();
  return record;
}


function finalizePhoneCallRecord(sessionId, endedAt){
  var record = phoneCallBySessionId(sessionId);
  if (!record) return;
  var end = Number(endedAt || Date.now());
  record.endedAt = Math.max(end, Number(record.startedAt || end));
  record.durationMs = Math.max(0, record.endedAt - Number(record.startedAt || record.endedAt));
  record.status = 'completed';
  var rows = getVoiceCallMessages(record.name, sessionId);
  record.messageCount = rows.length;
  record.preview = rows.length ? String(rows[rows.length - 1].text || '').slice(0, 100) : '';
  record.updatedAt = end;
  if (typeof record.favorite !== 'boolean') record.favorite = false;
  savePhoneCalls();
  renderPhoneLists();
}


function migratePhoneCallsFromMessages(){
  var existing = Array.isArray(State.phoneCalls) ? State.phoneCalls : [];
  var bySession = {};
  existing.forEach(function(record){
    if (record && record.sessionId) {
      if (typeof record.favorite !== 'boolean') record.favorite = !!record.favorite;
      bySession[String(record.sessionId)] = record;
    }
  });
  Object.keys(MESSAGES || {}).forEach(function(name){
    var rows = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
    rows.forEach(function(msg){
      if (!msg || msg.type !== 'voice_call' || !msg.callSessionId) return;
      var sid = String(msg.callSessionId);
      if (!bySession[sid]) {
        var at = Number(msg.createdAt || Date.now());
        bySession[sid] = {
          id:genId('phone_call_'),
          sessionId:sid,
          name:String(name || ''),
          startedAt:at,
          endedAt:at,
          durationMs:0,
          status:'completed',
          messageCount:0,
          preview:'',
          favorite:false,
          updatedAt:at
        };
      }
      var rec = bySession[sid];
      rec.name = String(name || rec.name || '');
      rec.messageCount = Number(rec.messageCount || 0) + 1;
      rec.updatedAt = Math.max(Number(rec.updatedAt || 0), Number(msg.createdAt || 0));
      if (!rec.startedAt || Number(msg.createdAt || 0) < Number(rec.startedAt)) rec.startedAt = Number(msg.createdAt || 0);
      rec.endedAt = Math.max(Number(rec.endedAt || 0), Number(msg.createdAt || 0));
      rec.preview = String(msg.text || rec.preview || '').slice(0, 100);
    });
  });
  var merged = Object.keys(bySession).map(function(k){ return bySession[k]; });
  merged.forEach(function(rec){
    var rows = getVoiceCallMessages(rec.name, rec.sessionId);
    rec.messageCount = rows.length;
    if (!rec.preview && rows.length) rec.preview = String(rows[rows.length - 1].text || '').slice(0, 100);
    if (!rec.endedAt) rec.endedAt = rec.updatedAt || rec.startedAt;
    if (!rec.durationMs) rec.durationMs = Math.max(0, Number(rec.endedAt || 0) - Number(rec.startedAt || 0));
    rec.status = 'completed';
    if (typeof rec.favorite !== 'boolean') rec.favorite = false;
  });
  merged.sort(function(a,b){ return Number(b.updatedAt || b.startedAt || 0) - Number(a.updatedAt || a.startedAt || 0); });
  var changed = merged.length !== existing.length || merged.some(function(rec, i){
    var old = existing[i];
    return !old || old.sessionId !== rec.sessionId || Number(old.messageCount || 0) !== Number(rec.messageCount || 0) || !!old.favorite !== !!rec.favorite;
  });
  State.phoneCalls = merged;
  if (changed) savePhoneCalls();
}


function formatPhoneCallTime(ts){
  var d = new Date(Number(ts || 0));
  if (!isFinite(d.getTime())) return '';
  var now = new Date();
  var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return pad(d.getHours()) + ':' + pad(d.getMinutes());
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}


function formatPhoneCallDuration(ms){
  ms = Math.max(0, Number(ms) || 0);
  var total = Math.floor(ms / 1000);
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
  return pad(m) + ':' + pad(s);
}


function phoneCallAvatarHTML(name, className){
  var persona = findPersona(name);
  var avatar = persona && persona.avatar ? persona.avatar : '';
  var initial = String(name || '?').trim().charAt(0) || '?';
  return '<div class="' + (className || 'phone-call-avatar') + '">' + (avatar ? '<img src="' + escapeHTML(avatar) + '" alt="">' : escapeHTML(initial)) + '</div>';
}


function phoneSortedCalls(filterFn){
  var rows = Array.isArray(State.phoneCalls) ? State.phoneCalls.slice() : [];
  if (filterFn) rows = rows.filter(filterFn);
  rows.sort(function(a,b){ return Number(b.updatedAt || b.startedAt || 0) - Number(a.updatedAt || a.startedAt || 0); });
  return rows;
}


function phoneStarHTML(record){
  return '<button type="button" class="phone-call-star ' + (record.favorite ? 'is-favorite' : '') + '" data-phone-call-favorite="' + escapeHTML(record.sessionId) + '" aria-label="' + (record.favorite ? '取消收藏' : '收藏通话') + '" title="' + (record.favorite ? '取消收藏' : '收藏通话') + '">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.9l2.72 5.52 6.09.88-4.41 4.3 1.04 6.07L12 16.81l-5.44 2.86 1.04-6.07-4.41-4.3 6.09-.88L12 2.9Z"></path></svg>' +
    '</button>';
}


function renderPhoneCallItems(box, rows, emptyTitle, emptyText){
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = '<div class="phone-empty"><div class="phone-empty-icon">电</div><strong>' + escapeHTML(emptyTitle || '暂无通话记录') + '</strong><span>' + escapeHTML(emptyText || '') + '</span></div>';
    return;
  }
  box.innerHTML = rows.map(function(record){
    var count = Number(record.messageCount || getVoiceCallMessages(record.name, record.sessionId).length || 0);
    var meta = (count ? count + ' 段对话 · ' : '') + formatPhoneCallDuration(record.durationMs);
    return '<div class="phone-call-item" data-phone-call-session="' + escapeHTML(record.sessionId) + '" role="button" tabindex="0">' +
      phoneCallAvatarHTML(record.name) +
      '<div class="phone-call-copy">' +
        '<div class="phone-call-top"><strong>' + escapeHTML(record.name || '未知联系人') + '</strong></div>' +
        '<div class="phone-call-preview">' + escapeHTML(record.preview || '语音通话') + '</div>' +
        '<div class="phone-call-meta">' + escapeHTML(meta) + '</div>' +
      '</div>' +
      '<div class="phone-call-side">' +
        '<div class="phone-call-side-actions"><span class="phone-call-time">' + escapeHTML(formatPhoneCallTime(record.updatedAt || record.startedAt)) + '</span>' + phoneStarHTML(record) + '<span class="phone-call-chevron" aria-hidden="true">›</span></div>' +
      '</div>' +
    '</div>';
  }).join('');
}


function getPhoneContactNames(){
  var names = {};
  function add(name){ name = String(name || '').trim(); if (name) names[name] = true; }
  CONTACTS.forEach(function(c){ add(c && c.name); });
  (Array.isArray(State.personas) ? State.personas : []).forEach(function(p){ add(p && p.name); });
  CHATS.forEach(function(c){ add(c && c.name); });
  (State.phoneCalls || []).forEach(function(c){ add(c && c.name); });
  return Object.keys(names).sort(compareContactNames);
}


function getPhoneContactCallRows(name){
  name = String(name || '');
  return phoneSortedCalls(function(record){ return String(record && record.name || '') === name; });
}


function renderPhoneRecentList(){
  var rows = phoneRecentSelectionVisibleRows();
  if (!phoneRecentManageMode) {
    renderPhoneCallItems(phoneRecentList, rows, '暂无语音通话记录', '从聊天中发起一次语音通话后，这里会自动出现记录。');
    return;
  }
  if (!phoneRecentList) return;
  if (!rows.length) {
    phoneRecentList.innerHTML = '<div class="phone-empty"><div class="phone-empty-icon">电</div><strong>暂无匹配通话</strong><span>切换 char 筛选条件，或退出选择模式查看全部记录。</span></div>';
    updatePhoneRecentSelectionUI();
    return;
  }
  phoneRecentList.innerHTML = rows.map(function(record){
    var count = Number(record.messageCount || getVoiceCallMessages(record.name, record.sessionId).length || 0);
    var meta = (count ? count + ' 段对话 · ' : '') + formatPhoneCallDuration(record.durationMs);
    var sessionId = String(record.sessionId || '');
    var selected = !!phoneRecentSelectedSessions[sessionId];
    return '<div class="phone-call-item phone-call-item-selectable ' + (selected ? 'is-selected' : '') + '" data-phone-call-session="' + escapeHTML(sessionId) + '" role="button" tabindex="0" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
      '<label class="phone-call-select" aria-label="选择与 ' + escapeHTML(record.name || '未知联系人') + ' 的通话"><input type="checkbox" data-phone-call-select="' + escapeHTML(sessionId) + '" ' + (selected ? 'checked' : '') + '><span aria-hidden="true"></span></label>' +
      phoneCallAvatarHTML(record.name) +
      '<div class="phone-call-copy">' +
        '<div class="phone-call-top"><strong>' + escapeHTML(record.name || '未知联系人') + '</strong></div>' +
        '<div class="phone-call-preview">' + escapeHTML(record.preview || '语音通话') + '</div>' +
        '<div class="phone-call-meta">' + escapeHTML(meta) + '</div>' +
      '</div>' +
      '<div class="phone-call-side">' +
        '<div class="phone-call-side-actions"><span class="phone-call-time">' + escapeHTML(formatPhoneCallTime(record.updatedAt || record.startedAt)) + '</span><span class="phone-call-chevron" aria-hidden="true">›</span></div>' +
      '</div>' +
    '</div>';
  }).join('');
  updatePhoneRecentSelectionUI();
}


function renderPhoneFavoriteList(){
  renderPhoneCallItems(phoneFavoriteList, phoneSortedCalls(function(record){ return !!record.favorite; }), '暂无收藏通话', '点击通话右侧的星标，即可把这条通话加入收藏。');
}


function renderPhoneContactList(){
  if (!phoneContactList) return;
  var names = getPhoneContactNames();
  if (!names.length) {
    phoneContactList.innerHTML = '<div class="phone-empty"><div class="phone-empty-icon">人</div><strong>暂无联系人</strong><span>创建 char 后，这里会显示每个 char 的独立通话记录页。</span></div>';
    return;
  }
  var groups = {};
  names.forEach(function(name){
    var letter = getContactInitial(name);
    (groups[letter] = groups[letter] || []).push(name);
  });
  var html = '';
  Object.keys(groups).sort(function(a,b){ return contactInitialRank(a) - contactInitialRank(b); }).forEach(function(letter){
    groups[letter].sort(compareContactNames);
    html += '<div class="group-letter phone-group-letter">' + escapeHTML(letter) + '</div>';
    groups[letter].forEach(function(name){
      var count = getPhoneContactCallRows(name).length;
      html += '<button type="button" class="phone-contact-item" data-phone-contact-name="' + escapeHTML(name) + '">' +
        phoneCallAvatarHTML(name, 'phone-contact-avatar') +
        '<span class="phone-contact-copy"><strong class="phone-contact-name">' + escapeHTML(name) + '</strong><span class="phone-contact-meta">' + count + ' 条通话记录 · 查看全部</span></span>' +
        '<span class="phone-contact-arrow">›</span></button>';
    });
  });
  phoneContactList.innerHTML = html;
}


function renderPhoneContactDetail(name){
  if (!phoneContactCallList) return;
  name = String(name || '');
  phoneCurrentContactName = name;
  if (phoneContactDetailTitle) phoneContactDetailTitle.textContent = name || '联系人';
  var rows = getPhoneContactCallRows(name);
  renderPhoneCallItems(phoneContactCallList, rows, '暂无通话记录', '这个 char 还没有语音通话记录。');
}


function renderPhoneCallDetail(sessionId){
  if (!phoneDetailScroll) return;
  var record = phoneCallBySessionId(sessionId);
  if (!record) {
    phoneDetailTitle.textContent = '通话';
    if (phoneDetailFavorite) phoneDetailFavorite.classList.remove('is-favorite');
    phoneDetailScroll.innerHTML = '<div class="phone-empty"><strong>找不到这条通话</strong></div>';
    return;
  }
  var rows = getVoiceCallMessages(record.name, sessionId);
  phoneDetailTitle.textContent = record.name || '通话';
  if (phoneDetailFavorite) {
    phoneDetailFavorite.classList.toggle('is-favorite', !!record.favorite);
    phoneDetailFavorite.setAttribute('aria-label', record.favorite ? '取消收藏' : '收藏通话');
    phoneDetailFavorite.setAttribute('title', record.favorite ? '取消收藏' : '收藏通话');
    phoneDetailFavorite.dataset.phoneCallFavorite = record.sessionId;
  }
  if (!rows.length) {
    phoneDetailScroll.innerHTML = '<div class="phone-empty"><strong>这通电话没有可显示的文字记录</strong><span>可能只建立了通话连接，还没有产生对话内容。</span></div>';
    return;
  }
  var persona = getActiveUserPersona();
  var userAvatar = persona && persona.avatar ? persona.avatar : '';
  var callName = String(record.name || '对方');
  phoneDetailScroll.innerHTML = rows.map(function(msg){
    var isMe = msg.from === 'me';
    var avatar = isMe ? userAvatar : getAvatar(callName);
    var initial = isMe ? String(persona && persona.name || '我').charAt(0) : callName.charAt(0);
    return '<div class="pm-voice-call-turn ' + (isMe ? 'is-me' : 'is-char') + '">' +
      (!isMe ? '<div class="pm-voice-call-turn-avatar">' + (avatar ? '<img src="' + escapeHTML(avatar) + '" alt="">' : escapeHTML(initial || '?')) + '</div>' : '') +
      '<div class="pm-voice-call-turn-copy">' +
        '<div class="pm-voice-call-turn-bubble">' + escapeHTML(String(msg.text || '')) + '</div>' +
      '</div>' +
      (isMe ? '<div class="pm-voice-call-turn-avatar">' + (avatar ? '<img src="' + escapeHTML(avatar) + '" alt="">' : escapeHTML(initial || '?')) + '</div>' : '') +
    '</div>';
  }).join('');
  requestAnimationFrame(function(){ phoneDetailScroll.scrollTop = phoneDetailScroll.scrollHeight; });
}


function renderPhoneLists(){
  if (phoneRecentManageMode) populatePhoneRecentCharFilter();
  renderPhoneRecentList();
  renderPhoneFavoriteList();
  renderPhoneContactList();
  if (phoneCurrentContactName && phoneApp && phoneApp.querySelector('[data-phone-panel="contact-detail"].is-active')) {
    renderPhoneContactDetail(phoneCurrentContactName);
  }
  if (phoneDetailTitle && phoneDetailTitle.textContent && phoneApp && phoneApp.querySelector('[data-phone-panel="call-detail"].is-active')) {
    var sid = phoneDetailFavorite && phoneDetailFavorite.dataset.phoneCallFavorite;
    if (sid) renderPhoneCallDetail(sid);
  }
}


function setPhonePanel(panelName){
  if (!phoneApp) return;
  phoneCurrentPanel = String(panelName || 'recent');
  phoneApp.querySelectorAll('[data-phone-panel]').forEach(function(panel){
    panel.classList.toggle('is-active', panel.dataset.phonePanel === phoneCurrentPanel);
  });
  if (phoneBottomNav) {
    var mainPhonePanel = phoneCurrentPanel === 'recent' || phoneCurrentPanel === 'contacts' || phoneCurrentPanel === 'favorites';
    phoneBottomNav.classList.toggle('is-hidden', !mainPhonePanel);
    phoneBottomNav.querySelectorAll('[data-phone-tab]').forEach(function(tab){
      tab.classList.toggle('is-active', mainPhonePanel && tab.dataset.phoneTab === phoneCurrentPanel);
    });
  }
  if (phoneCurrentPanel === 'recent') renderPhoneRecentList();
  if (phoneCurrentPanel === 'contacts') renderPhoneContactList();
  if (phoneCurrentPanel === 'favorites') renderPhoneFavoriteList();
}


function openPhoneApp(){
  if (!phoneApp) return;
  if (typeof closeWorldbookApp === 'function') closeWorldbookApp();
  if (typeof closeSettingsApp === 'function') closeSettingsApp();
  if (typeof closeChatApp === 'function') closeChatApp();
  renderPhoneLists();
  phoneCurrentContactName = '';
  setPhonePanel('recent');
  phoneApp.classList.add('is-open');
  phoneApp.setAttribute('aria-hidden','false');
}


function closePhoneDetail(){
  setPhonePanel(phoneDetailReturnPanel || 'recent');
}


function closePhoneContactDetail(){
  setPhonePanel('contacts');
}


function closePhoneApp(){
  if (!phoneApp) return;
  phoneApp.classList.remove('is-open');
  phoneApp.setAttribute('aria-hidden','true');
  setPhoneRecentSelectionMode(false);
  setPhonePanel('recent');
  phoneCurrentContactName = '';
}


function openPhoneCallDetail(sessionId){
  if (!phoneApp) return;
  phoneDetailReturnPanel = phoneCurrentPanel === 'contact-detail' ? 'contact-detail' : (phoneCurrentPanel || 'recent');
  renderPhoneCallDetail(sessionId);
  phoneCurrentPanel = 'call-detail';
  phoneApp.querySelectorAll('[data-phone-panel]').forEach(function(panel){
    panel.classList.toggle('is-active', panel.dataset.phonePanel === 'call-detail');
  });
  if (phoneBottomNav) phoneBottomNav.querySelectorAll('[data-phone-tab]').forEach(function(tab){ tab.classList.remove('is-active'); });
}


function togglePhoneCallFavorite(sessionId){
  var record = phoneCallBySessionId(sessionId);
  if (!record) return;
  record.favorite = !record.favorite;
  record.updatedAt = Math.max(Number(record.updatedAt || 0), Number(record.endedAt || record.startedAt || Date.now()));
  savePhoneCalls();
  renderPhoneLists();
  if (phoneCurrentPanel === 'call-detail') renderPhoneCallDetail(sessionId);
  toast(record.favorite ? '已收藏这条通话' : '已取消收藏');
}

function bindPhoneEvents(){

  if (phoneBack) phoneBack.addEventListener('click', closePhoneApp);
  if (phoneContactsBack) phoneContactsBack.addEventListener('click', closePhoneApp);
  if (phoneFavoritesBack) phoneFavoritesBack.addEventListener('click', closePhoneApp);
  if (phoneContactDetailBack) phoneContactDetailBack.addEventListener('click', closePhoneContactDetail);
  if (phoneDetailBack) phoneDetailBack.addEventListener('click', closePhoneDetail);
  if (phoneRecentManage) phoneRecentManage.addEventListener('click', function(){
    setPhoneRecentSelectionMode(!phoneRecentManageMode);
  });
  if (phoneRecentCancel) phoneRecentCancel.addEventListener('click', function(){
    setPhoneRecentSelectionMode(false);
  });
  if (phoneRecentCharFilter) phoneRecentCharFilter.addEventListener('change', function(){
    phoneRecentCharFilterValue = String(phoneRecentCharFilter.value || '');
    renderPhoneRecentList();
  });
  if (phoneRecentSelectAll) phoneRecentSelectAll.addEventListener('click', function(){
    togglePhoneRecentSelectAllVisible();
  });
  if (phoneRecentDelete) phoneRecentDelete.addEventListener('click', function(){
    var selected = getPhoneRecentSelectedSessionIds();
    if (!selected.length) return;
    islandConfirm('确定删除已选择的 ' + selected.length + ' 条通话记录？\n删除后会同时移除对应的完整通话内容，且无法恢复。', {title:'删除通话记录', confirmText:'删除', danger:true}).then(function(ok){
      if (ok) deletePhoneCallSessions(selected);
    });
  });
  if (phoneRecentList) phoneRecentList.addEventListener('click', function(e){
    if (phoneRecentManageMode) {
      var checkbox = e.target.closest('[data-phone-call-select]');
      if (checkbox) {
        e.preventDefault();
        e.stopPropagation();
        togglePhoneRecentSelection(checkbox.dataset.phoneCallSelect || '', checkbox.checked);
        renderPhoneRecentList();
        return;
      }
      var item = e.target.closest('[data-phone-call-session]');
      if (item) {
        e.preventDefault();
        var sessionId = item.dataset.phoneCallSession || '';
        togglePhoneRecentSelection(sessionId);
        renderPhoneRecentList();
        return;
      }
      return;
    }
    var favorite = e.target.closest('[data-phone-call-favorite]');
    if (favorite) { e.preventDefault(); e.stopPropagation(); togglePhoneCallFavorite(favorite.dataset.phoneCallFavorite || ''); return; }
    var item = e.target.closest('[data-phone-call-session]');
    if (item) openPhoneCallDetail(item.dataset.phoneCallSession || '');
  });
  if (phoneRecentList) phoneRecentList.addEventListener('keydown', function(e){
    if (!phoneRecentManageMode || (e.key !== 'Enter' && e.key !== ' ')) return;
    var item = e.target.closest('[data-phone-call-session]');
    if (!item) return;
    e.preventDefault();
    togglePhoneRecentSelection(item.dataset.phoneCallSession || '');
    renderPhoneRecentList();
  });
  if (phoneFavoriteList) phoneFavoriteList.addEventListener('click', function(e){
    var favorite = e.target.closest('[data-phone-call-favorite]');
    if (favorite) { e.preventDefault(); e.stopPropagation(); togglePhoneCallFavorite(favorite.dataset.phoneCallFavorite || ''); return; }
    var item = e.target.closest('[data-phone-call-session]');
    if (item) openPhoneCallDetail(item.dataset.phoneCallSession || '');
  });
  if (phoneContactCallList) phoneContactCallList.addEventListener('click', function(e){
    var favorite = e.target.closest('[data-phone-call-favorite]');
    if (favorite) { e.preventDefault(); e.stopPropagation(); togglePhoneCallFavorite(favorite.dataset.phoneCallFavorite || ''); return; }
    var item = e.target.closest('[data-phone-call-session]');
    if (item) openPhoneCallDetail(item.dataset.phoneCallSession || '');
  });
  if (phoneContactList) phoneContactList.addEventListener('click', function(e){
    var item = e.target.closest('[data-phone-contact-name]');
    if (!item) return;
    var name = item.dataset.phoneContactName || '';
    phoneCurrentContactName = name;
    renderPhoneContactDetail(name);
    setPhonePanel('contact-detail');
  });
  if (phoneBottomNav) phoneBottomNav.addEventListener('click', function(e){
    var tab = e.target.closest('[data-phone-tab]');
    if (!tab) return;
    setPhonePanel(tab.dataset.phoneTab || 'recent');
  });
  if (phoneDetailFavorite) phoneDetailFavorite.addEventListener('click', function(){
    var sid = phoneDetailFavorite.dataset.phoneCallFavorite || '';
    if (sid) togglePhoneCallFavorite(sid);
  });
}

registerApp('电话', function(){ openPhoneApp(); });
