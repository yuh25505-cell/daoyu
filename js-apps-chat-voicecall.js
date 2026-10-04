/* 岛屿 · 聊天 · 语音通话
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 独立语音通话：通话文本写入 MESSAGES[type=voice_call]，供记忆系统与普通聊天上下文使用，
   但 renderMessages 会过滤这些记录，因此它们不会出现在聊天气泡中。 */
var VOICE_CALL_VAD = {
  minSpeechMs: 240,
  silenceMs: 680,
  candidateMs: 110,
  maxSpeechMs: 12000,
  thresholdFloor: 0.015,
  noiseMultiplier: 2.05
};


function formatVoiceCallDuration(ms){
  var total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  var m = Math.floor(total / 60);
  var s = total % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}


function setVoiceCallStatus(text){
  if (pmVoiceCallStatus) pmVoiceCallStatus.textContent = String(text || '');
}


function renderVoiceCallAvatar(){
  if (!pmVoiceCallAvatar) return;
  var name = String(voiceCallState.name || currentName || '角色');
  var avatar = getAvatar(name);
  if (avatar) {
    pmVoiceCallAvatar.innerHTML = '<img src="' + escapeHTML(avatar) + '" alt="">';
  } else {
    pmVoiceCallAvatar.textContent = name.charAt(0) || '?';
  }
  if (pmVoiceCallName) pmVoiceCallName.textContent = name;
  if (pmVoiceCallProfileName) pmVoiceCallProfileName.textContent = name;
}


function renderVoiceCallTurns(){
  if (!pmVoiceCallTurns) return;
  var name = String(voiceCallState.name || currentName || '角色');
  var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  var turns = list.filter(function(item){
    return item && item.type === 'voice_call' && item.callSessionId === voiceCallState.sessionId;
  });
  if (!turns.length) {
    pmVoiceCallTurns.innerHTML = '<div class="pm-voice-call-empty" id="pmVoiceCallEmpty">可以直接说话，也可以切换成文字输入。</div>';
    return;
  }
  var persona = getActiveUserPersona();
  var userAvatar = persona && persona.avatar ? persona.avatar : '';
  var html = '';
  turns.forEach(function(m){
    var isMe = m.from === 'me';
    var avatar = isMe ? userAvatar : getAvatar(name);
    var initial = isMe ? String(persona && persona.name || '我').charAt(0) : name.charAt(0);
    html += '<div class="pm-voice-call-turn ' + (isMe ? 'is-me' : 'is-char') + '">' +
      (!isMe ? '<div class="pm-voice-call-turn-avatar">' + (avatar ? '<img src="' + escapeHTML(avatar) + '" alt="">' : escapeHTML(initial || '?')) + '</div>' : '') +
      '<div class="pm-voice-call-turn-copy">' +
        '<div class="pm-voice-call-turn-bubble">' + escapeHTML(String(m.text || '')) + '</div>' +
      '</div>' +
      (isMe ? '<div class="pm-voice-call-turn-avatar">' + (avatar ? '<img src="' + escapeHTML(avatar) + '" alt="">' : escapeHTML(initial || '?')) + '</div>' : '') +
    '</div>';
  });
  pmVoiceCallTurns.innerHTML = html;
  requestAnimationFrame(function(){
    if (pmVoiceCallTurns) pmVoiceCallTurns.scrollTo({ top:pmVoiceCallTurns.scrollHeight, behavior:'smooth' });
  });
}


