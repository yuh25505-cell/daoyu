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
  var shownName = (typeof getSessionCharDisplayName === 'function' ? getSessionCharDisplayName(name) : name) || name;
  if (pmVoiceCallName) pmVoiceCallName.textContent = shownName;
  if (pmVoiceCallProfileName) pmVoiceCallProfileName.textContent = shownName;
}


/* 一条通话记录变成一行画面：对话是气泡，动作、神态、环境描写是居中的旁白（没有气泡） */
function voiceCallTurnHTML(m){
  var text = escapeHTML(String(m && m.text || ''));
  if (m && m.narration === true) {
    return '<div class="pm-voice-call-turn is-narration"><div class="pm-voice-call-narration">' + text + '</div></div>';
  }
  var isMe = m && m.from === 'me';
  return '<div class="pm-voice-call-turn ' + (isMe ? 'is-me' : 'is-char') + '">' +
    '<div class="pm-voice-call-turn-copy">' +
      '<div class="pm-voice-call-turn-bubble">' + text + '</div>' +
    '</div>' +
  '</div>';
}


function renderVoiceCallTurns(){
  if (!pmVoiceCallTurns) return;
  var name = String(voiceCallState.name || currentName || '角色');
  var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  var turns = list.filter(function(item){
    return item && item.type === 'voice_call' && item.callSessionId === voiceCallState.sessionId;
  });
  if (!turns.length) {
    pmVoiceCallTurns.innerHTML = '';
    return;
  }
  var html = '';
  turns.forEach(function(m){ html += voiceCallTurnHTML(m); });
  pmVoiceCallTurns.innerHTML = html;
  requestAnimationFrame(function(){
    if (pmVoiceCallTurns) pmVoiceCallTurns.scrollTo({ top:pmVoiceCallTurns.scrollHeight, behavior:'smooth' });
  });
}


