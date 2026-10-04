/* 岛屿 · 聊天 · 消息气泡渲染、戳一戳、输入状态
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function chatMessageCreatedAt(msg){
  var ts = Number(msg && (msg.createdAt || msg.timestamp) || 0);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}


function pad2(value){
  return String(value).padStart(2, '0');
}


function chatClockLabel(timestamp){
  var date = new Date(timestamp);
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}


function chatDayKey(timestamp){
  var date = new Date(timestamp);
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}


function chatDayLabel(timestamp, nowTs){
  var date = new Date(timestamp);
  var now = new Date(nowTs || Date.now());
  var sameYear = date.getFullYear() === now.getFullYear();
  var todayKey = chatDayKey(now.getTime());
  var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  if (chatDayKey(timestamp) === todayKey) return '今天';
  if (chatDayKey(timestamp) === chatDayKey(yesterday)) return '昨天';
  return (sameYear ? (date.getMonth() + 1) + '月' : date.getFullYear() + '年' + (date.getMonth() + 1) + '月') + date.getDate() + '日';
}


function chatSystemRowHTML(text, extraClass){
  return '<div class="pm-system-row ' + (extraClass || '') + '" role="status"><span class="pm-system-pill">' + escapeHTML(String(text || '')) + '</span></div>';
}


function systemMessageHTML(msg){
  if (!msg || msg.type !== 'system') return '';
  return chatSystemRowHTML(msg.text || '系统消息', 'pm-system-row--event');
}


function getPokeUserName(){
  var user = getActiveUserPersona();
  return String(user && user.name || '我').trim() || '我';
}


function normalizePokeTarget(target){
  var value = String(target || '').trim().toLowerCase();
  if (!value) return 'user';
  if (/^(?:user|me|myself|我|用户|本人)$/i.test(value)) return 'user';
  if (/^(?:self|char|character|assistant|them|角色|自己)$/i.test(value)) return 'char';
  return null;
}


function buildPokeMessage(name, actor, target, options){
  var charName = String(name || currentName || '角色').trim() || '角色';
  var actorKey = actor === 'them' ? 'them' : 'me';
  var targetKey = target === 'char' ? 'char' : 'user';
  var userName = getPokeUserName();
  var actorLabel = actorKey === 'them' ? charName : userName;
  var targetLabel = targetKey === 'char' ? charName : userName;
  var text;
  if (actorKey === 'them' && targetKey === 'char') text = actorLabel + '拍了拍自己';
  else if (actorKey === 'me' && targetKey === 'user') text = '我拍了拍自己';
  else text = actorLabel + '拍了拍' + targetLabel;
  return {
    id: genId('poke_'),
    from: actorKey,
    type: 'system',
    systemType: 'poke',
    actor: actorKey,
    target: targetKey,
    actorName: actorLabel,
    targetName: targetLabel,
    text: text,
    createdAt: options && Number(options.createdAt) > 0 ? Number(options.createdAt) : Date.now(),
    proactive: !!(options && options.proactive)
  };
}


function bubbleHTML(msg, entering, index){
  var enterClass = entering ? ' msg-enter' : '';
  var body;
  if (msg && msg.type === 'voice_call_event') return '';
  if (msg && msg.type === 'chat_record') {
    var recordTitle = String(msg.recordTitle || '聊天记录').trim() || '聊天记录';
    var allRecordItems = Array.isArray(msg.recordMessages) ? msg.recordMessages : [];
    var recordItems = allRecordItems.slice(0, 3);
    var recordHtml = recordItems.map(function(item){
      var author = String(item && item.author || '').trim();
      var text = String(item && item.text || '').trim() || '[消息]';
      if (text.length > 78) text = text.slice(0, 78) + '…';
      return '<div class="pm-chat-record-line"><span class="pm-chat-record-author">' + escapeHTML(author ? author + '：' : '') + '</span><span class="pm-chat-record-text">' + escapeHTML(text) + '</span></div>';
    }).join('');
    body = '<div class="pm-chat-record-bubble chat-bubble chat-bubble--chat-record" role="button" tabindex="0" data-chat-record-index="' + index + '" aria-label="查看转发的聊天记录">' +
      '<div class="pm-chat-record-title">' + escapeHTML(recordTitle) + '</div>' +
      (recordHtml ? '<div class="pm-chat-record-lines">' + recordHtml + '</div>' : '') +
      '<div class="pm-chat-record-label">聊天记录</div>' +
    '</div>';
  } else if (msg && msg.type === 'transfer') {
    var transferAmountValue = normalizeTransferAmount(msg.amount);
    if (transferAmountValue != null) {
      var transferNoteText = String(msg.note || '').trim();
      var transferIncoming = msg.from === 'them';
      var transferLabel = transferIncoming ? '收到转账' : '转账';
      var transferStatus = transferStatusLabel(msg);
      var transferStatusKey = String(msg.status || 'pending').toLowerCase();
      var transferStateClass = '';
      if (transferStatusKey === 'received' || transferStatusKey === 'accepted') transferStateClass = ' pm-transfer-bubble--settled';
      else if (transferStatusKey === 'declined' || transferStatusKey === 'refunded' || transferStatusKey === 'returned') transferStateClass = ' pm-transfer-bubble--returned';
      else if (transferStatusKey === 'expired') transferStateClass = ' pm-transfer-bubble--expired';
      var transferActions = '';
      if (transferIncoming && msg.status === 'pending') {
        transferActions = '<div class="pm-transfer-actions">' +
          '<button type="button" class="pm-transfer-action pm-transfer-action--accept" data-transfer-action="accept" data-transfer-index="' + index + '">收款</button>' +
          '<button type="button" class="pm-transfer-action pm-transfer-action--decline" data-transfer-action="decline" data-transfer-index="' + index + '">拒收</button>' +
        '</div>';
      }
      body = '<div class="pm-transfer-bubble chat-bubble chat-bubble--transfer' + (transferIncoming ? ' pm-transfer-bubble--incoming' : '') + transferStateClass + '">' +
        '<div class="pm-transfer-main">' +
          '<div class="pm-transfer-icon" aria-hidden="true">' + toolIcon('<path d="M4.5 8.5H19.5"/><path d="M19.5 8.5l-4.7-4.1"/><path d="M19.5 15.5H4.5"/><path d="M4.5 15.5l4.7 4.1"/>') + '</div>' +
          '<div class="pm-transfer-copy"><div class="pm-transfer-label">' + escapeHTML(transferLabel) + '</div><div class="pm-transfer-amount">¥' + escapeHTML(formatTransferAmount(transferAmountValue)) + '</div>' +
            (transferNoteText ? '<div class="pm-transfer-note">' + escapeHTML(transferNoteText) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="pm-transfer-divider"></div><div class="pm-transfer-status">' + escapeHTML(transferStatus) + '</div>' + transferActions +
      '</div>';
    } else {
      body = '<div class="pm-bubble chat-bubble chat-bubble--text">转账数据无效</div>';
    }
  } else if (msg && msg.type === 'file') {
    var fileName = String(msg.name || msg.text || '未命名文件').replace(/^[[]文件[]]\s*/,'');
    var fileKind = String(msg.kind || '文件');
    var fileMeta = formatFileSize(msg.size) + ' · ' + (msg.readable ? '可供角色读取' : '已发送');
    body = '<button type="button" class="pm-file-bubble chat-bubble chat-bubble--file" data-file-view-index="' + index + '" aria-label="查看文件：' + escapeHTML(fileName) + '">' +
      '<div class="pm-file-icon" aria-hidden="true">' + escapeHTML(fileKind.slice(0,4)) + '</div>' +
      '<div class="pm-file-main"><div class="pm-file-name" title="' + escapeHTML(fileName) + '">' + escapeHTML(fileName) + '</div>' +
      '<div class="pm-file-meta">' + escapeHTML(fileMeta) + '</div></div>' +
    '</button>';
  } else if (msg && msg.type === 'location') {
    var locationLat = normalizeCoordinate(msg.lat, -90, 90);
    var locationLng = normalizeCoordinate(msg.lng, -180, 180);
    if (locationLat != null && locationLng != null) {
      var locationLabel = String(msg.label || (msg.source === 'virtual' ? '虚拟位置' : '我的当前位置'));
      var locationType = msg.source === 'virtual' ? '虚拟位置' : '当前位置';
      var isRealLocation = msg.source !== 'virtual';
      var locationAction = isRealLocation ? '<button type="button" class="pm-location-card pm-location-card--real" data-location-open="' + index + '" aria-label="打开地图">' : '<div class="pm-location-card pm-location-card--virtual">';
      var locationClose = isRealLocation ? '</button>' : '</div>';
      body = locationAction +
        '<div class="pm-location-card-map"><span class="pm-location-card-pin">' + toolIcon('<path d="M12 21s6.5-5.4 6.5-10.4a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.4" r="2.4"/>') + '</span><span class="pm-location-card-grid"></span></div>' +
        '<div class="pm-location-card-body"><div class="pm-location-card-title">' + escapeHTML(locationLabel) + '</div>' +
        '<div class="pm-location-card-meta">' + escapeHTML(locationType) + ' · ' + escapeHTML(locationLat.toFixed(6)) + ', ' + escapeHTML(locationLng.toFixed(6)) + '</div></div>' +
        locationClose;
    } else {
      body = '<div class="pm-bubble chat-bubble chat-bubble--text">位置数据无效</div>';
    }
  } else if (msg && msg.type === 'image' && /^data:image\//i.test(String(msg.url || ''))) {
    var imageViewAttr = msg.from === 'me' ? ' data-media-view-index="' + index + '" role="button" tabindex="0" aria-label="查看图片"' : '';
    body = '<div class="pm-image-bubble chat-bubble chat-bubble--image' + (msg.from === 'me' ? ' is-media-viewable' : '') + '"' + imageViewAttr + '><img src="' + escapeHTML(String(msg.url)) + '" alt="图片" loading="lazy"></div>';
  } else if (msg && msg.type === 'image' && String(msg.description || msg.imageText || '').trim()) {
    body = '<button type="button" class="pm-image-text-bubble chat-bubble chat-bubble--image" data-image-text-index="' + index + '" aria-label="查看文字图描述"><span class="pm-image-text-content">文字图</span></button>';
  } else if (msg && msg.type === 'sticker' && /^(?:https?:\/\/|data:image\/)/i.test(String(msg.url || ''))) {
    var stickerViewAttr = msg.from === 'me' ? ' data-media-view-index="' + index + '" role="button" tabindex="0" aria-label="查看表情包"' : '';
    body = '<div class="pm-sticker-bubble chat-bubble chat-bubble--sticker' + (msg.from === 'me' ? ' is-media-viewable' : '') + '"' + stickerViewAttr + '><img src="' + escapeHTML(String(msg.url)) + '" alt="表情包" loading="lazy"></div>';
  } else if (msg && msg.type === 'voice') {
    var blob = getVoiceBlob(msg), audioUrl = '';
    if (blob && typeof URL !== 'undefined' && URL.createObjectURL) {
      try { audioUrl = URL.createObjectURL(blob); voiceObjectUrls.push(audioUrl); } catch(e) {}
    }
    var duration = Math.max(1, Math.round(Number(msg.duration) || 1));
    var transcript = getVoiceTranscript(msg);
    /* 语音消息默认显示：语音气泡与头像同侧/顶端对齐，识别文字独立放在气泡下方。 */
    var transcriptOpen = !!transcript && voiceTranscriptOpen[msg.id] === true;
    var syntheticVoice = !audioUrl && msg.from === 'them' && !!String(msg.synthText || msg.voiceText || '').trim();
    var bubbleClass = audioUrl ? 'pm-voice-bubble chat-bubble chat-bubble--voice' : 'pm-voice-bubble chat-bubble chat-bubble--voice is-unavailable';
    var bubbleLabel = audioUrl ? ('播放语音，' + duration + '秒') : '语音消息';
    var bubbleTag = audioUrl ? 'button' : 'div';
    var voiceBubbleWidth = getVoiceBubbleWidth(duration);
    body = '<div class="pm-voice-wrap chat-message__content chat-message__content--voice' + (transcriptOpen ? ' is-transcript-open' : '') + '" data-voice-wrap-index="' + index + '">' +
      '<' + bubbleTag + ' class="' + bubbleClass + '"' + (audioUrl || syntheticVoice ? ' type="button"' : '') + ' data-voice-index="' + index + '"' +
        ' style="--voice-bubble-width:' + voiceBubbleWidth + 'px"' +
        (audioUrl ? ' data-voice-url="' + escapeHTML(audioUrl) + '"' : '') + ' aria-label="' + escapeHTML(bubbleLabel) + '">' +
        '<span class="pm-voice-play" aria-hidden="true"><img src="https://pic.feria.eu.org/DPr1Sfk0/1000125631.png" alt=""></span>' +
        '<span class="pm-voice-duration">' + formatVoiceMessageDuration(duration) + '</span>' +
      '</' + bubbleTag + '>' +
      (transcriptOpen && transcript ? '<div class="pm-voice-transcript chat-message__transcript">' + escapeHTML(transcript) + '</div>' : '') +
    '</div>';
  } else {
    var messageText = escapeHTML(msg && msg.text != null ? msg.text : '');
    body = '<div class="pm-bubble chat-bubble chat-bubble--text">' + messageText + '</div>';
  }
  var translationMarkup = '';
  if (msg && msg.translationLoading) {
    translationMarkup = '<div class="pm-message-translation is-loading">翻译中…</div>';
  } else if (msg && msg.translation && msg.translationVisible !== false) {
    translationMarkup = '<div class="pm-message-translation">' + escapeHTML(String(msg.translation)) + '</div>';
  }
  if (msg && msg.replyTo) {
    var replyMediaClass = msg.replyTo && msg.replyTo.kind === 'media' ? ' is-media' : '';
    var resolvedReplyIndex = resolveQuotePayloadSourceIndex(msg.replyTo);
    var replyIdAttr = msg.replyTo && String(msg.replyTo.id || '').trim() ? ' data-quote-target-id="' + escapeHTML(String(msg.replyTo.id)) + '"' : '';
    var sourceIndexValue = resolvedReplyIndex >= 0 ? resolvedReplyIndex : Number(msg.replyTo.sourceIndex);
    var replyIndexAttr = Number.isInteger(sourceIndexValue) && sourceIndexValue >= 0 ? ' data-quote-target-index="' + sourceIndexValue + '"' : '';
    var replyMarkup = '<div class="pm-bubble-quote' + replyMediaClass + '"' + replyIdAttr + replyIndexAttr + ' role="button" tabindex="0" aria-label="定位被引用的原消息">' + renderMessageQuoteMarkup(msg.replyTo) + '</div>';
    body = '<div class="pm-message-reply-stack">' + body + translationMarkup + replyMarkup + '</div>';
  } else if (translationMarkup) {
    body = '<div class="pm-message-reply-stack">' + body + translationMarkup + '</div>';
  }
  var voiceRowClass = (msg && msg.type === 'voice') ? ' pm-voice-row' : '';
  var stickerRowClass = (msg && msg.type === 'sticker') ? ' chat-message--sticker' : '';
  var imageRowClass = (msg && msg.type === 'image') ? ' chat-message--image' : '';
  var locationRowClass = (msg && msg.type === 'location') ? ' chat-message--location' : '';
  var fileRowClass = (msg && msg.type === 'file') ? ' chat-message--file' : '';
  var transferRowClass = (msg && msg.type === 'transfer') ? ' chat-message--transfer' : '';
  var selected = !!selectedMessageIndices[String(index)];
  var selectionClass = messageSelectionMode ? ' is-message-selection-mode' : '';
  var selectionCheck = '<button type="button" class="pm-message-select-check" data-message-select-index="' + index + '" aria-label="' + (selected ? '取消选择' : '选择消息') + '" aria-pressed="' + (selected ? 'true' : 'false') + '"><span aria-hidden="true">' + (selected ? '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" viewBox="0 0 24 24"><path d="m6.5 12.5 3.6 3.6 7.4-8.2"></path></svg>' : '') + '</span></button>';
  if (msg.from === 'them') return '<div class="pm-row chat-message chat-message--received' + (msg && msg.type === 'voice' ? ' chat-message--voice' : '') + voiceRowClass + stickerRowClass + imageRowClass + locationRowClass + fileRowClass + selectionClass + (selected ? ' is-message-selected' : '') + enterClass + '" data-message-index="' + index + '">' + selectionCheck + avatarHTML(currentName, 3, currentAvatar, 'avatar-sm chat-message__char-avatar') + body + '</div>';
  return '<div class="pm-row chat-message chat-message--sent' + (msg && msg.type === 'voice' ? ' chat-message--voice' : '') + voiceRowClass + stickerRowClass + imageRowClass + locationRowClass + fileRowClass + selectionClass + (selected ? ' is-message-selected' : '') + enterClass + '" data-message-index="' + index + '">' + selectionCheck + body + userAvatarHTML() + '</div>';
}


