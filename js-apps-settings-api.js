/* 岛屿 · 设置 · 主 API / 副 API / 语音转文字 / 向量记忆 API 与模型列表
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function refreshVectorMemoryApiState(){
  var s = getVectorMemorySettings();
  var emb = $('vectorMemoryApiState'), rr = $('vectorRerankApiState');
  var embReady = !!(s.embeddingApi.baseUrl && s.embeddingApi.apiKey && s.embeddingApi.model);
  var rrReady = !!(s.rerankApi.baseUrl && s.rerankApi.apiKey && s.rerankApi.model);
  if (emb) { emb.textContent = embReady ? '已配置' : '未配置'; emb.classList.toggle('ok',embReady); emb.classList.toggle('err',false); }
  if (rr) { rr.textContent = rrReady ? '已配置' : '未配置'; rr.classList.toggle('ok',rrReady); rr.classList.toggle('err',false); }
}

function fillVectorEmbeddingApiForm(){
  var s=getVectorMemorySettings(), c=s.embeddingApi;
  var url=$('vectorEmbeddingApiBaseUrl'), key=$('vectorEmbeddingApiKey'), model=$('vectorEmbeddingApiModel');
  if(url)url.value=c.baseUrl||''; if(key)key.value=c.apiKey||''; if(model)model.value=c.model||'';
  var top=$('vectorMemoryTopK'), cand=$('vectorMemoryCandidateK'), th=$('vectorMemorySimilarityThreshold');
  if(top)top.value=String(s.topK); if(cand)cand.value=String(s.candidateK); if(th)th.value=String(s.similarityThreshold);
  setVectorApiStatus('embedding','','');
  updateVectorApiHints(); renderPresetTrigger('vectorEmbedding');
}

function readVectorEmbeddingApiForm(){
  var s=getVectorMemorySettings(), c=s.embeddingApi;
  c.baseUrl=String(($('vectorEmbeddingApiBaseUrl')||{}).value||'').trim();
  c.apiKey=String(($('vectorEmbeddingApiKey')||{}).value||'').trim();
  c.model=String(($('vectorEmbeddingApiModel')||{}).value||'').trim();
  var top=parseInt(($('vectorMemoryTopK')||{}).value,10), cand=parseInt(($('vectorMemoryCandidateK')||{}).value,10), th=Number(($('vectorMemorySimilarityThreshold')||{}).value);
  s.topK=Number.isFinite(top)?Math.max(1,Math.min(30,top)):8;
  s.candidateK=Number.isFinite(cand)?Math.max(s.topK,Math.min(100,cand)):24;
  s.similarityThreshold=Number.isFinite(th)?Math.max(-1,Math.min(1,th)):0.18;
  s.embeddingApi=c;
  State.settings.vectorMemory=s;
  return s;
}

function fillVectorRerankApiForm(){
  var c=getVectorMemorySettings().rerankApi;
  var url=$('vectorRerankApiBaseUrl'), key=$('vectorRerankApiKey'), model=$('vectorRerankApiModel');
  if(url)url.value=c.baseUrl||''; if(key)key.value=c.apiKey||''; if(model)model.value=c.model||'';
  setVectorApiStatus('rerank','','');
  updateVectorApiHints(); renderPresetTrigger('vectorRerank');
}

function readVectorRerankApiForm(){
  var s=getVectorMemorySettings(), c=s.rerankApi;
  c.baseUrl=String(($('vectorRerankApiBaseUrl')||{}).value||'').trim();
  c.apiKey=String(($('vectorRerankApiKey')||{}).value||'').trim();
  c.model=String(($('vectorRerankApiModel')||{}).value||'').trim();
  s.rerankApi=c; State.settings.vectorMemory=s; return s;
}

function setVectorApiStatus(kind, status, text){
  var id=kind==='rerank'?'vectorRerankApiStatus':'vectorEmbeddingApiStatus';
  var el=$(id); if(!el)return;
  el.className='api-status';
  if(text) el.classList.add('show');
  if(status) el.classList.add(status);
  el.textContent=text||'';
}

function updateVectorApiHints(){
  var e=$('vectorEmbeddingApiUrlHint'), r=$('vectorRerankApiUrlHint');
  if(e){var raw=String(($('vectorEmbeddingApiBaseUrl')||{}).value||'').trim(); e.textContent=raw?'将请求：'+normalizeVectorEndpoint(raw,'embedding'):'可填写完整 /embeddings 地址；若填写到 /v1，系统会自动补 /embeddings。';}
  if(r){var raw2=String(($('vectorRerankApiBaseUrl')||{}).value||'').trim(); r.textContent=raw2?'将请求：'+normalizeVectorEndpoint(raw2,'rerank'):'支持常见 rerank 接口；若地址不是 /rerank 结尾，将按原地址发送请求。';}
}

function saveVectorEmbeddingApiForm(){
  var s=readVectorEmbeddingApiForm();
  if(!s.embeddingApi.baseUrl||!s.embeddingApi.apiKey||!s.embeddingApi.model){setVectorApiStatus('embedding','err','接口地址、API Key、模型均为必填。');return;}
  renderPresetTrigger('vectorEmbedding');saveSettings().then(function(){refreshVectorMemoryApiState();setVectorApiStatus('embedding','ok','✓ 向量记忆 API 已保存并使用（预设池里的预设未改动）。');toast('向量记忆 API 已保存');});
}

function saveVectorRerankApiForm(){
  var s=readVectorRerankApiForm();
  if(!s.rerankApi.baseUrl||!s.rerankApi.apiKey||!s.rerankApi.model){setVectorApiStatus('rerank','err','接口地址、API Key、模型均为必填。');return;}
  renderPresetTrigger('vectorRerank');saveSettings().then(function(){refreshVectorMemoryApiState();setVectorApiStatus('rerank','ok','✓ 重排 API 已保存并使用（预设池里的预设未改动）。');toast('重排 API 已保存');});
}

function testVectorEmbeddingApi(){
  var s=readVectorEmbeddingApiForm();
  if(!s.embeddingApi.baseUrl||!s.embeddingApi.apiKey||!s.embeddingApi.model){setVectorApiStatus('embedding','err','请先填写接口地址、API Key、模型。');return;}
  var btn=$('vectorEmbeddingApiTest'); if(btn)btn.disabled=true;
  setVectorApiStatus('embedding','','正在测试 Embedding API…');
  var started=Date.now();
  callVectorEmbedding('向量记忆连接测试：你好世界').then(function(rows){
    if(!rows[0]||!rows[0].length)throw ApiError('vector_parse','接口没有返回有效向量');
    setVectorApiStatus('embedding','ok','✓ 连接成功（'+(Date.now()-started)+'ms），向量维度 '+rows[0].length+'。');
    toast('向量记忆 API 连接成功');
  }).catch(function(err){setVectorApiStatus('embedding','err','✗ 连接失败：'+(err&&err.message||'未知错误'));toast('向量记忆 API 连接失败');}).then(function(){if(btn)btn.disabled=false;});
}

function testVectorRerankApi(){
  var s=readVectorRerankApiForm();
  if(!s.rerankApi.baseUrl||!s.rerankApi.apiKey||!s.rerankApi.model){setVectorApiStatus('rerank','err','请先填写接口地址、API Key、模型。');return;}
  var btn=$('vectorRerankApiTest'); if(btn)btn.disabled=true;
  setVectorApiStatus('rerank','','正在测试重排 API…');
  var started=Date.now();
  callVectorRerank('测试记忆', ['测试记忆一','完全无关内容']).then(function(rows){
    if(!rows||!rows.length)throw ApiError('vector_parse','接口没有返回可解析的重排结果');
    setVectorApiStatus('rerank','ok','✓ 连接成功（'+(Date.now()-started)+'ms），返回 '+rows.length+' 条排序结果。');
    toast('重排 API 连接成功');
  }).catch(function(err){setVectorApiStatus('rerank','err','✗ 连接失败：'+(err&&err.message||'未知错误'));toast('重排 API 连接失败');}).then(function(){if(btn)btn.disabled=false;});
}


function fillSttForm(){
  normalizeSttState();
  var c = getSttConfig();
  var elUrl = $('sttBaseUrl'), elKey = $('sttApiKey'), elModel = $('sttModel'), elLanguage = $('sttLanguage'), elPrompt = $('sttPrompt');
  if (elUrl) elUrl.value = c.baseUrl || '';
  if (elKey) elKey.value = c.apiKey || '';
  if (elModel) elModel.value = c.model || '';
  if (elLanguage) elLanguage.value = c.language || 'auto';
  if (elPrompt) elPrompt.value = c.prompt || '';
  updateSttUrlHint(); highlightSttPreset(); renderPresetTrigger('stt'); setSttStatus('', '');
}

function readSttForm(){
  var c = getSttConfig();
  var elUrl = $('sttBaseUrl'), elKey = $('sttApiKey'), elModel = $('sttModel'), elLanguage = $('sttLanguage'), elPrompt = $('sttPrompt');
  c.baseUrl = elUrl ? elUrl.value.trim() : '';
  c.apiKey = elKey ? elKey.value.trim() : '';
  c.model = elModel ? elModel.value.trim() : '';
  c.language = elLanguage ? elLanguage.value : 'auto';
  c.prompt = elPrompt ? elPrompt.value.trim() : '';
  if (!c.language) c.language = 'auto';
  c.enabled = !!(c.baseUrl && c.apiKey && c.model);
  return c;
}

function updateSttUrlHint(){
  var el = $('sttUrlHint'), input = $('sttBaseUrl');
  if (!el || !input) return;
  var raw = input.value.trim();
  el.textContent = raw ? ('将请求：' + previewTranscriptionsEndpoint(raw)) : '填写 API 根地址。若以 /v1 结尾，会自动请求 /audio/transcriptions。';
}

function setSttStatus(kind, text){
  var el = $('sttStatus'); if (!el) return;
  el.className = 'api-status';
  if (!text) { el.textContent = ''; return; }
  el.classList.add('show');
  if (kind) el.classList.add(kind);
  el.textContent = text;
}

function highlightSttPreset(){
  var c = getSttConfig(), hit = null;
  Object.keys(STT_PRESETS).forEach(function(k){
    if (k === 'custom') return;
    var p = STT_PRESETS[k];
    if (p.baseUrl && c.baseUrl && p.baseUrl.toLowerCase() === c.baseUrl.toLowerCase() && (!p.model || p.model === c.model)) hit = k;
  });
  $$('#sttPresetChips .chip').forEach(function(chip){ chip.classList.toggle('is-on', chip.dataset.preset === hit); });
}

function applySttPreset(key){
  var p = STT_PRESETS[key]; if (!p) return;
  var elUrl = $('sttBaseUrl'), elKey = $('sttApiKey'), elModel = $('sttModel'), elLanguage = $('sttLanguage');
  if (key === 'custom') {
    if (elUrl) elUrl.value = '';
    if (elModel) elModel.value = '';
    if (elLanguage) elLanguage.value = 'auto';
  } else {
    if (elUrl) elUrl.value = p.baseUrl || '';
    if (elModel) elModel.value = p.model || '';
    if (elLanguage) elLanguage.value = p.language || 'auto';
    var quickKey = State.settings && State.settings.sttQuickKeys ? String(State.settings.sttQuickKeys[key] || '') : '';
    if (elKey && quickKey) elKey.value = quickKey;
  }
  updateSttUrlHint(); highlightSttPreset(); releaseInputFocus();
}

function rememberSttQuickKey(){
  var c = getSttConfig();
  if (!c || !c.baseUrl || !c.apiKey || !State.settings) return;
  if (!State.settings.sttQuickKeys || typeof State.settings.sttQuickKeys !== 'object') State.settings.sttQuickKeys = {};
  Object.keys(STT_PRESETS).forEach(function(key){
    if (key === 'custom') return;
    var p = STT_PRESETS[key];
    if (p.baseUrl && c.baseUrl && p.baseUrl.toLowerCase() === c.baseUrl.toLowerCase()) State.settings.sttQuickKeys[key] = c.apiKey;
  });
}

function saveSttForm(){
  var c = readSttForm();
  if (!c.baseUrl || !c.apiKey || !c.model) { setSttStatus('err','三项必填：Base URL、API Key、识别模型。'); return; }
  State.settings.stt = c;
  rememberSttQuickKey();
  renderPresetTrigger('stt');
  saveSettings().then(function(){ refreshSttState(); highlightSttPreset(); setSttStatus('ok','✓ 已保存并使用（预设池里的预设未改动）。聊天语音会优先使用该 STT 接口进行转写。'); toast('语音转文字已保存'); });
}

function testSttConnection(){
  var btn = $('sttTest'), draft = readSttForm();
  if (!draft.baseUrl || !draft.apiKey || !draft.model) { setSttStatus('err','请先填写 Base URL、API Key 和识别模型。'); return; }
  var url = normalizeModelsUrl(draft.baseUrl);
  setSttStatus('warn','正在测试模型接口 ' + url + ' …');
  if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
  fetch(url, { method:'GET', headers:{ 'Authorization':'Bearer ' + cleanApiKey(draft.apiKey), 'Accept':'application/json' } }).then(function(res){
    return res.text().then(function(text){
      if (!res.ok) throw new Error(httpErrorText(res.status, text));
      var json; try { json = JSON.parse(text); } catch(e){ throw new Error('响应不是合法 JSON\n' + text.slice(0, 220)); }
      var arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : (Array.isArray(json.models) ? json.models : []));
      setSttStatus('ok','✓ 接口可访问，模型列表返回 ' + arr.length + ' 项。实际录音转写时将请求：\n' + normalizeTranscriptionsUrl(draft.baseUrl));
      toast('STT 接口连接成功');
    });
  }).catch(function(err){ setSttStatus('err','✗ 测试失败：\n' + (err && err.message ? err.message : '未知错误')); toast('STT 接口连接失败'); }).then(function(){ if(btn){btn.disabled=false;btn.textContent='测试接口';} });
}


/* ───────────── 识图 API（独立配置，用来识别私聊里的表情包 / 图片） ───────────── */

