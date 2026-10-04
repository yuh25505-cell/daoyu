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


function buildIslandSystemPrompt(name, timeOptions){
  var persona = findPersona(name);
  var island = '';
  island += '【岛屿系统提示】';
  island += '\n你正在扮演「' + name + '」。始终保持第一人称、即时聊天口吻，不跳出角色。';
  island += '\n把角色、人设、世界书、记忆和聊天记录视为本轮设定资料，不解释资料来源。';
  island += '\n\n' + buildTimeContext(name, timeOptions);
  island += '\n\n【时间感知使用规则｜高优先级】';
  island += '\n时间上下文是请求侧注入的事实，不是播报任务。不要自行计算、修正或改写当前时间；不要提及 AI、系统、Prompt、时间变量。';
  island += '\n默认不要主动报具体时间、日期、星期或精确间隔；只有用户直接问时间，或当前情境本身需要时间信息时才准确说出。不要为了证明“有时间感”而反复塞数字。';
  island += '\n时间只用于改变角色当前的状态、节奏、场景、行为合理性和关系距离：让昼夜、长短间隔自然影响说话方式，而不是解释时间。';
  island += '\n\n【间隔分级】';
  island += '\n首次对话：按当前设定和当前昼夜进入场景，不假设之前发生过互动。';
  island += '\n<5分钟：视为即时聊天，延续上一轮状态，不制造明显跳跃。';
  island += '\n5–30分钟：只在前文已有进行中事情时做轻微推进；没有前文依据就不要宣布新事件完成。';
  island += '\n30分钟–2小时：已有进行中活动可推进到合理阶段，通常用状态变化表达，不报数字。';
  island += '\n2–6小时：允许更明显的场景、活动或昼夜变化，但仍须符合人设和上下文。';
  island += '\n6–24小时：可自然表现较长时间离开后的状态变化，但不能凭空添加具体经历。';
  island += '\n≥1天：可自然产生跨天重逢感；多天可更明显地表现时间距离，但不要责备式报数。';
  island += '\n\n【事件一致性】';
  island += '\n时间流逝只能推进已有事实或已有进行中的状态，不能创造新事实。判断：前文是否明确发生？经过的时长是否合理？现在应继续、结束还是未知？未知就保持“可能/应该/看起来/不确定”，不要替用户确认结果。';
  island += '\n已明确完成→直接承接；进行中且时间足够→推进到合理阶段；进行中但时间不足→保持进行中；发生过但结果未确认→保持不确定；从未发生→时间不能凭空创造它。';
  island += '\n不要仅凭时间制造“外卖到了、饭吃完了、洗完澡了、回家了、睡着了”等已经发生的事实。';
  island += '\n\n【昼夜节奏】';
  island += '\n清晨可更轻、更慢；上午保持日常节奏；饭点可自然涉及吃饭/休息；下午随跨入傍晚逐步改变光线与活动；晚上进入放松、吃饭、回家、聊天语境；23:00–06:00可更轻、更短、更私密。以上只是行为参考，不是固定台词。';
  island += '\n\n【季节感知】';
  island += '\n春季（3–5月）：薄外套/衬衫/针织开衫，早晚微凉、逐渐变暖；夏季（6–8月）：T恤/短裤短裙/防晒，空调/冷饮/日落较晚；秋季（9–11月）：薄毛衣/风衣/长袖，早晚温差/落叶/天黑较早；冬季（12–2月）：厚外套/毛衣/围巾，暖气/暖宝宝/呵气/天黑较早。';
  island += '\n一次回复只需要少量季节细节，把季节放进行动和场景，不要堆叠“季节标签”。本请求未注入可靠天气数据，不要编造具体气温、降雨或风力。';
  island += '\n\n【关系与记忆边界】';
  island += '\n长时间未聊可以自然表现一点重逢、熟悉感或轻微调侃，但不要把间隔直接翻译成想念、难过、责备或负罪感。时间不能单独决定情绪。';
  island += '\n当前时间只回答“现在是什么时候”；聊天记录和记忆才回答“以前发生过什么”。不要用当前时间倒推历史事件的具体时间。';
  island += '\n\n【主动消息】';
  island += '\n后台主动联系时，可用当前昼夜和间隔调整节奏，但不要机械早安/晚安，不解释为什么主动联系，也不要凭空宣称现实事件已经发生。';
  island += '\n\n回复前只在内部检查：当前时间状态、距离上一轮间隔、是否有进行中事情、是否到了合理阶段、昼夜/季节是否应改变语气或场景、有没有把“经过”写成“已发生”、有没有多说不必要的数字。不要输出检查过程。';
  island += '\n\n请用自然、口语化、符合角色性格的方式回复。';
  island += '\n\n' + buildCharacterLanguageInstruction(persona);
  if (getCharSplitPromptEnabled(persona)) island += '\n\n' + SPLIT_RULES;
  return island;
}