function renderMessageActionMenu(index, anchorEl){
  if (!pmMessageActionPopover || !pmScroll || !anchorEl) return;
  var list = MESSAGES[currentName] || [], msg = list[index];
  if (!msg || msg.type === 'system' || msg.type === 'voice_call' || msg.type === 'voice_call_event') return;
  var actions = '';
  if (msg.type === 'voice') {
    var transcript = getVoiceTranscript(msg);
    var transcriptOpen = !!transcript && voiceTranscriptOpen[msg.id] === true;
    var label = transcriptOpen ? '收起文字' : '转文字';
    var icon = voiceTranscribeIcon(transcriptOpen);
    actions += '<button class="pm-message-action-item" type="button" data-message-action="transcribe" data-message-action-index="' + index + '" aria-label="' + label + '"><span class="pm-message-action-icon" aria-hidden="true">' + icon + '</span><span class="pm-message-action-label">' + label + '</span></button>';
  }
  actions += '<button class="pm-message-action-item" type="button" data-message-action="copy" data-message-action-index="' + index + '" aria-label="复制"><span class="pm-message-action-icon" aria-hidden="true"><svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-6A2.5 2.5 0 0 0 5 6.5v6A2.5 2.5 0 0 0 7.5 15H8"></path></svg></span><span class="pm-message-action-label">复制</span></button>';
  var translationLabel = msg.translation
    ? (msg.translationVisible !== false ? '收起翻译' : '展开翻译')
    : '翻译';
  actions += '<button class="pm-message-action-item" type="button" data-message-action="translate" data-message-action-index="' + index + '" aria-label="' + translationLabel + '"><span class="pm-message-action-icon" aria-hidden="true"><svg aria-hidden="true" viewBox="0 0 24 24"><text x="1.8" y="10.4" fill="currentColor" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans CJK SC,sans-serif" font-size="10.8" font-weight="650">文</text><text x="11.1" y="20.5" fill="currentColor" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans CJK SC,sans-serif" font-size="10.8" font-weight="650">英</text></svg></span><span class="pm-message-action-label">' + translationLabel + '</span></button>';
  actions += '<button class="pm-message-action-item" type="button" data-message-action="quote" data-message-action-index="' + index + '" aria-label="引用"><span class="pm-message-action-icon" aria-hidden="true"><svg aria-hidden="true" viewBox="0 0 24 24"><g transform="translate(24 0) scale(-1 1)"><path fill="currentColor" d="M5.2 15.15c0-2.65 1.08-4.92 3.24-6.82l1.1 1.3c-.84.78-1.34 1.6-1.52 2.48h1.8v2.6q0 .68-.68.68H5.95q-.75 0-.75-.75v-2.39zm8.58 0c0-2.65 1.08-4.92 3.24-6.82l1.1 1.3c-.84.78-1.34 1.6-1.52 2.48h1.8v2.6q0 .68-.68.68h-3.19q-.75 0-.75-.75v-2.39z"></path></g></svg></span><span class="pm-message-action-label">引用</span></button>';
  actions += '<button class="pm-message-action-item" type="button" data-message-action="favorite" data-message-action-index="' + index + '" aria-label="' + (msg.favorite ? '取消收藏' : '收藏') + '"><span class="pm-message-action-icon" aria-hidden="true"><svg fill="' + (msg.favorite ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" viewBox="0 0 24 24"><path d="m12 4 2.45 4.96 5.47.8-3.96 3.86.93 5.45L12 16.5 7.11 19.07l.93-5.45-3.96-3.86 5.47-.8L12 4z"></path></svg></span><span class="pm-message-action-label">' + (msg.favorite ? '取消收藏' : '收藏') + '</span></button>';
  actions += '<button class="pm-message-action-item" type="button" data-message-action="forward" data-message-action-index="' + index + '" aria-label="转发"><span class="pm-message-action-icon" aria-hidden="true"><svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" viewBox="0 0 24 24"><path d="M5 12h13"></path><path d="m13 6 6 6-6 6"></path></svg></span><span class="pm-message-action-label">转发</span></button>';
  actions += '<button class="pm-message-action-item" type="button" data-message-action="delete" data-message-action-index="' + index + '" aria-label="删除"><span class="pm-message-action-icon" aria-hidden="true"><svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 6h16M9 6V4h6v2M18.5 6l-1 14h-11l-1-14M9.5 10.5v5M14.5 10.5v5"></path></svg></span><span class="pm-message-action-label">删除</span></button>';
  actions += '<button class="pm-message-action-item" type="button" data-message-action="select" data-message-action-index="' + index + '" aria-label="多选"><span class="pm-message-action-icon" aria-hidden="true"><svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="3"></rect><path d="M8 12h8"></path></svg></span><span class="pm-message-action-label">多选</span></button>';
  pmMessageActionPopover.innerHTML = actions;

  var shell = pmMessageActionPopover.parentElement;
  if (!shell) return;
  var shellRect = shell.getBoundingClientRect();
  var anchorRect = anchorEl.getBoundingClientRect();
  pmMessageActionPopover.style.left = '0px';
  pmMessageActionPopover.style.top = '0px';
  pmMessageActionPopover.classList.add('is-open');
  pmMessageActionPopover.classList.remove('is-below','align-left','align-right');

  var menuRect = pmMessageActionPopover.getBoundingClientRect();
  var shellW = shellRect.width, shellH = shellRect.height;
  var menuW = menuRect.width, menuH = menuRect.height;
  var left = anchorRect.left - shellRect.left + (anchorRect.width / 2) - (menuW / 2);
  left = Math.max(10, Math.min(left, shellW - menuW - 10));
  var preferredTop = anchorRect.top - shellRect.top - menuH - 12;
  var below = preferredTop < 8;
  var top = below ? (anchorRect.bottom - shellRect.top + 12) : preferredTop;
  top = Math.max(8, Math.min(top, shellH - menuH - 8));

  pmMessageActionPopover.style.left = left + 'px';
  pmMessageActionPopover.style.top = top + 'px';
  pmMessageActionPopover.classList.toggle('is-below', below);
  pmMessageActionPopover.classList.add('align-left');
  pmMessageActionPopover.setAttribute('aria-hidden','false');
  voiceMessageActionIndex = index;
}


function closeVoiceMessageActionMenu(){
  if (!pmMessageActionPopover) return;
  pmMessageActionPopover.classList.remove('is-open','is-below','align-left','align-right');
  pmMessageActionPopover.setAttribute('aria-hidden','true');
  pmMessageActionPopover.innerHTML = '';
  voiceMessageActionIndex = -1;
}


function locateQuotedMessage(quoteEl){
  if (!quoteEl || !pmScroll) return;
  var list = MESSAGES[currentName] || [];
  var id = String(quoteEl.dataset.quoteTargetId || '').trim();
  var index = Number(quoteEl.dataset.quoteTargetIndex);
  var targetIndex = -1;
  if (id) {
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] && String(list[i].id || '') === id) { targetIndex = i; break; }
    }
  }
  if (targetIndex < 0 && Number.isInteger(index) && index >= 0 && index < list.length) targetIndex = index;
  if (targetIndex < 0) { toast('原消息已不存在'); return; }
  var row = pmScroll.querySelector('.chat-message[data-message-index="' + targetIndex + '"]');
  if (!row) return;
  try { row.scrollIntoView({ behavior:'smooth', block:'center' }); } catch(e) { row.scrollIntoView(); }
  row.classList.remove('is-quote-target');
  void row.offsetWidth;
  row.classList.add('is-quote-target');
  if (locateQuotedMessage._timer) clearTimeout(locateQuotedMessage._timer);
  locateQuotedMessage._timer = setTimeout(function(){
    row.classList.remove('is-quote-target');
    locateQuotedMessage._timer = null;
  }, 1400);
}


