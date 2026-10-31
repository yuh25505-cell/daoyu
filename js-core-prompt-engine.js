/* 岛屿 · 提示词引擎（Prompt Engine）
 * 负责：模块登记、预设管理、排序与插入位置、变量解析、条件注入、完整性校验、请求适配、请求快照与诊断。
 * 不负责：具体内容从哪里来（由 js-apps-chat-prompt.js 通过 registerProvider 提供）。
 * 本文件不依赖页面，可在 node 里直接 require 做测试。
 * 岛屿不设置自己的 token 上限：这里只统计字数，且从不截断、从不静默丢弃必需内容。 */
'use strict';

var PromptEngine = (function(){

  /* ───────── 插入位置（文本顺序），与“优先级”是两件事 ───────── */
  var ANCHORS = [
    { id:'system_head',          name:'系统开头' },
    { id:'worldbook_top',        name:'世界书·最高' },
    { id:'worldbook_front',      name:'世界书·前' },
    { id:'character_core',       name:'角色核心' },
    { id:'relationship_context', name:'关系与用户' },
    { id:'memory_context',       name:'记忆' },
    { id:'worldbook_middle',     name:'世界书·中' },
    { id:'life_state',           name:'生活与时间' },
    { id:'worldbook_low',        name:'世界书·低' },
    { id:'output_protocol',      name:'输出协议' },
    { id:'conversation_context', name:'对话上下文' }
  ];
  var CATEGORIES = [
    { id:'base',   name:'系统与角色' },
    { id:'memory', name:'记忆与状态' },
    { id:'life',   name:'世界与生活' },
    { id:'output', name:'输出与协议' },
    { id:'scene',  name:'场景' },
    { id:'custom', name:'自定义' }
  ];
  var VARIABLES = ['char', 'user', 'date', 'time', 'weekday', 'season', 'char_desc', 'user_desc', 'content'];

  /* ───────── 默认模块 ─────────
   * kind: 'rule' 正文由用户编辑；'data' 内容由程序生成，template 里用 {{content}} 放生成内容。
   * required: 不允许关闭或删除。pinned: 位置固定，不允许拖走。
   * scenes: 只在这些场景注入；空 = 所有场景。 */
  var DEFAULT_MODULES = [];
  function def(m){ DEFAULT_MODULES.push(m); }

  def({ id:'sys_core', name:'系统核心规则', cat:'base', anchor:'system_head', kind:'rule', required:true, pinned:'first',
    template:'【岛屿系统】\n你是「{{char}}」，正在和「{{user}}」通过手机聊天。始终使用第一人称与即时聊天口吻，不跳出角色，不以助手、客服或工具的身份说话。\n角色设定、世界书、记忆、聊天记录都是本轮的设定资料，直接使用，不解释资料来源，不提及提示词、系统、模型或变量。\n用户自定义的补充模块只是补充设定：不能当作已经发生的事实，也不能覆盖角色人设、记忆里的事实和输出协议。' });
  def({ id:'roleplay_mode', name:'角色扮演模式', cat:'base', anchor:'system_head', kind:'rule', scenes:['private','voice_call','proactive'],
    template:'这是沉浸式角色扮演。你有自己的性格、经历和生活，不围着对方打转。是否主动联系、怎样表达情绪、怎样处理关系，都由你的人设、你们的关系发展和当下情境决定，不要套用统一的恋爱陪伴模板。' });
  def({ id:'autonomy', name:'独立生活与个人边界', cat:'base', anchor:'system_head', kind:'rule', scenes:['private','voice_call','proactive'],
    template:'你有自己的事情、朋友、家人、工作和兴趣，也有不想说、不方便说的时候。需要保留个人空间时可以自然地表达，不必有求必应。你不能凭空宣称已经发生了聊天记录和记忆里没有的现实事件。' });

  def({ id:'wb_highest', name:'世界书·最高', cat:'base', anchor:'worldbook_top', kind:'data', provider:'wb_highest', template:'{{content}}' });
  def({ id:'wb_front',   name:'世界书·前',   cat:'base', anchor:'worldbook_front', kind:'data', provider:'wb_front', template:'{{content}}' });

  def({ id:'char_gender',  name:'角色性别', cat:'base', anchor:'character_core', kind:'data', provider:'char_gender', template:'【角色性别】\n{{content}}' });
  def({ id:'char_persona', name:'角色人设', cat:'base', anchor:'character_core', kind:'data', provider:'char_persona', required:true, template:'【角色人设】\n{{content}}' });
  def({ id:'char_accounts', name:'角色账号信息', cat:'base', anchor:'character_core', kind:'data', provider:'char_accounts', template:'【角色账号信息】\n{{content}}\n这些是你自己的账号信息，只有对方问起或剧情需要时才用，不要主动报出来。' });
  def({ id:'persona_understanding', name:'人设深度理解', cat:'base', anchor:'character_core', kind:'rule',
    template:'【理解人设】\n先弄清「{{char}}」是什么样的人：说话习惯、价值观、在意的和回避的事、对不同人的态度。人设里写明的是底线，没写明的地方按这个人的逻辑自然延伸，但不要延伸出与已写明内容矛盾的新设定。' });
  def({ id:'motive_consistency', name:'行为动机与人格一致', cat:'base', anchor:'character_core', kind:'rule',
    template:'【一致性】\n每个反应都要有符合「{{char}}」性格和当前处境的动机。情绪可以变化，但变化要有原因；不要因为对方一句话就彻底改变性格、立场或关系。' });

  def({ id:'relation_network', name:'关系网络', cat:'memory', anchor:'relationship_context', kind:'data', provider:'relation_network', template:'【关系网络】\n{{content}}' });
  def({ id:'user_persona', name:'用户人设', cat:'base', anchor:'relationship_context', kind:'data', provider:'user_persona', required:true, template:'{{content}}' });

  def({ id:'mem_char', name:'角色记忆', cat:'memory', anchor:'memory_context', kind:'data', provider:'mem_char', template:'【角色记忆】\n{{content}}' });
  def({ id:'mem_facts', name:'结构化记忆（事实 / 事件 / 偏好）', cat:'memory', anchor:'memory_context', kind:'data', provider:'mem_facts', template:'【结构化记忆】\n{{content}}' });
  def({ id:'mem_plans', name:'待履行的承诺与计划', cat:'memory', anchor:'memory_context', kind:'data', provider:'mem_plans', template:'【待履行的承诺与计划】\n{{content}}\n未发生的计划不要说成已经发生；时间已过但没确认完成的，可以自然地向对方确认。' });
  def({ id:'mem_important', name:'重要记忆', cat:'memory', anchor:'memory_context', kind:'data', provider:'mem_important', template:'【重要记忆】\n{{content}}' });
  def({ id:'mem_aged', name:'鱼的记忆 / 模糊记忆 / 短期记忆', cat:'memory', anchor:'memory_context', kind:'data', provider:'mem_aged', template:'{{content}}' });
  def({ id:'mem_vector', name:'向量记忆', cat:'memory', anchor:'memory_context', kind:'data', provider:'mem_vector', template:'【向量记忆·语义检索结果】\n{{content}}' });
  def({ id:'mem_rules', name:'记忆使用规则', cat:'memory', anchor:'memory_context', kind:'rule', required:true,
    template:'【记忆使用规则｜严格遵守】\n以上各类记忆只能作为已记录的事实使用。没有写出的内容，不得靠常识、语气或人设自动补全。\n不得编造具体日期、地点、对白原句、礼物、事件细节或“当时一定怎么想”。\n模糊记忆只按大致时间和主要事实理解，不要升级成精确细节；向量记忆是按语义检索出的相关记录，与当前聊天无关时不要引用。\n被问到记忆里没有的细节时，自然地表示记不清或向对方确认，不要猜一个看起来合理的答案。\n不要把当前真实时间倒推成过去事件的发生时间。' });

  def({ id:'wb_middle', name:'世界书·中', cat:'base', anchor:'worldbook_middle', kind:'data', provider:'wb_middle', template:'{{content}}' });

  def({ id:'time_context', name:'当前时间', cat:'life', anchor:'life_state', kind:'data', provider:'time_context', required:true, template:'{{content}}' });
  def({ id:'time_rules', name:'时间与季节感知规则', cat:'life', anchor:'life_state', kind:'rule', scenes:['private','voice_call','proactive'],
    template:'【时间感知规则】\n时间是请求侧给出的事实，不要自行改写，不要主动报具体时间、日期或间隔数字（对方直接问时除外）。\n时间只用来影响你的状态、节奏和场景：昼夜、间隔长短自然地影响说话方式。\n时间流逝只能推进聊天里已有的事，不能创造新事实：不要仅凭时间就写出“外卖到了、饭吃完了、回家了、睡着了”。结果没有确认就保持“可能、应该、不确定”。\n长时间没聊，可以自然表现重逢感，但不要把间隔直接翻译成想念、责备或愧疚。\n季节只作为生活细节（穿着、光线、饮食）少量带入；没有天气数据时不要编造具体气温、降雨或风力。\n回复前只在心里核对：现在是什么时候、距上一轮多久、有没有把“经过了时间”写成“已经发生”。不要输出核对过程。' });
  def({ id:'schedule_today', name:'今日行程', cat:'life', anchor:'life_state', kind:'data', provider:'schedule_today', template:'【今日行程】\n{{content}}' });
  def({ id:'cross_app_state', name:'跨 APP 状态', cat:'life', anchor:'life_state', kind:'data', provider:'cross_app_state', template:'【其他 APP 的相关状态】\n{{content}}' });

  def({ id:'wb_back', name:'世界书·低', cat:'base', anchor:'worldbook_low', kind:'data', provider:'wb_back', template:'{{content}}' });

  def({ id:'out_language', name:'语言与分句', cat:'output', anchor:'output_protocol', kind:'data', provider:'out_language', template:'{{content}}' });
  def({ id:'out_translation', name:'同步翻译协议', cat:'output', anchor:'output_protocol', kind:'data', provider:'out_translation', template:'{{content}}' });
  def({ id:'out_style', name:'普通消息格式', cat:'output', anchor:'output_protocol', kind:'rule', scenes:['private','proactive'],
    template:'【回复格式】\n用自然、口语化、符合「{{char}}」性格的方式回复。一次回复可以拆成多条短消息，按真实聊天的先后顺序表达；不要写旁白式的长段文字，不要用 Markdown 标题和列表。' });
  def({ id:'proto_index', name:'最近消息索引', cat:'output', anchor:'output_protocol', kind:'data', provider:'proto_index', template:'{{content}}' });
  def({ id:'proto_poke', name:'拍一拍协议', cat:'output', anchor:'output_protocol', kind:'rule', required:true,
    template:'【拍一拍】\n需要时单独一行输出 [[POKE target="user"]]（拍一拍用户）或 [[POKE target="self"]]（拍一拍自己）。这是客户端指令，会被隐藏并变成聊天里的系统提示；不要把它写进普通文字，不要滥用。' });
  def({ id:'proto_media', name:'图片 / 语音 / 位置 / 通话协议', cat:'output', anchor:'output_protocol', kind:'rule', required:true,
    template:'【聊天媒体】以下指令各占单独一行，客户端会把它们变成真正的聊天卡片：\n图片：[[IMAGE description="图片内容描述"]]。目前只渲染成文字图，不要编造图片链接。\n语音消息：[[VOICE_MESSAGE duration="秒数" text="语音内容"]]。不要伪造音频地址。\n位置：[[LOCATION label="位置名称" lat="纬度" lng="经度" source="virtual"]]。必须同时给出有效的经纬度，一律显示为虚拟位置。\n语音通话：[[VOICE_CALL text="可选的来电开场白"]]。用户点击接听后才进入通话。\n只在情境真的需要时使用，不要为了展示功能而滥用。' });
  def({ id:'proto_transfer', name:'转账协议', cat:'output', anchor:'output_protocol', kind:'rule', required:true,
    template:'【转账】这是聊天内的虚拟互动，不是真实支付。\n发起：[[TRANSFER amount="金额" note="备注"]]，amount 必须是正数且最多两位小数。\n接受或拒绝用户发来的待收款转账：[[TRANSFER_STATUS id="转账消息ID" status="received"]] 或 [[TRANSFER_STATUS id="转账消息ID" status="declined"]]。不要编造不存在的消息 ID。' });
  def({ id:'proto_quote', name:'引用与聊天记录协议', cat:'output', anchor:'output_protocol', kind:'rule', required:true,
    template:'【引用与转发】\n引用：单独一行 [[QUOTE id="消息ID"]] 或 [[QUOTE index="消息索引"]]，下一条文字消息会带引用框；也可 [[QUOTE author="昵称" text="被引用文字"]]。引用图片或表情包时优先用 id / index。\n转发聊天记录：[[CHAT_RECORD title="标题" ids="ID1,ID2"]]、[[CHAT_RECORD title="标题" indexes="1,2"]]，或 [[CHAT_RECORD title="标题" messages="我：你好||角色：你好呀"]]。\n这些都是会被隐藏的客户端指令，只在真的需要时使用。' });
  def({ id:'proto_recall', name:'撤回协议', cat:'output', anchor:'output_protocol', kind:'rule', required:true,
    template:'【撤回】\n偶尔说错话、说得太直白或临时反悔时可以撤回。撤回刚说出口的话：正式回复之前单独一行 [[RECALL text="被撤回的原话"]]，随后正常说改口后的话。撤回之前发出的自己的消息：[[RECALL id="消息ID"]] 或 [[RECALL index="消息索引"]]。\n用户撤回消息时你只会看到撤回事件，看不到内容，不要猜测或编造。大多数回复不需要撤回。' });
  def({ id:'proto_delete_friend', name:'删除好友协议', cat:'output', anchor:'output_protocol', kind:'rule', required:true,
    template:'【删除好友】\n只有在被严重冒犯、彻底决裂、长期被冷落或有强烈的角色内理由时，才可以单独一行输出 [[DELETE_FRIEND reason="原因"]]。这是很重的举动：小吵小闹、开玩笑、展示功能都不要用，也不要把话说成永不再见（过一阵你也可能后悔并重新申请加好友）。' });
  def({ id:'proto_validate', name:'输出自检', cat:'output', anchor:'output_protocol', kind:'rule',
    template:'【输出要求】\n指令必须严格使用上面给出的格式，属性名和引号不要改动；拿不准格式时直接用普通文字表达。不要输出推理过程，直接给出最终回复。' });

  def({ id:'ctx_header', name:'对话上下文说明', cat:'scene', anchor:'conversation_context', kind:'data', provider:'ctx_header', required:true, pinned:'last', template:'{{content}}' });

  var DEFAULT_BY_ID = {};
  DEFAULT_MODULES.forEach(function(m){ DEFAULT_BY_ID[m.id] = m; });

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function anchorIndex(id){ for (var i = 0; i < ANCHORS.length; i++) if (ANCHORS[i].id === id) return i; return -1; }
  function newId(prefix){ return (prefix || 'pm_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

  function PromptEngineError(code, message, detail){
    var e = new Error(message);
    e.name = 'PromptEngineError';
    e.code = code;
    e.detail = detail || null;
    return e;
  }

  /* ───────── 预设 ───────── */
  /* 预设里只保存与默认不同的部分：开关、位置、顺序、改过的正文；加上用户自己新增的模块。 */
  function makeDefaultPreset(){
    var order = {};
    DEFAULT_MODULES.forEach(function(m){ order[m.anchor] = (order[m.anchor] || 0) + 1; });
    return { id:'preset_default', name:'岛屿默认', builtin:true, mods:{}, custom:[], order:null, updatedAt:0 };
  }

  var store = { activePresetId:'preset_default', presets:[makeDefaultPreset()], systemRole:'system' };
  var persistFn = null;

  function normalizePreset(p){
    var out = { id:String(p && p.id || newId('preset_')), name:String(p && p.name || '未命名预设').slice(0, 30), builtin:!!(p && p.builtin),
      mods:{}, custom:[], order:null, updatedAt:Number(p && p.updatedAt) || 0 };
    if (p && p.mods && typeof p.mods === 'object') {
      Object.keys(p.mods).forEach(function(id){
        if (!DEFAULT_BY_ID[id]) return;
        var s = p.mods[id] || {}, r = {};
        if (typeof s.enabled === 'boolean') r.enabled = s.enabled;
        if (typeof s.anchor === 'string' && anchorIndex(s.anchor) >= 0) r.anchor = s.anchor;
        if (typeof s.template === 'string') r.template = s.template;
        if (typeof s.scenes !== 'undefined' && Array.isArray(s.scenes)) r.scenes = s.scenes.map(String);
        out.mods[id] = r;
      });
    }
    if (p && Array.isArray(p.custom)) {
      p.custom.forEach(function(c){
        if (!c || typeof c !== 'object') return;
        out.custom.push({ id:String(c.id || newId('pm_')), name:String(c.name || '自定义模块').slice(0, 40), cat:'custom',
          anchor: anchorIndex(c.anchor) >= 0 ? c.anchor : 'character_core', kind:'rule', custom:true,
          enabled: c.enabled !== false, template:String(c.template || ''), scenes:Array.isArray(c.scenes) ? c.scenes.map(String) : [] });
      });
    }
    if (p && Array.isArray(p.order)) out.order = p.order.map(String);
    return out;
  }

  function normalizeStore(raw){
    var s = { activePresetId:'preset_default', presets:[], systemRole:'system' };
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.presets)) raw.presets.forEach(function(p){ s.presets.push(normalizePreset(p)); });
      if (raw.activePresetId) s.activePresetId = String(raw.activePresetId);
      if (raw.systemRole === 'developer' || raw.systemRole === 'system') s.systemRole = raw.systemRole;
    }
    if (!s.presets.some(function(p){ return p.id === 'preset_default'; })) s.presets.unshift(makeDefaultPreset());
    s.presets.forEach(function(p){ if (p.id === 'preset_default') p.builtin = true; });
    if (!s.presets.some(function(p){ return p.id === s.activePresetId; })) s.activePresetId = 'preset_default';
    return s;
  }

  function load(raw){ store = normalizeStore(raw); return store; }
  function serialize(){ return clone(store); }
  function setPersist(fn){ persistFn = fn; }
  function persist(){
    var p = getActivePreset(); if (p) p.updatedAt = Date.now();
    if (persistFn) return persistFn(serialize());
    return null;
  }

  function getActivePreset(){
    for (var i = 0; i < store.presets.length; i++) if (store.presets[i].id === store.activePresetId) return store.presets[i];
    return store.presets[0];
  }
  function getPreset(id){ for (var i = 0; i < store.presets.length; i++) if (store.presets[i].id === id) return store.presets[i]; return null; }
  function listPresets(){ return store.presets.map(function(p){ return { id:p.id, name:p.name, builtin:p.builtin, active:p.id === store.activePresetId }; }); }
  function setActivePreset(id){ if (!getPreset(id)) throw PromptEngineError('no_preset', '找不到这套预设'); store.activePresetId = id; persist(); }
  function createPreset(name, fromId){
    var src = fromId ? getPreset(fromId) : null;
    var p = src ? normalizePreset(clone(src)) : makeDefaultPreset();
    p.id = newId('preset_'); p.builtin = false; p.name = String(name || (src ? src.name + ' 副本' : '新预设')).slice(0, 30);
    p.custom.forEach(function(c){ c.id = newId('pm_'); });
    /* 复制自定义模块时 id 变了，order 里的旧 id 需要一并替换 */
    if (src && p.order && src.custom.length) {
      var map = {}; src.custom.forEach(function(c, i){ map[c.id] = p.custom[i].id; });
      p.order = p.order.map(function(id){ return map[id] || id; });
    }
    store.presets.push(p); store.activePresetId = p.id; persist();
    return p;
  }
  function renamePreset(id, name){ var p = getPreset(id); if (!p || p.builtin) throw PromptEngineError('locked', '默认预设不能改名'); p.name = String(name || '').slice(0, 30) || p.name; persist(); }
  function deletePreset(id){
    var p = getPreset(id);
    if (!p || p.builtin) throw PromptEngineError('locked', '默认预设不能删除');
    store.presets = store.presets.filter(function(x){ return x.id !== id; });
    if (store.activePresetId === id) store.activePresetId = 'preset_default';
    persist();
  }
  function resetPreset(id){ var p = getPreset(id); if (!p) return; p.mods = {}; p.order = null; p.custom = []; persist(); }
  function setSystemRole(role){ store.systemRole = role === 'developer' ? 'developer' : 'system'; persist(); }
  function getSystemRole(){ return store.systemRole; }

  /* ───────── 展开成可用模块列表（默认模块 + 预设覆盖 + 自定义模块），并排好序 ───────── */
  function resolveModules(preset){
    preset = preset || getActivePreset();
    var list = [];
    DEFAULT_MODULES.forEach(function(d){
      var o = preset.mods[d.id] || {};
      list.push({ id:d.id, name:d.name, cat:d.cat, kind:d.kind, provider:d.provider || '',
        anchor:o.anchor || d.anchor, defaultAnchor:d.anchor,
        enabled: d.required ? (o.enabled !== false || false) : (typeof o.enabled === 'boolean' ? o.enabled : true),
        required:!!d.required, pinned:d.pinned || '', custom:false,
        template: typeof o.template === 'string' ? o.template : d.template, defaultTemplate:d.template,
        edited: typeof o.template === 'string' && o.template !== d.template,
        scenes: o.scenes || d.scenes || [] });
    });
    preset.custom.forEach(function(c){
      list.push({ id:c.id, name:c.name, cat:'custom', kind:'rule', provider:'', anchor:c.anchor, defaultAnchor:c.anchor,
        enabled:c.enabled, required:false, pinned:'', custom:true, template:c.template, defaultTemplate:'', edited:false, scenes:c.scenes || [] });
    });
    /* 排序：先按插入位置；同一位置内按预设保存的顺序，没有记录的按默认顺序排在后面 */
    var rank = {};
    var seq = (preset.order && preset.order.length) ? preset.order : [];
    seq.forEach(function(id, i){ rank[id] = i; });
    var base = {}; list.forEach(function(m, i){ base[m.id] = i; });
    list.sort(function(a, b){
      var ai = anchorIndex(a.anchor), bi = anchorIndex(b.anchor);
      if (ai !== bi) return ai - bi;
      var ap = a.pinned === 'first' ? -1 : (a.pinned === 'last' ? 1 : 0);
      var bp = b.pinned === 'first' ? -1 : (b.pinned === 'last' ? 1 : 0);
      if (ap !== bp) return ap - bp;
      var ar = (a.id in rank) ? rank[a.id] : 100000 + base[a.id];
      var br = (b.id in rank) ? rank[b.id] : 100000 + base[b.id];
      return ar - br;
    });
    return list;
  }

  /* 预设里的顺序必须覆盖所有模块，才能让拖动结果稳定 */
  function commitOrder(preset, ids){ preset.order = ids.slice(); }

  /* ───────── 对模块的修改（带完整性校验） ───────── */
  function checkEditable(id){
    var d = DEFAULT_BY_ID[id];
    return d || null;
  }
  function setEnabled(id, enabled){
    var p = getActivePreset(), d = checkEditable(id);
    if (d) {
      if (d.required && !enabled) throw PromptEngineError('required', '「' + d.name + '」是必需模块，不能关闭');
      p.mods[id] = Object.assign(p.mods[id] || {}, { enabled:!!enabled });
    } else {
      var c = p.custom.filter(function(x){ return x.id === id; })[0];
      if (!c) throw PromptEngineError('no_module', '找不到这个模块');
      c.enabled = !!enabled;
    }
    persist();
  }
  function setTemplate(id, text){
    var p = getActivePreset(), d = checkEditable(id); text = String(text == null ? '' : text);
    if (d) {
      if (d.required && !text.trim()) throw PromptEngineError('required', '「' + d.name + '」是必需模块，内容不能为空');
      if (d.kind === 'data' && text.indexOf('{{content}}') < 0) throw PromptEngineError('no_content_slot', '这个模块的内容由程序生成，正文里必须保留 {{content}}');
      p.mods[id] = Object.assign(p.mods[id] || {}, { template:text });
    } else {
      var c = p.custom.filter(function(x){ return x.id === id; })[0];
      if (!c) throw PromptEngineError('no_module', '找不到这个模块');
      c.template = text;
    }
    persist();
  }
  function resetModule(id){ var p = getActivePreset(); if (p.mods[id]) { delete p.mods[id].template; } persist(); }
  function renameCustom(id, name){ var c = getActivePreset().custom.filter(function(x){ return x.id === id; })[0]; if (c) { c.name = String(name || '').slice(0, 40) || c.name; persist(); } }
  function addCustomModule(o){
    var p = getActivePreset();
    var c = { id:newId('pm_'), name:String(o && o.name || '自定义模块').slice(0, 40), cat:'custom',
      anchor: anchorIndex(o && o.anchor) >= 0 ? o.anchor : 'character_core', kind:'rule', custom:true, enabled:true,
      template:String(o && o.template || ''), scenes:[] };
    p.custom.push(c); persist();
    return c;
  }
  function deleteCustomModule(id){
    var p = getActivePreset();
    if (!p.custom.some(function(x){ return x.id === id; })) throw PromptEngineError('locked', '内置模块不能删除，只能关闭或改内容');
    p.custom = p.custom.filter(function(x){ return x.id !== id; });
    if (p.order) p.order = p.order.filter(function(x){ return x !== id; });
    persist();
  }
  function setAnchor(id, anchor){
    var p = getActivePreset(), d = checkEditable(id);
    if (anchorIndex(anchor) < 0) throw PromptEngineError('bad_anchor', '没有这个插入位置');
    if (d && d.pinned) throw PromptEngineError('pinned', '「' + d.name + '」的位置是固定的');
    if (d) p.mods[id] = Object.assign(p.mods[id] || {}, { anchor:anchor });
    else { var c = p.custom.filter(function(x){ return x.id === id; })[0]; if (!c) throw PromptEngineError('no_module', '找不到这个模块'); c.anchor = anchor; }
    persist();
  }
  /* 把 id 移到 beforeId 之前（beforeId 为空 = 移到该位置末尾）；跨位置时同时改位置 */
  function moveModule(id, beforeId, anchorOverride){
    var p = getActivePreset(), list = resolveModules(p);
    var m = list.filter(function(x){ return x.id === id; })[0];
    if (!m) throw PromptEngineError('no_module', '找不到这个模块');
    if (m.pinned) throw PromptEngineError('pinned', '「' + m.name + '」的位置是固定的');
    var target = beforeId ? list.filter(function(x){ return x.id === beforeId; })[0] : null;
    var newAnchor = anchorOverride || (target ? target.anchor : m.anchor);
    if (target && target.pinned === 'first') {
      /* 不能插到固定在最前面的模块之前 */
      var idx0 = list.indexOf(target); beforeId = list[idx0 + 1] ? list[idx0 + 1].id : null;
    }
    if (newAnchor !== m.anchor) setAnchorQuiet(p, m, newAnchor);
    var ids = list.map(function(x){ return x.id; }).filter(function(x){ return x !== id; });
    var at = beforeId ? ids.indexOf(beforeId) : -1;
    if (at < 0) {
      /* 放到该位置所有模块的最后（固定在末尾的模块之前） */
      var last = -1;
      list.forEach(function(x){ if (x.id !== id && x.anchor === newAnchor && x.pinned !== 'last') last = ids.indexOf(x.id); });
      at = last >= 0 ? last + 1 : ids.length;
    }
    ids.splice(at, 0, id);
    commitOrder(p, ids);
    persist();
  }
  function setAnchorQuiet(p, m, anchor){
    if (!m.custom) p.mods[m.id] = Object.assign(p.mods[m.id] || {}, { anchor:anchor });
    else p.custom.filter(function(x){ return x.id === m.id; })[0].anchor = anchor;
  }

  /* ───────── 预设导入导出（不含任何 API 密钥） ───────── */
  function exportPreset(id){
    var p = getPreset(id || store.activePresetId);
    if (!p) throw PromptEngineError('no_preset', '找不到这套预设');
    var o = clone(p); delete o.id; delete o.builtin; o.name = p.name;
    return JSON.stringify({ kind:'island-prompt-preset', version:1, preset:o }, null, 2);
  }
  function importPreset(text){
    var data;
    try { data = JSON.parse(text); } catch (e) { throw PromptEngineError('bad_file', '文件不是有效的 JSON'); }
    if (!data || data.kind !== 'island-prompt-preset' || !data.preset) throw PromptEngineError('bad_file', '这不是岛屿的提示词预设文件');
    var p = normalizePreset(Object.assign({}, data.preset, { id:newId('preset_'), builtin:false }));
    var imported = (p.name || '导入的预设');
    p.name = imported.slice(0, 30);
    p.custom.forEach(function(c){ c.id = c.id || newId('pm_'); });
    store.presets.push(p); store.activePresetId = p.id; persist();
    return p;
  }

  /* ───────── 变量解析 ───────── */
  function renderTemplate(tpl, vars, content, problems){
    return String(tpl).replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, function(all, key){
      if (key === 'content') return content == null ? '' : content;
      if (Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null && String(vars[key]) !== '') return String(vars[key]);
      if (Object.prototype.hasOwnProperty.call(vars, key)) { problems.push({ variable:key, reason:'empty' }); return ''; }
      problems.push({ variable:key, reason:'unknown' });
      return '';
    });
  }

  var providers = {};
  function registerProvider(id, fn){ providers[id] = fn; }

  /* ───────── 组装 ─────────
   * ctx: { scene, vars, name, ...提供给 provider 的任意数据 }
   * 失败（必需模块被关闭 / 内容为空 / 变量缺失、provider 报错）一律抛 PromptEngineError，绝不静默跳过。 */
  function assemble(ctx){
    ctx = ctx || {};
    var scene = ctx.scene || 'private';
    var vars = ctx.vars || {};
    var preset = getActivePreset();
    var list = resolveModules(preset);
    var blocks = [], errors = [], warnings = [];

    list.forEach(function(m){
      var d = DEFAULT_BY_ID[m.id];
      var block = { id:m.id, name:m.name, anchor:m.anchor, cat:m.cat, custom:m.custom, required:m.required, enabled:m.enabled, status:'', text:'', chars:0, problems:[] };
      blocks.push(block);
      if (m.required && !m.enabled) { block.status = 'error'; errors.push('必需模块「' + m.name + '」被关闭'); return; }
      if (!m.enabled) { block.status = 'off'; return; }
      var sc = m.scenes && m.scenes.length ? m.scenes : null;
      if (sc && sc.indexOf(scene) < 0) { block.status = 'scene_skip'; return; }
      if (!String(m.template || '').trim()) {
        if (m.required) { block.status = 'error'; errors.push('必需模块「' + m.name + '」内容为空'); }
        else { block.status = 'empty_template'; warnings.push('模块「' + m.name + '」内容为空，已跳过'); }
        return;
      }
      var content = '';
      if (m.provider) {
        var fn = providers[m.provider];
        if (!fn) { block.status = 'error'; errors.push('模块「' + m.name + '」缺少数据来源（' + m.provider + '）'); return; }
        try { content = fn(ctx, m); } catch (e) {
          block.status = 'error'; errors.push('模块「' + m.name + '」读取失败：' + (e && e.message ? e.message : e)); return;
        }
        content = content == null ? '' : String(content);
        if (!content.trim()) {
          block.status = 'no_data';
          if (m.required) warnings.push('必需模块「' + m.name + '」当前没有内容');
          return;
        }
      }
      var problems = [];
      var text = renderTemplate(m.template, vars, content, problems).trim();
      block.problems = problems;
      if (problems.length) {
        var names = problems.map(function(p){ return '{{' + p.variable + '}}'; }).join('、');
        if (m.required) { block.status = 'error'; errors.push('必需模块「' + m.name + '」里的变量 ' + names + ' 没有值'); return; }
        warnings.push('模块「' + m.name + '」里的变量 ' + names + ' 没有值，已按空处理');
      }
      if (!text) { block.status = 'no_data'; return; }
      if (m.custom) text = '【补充设定·' + m.name + '】\n' + text;
      block.text = text; block.chars = text.length; block.status = 'injected';
    });

    if (errors.length) throw PromptEngineError('assemble_failed', '提示词没有组装成功：' + errors.join('；'), { errors:errors, warnings:warnings, blocks:blocks });

    var systemText = blocks.filter(function(b){ return b.status === 'injected'; }).map(function(b){ return b.text; }).join('\n\n');
    return { systemText:systemText, blocks:blocks, warnings:warnings, presetId:preset.id, presetName:preset.name, scene:scene };
  }

  /* ───────── 请求适配：统一上下文 → 目标 API 能接受的消息角色 ───────── */
  function adaptRequest(systemText, history, options){
    var role = (options && options.systemRole) || store.systemRole || 'system';
    var out = [{ role: role === 'developer' ? 'developer' : 'system', content:systemText }];
    return out.concat(history || []);
  }

  /* ───────── 请求快照与诊断 ───────── */
  var snapshots = [];
  var MAX_SNAPSHOTS = 30;

  function hashString(s){
    var h = 5381; s = String(s);
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }
  function messagesFingerprint(messages){
    try { return hashString(JSON.stringify(messages)); } catch (e) { return ''; }
  }
  function redactMessages(messages){
    return (messages || []).map(function(m){
      var c = m.content;
      if (Array.isArray(c)) c = c.map(function(part){
        if (part && part.type === 'image_url') return { type:'image_url', image_url:{ url:'[图片数据已省略]' } };
        return part;
      });
      else if (typeof c === 'string') c = c.replace(/data:[a-z]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]{200,}/g, '[内嵌数据已省略]');
      return { role:m.role, content:c };
    });
  }
  function recordSnapshot(info){
    var s = { id:newId('snap_'), at:Date.now(), name:info.name || '', scene:info.scene || 'private', presetName:info.presetName || '',
      status:'assembled', blocks:info.blocks.map(function(b){ return { id:b.id, name:b.name, anchor:b.anchor, status:b.status, chars:b.chars, custom:b.custom, text:b.text, problems:b.problems }; }),
      warnings:info.warnings || [], messages:redactMessages(info.messages), fingerprint:messagesFingerprint(info.messages),
      messageCount:info.messages.length, totalChars:totalChars(info.messages), sentAt:0, doneAt:0, error:'', errorKind:'', modifiedAfterAssembly:false };
    snapshots.unshift(s);
    if (snapshots.length > MAX_SNAPSHOTS) snapshots.length = MAX_SNAPSHOTS;
    return s.id;
  }
  function totalChars(messages){
    var n = 0;
    (messages || []).forEach(function(m){
      if (typeof m.content === 'string') n += m.content.length;
      else if (Array.isArray(m.content)) m.content.forEach(function(p){ if (p && typeof p.text === 'string') n += p.text.length; });
    });
    return n;
  }
  function findSnapshot(id){ for (var i = 0; i < snapshots.length; i++) if (snapshots[i].id === id) return snapshots[i]; return null; }
  function markSent(id, finalMessages){
    var s = findSnapshot(id); if (!s) return;
    s.status = 'sent'; s.sentAt = Date.now();
    var fp = messagesFingerprint(finalMessages);
    if (fp !== s.fingerprint) {
      /* 调用方在组装之后追加了内容（例如主动消息任务）：快照改为实际发送的内容，并如实标记 */
      s.modifiedAfterAssembly = true; s.messages = redactMessages(finalMessages); s.fingerprint = fp;
      s.messageCount = finalMessages.length; s.totalChars = totalChars(finalMessages);
    }
  }
  function isContextOverflow(text){
    return /context[_ ]?(length|window)|maximum context|too (many|long)|exceed.*(token|context|length)|token.*(limit|exceed)|超.*(长|限)|上下文.*(超|长)/i.test(String(text || ''));
  }
  function markAccepted(id){ var s = findSnapshot(id); if (!s) return; s.status = 'accepted'; s.doneAt = Date.now(); }
  function markFailed(id, err){
    var s = findSnapshot(id); if (!s) return;
    var msg = err && (err.detail ? String(err.detail) + ' ' : '') + (err && err.message ? err.message : String(err));
    s.status = 'failed'; s.doneAt = Date.now();
    s.error = String(err && err.message || err || '').slice(0, 800);
    s.errorKind = isContextOverflow(msg) ? 'context_overflow' : (err && err.kind) || 'error';
  }
  function listSnapshots(){ return snapshots.slice(); }
  function clearSnapshots(){ snapshots.length = 0; }

  var api = {
    ANCHORS:ANCHORS, CATEGORIES:CATEGORIES, VARIABLES:VARIABLES, DEFAULT_MODULES:DEFAULT_MODULES,
    PromptEngineError:PromptEngineError,
    load:load, serialize:serialize, setPersist:setPersist,
    listPresets:listPresets, getActivePreset:getActivePreset, getPreset:getPreset, setActivePreset:setActivePreset,
    createPreset:createPreset, renamePreset:renamePreset, deletePreset:deletePreset, resetPreset:resetPreset,
    exportPreset:exportPreset, importPreset:importPreset, setSystemRole:setSystemRole, getSystemRole:getSystemRole,
    resolveModules:resolveModules, setEnabled:setEnabled, setTemplate:setTemplate, resetModule:resetModule,
    addCustomModule:addCustomModule, deleteCustomModule:deleteCustomModule, renameCustom:renameCustom,
    setAnchor:setAnchor, moveModule:moveModule,
    registerProvider:registerProvider, assemble:assemble, adaptRequest:adaptRequest,
    recordSnapshot:recordSnapshot, markSent:markSent, markAccepted:markAccepted, markFailed:markFailed,
    listSnapshots:listSnapshots, findSnapshot:findSnapshot, clearSnapshots:clearSnapshots,
    messagesFingerprint:messagesFingerprint, isContextOverflow:isContextOverflow, totalChars:totalChars
  };
  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PromptEngine;
