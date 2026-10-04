/* 岛屿 · 聊天 · 消息操作（引用 / 转发 / 多选 / 复制 / 翻译 / 删除）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function getAvatar(name){
  for (var i = 0; i < CHATS.length; i++) if (CHATS[i].name === name) return CHATS[i].avatar;
  for (var j = 0; j < CONTACTS.length; j++) if (CONTACTS[j].name === name) return CONTACTS[j].avatar;
  return null;
}


function selectedMessageCount(){
  return Object.keys(selectedMessageIndices).filter(function(index){ return selectedMessageIndices[index]; }).length;
}

function clearMessageSelection(){
  messageSelectionMode = false;
  selectedMessageIndices = Object.create(null);
  updateMessageSelectionChrome();
}

function buildMessageQuotePayload(name, msg){
  if (!msg) return null;
  var type = String(msg.type || 'text');
  var author = msg.from === 'them' ? (name || '对方') : getActiveUserSocialId();
  var sourceList = MESSAGES[name] || [];
  var sourceIndex = sourceList.indexOf(msg);
  var payload = { id: msg.id || '', sourceIndex: sourceIndex >= 0 ? sourceIndex : -1, from: msg.from === 'them' ? 'them' : 'me', author: author, text: '', type: type, mediaUrl: '' };
  if (type === 'image' && /^(?:data:image\/|https?:\/\/)/i.test(String(msg.url || ''))) {
    payload.kind = 'media';
    payload.mediaUrl = String(msg.url);
    payload.text = '';
  } else if (type === 'sticker' && /^(?:data:image\/|https?:\/\/)/i.test(String(msg.url || ''))) {
    payload.kind = 'media';
    payload.mediaUrl = String(msg.url);
    payload.text = '';
  } else if (type === 'voice') {
    payload.kind = 'label';
    payload.text = '［语音］';
  } else if (type === 'location') {
    payload.kind = 'label';
    payload.text = '［位置］';
  } else if (type === 'transfer') {
    payload.kind = 'label';
    payload.text = '［转账］';
  } else if (type === 'image' && String(msg.description || msg.imageText || '').trim()) {
    payload.kind = 'label';
    payload.text = '［文字图］';
  } else if (type === 'file') {
    payload.kind = 'label';
    payload.text = '［文件］';
  } else if (type === 'chat_record') {
    payload.kind = 'label';
    payload.text = '［聊天记录］';
  } else {
    payload.kind = 'text';
    var text = String(msg.text != null ? msg.text : '').replace(/\s+/g, ' ').trim();
    if (text.length > 100) text = text.slice(0, 100) + '…';
    payload.text = text || '［消息］';
  }
  return payload;
}

function ensureMessageIds(name){
  var list = MESSAGES[name] || [];
  var changed = false;
  list.forEach(function(msg){
    if (msg && !String(msg.id || '').trim()) { msg.id = genId('msg_'); changed = true; }
  });
  return changed;
}

function getMessageQuotePayload(index){
  var list = MESSAGES[currentName] || [], msg = list[Number(index)];
  if (msg) {
    var idsChanged = ensureMessageIds(currentName);
    if (idsChanged) saveMessages(currentName);
  }
  return buildMessageQuotePayload(currentName, msg);
}


function resolveQuotePayloadSourceIndex(replyTo){
  if (!replyTo || !currentName) return -1;
  var list = MESSAGES[currentName] || [];
  var rawIndex = Number(replyTo.sourceIndex);
  if (Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < list.length && list[rawIndex]) return rawIndex;
  var id = String(replyTo.id || '').trim();
  if (id) {
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] && String(list[i].id || '') === id) return i;
    }
  }
  var wantedType = String(replyTo.type || '').toLowerCase();
  var wantedMedia = String(replyTo.mediaUrl || '');
  var wantedText = String(replyTo.text || '').replace(/\s+/g, ' ').trim();
  for (var j = list.length - 1; j >= 0; j--) {
    var msg = list[j];
    if (!msg || (wantedType && String(msg.type || 'text').toLowerCase() !== wantedType)) continue;
    if (replyTo.kind === 'media') {
      if (wantedMedia && String(msg.url || '') === wantedMedia) return j;
      continue;
    }
    var candidate = messageCopyText(msg).replace(/\s+/g, ' ').trim();
    if (candidate && wantedText && (candidate === wantedText || candidate.slice(0,100) === wantedText)) return j;
  }
  return -1;
}

function resolveMessageDirectiveTarget(name, attrs){
  var list = MESSAGES[name] || [];
  var id = String(attrs.id || attrs.messageid || '').trim();
  if (id) {
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] && String(list[i].id || '') === id) return list[i];
    }
  }
  var rawIndex = attrs.index != null ? attrs.index : (attrs.messageindex != null ? attrs.messageindex : attrs.msgindex);
  if (rawIndex != null && String(rawIndex).trim() !== '') {
    var idx = Number(rawIndex);
    if (Number.isInteger(idx)) {
      if (idx < 0) idx = list.length + idx;
      if (idx >= 0 && idx < list.length) return list[idx];
    }
  }
  return null;
}

function parseChatRecordDirectiveItems(name, attrs){
  var list = MESSAGES[name] || [];
  var referenceText = String(attrs.ids || attrs.indexes || '').trim();
  if (referenceText) {
    var refs = referenceText.split(/\s*[,，]\s*/).filter(Boolean);
    var referencedItems = [];
    refs.forEach(function(ref){
      var token = String(ref || '').trim();
      if (!token) return;
      var target = null;
      if (/^-?\d+$/.test(token)) {
        var idx = Number(token);
        if (idx < 0) idx = list.length + idx;
        if (idx >= 0 && idx < list.length) target = list[idx];
      } else {
        for (var i = list.length - 1; i >= 0; i--) {
          if (list[i] && String(list[i].id || '') === token) { target = list[i]; break; }
        }
      }
      if (!target || target.type === 'voice_call' || target.type === 'voice_call_event') return;
      referencedItems.push({
        from: target.from === 'them' ? 'them' : 'me',
        author: target.from === 'them' ? (name || '对方') : (String((getActiveUserPersona() || {}).name || '我').trim() || '我'),
        text: messageCopyText(target) || '[消息]',
        type: target.type || 'text'
      });
    });
    if (referencedItems.length) return referencedItems.slice(0, 20);
  }
  var raw = String(attrs.messages || attrs.items || '').trim();
  if (!raw) return [];
  return raw.split(/\s*\|\|\s*/).map(function(part, index){
    var text = String(part || '').trim();
    if (!text) return null;
    var match = /^([^:：]{1,30})\s*[:：]\s*([\s\S]*)$/.exec(text);
    var speaker = match ? String(match[1]).trim() : '';
    var body = match ? String(match[2]).trim() : text;
    var normalized = speaker.toLowerCase();
    var from = /^(?:me|user|我|用户)$/.test(normalized) ? 'me' : (/^(?:them|assistant|char|角色|对方)$/.test(normalized) ? 'them' : (match ? 'them' : (index % 2 ? 'them' : 'me')));
    var author = speaker || (from === 'them' ? (name || '对方') : (String((getActiveUserPersona() || {}).name || '我').trim() || '我'));
    return { from: from, author: author, text: body.slice(0, 500), type:'text' };
  }).filter(Boolean).slice(0, 20);
}

