/* 岛屿 · 默认配置、全局状态、API/STT 配置规范化、设置持久化与 loadState
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var DEFAULT_API = {
  enabled: false, baseUrl: '', apiKey: '', model: '',
  temperature: 0.85, maxTokens: 0, stream: false
};

var DEFAULT_MINIMAX_VOICE = { region:'cn', groupId:'', apiKey:'', model:'' };
var DEFAULT_STT = {
  enabled: false, baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini-transcribe', language: 'auto', prompt: ''
};

/* 识图 API：把私聊里的表情包 / 图片先转成文字描述，再交给聊天主模型 */
var DEFAULT_VISION = {
  enabled: false, baseUrl: '', apiKey: '', model: '', scope: 'all', prompt: '', maxTokens: 0
};

var HOME_APP_NAMES = ['聊天','屿年','相册','日历','备忘录','天气','时钟','设置','电话','倒数日','世界书','音乐',
  /* 第二页桌面 */ '相遇','关联账号','论坛','文学城','情侣空间','预设','番外笺','美团','栖迟'];

/* 每个图标主题各自保存一组调节值：切换主题时，数值会换成该主题自己的那一组（与「锁定」无关）。
 * 「锁定」只负责防止上下滑动时误触拉条，不参与主题切换。 */
var ICON_THEMES = ['default','borderless'];
var ICON_SLIDER_RANGES = { iconRadius:[0,50] };
var ICON_THEME_DEFAULTS = {
  'default':  {},
  borderless: { iconRadius: 9 }
};
/* 该主题下哪些拉条是它「专属」的（其余主题里不显示，也不保存） */
var ICON_THEME_KEYS = {
  'default': [],
  borderless: ['iconRadius']
};

var DEFAULT_HOME_APPEARANCE = {
  iconTheme: 'default', iconRadius: 26, iconRadiusLocked: false, islandScale: 100, labelSize: 11, labelColor: '#ffffff', dockNoBackground: false, iconLabels: true, iconBorder: 'transparent', dimDarkWallpaper: true,
  iconData: {},
  dimDarkWallpaperAmount: 42, dimDarkIconAmount: 42, dimDarkWallpaperLocked: false, dimDarkIconLocked: false,
  dockRadius: 40, dockTransparency: 0, dockBlur: 16, dockRadiusLocked: false, dockTransparencyLocked: false, dockBlurLocked: false,
  wallpaper: 'mono', wallpaperData: '', calendarPhoto: '', musicCover: '', polaroidPhoto: '', polaroidCaption: '⌯>ᴗ<⌯ಣ', photo2Photo: '', weather2Bg: '', ins2Time: false, insR2Time: false, ins2Text: '你收到一条新的 ins 消息', insR2Text: '好呀，晚点聊',
  widgets: {
    /* bgStyle：default＝原来的深色/浅色卡片（默认）；glass＝毛玻璃。glassBlur 模糊度 0–40px；glassTransparency 透明度 0–100%（越大越透） */
    calendar: { enabled: true, size: 'large', bgStyle: 'default', glassBlur: 20, glassTransparency: 40 },
    music: { enabled: true, size: 'medium', bgStyle: 'default', glassBlur: 20, glassTransparency: 40, controlColor: 'auto' },
    polaroid: { enabled: true, size: 'medium', bgStyle: 'default', glassBlur: 20, glassTransparency: 40, paper: 'white' },
    /* 第二页桌面组件：只有开关 */
    photo2: { enabled: true, size: 'medium' },
    weather2: { enabled: true, size: 'medium' },
    ins2: { enabled: true, size: 'medium' }
  }
};

var DEFAULT_SETTINGS = {
  theme: 'system', chatAppearance: 'mono', notifications: { enabled: false, minInterval: 60, maxInterval: 240, quietStart: '23:00', quietEnd: '08:00', lastProactiveAt: 0, nextProactiveAt: 0, running: false }, api: clone(DEFAULT_API), apiPresets: [], activeApiPresetId: '', apiQuickKeys: {}, secondaryApi: clone(DEFAULT_API), secondaryApiPresets: [], activeSecondaryApiPresetId: '', secondaryApiQuickKeys: {}, stt: clone(DEFAULT_STT), minimaxVoice: clone(DEFAULT_MINIMAX_VOICE), sttPresets: [], activeSttPresetId: '', sttQuickKeys: {}, vision: clone(DEFAULT_VISION), activeVisionPresetId: '', activeVectorEmbeddingPresetId: '', activeVectorRerankPresetId: '', visionQuickKeys: {}, autoRetry: false, activeUserPersonaId: '',
  homeAppearance: clone(DEFAULT_HOME_APPEARANCE),
  sounds: { volume: 80, message: null, call: null },
  memory: { contextDepth: 40, summaryThreshold: 20 },
  vectorMemory: { embeddingApi: { baseUrl:'', apiKey:'', model:'' }, rerankApi: { baseUrl:'', apiKey:'', model:'' }, topK:8, candidateK:24, similarityThreshold:0.18 },
  font: { activeId: '', items: [] }
};



var PRESETS = {
  openai: { baseUrl:'https://api.openai.com/v1', model:'gpt-4o-mini' },
  deepseek: { baseUrl:'https://api.deepseek.com/v1', model:'deepseek-chat' },
  kimi: { baseUrl:'https://api.moonshot.cn/v1', model:'moonshot-v1-8k' },
  zhipu: { baseUrl:'https://open.bigmodel.cn/api/paas/v4', model:'glm-4-flash' },
  silicon: { baseUrl:'https://api.siliconflow.cn/v1', model:'Qwen/Qwen2.5-7B-Instruct' },
  openrouter: { baseUrl:'https://openrouter.ai/api/v1', model:'openai/gpt-4o-mini' },
  custom: { baseUrl:'', model:'' }
};



var islandStateHydrated = false;

var State = {
  settings: {}, chats: [], contacts: [], moments: [],
  messages: {}, phoneCalls: [], personas: [], userPersonas: [], worldbooks: [],
  stickers: { activeGroupId: '', groups: [] },
  memory: {}
};

var CHATS = State.chats;

var CONTACTS = State.contacts;

var MOMENTS = State.moments;

var MESSAGES = State.messages;

/* 每个会话只缓存最近页与用户已翻阅的页；完整历史保存在消息分表中。 */
var CHAT_MESSAGE_STORE_STATE = Object.create(null);
var CHAT_MESSAGE_LOAD_PROMISES = Object.create(null);
var CHAT_LATEST_MESSAGE_CACHE = Object.create(null);
var CHAT_RECENT_PAGE_SIZE = 300;
var CHAT_MESSAGE_WINDOW_MAX = 800;

