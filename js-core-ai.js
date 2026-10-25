/* 岛屿 · AI 请求底层（URL 规范化、ApiError、callApiOnce、流式输出、识图）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。
 *
 * v2（中转站兼容 + 流式 + 识图）：
 *  - URL：自动补 https://、去空白/全角符号、识别 /v1 /v1beta/openai /compatible-mode/v1 等写法；
 *    末尾加 # 表示「原样使用，不再自动补路径」；误贴 /models、/responses 等也会被纠正。
 *  - Key：自动去掉 Bearer 前缀、空白与非 ASCII 字符（否则浏览器会因非法请求头直接报错）。
 *  - 响应：兼容 content 为数组、legacy text、Claude / Gemini / Responses 原生格式、200 里夹带的错误、
 *    返回网页（Base URL 填错）、非流式却返回 SSE 等各种中转站“特色”。
 *  - 自动降级重试：max_tokens ↔ max_completion_tokens、不支持 temperature、不支持 system/developer 角色、
 *    要求角色严格交替、不支持图片/数组 content、流式与非流式互相不支持、429/502/503/504/网络抖动。
 *  - 流式：cfg.stream = true 时走 SSE，内部累计成完整文本后返回，所有调用方无需改动。 */
'use strict';

/* ───────────── URL / Key 规范化 ───────────── */