function renderMessageQuoteMarkup(quote){
  if (!quote) return '';
  var author = escapeHTML(quote.from === 'them' ? (quote.author || currentName || '对方') : getActiveUserSocialId());
  var content = '';
  if (quote.kind === 'media' && /^(?:data:image\/|https?:\/\/)/i.test(String(quote.mediaUrl || ''))) {
    content = '<span class="pm-quote-media-wrap"><img class="pm-quote-media" src="' + escapeHTML(String(quote.mediaUrl)) + '" alt="图片" loading="lazy"></span>';
  } else {
    content = '<span class="pm-quote-text">' + escapeHTML(String(quote.text || '［消息］')) + '</span>';
  }
  var contentClass = quote.kind === 'media' ? ' pm-quote-content--media' : '';
  return '<div class="pm-quote-content' + contentClass + '"><span class="pm-quote-author">' + author + '：</span>' + content + '</div>';
}

function updateMessageQuoteBar(){
  if (!pmQuoteBar || !pmQuoteText) return;
  var active = !!messageQuoteDraft;
  pmQuoteBar.hidden = !active;
  pmQuoteBar.classList.toggle('is-open', active);
  pmQuoteBar.setAttribute('aria-hidden', active ? 'false' : 'true');
  pmQuoteText.innerHTML = active ? renderMessageQuoteMarkup(messageQuoteDraft) : '';
  autoResizeInput();
}

