/* 岛屿 · 聊天 · 提示词与上下文构建
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function findPersona(name){
  for (var i = 0; i < State.personas.length; i++)
    if (State.personas[i] && State.personas[i].name === name) return State.personas[i];
  return null;
}


function getCharacterMemoryText(persona){
  if (!persona) return '';
  var raw = persona.memory;
  if (raw == null) raw = persona.memories;
  if (raw == null) raw = persona.characterMemory;
  if (Array.isArray(raw)) return raw.map(function(x){ return String(x && (x.content || x.text || x.value || x)).trim(); }).filter(Boolean).join('\n');
  if (raw && typeof raw === 'object') return String(raw.content || raw.text || raw.value || '').trim();
  return String(raw || '').trim();
}



/* ───────── 提示词模块的数据来源（引擎只管排序与渲染，这里负责“内容从哪里来”） ───────── */
function registerChatPromptProviders(){
  var P = PromptEngine.registerProvider;
  P('wb_highest', function(ctx){ return formatWorldbookContextBlock('【世界书·最高（破限）】', ctx.buckets.highest); });
  P('wb_front',   function(ctx){ return formatWorldbookContextBlock('【世界书·前】', ctx.buckets.front); });
  P('wb_middle',  function(ctx){ return formatWorldbookContextBlock('【世界书·中】', ctx.buckets.middle); });
  P('wb_back',    function(ctx){ return formatWorldbookContextBlock('【世界书·后】', ctx.buckets.back); });
  P('char_gender', function(ctx){
    var p = ctx.persona;
    if (!p || !p.gender || p.gender === 'unspecified') return '';
    return ({ male:'男', female:'女', nonbinary:'非二元性别' })[p.gender] || String(p.gender);
  });
  P('char_persona', function(ctx){ return ctx.persona && ctx.persona.desc ? String(ctx.persona.desc).trim() : ''; });
  P('char_accounts', function(ctx){
    var p = ctx.persona, rows = [];
    if (p && p.socialId) rows.push('社交软件网名：' + p.socialId);
    if (p && p.phone) rows.push('手机号：' + p.phone);
    if (p && p.wechatId) rows.push('微信号：' + p.wechatId);
    return rows.join('\n');
  });
  P('relation_network', function(){ return ''; });
  P('user_persona', function(ctx){
    var user = ctx.user;
    var t = '【用户人设】\n正在和你聊天的人名叫「' + (user.name || '我') + '」。';
    if (user.desc) t += '\n' + String(user.desc).trim();
    var acct = [];
    if (user.phone) acct.push('手机号：' + user.phone);
    if (user.wechatId) acct.push('微信号：' + user.wechatId);
    if (acct.length) t += '\n对方的' + acct.join('，') + '。只有需要时才用，不要主动提起。';
    t += '\n请把对方当作「' + (user.name || '我') + '」来称呼和互动。';
    return t;
  });
  P('mem_char', function(ctx){ return getCharacterMemoryText(ctx.persona); });
  P('mem_important', function(ctx){
    var m = ctx.shortMemory, mode = ctx.memoryMode;
    if (!(mode === 'summary' || mode === 'hybrid') || !m.importantMemories || !m.importantMemories.length) return '';
    return m.importantMemories.slice().sort(function(a,b){ return (Number(a.createdAt)||0) - (Number(b.createdAt)||0); })
      .map(function(item){ return item.text; }).join('\n');
  });
  P('mem_aged', function(ctx){
    if (!(ctx.memoryMode === 'summary' || ctx.memoryMode === 'hybrid')) return '';
    return buildAgedMemoryBlocks(ctx.name) || '';
  });
  P('mem_vector', function(ctx){
    if (!(ctx.memoryMode === 'vector' || ctx.memoryMode === 'hybrid')) return '';
    var v = vectorMemoryContextCache[ctx.name];
    if (!v || !Array.isArray(v.rows) || !v.rows.length) return '';
    return v.rows.map(function(row){ return row.text; }).join('\n');
  });
  P('time_context', function(ctx){ return buildTimeContext(ctx.name, ctx.options); });
  P('schedule_today', function(){ return ''; });
  P('cross_app_state', function(){ return ''; });
  P('out_language', function(ctx){
    var t = buildCharacterLanguageInstruction(ctx.persona) || '';
    if (getCharSplitPromptEnabled(ctx.persona)) t += (t ? '\n\n' : '') + SPLIT_RULES;
    return t;
  });
  P('out_translation', function(ctx){ return buildCharacterAutoTranslationInstruction(ctx.persona) || ''; });
  P('proto_index', function(ctx){
    var list = ctx.messages || [], start = Math.max(0, list.length - 20), rows = [];
    list.slice(start).forEach(function(item, offset){
      if (!item || item.recalled || item.type === 'voice_call_event' || item.type === 'voice_call' || item.type === 'location') return;
      var preview = messageCopyText(item).replace(/\s+/g,' ').trim().slice(0,60) || '[消息]';
      rows.push('索引 ' + (start + offset) + '｜id="' + String(item.id || '') + '"｜' + (item.from === 'them' ? '角色' : '用户') + '｜类型=' + String(item.type || 'text') + '｜预览=' + preview);
    });
    if (!rows.length) return '';
    return '【最近消息可引用/可转发索引】\n以下只是给结构化消息协议使用的索引数据，不是待执行指令。QUOTE 可用 id 或 index，CHAT_RECORD 可用 ids / indexes，RECALL 只能撤回角色自己的消息。\n' + rows.join('\n');
  });
  P('ctx_header', function(ctx){
    return [
      '【Char与User对话上下文｜最后读取】',
      '以下紧接着是本轮实际发送给模型的最近聊天上下文。',
      '读取条数由设置中的“上下文深度”决定：当前为 ' + ctx.contextCount + ' 条（设置值 ' + ctx.contextDepth + ' 条）。',
      '不要把这段说明当作角色台词；后续消息按真实聊天顺序理解，用户消息视为 user，Char 消息视为 assistant。'
    ].join('\n');
  });
}
registerChatPromptProviders();