function renderMessages(enterLast){
  if (!pmScroll) return;
  closeVoiceMessageActionMenu();
  revokeVoiceObjectUrls();
  var rawList = MESSAGES[currentName] || [];
  var visibleRows = [];
  rawList.forEach(function(item, rawIndex){
    if (item && item.type !== 'voice_call' && item.type !== 'voice_call_event') visibleRows.push({ message:item, index:rawIndex });
  });
  pruneMessageSelection();
  updateMessageSelectionChrome();
  var aliveVoiceIds = Object.create(null);
  visibleRows.forEach(function(row){ var item=row.message; if (item && item.type === 'voice' && item.id) aliveVoiceIds[item.id] = true; });
  Object.keys(voiceTranscriptOpen).forEach(function(id){ if (!aliveVoiceIds[id]) delete voiceTranscriptOpen[id]; });
  if (!visibleRows.length) {
    pmScroll.innerHTML = '<div class="pm-empty">还没有消息<br>' +
      (isApiReady() ? '发送第一条消息开始对话' : '请先在设置中配置 AI 接口') + '</div>';
    return;
  }
  var html = '';
  var previousTs = 0;
  var previousDayKey = '';
  var renderNowTs = Date.now();
  visibleRows.forEach(function(row, idx){
    var msg = row.message;
    var msgTs = chatMessageCreatedAt(msg);
    if (msgTs) {
      var dayKey = chatDayKey(msgTs);
      var dayChanged = !previousDayKey || previousDayKey !== dayKey;
      var gapReached = previousTs > 0 && (msgTs - previousTs >= 5 * 60 * 1000);
      if (dayChanged) html += chatSystemRowHTML(chatDayLabel(msgTs, renderNowTs), 'pm-system-row--day');
      if (dayChanged || previousTs <= 0 || gapReached) html += chatSystemRowHTML(chatClockLabel(msgTs), 'pm-system-row--time');
      previousTs = msgTs;
      previousDayKey = dayKey;
    }
    if (msg && msg.type === 'system') {
      html += systemMessageHTML(msg);
      return;
    }
    html += bubbleHTML(msg, !!enterLast && idx === visibleRows.length - 1, row.index);
  });
  pmScroll.innerHTML = html;
  // 等浏览器完成字体与实际宽度计算后，再判断哪些气泡真的发生了换行。
  // 这样单行短消息不会被强制两端对齐，多行中文才会按 72% 最大宽度进行视觉上的左右对齐。
  requestAnimationFrame(function(){
    var bubbles = pmScroll.querySelectorAll('.pm-bubble');
    bubbles.forEach(function(el){
      el.classList.remove('pm-bubble--multiline','pm-bubble--latin-only');
      var text = el.textContent || '';
      var hasCJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);
      try {
        var range = document.createRange();
        range.selectNodeContents(el);
        var rects = Array.prototype.slice.call(range.getClientRects()).filter(function(r){ return r.width > 0 && r.height > 0; });
        var tops = [];
        rects.forEach(function(r){
          var top = Math.round(r.top * 10) / 10;
          if (tops.indexOf(top) === -1) tops.push(top);
        });
        if (tops.length > 1) {
          el.classList.add('pm-bubble--multiline');
          if (!hasCJK) el.classList.add('pm-bubble--latin-only');
        }
      } catch(e) {}
    });

    var transcripts = pmScroll.querySelectorAll('.pm-voice-transcript, .chat-message__transcript');
    transcripts.forEach(function(el){
      el.classList.remove('pm-transcript--multiline','pm-transcript--latin-only');
      var text = el.textContent || '';
      var hasCJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);
      try {
        var range = document.createRange();
        range.selectNodeContents(el);
        var rects = Array.prototype.slice.call(range.getClientRects()).filter(function(r){ return r.width > 0 && r.height > 0; });
        var tops = [];
        rects.forEach(function(r){
          var top = Math.round(r.top * 10) / 10;
          if (tops.indexOf(top) === -1) tops.push(top);
        });
        if (tops.length > 1) {
          el.classList.add('pm-transcript--multiline');
          if (!hasCJK) el.classList.add('pm-transcript--latin-only');
        }
      } catch(e) {}
    });
  });
}

