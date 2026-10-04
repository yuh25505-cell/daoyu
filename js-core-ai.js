/* 岛屿 · AI 请求底层（URL 规范化、ApiError、callApiOnce）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function normalizeBaseUrl(url){
  url = String(url || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/\/chat\/completions$/i.test(url)) return url;
  if (/\/v\d+[a-z]*$/i.test(url)) return url + '/chat/completions';
  return url + '/v1/chat/completions';
}

function normalizeModelsUrl(url){
  url = String(url || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/\/models$/i.test(url)) return url;
  if (/\/chat\/completions$/i.test(url)) url = url.replace(/\/chat\/completions$/i, '');
  if (/\/v\d+[a-z]*$/i.test(url)) return url + '/models';
  return url + '/v1/models';
}

function previewEndpoint(url){ return normalizeBaseUrl(url) || '—'; }

function normalizeTranscriptionsUrl(url){
  url = String(url || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/\/audio\/transcriptions$/i.test(url)) return url;
  if (/\/v\d+[a-z]*$/i.test(url)) return url + '/audio/transcriptions';
  if (/\/models$/i.test(url)) url = url.replace(/\/models$/i, '');
  return url + '/v1/audio/transcriptions';
}

function previewTranscriptionsEndpoint(url){ return normalizeTranscriptionsUrl(url) || '—'; }


function ApiError(kind, message, detail){
  var e = new Error(message); e.kind = kind; e.detail = detail || ''; return e;
}

function httpErrorText(status, bodyText){
  var hint = '';
  if (status === 401) hint = '（API Key 无效或未授权）';
  else if (status === 403) hint = '（无权限访问该模型）';
  else if (status === 404) hint = '（接口地址或模型不存在）';
  else if (status === 429) hint = '（请求太频繁或余额不足）';
  else if (status >= 500) hint = '（服务端错误）';
  return 'HTTP ' + status + hint + (bodyText ? '\n' + bodyText.slice(0, 220) : '');
}

function callApiOnce(messages, overrideCfg){
  var cfg = overrideCfg || getApiConfig();
  var url = normalizeBaseUrl(cfg.baseUrl);
  if (!url) return Promise.reject(ApiError('config', '未填写 Base URL'));
  var body = { model: cfg.model, messages: messages, stream: false };
  if (typeof cfg.temperature === 'number' && !isNaN(cfg.temperature)) body.temperature = cfg.temperature;
  if (typeof cfg.maxTokens === 'number' && cfg.maxTokens > 0) body.max_tokens = cfg.maxTokens;

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
    body: JSON.stringify(body)
  }).then(function(res){
    return res.text().then(function(text){
      if (!res.ok) throw ApiError('http', httpErrorText(res.status, text));
      var json;
      try { json = JSON.parse(text); } catch(e){ throw ApiError('parse', '响应不是合法的 JSON\n' + text.slice(0, 200)); }
      var content = '';
      try { content = json.choices[0].message.content || ''; } catch(e){}
      if (!content) { try { content = json.choices[0].message.reasoning_content || ''; } catch(e){} }
      return content;
    });
  }).catch(function(err){
    if (err && err.kind) throw err;
    throw ApiError('network', '网络请求失败：' + (err && err.message ? err.message : '未知错误'));
  });
}
