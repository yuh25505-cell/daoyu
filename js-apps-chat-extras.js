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
  if (pmTransferRecipient) pmTransferRecipient.textContent = getSessionCharDisplayName(currentName);
  if (pmTransferAmount) pmTransferAmount.value = '';
  if (pmTransferNote) pmTransferNote.value = '';
  updateTransferHint('请输入 0.01～99,999,999.99 元。', false);
  pmTransferModal.classList.add('is-open');
  pmTransferModal.setAttribute('aria-hidden','false');
  /* 打开转账面板时不自动弹出键盘，点击金额框后才弹出。 */
}

function closeTransferModal(){
  if (!pmTransferModal) return;
  pmTransferModal.classList.remove('is-open');
  pmTransferModal.setAttribute('aria-hidden','true');
}

function openImageTextModal(index){
  if (!pmImageTextModal || !currentName) return;
  var recallTitle = document.getElementById('pmImageTextTitle');
  if (recallTitle) recallTitle.textContent = '文字图描述';
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
      if (msg.recalled) CHATS[i].preview = msg.from === 'me' ? '你撤回了一条消息' : '对方撤回了一条消息';
      else if (msg.type === 'transfer') CHATS[i].preview = transferPreviewText(msg);
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

  // Char 主动撤回：[[RECALL text="原话"]] 发出即撤回；[[RECALL id="..."]] / [[RECALL index="..."]] 撤回之前发过的角色消息。
  raw=raw.replace(/\[\[\s*RECALL\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText);
    var now=Date.now();
    if(attrs.id||attrs.messageid||attrs.index!=null||attrs.messageindex!=null||attrs.msgindex!=null){
      var target=resolveMessageDirectiveTarget(name,attrs);
      if(!target||target.from!=='them'||!isMessageRecallable(target)) return '';
      target.recalled=true; target.recalledBy='them'; target.recalledAt=now; target.favorite=false;
    } else {
      var text=String(attrs.text||attrs.content||attrs.message||'').trim().slice(0,1200);
      if(!text) return '';
      MESSAGES[name].push({id:genId('msg_'),from:'them',text:text,createdAt:now,recalled:true,recalledBy:'them',recalledAt:now});
    }
    changed=true; notices.push('撤回了一条消息');
    return '';
  });

  // Char 主动删除好友：[[DELETE_FRIEND reason="原因"]]。这里只记录，等这轮话都发完后由聊天界面执行。
  var deleteFriend=null;
  raw=raw.replace(/\[\[\s*DELETE_FRIEND\b([\s\S]*?)\]\]/gi,function(_,attrText){
    var attrs=parseTransferDirectiveAttrs(attrText);
    deleteFriend={reason:String(attrs.reason||attrs.text||attrs.note||'').trim().slice(0,120)};
    changed=true; notices.push('删除了好友');
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
  return {text:raw.replace(/\n{3,}/g,'\n\n').trim(),changed:changed,notices:notices,incomingCall:incomingCall,replyTo:generatedReplyTo,deleteFriend:deleteFriend};
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
    id: genId('loc_'), from:'me', type:'location', label:label, address:String(locationData.address || '').trim(), lat:lat, lng:lng,
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
  toast('正在定位…');
  getPositionRobust().then(function(pos){
    return reverseGeocodeLocation(pos.coords.latitude, pos.coords.longitude).then(function(place){
      var ok = sendLocationMessage({
        lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
        label:String(place && place.title || '').trim() || '我的当前位置', address:place && place.address, source:'gps'
      });
      if (!ok) toast('位置发送失败');
    });
  }, function(err){
    var msg = '无法获取当前位置';
    if (err && err.code === 1) msg = '定位权限未开启，请允许应用访问位置';
    else if (err && err.code === 2) msg = '暂时无法确定当前位置';
    else if (err && err.code === 3) msg = '定位超时，请重试';
    toast(msg);
  });
}

function sendCustomLocation(){
  var label = String(pmLocationCustomLabel && pmLocationCustomLabel.value || '').trim() || '虚拟位置';
  var lat = normalizeCoordinate(pmLocationCustomLat && pmLocationCustomLat.value, -90, 90);
  var lng = normalizeCoordinate(pmLocationCustomLng && pmLocationCustomLng.value, -180, 180);
  if (lat == null || lng == null) { toast('请输入有效的纬度与经度'); return; }
  if (sendLocationMessage({label:label, lat:lat, lng:lng, source:'virtual'})) closeLocationCustomModal();
  else toast('虚拟位置发送失败');
}

/* ===== 位置地图（不依赖梯子）：腾讯 / 高德 / OpenStreetMap 瓦片自动轮换 ===== */
var LOC_TILE = 256;
var LOC_SOURCES = [
  { id:'tencent', name:'腾讯地图', gcj:true, maxZoom:18, url:function(z, x, y){ var n = Math.pow(2, z); return 'https://rt' + ((x + y) % 4) + '.map.gtimg.com/realtimerender?z=' + z + '&x=' + x + '&y=' + (n - 1 - y) + '&type=vector&style=0'; } },
  { id:'amap', name:'高德地图', gcj:true, maxZoom:18, url:function(z, x, y){ return 'https://webrd0' + (1 + ((x + y) % 4)) + '.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=' + x + '&y=' + y + '&z=' + z; } },
  { id:'osm', name:'© OpenStreetMap', gcj:false, maxZoom:19, url:function(z, x, y){ return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png'; } }
];
var locSourcePref = { cn:'', world:'' };
try { locSourcePref = Object.assign(locSourcePref, JSON.parse(localStorage.getItem('island.locSrc') || '{}')); } catch(e) {}

function locOutOfChina(lat, lng){ return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }

function locWgsToGcj(lat, lng){
  if (locOutOfChina(lat, lng)) return { lat:lat, lng:lng };
  var a = 6378245.0, ee = 0.00669342162296594323, PI = Math.PI;
  function tLat(x, y){ var r = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x)); r += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI)) * 2/3; r += (20*Math.sin(y*PI) + 40*Math.sin(y/3*PI)) * 2/3; r += (160*Math.sin(y/12*PI) + 320*Math.sin(y*PI/30)) * 2/3; return r; }
  function tLng(x, y){ var r = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x)); r += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI)) * 2/3; r += (20*Math.sin(x*PI) + 40*Math.sin(x/3*PI)) * 2/3; r += (150*Math.sin(x/12*PI) + 300*Math.sin(x/30*PI)) * 2/3; return r; }
  var dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
  var rad = lat / 180 * PI, magic = Math.sin(rad); magic = 1 - ee * magic * magic;
  var sq = Math.sqrt(magic);
  dLat = (dLat * 180) / ((a * (1 - ee)) / (magic * sq) * PI);
  dLng = (dLng * 180) / (a / sq * Math.cos(rad) * PI);
  return { lat:lat + dLat, lng:lng + dLng };
}

