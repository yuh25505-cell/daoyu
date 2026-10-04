/* 岛屿 · 聊天 · 记忆系统（短期 / 模糊 / 重要 / 向量记忆）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var DEFAULT_MEMORY_SUMMARY_PROMPT = [
  '请将这批聊天内容整理成可长期供角色继续对话使用的短期记忆。',
  '总结稳定事实、人物关系、已经发生的重要事件、正在进行的事项、偏好、承诺、关键情绪变化与后续待办。',
  '只保留会影响后续对话的信息，不要虚构，不要脑补，不要评价。',
  '输出为简洁、清晰、可持续更新的记忆正文，不要写“以下是总结”等开场白。',
  '可以按“人物与关系 / 已发生事件 / 当前状态 / 重要偏好或约定 / 待继续事项”等短小分段组织。'
].join('\n');


var DEFAULT_MEMORY_AGING_POLICY = { clearDays: 3, fuzzyDays: 30, fishDays: 365 };

var MEMORY_DAY_MS = 24 * 60 * 60 * 1000;


var DEFAULT_MEMORY_SUMMARY_RETRY_PROMPT = [
  '这是一次“总结失败后的重试”。',
  '请继续严格依据原文生成合规的短期记忆，不要输出受限内容的露骨细节，也不要尝试绕过任何安全策略。',
  '对于不适合直接复述的敏感内容，请改为中性、概括、非细节化的描述，例如保留“发生了亲密互动/冲突/威胁/敏感事件”等事实类别、人物关系、时间顺序、情绪变化和后续影响。',
  '不要因为某段内容敏感就把整批聊天判定为无法总结；在可以安全概括的范围内继续总结。',
  '不要编造原文中不存在的信息，也不要解释安全策略。'
].join('\n');


function normalizeMemorySettings(){
  var src = State.settings && State.settings.memory && typeof State.settings.memory === 'object' ? State.settings.memory : {};
  var contextDepth = parseInt(src.contextDepth, 10);
  var summaryThreshold = parseInt(src.summaryThreshold, 10);
  if (!Number.isFinite(contextDepth)) contextDepth = 40;
  if (!Number.isFinite(summaryThreshold)) summaryThreshold = 20;
  // 不设置人为最大值：实际可用上限由浏览器、模型上下文窗口与设备资源决定。
  contextDepth = Math.max(1, contextDepth);
  summaryThreshold = Math.max(1, summaryThreshold);

  var summaryPrompt = typeof src.summaryPrompt === 'string' ? src.summaryPrompt.trim() : '';
  if (!summaryPrompt) summaryPrompt = DEFAULT_MEMORY_SUMMARY_PROMPT;
  var summaryRetryPrompt = typeof src.summaryRetryPrompt === 'string' ? src.summaryRetryPrompt.trim() : '';
  if (!summaryRetryPrompt) summaryRetryPrompt = DEFAULT_MEMORY_SUMMARY_RETRY_PROMPT;

  var rawPresets = Array.isArray(src.summaryPresets) ? src.summaryPresets : [];
  var presets = [];
  var seen = {};
  rawPresets.forEach(function(item, index){
    if (!item || typeof item !== 'object') return;
    var id = String(item.id || '').trim();
    if (!id || id === 'default' || seen[id]) return;
    var name = String(item.name || '').trim().slice(0, 40);
    var prompt = String(item.prompt || '').trim();
    if (!prompt) return;
    if (id === 'custom') name = name || '自定义预设';
    presets.push({
      id: id,
      name: name || ('总结预设 ' + (index + 1)),
      prompt: prompt,
      builtin: false,
      updatedAt: Number(item.updatedAt || Date.now())
    });
    seen[id] = true;
  });

  // 兼容旧版本：把旧的“自定义预设”迁移成真正可管理的已保存预设。
  var legacyCustom = presets.find(function(p){ return p.id === 'custom'; });
  if (!legacyCustom && summaryPrompt !== DEFAULT_MEMORY_SUMMARY_PROMPT) {
    legacyCustom = { id:genId('mem_'), name:'自定义预设', prompt:summaryPrompt, builtin:false, updatedAt:Number(src.updatedAt || Date.now()) };
    presets.unshift(legacyCustom);
  }

  var activeId = String(src.activeSummaryPresetId || '').trim();
  if (activeId === 'default') {
    summaryPrompt = DEFAULT_MEMORY_SUMMARY_PROMPT;
  } else {
    var activePreset = presets.find(function(p){ return p.id === activeId; });
    if (!activePreset) {
      activePreset = legacyCustom || presets[0] || null;
      activeId = activePreset ? activePreset.id : '';
    }
    if (activePreset) summaryPrompt = activePreset.prompt;
    else {
      activeId = 'default';
      summaryPrompt = DEFAULT_MEMORY_SUMMARY_PROMPT;
    }
  }

  State.settings.memory = {
    contextDepth: contextDepth,
    summaryThreshold: summaryThreshold,
    summaryPrompt: summaryPrompt,
    summaryRetryPrompt: summaryRetryPrompt,
    activeSummaryPresetId: activeId,
    summaryPresets: presets.map(function(p){ return { id:p.id, name:p.name, prompt:p.prompt, builtin:false, updatedAt:p.updatedAt }; })
  };
  return State.settings.memory;
}

function getMemorySettings(){ return normalizeMemorySettings(); }

function normalizeVectorMemorySettings(){
  var src = State.settings && State.settings.vectorMemory && typeof State.settings.vectorMemory === 'object' ? State.settings.vectorMemory : {};
  var emb = src.embeddingApi && typeof src.embeddingApi === 'object' ? src.embeddingApi : {};
  var rr = src.rerankApi && typeof src.rerankApi === 'object' ? src.rerankApi : {};
  var topK = Math.max(1, Math.min(30, parseInt(src.topK, 10) || 8));
  var candidateK = Math.max(topK, Math.min(100, parseInt(src.candidateK, 10) || 24));
  var threshold = Number(src.similarityThreshold);
  if (!Number.isFinite(threshold)) threshold = 0.18;
  threshold = Math.max(-1, Math.min(1, threshold));
  State.settings.vectorMemory = {
    embeddingApi: {
      baseUrl: String(emb.baseUrl || '').trim(),
      apiKey: String(emb.apiKey || '').trim(),
      model: String(emb.model || '').trim()
    },
    rerankApi: {
      baseUrl: String(rr.baseUrl || '').trim(),
      apiKey: String(rr.apiKey || '').trim(),
      model: String(rr.model || '').trim()
    },
    topK: topK,
    candidateK: candidateK,
    similarityThreshold: threshold
  };
  return State.settings.vectorMemory;
}

function getVectorMemorySettings(){ return normalizeVectorMemorySettings(); }

function normalizeMemoryAgingPolicy(name){
  var m = getChatMemory(name, true);
  var src = m.memoryAging && typeof m.memoryAging === 'object' ? m.memoryAging : {};
  var clearDays = parseInt(src.clearDays, 10);
  var fuzzyDays = parseInt(src.fuzzyDays, 10);
  var fishDays = parseInt(src.fishDays, 10);
  if (!Number.isFinite(clearDays)) clearDays = DEFAULT_MEMORY_AGING_POLICY.clearDays;
  if (!Number.isFinite(fuzzyDays)) fuzzyDays = DEFAULT_MEMORY_AGING_POLICY.fuzzyDays;
  if (!Number.isFinite(fishDays)) fishDays = DEFAULT_MEMORY_AGING_POLICY.fishDays;
  clearDays = Math.max(1, clearDays);
  fuzzyDays = Math.max(clearDays + 1, fuzzyDays);
  fishDays = Math.max(fuzzyDays + 1, fishDays);
  m.memoryAging = { clearDays: clearDays, fuzzyDays: fuzzyDays, fishDays: fishDays };
  return m.memoryAging;
}

function getChatMemory(name, create){
  if (!name) return null;
  if (!State.memory || typeof State.memory !== 'object') State.memory = {};
  if (!State.memory[name] && create !== false) State.memory[name] = { summary:'', summarizedThrough:0, summaryCount:0, updatedAt:0, summaries:[], importantMemories:[], memoryAging:clone(DEFAULT_MEMORY_AGING_POLICY), retrievalMode:'summary', vector:{ version:1, entries:[] } };
  return State.memory[name] || null;
}

function normalizeChatMemory(name){
  var m = getChatMemory(name, true);
  m.summary = String(m.summary || '').trim();
  m.summarizedThrough = Math.max(0, parseInt(m.summarizedThrough, 10) || 0);
  m.summaryCount = Math.max(0, parseInt(m.summaryCount, 10) || 0);
  m.updatedAt = Number(m.updatedAt || 0);
  var retrievalMode = String(m.retrievalMode || 'summary');
  m.retrievalMode = retrievalMode === 'vector' || retrievalMode === 'hybrid' ? retrievalMode : 'summary';
  if (!m.vector || typeof m.vector !== 'object') m.vector = { version:1, entries:[] };
  if (!Array.isArray(m.vector.entries)) m.vector.entries = [];
  var seenVectorIds = {};
  var maxVectorOrder = 0;
  m.vector.entries = m.vector.entries.filter(function(item){ return item && typeof item === 'object' && String(item.text || '').trim(); }).map(function(item, index){
    var id = String(item.id || ('vec_' + index + '_' + Date.now()));
    if (seenVectorIds[id]) id = id + '_' + index;
    seenVectorIds[id] = true;
    var order = Number.isFinite(Number(item.order)) ? Number(item.order) : index;
    maxVectorOrder = Math.max(maxVectorOrder, order);
    var embedding = Array.isArray(item.embedding) ? item.embedding.map(function(n){ return Number(n); }).filter(function(n){ return Number.isFinite(n); }) : [];
    return {
      id: id,
      text: String(item.text || '').trim().slice(0, 6000),
      sourceType: String(item.sourceType || 'manual'),
      sourceId: String(item.sourceId || ''),
      sourceCategory: String(item.sourceCategory || ''),
      sourceRangeKey: String(item.sourceRangeKey || ''),
      sourceStart: Number.isFinite(Number(item.sourceStart)) ? Number(item.sourceStart) : -1,
      sourceEnd: Number.isFinite(Number(item.sourceEnd)) ? Number(item.sourceEnd) : -1,
      sourceStartCreatedAt: Number(item.sourceStartCreatedAt || 0),
      sourceEndCreatedAt: Number(item.sourceEndCreatedAt || 0),
      eventAtLabel: String(item.eventAtLabel || '').trim(),
      embedding: embedding,
      order: order,
      createdAt: Number(item.createdAt || Date.now()),
      updatedAt: Number(item.updatedAt || Date.now())
    };
  });
  m.vector.version = 1;
  m.vector.updatedAt = Number(m.vector.updatedAt || 0);
  m.vector.entries.forEach(function(item){ if (!Number.isFinite(Number(item.order))) item.order = maxVectorOrder++; });
  normalizeMemoryAgingPolicy(name);
  if (!Array.isArray(m.summaries)) m.summaries = [];
  if (!Array.isArray(m.importantMemories)) m.importantMemories = [];
  m.importantMemories = m.importantMemories.filter(function(item){ return item && typeof item === 'object'; }).map(function(item, index){
    return {
      id: String(item.id || ('important_' + index + '_' + (Number(item.createdAt) || Date.now()))),
      text: String(item.text || item.content || '').trim(),
      createdAt: Number(item.createdAt || Date.now()),
      memoryAt: Number(item.memoryAt || item.createdAt || Date.now()),
      sourceSummaryId: String(item.sourceSummaryId || '')
    };
  }).filter(function(item){ return !!item.text; });
  m.summaries = m.summaries.filter(function(item){ return item && typeof item === 'object'; }).map(function(item, index){
    var sourceList = (typeof MESSAGES !== 'undefined' && MESSAGES[name] && Array.isArray(MESSAGES[name])) ? MESSAGES[name] : [];
    var startIndex = Math.max(0, parseInt(item.start, 10) || 0);
    var endIndex = Math.max(startIndex, parseInt(item.end, 10) || 0);
    var sourceStart = sourceList[startIndex];
    var sourceEnd = sourceList[Math.max(startIndex, endIndex - 1)];
    var fallbackCreatedAt = Number(item.createdAt || item.updatedAt || Date.now());
    return {
      id: String(item.id || ('legacy_summary_' + index + '_' + fallbackCreatedAt)),
      start: startIndex,
      end: endIndex,
      text: String(item.text || item.summary || '').trim(),
      clearText: String(item.clearText || item.text || item.summary || '').trim(),
      fuzzyText: String(item.fuzzyText || '').trim(),
      fishText: String(item.fishText || '').trim(),
      currentTier: String(item.currentTier || '').trim(),
      stageUpdatedAt: Number(item.stageUpdatedAt || 0),
      createdAt: fallbackCreatedAt,
      startCreatedAt: Number(item.startCreatedAt || (sourceStart && (sourceStart.createdAt || sourceStart.timestamp)) || fallbackCreatedAt),
      endCreatedAt: Number(item.endCreatedAt || (sourceEnd && (sourceEnd.createdAt || sourceEnd.timestamp)) || fallbackCreatedAt),
      count: Math.max(0, parseInt(item.count, 10) || 0)
    };
  }).filter(function(item){ return !!item.text; });

  // 兼容旧版本：只有单份 summary 时自动迁移为一条历史记录。
  if (!m.summaries.length && m.summary) {
    m.summaries = [{
      id: 'legacy_' + String(m.updatedAt || Date.now()),
      start: 0,
      end: m.summarizedThrough,
      text: m.summary,
      clearText: m.summary,
      fuzzyText: '',
      fishText: '',
      currentTier: 'clear',
      stageUpdatedAt: 0,
      createdAt: m.updatedAt || Date.now(),
      startCreatedAt: m.updatedAt || Date.now(),
      endCreatedAt: m.updatedAt || Date.now(),
      count: m.summaryCount
    }];
  }
  if (m.summaries.length) {
    m.summaries.sort(function(a,b){ return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0); });
    var latest = m.summaries[m.summaries.length - 1];
    m.summary = latest.text;
    m.summarizedThrough = Math.max(0, Number(latest.end) || 0);
    m.summaryCount = m.summaries.length;
    m.updatedAt = Math.max(Number(m.updatedAt) || 0, Number(latest.createdAt) || 0);
  }
  return m;
}


function isVectorEmbeddingReady(){
  var c = getVectorMemorySettings().embeddingApi;
  return !!(c && c.baseUrl && c.apiKey && c.model);
}

function isVectorRerankReady(){
  var c = getVectorMemorySettings().rerankApi;
  return !!(c && c.baseUrl && c.apiKey && c.model);
}

function normalizeVectorEndpoint(raw, kind){
  var url = String(raw || '').trim().replace(/\/+$/,'');
  if (!url) return '';
  if (kind === 'embedding') {
    if (/\/embeddings$/i.test(url)) return url;
    if (/\/v1$/i.test(url)) return url + '/embeddings';
    return url;
  }
  if (/\/rerank$/i.test(url)) return url;
  if (/\/v1$/i.test(url)) return url + '/rerank';
  return url;
}

function vectorFetch(url, cfg, body){
  var headers = { 'Content-Type':'application/json', 'Accept':'application/json' };
  if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
  return fetch(url, { method:'POST', headers:headers, body:JSON.stringify(body) }).then(function(res){
    return res.text().then(function(text){
      var parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch(e) {}
      if (!res.ok) {
        var msg = parsed && (parsed.error && (parsed.error.message || parsed.error)) || (parsed && parsed.message) || text || ('HTTP ' + res.status);
        throw ApiError('vector_http', String(msg));
      }
      return parsed;
    });
  });
}

function parseEmbeddingResponse(data, expectedCount){
  var rows = data && Array.isArray(data.data) ? data.data : (data && Array.isArray(data.embeddings) ? data.embeddings : null);
  if (!rows) {
    if (data && Array.isArray(data.embedding)) rows = [{ embedding:data.embedding }];
    else if (data && Array.isArray(data.vector)) rows = [{ embedding:data.vector }];
  }
  if (!rows) throw ApiError('vector_parse', 'Embedding API 返回格式无法识别');
  var result = rows.map(function(row){
    var v = row && (row.embedding || row.vector || row);
    return Array.isArray(v) ? v.map(Number).filter(function(n){ return Number.isFinite(n); }) : [];
  });
  if (expectedCount && result.length < expectedCount) throw ApiError('vector_parse', 'Embedding API 返回的向量数量不足');
  return result;
}

function callVectorEmbedding(texts){
  var list = Array.isArray(texts) ? texts : [texts];
  list = list.map(function(t){ return String(t || '').trim(); });
  if (!list.length || !list.some(Boolean)) return Promise.resolve([]);
  if (!isVectorEmbeddingReady()) return Promise.reject(ApiError('vector_config', '向量记忆 Embedding API 尚未配置'));
  var c = getVectorMemorySettings().embeddingApi;
  var url = normalizeVectorEndpoint(c.baseUrl, 'embedding');
  var input = list.length === 1 ? list[0] : list;
  return vectorFetch(url, c, { model:c.model, input:input }).then(function(data){ return parseEmbeddingResponse(data, list.length); });
}

function callVectorRerank(query, documents){
  if (!documents || !documents.length) return Promise.resolve([]);
  if (!isVectorRerankReady()) return Promise.resolve(null);
  var c = getVectorMemorySettings().rerankApi;
  var url = normalizeVectorEndpoint(c.baseUrl, 'rerank');
  return vectorFetch(url, c, { model:c.model, query:String(query || ''), documents:documents.map(String), top_n:documents.length, return_documents:false }).then(function(data){
    var rows = data && Array.isArray(data.results) ? data.results : (data && Array.isArray(data.data) ? data.data : []);
    return rows.map(function(row, index){
      var idx = Number(row && (row.index != null ? row.index : row.document_index != null ? row.document_index : index));
      var score = Number(row && (row.relevance_score != null ? row.relevance_score : row.score != null ? row.score : 0));
      return { index:idx, score:Number.isFinite(score) ? score : 0 };
    }).filter(function(row){ return Number.isFinite(row.index) && row.index >= 0; }).sort(function(a,b){ return b.score - a.score; });
  }).catch(function(){ return null; });
}

function cosineSimilarity(a,b){
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return -1;
  var n = Math.min(a.length,b.length), dot=0, na=0, nb=0;
  for (var i=0;i<n;i++){
    var x=Number(a[i]), y=Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    dot += x*y; na += x*x; nb += y*y;
  }
  if (!na || !nb) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function vectorMemoryQueryText(name, queryOverride){
  var override = String(queryOverride || '').trim();
  if (override) return override.slice(0,5000);
  var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  for (var i=list.length-1;i>=0;i--){
    var m = list[i];
    if (!m || m.from !== 'me') continue;
    var text = memoryMessageText(m).replace(/^.*?用户：/,'').trim();
    if (text) return text.slice(0,5000);
  }
  return '';
}

function retrieveVectorMemoryContext(name, queryOverride){
  var mem = normalizeChatMemory(name);
  var entries = (mem.vector && Array.isArray(mem.vector.entries) ? mem.vector.entries : []).filter(function(item){ return Array.isArray(item.embedding) && item.embedding.length && item.text; });
  var query = vectorMemoryQueryText(name, queryOverride);
  if (!query || !entries.length || !isVectorEmbeddingReady()) return Promise.resolve([]);
  return callVectorEmbedding(query).then(function(rows){
    var q = rows[0];
    if (!q || !q.length) return [];
    var settings = getVectorMemorySettings();
    var ranked = entries.map(function(item){ return { item:item, score:cosineSimilarity(q,item.embedding) }; }).filter(function(row){ return row.score >= settings.similarityThreshold; }).sort(function(a,b){ return (b.score-a.score) || (Number(a.item.order)||0)-(Number(b.item.order)||0); }).slice(0, settings.candidateK);
    if (!ranked.length) return [];
    var docs = ranked.map(function(row){ return row.item.text; });
    return callVectorRerank(query, docs).then(function(rr){
      if (rr && rr.length) {
        var used = {};
        var reranked = [];
        rr.forEach(function(r){
          if (used[r.index] || !ranked[r.index]) return;
          used[r.index] = true;
          reranked.push({ item:ranked[r.index].item, score:ranked[r.index].score, rerankScore:r.score });
        });
        ranked.forEach(function(row,idx){ if (!used[idx]) reranked.push(row); });
        ranked = reranked;
      }
      return ranked.slice(0, settings.topK).map(function(row){
        return { text:row.item.text, sourceType:row.item.sourceType || 'manual', score:row.score, rerankScore:row.rerankScore };
      });
    });
  }).catch(function(err){
    if (currentName === name) {
      var hint = err && err.message ? String(err.message) : '向量检索失败';
      toast('向量记忆未注入：' + hint.slice(0,80));
    }
    return [];
  });
}

function addVectorMemoryEntry(name, text, sourceType, sourceId){
  var content = String(text || '').trim();
  if (!name || !content) return Promise.resolve(null);
  var mem = normalizeChatMemory(name);
  var list = mem.vector.entries;
  var srcType = String(sourceType || 'manual');
  var srcId = String(sourceId || '');
  var same = list.find(function(item){ return item.sourceType === srcType && item.sourceId === srcId && srcId; });
  if (same) {
    same.text = content.slice(0,6000);
    same.updatedAt = Date.now();
    same.embedding = [];
    return isVectorEmbeddingReady() ? callVectorEmbedding(same.text).then(function(rows){ same.embedding=rows[0]||[]; mem.vector.updatedAt=Date.now(); return saveMemoryState().then(function(){return same;}); }) : saveMemoryState().then(function(){return same;});
  }
  var order = list.length ? Math.max.apply(null, list.map(function(item){ return Number(item.order)||0; })) + 1 : 0;
  var entry = { id:genId('vec_'), text:content.slice(0,6000), sourceType:srcType, sourceId:srcId, sourceStartCreatedAt:0, sourceEndCreatedAt:0, eventAtLabel:'', embedding:[], order:order, createdAt:Date.now(), updatedAt:Date.now() };
  list.push(entry);
  mem.vector.updatedAt = Date.now();
  return (isVectorEmbeddingReady() ? callVectorEmbedding(entry.text).then(function(rows){ entry.embedding=rows[0]||[]; }) : Promise.resolve()).then(function(){ return saveMemoryState().then(function(){ return entry; }); });
}

var VECTOR_MEMORY_EXTRACTION_PROMPT = [
  '你是聊天软件中的“语义记忆提取器”。',
  '你的任务不是总结整段聊天，也不是改写短期总结，而是直接从【原始聊天记录】里提取未来可能值得语义检索的、独立且可复用的原子记忆。',
  '每条记忆只表达一个事实、偏好、关系、事件、决定、承诺、计划、长期状态或其他具有后续对话价值的信息。',
  '优先保留：双方关系变化、关键事件、重要共同经历、用户明确表达的长期偏好、角色的重要长期信息、做出的决定与承诺、会影响未来互动的计划或约定。',
  '不要提取：寒暄、纯情绪宣泄、没有后续价值的普通闲聊、重复信息、明显临时性的措辞、无法确认的猜测。',
  '必须严格依据原始聊天，不得补全、臆测、编造。',
  '每条记忆必须可以脱离原聊天独立理解；需要区分用户与角色时请明确写“用户”或“角色”。',
  '每条记忆都必须带上来源事件的日期时间标记。优先根据原始聊天中方括号里的时间精确到分钟；找不到可靠事件时间时，统一写“时间不详”，不要编造。',
  '每条建议控制在 1～2 句话，保留必要的人名、时间、地点、关系和事件细节。',
  '请按以下格式输出，每行一条，不要输出标题、编号、项目符号或解释：',
  '[关系] 2026-09-23 14:20：记忆内容',
  '[事件] 2026-09-23 14:20：记忆内容',
  '[偏好] 时间不详：记忆内容',
  '[决定] 2026-09-23 14:20：记忆内容',
  '[承诺] 2026-09-23 14:20：记忆内容',
  '[计划] 2026-09-23 14:20：记忆内容',
  '[事实] 2026-09-23 14:20：记忆内容',
  '[状态] 2026-09-23 14:20：记忆内容',
  '[其他] 时间不详：记忆内容'
].join('\n');


function parseVectorMemoryExtraction(raw){
  var text=String(raw||'').replace(/```(?:text|plain)?/gi,'').replace(/```/g,'').trim();
  if(!text) return [];
  var allowed={关系:true,事件:true,偏好:true,决定:true,承诺:true,计划:true,事实:true,状态:true,其他:true};
  var rows=[]; var seen={};
  text.split(/\r?\n+/).forEach(function(line){
    var m=line.match(/^\s*(?:[-*•]\s*)?\[([^\]]+)\]\s*(.+?)\s*$/);
    if(!m) return;
    var category=String(m[1]||'').trim();
    var payload=String(m[2]||'').replace(/\s+/g,' ').trim();
    if(!allowed[category] || !payload) return;
    var timeLabel='时间不详';
    var tm=payload.match(/^(\d{4}-\d{1,2}-\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)\s*[：:]\s*(.+)$/);
    if(tm){ timeLabel=tm[1]; payload=tm[2]; }
    else {
      var unknown=payload.match(/^时间不详\s*[：:]\s*(.+)$/);
      if(unknown) payload=unknown[1];
    }
    var value=payload.trim();
    if(!value) return;
    value=value.replace(/^[-*•]\s*/, '').trim();
    if(value.length>800) value=value.slice(0,800);
    var key=value.toLowerCase();
    if(seen[key]) return;
    seen[key]=true;
    rows.push({category:category,text:value,eventAtLabel:timeLabel});
  });
  return rows.slice(0,24);
}


