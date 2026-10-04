/* 岛屿 · 聊天 · 位置 / 转账 / 图片文字 / 文件弹窗与 AI 指令
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function openLocationModal(){
  if (!pmLocationModal) return;
  closePanel();
  if (pmLocationStatus) pmLocationStatus.textContent = '';
  pmLocationModal.classList.add('is-open');
  pmLocationModal.setAttribute('aria-hidden','false');
}

function closeLocationModal(){
  if (!pmLocationModal) return;
  pmLocationModal.classList.remove('is-open');
  pmLocationModal.setAttribute('aria-hidden','true');
}

function openLocationCustomModal(){
  closeLocationModal();
  if (pmLocationCustomLabel) pmLocationCustomLabel.value = '';
  if (pmLocationCustomLat) pmLocationCustomLat.value = '';
  if (pmLocationCustomLng) pmLocationCustomLng.value = '';
  if (pmLocationCustomModal) {
    pmLocationCustomModal.classList.add('is-open');
    pmLocationCustomModal.setAttribute('aria-hidden','false');
  }
}

function closeLocationCustomModal(){
  if (!pmLocationCustomModal) return;
  pmLocationCustomModal.classList.remove('is-open');
  pmLocationCustomModal.setAttribute('aria-hidden','true');
}

function normalizeTransferAmount(value){
  var raw = String(value == null ? '' : value).trim().replace(/,/g, '');
  if (!raw || !/^\d+(?:\.\d{0,2})?$/.test(raw)) return null;
  var amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 99999999.99) return null;
  return Math.round(amount * 100) / 100;
}

function formatTransferAmount(value){
  var amount = Number(value);
  if (!Number.isFinite(amount)) amount = 0;
  return amount.toLocaleString('zh-CN', { minimumFractionDigits:2, maximumFractionDigits:2, useGrouping:true });
}

function updateTransferHint(text, isError){
  if (!pmTransferHint) return;
  pmTransferHint.textContent = text || '请输入 0.01～99,999,999.99 元。';
  pmTransferHint.classList.toggle('is-error', !!isError);
}

function openTransferModal(){
  if (!pmTransferModal || !currentName) return;
  closePanel();
  if (pmTransferRecipient) pmTransferRecipient.textContent = currentName;
  if (pmTransferAmount) pmTransferAmount.value = '';
  if (pmTransferNote) pmTransferNote.value = '';
  updateTransferHint('请输入 0.01～99,999,999.99 元。', false);
  pmTransferModal.classList.add('is-open');
  pmTransferModal.setAttribute('aria-hidden','false');
  requestAnimationFrame(function(){ if (pmTransferAmount) pmTransferAmount.focus(); });
}

function closeTransferModal(){
  if (!pmTransferModal) return;
  pmTransferModal.classList.remove('is-open');
  pmTransferModal.setAttribute('aria-hidden','true');
}

function openImageTextModal(index){
  if (!pmImageTextModal || !currentName) return;
  var list = MESSAGES[currentName] || [];
  var msg = list[index];
  var description = String(msg && (msg.description || msg.imageText || '') || '').trim();
  if (!msg || msg.type !== 'image' || !description) return;
  if (pmImageTextDescription) pmImageTextDescription.textContent = description;
  pmImageTextModal.classList.add('is-open');
  pmImageTextModal.setAttribute('aria-hidden','false');
}

function closeImageTextModal(){
  if (!pmImageTextModal) return;
  pmImageTextModal.classList.remove('is-open');
  pmImageTextModal.setAttribute('aria-hidden','true');
}

function openMediaViewModal(index){
  if (!pmMediaViewModal || !pmMediaViewImage || !currentName) return;
  var list = MESSAGES[currentName] || [];
  var msg = list[Number(index)];
  if (!msg || (msg.type !== 'image' && msg.type !== 'sticker')) return;
  var url = String(msg.url || '').trim();
  if (!url || !/^((https?:\/\/)|data:image\/)/i.test(url)) return;
  pmMediaViewImage.src = url;
  pmMediaViewImage.alt = msg.type === 'sticker' ? '表情包' : '图片';
  pmMediaViewModal.classList.add('is-open');
  pmMediaViewModal.setAttribute('aria-hidden','false');
}

function closeMediaViewModal(){
  if (!pmMediaViewModal) return;
  pmMediaViewModal.classList.remove('is-open');
  pmMediaViewModal.setAttribute('aria-hidden','true');
  if (pmMediaViewImage) pmMediaViewImage.removeAttribute('src');
}

function openFileViewModal(index){
  if (!pmFileViewModal || !currentName) return;
  var list = MESSAGES[currentName] || [];
  var msg = list[Number(index)];
  if (!msg || msg.type !== 'file') return;
  var fileName = String(msg.name || msg.text || '未命名文件').replace(/^[[]文件[]]\s*/,'').trim() || '未命名文件';
  var fileMeta = String(msg.mime || '未知类型') + ' · ' + formatFileSize(msg.size);
  var content = String(msg.content || '').trim();
  if (pmFileViewTitle) pmFileViewTitle.textContent = fileName;
  if (pmFileViewMeta) pmFileViewMeta.textContent = fileMeta + (msg.readable ? ' · 可供角色读取' : ' · 未读取到正文');
  if (pmFileViewContent) {
    pmFileViewContent.textContent = content || '当前没有可预览的文件正文。\n\n这个文件消息保留了文件名、类型和大小，但没有可靠的可读取正文，因此不会虚构文件内容。';
    pmFileViewContent.classList.toggle('is-empty', !content);
  }
  pmFileViewModal.classList.add('is-open');
  pmFileViewModal.setAttribute('aria-hidden','false');
}

