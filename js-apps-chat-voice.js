/* 岛屿 · 聊天 · 语音消息录制 / 转写
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function revokeVoiceObjectUrls(){
  voiceObjectUrls.forEach(function(url){ try { URL.revokeObjectURL(url); } catch(e) {} });
  voiceObjectUrls = [];
}


function getVoiceBlob(msg){
  if (!msg) return null;
  if (msg.audioBlob instanceof Blob) return msg.audioBlob;
  if (msg.audioDataUrl && /^data:audio\//i.test(String(msg.audioDataUrl))) {
    try {
      var parts = String(msg.audioDataUrl).split(',');
      var meta = parts[0] || '';
      var b64 = parts[1] || '';
      var mime = (meta.match(/^data:([^;]+)/i) || [,'audio/webm'])[1];
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type:mime });
    } catch(e) {}
  }
  return null;
}


function formatVoiceDuration(sec){
  sec = Math.max(0, Math.round(Number(sec) || 0));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ':' + (s < 10 ? '0' + s : s);
}


function formatVoiceMessageDuration(sec){
  sec = Math.max(0, Math.round(Number(sec) || 0));
  return sec + '"';
}


// 语音气泡宽度随时长自然增长，短语音更紧凑，长语音更展开；
// 保留上下限，避免极短/极长语音出现过窄或过宽的气泡。
function getVoiceBubbleWidth(sec){
  sec = Math.max(1, Math.round(Number(sec) || 1));
  return Math.round(Math.max(74, Math.min(200, 70 + sec * 1.4)));
}


function updateVoiceHoldText(prefix){
  if (!pmHold) return;
  var elapsed = voiceStartedAt ? Math.max(0, Math.floor((Date.now() - voiceStartedAt) / 1000)) : 0;
  pmHold.textContent = prefix + ' ' + formatVoiceDuration(elapsed);
}


function getSupportedAudioMimeType(){
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  var types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  for (var i = 0; i < types.length; i++) {
    try { if (MediaRecorder.isTypeSupported(types[i])) return types[i]; } catch(e) {}
  }
  return '';
}


function getVoiceSpeechRecognitionCtor(){
  return (typeof window !== 'undefined') ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;
}


function startVoiceSpeechRecognition(){
  var Ctor = getVoiceSpeechRecognitionCtor();
  voiceSpeechSupported = !!Ctor;
  voiceSpeechTranscript = '';
  voiceSpeechShouldRun = false;
  if (!Ctor) return false;
  try {
    var recognition = new Ctor();
    recognition.lang = /^zh/i.test(navigator.language || '') ? 'zh-CN' : (navigator.language || 'zh-CN');
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    voiceSpeechRecognition = recognition;
    voiceSpeechShouldRun = true;
    recognition.onresult = function(e){
      var finalText = '';
      for (var i = e.resultIndex || 0; i < e.results.length; i++) {
        var result = e.results[i];
        if (result && result[0]) {
          var text = String(result[0].transcript || '');
          if (result.isFinal) finalText += text;
        }
      }
      if (finalText) voiceSpeechTranscript = (voiceSpeechTranscript + ' ' + finalText).replace(/\s+/g, ' ').trim();
    };
    recognition.onerror = function(err){
      if (err && err.error === 'not-allowed') voiceSpeechSupported = false;
    };
    recognition.onend = function(){
      if (voiceSpeechRecognition !== recognition) return;
      if (voiceSpeechShouldRun) {
        try { recognition.start(); } catch(e) {}
      } else {
        voiceSpeechRecognition = null;
      }
    };
    recognition.start();
    return true;
  } catch(e){
    voiceSpeechRecognition = null;
    voiceSpeechShouldRun = false;
    return false;
  }
}


function stopVoiceSpeechRecognition(){
  voiceSpeechShouldRun = false;
  var recognition = voiceSpeechRecognition;
  voiceSpeechRecognition = null;
  if (recognition) { try { recognition.stop(); } catch(e) {} }
  return String(voiceSpeechTranscript || '').trim();
}


function stopVoiceStream(){
  if (voiceStream) {
    voiceStream.getTracks().forEach(function(track){ try { track.stop(); } catch(e) {} });
  }
  voiceStream = null;
}


function resetVoiceUI(){
  stopVoiceSpeechRecognition();
  voiceRecording = false;
  voiceRecorder = null;
  voiceChunks = [];
  voicePointerActive = false;
  voicePointerId = null;
  voiceCancelRequested = false;
  if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
  voiceStartedAt = 0;
  if (pmHold) {
    pmHold.textContent = '按住 说话';
    pmHold.classList.remove('is-recording');
    pmHold.classList.remove('is-cancel');
    pmHold.removeAttribute('aria-label');
  }
}


function finishVoiceRecording(cancelled){
  if (!voiceRecorder || voiceRecorder.state === 'inactive') {
    stopVoiceStream();
    resetVoiceUI();
    return;
  }
  voiceCancelRequested = !!cancelled;
  try { voiceRecorder.stop(); } catch(e) { stopVoiceStream(); resetVoiceUI(); }
}


function handleVoicePointerMove(e){
  if (!voiceRecording || !voicePointerActive || e.pointerId !== voicePointerId || !pmHold) return;
  var rect = pmHold.getBoundingClientRect();
  var cancel = e.clientY < rect.top - 56;
  if (cancel !== voiceCancelRequested) {
    voiceCancelRequested = cancel;
    pmHold.classList.toggle('is-cancel', cancel);
  }
  updateVoiceHoldText(cancel ? '松开取消' : '松开发送');
}


function startVoiceRecording(){
  if (voiceRecording) return Promise.resolve(true);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast('当前浏览器不支持语音录制');
    return Promise.resolve(false);
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }
  }).then(function(stream){
    if (!voicePointerActive) {
      stream.getTracks().forEach(function(track){ try { track.stop(); } catch(e) {} });
      return false;
    }
    voiceStream = stream;
    var mimeType = getSupportedAudioMimeType();
    try {
      voiceRecorder = mimeType ? new MediaRecorder(stream, { mimeType:mimeType }) : new MediaRecorder(stream);
    } catch(e){
      try { voiceRecorder = new MediaRecorder(stream); } catch(err){
        stopVoiceStream();
        throw err;
      }
    }
    voiceChunks = [];
    voiceRecording = true;
    voiceCancelRequested = false;
    voiceStartedAt = Date.now();
    pmHold && pmHold.classList.add('is-recording');
    if (pmHold) pmHold.setAttribute('aria-label', '松开发送，向上滑动取消');
    updateVoiceHoldText('松开发送');
    if (voiceTimer) clearInterval(voiceTimer);
    voiceTimer = setInterval(function(){
      if (!voiceRecording) return;
      updateVoiceHoldText(voiceCancelRequested ? '松开取消' : '松开发送');
    }, 250);
    voiceRecorder.ondataavailable = function(e){
      if (e.data && e.data.size) voiceChunks.push(e.data);
    };
    voiceRecorder.onerror = function(){
      toast('录音失败，请重试');
      finishVoiceRecording(true);
    };
    voiceRecorder.onstop = function(){
      var duration = Math.max(0, (Date.now() - voiceStartedAt) / 1000);
      var blobType = voiceRecorder && voiceRecorder.mimeType ? voiceRecorder.mimeType : (mimeType || 'audio/webm');
      var blob = voiceChunks.length ? new Blob(voiceChunks, { type:blobType }) : null;
      var cancelled = voiceCancelRequested;
      var transcript = stopVoiceSpeechRecognition();
      stopVoiceStream();
      if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
      voiceRecording = false;
      voiceRecorder = null;
      voiceChunks = [];
      voiceStartedAt = 0;
      voicePointerActive = false;
      voicePointerId = null;
      if (pmHold) {
        pmHold.classList.remove('is-recording');
        pmHold.classList.remove('is-cancel');
        pmHold.textContent = '按住 说话';
      }
      if (cancelled) {
        toast('已取消录音');
        return;
      }
      if (!blob || blob.size < 200) {
        toast('录音太短了');
        return;
      }
      var msgIndex = sendVoiceMessage(blob, duration, transcript);
      if (msgIndex >= 0 && isSttReady()) {
        transcribeVoiceMessage(msgIndex, { showToast:false });
      }
    };
    try {
      voiceRecorder.start(100);
      if (!isSttReady()) startVoiceSpeechRecognition();
    } catch(e) {
      stopVoiceStream();
      resetVoiceUI();
      toast('无法开始录音');
      return false;
    }
    return true;
  }).catch(function(err){
    stopVoiceStream();
    resetVoiceUI();
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) toast('请允许浏览器使用麦克风');
    else if (err && err.name === 'NotFoundError') toast('没有找到可用的麦克风');
    else toast('无法访问麦克风');
    return false;
  });
}


function estimateVoiceTextDuration(text){
  text = String(text || '').trim();
  if (!text) return 1;
  var compact = text.replace(/\s+/g, '');
  var seconds = Math.ceil(compact.length / 4);
  return Math.max(1, Math.min(60, seconds));
}


function updateVoiceTextHint(){
  if (!voiceTextHint) return;
  var text = voiceTextInput ? voiceTextInput.value.trim() : '';
  voiceTextHint.textContent = '预计 ' + estimateVoiceTextDuration(text) + ' 秒';
}


function closeVoiceTextComposer(){
  if (!voiceTextModal) return;
  voiceTextModal.classList.remove('is-open');
  voiceTextModal.setAttribute('aria-hidden', 'true');
  if (voiceTextInput) voiceTextInput.value = '';
}


function openVoiceTextComposer(){
  if (!voiceTextModal || !currentName) return;
  closePanel();
  releaseInputFocus();
  voiceTextModal.classList.add('is-open');
  voiceTextModal.setAttribute('aria-hidden', 'false');
  updateVoiceTextHint();
  requestAnimationFrame(function(){ if (voiceTextInput) voiceTextInput.focus(); });
}


function sendTextVoiceMessage(text){
  text = String(text || '').trim();
  if (!text || !currentName) { if (voiceTextInput && !text) voiceTextInput.focus(); return false; }
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  var seconds = estimateVoiceTextDuration(text);
  var msg = {
    id: genId('voice_text_'), from:'me', type:'voice',
    text:'[语音消息 ' + seconds + '秒]', voiceText:text, transcript:text, aiTranscript:text,
    duration:seconds, audioBlob:null, createdAt:Date.now(), transcriptSource:'silent_voice'
  };
  MESSAGES[currentName].push(msg);
  voiceTranscriptOpen[msg.id] = false;
  saveMessages(currentName);
  renderMessages(true); scrollBottom(true);
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === currentName) { CHATS[i].preview = '[语音消息 ' + seconds + '秒]'; CHATS[i].time = '刚刚'; break; }
  }
  renderChats(); saveChats();
  closeVoiceTextComposer();
  return true;
}


function getVoiceTranscript(msg){
  if (!msg) return '';
  var direct = String(msg.voiceText || msg.aiTranscript || msg.transcript || '').trim();
  if (direct) return direct;
  var fallback = String(msg.text || '').trim();
  return fallback && !/^\[语音消息(?: \d+秒)?\]$/.test(fallback) ? fallback : '';
}


function voiceTranscribeIcon(open){
  return open
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M8.5 8h7M8.5 11.5h5M8.5 15h6"/></svg>';
}


function clearVoiceTranscriptStates(){ voiceTranscriptOpen = Object.create(null); }


function toggleVoiceTranscript(index){
  var list = MESSAGES[currentName] || [];
  var msg = list[index];
  if (!msg || msg.type !== 'voice') return;
  var transcript = getVoiceTranscript(msg);
  if (!transcript) {
    transcribeVoiceMessage(index, { showToast:true });
    return;
  }
  voiceTranscriptOpen[msg.id] = (voiceTranscriptOpen[msg.id] !== true);
  renderMessages(false);
}


function updateVoiceMessageTranscript(index, transcript, source){
  var list = MESSAGES[currentName] || [], msg = list[index];
  transcript = String(transcript || '').trim();
  if (!msg || msg.type !== 'voice' || !transcript) return false;
  msg.transcript = transcript;
  msg.aiTranscript = transcript;
  msg.voiceText = transcript;
  msg.transcriptSource = source || 'stt_api';
  voiceTranscriptOpen[msg.id] = false;
  saveMessages(currentName);
  renderMessages(false);
  return true;
}

function callSttOnce(blob, overrideCfg){
  var cfg = overrideCfg || getSttConfig();
  if (!blob || !(blob instanceof Blob)) return Promise.reject(new Error('没有可上传的录音文件'));
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) return Promise.reject(new Error('语音转文字接口尚未配置'));
  var url = normalizeTranscriptionsUrl(cfg.baseUrl);
  var form = new FormData();
  var ext = 'webm';
  var type = String(blob.type || '').toLowerCase();
  if (type.indexOf('ogg') >= 0) ext = 'ogg';
  else if (type.indexOf('mp4') >= 0) ext = 'mp4';
  else if (type.indexOf('wav') >= 0) ext = 'wav';
  else if (type.indexOf('mpeg') >= 0 || type.indexOf('mp3') >= 0) ext = 'mp3';
  form.append('file', blob, 'island-voice-' + Date.now() + '.' + ext);
  form.append('model', cfg.model);
  if (cfg.language && cfg.language !== 'auto') form.append('language', cfg.language);
  if (cfg.prompt) form.append('prompt', cfg.prompt);
  form.append('response_format', 'json');
  return fetch(url, { method:'POST', headers:{ 'Authorization':'Bearer ' + cfg.apiKey, 'Accept':'application/json' }, body:form }).then(function(res){
    return res.text().then(function(text){
      if (!res.ok) throw new Error(httpErrorText(res.status, text));
      var json = null;
      try { json = JSON.parse(text); } catch(e) {}
      var value = json && (json.text || (json.data && json.data.text)) ? (json.text || json.data.text) : '';
      if (!value && text && !/^\s*[<{[]/.test(text)) value = text;
      value = String(value || '').trim();
      if (!value) throw new Error('识别成功，但服务端没有返回 text 字段');
      return value;
    });
  }).catch(function(err){
    if (err && err.message) throw err;
    throw new Error('语音转文字请求失败');
  });
}

function transcribeVoiceMessage(index, options){
  var list = MESSAGES[currentName] || [], msg = list[index];
  options = options || {};
  if (!msg || msg.type !== 'voice') return Promise.resolve(false);
  var direct = getVoiceTranscript(msg);
  if (direct && !options.force) { voiceTranscriptOpen[msg.id] = true; renderMessages(false); return Promise.resolve(true); }
  var blob = getVoiceBlob(msg);
  if (!blob) { toast('这条语音没有可用的音频文件'); return Promise.resolve(false); }
  var cfg = getSttConfig();
  if (!isSttReady()) {
    if (voiceSpeechSupported && voiceSpeechTranscript) return Promise.resolve(updateVoiceMessageTranscript(index, voiceSpeechTranscript, 'browser_speech_recognition'));
    toast('请先在设置中配置语音转文字接口');
    return Promise.resolve(false);
  }
  var actionButton = null;
  if (pmMessageActionPopover) actionButton = pmMessageActionPopover.querySelector('[data-message-action="transcribe"]');
  if (actionButton) { actionButton.disabled = true; actionButton.querySelector('.pm-message-action-label').textContent = '识别中…'; }
  if (options.showToast !== false) toast('正在识别语音…');
  return callSttOnce(blob, cfg).then(function(text){
    updateVoiceMessageTranscript(index, text, 'stt_api');
    if (options.showToast !== false) toast('语音转文字完成');
    return true;
  }).catch(function(err){
    console.error('[岛屿] STT 识别失败：', err);
    if (options.showToast !== false) toast('识别失败：' + String(err && err.message || '未知错误').slice(0, 70));
    return false;
  }).then(function(result){
    if (actionButton) { actionButton.disabled = false; actionButton.querySelector('.pm-message-action-label').textContent = voiceTranscriptOpen[msg.id] ? '收起文字' : '转文字'; }
    return result;
  });
}


function sendVoiceMessage(blob, duration, fallbackTranscript){
  if (!blob || !currentName) return -1;
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  var seconds = Math.max(1, Math.round(Number(duration) || 1));
  var transcript = String(fallbackTranscript || '').trim();
  var msg = {
    id: genId('voice_'),
    from:'me',
    type:'voice',
    text:'[语音消息 ' + seconds + '秒]',
    duration:seconds,
    audioBlob:blob,
    createdAt:Date.now()
  };
  if (transcript) {
    msg.transcript = transcript;
    msg.aiTranscript = transcript;
    msg.voiceText = transcript;
    msg.transcriptSource = 'browser_speech_recognition';
    voiceTranscriptOpen[msg.id] = false;
  }
  MESSAGES[currentName].push(msg);
  saveMessages(currentName);
  renderMessages(true);
  scrollBottom(true);
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === currentName) { CHATS[i].preview = '[语音消息 ' + seconds + '秒]'; CHATS[i].time = '刚刚'; break; }
  }
  renderChats(); saveChats();
  return MESSAGES[currentName].length - 1;
}

function clearVoicePressTimer(){
  if (voicePressTimer) { clearTimeout(voicePressTimer); voicePressTimer = null; }
  voicePressPending = false;
}


function openVoiceHoldTextComposer(){
  skipNextHoldClick = true;
  openVoiceTextComposer();
}


function setVoiceMode(on){
  clearVoicePressTimer();
  if (!on) {
    voicePointerActive = false; voicePointerId = null; voiceLongPressTriggered = false; skipNextHoldClick = false;
    closeVoiceTextComposer();
  }
  if (!pmBar) return;
  pmBar.classList.toggle('is-voice', on);
  if (pmVoice) pmVoice.classList.toggle('is-on', on);
  var voiceIcon = $('pmVoiceIcon');
  if (voiceIcon) voiceIcon.src = on
    ? 'https://nos.netease.com/vcloud-statistic/nrtc/f9eea521-2fdc-4807-aec7-89056a656309.png'
    : 'https://nos.netease.com/vcloud-statistic/nrtc/a6ee4a35-6552-49a8-8c87-9256cd426ed5.png';
  if (on) {
    closePanel();
    voiceSpeechSupported = !!getVoiceSpeechRecognitionCtor();
  }
}