function appendVoiceCallTurn(name, from, text, inputMode, sessionId){
  name = String(name || '');
  text = String(text || '').trim();
  if (!name || !text) return null;
  if (!Array.isArray(MESSAGES[name])) MESSAGES[name] = [];
  var msg = {
    id:genId('voice_call_'),
    from:from === 'me' ? 'me' : 'them',
    type:'voice_call',
    channel:'voice_call',
    inputMode:inputMode === 'voice' ? 'voice' : 'text',
    text:text,
    callSessionId:String(sessionId || voiceCallState.sessionId || genId('call_')),
    createdAt:Date.now()
  };
  MESSAGES[name].push(msg);
  saveMessages(name);
  var phoneRecord = phoneCallBySessionId(msg.callSessionId);
  if (!phoneRecord) phoneRecord = ensurePhoneCallRecord(name, msg.callSessionId, msg.createdAt);
  if (phoneRecord) {
    phoneRecord.messageCount = getVoiceCallMessages(name, msg.callSessionId).length;
    phoneRecord.preview = text.slice(0, 100);
    phoneRecord.updatedAt = msg.createdAt;
    if (phoneRecord.status !== 'completed') {
      phoneRecord.status = 'ongoing';
      phoneRecord.durationMs = Math.max(0, Number(msg.createdAt || Date.now()) - Number(phoneRecord.startedAt || msg.createdAt || Date.now()));
    }
    savePhoneCalls();
    renderPhoneLists();
  }
  if (voiceCallState.active && voiceCallState.name === name) renderVoiceCallTurns();
  return msg;
}


function updateVoiceCallControls(){
  if (pmVoiceCallView) pmVoiceCallView.classList.toggle('is-processing', !!voiceCallState.processing);
  if (pmVoiceCallMicBtn) {
    pmVoiceCallMicBtn.classList.toggle('is-off', !voiceCallState.micOn);
    pmVoiceCallMicBtn.classList.toggle('is-listening', !!voiceCallState.micOn && !voiceCallState.processing);
    pmVoiceCallMicBtn.classList.toggle('is-speaking', !!voiceCallState.recording);
    pmVoiceCallMicBtn.setAttribute('aria-label', voiceCallState.micOn ? '停止自动听说' : '开始自动听说');
  }
  if (pmVoiceCallHint) {
    if (voiceCallState.processing) pmVoiceCallHint.textContent = '正在处理这句话；处理完成后会继续自动聆听。';
    else if (voiceCallState.recording) pmVoiceCallHint.textContent = '正在录音，停止说话后会自动转文字并发送给对方。';
    else if (voiceCallState.micOn) pmVoiceCallHint.textContent = '自动听说已开启：说完停一下即可自动发送，不需要长按。';
    else pmVoiceCallHint.textContent = '点击左侧麦克风开始自动听说；中间也可以直接输入文字。';
  }
}


function stopVoiceCallAudio(){
  if (voiceCallState.vadFrame) {
    try { cancelAnimationFrame(voiceCallState.vadFrame); } catch(e) {}
    voiceCallState.vadFrame = 0;
  }
  if (voiceCallState.recorder) {
    try {
      voiceCallState.recorder.ondataavailable = null;
      voiceCallState.recorder.onstop = null;
      if (voiceCallState.recorder.state !== 'inactive') voiceCallState.recorder.stop();
    } catch(e) {}
    voiceCallState.recorder = null;
  }
  voiceCallState.recording = false;
  voiceCallState.chunks = [];
  if (voiceCallState.analyserSource) {
    try { voiceCallState.analyserSource.disconnect(); } catch(e) {}
  }
  voiceCallState.analyserSource = null;
  voiceCallState.analyser = null;
  if (voiceCallState.audioContext) {
    try { voiceCallState.audioContext.close(); } catch(e) {}
  }
  voiceCallState.audioContext = null;
  if (voiceCallState.stream) {
    voiceCallState.stream.getTracks().forEach(function(track){ try { track.stop(); } catch(e) {} });
  }
  voiceCallState.stream = null;
  voiceCallState.micOn = false;
  voiceCallState.processing = false;
  voiceCallState.speechCandidateAt = 0;
  voiceCallState.speechStartedAt = 0;
  voiceCallState.lastSpeechAt = 0;
  updateVoiceCallControls();
}


function stopVoiceCallUtterance(forceCancel){
  var recorder = voiceCallState.recorder;
  if (!recorder || recorder.state === 'inactive') {
    voiceCallState.recording = false;
    voiceCallState.recorder = null;
    voiceCallState.chunks = [];
    return false;
  }
  recorder.__cancelled = !!forceCancel;
  try {
    if (typeof recorder.requestData === 'function') recorder.requestData();
  } catch(e) {}
  try { recorder.stop(); } catch(e) {}
  return true;
}