function vectorMemoryRangeKey(start,end){
  return String(Math.max(0,Number(start)||0)) + ':' + String(Math.max(0,Number(end)||0));
}


function extractVectorMemoriesFromChatRange(name,start,end){
  if(!name) return Promise.resolve(false);
  var mem=normalizeChatMemory(name);
  var list=Array.isArray(MESSAGES[name])?MESSAGES[name]:[];
  var a=Math.max(0,Number(start)||0), b=Math.min(list.length,Number(end)||0);
  if(b<=a) return Promise.resolve(false);
  if(!isSecondaryApiReady()) return Promise.resolve(false);
  var rangeKey=vectorMemoryRangeKey(a,b);
  var existingRows=mem.vector.entries||[];
  if(existingRows.some(function(item){return item && item.sourceType==='semantic' && item.sourceRangeKey===rangeKey;})) return Promise.resolve(false);
  var chunk=buildSummarySource(name,a,b);
  if(!chunk.trim()) return Promise.resolve(false);
  if(vectorMemoryJobs[name]) return vectorMemoryJobs[name];
  var messages=[
    {role:'system',content:VECTOR_MEMORY_EXTRACTION_PROMPT},
    {role:'user',content:'【原始聊天记录】\n'+chunk}
  ];
  var secCfg=getSecondaryApiConfig();
  var cfgOverride=Object.assign({},secCfg,{maxTokens:Math.max(420,Math.min(1400,Number(secCfg.maxTokens)||760)),temperature:0.12});
  vectorMemoryJobs[name]=callApiOnce(messages,cfgOverride).then(function(raw){
    var rows=parseVectorMemoryExtraction(raw);
    if(!rows.length) return false;
    var existing=mem.vector.entries||[];
    var seen={};
    existing.forEach(function(item){
      if(item && item.text) seen[String(item.text).replace(/\s+/g,' ').trim().toLowerCase()]=true;
    });
    var toAdd=[];
    var sourceListForTime = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
    var sourceStartMsg = sourceListForTime[a];
    var sourceEndMsg = sourceListForTime[Math.max(a, b - 1)];
    var sourceStartCreatedAt = messageCreatedAt(sourceStartMsg, Date.now());
    var sourceEndCreatedAt = messageCreatedAt(sourceEndMsg, sourceStartCreatedAt);
    rows.forEach(function(row){
      var key=row.text.toLowerCase();
      if(seen[key]) return;
      seen[key]=true;
      toAdd.push({
        id:genId('vec_'),
        text:row.text.slice(0,800),
        sourceType:'semantic',
        sourceCategory:row.category,
        sourceRangeKey:rangeKey,
        sourceStart:a,
        sourceEnd:b,
        sourceStartCreatedAt:sourceStartCreatedAt,
        sourceEndCreatedAt:sourceEndCreatedAt,
        eventAtLabel:String(row.eventAtLabel || '').trim(),
        embedding:[],
        order: existing.length + toAdd.length,
        createdAt:Date.now(),
        updatedAt:Date.now()
      });
    });
    if(!toAdd.length) return false;
    toAdd.forEach(function(item){existing.push(item);});
    mem.vector.entries=existing;
    mem.vector.updatedAt=Date.now();
    var embedJob=isVectorEmbeddingReady() ? callVectorEmbedding(toAdd.map(function(item){return item.text;})).then(function(vectors){
      toAdd.forEach(function(item,index){item.embedding=vectors[index]||[];});
    }) : Promise.resolve();
    return embedJob.then(function(){
      return saveMemoryState().then(function(){
        if(currentName===name){renderVectorMemoryPage();renderMemoryPage();}
        return true;
      });
    });
  }).catch(function(err){
    console.warn('[岛屿] 向量语义记忆提取失败',err);
    return false;
  }).then(function(result){
    delete vectorMemoryJobs[name];
    return result;
  });
  return vectorMemoryJobs[name];
}


