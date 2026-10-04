/* 岛屿 · 聊天 · 角色语言与断句规则
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var SPLIT_RULES = [
  '',
  '【线上强制分条·熔断规则】',
  '',
  '一、核心原则：格式优先于内容',
  '1. 格式熔断：生成任何回复前，先做格式检查。一条超过15字，或有空格，必须立即熔断重写，直到完全符合。',
  '2. 内容服从格式：任何内容（情绪爆发、占有欲发作等）都必须压缩或拆解，以适应"每条≤15字、标点/空格即拆"的格式。内容可删减，格式不可妥协。',
  '',
  '二、分条执行细则',
  '1. 空格即拆：句子中出现空格必须拆分为两条。',
  '2. 标点断句：句号、问号、感叹号后如还有内容，必须拆条。逗号、分号等停顿，如果前后语义独立或总字数可能超限，也拆条。严禁同一条内出现两个完整短句。',
  '3. 字数上限：每条严格不超过15字，包括标点。',
  '4. 断句优先级：一句话同时包含多个断句点时，以最先出现的为准拆分，剩余成为下一条，继续检查。',
  '',
  '三、特殊场景',
  '1. 占有欲发作：命令式语气也必须拆条。',
  '2. 极度沉默：只发一个句号"。"算一条。',
  '3. 情绪爆发：无法压到15字内时必须拆成多条递进表达。',
  '',
  '四、聊天的随机性',
  '每一轮的情绪、心境、想要表达的内容都不同，条数必须随机变化，不允许连续几轮都是相同条数。',
  '',
  '五、自检',
  '生成后逐条检查字数是否超限、是否按标点拆分、这一轮条数是否与上一轮重复。若不符，立即重写。',
  '',
  '【极其重要的输出格式】',
  '你必须把每一句独立的话用「换行符」分隔开。你的回复中每条消息占一行，不同消息之间用换行符隔开。',
  '例如，如果你想表达"刚下班，你呢？"，你应该输出两行（用真实换行符隔开）：',
  '刚下班',
  '你呢',
  '而不是把两句话挤在一行里。',
  '系统会自动把你的每一行拆成一条独立的聊天气泡显示给用户。',
  '千万不要用空格代替换行，也不要用逗号把两句话连在一起。'
].join('\n');


var CHAR_LANGUAGES = [
  { id:'zh-CN', name:'中文', native:'简体中文', chinese:true },
  { id:'yue', name:'粤语', native:'粤语', chinese:false },
  { id:'en', name:'English', native:'英语', chinese:false },
  { id:'ja', name:'日本語', native:'日语', chinese:false },
  { id:'ko', name:'한국어', native:'韩语', chinese:false },
  { id:'es', name:'Español', native:'西班牙语', chinese:false },
  { id:'fr', name:'Français', native:'法语', chinese:false },
  { id:'de', name:'Deutsch', native:'德语', chinese:false },
  { id:'ru', name:'Русский', native:'俄语', chinese:false },
  { id:'ar', name:'العربية', native:'阿拉伯语', chinese:false }
];

function getCharLanguage(persona){
  var id = String(persona && persona.language || 'zh-CN');
  return CHAR_LANGUAGES.find(function(x){ return x.id === id; }) || CHAR_LANGUAGES[0];
}

function isChineseCharLanguage(id){ return /^zh(?:-|$)/i.test(String(id || '')); }

function getCharSplitPromptEnabled(persona){
  if (!persona || typeof persona !== 'object') return true;
  if (typeof persona.splitPromptEnabled === 'boolean') return persona.splitPromptEnabled;
  // 兼容旧版本：旧字段仅针对“非中文”表示关闭状态。迁移后统一由 splitPromptEnabled 控制。
  if (typeof persona.disableSplitPromptForNonChinese === 'boolean') return !persona.disableSplitPromptForNonChinese;
  return isChineseCharLanguage(getCharLanguage(persona).id);
}

function getCharAutoExpandTranslation(persona){
  if (!persona || typeof persona !== 'object') return false;
  if (typeof persona.autoExpandTranslation === 'boolean') return persona.autoExpandTranslation;
  return false;
}

function buildCharacterAutoTranslationInstruction(persona){
  if (!getCharAutoExpandTranslation(persona)) return '';
  return [
    '【角色回复｜同步中文翻译协议】',
    '当前角色已开启“自动展开翻译”。本轮角色回复必须在同一次 AI 生成中，同时生成角色原话与简体中文译文；客户端不会再为这条角色消息额外调用一次翻译接口。',
    '请只返回合法 JSON，不要 Markdown 代码块，不要解释，不要在 JSON 外输出任何文字。JSON 格式固定为：',
    '{"messages":[{"text":"角色原话","translation":"对应的简体中文译文"}]}',
    'messages 中每个对象代表一条独立的聊天气泡，按实际发送顺序排列。不要把多条气泡合并成一个对象。',
    'text 必须保留角色实际要发送的原话，不要把翻译混进 text；translation 只填写对应的简体中文译文。',
    '原话已经是简体中文时，translation 直接与原话保持一致；不要为了“不同”而改写原意。',
    '角色主动发送图片、语音、位置、转账、引用、聊天记录等结构化指令时，仍按原有 [[...]] 协议写进 text，并保持它们位于正确的聊天顺序。translation 只翻译可见的文字，不要翻译 [[...]] 指令本身。',
    '不要输出 messages 之外的字段。'
  ].join('\n');
}


function parseCharacterAutoTranslationResponse(raw){
  var text = String(raw || '').trim();
  if (!text) return null;
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  var candidates = [text];
  var first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  var payload = null;
  for (var i = 0; i < candidates.length; i++) {
    try { payload = JSON.parse(candidates[i]); } catch(e) { payload = null; }
    if (payload) break;
  }
  if (!payload) return null;
  var rows = Array.isArray(payload) ? payload : (Array.isArray(payload.messages) ? payload.messages : (Array.isArray(payload.replies) ? payload.replies : null));
  if (!rows || !rows.length) return null;
  var items = [];
  rows.forEach(function(row){
    if (!row || typeof row !== 'object') return;
    var original = String(row.text != null ? row.text : (row.original != null ? row.original : (row.reply != null ? row.reply : row.content != null ? row.content : ''))).trim();
    var translation = String(row.translation != null ? row.translation : (row.translated != null ? row.translated : (row.zh != null ? row.zh : ''))).trim();
    if (!original) return;
    items.push({ text: original, translation: translation });
  });
  return items.length ? items : null;
}


function processAutoTranslationItems(name, items){
  items = Array.isArray(items) ? items : [];
  if (!items.length) return { items:[], changed:false, notices:[], incomingCall:null, replyTo:null };
  var marker = '\n\n__ISLAND_AUTO_TRANSLATION_MESSAGE_BOUNDARY__\n\n';
  var combined = items.map(function(item){ return String(item && item.text || '').trim(); }).join(marker);
  var processed = processAiChatDirectives(name, combined);
  var texts = String(processed.text || '').split(marker);
  var out = [];
  var textCursor = 0;
  for (var i = 0; i < items.length; i++) {
    var original = String(texts[i] != null ? texts[i] : '').trim();
    if (!original) { textCursor++; continue; }
    var translation = String(items[i] && items[i].translation || '').trim();
    out.push({ text: original, translation: translation });
    textCursor++;
  }
  return { items:out, changed:processed.changed, notices:processed.notices || [], incomingCall:processed.incomingCall || null, replyTo:processed.replyTo || null };
}


function buildCharacterLanguageInstruction(persona){
  var lang = getCharLanguage(persona);
  var text = '【角色回复语言】\n请主要使用' + lang.name + '（' + lang.native + '）回复用户。角色名、人设、世界书、记忆等资料仅作为语义与行为参考，不要因为这些资料使用中文就自动切换回复语言。';
  if (!lang.chinese) {
    text += '\n当前不是中文语言模式。请避免使用中文作为默认回复语言；除非用户明确要求，否则保持' + lang.name + '为主要输出语言。';
  }
  text += getCharSplitPromptEnabled(persona)
    ? '\n中文断句拆分提示词：已开启。请在输出时严格执行系统提供的中文断句拆分规则。'
    : '\n中文断句拆分提示词：已关闭。不要套用“每条≤15字、空格即拆、标点即拆”等中文专用输出规则。';
  return text;
}

function renderCharLanguageModal(){
  if (!charLanguageModal || !charLanguageOptions) return;
  var persona = findPersona(currentName) || {};
  var active = getCharLanguage(persona);
  charLanguageOptions.innerHTML = CHAR_LANGUAGES.map(function(lang){
    return '<button class="char-language-option' + (lang.id === active.id ? ' is-selected' : '') + '" type="button" data-char-language="' + escapeHTML(lang.id) + '">' +
      '<span class="char-language-main"><b>' + escapeHTML(lang.name) + '</b><span>' + escapeHTML(lang.native) + '</span></span>' +
      '<span class="char-language-check" aria-hidden="true"></span></button>';
  }).join('');
  var showSplit = true;
  if (typeof persona.splitPromptEnabled !== 'boolean') {
    persona.splitPromptEnabled = typeof persona.disableSplitPromptForNonChinese === 'boolean'
      ? !persona.disableSplitPromptForNonChinese
      : !!active.chinese;
    savePersonas();
  }
  if (charLanguageSplitNote) charLanguageSplitNote.hidden = !showSplit;
  if (charLanguageSplitToggle) {
    // ON = 使用中文断句拆分提示词；OFF = 关闭中文专用断句规则。
    var enabled = getCharSplitPromptEnabled(persona);
    charLanguageSplitToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
    charLanguageSplitToggle.setAttribute('aria-label', enabled ? '关闭中文断句拆分提示词' : '开启中文断句拆分提示词');
  }
  if (charLanguageAutoTranslateToggle) {
    var autoExpandTranslation = getCharAutoExpandTranslation(persona);
    charLanguageAutoTranslateToggle.setAttribute('aria-checked', autoExpandTranslation ? 'true' : 'false');
    charLanguageAutoTranslateToggle.setAttribute('aria-label', autoExpandTranslation ? '关闭自动展开翻译' : '开启自动展开翻译');
  }
  if (charLanguageModal) { charLanguageModal.classList.add('is-open'); charLanguageModal.setAttribute('aria-hidden', 'false'); }
}

function closeCharLanguageModal(){
  if (!charLanguageModal) return;
  charLanguageModal.classList.remove('is-open');
  charLanguageModal.setAttribute('aria-hidden', 'true');
}