function chooseVoiceCallMimeType(){
  var types = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
  if (typeof MediaRecorder === 'undefined') return '';
  for (var i=0;i<types.length;i++) {
    try {
      if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(types[i])) return types[i];
    } catch(e) {}
  }
  return '';
}


function startVoiceCallUtterance(){
  if (!voiceCallState.active || !voiceCallState.micOn || voiceCallState.processing || voiceCallState.recording || !voiceCallState.stream) return;
  if (typeof MediaRecorder === 'undefined') {
    setVoiceCallStatus('当前环境不支持录音');
    return;
  }
  var mimeType = chooseVoiceCallMimeType();
  var recorder = null;
  try {
    recorder = mimeType ? new MediaRecorder(voiceCallState.stream, {mimeType:mimeType}) : new MediaRecorder(voiceCallState.stream);
  } catch(e) {
    try { recorder = new MediaRecorder(voiceCallState.stream); } catch(err) {
      setVoiceCallStatus('无法开始录音');
      return;
    }
  }
  voiceCallState.recorder = recorder;
  voiceCallState.chunks = [];
  voiceCallState.recording = true;
  voiceCallState.speechStartedAt = performance.now();
  voiceCallState.lastSpeechAt = voiceCallState.speechStartedAt;
  setVoiceCallStatus('正在聆听…');
  updateVoiceCallControls();

  recorder.ondataavailable = function(e){
    if (e.data && e.data.size) voiceCallState.chunks.push(e.data);
  };
  recorder.onerror = function(){
    voiceCallState.recording = false;
    voiceCallState.recorder = null;
    voiceCallState.chunks = [];
    setVoiceCallStatus('录音失败，请重试');
    updateVoiceCallControls();
  };
  recorder.onstop = function(){
    var chunks = voiceCallState.chunks.slice();
    var started = voiceCallState.speechStartedAt || performance.now();
    var duration = Math.max(0, (performance.now() - started) / 1000);
    var cancelled = !!recorder.__cancelled;
    var blobType = recorder.mimeType || mimeType || 'audio/webm';
    voiceCallState.recording = false;
    voiceCallState.recorder = null;
    voiceCallState.chunks = [];
    voiceCallState.speechCandidateAt = 0;
    voiceCallState.speechStartedAt = 0;
    voiceCallState.lastSpeechAt = 0;
    updateVoiceCallControls();
    if (cancelled || !voiceCallState.active) return;
    if (duration * 1000 < VOICE_CALL_VAD.minSpeechMs || !chunks.length) {
      setVoiceCallStatus('正在聆听…');
      return;
    }
    var blob = new Blob(chunks, {type:blobType});
    if (blob.size < 200) {
      setVoiceCallStatus('正在聆听…');
      return;
    }
    processVoiceCallAudio(blob, duration);
  };
  try { recorder.start(180); } catch(e) {
    voiceCallState.recording = false;
    voiceCallState.recorder = null;
    voiceCallState.chunks = [];
    setVoiceCallStatus('无法开始录音');
    updateVoiceCallControls();
  }
}


function monitorVoiceCallVAD(){
  if (!voiceCallState.active || !voiceCallState.micOn || !voiceCallState.analyser) return;
  var analyser = voiceCallState.analyser;
  var data = new Uint8Array(analyser.fftSize || 1024);
  function frame(){
    if (!voiceCallState.active || !voiceCallState.micOn || !voiceCallState.analyser) return;
    analyser.getByteTimeDomainData(data);
    var sum = 0;
    for (var i=0;i<data.length;i++) {
      var v = (data[i] - 128) / 128;
      sum += v * v;
    }
    var rms = Math.sqrt(sum / data.length);
    if (!voiceCallState.recording && !voiceCallState.processing) {
      voiceCallState.noiseFloor = Math.max(0.003, Math.min(0.12, voiceCallState.noiseFloor * .96 + rms * .04));
      var threshold = Math.max(VOICE_CALL_VAD.thresholdFloor, voiceCallState.noiseFloor * VOICE_CALL_VAD.noiseMultiplier);
      if (rms > threshold) {
        if (!voiceCallState.speechCandidateAt) voiceCallState.speechCandidateAt = performance.now();
        if (performance.now() - voiceCallState.speechCandidateAt >= VOICE_CALL_VAD.candidateMs) {
          voiceCallState.speechCandidateAt = 0;
          startVoiceCallUtterance();
        }
      } else {
        voiceCallState.speechCandidateAt = 0;
        if (!voiceCallState.processing) setVoiceCallStatus('可以说话…');
      }
    } else if (voiceCallState.recording) {
      var thresholdDuring = Math.max(VOICE_CALL_VAD.thresholdFloor, voiceCallState.noiseFloor * VOICE_CALL_VAD.noiseMultiplier);
      if (rms > thresholdDuring) {
        voiceCallState.lastSpeechAt = performance.now();
      }
      var now = performance.now();
      if (now - voiceCallState.speechStartedAt >= VOICE_CALL_VAD.maxSpeechMs) {
        stopVoiceCallUtterance(false);
      } else if (voiceCallState.lastSpeechAt && now - voiceCallState.lastSpeechAt >= VOICE_CALL_VAD.silenceMs) {
        stopVoiceCallUtterance(false);
      }
    }
    voiceCallState.vadFrame = requestAnimationFrame(frame);
  }
  if (!voiceCallState.vadFrame) voiceCallState.vadFrame = requestAnimationFrame(frame);
}