function extractVectorMemoriesFromChatHistory(name){
  if(!name) return Promise.resolve(false);
  var list=Array.isArray(MESSAGES[name])?MESSAGES[name]:[];
  if(!list.length || !isSecondaryApiReady()) return Promise.resolve(false);
  var chunkSize=60, ranges=[];
  for(var start=0;start<list.length;start+=chunkSize){
    ranges.push([start,Math.min(list.length,start+chunkSize)]);
  }
  var mem=normalizeChatMemory(name);
  ranges=ranges.filter(function(pair){
    var key=vectorMemoryRangeKey(pair[0],pair[1]);
    return !(mem.vector.entries||[]).some(function(item){return item&&item.sourceType==='semantic'&&item.sourceRangeKey===key;});
  });
  if(!ranges.length) return Promise.resolve(false);
  var chain=Promise.resolve(false);
  ranges.forEach(function(pair){
    chain=chain.then(function(added){
      return extractVectorMemoriesFromChatRange(name,pair[0],pair[1]).then(function(ok){return added||ok;});
    });
  });
  return chain;
}

function updateVectorMemoryOrder(name, id, direction){
  var mem=normalizeChatMemory(name), list=mem.vector.entries, idx=list.findIndex(function(item){return item.id===id;});
  if(idx<0) return;
  var next=idx+(direction<0?-1:1);
  if(next<0||next>=list.length) return;
  var temp=list[idx].order; list[idx].order=list[next].order; list[next].order=temp;
  list.sort(function(a,b){return (Number(a.order)||0)-(Number(b.order)||0);});
  mem.vector.updatedAt=Date.now();
  saveMemoryState().then(function(){ renderVectorMemoryPage(); });
}

function deleteVectorMemoryEntry(id){
  if(!currentName||!id) return;
  var mem=normalizeChatMemory(currentName), before=mem.vector.entries.length;
  mem.vector.entries=mem.vector.entries.filter(function(item){return item.id!==id;});
  if(mem.vector.entries.length===before) return;
  saveMemoryState().then(function(){ renderVectorMemoryPage(); renderMemoryPage(); toast('已删除向量记忆'); });
}

function editVectorMemoryEntry(id){
  if(!currentName||!id) return;
  var mem=normalizeChatMemory(currentName), item=mem.vector.entries.find(function(row){return row.id===id;});
  if(!item) return;
  var value=window.prompt('编辑向量记忆内容', item.text);
  if(value==null) return;
  value=String(value).trim();
  if(!value) return;
  item.text=value.slice(0,6000); item.embedding=[]; item.updatedAt=Date.now(); mem.vector.updatedAt=Date.now();
  var job=isVectorEmbeddingReady()?callVectorEmbedding(item.text).then(function(rows){item.embedding=rows[0]||[];}):Promise.resolve();
  job.then(function(){return saveMemoryState();}).then(function(){renderVectorMemoryPage();toast(isVectorEmbeddingReady()?'已更新并重新向量化':'已更新，等待向量化');});
}

function addManualVectorMemory(){
  if(!currentName) return;
  var value=window.prompt('添加一条向量记忆\\n它会独立存放在当前 Char 的记忆库中，并参与语义检索。','');
  if(value==null) return;
  value=String(value).trim();
  if(!value) return;
  addVectorMemoryEntry(currentName,value,'manual','').then(function(){renderVectorMemoryPage();renderMemoryPage();toast(isVectorEmbeddingReady()?'已添加向量记忆':'已添加，当前尚未向量化');});
}

function getVectorModeLabel(mode){
  return mode==='vector'?'向量记忆':mode==='hybrid'?'总结 + 向量':'传统总结';
}

function setMemoryRetrievalMode(mode){
  if(!currentName) return;
  var m=normalizeChatMemory(currentName);
  mode=mode==='vector'||mode==='hybrid'?mode:'summary';
  m.retrievalMode=mode;
  saveMemoryState().then(function(){renderMemoryPage();toast('记忆使用方式：'+getVectorModeLabel(mode));});
}

function saveMemoryState(){ return IslandDB.set('island.memory', State.memory || {}); }

function isSecondaryApiReady(){
  var c = getSecondaryApiConfig();
  // 副API的 enabled 是根据三项配置派生的历史字段，不应阻止已保存配置在重进后被识别。
  return !!(c && String(c.baseUrl || '').trim() && String(c.apiKey || '').trim() && String(c.model || '').trim());
}

function memoryMessageText(msg){
  if (!msg) return '';
  var who = msg.from === 'me' ? '用户' : '角色';
  var createdAt = Number(msg.createdAt || msg.timestamp || 0);
  var timePrefix = createdAt ? '[' + new Date(createdAt).toLocaleString('zh-CN', {hour12:false}) + '] ' : '';
  if (msg.type === 'voice_call') {
    var callText = String(msg.text || '').trim();
    var callMode = msg.inputMode === 'voice' ? '语音通话·语音' : '语音通话·文字';
    return timePrefix + who + '：[' + callMode + '] ' + (callText || '[空白通话内容]');
  }
  if (msg.type === 'voice') {
    var vt = getVoiceTranscript(msg);
    return who + '：' + (vt ? '[语音] ' + vt : '[语音消息，' + Math.max(1, Math.round(Number(msg.duration) || 1)) + '秒；当前无可靠转写]');
  }
  if (msg.type === 'location') {
    var lat = normalizeCoordinate(msg.lat, -90, 90), lng = normalizeCoordinate(msg.lng, -180, 180);
    return timePrefix + who + '：[' + (msg.source === 'virtual' ? '虚拟位置' : '真实手机位置') + '] ' + String(msg.label || '当前位置') + (lat != null && lng != null ? '（纬度：' + lat + '，经度：' + lng + '）' : '');
  }
  if (msg.type === 'file') {
    return timePrefix + who + '：[文件] ' + String(msg.name || msg.text || '未命名文件') + '（' + String(msg.mime || '未知类型') + '，' + formatFileSize(msg.size) + ')' + (msg.content ? '\n文件内容：' + clampFileText(msg.content, 6000) : '\n文件正文未成功读取');
  }
  if (msg.type === 'image') return timePrefix + who + '：[图片消息] 发送了一张图片；总结器当前收到的是图片已发送这一事实，不得凭空猜测图片细节。';
  if (msg.type === 'sticker') return timePrefix + who + '：[表情包] 发送了一个表情包；不得凭空猜测表情包画面、文字或情绪含义。';
  if (msg.type === 'system' && msg.systemType === 'poke') return timePrefix + '【拍一拍】' + String(msg.text || '').trim();
  var text = String(msg.text || '').trim();
  if (text) return timePrefix + who + '：' + text;
  return timePrefix + who + '：[聊天消息]';
}

function buildSummarySource(name, start, end){
  var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  var rows = [];
  for (var i = Math.max(0, start); i < Math.min(list.length, end); i++) {
    var row = memoryMessageText(list[i]);
    if (row) rows.push(row);
  }
  return rows.join('\n');
}

function messageCreatedAt(msg, fallback){
  var ts = Number(msg && (msg.createdAt || msg.timestamp) || 0);
  return ts > 0 ? ts : (fallback || Date.now());
}

function fuzzyMemoryTimeLabel(timestamp, now){
  var ts = Number(timestamp || 0);
  if (!ts) return '大致时间不明';
  var ageDays = Math.max(0, (now - ts) / MEMORY_DAY_MS);
  if (ageDays < 45) {
    var months = Math.max(1, Math.round(ageDays / 30));
    return '大约 ' + months + ' 个月前';
  }
  if (ageDays < 365) {
    var months2 = Math.max(2, Math.round(ageDays / 30.44));
    return '大约 ' + months2 + ' 个月前';
  }
  var years = Math.max(1, Math.round(ageDays / 365.25));
  return '大约 ' + years + ' 年前';
}

function summarizeTimeRangeText(item, now){
  var startTs = Number(item && item.startCreatedAt || 0);
  var endTs = Number(item && item.endCreatedAt || 0);
  if (!startTs && !endTs) return '时间大致不明';
  if (!startTs) startTs = endTs;
  if (!endTs) endTs = startTs;
  if (Math.abs(endTs - startTs) < MEMORY_DAY_MS * 2) return fuzzyMemoryTimeLabel(endTs, now);
  return fuzzyMemoryTimeLabel(startTs, now) + ' ～ ' + fuzzyMemoryTimeLabel(endTs, now);
}

function stripExactMemoryDates(text){
  return String(text || '')
    .replace(/\[(?:20\d{2})[-/.年][^\]]{0,40}\]\s*/g, '')
    .replace(/(?:20\d{2}年)?\d{1,2}月\d{1,2}日(?:[ T]\d{1,2}(?::\d{2}){0,2})?/g, '某天')
    .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}(?::\d{2}){0,2})?/g, '某天')
    .trim();
}

