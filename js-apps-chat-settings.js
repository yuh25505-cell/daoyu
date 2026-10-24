/* 岛屿 · 私聊设置 / 聊天记录查找
 * 本地会话元数据保存在对应 CHATS 项的 sessionSettings 中，不改写 Char 卡或用户角色卡。 */
'use strict';

var pmChatSettingsView = $('pmChatSettingsView');
var pmChatRecordSearchView = $('pmChatRecordSearchView');
var pmChatRecordSearchTimer = 0;
var pmChatRecordCategoryValue = 'all';

function getSessionChat(name, create){
  name = String(name || currentName || '').trim();
  if (!name) return null;
  var chat = findChatByName(name);
  if (!chat && create) {
    chat = { name:name, preview:'', time:'', unread:0, avatar:getAvatar(name) };
    CHATS.push(chat);
  }
  if (chat && (!chat.sessionSettings || typeof chat.sessionSettings !== 'object' || Array.isArray(chat.sessionSettings))) {
    chat.sessionSettings = {};
  }
  return chat || null;
}

function getSessionChatSettings(name, create){
  var chat = getSessionChat(name, create);
  if (!chat) return {};
  if (!chat.sessionSettings || typeof chat.sessionSettings !== 'object') chat.sessionSettings = {};
  return chat.sessionSettings;
}

function getSessionCharDisplayName(name){
  name = String(name || currentName || '角色');
  var settings = getSessionChatSettings(name, false);
  return String(settings.charRemark || '').trim() || name;
}

function getSessionCharAvatar(name){
  var settings = getSessionChatSettings(name, false);
  var chat = getSessionChat(name, false);
  return settings.charAvatar || getAvatar(name) || (chat && chat.avatar) || null;
}

function getSessionUserAvatar(name){
  var settings = getSessionChatSettings(name, false);
  if (settings.userAvatar) return settings.userAvatar;
  var user = getActiveUserPersona();
  return user && user.avatar ? user.avatar : null;
}

function persistSessionChat(name, rerenderList){
  try { saveChats(); } catch (e) { console.warn('[岛屿] 保存会话设置失败', e); }
  if (rerenderList !== false) {
    if (typeof renderChats === 'function') renderChats();
    if (typeof renderContacts === 'function') renderContacts();
  }
}