function clearMessageQuote(){ messageQuoteDraft = null; updateMessageQuoteBar(); }

function quoteMessage(index){
  var payload = getMessageQuotePayload(index);
  if (!payload) return;
  messageQuoteDraft = payload;
  updateMessageQuoteBar();
  closeVoiceMessageActionMenu();
  if (pmInput) {
    try { pmInput.focus({ preventScroll:true }); } catch(e) { try { pmInput.focus(); } catch(err) {} }
    try { pmInput.setSelectionRange(pmInput.value.length, pmInput.value.length); } catch(e) {}
  }
}

function toggleMessageFavorite(index){
  var list = MESSAGES[currentName] || [], msg = list[Number(index)];
  if (!msg) return;
  msg.favorite = msg.favorite !== true;
  saveMessages(currentName);
  closeVoiceMessageActionMenu();
  toast(msg.favorite ? '已收藏' : '已取消收藏');
}

function renderForwardList(){
  if (!pmForwardList) return;
  var names = [];
  CHATS.forEach(function(chat){ var name = chat && String(chat.name || '').trim(); if (name && names.indexOf(name) === -1) names.push(name); });
  CONTACTS.forEach(function(contact){ var name = contact && String(contact.name || '').trim(); if (name && names.indexOf(name) === -1) names.push(name); });
  if (!names.length) { pmForwardList.innerHTML = '<div class="pm-forward-empty">暂无可转发的会话</div>'; return; }
  pmForwardList.innerHTML = names.map(function(name, i){
    var avatar = getAvatar(name);
    var inner = avatar ? '<img src="' + escapeHTML(avatar) + '" alt="">' : escapeHTML(name.charAt(0));
    return '<button type="button" class="pm-forward-item" data-forward-name="' + escapeHTML(name) + '"><span class="pm-forward-avatar" style="--deg:' + (130 + (i * 37) % 120) + 'deg">' + inner + '</span><span class="pm-forward-name">' + escapeHTML(name) + '</span></button>';
  }).join('');
}

function openForwardPicker(index){
  if (!pmForwardSheet) return;
  var list = MESSAGES[currentName] || [], msg = list[Number(index)];
  if (!msg) return;
  forwardMessageIndex = Number(index);
  forwardSelectedMessageIndices = null;
  renderForwardList();
  closeVoiceMessageActionMenu();
  pmForwardSheet.classList.add('is-open');
  pmForwardSheet.setAttribute('aria-hidden', 'false');
}

function openForwardPickerForSelection(){
  pruneMessageSelection();
  var indices = Object.keys(selectedMessageIndices)
    .filter(function(key){ return selectedMessageIndices[key]; })
    .map(Number)
    .filter(function(index){ return Number.isInteger(index) && index >= 0; })
    .sort(function(a,b){ return a-b; });
  if (!indices.length) { toast('请先选择消息'); return; }
  forwardSelectedMessageIndices = indices.slice();
  forwardMessageIndex = -1;
  renderForwardList();
  closeVoiceMessageActionMenu();
  pmForwardSheet.classList.add('is-open');
  pmForwardSheet.setAttribute('aria-hidden', 'false');
}