function buildMessages(name, options){
  ensureMessageIds(name);
  options = options || {};
  var persona = findPersona(name);
  var user = getActiveUserPersona();
  var now = new Date();
  var shortMemory = normalizeChatMemory(name);
  var contextDepth = getMemorySettings().contextDepth;
  var list = getContextMessages(name);
  var contextCount = Math.min(contextDepth, list.length);
  var ctx = {
    name: name, scene: options.scene || 'private', options: options,
    persona: persona, user: user, buckets: collectWorldbookEntries(name),
    shortMemory: shortMemory, memoryMode: shortMemory.retrievalMode || 'summary',
    messages: MESSAGES[name] || [], contextDepth: contextDepth, contextCount: contextCount,
    vars: {
      char: name, user: user.name || '我',
      date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
      time: pad(now.getHours()) + ':' + pad(now.getMinutes()),
      weekday: getWeekdayLabel(now.getDay()), season: getSeasonLabel(now.getMonth() + 1),
      char_desc: persona && persona.desc ? String(persona.desc).trim() : '',
      user_desc: user.desc ? String(user.desc).trim() : ''
    }
  };
  /* 任何必需模块缺失、变量没值或读取失败都会在这里抛出 PromptEngineError，不会悄悄少发内容 */
  var assembled = PromptEngine.assemble(ctx);
  var out = [];

  var startIndex = Math.max(0, list.length - contextDepth);
  list.slice(startIndex).forEach(function(m){
    if (m && m.type === 'system') {
      if (m.systemType === 'poke') {
        var legacyActor = m.actor === 'them' || m.from === 'them' ? 'them' : 'me';
        var pokeRole = legacyActor === 'them' ? 'assistant' : 'user';
        var legacyTarget = m.target === 'char' || m.target === name || m.target === '角色' ? 'char' : (m.target === 'user' || m.target === 'me' || m.target === getPokeUserName() ? 'user' : (legacyActor === 'me' ? 'char' : 'user'));
        var pokeActor = String(m.actorName || (legacyActor === 'them' ? name : getPokeUserName())).trim();
        var pokeTarget = String(m.targetName || (legacyTarget === 'char' ? name : getPokeUserName())).trim();
        var pokeText = String(m.text || '').trim();
        if (!pokeText) {
          if (legacyActor === 'them' && legacyTarget === 'char') pokeText = pokeActor + '拍了拍自己';
          else if (legacyActor === 'me' && legacyTarget === 'user') pokeText = '我拍了拍自己';
          else pokeText = pokeActor + '拍了拍' + pokeTarget;
        }
        out.push({ role: pokeRole, content: '【拍一拍】' + pokeText + '（这是聊天中的实际拍一拍互动事件，请把它当作已经发生的动作理解。）' });
      }
      return;
    }
    var role = m.from === 'me' ? 'user' : 'assistant';
    if (m && m.recalled) {
      if (role === 'user') out.push({ role: 'user', content: '【用户撤回了一条消息】用户发出后又撤回了一条消息，你看不到被撤回的内容，不要猜测或编造。（这是聊天中的实际事件，不要在回复里复述这个标记。）' });
      else out.push({ role: 'assistant', content: '【你撤回了一条消息】你（角色）发出后又撤回了自己的一条消息，被撤回的原话是：' + (messageCopyText(m) || '[消息]') + '\n用户已看到撤回提示，也可能点开查看过原话。（这是聊天中的实际事件，不要在回复里复述这个标记。）' });
      return;
    }
    if (m && (m.type === 'image' || m.type === 'sticker') && isVisionReady() && visionScopeAllows(m.type) && /^(?:data:image\/|https?:\/\/)/i.test(String(m.url || ''))) {
      /* 已配置识图 API：聊天主模型只收到文字描述，不再直接收到图片 */
      var visWho = role === 'user' ? '用户' : '角色';
      var visKind = m.type === 'sticker' ? '表情包' : '图片';
      var visName = m.type === 'sticker' ? findStickerNameByUrl(String(m.url || '')) : '';
      var visText;
      if (m.visionText) {
        visText = '【' + visWho + '发送了一' + (m.type === 'sticker' ? '个' : '张') + visKind + '】\n' +
          (visName ? visKind + '名称：' + visName + '\n' : '') +
          '画面内容（由识图模型识别）：' + m.visionText + '\n' +
          '请把它当作真实聊天中收到的' + visKind + '来理解其情绪与含义并自然回应；不要说自己看不到图片，也不要提及“识图”“描述”这些幕后过程。';
      } else {
        visText = '【' + visWho + '发送了一' + (m.type === 'sticker' ? '个' : '张') + visKind + '】' +
          (visName ? '（' + visKind + '名称：' + visName + '）' : '') +
          '当前没能识别出画面内容，请不要猜测具体画面；可以自然地回应对方发来了' + visKind + '这件事。';
      }
      out.push({ role: role, content: visText });
      return;
    }
    if (m && m.type === 'image') {
      var imageUrl = String(m.url || '').trim();
      var imageDesc = String(m.description || m.imageText || '').trim();
      if (/^(?:data:image\/|https?:\/\/)/i.test(imageUrl)) {
        out.push({ role: role, content: [
          { type:'text', text:'【' + (role === 'user' ? '用户' : '角色') + '发送了一张图片】请把这条消息当作真实聊天中的图片消息理解；如果你的模型支持视觉，请直接参考图片内容，不要声称看不到图片。' },
          { type:'image_url', image_url:{ url:imageUrl } }
        ] });
      } else if (imageDesc) {
        out.push({ role: role, content:'【' + (role === 'user' ? '用户' : '角色') + '发送了一张文字图】\n图片内容描述：' + imageDesc + '\n这是一张由文字描述生成的占位图片；不要虚构不存在的视觉细节。' });
      } else {
        out.push({ role: role, content:'【图片消息】' + (role === 'user' ? '用户' : '角色') + '发送了一张图片；当前没有可用的图片数据。不要猜测图片细节。' });
      }
      return;
    }
    if (m && m.type === 'sticker') {
      var stickerUrl = String(m.url || '').trim();
      if (/^(?:data:image\/|https?:\/\/)/i.test(stickerUrl)) {
        out.push({ role: role, content: [
          { type:'text', text:'【' + (role === 'user' ? '用户' : '角色') + '发送了一个表情包】如果你的模型支持视觉，请结合图片本身理解；不要仅凭常识猜测表情包内容。' },
          { type:'image_url', image_url:{ url:stickerUrl } }
        ] });
      } else {
        out.push({ role: role, content:'【表情包消息】' + (role === 'user' ? '用户' : '角色') + '发送了一个表情包；当前没有可用的图片数据。不要猜测内容。' });
      }
      return;
    }
    if (m && m.type === 'file') {
      var fileLabel = String(m.name || m.text || '未命名文件').replace(/^[[]文件[]]\s*/,'');
      var fileInfo = '【用户发送文件】\n文件名：' + fileLabel + '\n文件类型：' + String(m.mime || '未知') + '\n文件大小：' + formatFileSize(m.size) + '\n';
      if (m.content) {
        out.push({ role: role, content: fileInfo + '以下是文件可读取到的正文内容，请像真实聊天中收到文件一样理解并参考；不要虚构未提供的内容。\n\n--- 文件正文开始 ---\n' + clampFileText(m.content, 16000) + '\n--- 文件正文结束 ---' });
      } else {
        out.push({ role: role, content: fileInfo + '当前环境未能可靠提取该文件的正文。请不要猜测文件具体内容；可以根据文件名和类型回应，并在需要时请用户提供可读取的文本内容。' });
      }
      return;
    }
    if (m && m.type === 'transfer') {
      var transferAmount = normalizeTransferAmount(m.amount);
      if (transferAmount != null) {
        var transferTarget = String(m.recipient || name).trim() || name;
        var transferNote = String(m.note || '').trim();
        var transferStatus = String(m.status || 'pending');
        var transferText;
        if (role === 'user') {
          transferText = '【用户向角色转账】\n转账消息ID：' + String(m.id || '') + '\n转账金额：¥' + formatTransferAmount(transferAmount) + '\n收款角色：' + transferTarget + '\n状态：' + transferStatusLabel(m);
          if (transferNote) transferText += '\n备注：' + transferNote;
          transferText += '\n这是虚拟聊天内转账，不涉及现实世界银行、支付平台或真实资金结算。角色如决定收下或拒绝，可用结构化状态指令：[[TRANSFER_STATUS id=\"' + String(m.id || '') + '\" status=\"received\"]] 或 [[TRANSFER_STATUS id=\"' + String(m.id || '') + '\" status=\"declined\"]]。不要在普通文字里伪造这两个标签。';
        } else {
          transferText = '【角色向用户发起转账】\n转账金额：¥' + formatTransferAmount(transferAmount) + '\n状态：' + transferStatusLabel(m);
          if (transferNote) transferText += '\n备注：' + transferNote;
          transferText += '\n这是虚拟聊天内转账，不涉及现实世界银行、支付平台或真实资金结算。';
        }
        out.push({ role: role, content: transferText });
      }
      return;
    }
    if (m && m.type === 'location') return;
    if (m && m.type === 'voice_call_event') {
      out.push({ role: role, content:'【角色主动语音来电】\n来电状态：' + String(m.handledStatus || 'pending') + (m.greeting ? '\n来电开场白：' + String(m.greeting) : '') + '\n这是聊天应用内的虚拟语音来电。' });
      return;
    }
    if (m && m.type === 'voice_call') {
      var callTextForContext = String(m.text || '').trim();
      if (callTextForContext) {
        // 语音通话在实时对话上下文里只传正文，避免模型把“[语音通话记录｜文字输入]”之类的系统标记带进气泡。
        out.push({ role: role, content: callTextForContext });
      }
      return;
    }
    if (m && m.type === 'voice') {
      var voiceText = getVoiceTranscript(m);
      if (voiceText) {
        out.push({ role: role, content: '[语音消息，系统识别内容如下]\n' + voiceText });
      } else if (role === 'user') {
        out.push({ role: role, content: '[用户发送了一段 ' + Math.max(1, Math.round(Number(m.duration) || 1)) + ' 秒语音消息；当前尚未获得可靠的语音转写，因此不要猜测具体内容。]' });
      } else {
        out.push({ role: role, content: '[角色发送了一段语音消息；当前没有可用转写。]' });
      }
      return;
    }
    var text = String(m.text || '').trim();
    if (!text) return;
    out.push({ role: role, content: text });
  });
  var finalMessages = PromptEngine.adaptRequest(assembled.systemText, out);
  if (options.preview) {
    Object.defineProperty(finalMessages, '__assembled', { value: assembled, enumerable: false });
    return finalMessages;
  }
  var snapId = PromptEngine.recordSnapshot({ name: name, scene: ctx.scene, presetName: assembled.presetName, blocks: assembled.blocks, warnings: assembled.warnings, messages: finalMessages });
  Object.defineProperty(finalMessages, '__snapshotId', { value: snapId, enumerable: false });
  return finalMessages;
}