var charAvatarTapState = { element:null, time:0, x:0, y:0 };


function sendPoke(target){
  if (!currentName) return false;
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  var targetKey = normalizePokeTarget(target);
  if (!targetKey) return false;
  var pokeMessage = buildPokeMessage(currentName, 'me', targetKey);
  MESSAGES[currentName].push(pokeMessage);
  saveMessages(currentName);
  updateChatPreviewForMessage(currentName, pokeMessage);
  saveChats();
  renderChats();
  renderMessages(true);
  scrollBottom(true);
  try { if (navigator.vibrate) navigator.vibrate(10); } catch(e) {}
  return true;
}


function handleAvatarDoubleTap(avatarEl, event, target){
  if (!avatarEl || !event || !currentName) return false;
  var now = Date.now();
  var x = Number(event.clientX) || 0;
  var y = Number(event.clientY) || 0;
  var sameTarget = charAvatarTapState.element === avatarEl;
  var withinWindow = sameTarget && (now - charAvatarTapState.time) <= 360;
  var dx = x - charAvatarTapState.x;
  var dy = y - charAvatarTapState.y;
  var closeEnough = (dx * dx + dy * dy) <= 24 * 24;
  if (withinWindow && closeEnough) {
    charAvatarTapState.element = null;
    charAvatarTapState.time = 0;
    charAvatarTapState.x = 0;
    charAvatarTapState.y = 0;
    return sendPoke(target || 'char');
  }
  charAvatarTapState.element = avatarEl;
  charAvatarTapState.time = now;
  charAvatarTapState.x = x;
  charAvatarTapState.y = y;
  return false;
}