function startVoiceCallMic(){
  if (!voiceCallState.active || voiceCallState.micOn) return Promise.resolve(true);
  if (voiceCallState.processing) return Promise.resolve(false);
  if (!isSttReady()) {
    setVoiceCallStatus('请先在设置中配置语音转文字接口');
    if (pmVoiceCallHint) pmVoiceCallHint.textContent = '语音通话需要可用的 STT API；文字输入仍然可以正常使用。';
    return Promise.resolve(false);
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    setVoiceCallStatus('当前 WebView 不支持麦克风录音');
    return Promise.resolve(false);
  }
  var session = voiceCallState.sessionId;
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  try {
    // 必须在麦克风按钮的用户手势链路里创建 AudioContext，避免 Android WebView 保持 suspended，导致 VAD 永远检测不到声音。
    if (AC) {
      ctx = new AC();
      voiceCallState.audioContext = ctx;
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        try { ctx.resume(); } catch(e) {}
      }
    }
  } catch(e) {
    ctx = null;
    voiceCallState.audioContext = null;
  }
  setVoiceCallStatus('正在连接麦克风…');
  return navigator.mediaDevices.getUserMedia({
    audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}
  }).then(function(stream){
    if (!voiceCallState.active || voiceCallState.sessionId !== session) {
      stream.getTracks().forEach(function(track){ try { track.stop(); } catch(e) {} });
      if (ctx) try { ctx.close(); } catch(e) {}
      return false;
    }
    if (!ctx && AC) ctx = new AC();
    if (!ctx) {
      stream.getTracks().forEach(function(track){ try { track.stop(); } catch(e) {} });
      throw new Error('当前 WebView 不支持音频分析');
    }
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = .18;
    var source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    voiceCallState.stream = stream;
    voiceCallState.audioContext = ctx;
    voiceCallState.analyser = analyser;
    voiceCallState.analyserSource = source;
    voiceCallState.micOn = true;
    voiceCallState.micWanted = true;
    voiceCallState.noiseFloor = .006;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      return Promise.resolve(ctx.resume()).catch(function(){}).then(function(){
        setVoiceCallStatus('可以说话…');
        updateVoiceCallControls();
        monitorVoiceCallVAD();
        return true;
      });
    }
    setVoiceCallStatus('可以说话…');
    updateVoiceCallControls();
    monitorVoiceCallVAD();
    return true;
  }).catch(function(err){
    if (ctx && voiceCallState.audioContext === ctx) { try { ctx.close(); } catch(e) {} }
    voiceCallState.audioContext = null;
    voiceCallState.micOn = false;
    updateVoiceCallControls();
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      setVoiceCallStatus('请允许麦克风权限后重试');
    } else if (err && err.name === 'NotFoundError') {
      setVoiceCallStatus('没有找到可用的麦克风');
    } else {
      setVoiceCallStatus('无法访问麦克风');
    }
    console.error('[岛屿] 语音通话麦克风失败：', err);
    return false;
  });
}