function closeFileViewModal(){
  if (!pmFileViewModal) return;
  pmFileViewModal.classList.remove('is-open');
  pmFileViewModal.setAttribute('aria-hidden','true');
}

function transferStatusLabel(msg){
  var status = String(msg && msg.status || 'pending');
  var incoming = !!(msg && msg.from === 'them');
  if (status === 'received') return '已收款';
  if (status === 'declined') return incoming ? '已拒收' : '对方已拒收';
  return incoming ? '待收款' : '待对方收款';
}

function transferPreviewText(msg){
  if (!msg) return '';
  var amount = normalizeTransferAmount(msg.amount);
  if (amount == null) return '[转账]';
  return msg.from === 'them' ? '[收到转账] ¥' + formatTransferAmount(amount) : '[转账] ¥' + formatTransferAmount(amount);
}

function updateChatPreviewForMessage(name, msg){
  if (!name || !msg) return;
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === name) {
      if (msg.type === 'transfer') CHATS[i].preview = transferPreviewText(msg);
      else if (msg.type === 'image') CHATS[i].preview = mediaPreviewText(msg);
      else if (msg.type === 'voice') CHATS[i].preview = mediaPreviewText(msg);
      else if (msg.type === 'location') CHATS[i].preview = mediaPreviewText(msg);
      else if (msg.type === 'voice_call_event') CHATS[i].preview = mediaPreviewText(msg);
      else if (msg.text) CHATS[i].preview = String(msg.text);
      CHATS[i].time = '刚刚';
      break;
    }
  }
}

function mediaPreviewText(msg){
  if (!msg) return '';
  if (msg.type === 'image') return '[图片]' + (msg.description ? ' ' + String(msg.description).trim().slice(0, 60) : '');
  if (msg.type === 'voice') return '[语音消息' + (Number(msg.duration) > 0 ? ' ' + Math.max(1, Math.round(Number(msg.duration))) + '秒' : '') + ']';
  if (msg.type === 'location') return '[位置] ' + String(msg.label || '当前位置');
  if (msg.type === 'voice_call_event') return '[语音来电]';
  return String(msg.text || '').trim();
}

function speakCharacterVoiceMessage(msg){
  if (!msg) return false;
  var text = String(msg.synthText || msg.voiceText || '').trim();
  if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    toast('当前环境不支持播放这条语音消息');
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = /[\u3400-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
    u.rate = 0.98;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) {
    toast('语音播放失败');
    return false;
  }
}