function getMemoryTierForSummary(item, now, policy){
  var endTs = Number(item && (item.endCreatedAt || item.createdAt) || 0);
  if (!endTs) return 'clear';
  var ageDays = Math.max(0, (now - endTs) / MEMORY_DAY_MS);
  if (ageDays < policy.clearDays) return 'clear';
  if (ageDays < policy.fuzzyDays) return 'fuzzy';
  if (ageDays <= policy.fishDays) return 'fish';
  return 'expired';
}

function getMemoryTierText(item, tier){
  if (!item) return '';
  if (tier === 'fish') return String(item.fishText || '').trim();
  if (tier === 'fuzzy') return String(item.fuzzyText || '').trim();
  return String(item.clearText || item.text || '').trim();
}

function setSummaryCurrentText(item, tier){
  var text = getMemoryTierText(item, tier);
  if (text) item.text = text;
  item.currentTier = tier;
  return text;
}


var memoryAgingJobs = Object.create(null);

var MEMORY_TIER_PROMPTS = {
  fuzzy: [
    '把下面这条“清晰记忆”重新压缩成“模糊记忆”。',
    '只能依据原文事实，不得补充、推断、猜测或润色出不存在的信息。',
    '保留事件是否发生、人物关系、主要结果、会影响后续对话的关键事实。',
    '时间只能保留大致月份、几周前、几个月前等模糊表达；删除或泛化具体年月日、时分秒和精确时间间隔。',
    '删除不影响后续对话的过程细节、对白原句和过度具体的小细节。',
    '输出简洁的记忆正文，不要写标题、解释、免责声明或元话术。',
    '如果原文根本没有某个事实，就不要写那个事实。'
  ].join('\n'),
  fish: [
    '把下面这条“模糊记忆”重新压缩成“鱼的记忆”。',
    '只能依据原文事实，不得补充、推断、猜测或创造任何新细节。',
    '只保留最核心的事件重点、关系变化、结果、持续状态或后续影响。',
    '不要保留具体日期、月份、精确时间、地点细节、过程细节、对白原句或无法被核心事实支撑的内容。',
    '时间只能保留“以前”“很久之前”“曾经”等无法精确定位的表达；能省略时间就直接省略。',
    '输出简洁的记忆正文，不要写标题、解释、免责声明或元话术。',
    '如果原文没有明确写出的内容，不要自行补全。'
  ].join('\n')
};


function convertMemorySummaryTier(name, item, targetTier){
  if (!name || !item || !MEMORY_TIER_PROMPTS[targetTier]) return Promise.resolve(false);
  var sourceTier = targetTier === 'fish' ? 'fuzzy' : 'clear';
  var source = getMemoryTierText(item, sourceTier);
  if (!source) return Promise.resolve(false);
  if (targetTier === 'fuzzy' && item.fuzzyText) return Promise.resolve(false);
  if (targetTier === 'fish' && item.fishText) return Promise.resolve(false);
  if (!isSecondaryApiReady()) return Promise.resolve(false);
  var secCfg = getSecondaryApiConfig();
  var messages = [
    { role:'system', content:MEMORY_TIER_PROMPTS[targetTier] },
    { role:'user', content:'【原始记忆】\n' + source }
  ];
  var cfgOverride = Object.assign({}, secCfg, { maxTokens: Math.max(120, Math.min(700, Number(secCfg.maxTokens) || 320)), temperature: 0.1 });
  return callApiOnce(messages, cfgOverride).then(function(result){
    var text = String(result || '').trim();
    if (!text || looksLikeSummaryRefusal(text)) throw ApiError('empty', '记忆阶段转换没有返回可用内容');
    text = text.slice(0, targetTier === 'fish' ? 3200 : 5200);
    if (targetTier === 'fuzzy') item.fuzzyText = text;
    else if (targetTier === 'fish') item.fishText = text;
    setSummaryCurrentText(item, targetTier);
    item.stageUpdatedAt = Date.now();
    item.updatedAt = Date.now();
    return true;
  });
}


function ageMemorySummaries(name){
  if (!name) return Promise.resolve(false);
  if (memoryAgingJobs[name]) return memoryAgingJobs[name];
  var mem = normalizeChatMemory(name);
  var policy = normalizeMemoryAgingPolicy(name);
  var now = Date.now();
  var candidates = (mem.summaries || []).filter(function(item){
    var tier = getMemoryTierForSummary(item, now, policy);
    return (tier === 'fuzzy' && !item.fuzzyText) || (tier === 'fish' && (!item.fuzzyText || !item.fishText));
  });
  if (!candidates.length || !isSecondaryApiReady()) return Promise.resolve(false);
  memoryAgingJobs[name] = candidates.reduce(function(chain, item){
    return chain.then(function(changed){
      var tier = getMemoryTierForSummary(item, Date.now(), policy);
      if (tier === 'fuzzy' && !item.fuzzyText) {
        return convertMemorySummaryTier(name, item, 'fuzzy').then(function(ok){ return changed || ok; }).catch(function(err){
          console.warn('[岛屿] 模糊记忆转换失败', err);
          return changed;
        });
      }
      if (tier === 'fish' && !item.fishText) {
        var ready = item.fuzzyText ? Promise.resolve(true) : convertMemorySummaryTier(name, item, 'fuzzy').catch(function(err){
          console.warn('[岛屿] 鱼的记忆前置转换失败', err);
          return false;
        });
        return ready.then(function(ok){
          if (!ok && !item.fuzzyText) return changed;
          return convertMemorySummaryTier(name, item, 'fish').then(function(done){ return changed || done; }).catch(function(err){
            console.warn('[岛屿] 鱼的记忆转换失败', err);
            return changed;
          });
        });
      }
      return changed;
    });
  }, Promise.resolve(false)).then(function(changed){
    mem.summaries.forEach(function(item){
      var tier = getMemoryTierForSummary(item, Date.now(), policy);
      if (tier !== 'expired') setSummaryCurrentText(item, tier);
      else item.currentTier = 'expired';
    });
    mem.summary = mem.summaries.length ? String(mem.summaries[mem.summaries.length - 1].text || '') : '';
    mem.updatedAt = Date.now();
    return saveMemoryState().then(function(){
      if (changed && currentName === name) {
        renderMemoryPage();
        renderMemoryTierPage('fuzzy');
        renderMemoryTierPage('fish');
      }
      return changed;
    });
  }).finally(function(){ delete memoryAgingJobs[name]; });
  return memoryAgingJobs[name];
}


function prepareMemoryForContext(name, queryOverride){
  if (!name) return Promise.resolve(false);
  return maybeSummarizeShortTermMemory(name).catch(function(){ return false; }).then(function(){
    return ageMemorySummaries(name);
  }).then(function(){
    var mode = normalizeChatMemory(name).retrievalMode;
    if (mode === 'vector' || mode === 'hybrid') {
      return retrieveVectorMemoryContext(name, queryOverride).then(function(rows){
        vectorMemoryContextCache[name] = { query:vectorMemoryQueryText(name, queryOverride), rows:rows, at:Date.now() };
        return true;
      });
    }
    delete vectorMemoryContextCache[name];
    return true;
  });
}


function buildMemoryTierRows(name, tier){
  var m = normalizeChatMemory(name || '');
  var policy = normalizeMemoryAgingPolicy(name || '');
  var now = Date.now();
  return (m.summaries || []).filter(function(item){ return getMemoryTierForSummary(item, now, policy) === tier; }).map(function(item){
    return { item:item, text:getMemoryTierText(item, tier), time:summarizeTimeRangeText(item, now) };
  }).filter(function(row){ return !!row.text; }).sort(function(a,b){
    return (Number(b.item.endCreatedAt || b.item.createdAt) || 0) - (Number(a.item.endCreatedAt || a.item.createdAt) || 0);
  });
}


function buildAgedMemoryBlocks(name){
  if (!name) return '';
  var m = normalizeChatMemory(name);
  var policy = normalizeMemoryAgingPolicy(name);
  var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  var now = Date.now();
  var clearCutoff = now - policy.clearDays * MEMORY_DAY_MS;
  var fuzzyCutoff = now - policy.fuzzyDays * MEMORY_DAY_MS;
  var fishCutoff = now - policy.fishDays * MEMORY_DAY_MS;
  var contextDepth = getMemorySettings().contextDepth;
  var recentStart = Math.max(0, list.length - contextDepth);
  var clearRows = [];
  for (var i = 0; i < recentStart; i++) {
    var msg = list[i];
    var ts = messageCreatedAt(msg, now);
    if (ts >= clearCutoff) {
      var row = memoryMessageText(msg);
      if (row) clearRows.push(row);
    }
  }

  var fuzzyRows = [];
  var fishRows = [];
  (m.summaries || []).forEach(function(item){
    var endTs = Number(item.endCreatedAt || item.createdAt || 0);
    if (!endTs) return;
    if (endTs <= clearCutoff && endTs > fuzzyCutoff) fuzzyRows.push(item);
    else if (endTs <= fuzzyCutoff && endTs > fishCutoff) fishRows.push(item);
  });
  fuzzyRows.sort(function(a,b){ return (Number(a.startCreatedAt || a.createdAt) || 0) - (Number(b.startCreatedAt || b.createdAt) || 0); });
  fishRows.sort(function(a,b){ return (Number(a.startCreatedAt || a.createdAt) || 0) - (Number(b.startCreatedAt || b.createdAt) || 0); });

  var parts = [];
  if (clearRows.length) {
    var clearText = clearRows.join('\n');
    if (clearText.length > 9000) clearText = clearText.slice(-9000);
    parts.push('【清晰记忆｜最近 ' + policy.clearDays + ' 天】\n保留具体时间、人物、事件和细节。这部分比普通历史总结更接近原始聊天；不要把它改写成模糊回忆。\n' + clearText);
  }
  if (fuzzyRows.length) {
    var fuzzyText = fuzzyRows.map(function(item){
      return '【' + summarizeTimeRangeText(item, now) + '】\n' + getMemoryTierText(item, 'fuzzy');
    }).join('\n\n');
    if (fuzzyText.length > 9000) fuzzyText = fuzzyText.slice(-9000);
    parts.push('【模糊记忆｜超过清晰期至 ' + policy.fuzzyDays + ' 天】\n这些事情仍然记得，但不应再可靠地记住具体日期或精确时间；可以记住大致月份、多久以前以及主要细节。不要把模糊时间说成精确日期。\n' + fuzzyText);
  }
  if (fishRows.length) {
    var fishText = fishRows.map(function(item){
      return stripExactMemoryDates(getMemoryTierText(item, 'fish'));
    }).filter(Boolean).map(function(text){ return '• ' + text; }).join('\n');
    if (fishText.length > 6500) fishText = fishText.slice(-6500);
    parts.push('【鱼的记忆｜超过模糊期至 ' + policy.fishDays + ' 天】\n事情还保留在记忆里，但已经忘记发生的准确时间；只保留最核心的重点。回答时不要主动给出具体日期、月份或精细过程，除非当前聊天再次明确提到。\n' + fishText);
  }
  if (!parts.length) return '';
  return parts.join('\n\n');
}