function closeForwardPicker(){
  if (!pmForwardSheet) return;
  pmForwardSheet.classList.remove('is-open');
  pmForwardSheet.setAttribute('aria-hidden', 'true');
  forwardMessageIndex = -1;
  forwardSelectedMessageIndices = null;
}

function openForwardRecordView(index){
  if (!pmForwardRecordView) return;
  var list = MESSAGES[currentName] || [], msg = list[Number(index)];
  if (!msg || msg.type !== 'chat_record') return;
  var items = Array.isArray(msg.recordMessages) ? msg.recordMessages : [];
  if (!items.length) { toast('这条聊天记录为空'); return; }
  if (pmForwardRecordTitle) pmForwardRecordTitle.textContent = String(msg.recordTitle || '聊天记录').trim() || '聊天记录';
  if (pmForwardRecordList) {
    pmForwardRecordList.innerHTML = items.map(function(item){
      var from = item && item.from === 'them' ? 'them' : 'me';
      var text = String(item && item.text || '').trim() || '[消息]';
      return '<article class="pm-forward-record-item is-' + from + '">' +
        '<div class="pm-forward-record-text">' + escapeHTML(text) + '</div>' +
      '</article>';
    }).join('');
  }
  closeVoiceMessageActionMenu();
  closeForwardPicker();
  pmForwardRecordView.classList.add('is-open');
  pmForwardRecordView.setAttribute('aria-hidden', 'false');
}

function closeForwardRecordView(){
  if (!pmForwardRecordView) return;
  pmForwardRecordView.classList.remove('is-open');
  pmForwardRecordView.setAttribute('aria-hidden', 'true');
  if (pmForwardRecordList) pmForwardRecordList.innerHTML = '';
}

function buildForwardRecordPayload(sourceIndex){
  var sourceList = MESSAGES[currentName] || [];
  var idx = Number(sourceIndex);
  if (!Number.isInteger(idx) || !sourceList[idx]) return null;
  return buildForwardRecordPayloadFromIndices([idx]);
}

function buildForwardRecordPayloadFromIndices(indices){
  var sourceList = MESSAGES[currentName] || [];
  var valid = (Array.isArray(indices) ? indices : [])
    .map(Number)
    .filter(function(index){ return Number.isInteger(index) && index >= 0 && index < sourceList.length && sourceList[index]; })
    .sort(function(a,b){ return a-b; });
  if (!valid.length) return null;

  var items = [];
  valid.forEach(function(i){
    var item = sourceList[i];
    if (!item || item.type === 'voice_call' || item.type === 'voice_call_event') return;
    items.push({
      from: item.from === 'them' ? 'them' : 'me',
      author: item.from === 'them' ? (currentName || '对方') : (getActiveUserPersona().name || '我'),
      text: messageCopyText(item) || '[消息]',
      type: item.type || 'text'
    });
  });
  if (!items.length) return null;

  var userName = String((getActiveUserPersona() || {}).name || '我').trim() || '我';
  var partnerName = String(currentName || '对方').trim() || '对方';
  return {
    title: userName + '与' + partnerName + '的聊天记录',
    messages: items,
    sourceName: partnerName
  };
}