function appendVoiceCallTurn(name, from, text, inputMode, sessionId, isNarration){
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
  if (isNarration === true) msg.narration = true;
  MESSAGES[name].push(msg);
  saveMessages(name);
  var phoneRecord = phoneCallBySessionId(msg.callSessionId);
  if (!phoneRecord) phoneRecord = ensurePhoneCallRecord(name, msg.callSessionId, msg.createdAt);
  if (phoneRecord) {
    phoneRecord.messageCount = getVoiceCallMessages(name, msg.callSessionId).length;
    if (!msg.narration) phoneRecord.preview = text.slice(0, 100);
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
  if (pmVoiceCallView) pmVoiceCallView.classList.toggle('has-pending', !!voiceCallState.pendingReply);
  if (pmVoiceCallMicBtn) {
    pmVoiceCallMicBtn.classList.toggle('is-off', !voiceCallState.micOn);
    pmVoiceCallMicBtn.classList.toggle('is-listening', !!voiceCallState.micOn && !voiceCallState.processing);
    pmVoiceCallMicBtn.classList.toggle('is-speaking', !!voiceCallState.recording);
    pmVoiceCallMicBtn.setAttribute('aria-label', voiceCallState.micOn ? '停止自动听说' : '开始自动听说');
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
    setVoiceCallStatus('语音通话需要可用的 STT API；文字输入仍然可以正常使用。');
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
    voiceCallState.pendingReply = false;
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


/* 把一段话拆成「对话」和「动作旁白」两种：
 * say = 角色真正说出口的话（走气泡）；act = 动作、神态、心理、环境描写（走旁白）。
 * 认的写法：<narration>…</narration>、（…）、(…)、*…*。 */
function splitVoiceCallSegments(raw){
  var text = String(raw || '').replace(/\r/g, '');
  var out = [];
  var re = /<(?:narration|action)>([\s\S]*?)<\/(?:narration|action)>|（([^（）\n]+)）|\*([^*\n]+)\*|＊([^＊\n]+)＊|\(([^()\n]+)\)/gi;
  var last = 0, m;
  function pushSay(v){
    v = cleanVoiceCallReplyText(v);
    if (v) out.push({ kind:'say', text:v });
  }
  while ((m = re.exec(text))) {
    var inner = m[1] != null ? m[1] : (m[2] != null ? m[2] : (m[3] != null ? m[3] : (m[4] != null ? m[4] : m[5])));
    var isHalfParen = m[5] != null;
    if (isHalfParen) {
      /* 半角括号只在句首或标点后才当成动作，避免把 “北京(朝阳区)” 这种正文误判 */
      var before = text.slice(Math.max(0, m.index - 1), m.index);
      if (before && !/[\s。！？!?.，,、~～…—]/.test(before)) continue;
    }
    pushSay(text.slice(last, m.index));
    inner = String(inner || '').replace(/\s+/g, ' ').trim();
    if (inner) out.push({ kind:'act', text:inner });
    last = m.index + m[0].length;
  }
  pushSay(text.slice(last));
  return out;
}


/* 一次回复 → 按先后顺序排好的 [{kind:'say'|'act', text}]，对话和旁白穿插保持原顺序 */
function parseVoiceCallReply(raw){
  var text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return [];
  text = text.replace(/```(?:text|txt|bubble)?\s*/gi, '').replace(/```/g, '').trim();
  var items = [];
  var hasBubble = /<bubble>/i.test(text);
  if (hasBubble) {
    var re = /<bubble>([\s\S]*?)<\/bubble>|<(?:narration|action)>([\s\S]*?)<\/(?:narration|action)>/gi;
    var m;
    while ((m = re.exec(text))) {
      if (m[1] != null) {
        splitVoiceCallSegments(m[1]).forEach(function(seg){ items.push(seg); });
      } else {
        var act = String(m[2] || '').replace(/\s+/g, ' ').trim();
        if (act) items.push({ kind:'act', text:act });
      }
    }
    if (items.length) return items.slice(0, 12);
  }
  var parts = text.split(/\n\s*\n+/);
  if (parts.length <= 1 && text.indexOf('\n') >= 0) {
    var lines = text.split('\n').filter(function(v){ return v.trim(); });
    if (lines.length >= 2 && lines.length <= 10 && lines.every(function(v){ return v.length <= 240; })) parts = lines;
  }
  parts.forEach(function(part){
    splitVoiceCallSegments(part).forEach(function(seg){ items.push(seg); });
  });
  return items.slice(0, 12);
}


function requestVoiceCallReply(name, sessionId){
  name = String(name || '');
  if (!name || !isApiReady()) {
    return Promise.reject(new Error('请先在设置中配置 AI 接口'));
  }
  var callOptions = getVoiceCallPromptOptions(name);
  return prepareMemoryForContext(name).then(function(){ return prepareVisionForContext(name); }).then(function(){
    /* 人设、用户人设、世界书、记忆、上下文和预设提示词都走这一条，语音通话专用的说话方式和格式在预设的“语音通话”模块里 */
    callOptions.excludeMessageId = getLatestUserMessageId(name);
    var messages = buildMessages(name, callOptions);
    return callApiOnce(messages);
  }).then(function(text){
    var reply = String(text || '').trim();
    var items = parseVoiceCallReply(reply);
    if (!items.length) throw new Error('AI 返回为空');
    /* 动作旁白关掉时，只留说出口的话；如果整段回复全是旁白，就保留原样，避免一句话都没有 */
    if (callOptions.voiceCallNarration === false) {
      var onlySay = items.filter(function(item){ return item.kind !== 'act'; });
      if (onlySay.length) items = onlySay;
    }
    var spoken = [];
    items.forEach(function(item){
      if (item.kind === 'act') {
        appendVoiceCallTurn(name, 'them', item.text, 'text', sessionId, true);
      } else {
        appendVoiceCallTurn(name, 'them', item.text, 'text', sessionId, false);
        spoken.push(item.text);
      }
    });
    if (spoken.length && isCharVoiceActive(name)) speakCharTexts(spoken, getCharVoiceSettings(name).voiceId);
    return spoken.length ? spoken.join('\n') : items.map(function(item){ return item.text; }).join('\n');
  });
}


/* ───────── 通话设置：挂哪些世界书、动作旁白开关（每个角色各存一份，存在该角色的会话设置里） ───────── */
function getVoiceCallSettings(name){
  name = String(name || voiceCallState.name || currentName || '');
  var s = getSessionChatSettings(name, false) || {};
  var custom = s.voiceCallWorldbookMode === 'custom';
  var ids = Array.isArray(s.voiceCallWorldbookIds) ? s.voiceCallWorldbookIds.map(String) : [];
  return { custom:custom, worldbookIds:ids, narration:s.voiceCallNarration !== false };
}

function saveVoiceCallSettings(name, patch){
  name = String(name || voiceCallState.name || currentName || '');
  if (!name) return;
  var s = getSessionChatSettings(name, true);
  Object.keys(patch || {}).forEach(function(key){
    if (typeof patch[key] === 'undefined') delete s[key]; else s[key] = patch[key];
  });
  persistSessionChat(name, false);
}

/* 给 buildMessages 用：场景固定为语音通话；自选世界书时只带选中的那几本，已被删除的世界书自动忽略 */
function getVoiceCallPromptOptions(name){
  var cfg = getVoiceCallSettings(name);
  var opts = { scene:'voice_call', voiceCallNarration:cfg.narration };
  if (cfg.custom) {
    var alive = Object.create(null);
    (Array.isArray(State.worldbooks) ? State.worldbooks : []).forEach(function(book){ if (book && book.id) alive[String(book.id)] = true; });
    opts.worldbookIds = cfg.worldbookIds.filter(function(id){ return alive[id]; });
  }
  return opts;
}

function voiceCallFollowedWorldbookIds(name){
  return (typeof getWorldbookEntriesForChat === 'function' ? getWorldbookEntriesForChat(name) : []).map(function(book){ return String(book.id); });
}

function renderVoiceCallSettings(){
  if (!pmVoiceCallSettingsBody) return;
  var name = String(voiceCallState.name || currentName || '');
  var cfg = getVoiceCallSettings(name);
  var books = (Array.isArray(State.worldbooks) ? State.worldbooks : []).filter(function(book){ return book && book.id; });
  var checked = Object.create(null);
  (cfg.custom ? cfg.worldbookIds : voiceCallFollowedWorldbookIds(name)).forEach(function(id){ checked[String(id)] = true; });
  var count = books.filter(function(book){ return checked[String(book.id)]; }).length;
  var rows = books.map(function(book){
    var on = !!checked[String(book.id)];
    return '<button class="vc-set-book' + (on ? ' is-checked' : '') + '" type="button" role="checkbox" aria-checked="' + (on ? 'true' : 'false') + '" data-vc-book="' + escapeHTML(String(book.id)) + '">' +
      '<span class="vc-set-book-name">' + escapeHTML(String(book.name || '未命名世界')) + '</span>' +
      '<span class="vc-set-check" aria-hidden="true"></span></button>';
  }).join('');
  if (!rows) rows = '<div class="vc-set-empty">还没有世界书</div>';
  pmVoiceCallSettingsBody.innerHTML =
    '<div class="vc-set-section">' +
      '<div class="vc-set-label"><span>世界书</span><em>' + count + ' / ' + books.length + '</em></div>' +
      '<div class="vc-set-seg" role="tablist">' +
        '<button type="button" role="tab" aria-selected="' + (cfg.custom ? 'false' : 'true') + '" class="' + (cfg.custom ? '' : 'selected') + '" data-vc-wb-mode="follow">跟随聊天</button>' +
        '<button type="button" role="tab" aria-selected="' + (cfg.custom ? 'true' : 'false') + '" class="' + (cfg.custom ? 'selected' : '') + '" data-vc-wb-mode="custom">自选</button>' +
      '</div>' +
      '<div class="vc-set-books">' + rows + '</div>' +
      (books.length && cfg.custom ? '<div class="vc-set-tools"><button type="button" data-vc-wb-all>全选</button><button type="button" data-vc-wb-none>清空</button></div>' : '') +
    '</div>' +
    '<div class="vc-set-section">' +
      '<div class="vc-set-row"><span>动作旁白</span>' +
        '<button class="vc-set-switch" id="pmVoiceCallNarrationSwitch" role="switch" type="button" aria-checked="' + (cfg.narration ? 'true' : 'false') + '" aria-label="动作旁白" data-vc-narration><span></span></button>' +
      '</div>' +
    '</div>';
}

function openVoiceCallSettings(){
  if (!pmVoiceCallSettingsModal || !voiceCallState.active) return;
  releaseInputFocus();
  renderVoiceCallSettings();
  pmVoiceCallSettingsModal.classList.add('is-open');
  pmVoiceCallSettingsModal.setAttribute('aria-hidden', 'false');
}

function closeVoiceCallSettings(){
  if (!pmVoiceCallSettingsModal) return;
  pmVoiceCallSettingsModal.classList.remove('is-open');
  pmVoiceCallSettingsModal.setAttribute('aria-hidden', 'true');
}

function onVoiceCallSettingsClick(e){
  var target = e.target;
  if (!target || !target.closest) return;
  if (target.closest('[data-vc-set-close]')) { closeVoiceCallSettings(); return; }
  var name = String(voiceCallState.name || currentName || '');
  if (!name) return;
  var cfg = getVoiceCallSettings(name);
  var modeBtn = target.closest('[data-vc-wb-mode]');
  if (modeBtn) {
    if (modeBtn.dataset.vcWbMode === 'follow') {
      saveVoiceCallSettings(name, { voiceCallWorldbookMode:undefined, voiceCallWorldbookIds:undefined });
    } else if (!cfg.custom) {
      saveVoiceCallSettings(name, { voiceCallWorldbookMode:'custom', voiceCallWorldbookIds:voiceCallFollowedWorldbookIds(name) });
    }
    renderVoiceCallSettings();
    return;
  }
  var bookBtn = target.closest('[data-vc-book]');
  if (bookBtn) {
    var id = String(bookBtn.dataset.vcBook || '');
    var current = cfg.custom ? cfg.worldbookIds.slice() : voiceCallFollowedWorldbookIds(name);
    var at = current.indexOf(id);
    if (at >= 0) current.splice(at, 1); else current.push(id);
    saveVoiceCallSettings(name, { voiceCallWorldbookMode:'custom', voiceCallWorldbookIds:current });
    renderVoiceCallSettings();
    return;
  }
  if (target.closest('[data-vc-wb-all]')) {
    saveVoiceCallSettings(name, { voiceCallWorldbookMode:'custom', voiceCallWorldbookIds:(Array.isArray(State.worldbooks) ? State.worldbooks : []).filter(function(b){ return b && b.id; }).map(function(b){ return String(b.id); }) });
    renderVoiceCallSettings();
    return;
  }
  if (target.closest('[data-vc-wb-none]')) {
    saveVoiceCallSettings(name, { voiceCallWorldbookMode:'custom', voiceCallWorldbookIds:[] });
    renderVoiceCallSettings();
    return;
  }
  if (target.closest('[data-vc-narration]')) {
    saveVoiceCallSettings(name, { voiceCallNarration:cfg.narration ? false : true });
    renderVoiceCallSettings();
  }
}

/* 底部玻璃输入栏浮在聊天内容上面，高度会随输入变化；这里把高度告诉列表，让最后一条消息不被盖住 */
function syncVoiceCallComposerSpace(){
  if (!pmVoiceCallView || !pmVoiceCallComposer) return;
  var h = Math.ceil(pmVoiceCallComposer.getBoundingClientRect().height || 0);
  if (h > 0) pmVoiceCallView.style.setProperty('--vc-composer-h', h + 'px');
}

function bindVoiceCallSettings(){
  if (pmVoiceCallSettingsBtn) pmVoiceCallSettingsBtn.addEventListener('click', openVoiceCallSettings);
  if (pmVoiceCallSettingsModal) pmVoiceCallSettingsModal.addEventListener('click', onVoiceCallSettingsClick);
  if (pmVoiceCallComposer && typeof ResizeObserver === 'function') {
    try { new ResizeObserver(syncVoiceCallComposerSpace).observe(pmVoiceCallComposer); } catch(e) {}
  }
  window.addEventListener('resize', syncVoiceCallComposerSpace);
}
bindVoiceCallSettings();


function sendVoiceCallText(){
  if (!voiceCallState.active || !voiceCallState.name || voiceCallState.processing) return false;
  var input = String(pmVoiceCallInput ? pmVoiceCallInput.value : '').trim();
  var name = voiceCallState.name;
  var sessionId = voiceCallState.sessionId;
  if (input) {
    /* 第一次点发送：只把话发出去，不会马上让对方回复 */
    var inputSegs = splitVoiceCallSegments(input);
    if (!inputSegs.length) inputSegs = [{ kind:'say', text:input }];
    inputSegs.forEach(function(seg){ appendVoiceCallTurn(name, 'me', seg.text, 'text', sessionId, seg.kind === 'act'); });
    if (pmVoiceCallInput) {
      pmVoiceCallInput.value = '';
      pmVoiceCallInput.style.height = 'auto';
    }
    voiceCallState.pendingReply = true;
    updateVoiceCallControls();
    return true;
  }
  if (!voiceCallState.pendingReply) {
    if (pmVoiceCallInput) pmVoiceCallInput.focus();
    return false;
  }
  /* 输入框是空的、又有话还没得到回复：再点一下发送，才让对方回复 */
  voiceCallState.pendingReply = false;
  voiceCallState.processing = true;
  updateVoiceCallControls();
  setVoiceCallStatus('对方正在回复…');
  requestVoiceCallReply(name, sessionId).catch(function(err){
    console.error('[岛屿] 语音通话 AI 回复失败：', err);
    toast('AI 调用失败：' + String(err && err.message || '未知错误').slice(0, 60));
    setVoiceCallStatus('回复失败，请重试');
    voiceCallState.pendingReply = true;
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
  try { if (window.IslandSounds) IslandSounds.stopCallRing(); } catch(e) {}
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

function showIncomingVoiceCall(event, nameHint, opts){
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
  try { if (window.IslandSounds) IslandSounds.startCallRing(); } catch(e) {}
  /* 应用在后台时（或调用方要求 forceNotify），角色发起语音通话要弹手机系统通知：
   * 只显示「语音来电」，不显示开场白，带「接听 / 拒接」两个按钮；接听后直接进入语音通话界面。 */
  if (document.hidden || (opts && opts.forceNotify)) {
    try {
      var callAvatar; try { callAvatar = getAvatar(name); } catch(e) {}
      Promise.resolve(showCharacterNotification(name, '语音来电', callAvatar, { unique:true, call:true })).catch(function(){});
    } catch(e) {}
  }
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
  /* 聊天页没打开时（例如已经退回桌面、或从系统通知的「接听」进来），要先把该聊天打开，通话界面才看得见。
   * 光判断 currentName 不够：退出聊天后 currentName 还保留着，通话界面会被塞进一个已关闭的聊天页里。 */
  if (currentName !== name || !(pmView && pmView.classList.contains('is-open'))) openPM(name);
  voiceCallState.incoming=false;voiceCallState.active=true;voiceCallState.sessionId=sid;voiceCallState.startedAt=Date.now();voiceCallState.incomingEventId='';voiceCallState.incomingGreeting='';voiceCallState.micOn=false;voiceCallState.micWanted=false;voiceCallState.processing=false;voiceCallState.textMode=false;voiceCallState.resumeMicAfterText=false;voiceCallState.replyBusy=false;var _inRec=ensurePhoneCallRecord(name,sid,voiceCallState.startedAt);if(_inRec)_inRec.direction='in';if(greeting)appendVoiceCallTurn(name,'them',greeting,'text',sid);renderVoiceCallAvatar();renderVoiceCallTurns();setVoiceCallStatus('已接听，点击麦克风开始说话');if(pmVoiceCallDuration)pmVoiceCallDuration.textContent='00:00';if(pmVoiceCallInput){pmVoiceCallInput.value='';pmVoiceCallInput.style.height='auto';}if(pmVoiceCallComposer)pmVoiceCallComposer.classList.remove('is-incoming');var acts=$('pmVoiceCallIncomingActions');if(acts)acts.hidden=true;pmVoiceCallView.classList.remove('is-incoming');closeVoiceCallSettings();pmVoiceCallView.classList.add('is-open');pmVoiceCallView.setAttribute('aria-hidden','false');document.documentElement.classList.add('pm-voice-call-open');syncVoiceCallComposerSpace();if(voiceCallState.durationTimer)clearInterval(voiceCallState.durationTimer);voiceCallState.durationTimer=setInterval(function(){if(!voiceCallState.active)return;if(pmVoiceCallDuration)pmVoiceCallDuration.textContent=formatVoiceCallDuration(Date.now()-voiceCallState.startedAt);},1000);saveMessages(name);savePhoneCalls();return true;
}

function rejectIncomingVoiceCall(){return closeIncomingVoiceCall('declined');}


function openVoiceCallView(){
  if (!pmVoiceCallView || !currentName) return;
  try { if (window.IslandSounds) IslandSounds.stopCallRing(); } catch(e) {}
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
  voiceCallState.pendingReply = false;
  renderVoiceCallAvatar();
  renderVoiceCallTurns();
  setVoiceCallStatus('点击左侧麦克风开始自动听说');
  if (pmVoiceCallDuration) pmVoiceCallDuration.textContent = '00:00';
  if (pmVoiceCallInput) { pmVoiceCallInput.value = ''; pmVoiceCallInput.style.height = 'auto'; }
  updateVoiceCallControls();
  closeVoiceCallSettings();
  pmVoiceCallView.classList.add('is-open');
  pmVoiceCallView.setAttribute('aria-hidden','false');
  document.documentElement.classList.add('pm-voice-call-open');
  syncVoiceCallComposerSpace();
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
  closeVoiceCallSettings();
  stopVoiceCallAudio();
  stopCharVoice();
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
  voiceCallState.pendingReply = false;
  if (pmVoiceCallView) {
    pmVoiceCallView.classList.remove('is-open','is-processing','has-pending');
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
