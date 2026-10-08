/* 岛屿 · 默认配置、全局状态、API/STT 配置规范化、设置持久化与 loadState
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var DEFAULT_API = {
  enabled: false, baseUrl: '', apiKey: '', model: '',
  temperature: 0.85, maxTokens: 0
};

var DEFAULT_STT = {
  enabled: false, baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini-transcribe', language: 'auto', prompt: ''
};

var HOME_APP_NAMES = ['聊天','通讯录','相册','日历','备忘录','天气','时钟','设置','电话','浏览器','世界书','音乐'];

var DEFAULT_HOME_APPEARANCE = {
  iconTheme: 'mono', iconShape: 'square', iconSize: 'medium', iconLabels: true, iconBorder: 'transparent', dimDarkWallpaper: true,
  iconData: {},
  dimDarkWallpaperAmount: 42, dimDarkIconAmount: 42, dimDarkWallpaperLocked: false, dimDarkIconLocked: false,
  dockRadius: 5, dockTransparency: 0, dockRadiusLocked: false, dockTransparencyLocked: false,
  wallpaper: 'mono', wallpaperData: '', calendarPhoto: '', musicCover: '', polaroidPhoto: '', polaroidCaption: '⌯>ᴗ<⌯ಣ',
  widgets: {
    calendar: { enabled: true, size: 'large' },
    music: { enabled: true, size: 'medium' },
    polaroid: { enabled: true, size: 'medium' }
  }
};

var DEFAULT_SETTINGS = {
  theme: 'system', chatAppearance: 'mono', notifications: { enabled: false, minInterval: 60, maxInterval: 240, quietStart: '23:00', quietEnd: '08:00', lastProactiveAt: 0, nextProactiveAt: 0, running: false }, api: clone(DEFAULT_API), apiPresets: [], activeApiPresetId: '', apiQuickKeys: {}, secondaryApi: clone(DEFAULT_API), secondaryApiPresets: [], activeSecondaryApiPresetId: '', secondaryApiQuickKeys: {}, stt: clone(DEFAULT_STT), sttPresets: [], activeSttPresetId: '', sttQuickKeys: {}, activeUserPersonaId: '',
  homeAppearance: clone(DEFAULT_HOME_APPEARANCE),
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
  if (!State.settings.activeApiPresetId || !State.settings.apiPresets.some(function(p){ return p.id === State.settings.activeApiPresetId; })) {
    State.settings.activeApiPresetId = '';
  }
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
  var raw = State.settings && Array.isArray(State.settings.secondaryApiPresets) ? State.settings.secondaryApiPresets : [];
  State.settings.secondaryApiPresets = raw.map(normalizeSecondaryApiPreset);
  var quickKeys = State.settings && State.settings.secondaryApiQuickKeys && typeof State.settings.secondaryApiQuickKeys === 'object'
    ? State.settings.secondaryApiQuickKeys : {};
  State.settings.secondaryApiQuickKeys = quickKeys;
  Object.keys(PRESETS).forEach(function(key){
    if (key === 'custom' || quickKeys[key]) return;
    var p = PRESETS[key];
    for (var i = 0; i < State.settings.secondaryApiPresets.length; i++) {
      var saved = State.settings.secondaryApiPresets[i];
      if (saved && saved.baseUrl && p.baseUrl && saved.baseUrl.toLowerCase() === p.baseUrl.toLowerCase() && saved.apiKey) {
        quickKeys[key] = saved.apiKey;
        break;
      }
    }
  });

  var activeId = String(State.settings.activeSecondaryApiPresetId || '');
  var active = State.settings.secondaryApiPresets.find(function(p){ return p.id === activeId; }) || null;
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
  // 没有有效 activeId 时，如果只有已保存的完整副API预设，也恢复第一条。
  if (!currentReady && !activeId) {
    var fallback = State.settings.secondaryApiPresets.find(function(p){ return p.baseUrl && p.apiKey && p.model; });
    if (fallback) {
      State.settings.activeSecondaryApiPresetId = fallback.id;
      State.settings.secondaryApi = {
        enabled: true,
        baseUrl: fallback.baseUrl, apiKey: fallback.apiKey, model: fallback.model,
        temperature: fallback.temperature, maxTokens: fallback.maxTokens
      };
    }
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
  var raw = State.settings && Array.isArray(State.settings.sttPresets) ? State.settings.sttPresets : [];
  State.settings.sttPresets = raw.map(normalizeSttPreset);
  State.settings.sttQuickKeys = State.settings && State.settings.sttQuickKeys && typeof State.settings.sttQuickKeys === 'object' ? State.settings.sttQuickKeys : {};
  if (!State.settings.activeSttPresetId || !State.settings.sttPresets.some(function(p){ return p.id === State.settings.activeSttPresetId; })) State.settings.activeSttPresetId = '';
}

function isSttReady(){
  var c = getSttConfig();
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
  base.iconTheme = ['mono','solid','outline','glass','borderless'].indexOf(incoming.iconTheme) >= 0 ? incoming.iconTheme : base.iconTheme;
  base.iconShape = ['square','soft','round','pill'].indexOf(incoming.iconShape) >= 0 ? incoming.iconShape : base.iconShape;
  base.iconSize = ['small','medium','large'].indexOf(incoming.iconSize) >= 0 ? incoming.iconSize : base.iconSize;
  base.iconLabels = incoming.iconLabels !== false;
  base.iconBorder = 'transparent';
  base.dimDarkWallpaper = incoming.dimDarkWallpaper !== false;
  base.dimDarkWallpaperAmount = Number.isFinite(Number(incoming.dimDarkWallpaperAmount)) ? Math.max(0, Math.min(100, Number(incoming.dimDarkWallpaperAmount))) : base.dimDarkWallpaperAmount;
  base.dimDarkIconAmount = Number.isFinite(Number(incoming.dimDarkIconAmount)) ? Math.max(0, Math.min(100, Number(incoming.dimDarkIconAmount))) : base.dimDarkIconAmount;
  base.dimDarkWallpaperLocked = incoming.dimDarkWallpaperLocked === true;
  base.dimDarkIconLocked = incoming.dimDarkIconLocked === true;
  base.dockRadius = Number.isFinite(Number(incoming.dockRadius)) ? Math.max(0, Math.min(40, Number(incoming.dockRadius))) : base.dockRadius;
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
  base.calendarPhoto = typeof incoming.calendarPhoto === 'string' && incoming.calendarPhoto.indexOf('data:image/') === 0 ? incoming.calendarPhoto : '';
  base.musicCover = typeof incoming.musicCover === 'string' && incoming.musicCover.indexOf('data:image/') === 0 ? incoming.musicCover : '';
  base.polaroidPhoto = typeof incoming.polaroidPhoto === 'string' && incoming.polaroidPhoto.indexOf('data:image/') === 0 ? incoming.polaroidPhoto : '';
  base.polaroidCaption = typeof incoming.polaroidCaption === 'string' ? incoming.polaroidCaption.slice(0, 24) : base.polaroidCaption;
  var widgets = incoming.widgets && typeof incoming.widgets === 'object' ? incoming.widgets : {};
  /* 旧版「时间」组件已改为「日历」组件：沿用旧的开关状态。 */
  if (!widgets.calendar && widgets.time) widgets = Object.assign({}, widgets, { calendar: widgets.time });
  ['calendar','music','polaroid'].forEach(function(key){
    var src = widgets[key] && typeof widgets[key] === 'object' ? widgets[key] : null;
    if (src) {
      base.widgets[key].enabled = src.enabled !== false;
      base.widgets[key].size = ['small','medium','large'].indexOf(src.size) >= 0 ? src.size : base.widgets[key].size;
    }
  });
  base.widgets.calendar.enabled = widgets.calendar ? widgets.calendar.enabled !== false : true;
  base.widgets.music.enabled = widgets.music ? widgets.music.enabled !== false : true;
  base.widgets.polaroid.enabled = widgets.polaroid ? widgets.polaroid.enabled !== false : true;
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
  settingsSaveTimer = setTimeout(function(){ settingsSaveTimer = 0; saveSettings(); }, delay || 140);
}