function fillVisionForm(){
  normalizeVisionState();
  var c = getVisionConfig();
  var elUrl = $('visionBaseUrl'), elKey = $('visionApiKey'), elModel = $('visionModel'), elScope = $('visionScope'), elPrompt = $('visionPrompt'), elOn = $('visionEnabled');
  if (elUrl) elUrl.value = c.baseUrl || '';
  if (elKey) elKey.value = c.apiKey || '';
  if (elModel) elModel.value = c.model || '';
  if (elScope) elScope.value = c.scope || 'all';
  if (elPrompt) elPrompt.value = c.prompt || '';
  if (elOn) elOn.value = (c.enabled || !(c.baseUrl && c.apiKey && c.model)) ? 'on' : 'off';
  updateVisionUrlHint(); highlightVisionPreset(); renderPresetTrigger('vision'); setVisionStatus('', '');
}

function readVisionForm(){
  var c = getVisionConfig();
  var elUrl = $('visionBaseUrl'), elKey = $('visionApiKey'), elModel = $('visionModel'), elScope = $('visionScope'), elPrompt = $('visionPrompt'), elOn = $('visionEnabled');
  c.baseUrl = elUrl ? elUrl.value.trim() : '';
  c.apiKey = elKey ? elKey.value.trim() : '';
  c.model = elModel ? elModel.value.trim() : '';
  c.scope = elScope ? elScope.value : 'all';
  if (c.scope !== 'all' && c.scope !== 'sticker' && c.scope !== 'image') c.scope = 'all';
  c.prompt = elPrompt ? elPrompt.value.trim() : '';
  c.enabled = !!(c.baseUrl && c.apiKey && c.model) && (!elOn || elOn.value === 'on');
  return c;
}

function updateVisionUrlHint(){
  var el = $('visionUrlHint'), input = $('visionBaseUrl');
  if (!el || !input) return;
  var raw = input.value.trim();
  el.textContent = raw ? ('将请求：' + previewEndpoint(raw)) : '填写 API 根地址（可省略 https://）。以 /v1 结尾会自动补 /chat/completions；末尾加 # 表示原样使用。';
}

function setVisionStatus(kind, text){
  var el = $('visionStatus'); if (!el) return;
  el.className = 'api-status';
  if (!text) { el.textContent = ''; return; }
  el.classList.add('show');
  if (kind) el.classList.add(kind);
  el.textContent = text;
}

function highlightVisionPreset(){
  var c = getVisionConfig(), hit = null;
  Object.keys(VISION_PRESETS).forEach(function(k){
    if (k === 'custom') return;
    var p = VISION_PRESETS[k];
    if (p.baseUrl && c.baseUrl && p.baseUrl.toLowerCase() === c.baseUrl.toLowerCase()) hit = k;
  });
  $$('#visionPresetChips .chip').forEach(function(chip){ chip.classList.toggle('is-on', chip.dataset.preset === hit); });
}

function applyVisionPreset(key){
  var p = VISION_PRESETS[key]; if (!p) return;
  var elUrl = $('visionBaseUrl'), elKey = $('visionApiKey'), elModel = $('visionModel');
  if (key === 'custom') {
    if (elUrl) elUrl.value = '';
    if (elModel) elModel.value = '';
    if (elKey) elKey.value = '';
  } else {
    if (elUrl) elUrl.value = p.baseUrl || '';
    if (elModel) elModel.value = p.model || '';
    var quickKey = State.settings && State.settings.visionQuickKeys ? String(State.settings.visionQuickKeys[key] || '') : '';
    if (elKey) elKey.value = quickKey;
  }
  updateVisionUrlHint(); highlightVisionPreset(); releaseInputFocus();
}

function rememberVisionQuickKey(){
  var c = getVisionConfig();
  if (!c || !c.baseUrl || !c.apiKey || !State.settings) return;
  if (!State.settings.visionQuickKeys || typeof State.settings.visionQuickKeys !== 'object') State.settings.visionQuickKeys = {};
  Object.keys(VISION_PRESETS).forEach(function(key){
    if (key === 'custom') return;
    var p = VISION_PRESETS[key];
    if (p.baseUrl && c.baseUrl && p.baseUrl.toLowerCase() === c.baseUrl.toLowerCase()) State.settings.visionQuickKeys[key] = c.apiKey;
  });
}

function saveVisionForm(){
  var c = readVisionForm();
  if (!c.baseUrl || !c.apiKey || !c.model) { setVisionStatus('err', '三项必填：Base URL、API Key、识图模型。'); return; }
  State.settings.vision = c;
  rememberVisionQuickKey();
  renderPresetTrigger('vision');
  saveSettings().then(function(){
    refreshVisionState(); highlightVisionPreset();
    setVisionStatus('ok', c.enabled
      ? '✓ 已保存并启用。私聊里的' + (c.scope === 'sticker' ? '表情包' : c.scope === 'image' ? '图片' : '表情包和图片') + '会先由识图模型转成文字，再交给聊天模型。'
      : '✓ 已保存（当前为关闭状态，聊天仍按原方式直接发图给主模型）。');
    toast('识图 API 已保存');
  });
}