function scrollBottom(smooth){
  if (!pmScroll) return;
  requestAnimationFrame(function(){
    pmScroll.scrollTo({ top: pmScroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  });
}


/* 顶栏标题：AI 回复时显示「对方正在输入...」，回复完变回角色名 */
function showTypingStatus(){
if (!pmTitle) return;
pmTitle.textContent = '对方正在输入...';
}

function hideTypingStatus(){
if (!pmTitle) return;
pmTitle.textContent = currentName || '角色';
}

/* replyInFlight：正在生成回复的聊天（离开聊天页后回复仍在后台继续，回来时可恢复「对方正在输入...」），声明在 currentName 旁边 */
function finishTyping(name){
delete replyInFlight[name];
if (currentName === name) hideTypingStatus();
}

/* 角色的一条新消息已写入：不在该聊天页（或应用在后台）时，更新聊天列表未读并逐条弹系统通知。 */
function announceIncomingMessage(name, msg){
if (!name || !msg) return;
var text = String(msg.text || '').trim();
if (!text) return;
var viewing = currentName === name && !document.hidden;
if (currentName !== name) {
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === name) {
      CHATS[i].preview = text; CHATS[i].time = '刚刚'; CHATS[i].unread = (Number(CHATS[i].unread) || 0) + 1;
      break;
    }
  }
  renderChats(); saveChats();
}
if (viewing) return;
var avatar; try { avatar = getAvatar(name); } catch(e) { avatar = undefined; }
try { Promise.resolve(showCharacterNotification(name, text, avatar, { unique:true })).catch(function(){}); } catch(e){}
}

/* 主动消息：每一段单独一条通知，间隔 150ms，保证顺序 */
function notifySegments(name, segs, avatar){
var p = Promise.resolve();
segs.forEach(function(seg){
  p = p.then(function(){ return showCharacterNotification(name, seg, avatar, { unique:true }); })
       .then(function(){ return new Promise(function(r){ setTimeout(r, 150); }); });
});
return p;
}


function syncPMChrome(){
  var head = document.querySelector('.pm-head');
  var root = document.documentElement;
  if (!head || !root.classList.contains('pm-open')) return;
  try {
    var style = window.getComputedStyle(head);
    var color = style && style.color ? style.color : '';
    if (color) root.style.setProperty('--pm-status-fg', color);
  } catch(e) {}
}


function updateAiButtonVisibility(){
  if (!pmInput) return;
  var wrap = pmInput.closest('.pm-input-wrap');
  if (wrap) wrap.classList.toggle('has-text', pmInput.value.trim().length > 0);
}