function savePersonas(){ return IslandDB.set('island.personas', State.personas); }

function saveUserPersonas(){ return IslandDB.set('island.userPersonas', State.userPersonas); }

function saveWorldbooks(){ return IslandDB.set('island.worldbooks', State.worldbooks || []); }

function savePhoneCalls(){ return IslandDB.set('island.phoneCalls', State.phoneCalls || []); }

function saveMessages(name){
  if (!name) return Promise.resolve(false);
  return IslandDB.set('island.msg.' + name, MESSAGES[name] || []);
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

    var names = {};
    CHATS.forEach(function(c){ if (c && c.name) names[c.name] = true; });
    CONTACTS.forEach(function(c){ if (c && c.name) names[c.name] = true; });
    var messageNames = Object.keys(names);
    return Promise.all(messageNames.map(function(name){
      return IslandDB.get('island.msg.' + name).then(function(value){ return { name:name, value:value }; });
    })).then(function(messageRows){
      messageRows.forEach(function(row){
        if (Array.isArray(row.value)) MESSAGES[row.name] = row.value;
      });

      CHATS.forEach(function(c){ if (c && c.name && !Array.isArray(MESSAGES[c.name])) MESSAGES[c.name] = []; });
      CONTACTS.forEach(function(c){ if (c && c.name && !Array.isArray(MESSAGES[c.name])) MESSAGES[c.name] = []; });

      /* 电话索引由真实 voice_call 消息校正；删除后的会话不会凭索引重新生成。 */
      migratePhoneCallsFromMessages();
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