function forwardMessageTo(name){
  var targetName = String(name || '').trim();
  if (!targetName) return;
  var sourceList = MESSAGES[currentName] || [];
  var record = null;

  if (Array.isArray(forwardSelectedMessageIndices) && forwardSelectedMessageIndices.length) {
    record = buildForwardRecordPayloadFromIndices(forwardSelectedMessageIndices);
  } else {
    var source = sourceList[forwardMessageIndex];
    if (!source) return;
    record = source.type === 'chat_record' && Array.isArray(source.recordMessages) ? {
      title: String(source.recordTitle || ''),
      messages: source.recordMessages.slice(0, 3),
      sourceName: String(source.recordSourceName || currentName || '')
    } : buildForwardRecordPayload(forwardMessageIndex);
  }
  if (!record) { toast('没有可转发的消息'); return; }

  if (!Array.isArray(MESSAGES[targetName])) MESSAGES[targetName] = [];
  var forwarded = {
    id: genId('msg_'),
    type: 'chat_record',
    from: 'me',
    createdAt: Date.now(),
    forwarded: true,
    forwardedFrom: currentName || '',
    recordTitle: record.title || ((getActiveUserPersona().name || '我') + '与' + (currentName || '对方') + '的聊天记录'),
    recordMessages: record.messages || [],
    recordSourceName: record.sourceName || (currentName || '')
  };
  MESSAGES[targetName].push(forwarded);
  saveMessages(targetName);
  var chat = null;
  for (var i=0;i<CHATS.length;i++) if (CHATS[i].name===targetName) { chat=CHATS[i]; break; }
  if (!chat) { chat={name:targetName, preview:'', time:'', unread:0, avatar:getAvatar(targetName)}; CHATS.unshift(chat); }
  chat.time='刚刚';
  updateChatPreviewAfterMessageMutation(targetName);
  saveChats(); renderChats();
  closeForwardPicker();
  if (messageSelectionMode && Array.isArray(forwardSelectedMessageIndices)) {
    clearMessageSelection();
    renderMessages(false);
  }
  toast('已转发 ' + (record.messages.length || 0) + ' 条聊天记录给 ' + targetName);
}

function pruneMessageSelection(){
  var list = Array.isArray(MESSAGES[currentName]) ? MESSAGES[currentName] : [];
  Object.keys(selectedMessageIndices).forEach(function(key){
    var idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length || !list[idx] || list[idx].type === 'system' || list[idx].type === 'voice_call' || list[idx].type === 'voice_call_event') {
      delete selectedMessageIndices[key];
    }
  });
}

function setMessageSelected(index, selected){
  index = Number(index);
  if (!Number.isInteger(index) || index < 0) return;
  if (selected) selectedMessageIndices[String(index)] = true;
  else delete selectedMessageIndices[String(index)];
}

function toggleMessageSelected(index){
  index = Number(index);
  var key = String(index);
  setMessageSelected(index, !selectedMessageIndices[key]);
  updateMessageSelectionChrome();
  renderMessages(false);
}

function enterMessageSelection(index){
  var list = MESSAGES[currentName] || [];
  var msg = list[Number(index)];
  if (!msg || msg.type === 'system' || msg.type === 'voice_call' || msg.type === 'voice_call_event') return;
  closeVoiceMessageActionMenu();
  messageSelectionMode = true;
  selectedMessageIndices = Object.create(null);
  setMessageSelected(index, true);
  updateMessageSelectionChrome();
  renderMessages(false);
  try { if (navigator.vibrate) navigator.vibrate(18); } catch(e) {}
}

function messageCopyText(msg){
  if (!msg) return '';
  if (msg.type === 'system') {
    if (msg.systemType === 'poke') return String(msg.text || '').trim() || '[拍一拍]';
    return String(msg.text || '').trim() || '[系统消息]';
  }
  if (msg.type === 'voice') {
    return getVoiceTranscript(msg) || ('[语音消息' + (Number(msg.duration) > 0 ? ' ' + Math.max(1, Math.round(Number(msg.duration))) + '秒' : '') + ']');
  }
  if (msg.type === 'image') return String(msg.description || msg.imageText || '').trim() || '[图片]';
  if (msg.type === 'sticker') return '[表情包]';
  if (msg.type === 'file') {
    var name = String(msg.name || msg.text || '未命名文件').replace(/^[[]文件[]]\s*/, '');
    return name ? '[文件] ' + name : '[文件]';
  }
  if (msg.type === 'location') {
    var label = String(msg.label || (msg.source === 'virtual' ? '虚拟位置' : '当前位置')).trim();
    var lat = normalizeCoordinate(msg.lat, -90, 90), lng = normalizeCoordinate(msg.lng, -180, 180);
    return (label || '[位置]') + (lat != null && lng != null ? '\n' + lat.toFixed(6) + ', ' + lng.toFixed(6) : '');
  }
  if (msg.type === 'transfer') {
    var amount = normalizeTransferAmount(msg.amount);
    var amountText = amount == null ? '' : ' ¥' + formatTransferAmount(amount);
    var note = String(msg.note || '').trim();
    return (msg.from === 'them' ? '[收到转账]' : '[转账]') + amountText + (note ? '\n' + note : '');
  }
  if (msg.type === 'chat_record') {
    var recordTitle = String(msg.recordTitle || '聊天记录').trim();
    var recordLines = Array.isArray(msg.recordMessages) ? msg.recordMessages.map(function(item){
      var author = String(item && item.author || '').trim();
      var text = String(item && item.text || '').trim();
      return (author ? author + '：' : '') + (text || '[消息]');
    }).filter(Boolean) : [];
    return recordTitle + (recordLines.length ? '\n' + recordLines.join('\n') : '');
  }
  return String(msg.text != null ? msg.text : '').trim();
}