function cleanUrlInput(url){
  var s = String(url == null ? '' : url)
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[\uff1a]/g, ':').replace(/[\uff0f]/g, '/').replace(/[\uff0e\u3002]/g, '.').replace(/[\uff03]/g, '#')
    .replace(/\s+/g, '');
  if (!s) return '';
  if (/^\/\//.test(s)) s = 'https:' + s;
  else if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(s)) {
    var host = s.split(/[\/?#]/)[0];
    var local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i.test(host);
    s = (local ? 'http://' : 'https://') + s.replace(/^:?\/+/, '');
  }
  return s;
}

/* 拆成 {origin, path, query, raw}；raw=true 表示用户以 # 结尾，要求原样使用 */
function splitApiUrl(input){
  var s = cleanUrlInput(input);
  if (!s) return null;
  var raw = false;
  if (/#+$/.test(s)) { raw = true; s = s.replace(/#+$/, ''); }
  else s = s.replace(/#.*$/, '');
  var query = '', qi = s.indexOf('?');
  if (qi >= 0) { query = s.slice(qi); s = s.slice(0, qi); }
  var m = /^([a-z][a-z0-9+.\-]*:\/\/[^\/]+)(\/.*)?$/i.exec(s);
  if (!m) return null;
  return { origin: m[1], path: (m[2] || '').replace(/\/+$/, ''), query: query, raw: raw };
}

var API_VERSION_TAIL = /\/v\d+[a-z]*$/i;

function normalizeBaseUrl(url){
  var u = splitApiUrl(url);
  if (!u) return '';
  var path = u.path;
  if (u.raw) return u.origin + path + u.query;
  if (!/\/chat\/completions$/i.test(path)) {
    /* 用户误贴了别的端点：/v1/models、/v1/responses、/v1/completions、/v1/messages … 先退回到根 */
    path = path.replace(/\/(?:models|embeddings|responses|completions|messages|images\/generations|audio\/transcriptions)$/i, '');
    if (API_VERSION_TAIL.test(path)) path += '/chat/completions';
    else if (/\/v\d+[a-z]*\/openai$/i.test(path)) path += '/chat/completions';   /* Gemini OpenAI 兼容：/v1beta/openai */
    else path += '/v1/chat/completions';
  }
  return u.origin + path + u.query;
}

function normalizeModelsUrl(url){
  var u = splitApiUrl(url);
  if (!u) return '';
  var path = u.path;
  if (u.raw) {
    if (/\/chat\/completions$/i.test(path)) path = path.replace(/\/chat\/completions$/i, '/models');
    else if (!/\/models$/i.test(path)) path += '/models';
    return u.origin + path;
  }
  if (/\/models$/i.test(path)) return u.origin + path;
  path = path.replace(/\/(?:chat\/completions|embeddings|responses|completions|messages|audio\/transcriptions)$/i, '');
  if (API_VERSION_TAIL.test(path) || /\/v\d+[a-z]*\/openai$/i.test(path)) path += '/models';
  else path += '/v1/models';
  return u.origin + path;
}

function previewEndpoint(url){ return normalizeBaseUrl(url) || '—'; }

function normalizeTranscriptionsUrl(url){
  var u = splitApiUrl(url);
  if (!u) return '';
  var path = u.path;
  if (u.raw) return u.origin + path + u.query;
  if (/\/audio\/transcriptions$/i.test(path)) return u.origin + path + u.query;
  path = path.replace(/\/(?:models|chat\/completions)$/i, '');
  if (API_VERSION_TAIL.test(path)) path += '/audio/transcriptions';
  else path += '/v1/audio/transcriptions';
  return u.origin + path + u.query;
}

function previewTranscriptionsEndpoint(url){ return normalizeTranscriptionsUrl(url) || '—'; }

/* 去掉 Bearer 前缀、空白、非 ASCII（含全角、零宽字符）——这些会让 fetch 直接抛“非法请求头” */
function cleanApiKey(key){
  key = String(key == null ? '' : key).replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim();
  key = key.replace(/^(?:authorization\s*[:：]\s*)?bearer\s+/i, '');
  return key.replace(/[^\x21-\x7e]/g, '');
}

/* ───────────── 错误 ───────────── */

function ApiError(kind, message, detail, status){
  var e = new Error(message); e.kind = kind; e.detail = detail || ''; if (status) e.status = status; return e;
}

function httpErrorText(status, bodyText){
  var hint = '';
  if (status === 400) hint = '（请求参数被拒绝）';
  else if (status === 401) hint = '（API Key 无效或未授权）';
  else if (status === 402) hint = '（余额不足）';
  else if (status === 403) hint = '（无权限访问该模型，或被中转站/地区限制）';
  else if (status === 404) hint = '（接口地址或模型不存在，检查 Base URL 是否缺少 /v1）';
  else if (status === 408) hint = '（请求超时）';
  else if (status === 413) hint = '（请求内容太大，可能是图片或上下文过多）';
  else if (status === 429) hint = '（请求太频繁或额度用尽）';
  else if (status === 502 || status === 503) hint = '（中转站上游暂时不可用，稍后重试）';
  else if (status === 504 || status === 524 || status === 522 || status === 408) hint = '（中转站等待上游超时；可在 AI 接口里改用「流式输出」）';
  else if (status >= 500) hint = '（服务端错误）';
  var body = String(bodyText || '');
  if (/^\s*</.test(body) && /<html|<!doctype/i.test(body)) body = '（返回的是网页而不是 JSON，Base URL 可能填错）';
  return 'HTTP ' + status + hint + (body ? '\n' + body.slice(0, 220) : '');
}

/* 从各种形态的错误体里挖出可读文字 */
function extractApiErrorMessage(json){
  if (!json || typeof json !== 'object') return '';
  var e = json.error;
  if (typeof e === 'string' && e) return e;
  if (e && typeof e === 'object') {
    var m = e.message || e.msg || e.detail || e.error || '';
    if (m && typeof m === 'object') { try { m = JSON.stringify(m); } catch(_){ m = ''; } }
    return String(m || e.type || e.code || '');
  }
  if (Array.isArray(json.detail) && json.detail.length) { try { return JSON.stringify(json.detail[0]); } catch(_){} }
  if (typeof json.detail === 'string' && json.detail && !json.choices) return json.detail;
  if ((json.code != null && json.code !== 0 && json.code !== 200 && json.code !== '0' && json.code !== '200') && (json.msg || json.message) && !json.choices) return String(json.msg || json.message);
  if (json.success === false && (json.msg || json.message)) return String(json.msg || json.message);
  return '';
}

/* ───────────── 响应文本抽取（多种格式） ───────────── */

function contentToText(c){
  if (c == null) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map(function(p){
      if (typeof p === 'string') return p;
      if (!p || typeof p !== 'object') return '';
      if (p.type === 'reasoning' || p.type === 'thinking' || p.type === 'redacted_thinking' || p.thought === true) return '';
      if (typeof p.text === 'string') return p.text;
      if (p.text && typeof p.text.value === 'string') return p.text.value;
      if (p.content != null) return contentToText(p.content);
      return '';
    }).join('');
  }
  if (typeof c === 'object') {
    if (typeof c.text === 'string') return c.text;
    if (c.content != null) return contentToText(c.content);
  }
  return '';
}

function stripThinkTags(text){
  text = String(text || '');
  if (!/<\/think(?:ing)?>/i.test(text)) return text;
  if (/<think(?:ing)?>/i.test(text)) return text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
  /* 只剩收尾标签（中转站把开头标签吃掉了）：取最后一个收尾标签之后的内容 */
  var idx = text.search(/<\/think(?:ing)?>(?![\s\S]*<\/think(?:ing)?>)/i);
  return idx >= 0 ? text.slice(idx).replace(/^<\/think(?:ing)?>/i, '').trim() : text;
}

/* 返回 { text, reasoning }，覆盖 OpenAI / Claude / Gemini / Responses / Ollama 等 */
function extractCompletionText(json){
  var out = { text: '', reasoning: '' };
  if (!json || typeof json !== 'object') return out;
  if (json.data && typeof json.data === 'object' && !Array.isArray(json.data) && !json.choices) return extractCompletionText(json.data);
  var ch = Array.isArray(json.choices) ? json.choices[0] : null;
  if (ch) {
    var msg = ch.message || ch.delta || {};
    out.text = contentToText(msg.content);
    if (!out.text && typeof ch.text === 'string') out.text = ch.text;
    out.reasoning = contentToText(msg.reasoning_content || msg.reasoning || msg.reasoning_details || '');
    return out;
  }
  if (Array.isArray(json.content)) {            /* Anthropic Messages */
    json.content.forEach(function(b){
      if (!b) return;
      if (b.type === 'text' && typeof b.text === 'string') out.text += b.text;
      else if (b.type === 'thinking' && typeof b.thinking === 'string') out.reasoning += b.thinking;
    });
    return out;
  }
  if (Array.isArray(json.candidates) && json.candidates[0]) {   /* Gemini 原生 */
    var parts = (json.candidates[0].content && json.candidates[0].content.parts) || [];
    parts.forEach(function(p){ if (p && typeof p.text === 'string') { if (p.thought) out.reasoning += p.text; else out.text += p.text; } });
    return out;
  }
  if (typeof json.output_text === 'string') { out.text = json.output_text; return out; }
  if (Array.isArray(json.output)) {             /* OpenAI Responses */
    json.output.forEach(function(item){
      if (!item) return;
      if (item.type === 'message') out.text += contentToText(item.content);
      else if (item.type === 'reasoning') out.reasoning += contentToText(item.summary || item.content);
    });
    return out;
  }
  if (json.message && json.message.content != null) { out.text = contentToText(json.message.content); return out; }   /* Ollama chat */
  if (typeof json.response === 'string') { out.text = json.response; return out; }                                 /* Ollama generate */
  if (typeof json.text === 'string') { out.text = json.text; return out; }
  return out;
}

/* ───────────── SSE 累加器（流式与“非流式却返回 SSE”共用） ───────────── */

function createStreamAccumulator(onProgress){
  var acc = { text: '', reasoning: '', events: 0, error: '', done: false };
  function push(t, r){
    if (t) acc.text += t;
    if (r) acc.reasoning += r;
    if ((t || r) && onProgress) { try { onProgress(acc.text, t || '', acc); } catch(_){} }
  }
  function applyEvent(j){
    if (!j || typeof j !== 'object') return;
    acc.events++;
    var err = extractApiErrorMessage(j);
    if (err && !Array.isArray(j.choices)) { acc.error = err; return; }
    var type = String(j.type || '');
    if (type === 'content_block_delta' && j.delta) {                 /* Anthropic */
      if (j.delta.type === 'thinking_delta') push('', j.delta.thinking || '');
      else push(j.delta.text || '', '');
      return;
    }
    if (type === 'error') { acc.error = extractApiErrorMessage(j) || 'stream error'; return; }
    if (type === 'message_stop') { acc.done = true; return; }
    if (type === 'response.output_text.delta') { push(typeof j.delta === 'string' ? j.delta : '', ''); return; }   /* Responses */
    if (type === 'response.reasoning_summary_text.delta') { push('', typeof j.delta === 'string' ? j.delta : ''); return; }
    if (type === 'response.failed') { acc.error = extractApiErrorMessage(j.response || j) || 'response failed'; return; }
    if (type === 'response.completed') { acc.done = true; return; }
    if (type.indexOf('response.') === 0) return;
    var ch = Array.isArray(j.choices) ? j.choices[0] : null;
    if (ch) {
      if (ch.delta) {
        push(contentToText(ch.delta.content) || (typeof ch.text === 'string' ? ch.text : ''), contentToText(ch.delta.reasoning_content || ch.delta.reasoning || ''));
      } else if (ch.message) {                                       /* 个别中转站流里直接塞完整 message：整体替换 */
        var full = extractCompletionText(j);
        if (!acc.text && full.text) push(full.text, '');
        if (!acc.reasoning && full.reasoning) acc.reasoning = full.reasoning;
      } else if (typeof ch.text === 'string') push(ch.text, '');
      if (ch.finish_reason) acc.done = true;
      return;
    }
    var other = extractCompletionText(j);                            /* Gemini / Ollama 等 */
    push(other.text, other.reasoning);
    if (j.done === true) acc.done = true;
  }
  function feedLine(line){
    line = String(line || '');
    if (!line || line.charAt(0) === ':') return;                     /* 空行 / SSE 注释（心跳） */
    var data;
    if (/^data:/i.test(line)) data = line.replace(/^data:\s?/i, '');
    else if (/^(?:event|id|retry):/i.test(line)) return;
    else if (line.charAt(0) === '{') data = line;                    /* NDJSON */
    else return;
    data = data.replace(/^\s+|\s+$/g, '');
    if (!data) return;
    if (data === '[DONE]') { acc.done = true; return; }
    var j; try { j = JSON.parse(data); } catch(_){ return; }
    applyEvent(j);
  }
  return { acc: acc, feedLine: feedLine };
}

/* 整段文本解析：先当 JSON，再当 SSE；统一产出 {text, reasoning} 或抛 ApiError */
function parseCompletionResponse(text, onProgress){
  var body = String(text || '').replace(/^\ufeff/, '');
  var trimmed = body.replace(/^\s+/, '');
  if (/^</.test(trimmed) && /<html|<!doctype/i.test(trimmed.slice(0, 400))) {
    throw ApiError('parse', '接口返回的是网页而不是 JSON：Base URL 很可能填错了（多数中转站需要以 /v1 结尾）\n' + trimmed.slice(0, 120).replace(/\s+/g, ' '));
  }
  if (/^(?:data:|event:|:)/i.test(trimmed)) {                        /* 非流式请求却返回了 SSE */
    var sa = createStreamAccumulator(onProgress);
    trimmed.split(/\r?\n/).forEach(sa.feedLine);
    if (sa.acc.error && !sa.acc.text) throw ApiError('api', 'API 返回错误：' + sa.acc.error);
    return { text: sa.acc.text, reasoning: sa.acc.reasoning };
  }
  var json;
  try { json = JSON.parse(trimmed); }
  catch(e){
    /* 多段 JSON 行（NDJSON）兜底 */
    if (/^\{/.test(trimmed) && /\n\s*\{/.test(trimmed)) {
      var sb = createStreamAccumulator(onProgress);
      trimmed.split(/\r?\n/).forEach(sb.feedLine);
      if (sb.acc.text || sb.acc.reasoning) return { text: sb.acc.text, reasoning: sb.acc.reasoning };
    }
    throw ApiError('parse', '响应不是合法的 JSON\n' + trimmed.slice(0, 200));
  }
  var out = extractCompletionText(json);
  if (!out.text && !out.reasoning) {
    var err = extractApiErrorMessage(json);
    if (err) throw ApiError('api', 'API 返回错误：' + err.slice(0, 260), err);
  }
  return out;
}

/* ───────────── 消息降级（兼容严格的中转站/模型） ───────────── */

function flattenMessageContent(c, keepImagePlaceholder){
  if (!Array.isArray(c)) return c;
  var parts = [];
  c.forEach(function(p){
    if (!p) return;
    if (typeof p === 'string') { parts.push(p); return; }
    if (p.type === 'text' && typeof p.text === 'string') parts.push(p.text);
    else if (p.type === 'image_url' || p.type === 'image') { if (keepImagePlaceholder) parts.push('[图片]'); }
    else if (typeof p.text === 'string') parts.push(p.text);
  });
  return parts.join('\n');
}

function messagesHaveImages(messages){
  return (messages || []).some(function(m){
    return m && Array.isArray(m.content) && m.content.some(function(p){ return p && (p.type === 'image_url' || p.type === 'image'); });
  });
}

function messagesHaveArrayContent(messages){
  return (messages || []).some(function(m){ return m && Array.isArray(m.content); });
}

function transformMessagesForCompat(messages, st){
  var list = (messages || []).map(function(m){ return Object.assign({}, m); });
  if (st.flatImages || st.flatContent) {
    list.forEach(function(m){ if (Array.isArray(m.content)) m.content = flattenMessageContent(m.content, true); });
  }
  if (st.flatSystem) {
    var sys = [], rest = [];
    list.forEach(function(m){
      if (m.role === 'system' || m.role === 'developer') sys.push(contentToText(m.content));
      else rest.push(m);
    });
    if (sys.length) {
      var head = sys.join('\n\n');
      var firstUser = -1;
      for (var i = 0; i < rest.length; i++) if (rest[i].role === 'user') { firstUser = i; break; }
      if (firstUser >= 0) {
        var fc = rest[firstUser].content;
        if (Array.isArray(fc)) rest[firstUser].content = [{ type: 'text', text: head + '\n\n' }].concat(fc);
        else rest[firstUser].content = head + '\n\n' + String(fc || '');
      } else rest.unshift({ role: 'user', content: head });
    }
    list = rest;
  }
  if (st.strictRoles) {
    var merged = [];
    list.forEach(function(m){
      var last = merged[merged.length - 1];
      if (last && last.role === m.role && m.role !== 'system' && typeof last.content === 'string' && typeof m.content === 'string') last.content += '\n\n' + m.content;
      else merged.push(m);
    });
    var firstNonSys = -1;
    for (var k = 0; k < merged.length; k++) if (merged[k].role !== 'system') { firstNonSys = k; break; }
    if (firstNonSys >= 0 && merged[firstNonSys].role === 'assistant') merged.splice(firstNonSys, 0, { role: 'user', content: '（继续）' });
    list = merged;
  }
  return list;
}

/* ───────────── 请求主流程 ───────────── */

/* 自动重试开关（设置 → AI 接口），默认关闭；只管 429/502/503/504/网络错误的整体重发 */
function isAutoRetryEnabled(){ try { return !!(State && State.settings && State.settings.autoRetry === true); } catch(_){ return false; } }

function sleepMs(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

function buildApiHeaders(cfg, stream){
  var h = { 'Content-Type': 'application/json', 'Accept': stream ? 'text/event-stream, application/json' : 'application/json' };
  var key = cleanApiKey(cfg.apiKey);
  if (key) h['Authorization'] = 'Bearer ' + key;
  return h;
}

function buildApiBody(cfg, messages, st){
  var body = { model: String(cfg.model || '').trim(), messages: transformMessagesForCompat(messages, st), stream: !!st.stream };
  if (!st.noTemp && typeof cfg.temperature === 'number' && !isNaN(cfg.temperature)) body.temperature = cfg.temperature;
  if (typeof cfg.maxTokens === 'number' && cfg.maxTokens > 0) body[st.tokenParam] = cfg.maxTokens;
  return body;
}

/* 读取流式响应：逐块解析 SSE，返回 {text, reasoning} */
function readCompletionStream(res, opts){
  opts = opts || {};
  var sa = createStreamAccumulator(opts.onProgress);
  if (!res.body || typeof res.body.getReader !== 'function') {
    return res.text().then(function(t){ return parseCompletionResponse(t, opts.onProgress); });
  }
  return new Promise(function(resolve, reject){
    var reader = res.body.getReader();
    var decoder = (typeof TextDecoder === 'function') ? new TextDecoder('utf-8') : null;
    var buf = '', raw = '', finished = false, idleTimer = null;
    var IDLE_MS = 120000;
    function armIdle(){
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function(){
        if (finished) return;
        try { if (opts.abort) opts.abort(); } catch(_){}
        fail(ApiError('timeout', '流式输出长时间没有数据（' + Math.round(IDLE_MS / 1000) + ' 秒），连接已中断'));
      }, IDLE_MS);
    }
    function finish(){
      if (finished) return; finished = true; clearTimeout(idleTimer);
      if (buf) { buf.split(/\r?\n/).forEach(sa.feedLine); buf = ''; }
      if (sa.acc.events === 0 && raw) {            /* 没有任何 SSE 事件：可能是普通 JSON */
        try { resolve(parseCompletionResponse(raw, opts.onProgress)); } catch(e){ reject(e); }
        return;
      }
      if (sa.acc.error && !sa.acc.text) { reject(ApiError('api', 'API 返回错误：' + sa.acc.error.slice(0, 260))); return; }
      resolve({ text: sa.acc.text, reasoning: sa.acc.reasoning });
    }
    function fail(err){
      if (finished) return; finished = true; clearTimeout(idleTimer);
      try { reader.cancel(); } catch(_){}
      if (sa.acc.text) {                            /* 已收到内容：返回已有部分，避免整条回复白费 */
        console.warn('[岛屿] 流式输出中途中断，保留已收到的内容：', err && err.message);
        resolve({ text: sa.acc.text, reasoning: sa.acc.reasoning, partial: true });
      } else reject(err && err.kind ? err : ApiError('network', '流式读取失败：' + (err && err.message ? err.message : '连接中断')));
    }
    function pump(){
      armIdle();
      reader.read().then(function(r){
        if (r.done) { finish(); return; }
        var chunk = decoder ? decoder.decode(r.value, { stream: true }) : String.fromCharCode.apply(null, r.value);
        if (sa.acc.events === 0 && raw.length < 2000000) raw += chunk;
        buf += chunk;
        var lines = buf.split(/\r?\n/);
        buf = lines.pop();
        lines.forEach(sa.feedLine);
        if (sa.acc.done && sa.acc.events > 0 && !buf) { /* 收到结束标记后仍等待连接关闭，部分中转站不会立刻断开 */ }
        pump();
      }).catch(fail);
    }
    pump();
  });
}

function callApiOnce(messages, overrideCfg, opts){
  var cfg = overrideCfg || getApiConfig();
  opts = opts || {};
  var url = normalizeBaseUrl(cfg.baseUrl);
  if (!url) return Promise.reject(ApiError('config', '未填写 Base URL'));
  if (!String(cfg.model || '').trim()) return Promise.reject(ApiError('config', '未填写模型名称'));
  var st = {
    stream: !!cfg.stream && !opts.forceNonStream,
    tokenParam: 'max_tokens', noTemp: false,
    flatSystem: false, flatImages: false, flatContent: false, strictRoles: false,
    transientRetries: 0, attempts: 0
  };
  /* 记住上一次成功的降级方案，避免每条消息都白白 400 一次 */
  var memoKey = url + '|' + String(cfg.model || '');
  var memo = (callApiOnce._memo || (callApiOnce._memo = {}))[memoKey];
  if (memo) Object.keys(memo).forEach(function(k){ if (k !== 'stream') st[k] = memo[k]; });
  if (memo && memo.stream === false && st.stream) st.stream = false;

  function remember(){
    callApiOnce._memo[memoKey] = {
      tokenParam: st.tokenParam, noTemp: st.noTemp, flatSystem: st.flatSystem,
      flatImages: st.flatImages, flatContent: st.flatContent, strictRoles: st.strictRoles,
      stream: (cfg.stream && !st.stream) ? false : undefined
    };
  }

  function attempt(){
    st.attempts++;
    var body = buildApiBody(cfg, messages, st);
    var controller = (typeof AbortController === 'function') ? new AbortController() : null;
    if (opts.signal && controller) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', function(){ controller.abort(); });
    }
    return fetch(url, {
      method: 'POST',
      headers: buildApiHeaders(cfg, st.stream),
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    }).then(function(res){
      if (!res.ok) {
        return res.text().then(function(text){
          throw ApiError('http', httpErrorText(res.status, text), text, res.status);
        });
      }
      if (st.stream) {
        return readCompletionStream(res, { onProgress: opts.onProgress, abort: function(){ if (controller) controller.abort(); } });
      }
      return res.text().then(function(text){ return parseCompletionResponse(text, opts.onProgress); });
    }).then(function(out){
      remember();
      var text = stripThinkTags(out.text);
      if (!String(text || '').trim() && out.reasoning) text = out.reasoning;
      return text || '';
    });
  }

  /* 根据错误内容决定如何降级；返回 true 表示已调整、应重试 */
  function adapt(err){
    if (!err || err.kind !== 'http') return false;
    var s = err.status || 0;
    var msg = (String(err.detail || '') + ' ' + String(err.message || '')).toLowerCase();
    var isParamErr = (s === 400 || s === 404 || s === 422 || s === 500 || s === 501 || s === 503 || s === 502);
    if (!isParamErr) return false;

    if (!st.stream && /stream/.test(msg) && /(must|required|only|need|true|support)/.test(msg) && !/(not support|unsupported|does not support)/.test(msg) && (s === 400 || s === 422)) {
      st.stream = true; return true;                                  /* 中转站强制要求流式 */
    }
    if (st.stream && /stream/.test(msg) && /(not support|unsupported|does not support|invalid|not allowed|disabled)/.test(msg)) {
      st.stream = false; return true;                                 /* 中转站不支持流式 */
    }
    if (st.tokenParam === 'max_tokens' && /max_tokens/.test(msg) && /(max_completion_tokens|not supported|unsupported|unknown|invalid)/.test(msg)) {
      st.tokenParam = 'max_completion_tokens'; return true;
    }
    if (st.tokenParam === 'max_completion_tokens' && /max_completion_tokens/.test(msg) && /(unknown|unsupported|not supported|unrecognized|invalid)/.test(msg)) {
      st.tokenParam = 'max_tokens'; return true;
    }
    if (!st.noTemp && /temperature/.test(msg) && /(unsupported|not support|does not support|only|default|invalid|deprecated|not allowed)/.test(msg)) {
      st.noTemp = true; return true;
    }
    if (!st.flatSystem && /(system|developer)/.test(msg) && /(role|message|instruction|prompt)/.test(msg) && /(not support|unsupported|not enabled|not allowed|invalid|only|must|does not)/.test(msg)) {
      st.flatSystem = true; return true;
    }
    if (!st.strictRoles && /(alternat|must be.*(user|assistant)|first message|roles? must|consecutive)/.test(msg)) {
      st.strictRoles = true; return true;
    }
    if (!st.flatImages && messagesHaveImages(messages) && /(image|vision|multimodal|multi-modal|image_url|visual)/.test(msg)) {
      st.flatImages = true; return true;
    }
    if (!st.flatContent && messagesHaveArrayContent(messages) && /content/.test(msg) && /string/.test(msg)) {
      st.flatContent = true; return true;
    }
    return false;
  }

  function run(){
    return attempt().catch(function(err){
      if (!err || !err.kind) {
        var name = err && err.name;
        if (name === 'AbortError') throw ApiError('abort', '请求已取消');
        err = ApiError('network', '网络请求失败：' + (err && err.message ? err.message : '未知错误') + (/failed to fetch|load failed|networkerror/i.test(String(err && err.message)) ? '\n可能原因：地址无法访问、中转站未开放跨域(CORS)、或网络被拦截' : ''));
        err.transient = true;
      }
      if (st.attempts < 5 && adapt(err)) return run();
      var status = err.status || 0;
      var transient = err.transient || status === 429 || status === 502 || status === 503 || status === 504;
      if (transient && isAutoRetryEnabled() && st.transientRetries < 1 && !(opts.signal && opts.signal.aborted)) {
        st.transientRetries++;
        return sleepMs(status === 429 ? 2500 : 1200).then(run);
      }
      throw err;
    });
  }
  return run();
}

/* ───────────── 识图（独立 API：把表情包 / 图片转成文字描述） ───────────── */

var DEFAULT_VISION_PROMPT_IMAGE = '请用简体中文客观描述这张图片：主体、场景、人物的动作与神态、图中出现的文字（逐字转写）。控制在 150 字以内，不要评价，不要添加图中没有的信息。';
var DEFAULT_VISION_PROMPT_STICKER = '这是聊天里的表情包。请用简体中文简洁描述：画面主体（人物/动物/卡通形象）、表情与动作、图中出现的文字（逐字转写），并用一句话概括它想表达的情绪或用意。控制在 100 字以内，不要添加图中没有的信息。';

var _visionJobs = {};      /* key -> Promise<string> */
var _visionTexts = {};     /* key -> 识别结果缓存（同一张图只识别一次） */
var _visionFails = {};     /* key -> 失败时间戳，冷却 60 秒再重试 */

function visionHashString(s){
  s = String(s || ''); var h = 5381;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36) + '_' + s.length;
}

function visionKeyForMessage(m){ return (m.type === 'sticker' ? 's:' : 'i:') + visionHashString(m.url); }

function visionScopeAllows(type){
  var scope = getVisionConfig().scope || 'all';
  if (scope === 'all') return type === 'image' || type === 'sticker';
  if (scope === 'sticker') return type === 'sticker';
  if (scope === 'image') return type === 'image';
  return false;
}

function visionMessageEligible(m){
  return !!(m && (m.type === 'image' || m.type === 'sticker') && /^(?:data:image\/|https?:\/\/)/i.test(String(m.url || '')) && visionScopeAllows(m.type));
}

function findStickerNameByUrl(url){
  try {
    var groups = (State.stickers && State.stickers.groups) || [];
    for (var i = 0; i < groups.length; i++) {
      var items = groups[i].stickers || [];
      for (var j = 0; j < items.length; j++) if (items[j].url === url && items[j].name) return String(items[j].name).trim();
    }
  } catch(_){}
  return '';
}

/* 把图片缩放成不超过 maxEdge 的 JPEG data URL；失败（跨域污染等）则退回原链接 */
function loadImageForVision(url, maxEdge){
  maxEdge = maxEdge || 1024;
  return new Promise(function(resolve){
    var done = false;
    function finish(v){ if (done) return; done = true; clearTimeout(timer); resolve(v); }
    var timer = setTimeout(function(){ finish(url); }, 15000);
    /* 体积不大且不是 svg/gif 的 data URL 直接用，省一次转码 */
    if (/^data:image\/(?:png|jpe?g|webp)/i.test(url) && url.length < 180000) { finish(url); return; }
    var img = new Image();
    try { img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; } catch(_){}
    img.onload = function(){
      try {
        var w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
        if (!w0 || !h0) { finish(url); return; }
        var scale = Math.min(1, maxEdge / Math.max(w0, h0));
        var w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
        var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        if (!ctx) { finish(url); return; }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        finish(canvas.toDataURL('image/jpeg', 0.85) || url);
      } catch(e){ finish(url); }
    };
    img.onerror = function(){ finish(url); };
    img.src = url;
  });
}

function buildVisionConfig(cfg){
  return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, temperature: 0.2, maxTokens: (cfg.maxTokens && cfg.maxTokens > 0) ? cfg.maxTokens : 500, stream: false };
}

/* 对一张图（data URL 或 http 链接）发起识别，返回文字描述 */
function describeImageWithVision(imageUrl, kind, hint, cfgOverride){
  var cfg = cfgOverride || getVisionConfig();
  var custom = String(cfg.prompt || '').trim();
  var prompt = custom || (kind === 'sticker' ? DEFAULT_VISION_PROMPT_STICKER : DEFAULT_VISION_PROMPT_IMAGE);
  if (hint) prompt += '\n（用户给这个表情包起的名字是「' + hint + '」，仅供参考，请以画面为准。）';
  return loadImageForVision(imageUrl, 1024).then(function(finalUrl){
    var messages = [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: finalUrl } }
    ] }];
    return callApiOnce(messages, buildVisionConfig(cfg));
  }).then(function(text){
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) throw ApiError('parse', '识图模型返回为空');
    return text.slice(0, 600);
  });
}