function updateTransferMessageStatus(name, messageId, status){
  if (!name || !messageId) return false;
  var next = status === 'received' || status === 'declined' || status === 'pending' ? status : null;
  if (!next) return false;
  var list = MESSAGES[name] || [];
  var msg = null;
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].type === 'transfer' && String(list[i].id) === String(messageId)) { msg = list[i]; break; }
  }
  if (!msg) return false;
  // 角色只能处理用户发起的转账；用户只能处理角色发起的转账。
  if (next !== 'pending' && msg.from !== 'me' && msg.from !== 'them') return false;
  msg.status = next;
  msg.statusChangedAt = Date.now();
  updateChatPreviewForMessage(name, msg);
  saveMessages(name);
  saveChats();
  if (currentName === name) { renderMessages(true); scrollBottom(true); }
  else renderChats();
  return true;
}

function respondToIncomingTransfer(index, status){
  if (!currentName) return false;
  var list = MESSAGES[currentName] || [];
  var msg = list[index];
  if (!msg || msg.type !== 'transfer' || msg.from !== 'them' || msg.status !== 'pending') return false;
  if (status === 'received') {
    updateTransferMessageStatus(currentName, msg.id, 'received');
    toast('已收款 ¥' + formatTransferAmount(msg.amount));
    return true;
  }
  if (status === 'declined') {
    updateTransferMessageStatus(currentName, msg.id, 'declined');
    toast('已拒收这笔转账');
    return true;
  }
  return false;
}

function parseTransferDirectiveAttrs(raw){
  var attrs = {};
  var text = String(raw || '');
  var re = /([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\]]+))/g;
  var m;
  while ((m = re.exec(text))) attrs[String(m[1]).toLowerCase()] = m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4]);
  return attrs;
}