function copyMessageText(index){
  var list = MESSAGES[currentName] || [], msg = list[Number(index)];
  var text = messageCopyText(msg);
  if (!msg || !text) { toast('这条消息没有可复制的内容'); return; }
  function copied(){ toast('已复制'); }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(copied).catch(function(){
      fallbackCopyText(text, copied);
    });
  } else {
    fallbackCopyText(text, copied);
  }
}


function getMessageTranslationSource(msg){
  if (!msg) return '';
  if (msg.type === 'voice') return getVoiceTranscript(msg) || '';
  if (msg.type === 'text' || !msg.type) return String(msg.text != null ? msg.text : '').trim();
  if (msg.type === 'image' && String(msg.description || msg.imageText || '').trim()) return String(msg.description || msg.imageText || '').trim();
  return '';
}


function translateMessage(index){
  var list = MESSAGES[currentName] || [], msg = list[Number(index)];
  if (!msg) return;
  if (msg.translation) {
    msg.translationVisible = msg.translationVisible === false;
    saveMessages(currentName);
    renderMessages(false);
    return;
  }
  var source = getMessageTranslationSource(msg);
  if (!source) { toast(msg.type === 'voice' ? '这条语音还没有可用的转写文字' : '这类消息暂不支持翻译'); return; }
  if (!isApiReady()) { toast('请先在设置中配置 AI 接口'); return; }
  if (msg.translationLoading) return;
  msg.translationLoading = true;
  renderMessages(false);
  var systemPrompt = '你是聊天应用的翻译助手。请将用户提供的消息翻译成简体中文。只输出译文，不要解释，不要加引号，不要附带“翻译：”之类的前缀。保留原文的语气、称呼、换行和表情符号。';
  callApiOnce([
    { role:'system', content:systemPrompt },
    { role:'user', content:source }
  ]).then(function(result){
    var translated = String(result || '').trim();
    if (!translated) throw ApiError('parse','AI 没有返回译文');
    msg.translation = translated;
    msg.translationVisible = getCharAutoExpandTranslation(findPersona(currentName));
    msg.translationLoading = false;
    saveMessages(currentName);
    renderMessages(false);
  }).catch(function(err){
    msg.translationLoading = false;
    renderMessages(false);
    toast(err && err.message ? '翻译失败：' + err.message : '翻译失败');
  });
}

function fallbackCopyText(text, onDone){
  var area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed'; area.style.left = '-9999px'; area.style.top = '0'; area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus(); area.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch(e) { ok = false; }
  document.body.removeChild(area);
  if (ok) { if (onDone) onDone(); }
  else toast('复制失败，请重试');
}

