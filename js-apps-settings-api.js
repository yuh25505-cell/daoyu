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
  updateVectorApiHints();
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
  updateVectorApiHints();
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
  saveSettings().then(function(){refreshVectorMemoryApiState();setVectorApiStatus('embedding','ok','✓ 向量记忆 API 已保存。');toast('向量记忆 API 已保存');});
}

function saveVectorRerankApiForm(){
  var s=readVectorRerankApiForm();
  if(!s.rerankApi.baseUrl||!s.rerankApi.apiKey||!s.rerankApi.model){setVectorApiStatus('rerank','err','接口地址、API Key、模型均为必填。');return;}
  saveSettings().then(function(){refreshVectorMemoryApiState();setVectorApiStatus('rerank','ok','✓ 重排 API 已保存。');toast('重排 API 已保存');});
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
  updateSttUrlHint(); highlightSttPreset(); setSttStatus('', '');
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
  saveSettings().then(function(){ refreshSttState(); highlightSttPreset(); setSttStatus('ok','✓ 已保存。聊天语音会优先使用该 STT 接口进行转写。'); toast('语音转文字已保存'); });
}

function testSttConnection(){
  var btn = $('sttTest'), draft = readSttForm();
  if (!draft.baseUrl || !draft.apiKey || !draft.model) { setSttStatus('err','请先填写 Base URL、API Key 和识别模型。'); return; }
  var url = normalizeModelsUrl(draft.baseUrl);
  setSttStatus('warn','正在测试模型接口 ' + url + ' …');
  if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
  fetch(url, { method:'GET', headers:{ 'Authorization':'Bearer ' + draft.apiKey, 'Accept':'application/json' } }).then(function(res){
    return res.text().then(function(text){
      if (!res.ok) throw new Error(httpErrorText(res.status, text));
      var json; try { json = JSON.parse(text); } catch(e){ throw new Error('响应不是合法 JSON\n' + text.slice(0, 220)); }
      var arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : (Array.isArray(json.models) ? json.models : []));
      setSttStatus('ok','✓ 接口可访问，模型列表返回 ' + arr.length + ' 项。实际录音转写时将请求：\n' + normalizeTranscriptionsUrl(draft.baseUrl));
      toast('STT 接口连接成功');
    });
  }).catch(function(err){ setSttStatus('err','✗ 测试失败：\n' + (err && err.message ? err.message : '未知错误')); toast('STT 接口连接失败'); }).then(function(){ if(btn){btn.disabled=false;btn.textContent='测试接口';} });
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
  updateApiUrlHint(); highlightPreset(); renderSavedPresets(); updateSavedPresetButton(); setApiStatus('', '');
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
  c.enabled = !!(c.baseUrl && c.apiKey && c.model);
  return c;
}