function locSourceOrder(lat, lng){
  var cn = !locOutOfChina(lat, lng);
  var order = cn ? [0, 1, 2] : [2, 1, 0];
  var pref = cn ? locSourcePref.cn : locSourcePref.world;
  for (var i = 0; i < order.length; i++) {
    if (LOC_SOURCES[order[i]].id === pref) { var hit = order.splice(i, 1)[0]; order.unshift(hit); break; }
  }
  return order;
}

function locRememberSource(lat, lng, id){
  var key = locOutOfChina(lat, lng) ? 'world' : 'cn';
  if (locSourcePref[key] === id) return;
  locSourcePref[key] = id;
  try { localStorage.setItem('island.locSrc', JSON.stringify(locSourcePref)); } catch(e) {}
}

function locWorldPx(lat, lng, z){
  var s = LOC_TILE * Math.pow(2, z), sin = Math.sin(lat * Math.PI / 180);
  sin = Math.max(-0.9999, Math.min(0.9999, sin));
  return { x:(lng + 180) / 360 * s, y:(0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}

function locPinPx(lat, lng, src, z){
  var c = src.gcj ? locWgsToGcj(lat, lng) : { lat:lat, lng:lng };
  return locWorldPx(c.lat, c.lng, z);
}

function locTilesAround(cx, cy, z, W, H, src){
  var n = Math.pow(2, z), out = [];
  var x0 = Math.floor((cx - W / 2) / LOC_TILE), x1 = Math.floor((cx + W / 2) / LOC_TILE);
  var y0 = Math.floor((cy - H / 2) / LOC_TILE), y1 = Math.floor((cy + H / 2) / LOC_TILE);
  for (var ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (var tx = x0; tx <= x1; tx++) {
      var wx = ((tx % n) + n) % n;
      out.push({ key:src.id + ':' + z + ':' + tx + ':' + ty, url:src.url(z, wx, ty), dx:Math.round(tx * LOC_TILE - cx), dy:Math.round(ty * LOC_TILE - cy) });
    }
  }
  return out;
}

function locThumbInner(lat, lng, pos){
  var order = locSourceOrder(lat, lng);
  var src = LOC_SOURCES[order[Math.min(pos, order.length - 1)]];
  var z = Math.min(16, src.maxZoom);
  var p = locPinPx(lat, lng, src, z);
  var tiles = locTilesAround(p.x, p.y, z, 264, 150, src).map(function(t){
    return '<img class="pm-loc-tile" alt="" draggable="false" decoding="async" data-pos="' + pos + '" data-sid="' + src.id + '" style="left:calc(50% + ' + t.dx + 'px);top:calc(50% + ' + t.dy + 'px)" src="' + escapeHTML(t.url) + '">';
  }).join('');
  return '<div class="pm-loc-layer">' + tiles + '</div><span class="pm-loc-pin"></span><span class="pm-loc-attr">' + escapeHTML(src.name) + '</span>';
}

function locThumbHTML(lat, lng){
  return '<div class="pm-loc-map pm-loc-map--thumb" data-lat="' + lat + '" data-lng="' + lng + '" data-pos="0">' + locThumbInner(lat, lng, 0) + '</div>';
}

function locArmThumb(host){
  if (host.dataset.armed) return;
  host.dataset.armed = '1';
  setTimeout(function(){
    if (host.isConnected && !host.dataset.okc) locAdvanceThumb(host);
  }, 5500);
}

function locAdvanceThumb(host){
  var lat = Number(host.dataset.lat), lng = Number(host.dataset.lng);
  var pos = (Number(host.dataset.pos) || 0) + 1;
  if (pos >= locSourceOrder(lat, lng).length) { host.classList.add('is-dead'); return; }
  host.dataset.pos = String(pos);
  host.dataset.fails = '0';
  host.dataset.armed = '';
  delete host.dataset.okc;
  host.innerHTML = locThumbInner(lat, lng, pos);
  locArmThumb(host);
}

document.addEventListener('error', function(e){
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.classList || !t.classList.contains('pm-loc-tile')) return;
  var host = t.closest('.pm-loc-map');
  if (!host) return;
  if (host._locLive) { host._locLive.tileResult(false, t); return; }
  if (String(t.dataset.pos) !== String(host.dataset.pos || 0)) return;
  host.dataset.fails = String((Number(host.dataset.fails) || 0) + 1);
  if (!host.dataset.okc && Number(host.dataset.fails) >= 3) locAdvanceThumb(host);
}, true);

document.addEventListener('load', function(e){
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.classList || !t.classList.contains('pm-loc-tile')) return;
  var host = t.closest('.pm-loc-map');
  if (!host) return;
  if (host._locLive) { host._locLive.tileResult(true, t); return; }
  if (String(t.dataset.pos) !== String(host.dataset.pos || 0)) return;
  if (!host.dataset.okc) {
    host.dataset.okc = '1';
    locRememberSource(Number(host.dataset.lat), Number(host.dataset.lng), t.dataset.sid);
  }
}, true);