function chatMessageStoreSignature(value){
  var hash = 2166136261;
  function mix(text){ text = String(text); for (var i=0;i<text.length;i++){ hash ^= text.charCodeAt(i); hash = Math.imul(hash,16777619); } hash ^= 124; hash = Math.imul(hash,16777619); }
  function walk(v){
    if (v === null || v === undefined) { mix(String(v)); return; }
    if (typeof Blob !== 'undefined' && v instanceof Blob) { mix('blob:' + v.type + ':' + v.size); return; }
    if (typeof v === 'string') {
      if (/^data:(?:image|audio|video|application|font)\//i.test(v) && v.length > 8192) mix('media:' + v.length + ':' + v.slice(0,80) + ':' + v.slice(-80));
      else mix('string:' + v);
      return;
    }
    if (typeof v !== 'object') { mix(typeof v + ':' + String(v)); return; }
    if (ArrayBuffer.isView(v)) { mix('view:' + v.byteLength); return; }
    if (v instanceof ArrayBuffer) { mix('buffer:' + v.byteLength); return; }
    if (Array.isArray(v)) { mix('array:' + v.length); v.forEach(walk); return; }
    var keys = Object.keys(v).filter(function(k){ return k !== '__islandSeq'; }).sort();
    mix('object:' + keys.join(',')); keys.forEach(function(k){ mix(k); walk(v[k]); });
  }
  walk(value); return (hash >>> 0).toString(36);
}

function attachChatMessageSeq(message, seq){
  if (!message || typeof message !== 'object') message = { text:String(message || '') };
  message.__islandSeq = Number(seq) || 0;
  return message;
}

/* 控制单个会话在内存中的滑动窗口。被移出窗口的行仍在数据库中，不加入删除队列。 */
function trimChatMessageWindow(name, keepSide){
  var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  if (list.length <= CHAT_MESSAGE_WINDOW_MAX) return 0;
  var removeCount = list.length - CHAT_MESSAGE_WINDOW_MAX;
  var removed = keepSide === 'older' ? list.splice(CHAT_MESSAGE_WINDOW_MAX, removeCount) : list.splice(0, removeCount);
  var state = CHAT_MESSAGE_STORE_STATE[name];
  removed.forEach(function(message){
    var seq = Number(message && message.__islandSeq) || 0;
    if (!seq || !state) return;
    delete state.loadedSeqs[String(seq)]; delete state.signatures[String(seq)];
  });
  if (state) {
    if (keepSide === 'older') state.hasNewer = true;
    else state.hasMore = true;
    state.oldestSeq = list.length ? Number(list[0].__islandSeq) || 0 : 0;
    state.newestSeq = list.length ? Number(list[list.length - 1].__islandSeq) || 0 : 0;
  }
  return removed.length;
}

function rememberChatMessagePage(name, page, mode){
  var state = CHAT_MESSAGE_STORE_STATE[name] || (CHAT_MESSAGE_STORE_STATE[name] = { loaded:false, hasMore:false, hasNewer:false, oldestSeq:0, newestSeq:0, globalNewestSeq:0, loadedSeqs:Object.create(null), signatures:Object.create(null), totalCount:0 });
  var rows = Array.isArray(page && page.rows) ? page.rows : [];
  var previousGlobalNewest = Number(state.globalNewestSeq || state.newestSeq) || 0;
  if (mode === 'replace') {
    /* 换窗口不代表删除消息：只跟踪当前缓存窗口内的行，绝不能把先前窗口误判为用户删除。 */
    state.loadedSeqs = Object.create(null);
    state.signatures = Object.create(null);
  }
  rows.forEach(function(message){
    var seq = Number(message && message.__islandSeq) || 0; if (!seq) return;
    state.loadedSeqs[String(seq)] = true;
    state.signatures[String(seq)] = chatMessageStoreSignature(message);
  });
  if (mode === 'prepend' && Array.isArray(MESSAGES[name])) {
    var old = MESSAGES[name];
    var oldSeqs = Object.create(null);
    old.forEach(function(m){ oldSeqs[String(Number(m && m.__islandSeq) || 0)] = true; });
    var fresh = rows.filter(function(m){ return !oldSeqs[String(Number(m && m.__islandSeq) || 0)]; });
    MESSAGES[name] = fresh.concat(old);
  } else if (mode === 'append' && Array.isArray(MESSAGES[name])) {
    var prior = MESSAGES[name], priorSeqs = Object.create(null);
    prior.forEach(function(m){ priorSeqs[String(Number(m && m.__islandSeq) || 0)] = true; });
    MESSAGES[name] = prior.concat(rows.filter(function(m){ return !priorSeqs[String(Number(m && m.__islandSeq) || 0)]; }));
  } else MESSAGES[name] = rows.slice();
  state.loaded = true;
  if (mode === 'prepend') state.hasMore = !!(page && page.hasMore);
  else if (mode === 'append') state.hasNewer = !!(page && page.hasMore);
  else { state.hasMore = !!(page && page.hasMore); state.hasNewer = false; }
  if (Array.isArray(MESSAGES[name]) && MESSAGES[name].length) {
    state.oldestSeq = Number(MESSAGES[name][0].__islandSeq) || 0;
    state.newestSeq = Number(MESSAGES[name][MESSAGES[name].length - 1].__islandSeq) || 0;
  } else { state.oldestSeq = 0; state.newestSeq = 0; }
  var pageNewest = Number(page && page.newestSeq) || 0;
  rows.forEach(function(message){ pageNewest = Math.max(pageNewest, Number(message && message.__islandSeq) || 0); });
  state.globalNewestSeq = mode === 'replace' ? Math.max(pageNewest, state.newestSeq) : Math.max(previousGlobalNewest, pageNewest, state.newestSeq);
  if (page && page.count != null && Number(page.count) >= 0) state.totalCount = Number(page.count);
  return state;
}


function getApiConfig(){ return (State.settings && State.settings.api) || clone(DEFAULT_API); }

function normalizeApiPreset(raw, index){
  var src = raw && typeof raw === 'object' ? raw : {};
  var name = String(src.name || ('预设 ' + (index + 1))).trim().slice(0, 40);
  var temperature = Number(src.temperature);
  if (!Number.isFinite(temperature)) temperature = 0.85;
  temperature = Math.max(0, Math.min(2, temperature));
  var maxTokens = parseInt(src.maxTokens, 10);
  if (!Number.isFinite(maxTokens) || maxTokens < 0) maxTokens = 0;
  return {
    id: String(src.id || genId('api_')),
    name: name || ('预设 ' + (index + 1)),
    enabled: !!src.enabled,
    baseUrl: String(src.baseUrl || '').trim(),
    apiKey: String(src.apiKey || ''),
    model: String(src.model || '').trim(),
    temperature: temperature,
    maxTokens: maxTokens,
    stream: !!src.stream,
    updatedAt: Number(src.updatedAt || Date.now())
  };
}

function normalizeApiPresetState(){
  var raw = State.settings && Array.isArray(State.settings.apiPresets) ? State.settings.apiPresets : [];
  State.settings.apiPresets = raw.map(normalizeApiPreset);
  var quickKeys = State.settings && State.settings.apiQuickKeys && typeof State.settings.apiQuickKeys === 'object'
    ? State.settings.apiQuickKeys : {};
  State.settings.apiQuickKeys = quickKeys;
  Object.keys(PRESETS).forEach(function(key){
    if (key === 'custom' || quickKeys[key]) return;
    var p = PRESETS[key];
    for (var i = 0; i < State.settings.apiPresets.length; i++) {
      var saved = State.settings.apiPresets[i];
      if (saved && saved.baseUrl && p.baseUrl && saved.baseUrl.toLowerCase() === p.baseUrl.toLowerCase() && saved.apiKey) {
        quickKeys[key] = saved.apiKey;
        break;
      }
    }
  });
  mergeLegacyPresetPools();
  /* 共用预设池：六处 API 各自记着自己正在用哪个预设，互不影响；预设被删掉时各自的标记失效 */
  API_PRESET_ACTIVE_KEYS.forEach(function(key){
    var id = String(State.settings[key] || '');
    if (!id || !State.settings.apiPresets.some(function(p){ return p.id === id; })) State.settings[key] = '';
  });
}

/* 六处 API 在设置里记录「当前用哪个预设」的字段（预设池本身只有一个：State.settings.apiPresets） */
var API_PRESET_ACTIVE_KEYS = ['activeApiPresetId', 'activeSecondaryApiPresetId', 'activeSttPresetId', 'activeVisionPresetId', 'activeVectorEmbeddingPresetId', 'activeVectorRerankPresetId'];

/* 兼容旧版：副 API / 语音转文字原来各有一份自己的预设列表，这里一次性并入共用预设池（内容相同的合并，不会丢失，也可重复执行） */
function mergeLegacyPresetPools(){
  var S = State.settings, pool = S.apiPresets;
  function sig(p){ return [String(p.baseUrl || '').toLowerCase(), p.apiKey, p.model].join('\n'); }
  [['secondaryApiPresets', 'activeSecondaryApiPresetId', '副API'], ['sttPresets', 'activeSttPresetId', '语音']].forEach(function(row){
    var list = Array.isArray(S[row[0]]) ? S[row[0]] : [];
    if (!list.length) { S[row[0]] = []; return; }
    var remap = {};
    list.forEach(function(raw){
      var p = normalizeApiPreset(raw, pool.length);
      var same = null;
      for (var i = 0; i < pool.length; i++) { if (pool[i].id === p.id || sig(pool[i]) === sig(p)) { same = pool[i]; break; } }
      if (same) { remap[p.id] = same.id; return; }
      var clash = pool.some(function(q){ return q.name === p.name; });
      if (clash) p.name = (p.name + '（' + row[2] + '）').slice(0, 40);
      pool.push(p);
    });
    var act = String(S[row[1]] || '');
    if (act && remap[act]) S[row[1]] = remap[act];
    S[row[0]] = [];
  });
}

function getSecondaryApiConfig(){ return (State.settings && State.settings.secondaryApi) || clone(DEFAULT_API); }

function normalizeSecondaryApiPreset(raw, index){
  var src = raw && typeof raw === 'object' ? raw : {};
  var name = String(src.name || ('预设 ' + (index + 1))).trim().slice(0, 40);
  var temperature = Number(src.temperature);
  if (!Number.isFinite(temperature)) temperature = 0.85;
  temperature = Math.max(0, Math.min(2, temperature));
  var maxTokens = parseInt(src.maxTokens, 10);
  if (!Number.isFinite(maxTokens) || maxTokens < 0) maxTokens = 0;
  return {
    id: String(src.id || genId('subapi_')),
    name: name || ('预设 ' + (index + 1)),
    enabled: !!src.enabled,
    baseUrl: String(src.baseUrl || '').trim(),
    apiKey: String(src.apiKey || ''),
    model: String(src.model || '').trim(),
    temperature: temperature,
    maxTokens: maxTokens,
    updatedAt: Number(src.updatedAt || Date.now())
  };
}

function normalizeSecondaryApiPresetState(){
  if (!State.settings.secondaryApi || typeof State.settings.secondaryApi !== 'object') State.settings.secondaryApi = clone(DEFAULT_API);
  else State.settings.secondaryApi = Object.assign({}, DEFAULT_API, State.settings.secondaryApi);
  var pool = State.settings.apiPresets || [];
  var quickKeys = State.settings && State.settings.secondaryApiQuickKeys && typeof State.settings.secondaryApiQuickKeys === 'object'
    ? State.settings.secondaryApiQuickKeys : {};
  State.settings.secondaryApiQuickKeys = quickKeys;
  Object.keys(PRESETS).forEach(function(key){
    if (key === 'custom' || quickKeys[key]) return;
    var p = PRESETS[key];
    for (var i = 0; i < pool.length; i++) {
      var saved = pool[i];
      if (saved && saved.baseUrl && p.baseUrl && saved.baseUrl.toLowerCase() === p.baseUrl.toLowerCase() && saved.apiKey) {
        quickKeys[key] = saved.apiKey;
        break;
      }
    }
  });

  var activeId = String(State.settings.activeSecondaryApiPresetId || '');
  var active = pool.find(function(p){ return p.id === activeId; }) || null;
  var current = State.settings.secondaryApi;
  var currentReady = !!(current && String(current.baseUrl || '').trim() && String(current.apiKey || '').trim() && String(current.model || '').trim());
  if (!active && activeId) {
    State.settings.activeSecondaryApiPresetId = '';
    activeId = '';
  }
  // 兼容旧版：如果配置实际保存在预设里，但 secondaryApi 本体被清空/丢失，则恢复当前预设。
  if (!currentReady && active && active.baseUrl && active.apiKey && active.model) {
    State.settings.secondaryApi = {
      enabled: true,
      baseUrl: active.baseUrl, apiKey: active.apiKey, model: active.model,
      temperature: active.temperature, maxTokens: active.maxTokens
    };
    current = State.settings.secondaryApi;
    currentReady = true;
  }
  State.settings.secondaryApi.enabled = !!(State.settings.secondaryApi.baseUrl && State.settings.secondaryApi.apiKey && State.settings.secondaryApi.model);
}


var STT_PRESETS = {
  openai: { baseUrl:'https://api.openai.com/v1', model:'gpt-4o-mini-transcribe', language:'auto' },
  custom: { baseUrl:'', model:'', language:'auto' }
};


function getSttConfig(){
  var c = (State.settings && State.settings.stt && typeof State.settings.stt === 'object') ? State.settings.stt : clone(DEFAULT_STT);
  return Object.assign({}, DEFAULT_STT, c);
}

function normalizeSttPreset(raw, index){
  var src = raw && typeof raw === 'object' ? raw : {};
  var name = String(src.name || ('预设 ' + (index + 1))).trim().slice(0, 40);
  var language = String(src.language || 'auto').trim();
  if (!/^(auto|[a-z]{2}(?:-[A-Z]{2})?)$/i.test(language)) language = 'auto';
  return {
    id: String(src.id || genId('stt_')),
    name: name || ('预设 ' + (index + 1)),
    enabled: !!src.enabled,
    baseUrl: String(src.baseUrl || '').trim(),
    apiKey: String(src.apiKey || ''),
    model: String(src.model || '').trim(),
    language: language,
    prompt: String(src.prompt || '').trim(),
    updatedAt: Number(src.updatedAt || Date.now())
  };
}

function normalizeSttState(){
  if (!State.settings.stt || typeof State.settings.stt !== 'object') State.settings.stt = clone(DEFAULT_STT);
  else State.settings.stt = Object.assign({}, DEFAULT_STT, State.settings.stt);
  State.settings.sttQuickKeys = State.settings && State.settings.sttQuickKeys && typeof State.settings.sttQuickKeys === 'object' ? State.settings.sttQuickKeys : {};
}

function isSttReady(){
  var c = getSttConfig();
  return !!(c && c.enabled && c.baseUrl && c.apiKey && c.model);
}

var MINIMAX_ENDPOINTS = { cn:'https://api.minimaxi.com', global:'https://api.minimax.io' };
var MINIMAX_BUILTIN_MODELS = ['speech-2.8-hd','speech-2.8-turbo','speech-2.6-hd','speech-2.6-turbo','speech-02-hd','speech-02-turbo','speech-01-hd','speech-01-turbo'];

function getMinimaxVoiceConfig(){
  var c = (State.settings && State.settings.minimaxVoice && typeof State.settings.minimaxVoice === 'object') ? State.settings.minimaxVoice : {};
  var out = Object.assign({}, DEFAULT_MINIMAX_VOICE, c);
  out.region = out.region === 'global' ? 'global' : 'cn';
  out.groupId = String(out.groupId || '').trim();
  out.apiKey = String(out.apiKey || '').trim();
  out.model = String(out.model || '').trim();
  return out;
}

function isMinimaxVoiceReady(){
  var c = getMinimaxVoiceConfig();
  return !!(c.apiKey && c.model);
}

var VISION_PRESETS = {
  openai: { baseUrl:'https://api.openai.com/v1', model:'gpt-4o-mini' },
  zhipu:  { baseUrl:'https://open.bigmodel.cn/api/paas/v4', model:'glm-4v-flash' },
  gemini: { baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.5-flash' },
  custom: { baseUrl:'', model:'' }
};

function getVisionConfig(){
  var c = (State.settings && State.settings.vision && typeof State.settings.vision === 'object') ? State.settings.vision : clone(DEFAULT_VISION);
  return Object.assign({}, DEFAULT_VISION, c);
}

function normalizeVisionState(){
  if (!State.settings.vision || typeof State.settings.vision !== 'object' || Array.isArray(State.settings.vision)) State.settings.vision = clone(DEFAULT_VISION);
  else State.settings.vision = Object.assign({}, DEFAULT_VISION, State.settings.vision);
  var v = State.settings.vision;
  v.baseUrl = String(v.baseUrl || '').trim();
  v.apiKey = String(v.apiKey || '');
  v.model = String(v.model || '').trim();
  v.prompt = String(v.prompt || '').trim();
  if (v.scope !== 'all' && v.scope !== 'sticker' && v.scope !== 'image') v.scope = 'all';
  var mt = parseInt(v.maxTokens, 10); v.maxTokens = (Number.isFinite(mt) && mt > 0) ? mt : 0;
  v.enabled = !!v.enabled;
  State.settings.visionQuickKeys = State.settings.visionQuickKeys && typeof State.settings.visionQuickKeys === 'object' ? State.settings.visionQuickKeys : {};
}

function isVisionReady(){
  var c = getVisionConfig();
  return !!(c && c.enabled && c.baseUrl && c.apiKey && c.model);
}

function isApiReady(){
  var c = getApiConfig();
  return !!(c && c.enabled && c.baseUrl && c.apiKey && c.model);
}

function getActiveUserPersona(){
  var id = State.settings.activeUserPersonaId;
  var list = State.userPersonas;
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  if (list.length) return list[0];
  return { id:'', socialId:'我', name:'我', signature:'', desc:'', avatar:null };
}

function getActiveUserSocialId(){
  var persona = getActiveUserPersona() || {};
  return String(persona.socialId || persona.name || '我').trim() || '我';
}


function saveChats(){ return IslandDB.set('island.chats', CHATS); }

function saveContacts(){ return IslandDB.set('island.contacts', CONTACTS); }

function saveMoments(){ return IslandDB.set('island.moments', MOMENTS); }

function normalizeHomeAppearance(){
  var incoming = (State.settings && State.settings.homeAppearance) || {};
  var base = clone(DEFAULT_HOME_APPEARANCE);
  /* 已删除的图标主题（mono / glass）：旧存档里的值一律迁移为「默认」。 */
  base.iconTheme = ICON_THEMES.indexOf(incoming.iconTheme) >= 0 ? incoming.iconTheme : 'default';
  var sliderNum = function(v, lo, hi, def){ return (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : def; };
  var inTP = incoming.themeParams && typeof incoming.themeParams === 'object' ? incoming.themeParams : null;
  var themeParams = {};
  ICON_THEMES.forEach(function(t){
    var defs = ICON_THEME_DEFAULTS[t], src = null;
    if (inTP && inTP[t] && typeof inTP[t] === 'object') src = inTP[t];
    else if (!inTP && t === base.iconTheme && incoming.iconTheme === 'borderless') src = incoming; /* 旧存档：数值是各主题共用的，沿用给当前主题 */
    themeParams[t] = {};
    ICON_THEME_KEYS[t].forEach(function(k){
      var r = ICON_SLIDER_RANGES[k];
      themeParams[t][k] = sliderNum(src ? src[k] : undefined, r[0], r[1], defs[k]);
    });
  });
  base.themeParams = themeParams;
  /* 当前生效的数值 = 当前主题那一组；该主题没有的项沿用全局默认值，保证 CSS 变量始终有值 */
  Object.keys(ICON_SLIDER_RANGES).forEach(function(k){
    base[k] = themeParams[base.iconTheme][k] !== undefined ? themeParams[base.iconTheme][k] : DEFAULT_HOME_APPEARANCE[k];
  });
  base.iconRadiusLocked = incoming.iconRadiusLocked === true;
  base.dockBlur = sliderNum(incoming.dockBlur, 0, 60, base.dockBlur);
  base.dockBlurLocked = incoming.dockBlurLocked === true;
  /* 屏幕比例（%）：整个岛屿的全局缩放，100 = 原始大小 */
  base.islandScale = sliderNum(incoming.islandScale, 70, 130, base.islandScale);
  base.labelSize = sliderNum(incoming.labelSize, 8, 18, base.labelSize);
  base.labelColor = (typeof incoming.labelColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(incoming.labelColor)) ? incoming.labelColor.toLowerCase() : base.labelColor;
  base.dockNoBackground = incoming.dockNoBackground === true;
  base.iconLabels = incoming.iconLabels !== false;
  base.iconBorder = 'transparent';
  base.dimDarkWallpaper = incoming.dimDarkWallpaper !== false;
  base.dimDarkWallpaperAmount = Number.isFinite(Number(incoming.dimDarkWallpaperAmount)) ? Math.max(0, Math.min(100, Number(incoming.dimDarkWallpaperAmount))) : base.dimDarkWallpaperAmount;
  base.dimDarkIconAmount = Number.isFinite(Number(incoming.dimDarkIconAmount)) ? Math.max(0, Math.min(100, Number(incoming.dimDarkIconAmount))) : base.dimDarkIconAmount;
  base.dimDarkWallpaperLocked = incoming.dimDarkWallpaperLocked === true;
  base.dimDarkIconLocked = incoming.dimDarkIconLocked === true;
  base.dockRadius = Number.isFinite(Number(incoming.dockRadius)) ? Math.max(0, Math.min(40, Number(incoming.dockRadius))) : base.dockRadius;
  /* Dock 改成胶囊形：旧默认值 5px 且用户从没动过圆角拉条的，一并升级成全圆角（40 ≥ Dock 高度的一半，等于完整胶囊）。 */
  base.dockShapeV2 = incoming.dockShapeV2 === true;
  if (!base.dockShapeV2 && Number(incoming.dockRadius) === 5) base.dockRadius = 40;
  base.dockTransparency = Number.isFinite(Number(incoming.dockTransparency)) ? Math.max(0, Math.min(100, Number(incoming.dockTransparency))) : base.dockTransparency;
  base.dockRadiusLocked = incoming.dockRadiusLocked === true;
  base.dockTransparencyLocked = incoming.dockTransparencyLocked === true;
  base.iconData = {};
  if (incoming.iconData && typeof incoming.iconData === 'object') {
    Object.keys(incoming.iconData).forEach(function(name){
      if (HOME_APP_NAMES.indexOf(name) >= 0 && typeof incoming.iconData[name] === 'string') base.iconData[name] = incoming.iconData[name];
    });
  }
  base.wallpaper = 'mono';
  base.wallpaperData = typeof incoming.wallpaperData === 'string' ? incoming.wallpaperData : '';
  base.calendarPhoto = isImageSrc(incoming.calendarPhoto) ? incoming.calendarPhoto : '';
  base.musicCover = isImageSrc(incoming.musicCover) ? incoming.musicCover : '';
  base.polaroidPhoto = isImageSrc(incoming.polaroidPhoto) ? incoming.polaroidPhoto : '';
  base.photo2Photo = isImageSrc(incoming.photo2Photo) ? incoming.photo2Photo : '';
  base.ins2Time = incoming.ins2Time === true;
  base.insR2Time = incoming.insR2Time === true;
  base.ins2Text = typeof incoming.ins2Text === 'string' ? incoming.ins2Text.slice(0, 40) : base.ins2Text;
  base.insR2Text = typeof incoming.insR2Text === 'string' ? incoming.insR2Text.slice(0, 40) : base.insR2Text;
  base.weather2Bg = isImageSrc(incoming.weather2Bg) ? incoming.weather2Bg : '';
  base.polaroidCaption = typeof incoming.polaroidCaption === 'string' ? incoming.polaroidCaption.slice(0, 24) : base.polaroidCaption;
  var widgets = incoming.widgets && typeof incoming.widgets === 'object' ? incoming.widgets : {};
  /* 旧版「时间」组件已改为「日历」组件：沿用旧的开关状态。 */
  if (!widgets.calendar && widgets.time) widgets = Object.assign({}, widgets, { calendar: widgets.time });
  ['calendar','music','polaroid'].forEach(function(key){
    var src = widgets[key] && typeof widgets[key] === 'object' ? widgets[key] : null;
    if (src) {
      base.widgets[key].enabled = src.enabled !== false;
      base.widgets[key].size = ['small','medium','large'].indexOf(src.size) >= 0 ? src.size : base.widgets[key].size;
      /* 三个组件都支持“默认 / 毛玻璃”背景：旧存档没有这些字段，沿用默认值 */
      var gw = base.widgets[key];
      /* 日历背景多两个实色：black / white（无描边）；音乐、拍立得仍只有 default / glass */
      var okStyles = key === 'calendar' ? ['default','glass','black','white'] : ['default','glass'];
      gw.bgStyle = okStyles.indexOf(src.bgStyle) >= 0 ? src.bgStyle : 'default';
      gw.glassBlur = sliderNum(src.glassBlur, 0, 40, gw.glassBlur);
      gw.glassTransparency = sliderNum(src.glassTransparency, 0, 100, gw.glassTransparency);
    }
  });
  base.widgets.calendar.enabled = widgets.calendar ? widgets.calendar.enabled !== false : true;
  base.widgets.music.enabled = widgets.music ? widgets.music.enabled !== false : true;
  base.widgets.polaroid.enabled = widgets.polaroid ? widgets.polaroid.enabled !== false : true;
  ['photo2','weather2','ins2'].forEach(function(k){ base.widgets[k].enabled = widgets[k] ? widgets[k].enabled !== false : true; });
  /* 音乐按钮颜色：auto＝跟随主题（原来的样子）/ black / white */
  base.widgets.music.controlColor = widgets.music && ['black','white'].indexOf(widgets.music.controlColor) >= 0 ? widgets.music.controlColor : 'auto';
  /* 相纸颜色：白（默认）/ 黑；旧存档没有这个字段，一律按白色 */
  base.widgets.polaroid.paper = widgets.polaroid && widgets.polaroid.paper === 'black' ? 'black' : 'white';
  State.settings.homeAppearance = base;
  return base;
}


function getFontConfig(){
  if (!State.settings || typeof State.settings !== 'object') State.settings = {};
  var cfg = State.settings.font && typeof State.settings.font === 'object' ? State.settings.font : {};
  if (!Array.isArray(cfg.items)) cfg.items = [];
  if (typeof cfg.activeId !== 'string') cfg.activeId = '';
  if (!Number.isFinite(Number(cfg.sizeScale))) cfg.sizeScale = 1;
  cfg.sizeScale = Math.max(0.85, Math.min(1.2, Number(cfg.sizeScale)));
  if (!Number.isFinite(Number(cfg.weight))) cfg.weight = 400;
  cfg.weight = Math.max(300, Math.min(700, Number(cfg.weight)));
  State.settings.font = cfg;
  return cfg;
}


var settingsSaveTimer = 0;

function saveSettings(){ return IslandDB.set('island.settings', State.settings); }

function scheduleSettingsSave(delay){
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(function(){ settingsSaveTimer = 0; whenIdle(function(){ saveSettings(); }); }, delay || 140);
}

function savePersonas(){ return IslandDB.set('island.personas', State.personas); }

function saveUserPersonas(){ return IslandDB.set('island.userPersonas', State.userPersonas); }

function saveWorldbooks(){ return IslandDB.set('island.worldbooks', State.worldbooks || []); }

function savePhoneCalls(){ return IslandDB.set('island.phoneCalls', State.phoneCalls || []); }

function saveMessages(name){
  if (!name) return Promise.resolve(false);
  var state = CHAT_MESSAGE_STORE_STATE[name];
  if (state && !state.loaded) {
    /* 首次读入该会话前若已经有新消息进入内存，先加载最近页并保留这些未分配序号的待写消息，再做增量保存。 */
    return refreshChatMessageWindowLatest(name).then(function(){ return saveMessages(name); });
  }
  var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  state = state || (CHAT_MESSAGE_STORE_STATE[name] = { loaded:true, hasMore:false, hasNewer:false, oldestSeq:0, newestSeq:0, globalNewestSeq:0, loadedSeqs:Object.create(null), signatures:Object.create(null), totalCount:0 });
  var currentSeqs = Object.create(null), writes = [], deletes = [];
  list.forEach(function(message, index){
    if (!message || typeof message !== 'object') return;
    var seq = Number(message.__islandSeq) || 0;
    if (seq > 0) currentSeqs[String(seq)] = true;
    var signature = chatMessageStoreSignature(message);
    if (!seq || state.signatures[String(seq)] !== signature) writes.push({ seq:seq, index:index, message:message, signature:signature });
  });
  Object.keys(state.loadedSeqs || {}).forEach(function(key){ if (!currentSeqs[key]) deletes.push(Number(key)); });
  return IslandDB.chatWriteBatch(name, writes, deletes).then(function(result){
    var assigned = Array.isArray(result && result.rows) ? result.rows : [];
    assigned.forEach(function(row){
      var item = writes.find(function(w){ return w.index === Number(row.index); });
      if (!item) return;
      item.message.__islandSeq = Number(row.seq) || item.message.__islandSeq || 0;
      currentSeqs[String(item.message.__islandSeq)] = true;
      state.signatures[String(item.message.__islandSeq)] = chatMessageStoreSignature(item.message);
    });
    deletes.forEach(function(seq){ delete state.loadedSeqs[String(seq)]; delete state.signatures[String(seq)]; });
    list.forEach(function(message){
      var seq = Number(message && message.__islandSeq) || 0;
      if (!seq) return;
      state.loadedSeqs[String(seq)] = true;
      state.signatures[String(seq)] = chatMessageStoreSignature(message);
    });
    state.loaded = true;
    if (list.length) { state.oldestSeq = Number(list[0].__islandSeq) || state.oldestSeq; state.newestSeq = Number(list[list.length-1].__islandSeq) || state.newestSeq; }
    state.globalNewestSeq = state.hasNewer ? Math.max(Number(state.globalNewestSeq) || 0, state.newestSeq) : state.newestSeq;
    state.totalCount = Math.max(0, (Number(state.totalCount) || 0) + writes.filter(function(w){ return !(Number(w.seq) > 0); }).length - deletes.length, Object.keys(state.loadedSeqs).length);
    if (list.length) {
      var latestCandidate = list[list.length - 1], latestSeq = Number(latestCandidate && latestCandidate.__islandSeq) || 0;
      if (!state.hasNewer || latestSeq >= Number(state.globalNewestSeq || 0)) CHAT_LATEST_MESSAGE_CACHE[name] = latestCandidate;
    } else delete CHAT_LATEST_MESSAGE_CACHE[name];
    return true;
  });
}

function resetChatMessageCacheState(name, messages, page){
  page = page || {};
  var previous = CHAT_MESSAGE_STORE_STATE[name] || {};
  var explicitGlobal = Object.prototype.hasOwnProperty.call(page, 'globalNewestSeq');
  var state = { loaded:true, hasMore:!!page.hasMore, hasNewer:!!page.hasNewer, oldestSeq:0, newestSeq:0,
    globalNewestSeq: explicitGlobal ? (Number(page.globalNewestSeq) || 0) : (Number(previous.globalNewestSeq || previous.newestSeq) || 0),
    loadedSeqs:Object.create(null), signatures:Object.create(null), totalCount:Number(page.count)||0 };
  (Array.isArray(messages) ? messages : []).forEach(function(message){
    var seq = Number(message && message.__islandSeq)||0; if(!seq)return;
    state.loadedSeqs[String(seq)] = true; state.signatures[String(seq)] = chatMessageStoreSignature(message);
    state.globalNewestSeq = Math.max(state.globalNewestSeq, seq);
  });
  if (messages && messages.length) { state.oldestSeq=Number(messages[0].__islandSeq)||0; state.newestSeq=Number(messages[messages.length-1].__islandSeq)||0; }
  CHAT_MESSAGE_STORE_STATE[name] = state;
  if (Array.isArray(messages) && messages.length) {
    var lastSeq = Number(messages[messages.length - 1] && messages[messages.length - 1].__islandSeq) || 0;
    if (lastSeq >= Number(state.globalNewestSeq || 0)) CHAT_LATEST_MESSAGE_CACHE[name] = messages[messages.length - 1];
  } else if (Array.isArray(messages) && !messages.length) delete CHAT_LATEST_MESSAGE_CACHE[name];
  return state;
}

/* 在发送消息或后台 AI 回复前，将被搜索跳转切换过的窗口刷新到最新一页。 */
function refreshChatMessageWindowLatest(name){
  if (!name) return Promise.resolve(false);
  if (CHAT_MESSAGE_LOAD_PROMISES[name]) return CHAT_MESSAGE_LOAD_PROMISES[name];
  var promise = IslandDB.chatFlush().then(function(){ return IslandDB.chatReadPage(name, { limit:CHAT_RECENT_PAGE_SIZE, withMedia:true }); }).then(function(page){
    /* 读盘期间也可能有后台事件追加消息，因此要在覆盖窗口前捕获当下所有未分配序号的记录。 */
    var pendingMessages = (Array.isArray(MESSAGES[name]) ? MESSAGES[name] : []).filter(function(message){ return message && !(Number(message.__islandSeq) > 0); });
    var state = rememberChatMessagePage(name, page, 'replace');
    var list = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
    pendingMessages.forEach(function(message){ if (list.indexOf(message) < 0) list.push(message); });
    MESSAGES[name] = list;
    state.hasNewer = false;
    if (Array.isArray(page.rows) && page.rows.length) CHAT_LATEST_MESSAGE_CACHE[name] = page.rows[page.rows.length - 1];
    else delete CHAT_LATEST_MESSAGE_CACHE[name];
    return page;
  }).finally(function(){ delete CHAT_MESSAGE_LOAD_PROMISES[name]; });
  CHAT_MESSAGE_LOAD_PROMISES[name] = promise;
  return promise;
}

function ensureChatMessageWindowLatest(name){
  var state = name && CHAT_MESSAGE_STORE_STATE[name];
  if (!state || !state.loaded) return refreshChatMessageWindowLatest(name);
  if (Number(state.globalNewestSeq || 0) <= Number(state.newestSeq || 0) && !state.hasNewer) return Promise.resolve(false);
  return refreshChatMessageWindowLatest(name);
}


function loadState(){
  var baseKeys = [
    'island.settings', 'island.chats', 'island.contacts', 'island.moments',
    'island.phoneCalls', 'island.memory', 'island.personas', 'island.worldbooks',
    'island.stickers', 'island.userPersonas'
  ];
  return Promise.all(baseKeys.map(function(key){
    return IslandDB.get(key).then(function(value){ return { key:key, value:value }; });
  })).then(function(items){
    var data = {};
    items.forEach(function(item){ data[item.key] = item.value; });

    /* 所有读取成功后才允许写回规范化数据；任何读取异常都会直接进入 init() 的错误分支，绝不会先写一批空数据。 */
    var missing = {};
    items.forEach(function(item){ missing[item.key] = item.value === undefined; });

    var settingsValue = data['island.settings'];
    if (settingsValue && typeof settingsValue === 'object' && !Array.isArray(settingsValue)) {
      State.settings = Object.assign({}, DEFAULT_SETTINGS, settingsValue);
      if (!State.settings.api || typeof State.settings.api !== 'object' || Array.isArray(State.settings.api)) State.settings.api = clone(DEFAULT_API);
      else State.settings.api = Object.assign({}, DEFAULT_API, State.settings.api);
    } else {
      State.settings = clone(DEFAULT_SETTINGS);
      missing['island.settings'] = true;
    }
    normalizeApiPresetState();
    normalizeSecondaryApiPresetState();
    normalizeSttState();
    normalizeVisionState();
    normalizeHomeAppearance();
    normalizeMemorySettings();
    normalizeVectorMemorySettings();
    getFontConfig();

    if (Array.isArray(data['island.chats'])) assignArray(CHATS, data['island.chats']);
    else { assignArray(CHATS, []); missing['island.chats'] = true; }

    if (Array.isArray(data['island.contacts'])) assignArray(CONTACTS, data['island.contacts']);
    else { assignArray(CONTACTS, []); missing['island.contacts'] = true; }

    if (Array.isArray(data['island.moments'])) assignArray(MOMENTS, data['island.moments']);
    else { assignArray(MOMENTS, []); missing['island.moments'] = true; }

    State.phoneCalls = Array.isArray(data['island.phoneCalls']) ? data['island.phoneCalls'] : [];
    if (!Array.isArray(data['island.phoneCalls'])) missing['island.phoneCalls'] = true;

    State.memory = data['island.memory'] && typeof data['island.memory'] === 'object' && !Array.isArray(data['island.memory']) ? data['island.memory'] : {};
    if (!data['island.memory'] || typeof data['island.memory'] !== 'object' || Array.isArray(data['island.memory'])) missing['island.memory'] = true;

    State.personas = Array.isArray(data['island.personas']) ? data['island.personas'] : [];
    if (!Array.isArray(data['island.personas'])) missing['island.personas'] = true;
    // 自动展开翻译的旧版本默认值曾为 true。新版本默认关闭；保留已经明确手动操作过的角色设置。
    if (State.settings && State.settings._autoExpandTranslationDefaultV2 !== true) {
      var autoExpandMigrated = false;
      State.personas.forEach(function(persona){
        if (!persona || typeof persona !== 'object') return;
        if (persona.autoExpandTranslation === true && persona.autoExpandTranslationUserSet !== true) {
          persona.autoExpandTranslation = false;
          autoExpandMigrated = true;
        }
      });
      State.settings._autoExpandTranslationDefaultV2 = true;
      missing['island.settings'] = true;
      if (autoExpandMigrated) missing['island.personas'] = true;
    }

    if (Array.isArray(data['island.worldbooks'])) State.worldbooks = data['island.worldbooks'];
    else { State.worldbooks = []; missing['island.worldbooks'] = true; }
    normalizeLoadedWorldbooks();

    State.stickers = data['island.stickers'] && typeof data['island.stickers'] === 'object' && !Array.isArray(data['island.stickers'])
      ? data['island.stickers'] : { activeGroupId:'', groups:[] };
    if (!data['island.stickers'] || typeof data['island.stickers'] !== 'object' || Array.isArray(data['island.stickers'])) missing['island.stickers'] = true;
    normalizeStickerState();

    if (Array.isArray(data['island.userPersonas']) && data['island.userPersonas'].length) {
      State.userPersonas = data['island.userPersonas'];
    } else {
      State.userPersonas = [{ id:genId('up_'), socialId:'我', name:'我', signature:'', desc:'', avatar:null, createdAt:Date.now() }];
      missing['island.userPersonas'] = true;
    }
    State.userPersonas = State.userPersonas.map(function(persona){
      persona = (persona && typeof persona === 'object') ? persona : {};
      if (!persona.id) persona.id = genId('up_');
      if (persona.socialId == null || String(persona.socialId).trim() === '') persona.socialId = String(persona.name || '我').trim() || '我';
      if (persona.signature == null) persona.signature = '';
      return persona;
    });
    var found = State.userPersonas.some(function(persona){ return persona && persona.id === State.settings.activeUserPersonaId; });
    if (!found && State.userPersonas.length) {
      State.settings.activeUserPersonaId = State.userPersonas[0].id;
      missing['island.settings'] = true;
    }

    var names = Object.create(null);
    CHATS.forEach(function(c){ if (c && c.name) names[c.name] = true; });
    CONTACTS.forEach(function(c){ if (c && c.name) names[c.name] = true; });
    return IslandDB.chatListNames().then(function(storedNames){
      (storedNames || []).forEach(function(name){ if (name) names[name] = true; });
      var messageNames = Object.keys(names), messageRows = [], chunkSize = 50;
      /* 启动时每个会话最多探测最后一条、不读媒体；分 50 个一组避免一次打开成千上万笔事务。 */
      function readLatestChunk(offset){
        var chunk = messageNames.slice(offset, offset + chunkSize);
        if (!chunk.length) return Promise.resolve(messageRows);
        return Promise.all(chunk.map(function(name){
          return IslandDB.chatReadPage(name, { limit:1, withMedia:false }).then(function(page){ return { name:name, page:page }; });
        })).then(function(rows){ messageRows = messageRows.concat(rows); return readLatestChunk(offset + chunk.length); });
      }
      return readLatestChunk(0);
    }).then(function(messageRows){
      var chatsChanged = false, chatByName = Object.create(null), contactByName = Object.create(null);
      CHATS.forEach(function(c){ if (c && c.name) chatByName[c.name] = c; });
      CONTACTS.forEach(function(c){ if (c && c.name) contactByName[c.name] = c; });
      messageRows.forEach(function(row){
        var name = row.name, latest = row.page && row.page.rows && row.page.rows[0];
        if (!Array.isArray(MESSAGES[name])) MESSAGES[name] = [];
        if (!CHAT_MESSAGE_STORE_STATE[name]) CHAT_MESSAGE_STORE_STATE[name] = { loaded:false, hasMore:false, hasNewer:false, oldestSeq:0, newestSeq:0, globalNewestSeq:Number(latest && latest.__islandSeq)||0, loadedSeqs:Object.create(null), signatures:Object.create(null), totalCount:0 };
        if (!latest) { delete CHAT_LATEST_MESSAGE_CACHE[name]; return; }
        /* 最新一条只放在轻量元数据缓存里，不混入未加载消息窗口，防止未读媒体字段的预览对象被误保存覆盖。 */
        CHAT_LATEST_MESSAGE_CACHE[name] = latest;
        var ts = typeof chatMessageCreatedAt === 'function' ? Number(chatMessageCreatedAt(latest))||0 : Number(latest.createdAt)||0;
        var chat = chatByName[name];
        if (!chat) {
          var contact = contactByName[name];
          chat = { name:name, preview:'', time:'', lastTs:0, unread:0, avatar:contact && contact.avatar || null };
          CHATS.push(chat); chatByName[name] = chat; chatsChanged = true;
        }
        if (ts && Number(chat.lastTs||0) !== ts) { chat.lastTs = ts; chatsChanged = true; }
        if (!String(chat.preview||'').trim()) {
          if (latest.recalled) chat.preview = latest.from === 'me' ? '你撤回了一条消息' : '对方撤回了一条消息';
          else if (latest.type === 'transfer' && typeof transferPreviewText === 'function') chat.preview = transferPreviewText(latest);
          else if (latest.type === 'chat_record') chat.preview = '聊天记录';
          else if (latest.type === 'sticker') chat.preview = '[表情包]';
          else if ((latest.type === 'image' || latest.type === 'voice' || latest.type === 'location' || latest.type === 'voice_call_event') && typeof mediaPreviewText === 'function') chat.preview = mediaPreviewText(latest);
          else if (latest.type === 'file') chat.preview = '[文件] ' + String(latest.name || latest.text || '未命名文件');
          else chat.preview = String(latest.text || '');
          if (chat.preview) chatsChanged = true;
        }
        if (ts && (!chat.time || chat.time === '刚刚') && typeof formatChatListTime === 'function') { chat.time = formatChatListTime(ts); chatsChanged = true; }
      });
      CHATS.forEach(function(c){ if (c && c.name && !Array.isArray(MESSAGES[c.name])) MESSAGES[c.name] = []; });
      CONTACTS.forEach(function(c){ if (c && c.name && !Array.isArray(MESSAGES[c.name])) MESSAGES[c.name] = []; });
      if (chatsChanged) missing['island.chats'] = true;

      /* 电话记录有独立索引和备份；启动时不加载聊天历史，也不能用最近一条消息覆盖全量电话统计。 */
      renderPhoneLists();

      var writes = [];
      if (missing['island.settings']) writes.push(saveSettings());
      if (missing['island.chats']) writes.push(saveChats());
      if (missing['island.contacts']) writes.push(saveContacts());
      if (missing['island.moments']) writes.push(saveMoments());
      if (missing['island.phoneCalls']) writes.push(savePhoneCalls());
      if (missing['island.memory']) writes.push(saveMemoryState());
      if (missing['island.personas']) writes.push(savePersonas());
      if (missing['island.worldbooks']) writes.push(saveWorldbooks());
      if (missing['island.stickers']) writes.push(saveStickers());
      if (missing['island.userPersonas']) writes.push(saveUserPersonas());
      return Promise.all(writes).then(function(){
        return IslandDB.flush().then(function(){
          islandStateHydrated = true;
          return true;
        });
      });
    });
  }).catch(function(err){
    console.error('[岛屿] 本机存储读取/初始化失败：', err);
    throw err;
  });
}