function applySessionWallpaper(name){
  var view = $('pmView');
  if (!view) return;
  var settings = getSessionChatSettings(name || currentName, false);
  if (settings.wallpaper) {
    view.classList.add('session-has-wallpaper');
    view.style.setProperty('--pm-session-wallpaper', 'url("' + cachedImageSrc(settings.wallpaper).replace(/["\\]/g, '') + '")');
  } else {
    view.classList.remove('session-has-wallpaper');
    view.style.removeProperty('--pm-session-wallpaper');
  }
}

function applySessionChatIdentity(name){
  if (!name) return;
  var settings = getSessionChatSettings(name, false);
  currentAvatar = settings.charAvatar || getAvatar(name) || null;
  if (pmTitle) pmTitle.textContent = String(settings.charRemark || '').trim() || name;
  applySessionWallpaper(name);
}

function openPMChatSettings(){
  if (!currentName || !pmChatSettingsView) return;
  getSessionChat(currentName, true);
  closeChatRecordSearch();
  updatePMChatSettingsUI();
  pmChatSettingsView.classList.add('is-open');
  pmChatSettingsView.setAttribute('aria-hidden', 'false');
}

function closePMChatSettings(){
  if (!pmChatSettingsView) return;
  pmChatSettingsView.classList.remove('is-open');
  pmChatSettingsView.setAttribute('aria-hidden', 'true');
}

function openChatRecordSearch(){
  if (!currentName || !pmChatRecordSearchView) return;
  closePMChatSettings();
  pmChatRecordCategoryValue = 'all';
  var search = $('pmChatRecordSearchInput');
  var date = $('pmChatRecordSearchDate');
  if (search) search.value = '';
  if (date) date.value = '';
  $$('#pmChatRecordCategories [data-record-category]').forEach(function(btn){
    var active = btn.dataset.recordCategory === 'all';
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  updateChatRecordDateVisibility();
  renderChatRecordSearchResults();
  pmChatRecordSearchView.classList.add('is-open');
  pmChatRecordSearchView.setAttribute('aria-hidden', 'false');
  setTimeout(function(){ if (search) { try { search.focus({preventScroll:true}); } catch(e) { search.focus(); } } }, 40);
}

function closeChatRecordSearch(){
  if (!pmChatRecordSearchView) return;
  pmChatRecordSearchView.classList.remove('is-open');
  pmChatRecordSearchView.setAttribute('aria-hidden', 'true');
}

function renderSessionAvatarPreview(el, image, fallback){
  if (!el) return;
  el.innerHTML = image ? '<img alt="" src="' + String(image).replace(/"/g, '&quot;') + '">' : escapeHTML(String(fallback || '?').slice(0, 1));
}

function updatePMChatSettingsUI(){
  if (!currentName) return;
  var settings = getSessionChatSettings(currentName, true);
  var user = getActiveUserPersona() || {};
  var charName = $('pmSettingsCharName');
  var userName = $('pmSettingsUserName');
  var remark = $('pmSettingsCharRemark');
  var charAvatar = $('pmSettingsCharAvatarPreview');
  var userAvatar = $('pmSettingsUserAvatarPreview');
  var dnd = $('pmSettingsDoNotDisturb');
  var wallpaperPreview = $('pmSettingsWallpaperPreview');
  if (charName) charName.textContent = getSessionCharDisplayName(currentName);
  if (userName) userName.textContent = user.name || user.socialId || '我';
  if (remark && document.activeElement !== remark) remark.value = settings.charRemark || '';
  renderSessionAvatarPreview(charAvatar, settings.charAvatar || getAvatar(currentName), getSessionCharDisplayName(currentName));
  renderSessionAvatarPreview(userAvatar, settings.userAvatar || user.avatar, user.name || user.socialId || '我');
  if (dnd) {
    dnd.classList.toggle('is-on', !!settings.doNotDisturb);
    dnd.setAttribute('aria-checked', settings.doNotDisturb ? 'true' : 'false');
  }
  if (wallpaperPreview) {
    if (settings.wallpaper) {
      wallpaperPreview.classList.add('has-image');
      wallpaperPreview.style.backgroundImage = 'url("' + String(settings.wallpaper).replace(/["\\]/g, '') + '")';
      wallpaperPreview.textContent = '';
    } else {
      wallpaperPreview.classList.remove('has-image');
      wallpaperPreview.style.backgroundImage = '';
      wallpaperPreview.textContent = '未设置背景图';
    }
  }
  if (window.IslandSounds && typeof IslandSounds.renderSessionSettings === 'function') IslandSounds.renderSessionSettings(currentName);
}

function readSessionImage(file, callback){
  if (!file) return;
  if (!/^image\//i.test(file.type || '')) { toast('请选择图片文件'); return; }
  if (file.size > 4 * 1024 * 1024) { toast('图片请控制在 4MB 以内'); return; }
  var reader = new FileReader();
  reader.onload = function(e){
    var value = String(e.target && e.target.result || '');
    if (!/^data:image\//i.test(value)) { toast('图片读取失败'); return; }
    callback(value);
  };
  reader.onerror = function(){ toast('图片读取失败'); };
  reader.readAsDataURL(file);
}

function updateSessionAvatar(kind, value){
  if (!currentName) return;
  var settings = getSessionChatSettings(currentName, true);
  if (kind === 'char') {
    if (value) settings.charAvatar = value; else delete settings.charAvatar;
    currentAvatar = settings.charAvatar || getAvatar(currentName) || null;
  } else {
    if (value) settings.userAvatar = value; else delete settings.userAvatar;
  }
  persistSessionChat(currentName, true);
  updatePMChatSettingsUI();
  if (typeof renderMessages === 'function') renderMessages(false);
  toast(kind === 'char' ? '已更新当前会话的 Char 头像' : '已更新当前会话的 user 头像');
}

function selectSessionWallpaper(){
  var input = $('pmSettingsWallpaperInput');
  if (input) { input.value = ''; input.click(); }
}

function updateChatRecordDateVisibility(){
  var row = $('pmChatRecordDateRow');
  if (row) row.hidden = pmChatRecordCategoryValue !== 'date';
}

function messageSearchContent(msg){
  if (!msg) return '';
  var fields = ['text','transcript','aiTranscript','recognizedText','fileName','name','url','link','href','description','imageText','note','locationName','address','recordTitle','title','mimeType','mime','fileType','audioName'];
  var values = [];
  fields.forEach(function(key){ if (msg[key] != null && typeof msg[key] !== 'object') values.push(String(msg[key])); });
  if (msg.amount != null) values.push(String(msg.amount));
  if (msg.file && typeof msg.file === 'object') {
    ['name','type','mimeType','url'].forEach(function(key){ if (msg.file[key]) values.push(String(msg.file[key])); });
  }
  if (Array.isArray(msg.recordMessages)) msg.recordMessages.forEach(function(item){ values.push(String(item && (item.text || item.author) || '')); });
  return values.join(' ').toLowerCase();
}

function messageSearchMatchesCategory(msg, category, selectedDate){
  var type = String(msg && (msg.type || msg.kind) || '').toLowerCase();
  var content = messageSearchContent(msg);
  var urlPattern = /(?:https?:\/\/|www\.)[^\s]+/i;
  if (category === 'date') {
    if (!selectedDate) return true;
    var ts = chatMessageCreatedAt(msg);
    if (!ts) return false;
    var d = new Date(ts);
    var local = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    return local === selectedDate;
  }
  if (category === 'image') return type === 'image' || type === 'photo';
  if (category === 'file') return type === 'file' || type === 'document';
  if (category === 'link') return type === 'link' || urlPattern.test(content);
  if (category === 'audio') return type === 'voice' || type === 'audio' || type === 'music' || (type === 'file' && /\.(?:mp3|wav|m4a|aac|ogg|opus|flac|wma|webm)(?:$|[?#\s])/i.test(content)) || /audio\//i.test(content);
  if (category === 'transfer') return type === 'transfer' || type === 'transaction';
  if (category === 'location') return type === 'location' || type === 'map';
  if (category === 'sticker') return type === 'sticker' || type === 'emoji' || type === 'emoticon';
  return true;
}

function messageSearchLabel(msg){
  var type = String(msg && (msg.type || msg.kind) || '').toLowerCase();
  if (type === 'image' || type === 'photo') return '图片';
  if (type === 'file' || type === 'document') return '文件';
  if (type === 'voice' || type === 'audio' || type === 'music') return '音乐与音频';
  if (type === 'transfer' || type === 'transaction') return '交易';
  if (type === 'location' || type === 'map') return '位置';
  if (type === 'sticker' || type === 'emoji' || type === 'emoticon') return '表情包';
  if (type === 'chat_record') return '聊天记录';
  return /(?:https?:\/\/|www\.)[^\s]+/i.test(messageSearchContent(msg)) ? '链接' : '文字';
}

function messageSearchSnippet(msg){
  var type = String(msg && (msg.type || msg.kind) || '').toLowerCase();
  var content = String(msg && (msg.text || msg.transcript || msg.aiTranscript || msg.fileName || msg.name || msg.description || msg.note || msg.locationName || msg.recordTitle) || '').replace(/\s+/g, ' ').trim();
  if (!content) {
    if (type === 'image' || type === 'photo') content = '图片消息';
    else if (type === 'file' || type === 'document') content = '文件：' + String(msg.fileName || msg.name || '未命名文件');
    else if (type === 'voice' || type === 'audio' || type === 'music') content = '语音 / 音频消息';
    else if (type === 'transfer' || type === 'transaction') content = '交易消息 ' + (msg.amount != null ? String(msg.amount) : '');
    else if (type === 'location' || type === 'map') content = String(msg.locationName || msg.address || '位置消息');
    else if (type === 'sticker' || type === 'emoji' || type === 'emoticon') content = '表情包消息';
    else content = '消息';
  }
  return content.length > 120 ? content.slice(0, 120) + '…' : content;
}

function messageSearchDateLabel(msg){
  var ts = chatMessageCreatedAt(msg);
  if (!ts) return '无日期';
  var d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function renderChatRecordSearchResults(){
  var box = $('pmChatRecordSearchResults');
  var count = $('pmChatRecordSearchCount');
  if (!box || !currentName) return;
  var query = String(($('pmChatRecordSearchInput') || {}).value || '').trim().toLowerCase();
  var selectedDate = String(($('pmChatRecordSearchDate') || {}).value || '');
  var list = Array.isArray(MESSAGES[currentName]) ? MESSAGES[currentName] : [];
  var rows = [];
  for (var i = 0; i < list.length; i++) {
    var msg = list[i];
    if (!msg || msg.type === 'voice_call' || msg.type === 'voice_call_event') continue;
    if (!messageSearchMatchesCategory(msg, pmChatRecordCategoryValue, selectedDate)) continue;
    if (query && messageSearchContent(msg).indexOf(query) < 0) continue;
    rows.push({ message:msg, index:i });
  }
  rows.sort(function(a,b){ return (chatMessageCreatedAt(b.message) - chatMessageCreatedAt(a.message)) || (b.index - a.index); });
  if (count) count.textContent = rows.length + ' 条记录';
  if (!rows.length) {
    box.innerHTML = '<div class="pm-chat-record-empty">没有找到匹配的聊天记录</div>';
    return;
  }
  box.innerHTML = rows.map(function(row){
    var msg = row.message;
    var sentBy = msg.from === 'them' ? getSessionCharDisplayName(currentName) : String((getActiveUserPersona() || {}).name || (getActiveUserPersona() || {}).socialId || '我');
    return '<button type="button" class="pm-chat-record-result" data-record-message-index="' + row.index + '">' +
      '<span class="pm-chat-record-result-top"><strong>' + escapeHTML(sentBy) + '</strong><span>' + escapeHTML(messageSearchDateLabel(msg)) + '</span></span>' +
      '<span class="pm-chat-record-result-type">' + escapeHTML(messageSearchLabel(msg)) + '</span>' +
      '<span class="pm-chat-record-result-text">' + escapeHTML(messageSearchSnippet(msg)) + '</span>' +
      '</button>';
  }).join('');
}

function jumpToChatRecord(index){
  closeChatRecordSearch();
  closePMChatSettings();
  window.setTimeout(function(){
    if (!pmScroll) return;
    if (typeof ensureMessageRendered === 'function') ensureMessageRendered(index);
    var row = pmScroll.querySelector('[data-message-index="' + Number(index) + '"]');
    if (!row) { toast('这条记录暂时无法定位'); return; }
    try { row.scrollIntoView({ behavior:'smooth', block:'center' }); } catch(e) { row.scrollIntoView(); }
    row.classList.add('pm-chat-record-highlight');
    window.setTimeout(function(){ row.classList.remove('pm-chat-record-highlight'); }, 1800);
  }, 60);
}

function clearCurrentChatRecords(){
  if (!currentName) return;
  var name = currentName;
  islandConfirm('清空后将删除与「' + getSessionCharDisplayName(name) + '」的全部聊天消息，且无法恢复。当前会话的头像、备注、背景等设置会保留。', {
    title:'清空聊天记录', confirmText:'清空', danger:true
  }).then(function(ok){
    if (!ok || currentName !== name) return;
    MESSAGES[name] = [];
    var chat = getSessionChat(name, true);
    if (chat) { chat.preview = ''; chat.time = ''; chat.lastTs = 0; chat.unread = 0; chat.markedUnread = false; }
    try { saveMessages(name); } catch(e) {}
    persistSessionChat(name, true);
    if (typeof renderMessages === 'function') renderMessages(false);
    if (pmScroll) pmScroll.scrollTop = 0;
    updatePMChatSettingsUI();
    toast('已清空聊天记录');
  });
}

function bindPMChatSettingsEvents(){
  var settingsBack = $('pmChatSettingsBack');
  var searchBack = $('pmChatRecordSearchBack');
  var remark = $('pmSettingsCharRemark');
  var charAvatarBtn = $('pmSettingsCharAvatarBtn');
  var userAvatarBtn = $('pmSettingsUserAvatarBtn');
  var charAvatarInput = $('pmSettingsCharAvatarInput');
  var userAvatarInput = $('pmSettingsUserAvatarInput');
  var charAvatarClear = $('pmSettingsCharAvatarClear');
  var userAvatarClear = $('pmSettingsUserAvatarClear');
  var wallpaperInput = $('pmSettingsWallpaperInput');
  var sessionToneImportBtn = $('pmSettingsMessageToneImportBtn');
  var sessionTonePreviewBtn = $('pmSettingsMessageTonePreviewBtn');
  var sessionToneResetBtn = $('pmSettingsMessageToneResetBtn');
  var sessionToneFileInput = $('pmSettingsMessageToneFileInput');

  if (settingsBack) settingsBack.addEventListener('click', closePMChatSettings);
  if (searchBack) searchBack.addEventListener('click', function(){ closeChatRecordSearch(); openPMChatSettings(); });
  var openSearch = $('pmChatRecordSearchOpen');
  if (openSearch) openSearch.addEventListener('click', openChatRecordSearch);

  if (charAvatarBtn && charAvatarInput) charAvatarBtn.addEventListener('click', function(){ charAvatarInput.click(); });
  if (userAvatarBtn && userAvatarInput) userAvatarBtn.addEventListener('click', function(){ userAvatarInput.click(); });
  if (charAvatarInput) charAvatarInput.addEventListener('change', function(){
    var file = charAvatarInput.files && charAvatarInput.files[0];
    readSessionImage(file, function(data){ updateSessionAvatar('char', data); });
    charAvatarInput.value = '';
  });
  if (userAvatarInput) userAvatarInput.addEventListener('change', function(){
    var file = userAvatarInput.files && userAvatarInput.files[0];
    readSessionImage(file, function(data){ updateSessionAvatar('user', data); });
    userAvatarInput.value = '';
  });
  if (charAvatarClear) charAvatarClear.addEventListener('click', function(){ updateSessionAvatar('char', null); });
  if (userAvatarClear) userAvatarClear.addEventListener('click', function(){ updateSessionAvatar('user', null); });

  if (remark) {
    remark.addEventListener('input', function(){
      if (!currentName) return;
      var settings = getSessionChatSettings(currentName, true);
      settings.charRemark = remark.value.trim().slice(0, 40);
      if (pmTitle) pmTitle.textContent = settings.charRemark || currentName;
      if (pmSettingsCharName) pmSettingsCharName.textContent = settings.charRemark || currentName;
      var avatar = $('pmSettingsCharAvatarPreview');
      if (avatar && !settings.charAvatar && !getAvatar(currentName)) avatar.textContent = (settings.charRemark || currentName).slice(0,1);
      clearTimeout(pmChatRecordSearchTimer);
      pmChatRecordSearchTimer = setTimeout(function(){
        persistSessionChat(currentName, true);
        /* 备注变化后刷新消息列表（引用框里的 char 名、无头像时的首字），并保持当前滚动位置。 */
        if (pmScroll && typeof renderMessages === 'function') { var keepTop = pmScroll.scrollTop; renderMessages(); pmScroll.scrollTop = keepTop; }
      }, 220);
    });
    remark.addEventListener('change', function(){ if (currentName) persistSessionChat(currentName, true); });
  }

  var dnd = $('pmSettingsDoNotDisturb');
  if (dnd) dnd.addEventListener('click', function(){
    if (!currentName) return;
    var settings = getSessionChatSettings(currentName, true);
    settings.doNotDisturb = !settings.doNotDisturb;
    persistSessionChat(currentName, false);
    updatePMChatSettingsUI();
    toast(settings.doNotDisturb ? '已开启当前会话免打扰' : '已关闭当前会话免打扰');
  });

  var wallpaperChoose = $('pmSettingsWallpaperChoose');
  var wallpaperClear = $('pmSettingsWallpaperClear');
  if (wallpaperChoose) wallpaperChoose.addEventListener('click', selectSessionWallpaper);
  if (wallpaperInput) wallpaperInput.addEventListener('change', function(){
    var file = wallpaperInput.files && wallpaperInput.files[0];
    readSessionImage(file, function(data){
      if (!currentName) return;
      getSessionChatSettings(currentName, true).wallpaper = data;
      persistSessionChat(currentName, false);
      applySessionWallpaper(currentName);
      updatePMChatSettingsUI();
      toast('已设置当前聊天背景');
    });
    wallpaperInput.value = '';
  });
  if (wallpaperClear) wallpaperClear.addEventListener('click', function(){
    if (!currentName) return;
    delete getSessionChatSettings(currentName, true).wallpaper;
    persistSessionChat(currentName, false);
    applySessionWallpaper(currentName);
    updatePMChatSettingsUI();
    toast('已恢复默认聊天背景');
  });
  var clearRecords = $('pmSettingsClearRecords');
  if (clearRecords) clearRecords.addEventListener('click', clearCurrentChatRecords);

  if (sessionToneImportBtn && sessionToneFileInput) {
    sessionToneImportBtn.addEventListener('click', function(){
      sessionToneFileInput.value = '';
      sessionToneFileInput.click();
    });
    sessionToneFileInput.addEventListener('change', function(){
      var file = sessionToneFileInput.files && sessionToneFileInput.files[0];
      var name = currentName;
      sessionToneFileInput.value = '';
      if (!file || !name || !window.IslandSounds || typeof IslandSounds.importSessionMessageTone !== 'function') return;
      sessionToneImportBtn.dataset.busy = 'true';
      sessionToneImportBtn.disabled = true;
      IslandSounds.importSessionMessageTone(name, file).then(function(){
        if (currentName === name) updatePMChatSettingsUI();
      }).finally(function(){
        delete sessionToneImportBtn.dataset.busy;
        if (currentName) IslandSounds.renderSessionSettings(currentName);
        else sessionToneImportBtn.disabled = false;
      });
    });
  }
  if (sessionTonePreviewBtn) sessionTonePreviewBtn.addEventListener('click', function(){
    if (currentName && window.IslandSounds && typeof IslandSounds.previewSessionMessageTone === 'function') IslandSounds.previewSessionMessageTone(currentName);
  });
  if (sessionToneResetBtn) sessionToneResetBtn.addEventListener('click', function(){
    var name = currentName;
    if (!name || !window.IslandSounds || typeof IslandSounds.clearSessionMessageTone !== 'function') return;
    sessionToneResetBtn.dataset.busy = 'true';
    sessionToneResetBtn.disabled = true;
    IslandSounds.clearSessionMessageTone(name).then(function(){
      if (currentName === name) updatePMChatSettingsUI();
    }).finally(function(){
      delete sessionToneResetBtn.dataset.busy;
      if (currentName) IslandSounds.renderSessionSettings(currentName);
      else sessionToneResetBtn.disabled = false;
    });
  });

  var searchInput = $('pmChatRecordSearchInput');
  var dateInput = $('pmChatRecordSearchDate');
  if (searchInput) searchInput.addEventListener('input', renderChatRecordSearchResults);
  var searchClear = $('pmChatRecordSearchClear');
  if (searchClear && searchInput) searchClear.addEventListener('click', function(){ searchInput.value = ''; renderChatRecordSearchResults(); searchInput.focus(); });
  if (dateInput) dateInput.addEventListener('change', renderChatRecordSearchResults);
  var categories = $('pmChatRecordCategories');
  if (categories) categories.addEventListener('click', function(e){
    var btn = e.target.closest('[data-record-category]');
    if (!btn) return;
    pmChatRecordCategoryValue = btn.dataset.recordCategory || 'all';
    $$('#pmChatRecordCategories [data-record-category]').forEach(function(item){
      var active = item === btn;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updateChatRecordDateVisibility();
    renderChatRecordSearchResults();
  });
  var results = $('pmChatRecordSearchResults');
  if (results) results.addEventListener('click', function(e){
    var item = e.target.closest('[data-record-message-index]');
    if (item) jumpToChatRecord(Number(item.dataset.recordMessageIndex));
  });
  if (pmChatSettingsView) pmChatSettingsView.addEventListener('click', function(e){
    if (e.target === pmChatSettingsView) closePMChatSettings();
  });
}

var pmSettingsCharName = $('pmSettingsCharName');
bindPMChatSettingsEvents();