(function(){
  function scan(node){
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches('.pm-loc-map--thumb')) locArmThumb(node);
    if (node.querySelectorAll) node.querySelectorAll('.pm-loc-map--thumb').forEach(locArmThumb);
  }
  function start(){
    new MutationObserver(function(list){
      for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i].addedNodes.length; j++) scan(list[i].addedNodes[j]);
    }).observe(document.body, { childList:true, subtree:true });
    scan(document.body);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

var activeLocationLive = null;

function createLocationLiveMap(host, lat, lng, onDead){
  var order = locSourceOrder(lat, lng), si = 0, z = 16, ok = 0, bad = 0, timer = 0, dead = false, drag = null;
  var tiles = {}, cx = 0, cy = 0;
  host.innerHTML = '';
  host.className = 'pm-location-map-frame pm-loc-map pm-loc-map--live';
  var layer = document.createElement('div'); layer.className = 'pm-loc-layer';
  var pin = document.createElement('span'); pin.className = 'pm-loc-pin';
  var attr = document.createElement('span'); attr.className = 'pm-loc-attr';
  var zoomBox = document.createElement('div'); zoomBox.className = 'pm-loc-zoom';
  zoomBox.innerHTML = '<button type="button" data-loc-zoom="1" aria-label="放大"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button><button type="button" data-loc-zoom="-1" aria-label="缩小"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>';
  host.appendChild(layer); host.appendChild(pin); host.appendChild(attr); host.appendChild(zoomBox);
  var api = {};
  function src(){ return LOC_SOURCES[order[si]]; }
  function pinPx(){ return locPinPx(lat, lng, src(), z); }
  function scale(){ var r = host.getBoundingClientRect(); return host.offsetWidth ? (r.width / host.offsetWidth || 1) : 1; }
  function arm(){
    clearTimeout(timer);
    timer = setTimeout(function(){ if (!dead && ok === 0) next(); }, 6000);
  }
  function next(){
    si++; ok = 0; bad = 0;
    if (si >= order.length) { dead = true; clearTimeout(timer); if (onDead) onDead(); return; }
    z = Math.min(z, src().maxZoom);
    tiles = {}; layer.innerHTML = '';
    var p = pinPx(); cx = p.x; cy = p.y;
    render(); arm();
  }
  function render(){
    if (dead) return;
    var s = src();
    var W = (host.clientWidth || 360) + 256, H = (host.clientHeight || 480) + 256;
    var specs = locTilesAround(cx, cy, z, W, H, s), keep = {};
    specs.forEach(function(t){
      keep[t.key] = true;
      var img = tiles[t.key];
      if (!img) {
        img = document.createElement('img');
        img.className = 'pm-loc-tile'; img.alt = ''; img.draggable = false; img.decoding = 'async';
        img.dataset.sid = s.id; img.dataset.pos = String(si);
        img.src = t.url;
        tiles[t.key] = img; layer.appendChild(img);
      }
      img.style.left = 'calc(50% + ' + t.dx + 'px)'; img.style.top = 'calc(50% + ' + t.dy + 'px)';
    });
    Object.keys(tiles).forEach(function(k){ if (!keep[k]) { tiles[k].remove(); delete tiles[k]; } });
    var p = pinPx();
    pin.style.left = 'calc(50% + ' + Math.round(p.x - cx) + 'px)';
    pin.style.top = 'calc(50% + ' + Math.round(p.y - cy) + 'px)';
    attr.textContent = s.name;
  }
  api.tileResult = function(good, img){
    if (dead || String(img.dataset.pos) !== String(si)) return;
    if (good) { if (!ok) locRememberSource(lat, lng, img.dataset.sid); ok++; }
    else { bad++; if (ok === 0 && bad >= 3) next(); }
  };
  function setZoom(delta){
    var nz = Math.max(4, Math.min(src().maxZoom, z + delta));
    if (nz === z) return;
    var f = Math.pow(2, nz - z); cx *= f; cy *= f; z = nz;
    tiles = {}; layer.innerHTML = '';
    render();
  }
  host.addEventListener('pointerdown', function(e){
    if (e.target.closest && e.target.closest('.pm-loc-zoom')) return;
    drag = { x:e.clientX, y:e.clientY, cx:cx, cy:cy };
    try { host.setPointerCapture(e.pointerId); } catch(err) {}
  });
  host.addEventListener('pointermove', function(e){
    if (!drag) return;
    var k = scale();
    cx = drag.cx - (e.clientX - drag.x) / k; cy = drag.cy - (e.clientY - drag.y) / k;
    render();
  });
  function endDrag(){ drag = null; }
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
  zoomBox.addEventListener('click', function(e){
    var b = e.target.closest('[data-loc-zoom]');
    if (b) setZoom(Number(b.dataset.locZoom));
  });
  api.destroy = function(){ dead = true; clearTimeout(timer); host._locLive = null; };
  host._locLive = api;
  var p0 = pinPx(); cx = p0.x; cy = p0.y;
  render(); arm();
  return api;
}