function looksLikeSummaryRefusal(text){
  var s = String(text || '').trim();
  if (!s || s.length > 700) return false;
  var patterns = [
    /i\s*(?:can't|cannot|can not|am unable|cannot assist|can't assist|cannot help|can't help)/i,
    /i'?m sorry/i,
    /as an ai/i,
    /i cannot comply/i,
    /i can't comply/i,
    /无法(?:提供|协助|完成|处理|总结)/,
    /不能(?:提供|协助|完成|处理|总结)/,
    /不(?:能|可以)按照.*要求/,
    /内容.*(?:敏感|违规).*(?:无法|不能)/,
    /抱歉.*(?:无法|不能)/
  ];
  for (var i = 0; i < patterns.length; i++) if (patterns[i].test(s)) return true;
  return false;
}


function memorySummaryErrorText(err){
  var kind = String(err && err.kind || '');
  var msg = String(err && err.message || '').trim();
  if (kind === 'config') return '总结失败：副 API 尚未配置或未启用。请先在设置中检查副 API。';
  if (kind === 'network') return '总结失败：网络请求失败，请检查网络连接、Base URL 和服务地址。';
  if (kind === 'parse') return '总结失败：副 API 返回的数据格式无法解析，请检查接口是否兼容。';
  if (kind === 'http') {
    var m = msg.match(/HTTP\s+(\d{3})/i);
    var status = m ? Number(m[1]) : 0;
    if (status === 401) return '总结失败：API Key 无效或未获授权。';
    if (status === 403) return '总结失败：当前 API 无权访问这个模型。';
    if (status === 404) return '总结失败：接口地址或模型不存在，请检查副 API 配置。';
    if (status === 429) return '总结失败：请求过于频繁或账户额度不足，请稍后重试。';
    if (status >= 500) return '总结失败：副 API 服务端发生错误，请稍后重试。';
    return '总结失败：副 API 返回 HTTP ' + (status || '错误') + '。';
  }
  if (kind === 'refusal') return '总结失败：模型拒绝直接生成这批内容的总结。未写入短期记忆；可在“敏感内容总结处理”中用中性概括规则重试。';
  if (kind === 'empty') return '总结失败：副 API 没有返回可用的总结内容。';
  if (/timeout|超时/i.test(msg)) return '总结失败：请求超时，请检查网络或稍后重试。';
  return '总结失败：副 API 调用未完成，请检查设置后重试。';
}


function maybeSummarizeShortTermMemory(name, forceAll, retryMode){
  if (!name) return Promise.resolve(false);
  var cfg = getMemorySettings();
  var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  var mem = normalizeChatMemory(name);
  var aging = normalizeMemoryAgingPolicy(name);
  var now = Date.now();
  var ageCutoffIndex = 0;
  if (!forceAll) {
    var ageCutoffTs = now - aging.clearDays * MEMORY_DAY_MS;
    for (var ageIdx = 0; ageIdx < list.length; ageIdx++) {
      if (messageCreatedAt(list[ageIdx], now) < ageCutoffTs) ageCutoffIndex = ageIdx + 1;
      else break;
    }
  }
  var cutoff = forceAll ? list.length : Math.max(0, list.length - cfg.contextDepth, ageCutoffIndex);
  var pending = cutoff - mem.summarizedThrough;
  var ageEligible = !forceAll && ageCutoffIndex > mem.summarizedThrough;
  if (!forceAll && pending < cfg.summaryThreshold && !ageEligible) return Promise.resolve(false);
  if (pending <= 0) return Promise.resolve(false);
  if (memorySummaryJobs[name]) return memorySummaryJobs[name];

  var summaryBusyText = retryMode ? '正在使用备用处理规则重试总结…' : (forceAll ? '正在整理当前聊天中的新消息…' : '已达到总结条件，正在整理旧消息…');
  showMemorySummaryNotice('正在总结', summaryBusyText, true);

  if (!isSecondaryApiReady()) {
    var notReadyReason = '总结失败：副 API 尚未配置或未启用。请先在设置中检查副 API。';
    if (currentName === name && pmMemoryHint) pmMemoryHint.textContent = notReadyReason;
    showMemorySummaryNotice('总结失败', notReadyReason, false, 3200);
    return Promise.resolve(false);
  }

  var start = mem.summarizedThrough;
  var end = cutoff;
  var chunk = buildSummarySource(name, start, end);
  if (!chunk.trim()) {
    var emptySourceReason = '总结失败：这批消息没有可用于总结的内容。';
    if (currentName === name && pmMemoryHint) pmMemoryHint.textContent = emptySourceReason;
    showMemorySummaryNotice('总结失败', emptySourceReason, false, 2600);
    return Promise.resolve(false);
  }

  var oldSummary = mem.summary ? '\n\n【已有短期记忆】\n' + mem.summary : '';
  var summaryPrompt = String(cfg.summaryPrompt || '').trim();
  var retryPrompt = retryMode ? String(cfg.summaryRetryPrompt || DEFAULT_MEMORY_SUMMARY_RETRY_PROMPT).trim() : '';
  var prompt = [
    '你是聊天软件的短期记忆整理器。',
    '请严格依据聊天原文进行总结，不要虚构、补全或臆测未出现的信息。',
    '聊天中可能出现文字、语音（含转写）、图片、表情包、文件、真实手机位置与虚拟位置等消息类型。以下内容均属于聊天上下文；请把它们纳入总结，只记录实际可确认的信息。',
    '对于图片和表情包，如果当前总结请求中没有图片本体可供你查看，只能记录“发送了图片/表情包”这一事实，不得猜测画面、文字或情绪含义。',
    '对于没有可靠转写的语音，只记录语音时长或“无可靠转写”，不得猜测语音内容。',
    '下面的“自定义总结格式与要求”负责决定这次总结的输出结构、详细程度和表达方式：',
    summaryPrompt || '输出简洁、清晰、可持续更新的短期记忆正文。',
    retryPrompt ? '\n【总结失败重试处理规则】\n' + retryPrompt : '',
    '这份记忆会和后续最近消息一起提供给角色，因此请保留会影响后续回复的关键信息。',
    oldSummary,
    '\n【本次新增对话】\n' + chunk
  ].join('\n\n');

  var messages = [
    { role:'system', content:'你负责生成可持续更新的聊天短期记忆。只输出符合自定义要求的记忆正文，不要输出与总结任务无关的说明。' },
    { role:'user', content:prompt }
  ];
  var secCfg = getSecondaryApiConfig();
  var cfgOverride = Object.assign({}, secCfg, { maxTokens: Math.max(180, Math.min(1200, Number(secCfg.maxTokens) || 700)), temperature: 0.2 });
  memorySummaryJobs[name] = callApiOnce(messages, cfgOverride).then(function(text){
    var summary = String(text || '').trim();
    if (!summary) throw ApiError('empty', '副API返回了空的总结内容');
    if (looksLikeSummaryRefusal(summary)) throw ApiError('refusal', '模型拒绝生成这批内容的总结');
    var summaryText = summary.slice(0, 8000);
    if (!Array.isArray(mem.summaries)) mem.summaries = [];
    mem.summaries.push({
      id: genId('memsum_'),
      start: start,
      end: end,
      text: summaryText,
      clearText: summaryText,
      fuzzyText: '',
      fishText: '',
      currentTier: 'clear',
      stageUpdatedAt: 0,
      createdAt: Date.now(),
      startCreatedAt: start < list.length ? messageCreatedAt(list[start], Date.now()) : Date.now(),
      endCreatedAt: end > 0 && end - 1 < list.length ? messageCreatedAt(list[end - 1], Date.now()) : Date.now(),
      count: end - start
    });
    mem.summary = summaryText;
    mem.summarizedThrough = end;
    mem.summaryCount = mem.summaries.length;
    mem.updatedAt = Date.now();
    return saveMemoryState().then(function(){
      var created = mem.summaries[mem.summaries.length - 1];
      void extractVectorMemoriesFromChatRange(name, start, end);
      if (currentName === name) renderMemoryPage();
      showMemorySummaryNotice('总结完成', '已整理 ' + (end - start) + ' 条新消息。', false, 1500);
      return ageMemorySummaries(name).then(function(){ return true; });
    });
  }).catch(function(err){
    console.warn('[岛屿] 短期记忆总结失败', err);
    var reason = memorySummaryErrorText(err);
    if (currentName === name && pmMemoryHint) pmMemoryHint.textContent = reason;
    showMemorySummaryNotice('总结失败', reason, false, 5200);
    return false;
  }).then(function(result){
    delete memorySummaryJobs[name];
    return result;
  });
  return memorySummaryJobs[name];
}


var importantMemoryJob = null;

var IMPORTANT_MEMORY_PROMPT = [
  '你是聊天中的“重要记忆提取器”。',
  '请只从提供的【当前短期记忆】中，挑选真正值得长期保留的重要记忆。',
  '优先提取：双方关系的建立、确认、变化或重大起伏；角色认为重要、印象深刻的事件；重要场合、第一次、关键承诺、关键决定、重大冲突与和解；明显影响双方后续关系的事件。',
  '普通日常闲聊、无长期影响的小事、重复信息不要提取。宁缺毋滥，只保留真正有长期价值的条目。',
  '每条必须独占一行，严格使用“具体年月日时间点：重要记忆”格式。',
  '时间必须以原文明确出现的日期、时间或可以可靠判断的时间为准；无法确定具体时间时不要编造，使用“时间不详：重要记忆”。',
  '不要输出标题、编号、项目符号、解释、免责声明或其他格式。',
  '不要虚构原文没有发生的关系或事件。'
].join('\n');


function normalizeImportantMemoryText(text){
  return String(text || '').replace(/^[\s\-•*]+/, '').replace(/^\d+[.、)）]\s*/, '').trim();
}

function extractImportantMemories(){
  if (!currentName) return Promise.resolve(false);
  if (importantMemoryJob) return importantMemoryJob;
  var mem = normalizeChatMemory(currentName);
  var source = String(mem.summary || '').trim();
  if (!source) {
    showMemorySummaryNotice('无法提取重要记忆', '当前还没有可供摘取的短期记忆总结。', false, 2800);
    return Promise.resolve(false);
  }
  if (!isSecondaryApiReady()) {
    showMemorySummaryNotice('提取失败', '提取失败：副 API 尚未配置。请先在设置中检查副 API。', false, 3200);
    return Promise.resolve(false);
  }
  showMemorySummaryNotice('正在摘取重要记忆', '正在从当前短期记忆中筛选双方关系与关键事件…', true);
  var secCfg = getSecondaryApiConfig();
  var messages = [
    { role:'system', content:IMPORTANT_MEMORY_PROMPT },
    { role:'user', content:buildCurrentTimeFacts() + '\n\n【当前短期记忆】\n' + source }
  ];
  var cfgOverride = Object.assign({}, secCfg, { maxTokens: Math.max(220, Math.min(1000, Number(secCfg.maxTokens) || 520)), temperature: 0.15 });
  importantMemoryJob = callApiOnce(messages, cfgOverride).then(function(result){
    var raw = String(result || '').trim();
    if (!raw) throw ApiError('empty', '副API没有返回重要记忆');
    if (looksLikeSummaryRefusal(raw)) throw ApiError('refusal', '模型拒绝提取重要记忆');
    var rows = raw.split(/\r?\n/).map(normalizeImportantMemoryText).filter(Boolean);
    if (!rows.length) throw ApiError('empty', '副API没有返回可用的重要记忆');
    rows = rows.slice(0, 30);
    var existing = mem.importantMemories || [];
    var seen = {};
    existing.forEach(function(item){ seen[normalizeImportantMemoryText(item.text).toLowerCase()] = true; });
    var added = 0;
    rows.forEach(function(row){
      var key = row.toLowerCase();
      if (!key || seen[key]) return;
      var item = { id:genId('important_'), text:row.slice(0, 1000), createdAt:Date.now(), sourceSummaryId:(mem.summaries.length ? mem.summaries[mem.summaries.length-1].id : '') };
      existing.push(item);
      seen[key] = true;
      added++;
    });
    mem.importantMemories = existing;
    return saveMemoryState().then(function(){
      renderMemoryPage();
      showMemorySummaryNotice('重要记忆摘取完成', added ? '新增 ' + added + ' 条重要记忆。' : '没有发现新的、足够重要且不重复的记忆。', false, 2400);
      return true;
    });
  }).catch(function(err){
    var reason = memorySummaryErrorText(err).replace(/^总结失败：/, '提取失败：');
    showMemorySummaryNotice('重要记忆提取失败', reason, false, 5200);
    return false;
  }).then(function(result){
    importantMemoryJob = null;
    return result;
  });
  return importantMemoryJob;
}


function deleteImportantMemory(id){
  if (!currentName || !id) return;
  var mem = normalizeChatMemory(currentName);
  var before = mem.importantMemories.length;
  mem.importantMemories = mem.importantMemories.filter(function(item){ return item.id !== id; });
  if (mem.importantMemories.length === before) return;
  delete importantMemorySelectedIds[id];
  saveMemoryState().then(function(){ renderMemoryPage(); renderImportantMemoryPage(); toast('已删除这条重要记忆'); });
}


function deleteChatMemorySummary(summaryId){
  if (!currentName || !summaryId) return;
  var m = normalizeChatMemory(currentName);
  var before = m.summaries.length;
  m.summaries = m.summaries.filter(function(item){ return item.id !== summaryId; });
  if (m.summaries.length === before) return;
  if (m.summaries.length) {
    m.summaries.sort(function(a,b){ return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0); });
    var latest = m.summaries[m.summaries.length - 1];
    m.summary = latest.text;
    m.summarizedThrough = Math.max(0, Number(latest.end) || 0);
    m.summaryCount = m.summaries.length;
    m.updatedAt = Number(latest.createdAt) || Date.now();
  } else {
    m.summary = '';
    m.summarizedThrough = 0;
    m.summaryCount = 0;
    m.updatedAt = 0;
  }
  saveMemoryState().then(function(){
    renderMemoryPage();
    toast(m.summaries.length ? '已删除这条总结记录' : '已删除全部总结记录');
  });
}


var memorySelectedSummaryIds = {};

var memoryEditingSummaryId = '';