function stopVoiceCallMic(){
  if (voiceCallState.recording) stopVoiceCallUtterance(true);
  if (voiceCallState.vadFrame) {
    try { cancelAnimationFrame(voiceCallState.vadFrame); } catch(e) {}
    voiceCallState.vadFrame = 0;
  }
  if (voiceCallState.analyserSource) {
    try { voiceCallState.analyserSource.disconnect(); } catch(e) {}
  }
  voiceCallState.analyserSource = null;
  voiceCallState.analyser = null;
  if (voiceCallState.audioContext) {
    try { voiceCallState.audioContext.close(); } catch(e) {}
  }
  voiceCallState.audioContext = null;
  if (voiceCallState.stream) {
    voiceCallState.stream.getTracks().forEach(function(track){ try { track.stop(); } catch(e) {} });
  }
  voiceCallState.stream = null;
  voiceCallState.micOn = false;
  voiceCallState.micWanted = false;
  voiceCallState.speechCandidateAt = 0;
  voiceCallState.speechStartedAt = 0;
  voiceCallState.lastSpeechAt = 0;
  updateVoiceCallControls();
}


function processVoiceCallAudio(blob, duration){
  if (!voiceCallState.active) return;
  voiceCallState.processing = true;
  setVoiceCallStatus('正在识别你说的话…');
  updateVoiceCallControls();
  var name = voiceCallState.name;
  var sessionId = voiceCallState.sessionId;
  callSttOnce(blob, getSttConfig()).then(function(text){
    text = String(text || '').trim();
    if (!text) throw new Error('语音转写结果为空');
    appendVoiceCallTurn(name, 'me', text, 'voice', sessionId);
    return requestVoiceCallReply(name, sessionId);
  }).catch(function(err){
    console.error('[岛屿] 语音通话转写失败：', err);
    setVoiceCallStatus('语音识别失败，请再说一次');
    toast('语音识别失败：' + String(err && err.message || '未知错误').slice(0, 55));
  }).then(function(){
    voiceCallState.processing = false;
    if (voiceCallState.active && voiceCallState.name === name) {
      setVoiceCallStatus(voiceCallState.micOn ? '可以说话…' : '点击左侧麦克风开始自动听说');
      updateVoiceCallControls();
    }
  });
}


function cleanVoiceCallReplyText(text){
  var value = String(text || '').trim();
  // 即使模型错误地把上下文标记复述出来，也只保留正文。
  value = value.replace(/^\s*(?:\[|【)语音通话记录(?:｜|\||\s*[:-])[^\]】\n]*?(?:\]|】)\s*/i, '');
  value = value.replace(/^\s*语音通话(?:·|\||:)[^\n]*\n?/i, '');
  return value.trim();
}


function splitVoiceCallReply(raw){
  var text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return [];
  var tagged = [];
  var re = /<bubble>([\s\S]*?)<\/bubble>/gi;
  var match;
  while ((match = re.exec(text))) {
    var piece = cleanVoiceCallReplyText(match[1]);
    if (piece) tagged.push(piece);
  }
  if (tagged.length) return tagged.slice(0, 8);
  text = text.replace(/```(?:text|txt|bubble)?\s*/gi, '').replace(/```/g, '').trim();
  var parts = text.split(/\n\s*\n+/).map(function(v){ return cleanVoiceCallReplyText(v); }).filter(Boolean);
  if (parts.length <= 1 && text.indexOf('\n') >= 0) {
    var lines = text.split('\n').map(function(v){ return cleanVoiceCallReplyText(v); }).filter(Boolean);
    if (lines.length >= 2 && lines.length <= 8 && lines.every(function(v){ return v.length <= 240; })) parts = lines;
  }
  return parts.slice(0, 8);
}