function locationMapUrl(msg){
  var lat = normalizeCoordinate(msg && msg.lat, -90, 90), lng = normalizeCoordinate(msg && msg.lng, -180, 180);
  if (lat == null || lng == null) return '';
  var name = String(msg && msg.label || '当前位置');
  if (!locOutOfChina(lat, lng)) {
    var g = locWgsToGcj(lat, lng);
    return 'https://uri.amap.com/marker?position=' + g.lng.toFixed(6) + ',' + g.lat.toFixed(6) + '&name=' + encodeURIComponent(name) + '&coordinate=gaode&callnative=1';
  }
  return 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=17/' + lat + '/' + lng;
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
  var geo = locationGeoUri(msg), web = locationMapUrl(msg);
  if (!geo) return;
  var isAndroid = /Android/i.test(navigator.userAgent || '');
  if (isAndroid) {
    try {
      var a = document.createElement('a');
      a.href = geo; a.setAttribute('aria-hidden', 'true');
      a.style.position = 'fixed'; a.style.left = '-9999px'; a.style.width = '1px'; a.style.height = '1px'; a.style.opacity = '0';
      document.body.appendChild(a); a.click(); a.remove();
      return;
    } catch(e) {}
  }
  if (web) {
    try { window.open(web, '_blank', 'noopener,noreferrer'); } catch(err) { try { location.href = web; } catch(_) {} }
  }
}