function processAiChatDirectives(name, rawText){
  var raw=String(rawText||''); var changed=false; var notices=[]; var incomingCall=null; var generatedReplyTo=null;
  if(!name) return {text:raw,changed:false,notices:notices,incomingCall:null,replyTo:null};
  if(!Array.isArray(MESSAGES[name])) MESSAGES[name]=[];
  ensureMessageIds(name);

  // Char 主动拍一拍：目标只允许“用户”或“自己”。
  // [[POKE target="user"]]：角色拍一拍用户；[[POKE target="self"]]：角色拍一拍自己。
  raw=raw.replace(/\[\[\s*POKE\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText);
    var target=normalizePokeTarget(attrs.target || attrs.to || attrs.who || attrs.person);
    if (!target) return '';
    var pokeMsg=buildPokeMessage(name,'them',target,{proactive:true});
    MESSAGES[name].push(pokeMsg);
    changed=true;
    notices.push(pokeMsg.text);
    return '';
  });

  // Char 主动引用：优先引用现有消息（id/index），也支持直接提供引用文本。
  raw=raw.replace(/\[\[\s*QUOTE\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText);
    var target=resolveMessageDirectiveTarget(name,attrs);
    if(target){
      generatedReplyTo=buildMessageQuotePayload(name,target);
      return '';
    }
    var author=String(attrs.author || attrs.from || '').trim();
    var text=String(attrs.text || attrs.content || '').replace(/\s+/g,' ').trim().slice(0,100);
    var kind=String(attrs.kind || attrs.type || 'text').toLowerCase();
    if(text){
      var from=/^(?:them|assistant|char|角色|对方)$/i.test(author) ? 'them' : 'me';
      var explicitAuthor = String(attrs.author || '').trim();
      generatedReplyTo={id:'',from:from,author:from === 'me' ? getActiveUserSocialId() : (explicitAuthor || (name || '对方')),text:text,type:kind,kind:'label' === kind ? 'label' : 'text',mediaUrl:''};
      if(kind === 'voice' || kind === 'location' || kind === 'transfer' || kind === 'file' || kind === 'chat_record' || kind === 'image_text') {
        generatedReplyTo.kind='label';
        generatedReplyTo.text = kind === 'voice' ? '［语音］' : kind === 'location' ? '［位置］' : kind === 'transfer' ? '［转账］' : kind === 'file' ? '［文件］' : kind === 'chat_record' ? '［聊天记录］' : '［文字图］';
      }
    }
    return '';
  });

  // Char 主动发送“转发聊天记录”卡片。既支持直接提供 messages，也支持引用当前聊天已有消息的 ids/indexes。
  raw=raw.replace(/\[\[\s*CHAT_RECORD\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText);
    var items=parseChatRecordDirectiveItems(name,attrs);
    if(!items.length) return '';
    var title=String(attrs.title || '聊天记录').trim().slice(0,80) || '聊天记录';
    var msg={
      id:genId('record_'), from:'them', type:'chat_record', recordTitle:title,
      recordMessages:items, text:'[聊天记录] ' + title, createdAt:Date.now(), proactive:true
    };
    MESSAGES[name].push(msg); changed=true; notices.push('发送了聊天记录'); return '';
  });

  raw=raw.replace(/\[\[\s*TRANSFER_STATUS\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText), status=String(attrs.status||'').toLowerCase(), id=String(attrs.id||'').trim();
    if((status==='received'||status==='declined')&&id){
      var list=MESSAGES[name], target=null;
      for(var i=list.length-1;i>=0;i--) if(list[i]&&list[i].type==='transfer'&&String(list[i].id)===id){target=list[i];break;}
      if(target&&target.from==='me'&&target.status==='pending'){target.status=status;target.statusChangedAt=Date.now();changed=true;notices.push(status==='received'?'对方已收款':'对方已拒收转账');}
    }
    return '';
  });
  raw=raw.replace(/\[\[\s*TRANSFER\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText), amount=normalizeTransferAmount(attrs.amount); if(amount==null)return '';
    var note=String(attrs.note||'').trim().slice(0,80), msg={id:genId('transfer_'),from:'them',type:'transfer',amount:amount,currency:'CNY',note:note,status:'pending',sender:name,recipient:'me',createdAt:Date.now(),text:'[收到转账] ¥'+formatTransferAmount(amount)+(note?' · '+note:'')};
    MESSAGES[name].push(msg);changed=true;notices.push('收到转账 ¥'+formatTransferAmount(amount));return '';
  });
  raw=raw.replace(/\[\[\s*IMAGE\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText), description=String(attrs.description||attrs.desc||attrs.text||'').trim().slice(0,500); if(!description)return '';
    var msg={id:genId('image_'),from:'them',type:'image',description:description,imageText:description,text:'[图片] '+description,createdAt:Date.now()}; MESSAGES[name].push(msg);changed=true;notices.push('发来一张图片');return '';
  });
  raw=raw.replace(/\[\[\s*VOICE_MESSAGE\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText), voiceText=String(attrs.text||attrs.transcript||attrs.content||'').trim().slice(0,1200); if(!voiceText)return '';
    var duration=Math.max(1,Math.min(60,Math.round(Number(attrs.duration)||Math.max(1,Math.round(voiceText.length/6)))));
    var msg={id:genId('voice_'),from:'them',type:'voice',duration:duration,synthText:voiceText,voiceText:voiceText,transcriptSource:'char_directive',text:'[语音消息] '+voiceText,createdAt:Date.now()}; MESSAGES[name].push(msg);changed=true;notices.push('发来一条语音消息');return '';
  });
  raw=raw.replace(/\[\[\s*LOCATION\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText), label=String(attrs.label||attrs.name||'虚拟位置').trim().slice(0,60)||'虚拟位置', lat=normalizeCoordinate(attrs.lat!=null?attrs.lat:attrs.latitude,-90,90), lng=normalizeCoordinate(attrs.lng!=null?attrs.lng:attrs.longitude,-180,180); if(lat==null||lng==null)return '';
    var msg={id:genId('loc_'),from:'them',type:'location',label:label,lat:lat,lng:lng,source:'virtual',createdAt:Date.now(),text:'[位置] '+label}; MESSAGES[name].push(msg);changed=true;notices.push('分享了位置：'+label);return '';
  });
  raw=raw.replace(/\[\[\s*VOICE_CALL\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText), greeting=String(attrs.text||attrs.greeting||'').trim().slice(0,500), sessionId=genId('call_'), event={id:genId('voice_call_event_'),from:'them',type:'voice_call_event',channel:'voice_call',event:'incoming',callSessionId:sessionId,greeting:greeting,sender:name,text:greeting||'[语音来电]',createdAt:Date.now()};
    MESSAGES[name].push(event);changed=true;incomingCall={event:event,name:name,greeting:greeting};notices.push('语音来电');return '';
  });
  if(changed){var list2=MESSAGES[name], last=list2[list2.length-1];if(last)updateChatPreviewForMessage(name,last);saveMessages(name);saveChats();if(currentName===name){renderMessages(true);scrollBottom(true);}else renderChats();}
  return {text:raw.replace(/\n{3,}/g,'\n\n').trim(),changed:changed,notices:notices,incomingCall:incomingCall,replyTo:generatedReplyTo};
}