/* 现画一张测试图（蓝底白字 OK + 红圆），不依赖任何外部图片 */
function makeVisionTestImage(){
  var canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 192;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, 192, 192);
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(96, 70, 38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('OK', 96, 148);
  return canvas.toDataURL('image/png');
}

function testVisionConnection(){
  var btn = $('visionTest'), draft = readVisionForm();
  if (!draft.baseUrl || !draft.apiKey || !draft.model) { setVisionStatus('err', '请先填写 Base URL、API Key 和识图模型。'); return; }
  var url = normalizeBaseUrl(draft.baseUrl);
  setVisionStatus('warn', '正在用一张测试图请求 ' + url + ' …');
  if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
  var started = Date.now();
  var messages = [{ role: 'user', content: [
    { type: 'text', text: '请用一句中文描述这张图片（颜色、形状、文字）。' },
    { type: 'image_url', image_url: { url: makeVisionTestImage() } }
  ] }];
  callApiOnce(messages, buildVisionConfig(draft)).then(function(text){
    var ms = Date.now() - started; text = String(text || '').trim();
    if (!text) setVisionStatus('warn', '接口通了（' + ms + 'ms），但模型返回为空。该模型可能不支持图片输入。');
    else setVisionStatus('ok', '✓ 识图可用（' + ms + 'ms）\n模型看到的：' + text.slice(0, 160));
    toast('识图 API 连接成功');
  }).catch(function(err){
    setVisionStatus('err', '✗ 测试失败：\n' + (err && err.message ? err.message : '未知错误') + '\n\n请确认所选模型支持图片输入（vision / VL / 多模态）。');
    toast('识图 API 连接失败');
  }).then(function(){ if (btn) { btn.disabled = false; btn.textContent = '测试识图'; } });
}


function renderAutoRetryToggle(){
  var on = !!(State.settings && State.settings.autoRetry === true);
  var t = $('autoRetryToggle'), h = $('autoRetryHint');
  if (t) { t.classList.toggle('is-on', on); t.setAttribute('aria-checked', on ? 'true' : 'false'); }
  if (h) h.textContent = on ? '已开启 · 遇到 429 / 502 / 503 / 504 或网络抖动时自动重发一次' : '关闭 · 请求失败时不会自动重发';
}

function fillApiForm(){
  var c = getApiConfig();
  var elUrl = $('apiBaseUrl'), elKey = $('apiKey'), elModel = $('apiModel');
  var elTemp = $('apiTemp'), elTempV = $('apiTempVal');
  var elMax = $('apiMaxTokens');
  if (elUrl) elUrl.value = c.baseUrl || '';
  if (elKey) elKey.value = c.apiKey || '';
  if (elModel) elModel.value = c.model || '';
  if (elTemp) elTemp.value = (typeof c.temperature === 'number' ? c.temperature : 0.85);
  if (elTempV) elTempV.textContent = Number(elTemp ? elTemp.value : 0.85).toFixed(2);
  if (elMax) elMax.value = (c.maxTokens && c.maxTokens > 0) ? c.maxTokens : '';
  var elStream = $('apiStream'); if (elStream) elStream.value = c.stream ? 'on' : 'off';
  updateApiUrlHint(); highlightPreset(); renderPresetTrigger('primary'); setApiStatus('', '');
}

function readApiForm(){
  var c = getApiConfig();
  var elUrl = $('apiBaseUrl'), elKey = $('apiKey'), elModel = $('apiModel');
  var elTemp = $('apiTemp'), elMax = $('apiMaxTokens');
  c.baseUrl = elUrl ? elUrl.value.trim() : '';
  c.apiKey = elKey ? elKey.value.trim() : '';
  c.model = elModel ? elModel.value.trim() : '';
  c.temperature = elTemp ? parseFloat(elTemp.value) : 0.85;
  if (isNaN(c.temperature)) c.temperature = 0.85;
  var maxV = elMax ? parseInt(elMax.value, 10) : 0;
  c.maxTokens = (maxV && maxV > 0) ? maxV : 0;
  var elStream = $('apiStream'); if (elStream) c.stream = elStream.value === 'on';
  c.enabled = !!(c.baseUrl && c.apiKey && c.model);
  return c;
}

function updateApiUrlHint(){
  var el = $('apiUrlHint'), input = $('apiBaseUrl');
  if (!el || !input) return;
  var raw = input.value.trim();
  if (!raw) { el.textContent = '填写中转站的接口地址，可省略 https://。以 /v1 结尾会自动补 /chat/completions，其他情况补 /v1/chat/completions；地址末尾加 # 表示原样使用、不再自动补全。'; return; }
  el.textContent = '将请求：' + previewEndpoint(raw);
}

function setApiStatus(kind, text){
  var el = $('apiStatus'); if (!el) return;
  el.className = 'api-status';
  if (!text) { el.textContent = ''; return; }
  el.classList.add('show');
  if (kind) el.classList.add(kind);
  el.textContent = text;
}

function highlightPreset(){
  var c = getApiConfig(); var hitKey = null;
  Object.keys(PRESETS).forEach(function(k){
    if (k === 'custom') return;
    if (PRESETS[k].baseUrl && c.baseUrl && PRESETS[k].baseUrl.toLowerCase() === c.baseUrl.toLowerCase()) hitKey = k;
  });
  $$('#presetChips .chip').forEach(function(chip){ chip.classList.toggle('is-on', chip.dataset.preset === hitKey); });
}

function applyPreset(key){
  var p = PRESETS[key]; if (!p) return;
  var elUrl = $('apiBaseUrl'), elModel = $('apiModel'), elKey = $('apiKey');
  if (key === 'custom') {
    if (elUrl) elUrl.value = '';
    if (elModel) elModel.value = '';
    if (elKey) elKey.value = '';
  } else {
    if (elUrl) elUrl.value = p.baseUrl;
    if (elModel) elModel.value = p.model;
    var quickKey = State.settings && State.settings.apiQuickKeys ? String(State.settings.apiQuickKeys[key] || '') : '';
    if (elKey) elKey.value = quickKey;
  }
  updateApiUrlHint(); highlightPreset();
  releaseInputFocus();
}

function currentApiFormData(){
  var c = readApiForm();
  return Object.assign({}, c, {
    id: '',
    name: '',
    updatedAt: Date.now()
  });
}

function rememberQuickPresetKey(){
  var c = getApiConfig();
  if (!c || !c.baseUrl || !c.apiKey || !State.settings) return;
  if (!State.settings.apiQuickKeys || typeof State.settings.apiQuickKeys !== 'object') State.settings.apiQuickKeys = {};
  Object.keys(PRESETS).forEach(function(key){
    if (key === 'custom') return;
    var p = PRESETS[key];
    if (p.baseUrl && c.baseUrl && p.baseUrl.toLowerCase() === c.baseUrl.toLowerCase()) State.settings.apiQuickKeys[key] = c.apiKey;
  });
}

/* ───────────── 共用 API 预设池 ─────────────
 * 主 API / 副 API / 语音转文字 / 识图 / 向量记忆 / 重排 共用同一个预设池（State.settings.apiPresets）。
 * - 每一项 API 各自记着“自己正在用哪个预设”（activeXxxPresetId），在 A 里切换预设不会影响 B。
 * - 在任意一项里「新建预设」「更新当前」都是在写共用预设池，其他 API 的预设弹窗里立刻能看到。
 * - 点「保存」只保存并使用当前表单，不会改动池里的预设；其他 API 当前正在用的配置也不会被动。
 * - 预设里存的是接口地址 / 密钥 / 模型（主、副 API 另含温度、最大 token，主 API 另含输出方式）；
 *   每项 API 只读写自己用得到的字段，更新预设时不会冲掉别的 API 用到的字段。 */