/* 确保某条消息已有识别结果；同一张图并发只发一次请求 */
function ensureVisionForMessage(m){
  if (!visionMessageEligible(m)) return Promise.resolve('');
  if (m.visionText) { _visionTexts[visionKeyForMessage(m)] = m.visionText; return Promise.resolve(m.visionText); }
  var key = visionKeyForMessage(m);
  if (_visionTexts[key]) { m.visionText = _visionTexts[key]; return Promise.resolve(m.visionText); }
  if (_visionFails[key] && Date.now() - _visionFails[key] < 60000) return Promise.resolve('');
  if (_visionJobs[key]) return _visionJobs[key].then(function(t){ if (t) m.visionText = t; return t; });
  var kind = m.type === 'sticker' ? 'sticker' : 'image';
  var job = describeImageWithVision(m.url, kind, kind === 'sticker' ? findStickerNameByUrl(m.url) : '').then(function(text){
    _visionTexts[key] = text; delete _visionFails[key]; return text;
  }).catch(function(err){
    _visionFails[key] = Date.now();
    console.warn('[岛屿] 识图失败：', err && err.message);
    return '';
  }).then(function(t){ delete _visionJobs[key]; return t; });
  _visionJobs[key] = job;
  return job.then(function(t){ if (t) { m.visionText = t; m.visionAt = Date.now(); m.visionModel = getVisionConfig().model; } return t; });
}