function updateChatPreviewAfterMessageMutation(name){
  if (!name) return;
  var list = MESSAGES[name] || [];
  var last = null;
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].type !== 'voice_call' && list[i].type !== 'voice_call_event') { last = list[i]; break; }
  }
  for (var j = 0; j < CHATS.length; j++) {
    if (CHATS[j].name !== name) continue;
    if (last) {
      if (last.type === 'transfer') CHATS[j].preview = transferPreviewText(last);
      else if (last.type === 'chat_record') CHATS[j].preview = '聊天记录';
      else if (last.type === 'image' || last.type === 'voice' || last.type === 'location') CHATS[j].preview = mediaPreviewText(last);
      else if (last.type === 'sticker') CHATS[j].preview = '[表情包]';
      else if (last.type === 'file') CHATS[j].preview = '[文件] ' + String(last.name || last.text || '未命名文件').replace(/^[[]文件[]]\s*/, '');
      else CHATS[j].preview = String(last.text || '');
    } else {
      CHATS[j].preview = '你们还没有聊过天。';
      CHATS[j].time = '';
    }
    break;
  }
}

function deleteMessageAt(index, options){
  var list = MESSAGES[currentName] || [];
  index = Number(index);
  if (!Number.isInteger(index) || index < 0 || index >= list.length || !list[index]) return false;
  var removed = list[index];
  if (!(options && options.skipConfirm)) {
    var label = messageCopyText(removed) || '这条消息';
    if (label.length > 40) label = label.slice(0, 40) + '…';
    if (!window.confirm('删除这条消息？\n' + label)) return false;
  }
  list.splice(index, 1);
  saveMessages(currentName);
  updateChatPreviewAfterMessageMutation(currentName);
  renderChats(); saveChats();
  voiceTranscriptOpen = Object.create(null);
  renderMessages(false);
  toast('已删除');
  return true;
}

function deleteSelectedMessages(){
  pruneMessageSelection();
  var indices = Object.keys(selectedMessageIndices).filter(function(key){ return selectedMessageIndices[key]; }).map(Number).sort(function(a,b){ return b-a; });
  if (!indices.length) { toast('请先选择消息'); return; }
  if (!window.confirm('删除已选 ' + indices.length + ' 条消息？')) return;
  var list = MESSAGES[currentName] || [];
  indices.forEach(function(index){ if (list[index]) list.splice(index, 1); });
  saveMessages(currentName);
  updateChatPreviewAfterMessageMutation(currentName);
  renderChats(); saveChats();
  voiceTranscriptOpen = Object.create(null);
  clearMessageSelection();
  renderMessages(false);
  toast('已删除 ' + indices.length + ' 条消息');
}

function updateMessageSelectionChrome(){
  var count = selectedMessageCount();
  var head = document.querySelector('.pm-head');
  if (!head) return;
  var back = head.querySelector('#pmBack');
  var more = head.querySelector('#pmMore');
  var forward = head.querySelector('#pmForwardSelected');
  var title = head.querySelector('#pmTitle');
  head.classList.toggle('is-message-selection-mode', messageSelectionMode);
  if (messageSelectionMode) {
    if (back) {
      back.setAttribute('aria-label', '取消多选');
      back.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"></path></svg>';
    }
    if (title) title.textContent = '已选 ' + count + ' 条';
    if (forward) {
      forward.setAttribute('aria-label', '转发已选消息');
      forward.disabled = count === 0;
      forward.classList.toggle('is-disabled', count === 0);
    }
    if (more) {
      more.setAttribute('aria-label', '删除已选消息');
      more.disabled = count === 0;
      more.classList.toggle('is-disabled', count === 0);
      more.innerHTML = '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M5 7h14M9 7V4.8h6V7M8 10v7M12 10v7M16 10v7M6.5 7l.8 13h9.4l.8-13"></path></svg>';
    }
  } else {
    if (forward) {
      forward.disabled = false;
      forward.classList.remove('is-disabled');
    }
    if (back) {
      back.setAttribute('aria-label', '返回消息');
      back.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M15 5.5 8.5 12 15 18.5"></path></svg>';
    }
    if (title) title.textContent = currentName || '角色';
    if (more) {
      more.setAttribute('aria-label', '设置');
      more.disabled = false;
      more.classList.remove('is-disabled');
      more.innerHTML = '<svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="18.5" cy="12" r="1.9"></circle></svg>';
    }
  }
}