var API_PRESET_SECTIONS = {
  primary: {
    label: '主 API', activeKey: 'activeApiPresetId', trigger: 'apiPresetTrigger', newBtn: 'apiNewPreset', updBtn: 'apiUpdatePreset', hint: 'apiPresetHint',
    extras: ['temperature', 'maxTokens', 'stream'],
    read: function(){ return readApiForm(); }, live: function(){ return getApiConfig(); },
    commit: function(){ State.settings.api = readApiForm(); },
    applyLive: function(p){ State.settings.api = Object.assign({}, getApiConfig(), { enabled: apiPresetReady(p), baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, temperature: p.temperature, maxTokens: p.maxTokens, stream: !!p.stream }); },
    fill: function(){ fillApiForm(); }, refresh: function(){ refreshApiState(); highlightPreset(); },
    status: function(k, t){ setApiStatus(k, t); }, remember: function(){ rememberQuickPresetKey(); }
  },
  secondary: {
    label: '副 API', activeKey: 'activeSecondaryApiPresetId', trigger: 'secondaryPresetTrigger', newBtn: 'secondaryNewPreset', updBtn: 'secondaryUpdatePreset', hint: 'secondaryPresetHint',
    extras: ['temperature', 'maxTokens'],
    read: function(){ return readSecondaryApiForm(); }, live: function(){ return getSecondaryApiConfig(); },
    commit: function(){ State.settings.secondaryApi = readSecondaryApiForm(); },
    applyLive: function(p){ State.settings.secondaryApi = Object.assign({}, getSecondaryApiConfig(), { enabled: apiPresetReady(p), baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, temperature: p.temperature, maxTokens: p.maxTokens }); },
    fill: function(){ fillSecondaryApiForm(); }, refresh: function(){ refreshSecondaryApiState(); highlightSecondaryPreset(); },
    status: function(k, t){ setSecondaryApiStatus(k, t); }, remember: function(){ rememberSecondaryQuickPresetKey(); }
  },
  stt: {
    label: '语音转文字', activeKey: 'activeSttPresetId', trigger: 'sttPresetTrigger', newBtn: 'sttNewPreset', updBtn: 'sttUpdatePreset', hint: 'sttPresetHint',
    extras: [],
    read: function(){ return readSttForm(); }, live: function(){ return getSttConfig(); },
    commit: function(){ State.settings.stt = readSttForm(); },
    applyLive: function(p){ State.settings.stt = Object.assign({}, getSttConfig(), { enabled: apiPresetReady(p), baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model }); },
    fill: function(){ fillSttForm(); }, refresh: function(){ refreshSttState(); highlightSttPreset(); },
    status: function(k, t){ setSttStatus(k, t); }, remember: function(){ rememberSttQuickKey(); }
  },
  vision: {
    label: '识图 API', activeKey: 'activeVisionPresetId', trigger: 'visionPresetTrigger', newBtn: 'visionNewPreset', updBtn: 'visionUpdatePreset', hint: 'visionPresetHint',
    extras: [],
    read: function(){ return readVisionForm(); }, live: function(){ return getVisionConfig(); },
    commit: function(){ State.settings.vision = readVisionForm(); },
    applyLive: function(p){
      var prev = getVisionConfig(), wasReady = !!(prev.baseUrl && prev.apiKey && prev.model), ready = apiPresetReady(p);
      State.settings.vision = Object.assign({}, prev, { baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, enabled: ready && (wasReady ? !!prev.enabled : true) });
    },
    fill: function(){ fillVisionForm(); }, refresh: function(){ refreshVisionState(); highlightVisionPreset(); },
    status: function(k, t){ setVisionStatus(k, t); }, remember: function(){ rememberVisionQuickKey(); }
  },
  vectorEmbedding: {
    label: '向量记忆 API', activeKey: 'activeVectorEmbeddingPresetId', trigger: 'vectorEmbeddingPresetTrigger', newBtn: 'vectorEmbeddingNewPreset', updBtn: 'vectorEmbeddingUpdatePreset', hint: 'vectorEmbeddingPresetHint',
    extras: [],
    read: function(){ return readVectorEmbeddingApiForm().embeddingApi; }, live: function(){ return getVectorMemorySettings().embeddingApi; },
    commit: function(){ readVectorEmbeddingApiForm(); },
    applyLive: function(p){ var s = getVectorMemorySettings(); s.embeddingApi = { baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model }; State.settings.vectorMemory = s; },
    fill: function(){ fillVectorEmbeddingApiForm(); }, refresh: function(){ refreshVectorMemoryApiState(); },
    status: function(k, t){ setVectorApiStatus('embedding', k, t); }, remember: null
  },
  vectorRerank: {
    label: '重排 API', activeKey: 'activeVectorRerankPresetId', trigger: 'vectorRerankPresetTrigger', newBtn: 'vectorRerankNewPreset', updBtn: 'vectorRerankUpdatePreset', hint: 'vectorRerankPresetHint',
    extras: [],
    read: function(){ return readVectorRerankApiForm().rerankApi; }, live: function(){ return getVectorMemorySettings().rerankApi; },
    commit: function(){ readVectorRerankApiForm(); },
    applyLive: function(p){ var s = getVectorMemorySettings(); s.rerankApi = { baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model }; State.settings.vectorMemory = s; },
    fill: function(){ fillVectorRerankApiForm(); }, refresh: function(){ refreshVectorMemoryApiState(); },
    status: function(k, t){ setVectorApiStatus('rerank', k, t); }, remember: null
  }
};

function apiPresetPool(){
  if (!State.settings) return [];
  if (!Array.isArray(State.settings.apiPresets)) State.settings.apiPresets = [];
  return State.settings.apiPresets;
}

function apiPresetReady(p){ return !!(p && String(p.baseUrl || '').trim() && String(p.apiKey || '').trim() && String(p.model || '').trim()); }

function findApiPreset(id){
  if (!id) return null;
  var pool = apiPresetPool();
  for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
  return null;
}

/* 取出某项 API 用得到的字段（其余字段不碰） */
function apiPresetFields(kind, src){
  src = src || {};
  var o = { baseUrl: String(src.baseUrl || '').trim(), apiKey: String(src.apiKey || '').trim(), model: String(src.model || '').trim() };
  API_PRESET_SECTIONS[kind].extras.forEach(function(k){ o[k] = src[k]; });
  return o;
}

/* 这项 API 当前生效的配置是否与它选中的预设不一致（比如在别处更新过该预设，或自己改过没点“更新当前”） */
function apiPresetIsModified(kind, preset){
  var sec = API_PRESET_SECTIONS[kind];
  var a = apiPresetFields(kind, sec.live()), b = apiPresetFields(kind, preset);
  if (a.baseUrl !== b.baseUrl || a.apiKey !== b.apiKey || a.model !== b.model) return true;
  for (var i = 0; i < sec.extras.length; i++) {
    var k = sec.extras[i];
    if (k === 'temperature') { var ta = Number(a[k]), tb = Number(b[k]); if (!Number.isFinite(ta)) ta = 0.85; if (!Number.isFinite(tb)) tb = 0.85; if (Math.abs(ta - tb) > 0.001) return true; }
    else if (k === 'maxTokens') { if ((parseInt(a[k], 10) || 0) !== (parseInt(b[k], 10) || 0)) return true; }
    else if (!!a[k] !== !!b[k]) return true;
  }
  return false;
}