/* 发送后立刻在后台识别（预热），回复时通常已经就绪 */
function visionPrewarm(chatName, msg){
  if (!isVisionReady() || !visionMessageEligible(msg)) return;
  ensureVisionForMessage(msg).then(function(t){
    if (t && typeof saveMessages === 'function') { try { saveMessages(chatName); } catch(_){} }
  });
}

/* 回复前：把最近 contextDepth 条里尚未识别的图片 / 表情包全部识别好（最多等 40 秒，永不 reject） */
function prepareVisionForContext(name){
  try {
    if (!isVisionReady()) return Promise.resolve();
    var list = (typeof MESSAGES !== 'undefined' && MESSAGES[name]) || [];
    var depth = 40;
    try { depth = getMemorySettings().contextDepth || 40; } catch(_){}
    var slice = list.slice(Math.max(0, list.length - depth));
    var targets = slice.filter(function(m){ return visionMessageEligible(m) && !m.visionText; });
    slice.forEach(function(m){ if (m && m.visionText && m.url) _visionTexts[visionKeyForMessage(m)] = m.visionText; });
    if (!targets.length) return Promise.resolve();
    targets = targets.slice(-8);
    var work = Promise.all(targets.map(function(m){ return ensureVisionForMessage(m); })).then(function(){
      if (typeof saveMessages === 'function') { try { saveMessages(name); } catch(_){} }
    });
    var cap = new Promise(function(resolve){ setTimeout(resolve, 40000); });
    return Promise.race([work, cap]).catch(function(){});
  } catch(e){ return Promise.resolve(); }
}