function processAiTransferDirectives(name, rawText){return processAiChatDirectives(name,rawText);}

function sendTransferMessage(){
  if (!currentName) return false;
  var amount = normalizeTransferAmount(pmTransferAmount && pmTransferAmount.value);
  if (amount == null) {
    updateTransferHint('请输入有效金额，最多保留 2 位小数。', true);
    if (pmTransferAmount) pmTransferAmount.focus();
    return false;
  }
  var note = String(pmTransferNote && pmTransferNote.value || '').trim().slice(0, 80);
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  var msg = {
    id: genId('transfer_'), from:'me', type:'transfer', amount:amount, currency:'CNY',
    note:note, status:'pending', recipient:currentName, createdAt:Date.now(),
    text:'[转账] ¥' + formatTransferAmount(amount) + (note ? ' · ' + note : '')
  };
  MESSAGES[currentName].push(msg);
  saveMessages(currentName);
  renderMessages(true); scrollBottom(true);
  updateChatPreviewForMessage(currentName, msg);
  renderChats(); saveChats();
  closeTransferModal();
  return true;
}


function normalizeCoordinate(value, min, max){
  var n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 1000000) / 1000000;
}

function sendLocationMessage(locationData){
  if (!currentName || !locationData) return false;
  var lat = normalizeCoordinate(locationData.lat, -90, 90);
  var lng = normalizeCoordinate(locationData.lng, -180, 180);
  if (lat == null || lng == null) return false;
  var label = String(locationData.label || '').trim() || '当前位置';
  var msg = {
    id: genId('loc_'), from:'me', type:'location', label:label, lat:lat, lng:lng,
    source: locationData.source === 'virtual' ? 'virtual' : 'gps',
    accuracy: Number.isFinite(Number(locationData.accuracy)) ? Math.round(Number(locationData.accuracy)) : null,
    createdAt:Date.now(), text:'[位置] ' + label
  };
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  MESSAGES[currentName].push(msg);
  saveMessages(currentName);
  renderMessages(true); scrollBottom(true);
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === currentName) { CHATS[i].preview = '[位置] ' + label; CHATS[i].time = '刚刚'; break; }
  }
  renderChats(); saveChats();
  return true;
}

function shareCurrentLocation(){
  if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
    toast('当前环境不支持手机定位');
    return;
  }
  closeLocationModal();
  navigator.geolocation.getCurrentPosition(function(pos){
    var ok = sendLocationMessage({
      lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, label:'我的当前位置', source:'gps'
    });
    if (!ok) toast('位置发送失败');
  }, function(err){
    var msg = '无法获取当前位置';
    if (err && err.code === 1) msg = '定位权限未开启，请允许应用访问位置';
    else if (err && err.code === 2) msg = '暂时无法确定当前位置';
    else if (err && err.code === 3) msg = '定位超时，请重试';
    toast(msg);
  }, { enableHighAccuracy:true, timeout:12000, maximumAge:30000 });
}

function sendCustomLocation(){
  var label = String(pmLocationCustomLabel && pmLocationCustomLabel.value || '').trim() || '虚拟位置';
  var lat = normalizeCoordinate(pmLocationCustomLat && pmLocationCustomLat.value, -90, 90);
  var lng = normalizeCoordinate(pmLocationCustomLng && pmLocationCustomLng.value, -180, 180);
  if (lat == null || lng == null) { toast('请输入有效的纬度与经度'); return; }
  if (sendLocationMessage({label:label, lat:lat, lng:lng, source:'virtual'})) closeLocationCustomModal();
  else toast('虚拟位置发送失败');
}

function locationMapUrl(msg){
  var lat = normalizeCoordinate(msg && msg.lat, -90, 90), lng = normalizeCoordinate(msg && msg.lng, -180, 180);
  if (lat == null || lng == null) return '';
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lng);
}

function openSharedLocation(msg){
  if (!msg || msg.source === 'virtual') return;
  openLocationMapView(msg);
}