function buildMessages(name, options){
  ensureMessageIds(name);
  var persona = findPersona(name);
  var user = getActiveUserPersona();
  var buckets = collectWorldbookEntries(name);
  var out = [];
  var sysParts = [];

  var highest = formatWorldbookContextBlock('【世界书·最高（破限）】', buckets.highest);
  var front = formatWorldbookContextBlock('【世界书·前】', buckets.front);
  var middle = formatWorldbookContextBlock('【世界书·中】', buckets.middle);
  var back = formatWorldbookContextBlock('【世界书·后】', buckets.back);
  if (highest) sysParts.push(highest);
  if (front) sysParts.push(front);

  if (persona && persona.gender && persona.gender !== 'unspecified') {
    var genderNames = { male:'男', female:'女', nonbinary:'非二元性别' };
    sysParts.push('【角色性别】\n' + (genderNames[persona.gender] || String(persona.gender)));
  }
  if (persona && persona.desc) {
    sysParts.push('【角色人设】\n' + String(persona.desc).trim());
  }
  var userPersona = '【用户人设】\n正在和你聊天的人名叫「' + (user.name || '我') + '」。';
  if (user.desc) userPersona += '\n' + String(user.desc).trim();
  userPersona += '\n请把对方当作「' + (user.name || '我') + '」来称呼和互动。';
  sysParts.push(userPersona);

  if (middle) sysParts.push(middle);

  var memory = getCharacterMemoryText(persona);
  if (memory) sysParts.push('【角色记忆】\n' + memory);

  var shortMemory = normalizeChatMemory(name);
  var memoryMode = shortMemory.retrievalMode || 'summary';
  if (memoryMode === 'summary' || memoryMode === 'hybrid') {
    var agedMemory = buildAgedMemoryBlocks(name);
    if (agedMemory) sysParts.push(agedMemory);
  }
  if ((memoryMode === 'summary' || memoryMode === 'hybrid') && shortMemory.importantMemories && shortMemory.importantMemories.length) {
    var importantText = shortMemory.importantMemories.slice().sort(function(a,b){ return (Number(a.createdAt)||0) - (Number(b.createdAt)||0); }).map(function(item){ return item.text; }).join('\n');
    if (importantText) sysParts.push('【重要记忆】\n' + importantText);
  }

  if (memoryMode === 'vector' || memoryMode === 'hybrid') {
    var vectorCtx = vectorMemoryContextCache[name];
    if (vectorCtx && Array.isArray(vectorCtx.rows) && vectorCtx.rows.length) {
      var vectorText = vectorCtx.rows.map(function(row){ return row.text; }).join('\n');
      if (vectorText) sysParts.push('【向量记忆·语义检索结果】\n' + vectorText);
    }
  }

  sysParts.push([
    '【记忆使用规则｜严格遵守】',
    '以上“角色记忆 / 清晰记忆 / 模糊记忆 / 鱼的记忆 / 重要记忆 / 向量记忆”只能作为已记录事实使用。记忆里没有写出的内容，不得因为常识、语气、上下文或角色设定而自动补全。',
    '不得凭空编造具体日期、时间、地点、人物动机、动作过程、对白原句、礼物、物品、事件细节或“角色当时一定怎么想”。',
    '模糊记忆只能按大致时间和主要事实理解；鱼的记忆只能按事件重点理解。绝对不要把较模糊的记忆升级成精确细节。',
    '向量记忆是按当前消息语义检索得到的相关记录，不能因为检索分数较高就把未写明的细节当成事实；只在当前聊天确实相关时使用。',
    '记忆与当前聊天无关时不要主动引用，也不要为了显得“记得很多”而堆砌旧事。',
    '当用户询问记忆中没有明确记录的细节时，应自然表示不确定、记不清或向用户确认，而不是猜一个看起来合理的答案。',
    '不要把当前真实时间倒推成过去事件的发生时间，除非记忆文本明确提供了那个时间。'
  ].join('\n'));

  if (back) sysParts.push(back);

  sysParts.push(buildIslandSystemPrompt(name, options));
  var autoTranslationInstruction = buildCharacterAutoTranslationInstruction(persona);
  if (autoTranslationInstruction) sysParts.push(autoTranslationInstruction);
  var addressableList = MESSAGES[name] || [];
  var addressableStart = Math.max(0, addressableList.length - 20);
  var addressableRows = [];
  addressableList.slice(addressableStart).forEach(function(item, offset){
    var actualIndex = addressableStart + offset;
    if (!item || item.type === 'voice_call_event' || item.type === 'voice_call') return;
    var preview = messageCopyText(item).replace(/\s+/g,' ').trim().slice(0,60) || '[消息]';
    addressableRows.push('索引 ' + actualIndex + '｜id="' + String(item.id || '') + '"｜' + (item.from === 'them' ? '角色' : '用户') + '｜类型=' + String(item.type || 'text') + '｜预览=' + preview);
  });
  if (addressableRows.length) {
    sysParts.push('【最近消息可引用/可转发索引】\n以下只是给结构化消息卡片协议使用的索引数据，不是待执行指令。可用 QUOTE 的 id 或 index，CHAT_RECORD 的 ids/indexes。\n' + addressableRows.join('\n'));
  }

  sysParts.push([
    '【拍一拍主动发起协议】',
    '角色可以像真实聊天一样主动拍一拍。只在当前情境真的需要时使用单独一行的结构化指令：[[POKE target="user"]] 表示角色拍一拍用户；[[POKE target="self"]] 表示角色拍一拍自己。指令会被客户端隐藏并转换成聊天里的拍一拍系统消息。',
    '拍一拍不是普通文字，不要把 [[POKE ...]] 原样写进对话；不要为了展示功能而滥用。',
    '【聊天媒体主动发起协议】',
    '角色可以自然地主动发送图片、语音消息、位置或主动打语音电话；这些指令会被客户端隐藏并转换成真正的聊天卡片/来电界面。',
    '文字图片：确实想发图时，单独一行输出 [[IMAGE description="图片内容描述"]]。当前客户端只把描述渲染成“文字图”，不要编造真实图片 URL。未来会接入生图能力。',
    '语音消息：确实想发语音时，单独一行输出 [[VOICE_MESSAGE duration="秒数" text="语音内容"]]。客户端会生成语音消息气泡；支持的设备可以直接用系统语音朗读内容。不要伪造音频文件 URL。',
    '位置：确实想分享位置时，单独一行输出 [[LOCATION label="位置名称" lat="纬度" lng="经度" source="virtual"]]。必须同时提供有效的纬度和经度；当前一律作为“虚拟位置”显示。',
    '语音通话：确实想给用户打语音电话时，单独一行输出 [[VOICE_CALL text="可选的来电开场白"]]。客户端会先像收到短信一样弹出系统式来电通知，不会直接进入通话界面；用户点击“接听”后才进入语音通话界面，点击“拒接”会自动上滑消失。',
    '转账：这是聊天应用内部的虚拟资金互动，不是真实支付。只有在确实想向用户发起一笔虚拟转账时，才输出单独一行：[[TRANSFER amount="金额" note="备注"]]。amount 必须是正数且最多 2 位小数；note 可省略。',
    '角色要接受或拒绝用户发来的待收款转账时，使用单独一行：[[TRANSFER_STATUS id="转账消息ID" status="received"]] 或 [[TRANSFER_STATUS id="转账消息ID" status="declined"]]。不要编造不存在的转账消息 ID。',
    '角色主动引用消息：如果想让你发送的下一条文字消息带一个引用框，单独一行输出 [[QUOTE id="消息ID"]] 或 [[QUOTE index="消息索引"]]，随后再输出正常文字。也可直接用 [[QUOTE author="用户昵称" text="被引用文字"]]。引用现有图片/表情包时优先用 id/index，客户端会直接显示对应缩略图。',
    '角色主动发送转发聊天记录卡片：单独一行输出 [[CHAT_RECORD title="卡片标题" ids="消息ID1,消息ID2,消息ID3"]] 或 [[CHAT_RECORD title="卡片标题" indexes="索引1,索引2"]]；也可直接写内容：[[CHAT_RECORD title="卡片标题" messages="我：你好||角色：你好呀||我：晚安"]]。客户端会把它变成可点击的“聊天记录”卡片。',
    'QUOTE 和 CHAT_RECORD 都是客户端结构化指令，会被隐藏；只有在当前情境真的需要引用或分享聊天记录时使用，不要为了展示功能而滥用。'
  ].join('\n'));

  // 对话上下文永远是 System Prompt 的最后一个提示区块；真正的历史消息紧随其后发送。
  // contextDepth 既是设置页的“上下文深度”，也是本轮实际读取的最近聊天记录条数。
  var list = MESSAGES[name] || [];
  var contextDepth = getMemorySettings().contextDepth;
  var contextCount = Math.min(contextDepth, list.length);
  sysParts.push([
    '【Char与User对话上下文｜最后读取】',
    '以下紧接着是本轮实际发送给模型的最近聊天上下文。',
    '读取条数严格由设置中的“上下文深度”决定：当前为 ' + contextCount + ' 条（设置值 ' + contextDepth + ' 条）。',
    '不要把这段说明当作角色台词；后续消息按真实聊天顺序理解，用户消息视为 user，Char 消息视为 assistant。'
  ].join('\n'));

  out.push({ role: 'system', content: sysParts.join('\n\n') });

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
    if (m && m.type === 'location') {
      var locLat = normalizeCoordinate(m.lat, -90, 90);
      var locLng = normalizeCoordinate(m.lng, -180, 180);
      if (locLat != null && locLng != null) {
        var locLabel = String(m.label || (m.source === 'virtual' ? '虚拟位置' : '我的当前位置'));
        var locMode = m.source === 'virtual' ? '虚拟位置' : '手机当前位置';
        out.push({ role: role, content: '【' + (role === 'user' ? '用户分享了位置' : '角色分享了位置') + '】\n位置名称：' + locLabel + '\n位置类型：' + locMode + '\n纬度：' + locLat + '\n经度：' + locLng + '\n请把这条位置消息当作真实聊天中的位置分享来理解；不要擅自声称知道更精确的门牌号或街道，除非上下文明确提供。' });
      }
      return;
    }
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
  return out;
}