function startEditChatMemorySummary(id){
  memoryEditingSummaryId = String(id || '');
  renderMemoryPage();
  setTimeout(function(){
    var input = Array.prototype.find.call(document.querySelectorAll('[data-memory-summary-edit-input]'), function(el){ return el.getAttribute('data-memory-summary-edit-input') === memoryEditingSummaryId; });
    if (input) { input.focus(); input.selectionStart = input.value.length; input.selectionEnd = input.value.length; }
  }, 0);
}

function cancelEditChatMemorySummary(){
  memoryEditingSummaryId = '';
  renderMemoryPage();
}

function saveEditedChatMemorySummary(id){
  if (!currentName || !id) return;
  var m = normalizeChatMemory(currentName);
  var hit = (m.summaries || []).find(function(item){ return item.id === id; });
  var input = Array.prototype.find.call(document.querySelectorAll('[data-memory-summary-edit-input]'), function(el){ return el.getAttribute('data-memory-summary-edit-input') === String(id); });
  if (!hit || !input) return;
  var text = String(input.value || '').trim();
  if (!text) { toast('总结内容不能为空'); return; }
  hit.text = text.slice(0, 8000);
  var latest = m.summaries.slice().sort(function(a,b){ return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0); })[m.summaries.length - 1];
  if (latest && latest.id === hit.id) {
    m.summary = hit.text;
  }
  m.updatedAt = Date.now();
  memoryEditingSummaryId = '';
  saveMemoryState().then(function(){ renderMemoryPage(); toast('已保存对这条总结的自定义修改'); });
}


function selectedMemorySummaryCount(){
  return Object.keys(memorySelectedSummaryIds).filter(function(id){ return memorySelectedSummaryIds[id]; }).length;
}


function pruneMemorySummarySelection(summaries){
  var allowed = {};
  (summaries || []).forEach(function(item){ allowed[item.id] = true; });
  Object.keys(memorySelectedSummaryIds).forEach(function(id){
    if (!allowed[id]) delete memorySelectedSummaryIds[id];
  });
}


function setMemorySummarySelected(id, selected){
  id = String(id || '');
  if (!id) return;
  if (selected) memorySelectedSummaryIds[id] = true;
  else delete memorySelectedSummaryIds[id];
  renderMemoryPage();
}


function toggleAllMemorySummarySelection(){
  if (!currentName) return;
  var m = normalizeChatMemory(currentName);
  var policy = normalizeMemoryAgingPolicy(currentName || '');
  var now = Date.now();
  var allRows = (m.summaries || []).filter(function(item){ return getMemoryTierForSummary(item, now, policy) === 'clear'; }).slice().sort(function(a,b){ return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });
  pruneMemorySummarySelection(allRows);
  var query = getMemorySummarySearchQuery();
  var rows = query ? allRows.filter(function(item){
    var text = String(item.text || '').toLocaleLowerCase();
    var time = item.createdAt ? new Date(item.createdAt).toLocaleString().toLocaleLowerCase() : '';
    return text.indexOf(query) >= 0 || time.indexOf(query) >= 0;
  }) : allRows;
  if (!rows.length) return;
  var allVisibleSelected = rows.every(function(item){ return !!memorySelectedSummaryIds[item.id]; });
  if (allVisibleSelected) rows.forEach(function(item){ delete memorySelectedSummaryIds[item.id]; });
  else rows.forEach(function(item){ memorySelectedSummaryIds[item.id] = true; });
  renderMemorySummaryHistory();
}

function deleteSelectedChatMemorySummaries(){
  if (!currentName) return;
  var m = normalizeChatMemory(currentName);
  var ids = Object.keys(memorySelectedSummaryIds).filter(function(id){ return memorySelectedSummaryIds[id]; });
  if (!ids.length) { toast('请先选择要删除的总结记录'); return; }
  if (!window.confirm('确定删除已选择的 ' + ids.length + ' 条总结记录吗？聊天原文不会被删除。')) return;
  var idSet = {};
  ids.forEach(function(id){ idSet[id] = true; });
  m.summaries = m.summaries.filter(function(item){ return !idSet[item.id]; });

  if (m.summaries.length) {
    m.summaries.sort(function(a,b){ return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0); });
    var latest = m.summaries[m.summaries.length - 1];
    m.summary = latest.text;
    m.summarizedThrough = Math.max(0, Number(latest.end) || 0);
    m.summaryCount = m.summaries.length;
    m.updatedAt = Number(latest.createdAt) || Date.now();
  } else {
    m.summary = '';
    m.summarizedThrough = 0;
    m.summaryCount = 0;
    m.updatedAt = 0;
  }
  memorySelectedSummaryIds = {};
  saveMemoryState().then(function(){
    renderMemoryPage();
    toast(m.summaries.length ? '已删除所选总结记录' : '已删除全部总结记录');
  });
}


function updateMemorySummaryPresetButton(){
  var btn = $('pmMemorySummaryPresetUpdate');
  if (!btn) return;
  var cfg = getMemorySettings();
  var id = cfg.activeSummaryPresetId || '';
  var hasActive = id === 'default' || (Array.isArray(cfg.summaryPresets) && cfg.summaryPresets.some(function(p){ return p.id === id; }));
  btn.disabled = !hasActive || id === 'default';
  btn.textContent = '更新当前';
  btn.setAttribute('aria-label', id === 'default' ? '默认总结不可更新' : (hasActive ? '更新当前预设' : '请先选择已保存预设'));
  btn.title = id === 'default' ? '默认总结不可覆盖' : (hasActive ? '用当前提示词覆盖所选预设' : '请先选择一个已保存预设');
}

function saveMemorySummaryPreset(){
  var cfg = getMemorySettings();
  var id = cfg.activeSummaryPresetId || '';
  if (!id || id === 'default') { toast('请先选择一个可编辑的总结预设'); return; }
  var hit = (cfg.summaryPresets || []).find(function(p){ return p.id === id; });
  if (!hit) { toast('当前总结预设不存在'); return; }
  var value = String(pmMemorySummaryPrompt ? pmMemorySummaryPrompt.value : '').trim();
  if (!value) { toast('总结提示词不能为空'); return; }
  hit.prompt = value;
  hit.updatedAt = Date.now();
  cfg.summaryPrompt = value;
  cfg.activeSummaryPresetId = hit.id;
  saveSettings().then(function(){ renderMemoryPage(); toast('已更新总结预设“' + hit.name + '”'); });
}

function saveMemorySummaryAsPreset(){
  var cfg = getMemorySettings();
  var value = String(pmMemorySummaryPrompt ? pmMemorySummaryPrompt.value : '').trim();
  if (!value) { toast('总结提示词不能为空'); return; }
  var name = window.prompt('给这个总结预设起个名字', '新预设');
  if (name === null) return;
  name = String(name).trim().slice(0, 40);
  if (!name) { toast('预设名称不能为空'); return; }
  var preset = { id:genId('mem_'), name:name, prompt:value, builtin:false, updatedAt:Date.now() };
  cfg.summaryPresets = Array.isArray(cfg.summaryPresets) ? cfg.summaryPresets : [];
  cfg.summaryPresets.unshift(preset);
  cfg.activeSummaryPresetId = preset.id;
  cfg.summaryPrompt = value;
  saveSettings().then(function(){ renderMemoryPage(); toast('已添加总结预设“' + preset.name + '”'); });
}

function deleteMemorySummaryPreset(id){
  var cfg = getMemorySettings();
  var presets = Array.isArray(cfg.summaryPresets) ? cfg.summaryPresets : [];
  var index = -1, hit = null;
  for (var i = 0; i < presets.length; i++) if (presets[i].id === id) { index = i; hit = presets[i]; break; }
  if (index < 0 || !hit) return;
  if (!window.confirm('删除总结预设“' + hit.name + '”？')) return;
  presets.splice(index, 1);
  if (cfg.activeSummaryPresetId === id) {
    cfg.activeSummaryPresetId = 'default';
    cfg.summaryPrompt = DEFAULT_MEMORY_SUMMARY_PROMPT;
  }
  saveSettings().then(function(){ renderMemoryPage(); toast('已删除总结预设'); });
}

function getMemorySummarySearchQuery(){
  return pmMemorySummarySearch ? String(pmMemorySummarySearch.value || '').trim().toLocaleLowerCase() : '';
}

function renderMemorySummaryHistory(){
  if (!pmMemorySummaryHistory) return;
  var m = normalizeChatMemory(currentName || '');
  var allRows = (m.summaries || []).slice().sort(function(a,b){ return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });
  pruneMemorySummarySelection(allRows);
  var query = getMemorySummarySearchQuery();
  if (pmMemorySummarySearchClear) pmMemorySummarySearchClear.hidden = !query;
  if (!allRows.length) {
    pmMemorySummaryHistory.innerHTML = '<div class="pm-memory-history-empty">还没有可单独管理的总结记录。</div>';
    return;
  }
  var rows = query ? allRows.filter(function(item){
    var text = String(item.text || '').toLocaleLowerCase();
    var time = item.createdAt ? new Date(item.createdAt).toLocaleString().toLocaleLowerCase() : '';
    return text.indexOf(query) >= 0 || time.indexOf(query) >= 0;
  }) : allRows;
  var selectedCount = selectedMemorySummaryCount();
  var visibleSelectedCount = rows.filter(function(item){ return !!memorySelectedSummaryIds[item.id]; }).length;
  var allVisibleSelected = rows.length > 0 && visibleSelectedCount === rows.length;
  var toolbar = '<div class="pm-memory-history-toolbar">' +
    '<button type="button" class="pm-memory-history-tool" data-memory-summary-select-all>' + (allVisibleSelected ? '取消全选' : (query ? '全选结果' : '全选')) + '</button>' +
    '<span class="pm-memory-history-selected">已选 ' + selectedCount + ' 条' + (query && rows.length !== allRows.length ? ' · 匹配 ' + rows.length + ' 条' : '') + '</span>' +
    '<button type="button" class="pm-memory-history-tool danger" data-memory-summary-delete-selected' + (selectedCount ? '' : ' disabled') + '>删除已选</button>' +
    '</div>';
  if (!rows.length) {
    pmMemorySummaryHistory.innerHTML = toolbar + '<div class="pm-memory-history-empty">没有找到匹配的短期记忆。</div>';
    return;
  }
  pmMemorySummaryHistory.innerHTML = toolbar + rows.map(function(item){
    var originalIndex = allRows.findIndex(function(row){ return row.id === item.id; });
    var preview = String(item.text || '').replace(/\s+/g, ' ').trim();
    if (preview.length > 120) preview = preview.slice(0, 120) + '…';
    var time = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
    var selected = !!memorySelectedSummaryIds[item.id];
    var editing = memoryEditingSummaryId === item.id;
    var actions = editing
      ? '<div class="pm-memory-history-edit-actions"><button type="button" class="pm-memory-history-edit-btn" data-memory-summary-save-edit="' + escapeHTML(item.id) + '">保存</button><button type="button" class="pm-memory-history-edit-btn secondary" data-memory-summary-cancel-edit="' + escapeHTML(item.id) + '">取消</button></div>'
      : '<div class="pm-memory-history-head-actions"><button type="button" class="pm-memory-history-edit-btn" data-memory-summary-edit="' + escapeHTML(item.id) + '">编辑</button><button type="button" class="pm-memory-history-delete" data-memory-summary-delete="' + escapeHTML(item.id) + '">删除</button></div>';
    return '<article class="pm-memory-history-item' + (selected ? ' is-selected' : '') + '">' +
      '<div class="pm-memory-history-head">' +
        '<label class="pm-memory-history-check"><input type="checkbox" data-memory-summary-select="' + escapeHTML(item.id) + '"' + (selected ? ' checked' : '') + '><span aria-hidden="true"></span></label>' +
        '<div><strong>第 ' + (allRows.length - originalIndex) + ' 次总结</strong><span>' + escapeHTML(time) + '</span></div>' + actions +
      '</div>' +
      '<div class="pm-memory-history-range">整理了 ' + Math.max(0, Number(item.end) - Number(item.start)) + ' 条消息</div>' +
      (editing
        ? '<textarea class="pm-memory-history-edit-input" data-memory-summary-edit-input="' + escapeHTML(item.id) + '" rows="8" spellcheck="false">' + escapeHTML(item.text || '') + '</textarea>'
        : '<div class="pm-memory-history-preview">' + escapeHTML(preview) + '</div>') +
      '</article>';
  }).join('');
}