function apiPresetHost(url){
  var u = String(url || '').trim().replace(/^[a-z]+:\/\//i, '');
  var h = u.split(/[\/?#]/)[0];
  return h || '未填写地址';
}

/* 刷新某项 API 里的预设选择按钮（显示当前预设名）和“更新当前”按钮 */
function renderPresetTrigger(kind){
  var sec = API_PRESET_SECTIONS[kind]; if (!sec) return;
  var btn = $(sec.trigger), upd = $(sec.updBtn), hint = $(sec.hint);
  var pool = apiPresetPool();
  var hit = findApiPreset(State.settings && State.settings[sec.activeKey]);
  if (!hit && State.settings && State.settings[sec.activeKey]) State.settings[sec.activeKey] = '';
  if (btn) {
    var text = btn.querySelector('.island-select-trigger-text');
    var label = hit ? (hit.name + (apiPresetIsModified(kind, hit) ? ' · 已修改' : '')) : (pool.length ? '选择预设（共 ' + pool.length + ' 个）' : '暂无预设');
    if (text) text.textContent = label;
    btn.classList.toggle('is-empty', !hit);
  }
  if (upd) {
    upd.disabled = !hit;
    upd.textContent = '更新当前';
    upd.setAttribute('aria-label', hit ? '更新当前预设' : '请先选择一个预设');
    upd.title = hit ? '用当前表单内容覆盖所选预设（共用预设池同步更新）' : '请先选择一个预设';
  }
  if (hint) hint.textContent = pool.length
    ? '预设池由主 API、副 API、语音转文字、识图、向量记忆、重排共用。在这里切换预设只影响' + sec.label + '，其他 API 不会跟着变。'
    : '预设池还是空的。填好下面的接口信息后，点“＋新建预设”，所有 API 的预设弹窗里都能选到它。';
}

function renderAllPresetTriggers(){ Object.keys(API_PRESET_SECTIONS).forEach(renderPresetTrigger); }

/* ── 预设选择弹窗 ── */
var apiPresetPickerEl = null, apiPresetPickerKind = '', apiPresetPickerHideTimer = 0;

function ensureApiPresetPicker(){
  if (apiPresetPickerEl) return apiPresetPickerEl;
  var el = document.createElement('div');
  el.className = 'island-dialog island-select-dialog api-preset-picker';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="island-dialog-backdrop"></div>' +
    '<section class="island-dialog-panel island-select-panel" role="dialog" aria-modal="true">' +
      '<h3 class="island-dialog-title"></h3>' +
      '<div class="api-pp-list" role="listbox"></div>' +
      '<div class="api-pp-note"></div>' +
      '<div class="island-dialog-actions"><button type="button" class="island-dialog-btn is-cancel">关闭</button></div>' +
    '</section>';
  document.body.appendChild(el);
  el.querySelector('.island-dialog-backdrop').addEventListener('click', closeApiPresetPicker);
  el.querySelector('.is-cancel').addEventListener('click', closeApiPresetPicker);
  el.querySelector('.api-pp-list').addEventListener('click', function(e){
    var del = e.target.closest('[data-pp-del]');
    if (del) { e.preventDefault(); e.stopPropagation(); confirmDeleteApiPreset(apiPresetPickerKind, del.dataset.ppDel); return; }
    var item = e.target.closest('[data-pp-id]');
    if (item) { var kind = apiPresetPickerKind, id = item.dataset.ppId; closeApiPresetPicker(); selectApiPreset(kind, id); }
  });
  document.addEventListener('keydown', function(e){
    if (apiPresetPickerEl && apiPresetPickerEl.classList.contains('is-show') && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); closeApiPresetPicker(); }
  });
  apiPresetPickerEl = el;
  return el;
}

function openApiPresetPicker(kind){
  var sec = API_PRESET_SECTIONS[kind]; if (!sec) return;
  var el = ensureApiPresetPicker();
  apiPresetPickerKind = kind;
  var pool = apiPresetPool();
  var activeId = State.settings[sec.activeKey] || '';
  el.querySelector('.island-dialog-title').textContent = '选择预设 · ' + sec.label;
  var list = el.querySelector('.api-pp-list');
  if (!pool.length) {
    list.innerHTML = '<div class="saved-preset-empty">预设池还是空的。关闭弹窗，填好接口信息后点“＋新建预设”。</div>';
  } else {
    list.innerHTML = pool.map(function(p){
      var on = p.id === activeId;
      var usedBy = Object.keys(API_PRESET_SECTIONS).filter(function(k){ return k !== kind && State.settings[API_PRESET_SECTIONS[k].activeKey] === p.id; }).map(function(k){ return API_PRESET_SECTIONS[k].label; });
      var sub = (p.model || '未填写模型') + ' · ' + apiPresetHost(p.baseUrl) + (usedBy.length ? ' · ' + usedBy.join('、') + ' 在用' : '');
      return '<div class="api-pp-row">' +
        '<button type="button" class="island-select-item api-pp-item' + (on ? ' is-on' : '') + '" role="option" aria-selected="' + (on ? 'true' : 'false') + '" data-pp-id="' + escapeHTML(p.id) + '">' +
          '<span class="api-pp-text"><span class="api-pp-name">' + escapeHTML(p.name) + '</span><span class="api-pp-sub">' + escapeHTML(sub) + '</span></span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></svg>' +
        '</button>' +
        '<button type="button" class="saved-preset-delete" data-pp-del="' + escapeHTML(p.id) + '" aria-label="删除预设 ' + escapeHTML(p.name) + '">×</button>' +
      '</div>';
    }).join('');
  }
  el.querySelector('.api-pp-note').textContent = '共用预设池 · 选中后只对' + sec.label + '生效；删除预设会从所有 API 的预设列表里移除。';
  clearTimeout(apiPresetPickerHideTimer);
  el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false');
  void el.offsetWidth; el.classList.add('is-show');
}

function closeApiPresetPicker(){
  var el = apiPresetPickerEl; if (!el) return;
  el.classList.remove('is-show'); el.setAttribute('aria-hidden', 'true');
  clearTimeout(apiPresetPickerHideTimer);
  apiPresetPickerHideTimer = setTimeout(function(){ if (!el.classList.contains('is-show')) el.classList.remove('is-open'); }, 190);
}

/* 在某项 API 里切换预设：只改这一项，其他 API 的配置和“当前预设”标记都不动 */
function selectApiPreset(kind, id){
  var sec = API_PRESET_SECTIONS[kind], hit = findApiPreset(id);
  if (!sec || !hit) return;
  var cfg = normalizeApiPreset(hit, 0);
  sec.applyLive(cfg);
  State.settings[sec.activeKey] = hit.id;
  sec.fill();
  renderPresetTrigger(kind);
  releaseInputFocus();
  saveSettings().then(function(){
    sec.refresh();
    toast('已切换 · ' + hit.name + '（' + sec.label + '）');
  });
}

function apiPresetFormIncomplete(kind, c, what){
  if (c && c.baseUrl && c.apiKey && c.model) return false;
  API_PRESET_SECTIONS[kind].status('err', '请先填写接口地址、API Key 和模型，再' + what + '预设。');
  return true;
}

/* 新建预设：写进共用预设池，并让当前这项 API 选中它 */
function createApiPresetFromForm(kind){
  var sec = API_PRESET_SECTIONS[kind];
  var c = sec.read();
  if (apiPresetFormIncomplete(kind, c, '保存')) return;
  islandPrompt('给这个预设起个名字（所有 API 共用）', { title: '新建预设', defaultValue: '新预设', maxLength: 40, confirmText: '保存' }).then(function(name){
    if (name === null) return;
    name = String(name).trim().slice(0, 40);
    if (!name) { toast('预设名称不能为空'); return; }
    var pool = apiPresetPool();
    var preset = normalizeApiPreset(Object.assign({}, apiPresetFields(kind, c), { id: genId('api_'), name: name, updatedAt: Date.now() }), pool.length);
    pool.unshift(preset);
    State.settings[sec.activeKey] = preset.id;
    sec.commit();
    if (sec.remember) sec.remember();
    renderPresetTrigger(kind);
    saveSettings().then(function(){
      sec.refresh();
      sec.status('ok', '✓ 已把预设“' + preset.name + '”存入共用预设池，' + sec.label + '正在使用它。其他 API 的配置不受影响，但它们的预设弹窗里已经能选到这个预设。');
      toast('预设已保存到共用预设池');
    });
  });
}

/* 更新当前：用这项 API 的表单覆盖所选预设（共用预设池同步更新）；预设里这项 API 用不到的字段保持原样 */
function updateApiPresetFromForm(kind){
  var sec = API_PRESET_SECTIONS[kind];
  var pool = apiPresetPool(), id = State.settings[sec.activeKey] || '', index = -1;
  for (var i = 0; i < pool.length; i++) if (pool[i].id === id) { index = i; break; }
  if (index < 0) { State.settings[sec.activeKey] = ''; renderPresetTrigger(kind); return false; }
  var c = sec.read();
  if (apiPresetFormIncomplete(kind, c, '更新')) return false;
  var preset = normalizeApiPreset(Object.assign({}, pool[index], apiPresetFields(kind, c), { id: pool[index].id, name: pool[index].name, updatedAt: Date.now() }), index);
  pool[index] = preset;
  sec.commit();
  if (sec.remember) sec.remember();
  renderPresetTrigger(kind);
  saveSettings().then(function(){
    sec.refresh();
    sec.status('ok', '✓ 已更新共用预设“' + preset.name + '”。其他 API 当前在用的配置不会被改动，它们下次选择这个预设时才会采用新内容。');
    toast('预设已更新（共用预设池）');
  });
  return true;
}

function confirmDeleteApiPreset(kind, id){
  var hit = findApiPreset(id); if (!hit) return;
  closeApiPresetPicker();
  var users = Object.keys(API_PRESET_SECTIONS).filter(function(k){ return State.settings[API_PRESET_SECTIONS[k].activeKey] === id; }).map(function(k){ return API_PRESET_SECTIONS[k].label; });
  var msg = '删除预设“' + hit.name + '”？\n它属于共用预设池，所有 API 的预设列表里都会删除。' + (users.length ? '\n' + users.join('、') + ' 正在使用的接口配置不会被改动。' : '');
  islandConfirm(msg, { title: '删除预设', confirmText: '删除', danger: true }).then(function(ok){
    if (ok) {
      var pool = apiPresetPool();
      for (var i = 0; i < pool.length; i++) if (pool[i].id === id) { pool.splice(i, 1); break; }
      API_PRESET_ACTIVE_KEYS.forEach(function(key){ if (State.settings[key] === id) State.settings[key] = ''; });
      renderAllPresetTriggers();
      saveSettings().then(function(){ toast('已删除预设'); });
    }
    openApiPresetPicker(kind);
  });
}

function initApiPresetPickers(){
  Object.keys(API_PRESET_SECTIONS).forEach(function(kind){
    var sec = API_PRESET_SECTIONS[kind];
    var trigger = $(sec.trigger); if (trigger) trigger.addEventListener('click', function(e){ e.preventDefault(); openApiPresetPicker(kind); });
    var nb = $(sec.newBtn); if (nb) nb.addEventListener('click', function(){ createApiPresetFromForm(kind); });
    var ub = $(sec.updBtn); if (ub) ub.addEventListener('click', function(){ updateApiPresetFromForm(kind); });
  });
}

function testConnection(){
  var btn = $('apiTest'); var draft = readApiForm();
  if (!draft.baseUrl || !draft.apiKey || !draft.model) {
    setApiStatus('err', '请先填写 Base URL、API Key 和模型名称。'); return;
  }
  var url = normalizeBaseUrl(draft.baseUrl);
  setApiStatus('warn', '正在测试 ' + url + ' …');
  if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
  var testMessages = [
    { role: 'system', content: '你是一个测试助手，只需回复“连接成功”四个字。' },
    { role: 'user', content: '请回复：连接成功' }
  ];
  var tempCfg = Object.assign({}, draft);
  tempCfg.maxTokens = Math.min(tempCfg.maxTokens || 32, 32);
  var startedAt = Date.now();
  callApiOnce(testMessages, tempCfg).then(function(content){
    var ms = Date.now() - startedAt;
    var text = String(content || '').trim();
    if (!text) setApiStatus('warn', '连接成功（' + ms + 'ms），但模型返回为空。可能该模型不支持当前参数。');
    else setApiStatus('ok', '✓ 连接成功（' + ms + 'ms · ' + (tempCfg.stream ? '流式' : '非流式') + '）\n模型返回：' + text.slice(0, 120));
    toast('连接成功');
  }).catch(function(err){
    var msg = (err && err.message) ? err.message : '未知错误';
    setApiStatus('err', '✗ 连接失败：\n' + msg);
    toast('连接失败');
  }).then(function(){
    if (btn) { btn.disabled = false; btn.textContent = '测试连接'; }
  });
}

function saveApiForm(){
  var c = readApiForm();
  if (!c.baseUrl || !c.apiKey || !c.model) { setApiStatus('err', '三项必填：Base URL、API Key、模型。'); return; }
  // 「保存」只保存并使用当前表单；不会改动任何已保存预设（覆盖预设请点「更新当前」）
  State.settings.api = c;
  rememberQuickPresetKey();
  var activePreset = findApiPreset(State.settings.activeApiPresetId);
  renderPresetTrigger('primary');
  saveSettings().then(function(){
    refreshApiState(); highlightPreset();
    setApiStatus('ok', activePreset
      ? '✓ 已保存并使用。预设“' + activePreset.name + '”未改动；如需覆盖它，请点「更新当前」。'
      : '✓ 已保存。聊天时会自动调用该接口。');
    toast('AI 接口已保存');
  });
}


function fillSecondaryApiForm(){
  var c = getSecondaryApiConfig();
  var elUrl = $('secondaryApiBaseUrl'), elKey = $('secondaryApiKey'), elModel = $('secondaryApiModel');
  var elTemp = $('secondaryApiTemp'), elTempV = $('secondaryApiTempVal');
  var elMax = $('secondaryApiMaxTokens');
  if (elUrl) elUrl.value = c.baseUrl || '';
  if (elKey) elKey.value = c.apiKey || '';
  if (elModel) elModel.value = c.model || '';
  if (elTemp) elTemp.value = (typeof c.temperature === 'number' ? c.temperature : 0.85);
  if (elTempV) elTempV.textContent = Number(elTemp ? elTemp.value : 0.85).toFixed(2);
  if (elMax) elMax.value = (c.maxTokens && c.maxTokens > 0) ? c.maxTokens : '';
  updateSecondaryApiUrlHint(); highlightSecondaryPreset(); renderPresetTrigger('secondary'); setSecondaryApiStatus('', '');
}

function readSecondaryApiForm(){
  var c = getSecondaryApiConfig();
  var elUrl = $('secondaryApiBaseUrl'), elKey = $('secondaryApiKey'), elModel = $('secondaryApiModel');
  var elTemp = $('secondaryApiTemp'), elMax = $('secondaryApiMaxTokens');
  c.baseUrl = elUrl ? elUrl.value.trim() : '';
  c.apiKey = elKey ? elKey.value.trim() : '';
  c.model = elModel ? elModel.value.trim() : '';
  c.temperature = elTemp ? parseFloat(elTemp.value) : 0.85;
  if (isNaN(c.temperature)) c.temperature = 0.85;
  var maxV = elMax ? parseInt(elMax.value, 10) : 0;
  c.maxTokens = (maxV && maxV > 0) ? maxV : 0;
  c.enabled = !!(c.baseUrl && c.apiKey && c.model);
  return c;
}

function updateSecondaryApiUrlHint(){
  var el = $('secondaryApiUrlHint'), input = $('secondaryApiBaseUrl');
  if (!el || !input) return;
  var raw = input.value.trim();
  if (!raw) { el.textContent = '填写副API的接口地址。若以 /v1 结尾会自动补 /chat/completions，其他情况补 /v1/chat/completions。'; return; }
  el.textContent = '将请求：' + previewEndpoint(raw);
}

function setSecondaryApiStatus(kind, text){
  var el = $('secondaryApiStatus'); if (!el) return;
  el.className = 'api-status';
  if (!text) { el.textContent = ''; return; }
  el.classList.add('show');
  if (kind) el.classList.add(kind);
  el.textContent = text;
}

function highlightSecondaryPreset(){
  var c = getSecondaryApiConfig(), hitKey = null;
  Object.keys(PRESETS).forEach(function(k){
    if (k === 'custom') return;
    if (PRESETS[k].baseUrl && c.baseUrl && PRESETS[k].baseUrl.toLowerCase() === c.baseUrl.toLowerCase()) hitKey = k;
  });
  $$('#secondaryPresetChips .chip').forEach(function(chip){ chip.classList.toggle('is-on', chip.dataset.preset === hitKey); });
}

function applySecondaryPreset(key){
  var p = PRESETS[key]; if (!p) return;
  var elUrl = $('secondaryApiBaseUrl'), elModel = $('secondaryApiModel'), elKey = $('secondaryApiKey');
  if (key === 'custom') {
    if (elUrl) elUrl.value = '';
    if (elModel) elModel.value = '';
    if (elKey) elKey.value = '';
  } else {
    if (elUrl) elUrl.value = p.baseUrl;
    if (elModel) elModel.value = p.model;
    var quickKey = State.settings && State.settings.secondaryApiQuickKeys ? String(State.settings.secondaryApiQuickKeys[key] || '') : '';
    if (elKey) elKey.value = quickKey;
  }
  updateSecondaryApiUrlHint(); highlightSecondaryPreset(); releaseInputFocus();
}

function currentSecondaryApiFormData(){
  var c = readSecondaryApiForm();
  return Object.assign({}, c, { id:'', name:'', updatedAt:Date.now() });
}

function rememberSecondaryQuickPresetKey(){
  var c = getSecondaryApiConfig();
  if (!c || !c.baseUrl || !c.apiKey || !State.settings) return;
  if (!State.settings.secondaryApiQuickKeys || typeof State.settings.secondaryApiQuickKeys !== 'object') State.settings.secondaryApiQuickKeys = {};
  Object.keys(PRESETS).forEach(function(key){
    if (key === 'custom') return;
    var p = PRESETS[key];
    if (p.baseUrl && c.baseUrl && p.baseUrl.toLowerCase() === c.baseUrl.toLowerCase()) State.settings.secondaryApiQuickKeys[key] = c.apiKey;
  });
}

function testSecondaryConnection(){
  var btn=$('secondaryApiTest'), draft=readSecondaryApiForm();
  if(!draft.baseUrl||!draft.apiKey||!draft.model){setSecondaryApiStatus('err','请先填写 Base URL、API Key 和模型名称。');return;}
  var url=normalizeBaseUrl(draft.baseUrl); setSecondaryApiStatus('warn','正在测试 '+url+' …'); if(btn){btn.disabled=true;btn.textContent='测试中…';}
  var testMessages=[{role:'system',content:'你是一个测试助手，只需回复“连接成功”四个字。'},{role:'user',content:'请回复：连接成功'}];
  var tempCfg=Object.assign({},draft); tempCfg.maxTokens=Math.min(tempCfg.maxTokens||32,32); var startedAt=Date.now();
  callApiOnce(testMessages,tempCfg).then(function(content){var ms=Date.now()-startedAt;var text=String(content||'').trim();if(!text)setSecondaryApiStatus('warn','连接成功（'+ms+'ms），但模型返回为空。可能该模型不支持当前参数。');else setSecondaryApiStatus('ok','✓ 连接成功（'+ms+'ms）\\n模型返回：'+text.slice(0,120));toast('副API连接成功');}).catch(function(err){var msg=(err&&err.message)?err.message:'未知错误';setSecondaryApiStatus('err','✗ 连接失败：\\n'+msg);toast('副API连接失败');}).then(function(){if(btn){btn.disabled=false;btn.textContent='测试连接';}});
}

function saveSecondaryApiForm(){
  var c = readSecondaryApiForm();
  if (!c.baseUrl || !c.apiKey || !c.model) { setSecondaryApiStatus('err', '三项必填：Base URL、API Key、模型。'); return; }
  // 「保存」只保存并使用当前表单；不会改动任何已保存的副API预设（覆盖预设请点「更新当前」）
  State.settings.secondaryApi = c; rememberSecondaryQuickPresetKey();
  var activePreset = findApiPreset(State.settings.activeSecondaryApiPresetId);
  renderPresetTrigger('secondary');
  saveSettings().then(function(){
    refreshSecondaryApiState(); highlightSecondaryPreset();
    setSecondaryApiStatus('ok', activePreset
      ? '✓ 已保存并使用。副API预设“' + activePreset.name + '”未改动；如需覆盖它，请点「更新当前」。'
      : '✓ 已保存副API。当前仅作为备用接口保存。');
    toast('副API已保存');
  });
}


var modelSheet = $('modelSheet'), modelMask = $('modelMask'), modelListEl = $('modelList');

var modelCountEl = $('modelCount'), modelSearchInput = $('modelSearchInput');

var modelSheetClose = $('modelSheetClose'), apiFetchModels = $('apiFetchModels');

var fetchedModels = [], modelSearchKey = '', activeModelContext = 'primary';

function normalizeModelContext(context){
  return context === 'secondary' || context === 'stt' || context === 'vision' || context === 'vectorEmbedding' || context === 'vectorRerank' ? context : 'primary';
}

function modelFieldId(){
  if (activeModelContext === 'secondary') return 'secondaryApiModel';
  if (activeModelContext === 'stt') return 'sttModel';
  if (activeModelContext === 'vision') return 'visionModel';
  if (activeModelContext === 'vectorEmbedding') return 'vectorEmbeddingApiModel';
  if (activeModelContext === 'vectorRerank') return 'vectorRerankApiModel';
  return 'apiModel';
}

function modelFetchButton(){
  if (activeModelContext === 'secondary') return $('secondaryApiFetchModels');
  if (activeModelContext === 'stt') return $('sttFetchModels');
  if (activeModelContext === 'vision') return $('visionFetchModels');
  if (activeModelContext === 'vectorEmbedding') return $('vectorEmbeddingFetchModels');
  if (activeModelContext === 'vectorRerank') return $('vectorRerankFetchModels');
  return apiFetchModels;
}

function modelStatusSetter(){
  if (activeModelContext === 'secondary') return function(status,text){ return setSecondaryApiStatus(status,text); };
  if (activeModelContext === 'stt') return function(status,text){ return setSttStatus(status,text); };
  if (activeModelContext === 'vision') return function(status,text){ return setVisionStatus(status,text); };
  if (activeModelContext === 'vectorEmbedding') return function(status,text){ return setVectorApiStatus('embedding',status,text); };
  if (activeModelContext === 'vectorRerank') return function(status,text){ return setVectorApiStatus('rerank',status,text); };
  return function(status,text){ return setApiStatus(status,text); };
}

function modelFormReader(){
  if (activeModelContext === 'secondary') return readSecondaryApiForm;
  if (activeModelContext === 'stt') return readSttForm;
  if (activeModelContext === 'vision') return readVisionForm;
  if (activeModelContext === 'vectorEmbedding') return readVectorEmbeddingApiForm;
  if (activeModelContext === 'vectorRerank') return readVectorRerankApiForm;
  return readApiForm;
}

function openModelSheet(context){ activeModelContext = normalizeModelContext(context); releaseInputFocus(); if (modelSheet) modelSheet.classList.add('is-open'); if (modelMask) modelMask.classList.add('is-open'); }

function closeModelSheet(){ if (modelSheet) modelSheet.classList.remove('is-open'); if (modelMask) modelMask.classList.remove('is-open'); }

function renderModelList(){
  if (!modelListEl) return;
  if (!fetchedModels.length) { modelListEl.innerHTML = '<div class="model-empty">没有可用模型</div>'; if (modelCountEl) modelCountEl.textContent = ''; return; }
  var key = modelSearchKey.trim().toLowerCase();
  var list = fetchedModels.filter(function(m){ return !key || m.toLowerCase().indexOf(key) !== -1; });
  if (modelCountEl) modelCountEl.textContent = '(' + list.length + '/' + fetchedModels.length + ')';
  if (!list.length) { modelListEl.innerHTML = '<div class="model-empty">没有匹配的模型</div>'; return; }
  var current = ($(modelFieldId()) ? $(modelFieldId()).value.trim() : '');
  var checkSvg = '<svg class="model-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></svg>';
  modelListEl.innerHTML = list.map(function(m){
    return '<div class="model-item ' + (m === current ? 'is-on' : '') + '" data-model="' + escapeHTML(m) + '">' +
      '<span class="model-item-name">' + escapeHTML(m) + '</span>' + checkSvg + '</div>';
  }).join('');
}

function normalizeVectorModelsUrl(url, kind){
  url = String(url || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/\/models$/i.test(url)) return url;
  var suffix = kind === 'rerank' ? /\/rerank$/i : /\/embeddings$/i;
  if (suffix.test(url)) url = url.replace(suffix, '');
  if (/\/chat\/completions$/i.test(url)) url = url.replace(/\/chat\/completions$/i, '');
  if (/\/v\d+[a-z]*$/i.test(url)) return url + '/models';
  return url + '/v1/models';
}

function modelListUrlForDraft(draft){
  if (activeModelContext === 'vectorEmbedding') return normalizeVectorModelsUrl(draft.baseUrl, 'embedding');
  if (activeModelContext === 'vectorRerank') return normalizeVectorModelsUrl(draft.baseUrl, 'rerank');
  return normalizeModelsUrl(draft.baseUrl);
}

function getModelFetchDraft(){
  var draft = modelFormReader()();
  if (activeModelContext === 'vectorEmbedding' || activeModelContext === 'vectorRerank') {
    var key = activeModelContext === 'vectorEmbedding' ? 'embeddingApi' : 'rerankApi';
    var saved = getVectorMemorySettings()[key] || {};
    // Android WebView/密码输入框在某些情况下会出现“视觉上有值、JS value 短暂为空”的情况，
    // 拉取模型时用已保存的配置兜底，避免误报“未填写”。
    draft.baseUrl = String(draft.baseUrl || saved.baseUrl || '').trim();
    draft.apiKey = String(draft.apiKey || saved.apiKey || '').trim();
    draft.model = String(draft.model || saved.model || '').trim();
  }
  return draft;
}

function fetchModels(context){
  activeModelContext = normalizeModelContext(context);
  var draft = getModelFetchDraft();
  var setStatus = modelStatusSetter();
  var fetchBtn = modelFetchButton();
  if (!draft.baseUrl) { setStatus('err', '请先填写接口地址，再拉取模型列表。'); return; }
  var url = modelListUrlForDraft(draft);
  if (fetchBtn) { fetchBtn.disabled = true; fetchBtn.textContent = '拉取中…'; }
  fetchedModels = []; modelSearchKey = '';
  if (modelSearchInput) modelSearchInput.value = '';
  if (modelListEl) modelListEl.innerHTML = '<div class="model-loading">正在拉取模型列表…\n' + escapeHTML(url) + '</div>';
  if (modelCountEl) modelCountEl.textContent = '';
  openModelSheet(activeModelContext);
  var headers = { 'Accept': 'application/json' };
  if (cleanApiKey(draft.apiKey)) headers.Authorization = 'Bearer ' + cleanApiKey(draft.apiKey);
  fetch(url, { method: 'GET', headers: headers })
    .then(function(res){
      return res.text().then(function(text){
        if (!res.ok) throw new Error(httpErrorText(res.status, text));
        var json;
        try { json = JSON.parse(text); } catch(e){ throw new Error('响应不是合法 JSON\n' + text.slice(0, 200)); }
        var arr = [];
        if (Array.isArray(json)) arr = json;
        else if (Array.isArray(json.data)) arr = json.data;
        else if (Array.isArray(json.models)) arr = json.models;
        else if (json.data && typeof json.data === 'object') arr = Object.keys(json.data).map(function(k){ return { id: k }; });
        var ids = [];
        arr.forEach(function(item){
          if (!item) return;
          var id = '';
          if (typeof item === 'string') id = item;
          else if (item.id) id = item.id;
          else if (item.name) id = item.name;
          else if (item.model) id = item.model;
          if (id) ids.push(String(id).trim().replace(/^models\//, ''));
        });
        var seen = {};
        ids = ids.filter(function(v){ if (!v || seen[v]) return false; seen[v] = true; return true; });
        ids.sort(function(a, b){ return a.localeCompare(b); });
        return ids;
      });
    })
    .then(function(ids){
      fetchedModels = ids; renderModelList();
      if (!ids.length) {
        toast('没有拉取到模型');
        if (modelListEl) modelListEl.innerHTML = '<div class="model-empty">拉取成功，但返回的列表为空。\n该中转站可能未开放 /models 接口。</div>';
      } else toast('已拉取 ' + ids.length + ' 个模型');
    })
    .catch(function(err){
      console.error('[岛屿] 拉取模型失败：', err);
      var msg = (err && err.message) ? err.message : '未知错误';
      if (modelListEl) modelListEl.innerHTML = '<div class="model-empty">拉取失败\n' + escapeHTML(msg) + '</div>';
      toast('拉取失败');
    })
    .then(function(){
      if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V10h-5.5"/></svg>拉取模型';
      }
    });
}

function bindSettingsApiEvents(){

  $$('.js-settings-back').forEach(function(btn){ btn.addEventListener('click', closeSettingsApp); });
  var gotoSecondaryApi = $('gotoSecondaryApi');
  if (gotoSecondaryApi) gotoSecondaryApi.addEventListener('click', function(){ fillSecondaryApiForm(); switchSettingsPanel('secondaryApi'); });
  $$('.js-secondary-api-back').forEach(function(btn){ btn.addEventListener('click', function(){ closeModelSheet(); switchSettingsPanel('main'); }); });
  var gotoVectorMemoryApi = $('gotoVectorMemoryApi');
  if (gotoVectorMemoryApi) gotoVectorMemoryApi.addEventListener('click', function(){ fillVectorEmbeddingApiForm(); switchSettingsPanel('vectorMemoryApi'); });
  var gotoVectorRerankApi = $('gotoVectorRerankApi');
  if (gotoVectorRerankApi) gotoVectorRerankApi.addEventListener('click', function(){ fillVectorRerankApiForm(); switchSettingsPanel('vectorRerankApi'); });
  $$('.js-vector-memory-api-back').forEach(function(btn){ btn.addEventListener('click', function(){ switchSettingsPanel('main'); }); });
  $$('.js-vector-rerank-api-back').forEach(function(btn){ btn.addEventListener('click', function(){ switchSettingsPanel('main'); }); });
  if ($('vectorEmbeddingApiBaseUrl')) $('vectorEmbeddingApiBaseUrl').addEventListener('input', updateVectorApiHints);
  if ($('vectorRerankApiBaseUrl')) $('vectorRerankApiBaseUrl').addEventListener('input', updateVectorApiHints);
  if ($('vectorEmbeddingApiSave')) $('vectorEmbeddingApiSave').addEventListener('click', saveVectorEmbeddingApiForm);
  if ($('vectorRerankApiSave')) $('vectorRerankApiSave').addEventListener('click', saveVectorRerankApiForm);
  if ($('vectorEmbeddingApiTest')) $('vectorEmbeddingApiTest').addEventListener('click', testVectorEmbeddingApi);
  if ($('vectorRerankApiTest')) $('vectorRerankApiTest').addEventListener('click', testVectorRerankApi);
  var secondaryChips = $('secondaryPresetChips');
  if (secondaryChips) secondaryChips.addEventListener('click', function(e){ var chip=e.target.closest('.chip'); if(chip) applySecondaryPreset(chip.dataset.preset); });
  var secondaryUrl = $('secondaryApiBaseUrl'); if (secondaryUrl) { secondaryUrl.addEventListener('input', updateSecondaryApiUrlHint); secondaryUrl.addEventListener('change', updateSecondaryApiUrlHint); }
  var secondaryTemp = $('secondaryApiTemp'), secondaryTempVal = $('secondaryApiTempVal'); if (secondaryTemp && secondaryTempVal) secondaryTemp.addEventListener('input', function(){ secondaryTempVal.textContent=parseFloat(secondaryTemp.value).toFixed(2); });
  var secondaryEye = $('secondaryApiKeyEye'), secondaryKey = $('secondaryApiKey'); if (secondaryKey) secondaryKey.addEventListener('change', function(){ if(!State.settings) return; rememberSecondaryQuickPresetKey(); scheduleSettingsSave(180); });
  if (secondaryEye && secondaryKey) secondaryEye.addEventListener('click', function(){ var isPwd=secondaryKey.type==='password'; secondaryKey.type=isPwd?'text':'password'; });
  var secondaryTest = $('secondaryApiTest'); if (secondaryTest) secondaryTest.addEventListener('click', testSecondaryConnection);
  var secondarySave = $('secondaryApiSave'); if (secondarySave) secondarySave.addEventListener('click', saveSecondaryApiForm);
  var secondaryFetch = $('secondaryApiFetchModels'); if (secondaryFetch) secondaryFetch.addEventListener('click', function(){ fetchModels('secondary'); });
  var vectorEmbeddingFetch = $('vectorEmbeddingFetchModels'); if (vectorEmbeddingFetch) vectorEmbeddingFetch.addEventListener('click', function(){ fetchModels('vectorEmbedding'); });
  var vectorRerankFetch = $('vectorRerankFetchModels'); if (vectorRerankFetch) vectorRerankFetch.addEventListener('click', function(){ fetchModels('vectorRerank'); });


  $$('.js-notification-back').forEach(function(btn){ btn.addEventListener('click', function(){ switchSettingsPanel('main'); }); });
  var notificationToggle=$('notificationEnabledToggle');
  if(notificationToggle) notificationToggle.addEventListener('click',function(){
    var n=getNotificationConfig();
    if(!n.enabled){ requestNotificationPermission().then(function(ok){ if(ok) setNotificationConfig({enabled:true,nextProactiveAt:randomNextProactiveAt(new Date())}); }); }
    else setNotificationConfig({enabled:false});
  });
  var notificationMin=$('notificationMinInterval'); if(notificationMin) notificationMin.addEventListener('change',function(){ setNotificationConfig({minInterval:Number(notificationMin.value)}); });
  var notificationMax=$('notificationMaxInterval'); if(notificationMax) notificationMax.addEventListener('change',function(){ setNotificationConfig({maxInterval:Number(notificationMax.value)}); });
  var notificationQuietStart=$('notificationQuietStart'); if(notificationQuietStart) notificationQuietStart.addEventListener('change',function(){ setNotificationConfig({quietStart:notificationQuietStart.value}); });
  var notificationQuietEnd=$('notificationQuietEnd'); if(notificationQuietEnd) notificationQuietEnd.addEventListener('change',function(){ setNotificationConfig({quietEnd:notificationQuietEnd.value}); });
  var notificationPermissionBtn=$('notificationPermissionBtn'); if(notificationPermissionBtn) notificationPermissionBtn.addEventListener('click',requestNotificationPermission);
  var notificationTestBtn=$('notificationTestBtn'); if(notificationTestBtn) notificationTestBtn.addEventListener('click',function(){ requestNotificationPermission().then(function(ok){ if(!ok) return; showCharacterNotification('岛屿','这是一条通知测试消息。').then(function(){ toast('测试通知已发送'); }); }); });
  renderNotificationSettings();

  var gotoStt = $('gotoStt');
  if (gotoStt) gotoStt.addEventListener('click', function(){ fillSttForm(); switchSettingsPanel('stt'); });
  $$('.js-stt-back').forEach(function(btn){ btn.addEventListener('click', function(){ closeModelSheet(); switchSettingsPanel('main'); }); });
  var sttChips = $('sttPresetChips');
  if (sttChips) sttChips.addEventListener('click', function(e){ var chip=e.target.closest('.chip'); if(chip) applySttPreset(chip.dataset.preset); });
  var sttUrl = $('sttBaseUrl'); if (sttUrl) { sttUrl.addEventListener('input', updateSttUrlHint); sttUrl.addEventListener('change', updateSttUrlHint); }
  var sttEye = $('sttApiKeyEye'), sttKey = $('sttApiKey'); if (sttEye && sttKey) sttEye.addEventListener('click', function(){ var isPwd=sttKey.type==='password'; sttKey.type=isPwd?'text':'password'; });
  if (sttKey) sttKey.addEventListener('change', function(){ if(!State.settings) return; rememberSttQuickKey(); scheduleSettingsSave(180); });
  var sttTest = $('sttTest'); if (sttTest) sttTest.addEventListener('click', testSttConnection);
  var sttSave = $('sttSave'); if (sttSave) sttSave.addEventListener('click', saveSttForm);
  var sttFetch = $('sttFetchModels'); if (sttFetch) sttFetch.addEventListener('click', function(){ fetchModels('stt'); });
  var autoRetryToggle = $('autoRetryToggle');
  if (autoRetryToggle) autoRetryToggle.addEventListener('click', function(){
    State.settings.autoRetry = !(State.settings.autoRetry === true);
    renderAutoRetryToggle();
    saveSettings().then(function(){ toast(State.settings.autoRetry ? '自动重试已开启' : '自动重试已关闭'); });
  });
  enhanceSettingsSelects();
  var gotoVision = $('gotoVision');
  if (gotoVision) gotoVision.addEventListener('click', function(){ fillVisionForm(); switchSettingsPanel('vision'); });
  $$('.js-vision-back').forEach(function(btn){ btn.addEventListener('click', function(){ closeModelSheet(); switchSettingsPanel('main'); }); });
  var visionChips = $('visionPresetChips');
  if (visionChips) visionChips.addEventListener('click', function(e){ var chip = e.target.closest('.chip'); if (chip) applyVisionPreset(chip.dataset.preset); });
  var visionUrl = $('visionBaseUrl'); if (visionUrl) { visionUrl.addEventListener('input', updateVisionUrlHint); visionUrl.addEventListener('change', updateVisionUrlHint); }
  var visionEye = $('visionApiKeyEye'), visionKey = $('visionApiKey'); if (visionEye && visionKey) visionEye.addEventListener('click', function(){ var isPwd = visionKey.type === 'password'; visionKey.type = isPwd ? 'text' : 'password'; });
  var visionTest = $('visionTest'); if (visionTest) visionTest.addEventListener('click', testVisionConnection);
  var visionSave = $('visionSave'); if (visionSave) visionSave.addEventListener('click', saveVisionForm);
  var visionFetch = $('visionFetchModels'); if (visionFetch) visionFetch.addEventListener('click', function(){ fetchModels('vision'); });

  var gotoApi = $('gotoApi');
  if (gotoApi) {
    gotoApi.addEventListener('click', function(){ fillApiForm(); switchSettingsPanel('api'); });
  }
  $$('.js-api-back').forEach(function(btn){
    btn.addEventListener('click', function(){ closeModelSheet(); switchSettingsPanel('main'); });
  });
  if (settingsApp) {
    settingsApp.addEventListener('click', function(e){
      var meItem = e.target.closest('.me-item');
      if (meItem && meItem.dataset.me) { if (meItem.dataset.me === '通知') { switchSettingsPanel('notifications'); renderNotificationSettings(); return; } toast(meItem.dataset.me + ' · 开发中'); }
    });
  }

  var chips = $('presetChips');
  if (chips) {
    chips.addEventListener('click', function(e){
      var chip = e.target.closest('.chip');
      if (!chip) return;
      applyPreset(chip.dataset.preset);
    });
  }
  initApiPresetPickers();

  var elUrl = $('apiBaseUrl');
  if (elUrl) {
    elUrl.addEventListener('input', updateApiUrlHint);
    elUrl.addEventListener('change', updateApiUrlHint);
  }
  var elTempEl = $('apiTemp'), elTempVal = $('apiTempVal');
  if (elTempEl && elTempVal) {
    elTempEl.addEventListener('input', function(){ elTempVal.textContent = parseFloat(elTempEl.value).toFixed(2); });
  }
  var eyeBtn = $('apiKeyEye'), keyInput = $('apiKey');
  if (keyInput) {
    keyInput.addEventListener('change', function(){
      var c = readApiForm();
      if (!c.baseUrl || !c.apiKey || !State.settings) return;
      rememberQuickPresetKey();
      scheduleSettingsSave(180);
    });
  }
  if (eyeBtn && keyInput) {
    eyeBtn.addEventListener('click', function(){
      var isPwd = keyInput.type === 'password';
      keyInput.type = isPwd ? 'text' : 'password';
    });
  }
  var testBtn = $('apiTest'); if (testBtn) testBtn.addEventListener('click', testConnection);
  var saveBtn = $('apiSave'); if (saveBtn) saveBtn.addEventListener('click', saveApiForm);
  if (apiFetchModels) apiFetchModels.addEventListener('click', function(){ fetchModels('primary'); });
  if (modelSheetClose) modelSheetClose.addEventListener('click', closeModelSheet);
  if (modelMask) modelMask.addEventListener('click', closeModelSheet);
  if (modelSearchInput) {
    modelSearchInput.addEventListener('input', function(){
      modelSearchKey = modelSearchInput.value;
      renderModelList();
    });
  }
  if (modelListEl) {
    modelListEl.addEventListener('click', function(e){
      var item = e.target.closest('.model-item');
      if (!item) return;
      var model = item.dataset.model;
      var modelField = $(modelFieldId());
      if (modelField) modelField.value = model;
      $$('.model-item', modelListEl).forEach(function(el){ el.classList.toggle('is-on', el.dataset.model === model); });
      toast('已选择 · ' + model);
      setTimeout(closeModelSheet, 200);
    });
  }
}