function requestVoiceCallReply(name, sessionId){
  name = String(name || '');
  if (!name || !isApiReady()) {
    return Promise.reject(new Error('请先在设置中配置 AI 接口'));
  }
  return prepareMemoryForContext(name).then(function(){
    var messages = buildMessages(name, {
      excludeMessageId: getLatestUserMessageId(name)
    });
    if (messages.length && messages[0] && messages[0].role === 'system') {
      messages[0].content += '\n\n【语音通话回复格式】你现在正在进行实时语音通话。回复可以自然地拆成多条短气泡；需要拆分时，请用 <bubble>第一段</bubble><bubble>第二段</bubble> 的格式包住每一段。每段尽量短一些，像真实聊天中的连续说话，不要输出 JSON，不要输出“气泡1/气泡2”等说明文字。';
    }
    return callApiOnce(messages);
  }).then(function(text){
    var reply = String(text || '').trim();
    var parts = splitVoiceCallReply(reply);
    if (!parts.length) throw new Error('AI 返回为空');
    parts.forEach(function(part){
      appendVoiceCallTurn(name, 'them', part, 'text', sessionId);
    });
    return parts.join('\n');
  });
}


function sendVoiceCallText(){
  if (!voiceCallState.active || !voiceCallState.name || voiceCallState.processing) return false;
  var input = String(pmVoiceCallInput ? pmVoiceCallInput.value : '').trim();
  if (!input) {
    if (pmVoiceCallInput) pmVoiceCallInput.focus();
    return false;
  }
  var name = voiceCallState.name;
  var sessionId = voiceCallState.sessionId;
  appendVoiceCallTurn(name, 'me', input, 'text', sessionId);
  if (pmVoiceCallInput) {
    pmVoiceCallInput.value = '';
    pmVoiceCallInput.style.height = 'auto';
  }
  voiceCallState.processing = true;
  updateVoiceCallControls();
  setVoiceCallStatus('对方正在回复…');
  requestVoiceCallReply(name, sessionId).catch(function(err){
    console.error('[岛屿] 语音通话 AI 回复失败：', err);
    toast('AI 调用失败：' + String(err && err.message || '未知错误').slice(0, 60));
    setVoiceCallStatus('回复失败，请重试');
  }).then(function(){
    voiceCallState.processing = false;
    if (voiceCallState.active && voiceCallState.name === name) {
      setVoiceCallStatus(voiceCallState.micOn ? '可以说话…' : '点击左侧麦克风开始自动听说');
      updateVoiceCallControls();
    }
  });
  return true;
}


function clearIncomingCallNotice(skipAnimation){
  clearTimeout(incomingCallNoticeTimer);
  if (!pmIncomingCallNotice) return;
  if (skipAnimation) {
    pmIncomingCallNotice.classList.remove('is-open','is-closing');
    pmIncomingCallNotice.setAttribute('aria-hidden','true');
    return;
  }
  if (!pmIncomingCallNotice.classList.contains('is-open')) {
    pmIncomingCallNotice.classList.remove('is-closing');
    pmIncomingCallNotice.setAttribute('aria-hidden','true');
    return;
  }
  pmIncomingCallNotice.classList.add('is-closing');
  incomingCallNoticeTimer = setTimeout(function(){
    if (!pmIncomingCallNotice) return;
    pmIncomingCallNotice.classList.remove('is-open','is-closing');
    pmIncomingCallNotice.setAttribute('aria-hidden','true');
  }, 260);
}

function renderIncomingCallNotice(name, event){
  if (!pmIncomingCallNotice) return;
  var callName = String(name || (event && event.sender) || '角色').trim() || '角色';
  var greeting = String(event && event.greeting || '').trim();
  var avatar = getAvatar(callName);
  if (pmIncomingCallTitle) pmIncomingCallTitle.textContent = callName;
  if (pmIncomingCallText) pmIncomingCallText.textContent = greeting || '邀请你接听语音通话';
  if (pmIncomingCallAvatar) {
    if (avatar) pmIncomingCallAvatar.innerHTML = '<img src="' + escapeHTML(avatar) + '" alt="">';
    else pmIncomingCallAvatar.textContent = callName.slice(0,1) || '角';
  }
  pmIncomingCallNotice.classList.remove('is-closing');
  pmIncomingCallNotice.classList.add('is-open');
  pmIncomingCallNotice.setAttribute('aria-hidden','false');
}