function renderMemoryTierPage(tier){
  var listEl = tier === 'fuzzy' ? $('pmFuzzyMemoryList') : $('pmFishMemoryList');
  if (!listEl || !currentName) return;
  var chatNameEl = tier === 'fuzzy' ? $('pmFuzzyMemoryChatName') : $('pmFishMemoryChatName');
  if (chatNameEl) chatNameEl.textContent = currentName;
  var rows = buildMemoryTierRows(currentName, tier);
  if (!rows.length) {
    listEl.innerHTML = '<div class="pm-memory-history-empty">目前还没有进入这一阶段的记忆。</div>';
    return;
  }
  listEl.innerHTML = rows.map(function(row, index){
    var item = row.item;
    var text = String(row.text || '').trim();
    return '<article class="pm-memory-tier-item">' +
      '<div class="pm-memory-tier-head"><strong>记忆 ' + (index + 1) + '</strong><span class="pm-memory-tier-badge">' + escapeHTML(row.time) + '</span></div>' +
      '<div class="pm-memory-tier-meta">整理了 ' + Math.max(0, Number(item.end) - Number(item.start)) + ' 条聊天消息</div>' +
      '<div class="pm-memory-tier-text">' + escapeHTML(text) + '</div>' +
    '</article>';
  }).join('');
}


var vectorMemorySelectedIds = Object.create(null);

function pruneVectorMemorySelection(rows){
  var valid={};
  (rows||[]).forEach(function(item){ valid[item.id]=true; });
  Object.keys(vectorMemorySelectedIds).forEach(function(id){ if(!valid[id]) delete vectorMemorySelectedIds[id]; });
}

function selectedVectorMemoryCount(){
  return Object.keys(vectorMemorySelectedIds).filter(function(id){ return vectorMemorySelectedIds[id]; }).length;
}

function setVectorMemorySelected(id, selected){
  if(!id) return;
  if(selected) vectorMemorySelectedIds[id]=true; else delete vectorMemorySelectedIds[id];
  renderVectorMemoryPage();
}

function toggleAllVectorMemorySelection(){
  if(!currentName) return;
  var rows=(normalizeChatMemory(currentName).vector.entries||[]).slice().sort(function(a,b){ return (Number(a.order)||0)-(Number(b.order)||0); });
  var all=rows.length>0 && rows.every(function(item){ return !!vectorMemorySelectedIds[item.id]; });
  rows.forEach(function(item){ if(all) delete vectorMemorySelectedIds[item.id]; else vectorMemorySelectedIds[item.id]=true; });
  renderVectorMemoryPage();
}

function deleteSelectedVectorMemories(){
  if(!currentName) return;
  var ids=Object.keys(vectorMemorySelectedIds).filter(function(id){ return vectorMemorySelectedIds[id]; });
  if(!ids.length){ toast('请先选择要删除的向量记忆'); return; }
  if(!window.confirm('确定删除已选择的 ' + ids.length + ' 条向量记忆吗？')) return;
  var idSet={}; ids.forEach(function(id){ idSet[id]=true; });
  var m=normalizeChatMemory(currentName);
  var before=m.vector.entries.length;
  m.vector.entries=m.vector.entries.filter(function(item){ return !idSet[item.id]; });
  if(m.vector.entries.length===before) return;
  vectorMemorySelectedIds=Object.create(null);
  m.vector.updatedAt=Date.now();
  saveMemoryState().then(function(){ renderVectorMemoryPage(); renderMemoryPage(); toast('已删除所选向量记忆'); });
}


function formatVectorMemoryEventTime(item){
  if(item && item.eventAtLabel) return item.eventAtLabel;
  var start=Number(item && item.sourceStartCreatedAt || 0), end=Number(item && item.sourceEndCreatedAt || 0);
  if(start && end){
    var a=new Date(start), b=new Date(end);
    var sameDay=a.toLocaleDateString('zh-CN')===b.toLocaleDateString('zh-CN');
    if(sameDay){
      return a.toLocaleDateString('zh-CN') + ' ' + a.toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'}) + (Math.abs(end-start)>60000 ? '～' + b.toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'}) : '');
    }
    return a.toLocaleString('zh-CN',{hour12:false}) + '～' + b.toLocaleString('zh-CN',{hour12:false});
  }
  return item && item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN',{hour12:false}) : '时间不详';
}

function renderVectorMemoryPage(){
  if (!currentName) return;
  var m = normalizeChatMemory(currentName);
  var rows = (m.vector.entries || []).slice().sort(function(a,b){ return (Number(a.order)||0)-(Number(b.order)||0); });
  pruneVectorMemorySelection(rows);
  if (pmVectorMemoryChatName) pmVectorMemoryChatName.textContent = currentName;
  if (pmVectorMemoryCount) pmVectorMemoryCount.textContent = rows.length + ' 条记忆';
  if (pmVectorMemoryCountPage) pmVectorMemoryCountPage.textContent = rows.length + ' 条记忆';
  if (pmMemoryRetrievalMode) {
    var mode = m.retrievalMode || 'summary';
    $$('#pmMemoryRetrievalMode [data-memory-mode]').forEach(function(btn){
      btn.classList.toggle('is-active', btn.dataset.memoryMode === mode);
    });
  }
  if (!pmVectorMemoryList) return;
  var selectedCount=selectedVectorMemoryCount();
  var allSelected=rows.length>0 && rows.every(function(item){ return !!vectorMemorySelectedIds[item.id]; });
  var toolbar='<div class="pm-memory-history-toolbar pm-vector-memory-toolbar">' +
    '<button type="button" class="pm-memory-history-tool" data-vector-memory-select-all>' + (allSelected ? '取消全选' : '全选') + '</button>' +
    '<span class="pm-memory-history-selected">已选 ' + selectedCount + ' 条</span>' +
    '<button type="button" class="pm-memory-history-tool danger" data-vector-memory-delete-selected' + (selectedCount ? '' : ' disabled') + '>删除已选</button>' +
    '</div>';
  if (!rows.length) {
    pmVectorMemoryList.innerHTML = toolbar + '<div class="pm-memory-history-empty">当前 Char 还没有向量记忆。</div>';
    return;
  }
  var typeLabels = { manual:'手动', semantic:'语义提取', summary:'旧版同步', important:'旧版同步' };
  pmVectorMemoryList.innerHTML = toolbar + rows.map(function(item, index){
    var ready = Array.isArray(item.embedding) && item.embedding.length;
    var selected=!!vectorMemorySelectedIds[item.id];
    var eventTime=formatVectorMemoryEventTime(item);
    return '<article class="pm-vector-memory-item' + (selected?' is-selected':'') + '">' +
      '<div class="pm-vector-memory-top"><label class="pm-vector-memory-check"><input type="checkbox" data-vector-memory-select="' + escapeHTML(item.id) + '"' + (selected?' checked':'') + '><span aria-hidden="true"></span></label><div class="pm-vector-memory-index">' + (index + 1) + '</div><div class="pm-vector-memory-source">' + escapeHTML(typeLabels[item.sourceType] || '记忆') + ' · ' + escapeHTML(eventTime) + ' · ' + (ready ? '已向量化' : '待向量化') + '</div></div>' +
      '<div class="pm-vector-memory-text">' + escapeHTML(item.text) + '</div>' +
      '<div class="pm-vector-memory-actions">' +
        '<button type="button" data-vector-memory-up="' + escapeHTML(item.id) + '"' + (index===0?' disabled':'') + '>↑</button>' +
        '<button type="button" data-vector-memory-down="' + escapeHTML(item.id) + '"' + (index===rows.length-1?' disabled':'') + '>↓</button>' +
        '<button type="button" data-vector-memory-edit="' + escapeHTML(item.id) + '">编辑</button>' +
        '<button type="button" data-vector-memory-delete="' + escapeHTML(item.id) + '">删除</button>' +
      '</div></article>';
  }).join('');
}

function renderMemoryPage(){
  renderMemoryHomePage();
  var settings = getMemorySettings();
  if (pmMemoryContextDepth) pmMemoryContextDepth.value = String(settings.contextDepth);
  if (pmMemorySummaryThreshold) pmMemorySummaryThreshold.value = String(settings.summaryThreshold);
  if (pmMemorySummaryPrompt) pmMemorySummaryPrompt.value = settings.summaryPrompt || '';
  if (pmMemorySummaryRetryPrompt) pmMemorySummaryRetryPrompt.value = settings.summaryRetryPrompt || DEFAULT_MEMORY_SUMMARY_RETRY_PROMPT;
  if (pmMemorySummaryPreset) {
    var summaryPresetOptions = [{ id:'default', name:'默认总结', builtin:true }].concat(settings.summaryPresets || []);
    pmMemorySummaryPreset.innerHTML = summaryPresetOptions.map(function(p){
      return '<option value="' + escapeHTML(p.id) + '">' + escapeHTML(p.name) + '</option>';
    }).join('');
    pmMemorySummaryPreset.value = settings.activeSummaryPresetId || 'default';
  }
  var memoryPresetList = $('pmMemorySummaryPresetList');
  if (memoryPresetList) {
    var activePresetId = settings.activeSummaryPresetId || 'default';
    var rows = [{ id:'default', name:'默认总结', builtin:true }].concat(settings.summaryPresets || []);
    memoryPresetList.innerHTML = rows.map(function(p){
      var isActive = p.id === activePresetId;
      return '<div class="saved-preset-row">' +
        '<button class="saved-preset-item' + (isActive ? ' is-active' : '') + '" type="button" data-memory-summary-preset-id="' + escapeHTML(p.id) + '">' +
          '<span class="saved-preset-main"><span class="saved-preset-name"><span>' + escapeHTML(p.name) + '</span>' + (isActive ? '<span class="saved-preset-current">当前</span>' : '') + '</span></span>' +
        '</button>' +
        (p.builtin ? '' : '<button class="saved-preset-delete" type="button" data-memory-summary-preset-delete="' + escapeHTML(p.id) + '" aria-label="删除 ' + escapeHTML(p.name) + '">×</button>') +
      '</div>';
    }).join('');
  }
  updateMemorySummaryPresetButton();
  var m = normalizeChatMemory(currentName || '');
  pruneMemorySummarySelection(m.summaries);
  renderMemorySummaryHistory();
  renderVectorMemoryPage();
  if (pmMemoryApiState) {
    pmMemoryApiState.textContent = isSecondaryApiReady() ? '副API已配置' : '副API未配置';
    pmMemoryApiState.classList.toggle('is-ok', isSecondaryApiReady());
    pmMemoryApiState.classList.toggle('is-warn', !isSecondaryApiReady());
  }
}

var pendingMemoryClearSelection = { summary:true, important:false, vector:false };

function openMemoryClearModal(){
  if(!currentName || !pmMemoryClearModal) return;
  var m=normalizeChatMemory(currentName);
  var countSummary=(m.summaries||[]).length || (m.summary ? 1 : 0);
  var countImportant=(m.importantMemories||[]).length;
  var countVector=(m.vector&&m.vector.entries||[]).length;
  if(pmMemoryClearSummaryCount) pmMemoryClearSummaryCount.textContent=countSummary+' 条';
  if(pmMemoryClearImportantCount) pmMemoryClearImportantCount.textContent=countImportant+' 条';
  if(pmMemoryClearVectorCount) pmMemoryClearVectorCount.textContent=countVector+' 条';
  pmMemoryClearSummary.checked=true; pmMemoryClearImportant.checked=false; pmMemoryClearVector.checked=false; updateMemoryClearAllState();
  pmMemoryClearModal.classList.add('is-open'); pmMemoryClearModal.setAttribute('aria-hidden','false');
}

function closeMemoryClearModal(){
  if(!pmMemoryClearModal) return;
  pmMemoryClearModal.classList.remove('is-open'); pmMemoryClearModal.setAttribute('aria-hidden','true');
}

function updateMemoryClearAllState(){
  var all=!!(pmMemoryClearSummary&&pmMemoryClearSummary.checked&&pmMemoryClearImportant&&pmMemoryClearImportant.checked&&pmMemoryClearVector&&pmMemoryClearVector.checked);
  if(pmMemoryClearAll) pmMemoryClearAll.checked=all;
}

function applyMemoryClearSelection(){
  if(!currentName) return;
  var clearSummary=!!(pmMemoryClearSummary&&pmMemoryClearSummary.checked), clearImportant=!!(pmMemoryClearImportant&&pmMemoryClearImportant.checked), clearVector=!!(pmMemoryClearVector&&pmMemoryClearVector.checked);
  if(!clearSummary&&!clearImportant&&!clearVector){ toast('请至少选择一个记忆模块'); return; }
  var labels=[]; if(clearSummary) labels.push('短期总结'); if(clearImportant) labels.push('重要记忆'); if(clearVector) labels.push('向量记忆');
  if(!window.confirm('确定清空：'+labels.join('、')+'？此操作不可恢复。')) return;
  var m=normalizeChatMemory(currentName);
  if(clearSummary){ m.summary=''; m.summarizedThrough=0; m.summaryCount=0; m.updatedAt=0; m.summaries=[]; }
  if(clearImportant){ m.importantMemories=[]; importantMemorySelectedIds=Object.create(null); }
  if(clearVector){ m.vector={version:1,entries:[]}; vectorMemorySelectedIds=Object.create(null); }
  saveMemoryState().then(function(){ closeMemoryClearModal(); renderMemoryPage(); renderVectorMemoryPage(); renderImportantMemoryPage(); toast('已清空所选记忆'); });
}