function openLocationMapView(msg){
  if (!pmLocationMapView || !msg || msg.source === 'virtual') return;
  var lat = normalizeCoordinate(msg.lat, -90, 90), lng = normalizeCoordinate(msg.lng, -180, 180);
  if (lat == null || lng == null) return;
  activeLocationMapMessage = msg;
  var label = String(msg.label || '我的当前位置');
  var addr = String(msg.address || '').trim();
  if (pmLocationMapTitle) pmLocationMapTitle.textContent = label;
  if (pmLocationMapInfoTitle) pmLocationMapInfoTitle.textContent = label;
  if (pmLocationMapInfoMeta) { pmLocationMapInfoMeta.textContent = addr; pmLocationMapInfoMeta.hidden = !addr; }
  if (pmLocationMapFallback) pmLocationMapFallback.hidden = true;
  pmLocationMapView.classList.add('is-open');
  pmLocationMapView.setAttribute('aria-hidden', 'false');
  if (activeLocationLive) { activeLocationLive.destroy(); activeLocationLive = null; }
  if (pmLocationMapFrame) {
    activeLocationLive = createLocationLiveMap(pmLocationMapFrame, lat, lng, function(){
      if (pmLocationMapFallback) pmLocationMapFallback.hidden = false;
    });
  }
}

function closeLocationMapView(){
  if (!pmLocationMapView) return;
  pmLocationMapView.classList.remove('is-open');
  pmLocationMapView.setAttribute('aria-hidden', 'true');
  activeLocationMapMessage = null;
  if (activeLocationLive) { activeLocationLive.destroy(); activeLocationLive = null; }
  if (pmLocationMapFrame) pmLocationMapFrame.innerHTML = '';
}

/* 把经纬度换成“地点名 + 区”。几个公共服务同时问，谁先答到用谁；4 秒都没答到就只用默认名字。 */
function reverseGeocodeLocation(lat, lng){
  return new Promise(function(resolve){
    var done = false, pending = 2;
    function finish(v){ if (done) return; done = true; resolve(v || {}); }
    function miss(){ pending--; if (pending <= 0) finish({}); }
    setTimeout(function(){ finish({}); }, 4000);
    function get(url){
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      if (ctl) setTimeout(function(){ try { ctl.abort(); } catch(e) {} }, 3800);
      return fetch(url, ctl ? { signal:ctl.signal } : undefined).then(function(r){ return r.ok ? r.json() : null; });
    }
    function uniq(list){ var out = []; list.forEach(function(v){ v = String(v || '').trim(); if (v && out.indexOf(v) < 0) out.push(v); }); return out; }
    get('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=zh-CN&lat=' + lat + '&lon=' + lng).then(function(d){
      var a = d && d.address;
      if (!a) return miss();
      var area = uniq([a.city || a.town || a.village || a.county, a.city_district || a.district || a.suburb]).join('');
      var title = String(d.name || a.amenity || a.building || a.road || a.neighbourhood || a.suburb || '').trim();
      if (!title && !area) return miss();
      finish({ title:title || area, address:title ? area : '' });
    }).catch(miss);
    get('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lng + '&localityLanguage=zh').then(function(d){
      if (!d) return miss();
      var title = String(d.locality || d.city || '').trim();
      var area = uniq([d.principalSubdivision, d.city && d.city !== d.locality ? d.city : '']).join('');
      if (!title && !area) return miss();
      setTimeout(function(){ finish({ title:title || area, address:title ? area : '' }); }, 900);
    }).catch(miss);
  });
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
    islandConfirm(
      '当前角色已切换为“' + lang.name + '（' + lang.native + '）”。\n\n' +
      '“中文断句拆分提示词”主要用于简体中文回复，当前语言下可能影响自然的断句方式。\n\n' +
      '是否立即关闭“中文断句拆分提示词”？',
      {title:'关闭断句拆分提示词？', confirmText:'立即关闭', cancelText:'暂不关闭'}
    ).then(function(shouldDisableSplit){
      if (!shouldDisableSplit) return;
      persona.splitPromptEnabled = false;
      persona.disableSplitPromptForNonChinese = true;
      savePersonas();
      renderCharLanguageModal();
    });
  }

  savePersonas();
  renderCharLanguageModal();
}