function showIncomingVoiceCall(event, nameHint){
  if(!event)return false;
  var name=String(nameHint||event.sender||currentName||'').trim();
  if(!name)return false;
  if(voiceCallState.active){
    toast('当前正在语音通话，无法接听新的来电');
    return false;
  }
  clearIncomingCallNotice(true);
  voiceCallState.active=false;voiceCallState.incoming=true;voiceCallState.name=name;voiceCallState.sessionId=String(event.callSessionId||genId('call_'));voiceCallState.startedAt=0;voiceCallState.incomingEventId=String(event.id||'');voiceCallState.incomingGreeting=String(event.greeting||'');
  renderIncomingCallNotice(name,event);
  return true;
}

function closeIncomingVoiceCall(status){
  status=status==='accepted'?'accepted':'declined';var eventId=String(voiceCallState.incomingEventId||''),name=String(voiceCallState.name||currentName||'');
  if(name&&eventId){var list=MESSAGES[name]||[];for(var i=0;i<list.length;i++)if(list[i]&&String(list[i].id)===eventId){list[i].handled=true;list[i].handledStatus=status;list[i].handledAt=Date.now();break;}saveMessages(name);saveChats();}
  voiceCallState.incoming=false;voiceCallState.incomingEventId='';voiceCallState.incomingGreeting='';voiceCallState.name='';voiceCallState.sessionId='';
  clearIncomingCallNotice(status==='declined' ? false : true);
  if(pmVoiceCallView){pmVoiceCallView.classList.remove('is-open','is-incoming');pmVoiceCallView.setAttribute('aria-hidden','true');}
  if(pmVoiceCallComposer)pmVoiceCallComposer.classList.remove('is-incoming');var acts=$('pmVoiceCallIncomingActions');if(acts)acts.hidden=true;document.documentElement.classList.remove('pm-voice-call-open');
  if (currentName && name === currentName) renderMessages(false);
  return true;
}

function acceptIncomingVoiceCall(){
  if(!voiceCallState.incoming)return false;var name=String(voiceCallState.name||currentName||''),sid=String(voiceCallState.sessionId||genId('call_')),eid=String(voiceCallState.incomingEventId||''),greeting=String(voiceCallState.incomingGreeting||'');if(!name)return false;var list=Array.isArray(MESSAGES[name])?MESSAGES[name]:[],eventMsg=null;for(var i=0;i<list.length;i++)if(list[i]&&String(list[i].id)===eid){eventMsg=list[i];break;}if(eventMsg){eventMsg.handled=true;eventMsg.handledStatus='accepted';eventMsg.handledAt=Date.now();}
  clearIncomingCallNotice(true);
  if (currentName !== name) openPM(name);
  voiceCallState.incoming=false;voiceCallState.active=true;voiceCallState.sessionId=sid;voiceCallState.startedAt=Date.now();voiceCallState.incomingEventId='';voiceCallState.incomingGreeting='';voiceCallState.micOn=false;voiceCallState.micWanted=false;voiceCallState.processing=false;voiceCallState.textMode=false;voiceCallState.resumeMicAfterText=false;voiceCallState.replyBusy=false;ensurePhoneCallRecord(name,sid,voiceCallState.startedAt);if(greeting)appendVoiceCallTurn(name,'them',greeting,'text',sid);renderVoiceCallAvatar();renderVoiceCallTurns();setVoiceCallStatus('已接听，点击麦克风开始说话');if(pmVoiceCallDuration)pmVoiceCallDuration.textContent='00:00';if(pmVoiceCallInput){pmVoiceCallInput.value='';pmVoiceCallInput.style.height='auto';}if(pmVoiceCallComposer)pmVoiceCallComposer.classList.remove('is-incoming');var acts=$('pmVoiceCallIncomingActions');if(acts)acts.hidden=true;pmVoiceCallView.classList.remove('is-incoming');pmVoiceCallView.classList.add('is-open');pmVoiceCallView.setAttribute('aria-hidden','false');document.documentElement.classList.add('pm-voice-call-open');if(voiceCallState.durationTimer)clearInterval(voiceCallState.durationTimer);voiceCallState.durationTimer=setInterval(function(){if(!voiceCallState.active)return;if(pmVoiceCallDuration)pmVoiceCallDuration.textContent=formatVoiceCallDuration(Date.now()-voiceCallState.startedAt);},1000);saveMessages(name);savePhoneCalls();return true;
}