function renderMemoryHomePage(){
  if (pmMemoryHomeChatName) pmMemoryHomeChatName.textContent = currentName || '当前聊天';
  if (pmMemoryShortTermChatName) pmMemoryShortTermChatName.textContent = currentName || '当前聊天';
  var m = normalizeChatMemory(currentName || '');
  var policyForCount = normalizeMemoryAgingPolicy(currentName || '');
  var nowForCount = Date.now();
  var count = Array.isArray(m.summaries) ? m.summaries.filter(function(item){ return getMemoryTierForSummary(item, nowForCount, policyForCount) === 'clear'; }).length : 0;
  if (pmShortTermMemoryCount) pmShortTermMemoryCount.textContent = count + ' 条总结';
  var importantCount = Array.isArray(m.importantMemories) ? m.importantMemories.length : 0;
  if (pmImportantMemoryCount) pmImportantMemoryCount.textContent = importantCount + ' 条记忆';
  var vectorCount = m.vector && Array.isArray(m.vector.entries) ? m.vector.entries.length : 0;
  if (pmVectorMemoryCount) pmVectorMemoryCount.textContent = vectorCount + ' 条记忆';
  var policy = normalizeMemoryAgingPolicy(currentName || '');
  var now = Date.now();
  var fuzzyCount = (m.summaries || []).filter(function(item){ return getMemoryTierForSummary(item, now, policy) === 'fuzzy' && !!getMemoryTierText(item, 'fuzzy'); }).length;
  var fishCount = (m.summaries || []).filter(function(item){ return getMemoryTierForSummary(item, now, policy) === 'fish' && !!getMemoryTierText(item, 'fish'); }).length;
  var fuzzyCountEl = $('pmFuzzyMemoryCount');
  var fishCountEl = $('pmFishMemoryCount');
  if (fuzzyCountEl) fuzzyCountEl.textContent = fuzzyCount + ' 条记忆';
  if (fishCountEl) fishCountEl.textContent = fishCount + ' 条记忆';
  if (pmMemoryClearDays) pmMemoryClearDays.value = String(policy.clearDays);
  if (pmMemoryFuzzyDays) pmMemoryFuzzyDays.value = String(policy.fuzzyDays);
  if (pmMemoryFishDays) pmMemoryFishDays.value = String(policy.fishDays);
  if (pmMemoryTierHint) pmMemoryTierHint.textContent = '最近 ' + policy.clearDays + ' 天清晰；' + policy.clearDays + '～' + policy.fuzzyDays + ' 天模糊；' + policy.fuzzyDays + '～' + policy.fishDays + ' 天只留重点；超过 ' + policy.fishDays + ' 天自动淡出。重要记忆永久保留。';
}

function pruneImportantMemorySelection(rows){
  var valid = {};
  (rows || []).forEach(function(item){ valid[item.id] = true; });
  Object.keys(importantMemorySelectedIds).forEach(function(id){
    if (!valid[id]) delete importantMemorySelectedIds[id];
  });
}

function selectedImportantMemoryCount(){
  return Object.keys(importantMemorySelectedIds).filter(function(id){ return importantMemorySelectedIds[id]; }).length;
}

function setImportantMemorySelected(id, selected){
  if (!id) return;
  if (selected) importantMemorySelectedIds[id] = true;
  else delete importantMemorySelectedIds[id];
  renderImportantMemoryPage();
}

function toggleAllImportantMemorySelection(){
  var m = normalizeChatMemory(currentName || '');
  var rows = (m.importantMemories || []).slice();
  pruneImportantMemorySelection(rows);
  if (!rows.length) return;
  var allSelected = rows.every(function(item){ return !!importantMemorySelectedIds[item.id]; });
  if (allSelected) rows.forEach(function(item){ delete importantMemorySelectedIds[item.id]; });
  else rows.forEach(function(item){ importantMemorySelectedIds[item.id] = true; });
  renderImportantMemoryPage();
}

function deleteSelectedImportantMemories(){
  if (!currentName) return;
  var ids = Object.keys(importantMemorySelectedIds).filter(function(id){ return importantMemorySelectedIds[id]; });
  if (!ids.length) { toast('请先选择要删除的重要记忆'); return; }
  if (!window.confirm('确定删除已选择的 ' + ids.length + ' 条重要记忆吗？')) return;
  var idSet = {};
  ids.forEach(function(id){ idSet[id] = true; });
  var m = normalizeChatMemory(currentName);
  var before = m.importantMemories.length;
  m.importantMemories = m.importantMemories.filter(function(item){ return !idSet[item.id]; });
  if (m.importantMemories.length === before) return;
  importantMemorySelectedIds = Object.create(null);
  saveMemoryState().then(function(){
    renderMemoryPage();
    renderImportantMemoryPage();
    toast('已删除所选重要记忆');
  });
}

function addCustomImportantMemory(){
  if (!currentName) return;
  var text = window.prompt('请输入要长期保留的重要记忆内容（可输入多行）', '');
  if (text === null) return;
  text = String(text).trim();
  if (!text) { toast('重要记忆内容不能为空'); return; }
  if (text.length > 1000) text = text.slice(0, 1000);
  var defaultStamp=new Date().toLocaleString('sv-SE',{hour12:false}).replace('T',' ');
  var stamp = window.prompt('请输入这条记忆的时间戳（YYYY-MM-DD HH:mm），留空使用当前时间', defaultStamp);
  if (stamp === null) return;
  stamp=String(stamp).trim();
  var memoryAt=Date.parse(stamp.replace(' ','T'));
  if (!Number.isFinite(memoryAt)) memoryAt=Date.now();
  var m = normalizeChatMemory(currentName);
  var key = normalizeImportantMemoryText(text).toLowerCase();
  var duplicate = (m.importantMemories || []).some(function(item){ return normalizeImportantMemoryText(item.text).toLowerCase() === key; });
  if (duplicate) { toast('这条重要记忆已经存在'); return; }
  m.importantMemories.push({
    id: genId('important_custom_'),
    text: text,
    createdAt: Date.now(),
    memoryAt: memoryAt,
    sourceSummaryId: ''
  });
  saveMemoryState().then(function(){
    renderMemoryPage();
    renderImportantMemoryPage();
    toast('已添加自定义重要记忆');
  });
}

function renderImportantMemoryPage(){
  var m = normalizeChatMemory(currentName || '');
  if (pmImportantMemoryChatName) pmImportantMemoryChatName.textContent = currentName || '当前聊天';
  var rows = (m.importantMemories || []).slice().sort(function(a,b){ return (Number(b.createdAt)||0) - (Number(a.createdAt)||0); });
  pruneImportantMemorySelection(rows);
  if (pmImportantMemoryCountPage) pmImportantMemoryCountPage.textContent = rows.length + ' 条记忆';
  if (!pmMemoryImportantList) return;
  var selectedCount = selectedImportantMemoryCount();
  var allSelected = rows.length > 0 && rows.every(function(item){ return !!importantMemorySelectedIds[item.id]; });
  var toolbar = '<div class="pm-memory-history-toolbar pm-important-memory-toolbar">' +
    '<button type="button" class="pm-memory-history-tool" data-important-memory-select-all>' + (allSelected ? '取消全选' : '全选') + '</button>' +
    '<span class="pm-memory-history-selected">已选 ' + selectedCount + ' 条</span>' +
    '<button type="button" class="pm-memory-history-tool danger" data-important-memory-delete-selected' + (selectedCount ? '' : ' disabled') + '>删除已选</button>' +
    '</div>' ;
  if (!rows.length) {
    pmMemoryImportantList.innerHTML = toolbar + '<div class="pm-memory-history-empty">还没有重要记忆，可以先点击“添加自定义”或“摘取重要记忆”。</div>';
    return;
  }
  pmMemoryImportantList.innerHTML = toolbar + rows.map(function(item){
    var selected = !!importantMemorySelectedIds[item.id];
    var sourceLabel = item.sourceSummaryId ? '摘取于 ' : '自定义于 ';
    return '<article class="pm-important-memory-item' + (selected ? ' is-selected' : '') + '">' +
      '<div class="pm-important-memory-item-head">' +
        '<label class="pm-important-memory-check"><input type="checkbox" data-important-memory-select="' + escapeHTML(item.id) + '"' + (selected ? ' checked' : '') + '><span aria-hidden="true"></span></label>' +
        '<div class="pm-important-memory-text">' + escapeHTML(item.text) + '</div>' +
      '</div>' +
      '<div class="pm-important-memory-meta">' + sourceLabel + escapeHTML(item.memoryAt ? new Date(item.memoryAt).toLocaleString('zh-CN', {hour12:false}) : (item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', {hour12:false}) : '')) +
      '<button type="button" class="pm-important-memory-delete" data-important-memory-delete="' + escapeHTML(item.id) + '">删除</button></div>' +
    '</article>';
  }).join('');
}

function openVectorMemoryPage(){
  if (!pmVectorMemoryView || !currentName) { toast('请先进入一个角色聊天'); return; }
  closePanel();
  closeMemoryViews();
  renderMemoryPage();
  renderVectorMemoryPage();
  pmVectorMemoryView.classList.add('is-open');
  pmVectorMemoryView.setAttribute('aria-hidden','false');
}

function closeVectorMemoryPage(){
  closeMemoryViews();
  openMemoryPage();
}

function openMemoryPage(){
  if (!pmMemoryHomeView || !currentName) { toast('请先进入一个角色聊天'); return; }
  closePanel();
  if (pmMemoryView) {
    pmMemoryView.classList.remove('is-open');
    pmMemoryView.setAttribute('aria-hidden','true');
  }
  // 首页需要完整恢复当前聊天的记忆设置、已保存预设、重要记忆及副 API 状态；
  // 不能只刷新标题和短期记忆条数，否则首次进入时会显示默认占位内容，
  // 只有进入短期记忆页触发完整渲染后再返回才会出现真实数据。
  renderMemoryPage();
  pmMemoryHomeView.classList.add('is-open');
  pmMemoryHomeView.setAttribute('aria-hidden','false');
  ageMemorySummaries(currentName).then(function(){ renderMemoryPage(); });
}

function closeMemoryViews(){
  [pmMemoryHomeView, pmMemoryView, pmFuzzyMemoryView, pmFishMemoryView, pmVectorMemoryView, pmImportantMemoryView].forEach(function(view){
    if (!view) return;
    view.classList.remove('is-open');
    view.setAttribute('aria-hidden','true');
  });
}

function openShortTermMemoryPage(){
  if (!pmMemoryView || !currentName) { toast('请先进入一个角色聊天'); return; }
  closePanel();
  if (pmMemoryHomeView) {
    pmMemoryHomeView.classList.remove('is-open');
    pmMemoryHomeView.setAttribute('aria-hidden','true');
  }
  if (pmMemorySummarySearch) pmMemorySummarySearch.value = '';
  renderMemoryPage();
  pmMemoryView.classList.add('is-open');
  pmMemoryView.setAttribute('aria-hidden','false');
}

function openMemoryTierPage(tier){
  var view = tier === 'fuzzy' ? pmFuzzyMemoryView : pmFishMemoryView;
  if (!view || !currentName) { toast('请先进入一个角色聊天'); return; }
  closePanel();
  closeMemoryViews();
  renderMemoryPage();
  renderMemoryTierPage(tier);
  view.classList.add('is-open');
  view.setAttribute('aria-hidden','false');
  ageMemorySummaries(currentName).then(function(){ renderMemoryTierPage(tier); });
}

function openFuzzyMemoryPage(){ openMemoryTierPage('fuzzy'); }

function openFishMemoryPage(){ openMemoryTierPage('fish'); }

function closeMemoryTierPage(){
  closeMemoryViews();
  openMemoryPage();
}

function openImportantMemoryPage(){
  if (!pmImportantMemoryView || !currentName) { toast('请先进入一个角色聊天'); return; }
  closePanel();
  closeMemoryViews();
  renderMemoryPage();
  renderImportantMemoryPage();
  pmImportantMemoryView.classList.add('is-open');
  pmImportantMemoryView.setAttribute('aria-hidden','false');
}

function closeImportantMemoryPage(){
  if (!pmImportantMemoryView) return;
  pmImportantMemoryView.classList.remove('is-open');
  pmImportantMemoryView.setAttribute('aria-hidden','true');
  openMemoryPage();
}

function closeMemoryPage(){
  if (!pmMemoryView) return;
  pmMemoryView.classList.remove('is-open');
  pmMemoryView.setAttribute('aria-hidden','true');
  openMemoryPage();
}