function locationGeoUri(msg){
  var lat = normalizeCoordinate(msg && msg.lat, -90, 90), lng = normalizeCoordinate(msg && msg.lng, -180, 180);
  if (lat == null || lng == null) return '';
  var label = String(msg && msg.label || '当前位置').replace(/[()]/g, '');
  return 'geo:' + lat + ',' + lng + '?q=' + lat + ',' + lng + '(' + encodeURIComponent(label) + ')';
}

function openMapAppChooser(msg){
  if (!msg || msg.source === 'virtual') return;
  var geo = locationGeoUri(msg), fallback = locationMapUrl(msg);
  if (!geo) return;
  var opened = false;
  try {
    var a = document.createElement('a');
    a.href = geo; a.setAttribute('aria-hidden','true');
    a.style.position='fixed'; a.style.left='-9999px'; a.style.width='1px'; a.style.height='1px'; a.style.opacity='0';
    document.body.appendChild(a); a.click(); a.remove(); opened = true;
  } catch(e) {}
  if (!opened && fallback) {
    try { window.open(fallback, '_blank', 'noopener,noreferrer'); } catch(err) { try { location.href = fallback; } catch(_) {} }
  }
}

function openLocationMapView(msg){
  if (!pmLocationMapView || !msg || msg.source === 'virtual') return;
  var lat = normalizeCoordinate(msg.lat, -90, 90), lng = normalizeCoordinate(msg.lng, -180, 180);
  if (lat == null || lng == null) return;
  activeLocationMapMessage = msg;
  var label = String(msg.label || '我的当前位置');
  if (pmLocationMapTitle) pmLocationMapTitle.textContent = label;
  if (pmLocationMapInfoTitle) pmLocationMapInfoTitle.textContent = label;
  if (pmLocationMapInfoMeta) pmLocationMapInfoMeta.textContent = '手机当前位置 · ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
  var dLat = 0.008, dLng = Math.max(0.008, 0.008 / Math.max(0.15, Math.cos(lat * Math.PI / 180)));
  var bbox = [lng-dLng, lat-dLat, lng+dLng, lat+dLat].join(',');
  var iframeUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik&marker=' + encodeURIComponent(lat + ',' + lng);
  if (pmLocationMapFrame) {
    pmLocationMapFrame.hidden = false;
    pmLocationMapFrame.src = iframeUrl;
  }
  if (pmLocationMapFallback) pmLocationMapFallback.hidden = true;
  pmLocationMapView.classList.add('is-open');
  pmLocationMapView.setAttribute('aria-hidden','false');
}

function closeLocationMapView(){
  if (!pmLocationMapView) return;
  pmLocationMapView.classList.remove('is-open');
  pmLocationMapView.setAttribute('aria-hidden','true');
  activeLocationMapMessage = null;
  if (pmLocationMapFrame) pmLocationMapFrame.src = 'about:blank';
}

function saveCurrentCharacterLanguage(id){
  var persona = findPersona(currentName);
  var previousLang = getCharLanguage(persona);
  var lang = CHAR_LANGUAGES.find(function(x){ return x.id === id; });
  if (!persona || !lang) return;
  persona.language = lang.id;
  if (typeof persona.splitPromptEnabled !== 'boolean') {
    persona.splitPromptEnabled = typeof persona.disableSplitPromptForNonChinese === 'boolean'
      ? !persona.disableSplitPromptForNonChinese
      : !!lang.chinese;
  }
  if (typeof persona.autoExpandTranslation !== 'boolean') {
    persona.autoExpandTranslation = false;
  }

  // 切换到非简体中文时，若中文断句拆分提示词仍开启，提醒用户关闭。
  // 仅在确实存在从其他语言模式切换的场景触发；切回简体中文不会弹窗。
  var switchedToNonSimplifiedChinese = lang.id !== 'zh-CN' && previousLang.id !== lang.id;
  if (switchedToNonSimplifiedChinese && getCharSplitPromptEnabled(persona)) {
    var shouldDisableSplit = window.confirm(
      '当前角色已切换为“' + lang.name + '（' + lang.native + '）”。\n\n' +
      '“中文断句拆分提示词”主要用于简体中文回复，当前语言下可能影响自然的断句方式。\n\n' +
      '是否立即关闭“中文断句拆分提示词”？'
    );
    if (shouldDisableSplit) {
      persona.splitPromptEnabled = false;
      persona.disableSplitPromptForNonChinese = true;
    }
  }

  savePersonas();
  renderCharLanguageModal();
}