function rejectIncomingVoiceCall(){return closeIncomingVoiceCall('declined');}


function openVoiceCallView(){
  if (!pmVoiceCallView || !currentName) return;
  closePanel();
  closeVoiceTextComposer();
  releaseInputFocus();
  stopVoiceCallAudio();
  voiceCallState.incoming=false; voiceCallState.incomingEventId=''; voiceCallState.incomingGreeting='';
  var _acts=$('pmVoiceCallIncomingActions'); if(_acts) _acts.hidden=true;
  if(pmVoiceCallComposer) pmVoiceCallComposer.classList.remove('is-incoming');
  pmVoiceCallView.classList.remove('is-incoming');
  voiceCallState.active = true;
  voiceCallState.name = currentName;
  voiceCallState.sessionId = genId('call_');
  voiceCallState.startedAt = Date.now();
  ensurePhoneCallRecord(currentName, voiceCallState.sessionId, voiceCallState.startedAt);
  voiceCallState.micOn = false;
  voiceCallState.micWanted = false;
  voiceCallState.processing = false;
  voiceCallState.textMode = false;
  voiceCallState.resumeMicAfterText = false;
  voiceCallState.replyBusy = false;
  renderVoiceCallAvatar();
  renderVoiceCallTurns();
  setVoiceCallStatus('点击左侧麦克风开始自动听说');
  if (pmVoiceCallDuration) pmVoiceCallDuration.textContent = '00:00';
  if (pmVoiceCallInput) { pmVoiceCallInput.value = ''; pmVoiceCallInput.style.height = 'auto'; }
  updateVoiceCallControls();
  pmVoiceCallView.classList.add('is-open');
  pmVoiceCallView.setAttribute('aria-hidden','false');
  document.documentElement.classList.add('pm-voice-call-open');
  if (voiceCallState.durationTimer) clearInterval(voiceCallState.durationTimer);
  voiceCallState.durationTimer = setInterval(function(){
    if (!voiceCallState.active) return;
    if (pmVoiceCallDuration) pmVoiceCallDuration.textContent = formatVoiceCallDuration(Date.now() - voiceCallState.startedAt);
  }, 1000);
  // 麦克风改为由左侧按钮明确开启；这样 Android WebView 能在用户手势链路内创建 AudioContext，VAD 更可靠。
}


function closeVoiceCallView(options){
  options = options || {};
  if (!voiceCallState.active && !(pmVoiceCallView && pmVoiceCallView.classList.contains('is-open'))) return;
  var closingSessionId = voiceCallState.sessionId;
  var closingEndedAt = Date.now();
  stopVoiceCallAudio();
  if (closingSessionId) finalizePhoneCallRecord(closingSessionId, closingEndedAt);
  if (voiceCallState.durationTimer) { clearInterval(voiceCallState.durationTimer); voiceCallState.durationTimer = null; }
  voiceCallState.active = false;
  voiceCallState.incoming = false; voiceCallState.incomingEventId=''; voiceCallState.incomingGreeting='';
  voiceCallState.name = '';
  voiceCallState.sessionId = '';
  voiceCallState.startedAt = 0;
  voiceCallState.textMode = false;
  voiceCallState.resumeMicAfterText = false;
  voiceCallState.replyBusy = false;
  if (pmVoiceCallView) {
    pmVoiceCallView.classList.remove('is-open','is-processing');
    pmVoiceCallView.setAttribute('aria-hidden','true');
  }
  document.documentElement.classList.remove('pm-voice-call-open');
  if(pmVoiceCallComposer) pmVoiceCallComposer.classList.remove('is-incoming'); var _acts2=$('pmVoiceCallIncomingActions'); if(_acts2) _acts2.hidden=true; if(pmVoiceCallView) pmVoiceCallView.classList.remove('is-incoming');
  if (pmVoiceCallInput) { pmVoiceCallInput.value = ''; pmVoiceCallInput.style.height = 'auto'; }
  updateVoiceCallControls();
  if (!options.silent) {
    // 明确结束后回到聊天；通话内容本身已经留在隐藏上下文记录里。
    renderMessages(false);
    scrollBottom(false);
  }
}