function updateApiUrlHint(){
  var el = $('apiUrlHint'), input = $('apiBaseUrl');
  if (!el || !input) return;
  var raw = input.value.trim();
  if (!raw) { el.textContent = '填写中转站的接口地址。若以 /v1 结尾会自动补 /chat/completions，其他情况补 /v1/chat/completions。'; return; }
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

function renderSavedPresets(){
  var list = $('savedPresetList'), hint = $('savedPresetHint');
  if (!list) return;
  var presets = (State.settings && Array.isArray(State.settings.apiPresets)) ? State.settings.apiPresets : [];
  if (!presets.length) {
    list.innerHTML = '<div class="saved-preset-empty">暂无预设。保存后会一直显示在这里，点击预设名称即可立即切换接口。</div>';
    if (hint) hint.style.display = 'none';
    return;
  }
  if (hint) hint.style.display = '';
  var activeId = State.settings.activeApiPresetId || '';
  list.innerHTML = presets.map(function(p){
    return '<div class="saved-preset-row">' +
      '<button class="saved-preset-item' + (p.id === activeId ? ' is-active' : '') + '" type="button" data-saved-preset-id="' + escapeHTML(p.id) + '">' +
        '<span class="saved-preset-main"><span class="saved-preset-name"><span>' + escapeHTML(p.name) + '</span>' + (p.id === activeId ? '<span class="saved-preset-current">当前</span>' : '') + '</span></span>' +
      '</button>' +
      '<button class="saved-preset-delete" type="button" data-delete-preset-id="' + escapeHTML(p.id) + '" aria-label="删除 ' + escapeHTML(p.name) + '">×</button>' +
    '</div>';
  }).join('');
}

function activateSavedPreset(id){
  var presets = State.settings && Array.isArray(State.settings.apiPresets) ? State.settings.apiPresets : [];
  var hit = null;
  for (var i = 0; i < presets.length; i++) if (presets[i].id === id) { hit = presets[i]; break; }
  if (!hit) return;
  var cfg = normalizeApiPreset(hit);
  cfg.id = hit.id; cfg.name = hit.name; cfg.updatedAt = Date.now();
  State.settings.api = {
    enabled: !!(cfg.baseUrl && cfg.apiKey && cfg.model),
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens
  };
  State.settings.activeApiPresetId = hit.id;
  fillApiForm();
  updateSavedPresetButton();
  releaseInputFocus();
  saveSettings().then(function(){
    refreshApiState();
    toast('已切换 · ' + hit.name);
  });
}

function updateActivePresetFromForm(){
  var c = currentApiFormData();
  if (!c.baseUrl || !c.apiKey || !c.model) { setApiStatus('err', '请先填写 Base URL、API Key 和模型，再更新预设。'); return false; }
  var presets = State.settings.apiPresets || (State.settings.apiPresets = []);
  var activeId = State.settings.activeApiPresetId || '';
  var index = -1, hit = null;
  for (var i = 0; i < presets.length; i++) {
    if (presets[i].id === activeId) { index = i; hit = presets[i]; break; }
  }
  if (index < 0 || !hit) {
    State.settings.activeApiPresetId = '';
    return false;
  }
  var preset = normalizeApiPreset(Object.assign({}, c, {
    id: hit.id,
    name: hit.name,
    updatedAt: Date.now()
  }), index);
  presets[index] = preset;
  State.settings.api = {
    enabled: c.enabled, baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model,
    temperature: c.temperature, maxTokens: c.maxTokens
  };
  rememberQuickPresetKey();
  renderSavedPresets();
  updateSavedPresetButton();
  saveSettings().then(function(){
    refreshApiState();
    setApiStatus('ok', '✓ 已更新预设“' + preset.name + '”，聊天将使用最新配置。');
    toast('预设已更新');
  });
  return true;
}

function saveCurrentAsPreset(){
  var c = currentApiFormData();
  if (!c.baseUrl || !c.apiKey || !c.model) { setApiStatus('err', '请先填写 Base URL、API Key 和模型，再保存预设。'); return; }
  var name = window.prompt('给这个 API 预设起个名字', '新预设');
  if (name === null) return;
  name = String(name).trim().slice(0, 40);
  if (!name) { toast('预设名称不能为空'); return; }
  var presets = State.settings.apiPresets || (State.settings.apiPresets = []);
  var preset = normalizeApiPreset(Object.assign({}, c, { id: genId('api_'), name: name, updatedAt: Date.now() }), presets.length);
  presets.unshift(preset);
  State.settings.activeApiPresetId = preset.id;
  State.settings.api = {
    enabled: c.enabled, baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model,
    temperature: c.temperature, maxTokens: c.maxTokens
  };
  rememberQuickPresetKey();
  renderSavedPresets();
  updateSavedPresetButton();
  saveSettings().then(function(){ refreshApiState(); setApiStatus('ok', '✓ 已保存预设“' + preset.name + '”，现在它就是当前聊天 API。'); toast('预设已保存'); });
}

function updateSavedPresetButton(){
  var btn = $('apiUpdatePreset');
  if (!btn) return;
  var activeId = State.settings.activeApiPresetId || '';
  var hasActive = activeId && Array.isArray(State.settings.apiPresets) && State.settings.apiPresets.some(function(p){ return p.id === activeId; });
  btn.disabled = !hasActive;
  btn.textContent = '更新当前';
  btn.setAttribute('aria-label', hasActive ? '更新当前预设' : '请先选择已保存预设');
  btn.title = hasActive ? '用当前表单内容覆盖所选预设' : '请先选择一个已保存预设';
}

function deleteSavedPreset(id){
  var presets = State.settings && Array.isArray(State.settings.apiPresets) ? State.settings.apiPresets : [];
  var index = -1, hit = null;
  for (var i = 0; i < presets.length; i++) if (presets[i].id === id) { index = i; hit = presets[i]; break; }
  if (index < 0 || !hit) return;
  if (!window.confirm('删除预设“' + hit.name + '”？')) return;
  presets.splice(index, 1);
  if (State.settings.activeApiPresetId === id) State.settings.activeApiPresetId = '';
  renderSavedPresets();
  updateSavedPresetButton();
  saveSettings().then(function(){ refreshApiState(); toast('已删除预设'); });
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
    else setApiStatus('ok', '✓ 连接成功（' + ms + 'ms）\n模型返回：' + text.slice(0, 120));
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
  State.settings.api = c;
  rememberQuickPresetKey();
  var activeId = State.settings.activeApiPresetId || '';
  if (activeId && Array.isArray(State.settings.apiPresets)) {
    for (var i = 0; i < State.settings.apiPresets.length; i++) {
      if (State.settings.apiPresets[i].id === activeId) {
        State.settings.apiPresets[i] = normalizeApiPreset(Object.assign({}, c, { id: activeId, name: State.settings.apiPresets[i].name, updatedAt: Date.now() }), i);
        break;
      }
    }
  }
  renderSavedPresets();
  updateSavedPresetButton();
  saveSettings().then(function(){
    refreshApiState(); highlightPreset();
    setApiStatus('ok', activeId ? '✓ 已保存，并同步更新当前预设。聊天时会自动调用该接口。' : '✓ 已保存。聊天时会自动调用该接口。');
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
  updateSecondaryApiUrlHint(); highlightSecondaryPreset(); renderSecondarySavedPresets(); updateSecondarySavedPresetButton(); setSecondaryApiStatus('', '');
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

function renderSecondarySavedPresets(){
  var list = $('secondarySavedPresetList'), hint = $('secondarySavedPresetHint');
  if (!list) return;
  var presets = (State.settings && Array.isArray(State.settings.secondaryApiPresets)) ? State.settings.secondaryApiPresets : [];
  if (!presets.length) {
    list.innerHTML = '<div class="saved-preset-empty">暂无预设。保存后会一直显示在这里，点击预设名称即可立即切换副API。</div>';
    if (hint) hint.style.display = 'none';
    return;
  }
  if (hint) hint.style.display = '';
  var activeId = State.settings.activeSecondaryApiPresetId || '';
  list.innerHTML = presets.map(function(p){
    return '<div class="saved-preset-row">' +
      '<button class="saved-preset-item' + (p.id === activeId ? ' is-active' : '') + '" type="button" data-secondary-saved-preset-id="' + escapeHTML(p.id) + '">' +
        '<span class="saved-preset-main"><span class="saved-preset-name"><span>' + escapeHTML(p.name) + '</span>' + (p.id === activeId ? '<span class="saved-preset-current">当前</span>' : '') + '</span></span>' +
      '</button>' +
      '<button class="saved-preset-delete" type="button" data-delete-secondary-preset-id="' + escapeHTML(p.id) + '" aria-label="删除 ' + escapeHTML(p.name) + '">×</button>' +
    '</div>';
  }).join('');
}

function activateSecondarySavedPreset(id){
  var presets = State.settings && Array.isArray(State.settings.secondaryApiPresets) ? State.settings.secondaryApiPresets : [];
  var hit = null;
  for (var i = 0; i < presets.length; i++) if (presets[i].id === id) { hit = presets[i]; break; }
  if (!hit) return;
  var cfg = normalizeSecondaryApiPreset(hit);
  State.settings.secondaryApi = { enabled:!!(cfg.baseUrl && cfg.apiKey && cfg.model), baseUrl:cfg.baseUrl, apiKey:cfg.apiKey, model:cfg.model, temperature:cfg.temperature, maxTokens:cfg.maxTokens };
  State.settings.activeSecondaryApiPresetId = hit.id;
  fillSecondaryApiForm(); updateSecondarySavedPresetButton(); releaseInputFocus();
  saveSettings().then(function(){ refreshSecondaryApiState(); toast('已切换副API · ' + hit.name); });
}

function updateSecondaryActivePresetFromForm(){
  var c = currentSecondaryApiFormData();
  if (!c.baseUrl || !c.apiKey || !c.model) { setSecondaryApiStatus('err','请先填写 Base URL、API Key 和模型，再更新预设。'); return false; }
  var presets = State.settings.secondaryApiPresets || (State.settings.secondaryApiPresets = []);
  var activeId = State.settings.activeSecondaryApiPresetId || '', index = -1, hit = null;
  for (var i=0;i<presets.length;i++) if (presets[i].id === activeId) { index=i; hit=presets[i]; break; }
  if (index < 0 || !hit) { State.settings.activeSecondaryApiPresetId=''; return false; }
  var preset = normalizeSecondaryApiPreset(Object.assign({}, c, {id:hit.id,name:hit.name,updatedAt:Date.now()}), index);
  presets[index] = preset;
  State.settings.secondaryApi = {enabled:c.enabled,baseUrl:c.baseUrl,apiKey:c.apiKey,model:c.model,temperature:c.temperature,maxTokens:c.maxTokens};
  rememberSecondaryQuickPresetKey(); renderSecondarySavedPresets(); updateSecondarySavedPresetButton(); saveSettings().then(function(){ refreshSecondaryApiState(); setSecondaryApiStatus('ok','✓ 已更新副API预设“'+preset.name+'”。当前仅作为备用接口保存。'); toast('副API预设已更新'); });
  return true;
}

function saveSecondaryCurrentAsPreset(){
  var c = currentSecondaryApiFormData();
  if (!c.baseUrl || !c.apiKey || !c.model) { setSecondaryApiStatus('err','请先填写 Base URL、API Key 和模型，再保存预设。'); return; }
  var name = window.prompt('给这个副API预设起个名字','新预设');
  if (name === null) return;
  name = String(name).trim().slice(0,40);
  if (!name) { toast('预设名称不能为空'); return; }
  var presets = State.settings.secondaryApiPresets || (State.settings.secondaryApiPresets=[]);
  var preset = normalizeSecondaryApiPreset(Object.assign({},c,{id:genId('subapi_'),name:name,updatedAt:Date.now()}),presets.length);
  presets.unshift(preset); State.settings.activeSecondaryApiPresetId=preset.id;
  State.settings.secondaryApi={enabled:c.enabled,baseUrl:c.baseUrl,apiKey:c.apiKey,model:c.model,temperature:c.temperature,maxTokens:c.maxTokens};
  rememberSecondaryQuickPresetKey(); renderSecondarySavedPresets(); updateSecondarySavedPresetButton(); saveSettings().then(function(){refreshSecondaryApiState();setSecondaryApiStatus('ok','✓ 已保存副API预设“'+preset.name+'”，现在它就是当前选中的副API预设。');toast('副API预设已保存');});
}

function updateSecondarySavedPresetButton(){
  var btn=$('secondaryUpdatePreset'); if(!btn) return;
  var id=State.settings.activeSecondaryApiPresetId||'', has=id&&Array.isArray(State.settings.secondaryApiPresets)&&State.settings.secondaryApiPresets.some(function(p){return p.id===id;});
  btn.disabled=!has; btn.textContent='更新当前'; btn.setAttribute('aria-label',has?'更新当前副API预设':'请先选择已保存预设'); btn.title=has?'用当前表单内容覆盖所选副API预设':'请先选择一个已保存副API预设';
}

function deleteSecondarySavedPreset(id){
  var presets = State.settings && Array.isArray(State.settings.secondaryApiPresets) ? State.settings.secondaryApiPresets : [];
  var index=-1; for(var i=0;i<presets.length;i++) if(presets[i].id===id){index=i;break;}
  if(index<0) return;
  var name=presets[index].name||'预设';
  if(!window.confirm('删除副API预设“'+name+'”？')) return;
  presets.splice(index,1);
  if(State.settings.activeSecondaryApiPresetId===id){State.settings.activeSecondaryApiPresetId='';}
  renderSecondarySavedPresets(); updateSecondarySavedPresetButton(); saveSettings().then(function(){refreshSecondaryApiState();toast('已删除副API预设');});
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
  var c=readSecondaryApiForm();
  if(!c.baseUrl||!c.apiKey||!c.model){setSecondaryApiStatus('err','三项必填：Base URL、API Key、模型。');return;}
  State.settings.secondaryApi=c; rememberSecondaryQuickPresetKey();
  var activeId=State.settings.activeSecondaryApiPresetId||'';
  if(activeId&&Array.isArray(State.settings.secondaryApiPresets)) for(var i=0;i<State.settings.secondaryApiPresets.length;i++) if(State.settings.secondaryApiPresets[i].id===activeId){State.settings.secondaryApiPresets[i]=normalizeSecondaryApiPreset(Object.assign({},c,{id:activeId,name:State.settings.secondaryApiPresets[i].name,updatedAt:Date.now()}),i);break;}
  renderSecondarySavedPresets(); updateSecondarySavedPresetButton(); saveSettings().then(function(){refreshSecondaryApiState();highlightSecondaryPreset();setSecondaryApiStatus('ok',activeId?'✓ 已保存，并同步更新当前副API预设。当前仅作为备用接口保存。':'✓ 已保存副API。当前仅作为备用接口保存。');toast('副API已保存');});
}


var modelSheet = $('modelSheet'), modelMask = $('modelMask'), modelListEl = $('modelList');

var modelCountEl = $('modelCount'), modelSearchInput = $('modelSearchInput');

var modelSheetClose = $('modelSheetClose'), apiFetchModels = $('apiFetchModels');

var fetchedModels = [], modelSearchKey = '', activeModelContext = 'primary';

function normalizeModelContext(context){
  return context === 'secondary' || context === 'stt' || context === 'vectorEmbedding' || context === 'vectorRerank' ? context : 'primary';
}

function modelFieldId(){
  if (activeModelContext === 'secondary') return 'secondaryApiModel';
  if (activeModelContext === 'stt') return 'sttModel';
  if (activeModelContext === 'vectorEmbedding') return 'vectorEmbeddingApiModel';
  if (activeModelContext === 'vectorRerank') return 'vectorRerankApiModel';
  return 'apiModel';
}

function modelFetchButton(){
  if (activeModelContext === 'secondary') return $('secondaryApiFetchModels');
  if (activeModelContext === 'stt') return $('sttFetchModels');
  if (activeModelContext === 'vectorEmbedding') return $('vectorEmbeddingFetchModels');
  if (activeModelContext === 'vectorRerank') return $('vectorRerankFetchModels');
  return apiFetchModels;
}

function modelStatusSetter(){
  if (activeModelContext === 'secondary') return function(status,text){ return setSecondaryApiStatus(status,text); };
  if (activeModelContext === 'stt') return function(status,text){ return setSttStatus(status,text); };
  if (activeModelContext === 'vectorEmbedding') return function(status,text){ return setVectorApiStatus('embedding',status,text); };
  if (activeModelContext === 'vectorRerank') return function(status,text){ return setVectorApiStatus('rerank',status,text); };
  return function(status,text){ return setApiStatus(status,text); };
}

function modelFormReader(){
  if (activeModelContext === 'secondary') return readSecondaryApiForm;
  if (activeModelContext === 'stt') return readSttForm;
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
  if (draft.apiKey) headers.Authorization = 'Bearer ' + draft.apiKey;
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
          if (id) ids.push(String(id).trim());
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
  var secondaryList = $('secondarySavedPresetList');
  if (secondaryList) secondaryList.addEventListener('click', function(e){ var del=e.target.closest('[data-delete-secondary-preset-id]'); if(del){e.preventDefault();deleteSecondarySavedPreset(del.dataset.deleteSecondaryPresetId);return;} var item=e.target.closest('[data-secondary-saved-preset-id]'); if(item) activateSecondarySavedPreset(item.dataset.secondarySavedPresetId); });
  var secondaryNew = $('secondaryNewPreset'); if (secondaryNew) secondaryNew.addEventListener('click', saveSecondaryCurrentAsPreset);
  var secondaryUpdate = $('secondaryUpdatePreset'); if (secondaryUpdate) secondaryUpdate.addEventListener('click', updateSecondaryActivePresetFromForm);
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
  var savedPresetList = $('savedPresetList');
  if (savedPresetList) {
    savedPresetList.addEventListener('click', function(e){
      var del = e.target.closest('[data-delete-preset-id]');
      if (del) { e.preventDefault(); deleteSavedPreset(del.dataset.deletePresetId); return; }
      var item = e.target.closest('[data-saved-preset-id]');
      if (item) activateSavedPreset(item.dataset.savedPresetId);
    });
  }
  var newPresetBtn = $('apiNewPreset');
  if (newPresetBtn) newPresetBtn.addEventListener('click', saveCurrentAsPreset);
  var updatePresetBtn = $('apiUpdatePreset');
  if (updatePresetBtn) updatePresetBtn.addEventListener('click', updateActivePresetFromForm);

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
