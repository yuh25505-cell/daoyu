/* 聊天提示词接入自测：用假数据跑真实的 buildMessages。node test-chat-prompt-integration.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = f => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const mod = { exports:{} };
const sandbox = {
  module:mod, console, JSON, Date, Math, Object, Array, String, Number, Error, Promise, RegExp,
  State:{ personas:[{ name:'阿屿', desc:'嘴硬心软的摄影师', gender:'female', socialId:'ayu' }] },
  MESSAGES:{ 阿屿:[
    { id:'m1', from:'me', type:'text', text:'周五见面吧', createdAt:1 },
    { id:'m2', from:'them', type:'text', text:'好，周五', createdAt:2 },
    { id:'m3', from:'me', type:'text', text:'到时候别迟到', createdAt:3 } ] },
  vectorMemoryContextCache:{ 阿屿:{ rows:[{ text:'去年在海边拍过照' }] } },
  ensureMessageIds(){}, getActiveUserPersona:() => ({ name:'小明', desc:'大学生' }),
  collectWorldbookEntries:() => ({ highest:[], front:[{ entry:{ name:'城市', content:'故事发生在海边小城' } }], middle:[], back:[] }),
  normalizeChatMemory:() => ({ retrievalMode:'hybrid', importantMemories:[{ text:'小明怕黑', createdAt:1 }] }),
  getMemorySettings:() => ({ contextDepth:2 }),
  getContextMessages(n){ return sandbox.MESSAGES[n]; },
  buildAgedMemoryBlocks:() => '【短期记忆】\n最近在聊见面',
  buildTimeContext:() => '【时间上下文】\ncurrent_time: 12:00',
  buildCharacterLanguageInstruction:() => '请使用中文回复', getCharSplitPromptEnabled:() => false, SPLIT_RULES:'',
  buildCharacterAutoTranslationInstruction:() => '', messageCopyText:m => m.text || '',
  pad:n => String(n).padStart(2, '0'), getWeekdayLabel:() => '周五', getSeasonLabel:() => '秋季',
  isVisionReady:() => false, visionScopeAllows:() => false, findStickerNameByUrl:() => '',
  formatFileSize:() => '', clampFileText:s => s, normalizeTransferAmount:() => null, getPokeUserName:() => '小明',
  formatWorldbookContextBlock:(title, rows) => rows && rows.length ? title + '\n' + rows.map(r => r.entry.content).join('\n') : '',
  buildTimeContextCalled:0
};
vm.createContext(sandbox);
vm.runInContext(read('js-core-prompt-engine.js') + '\nthis.PromptEngine = PromptEngine;', sandbox);
vm.runInContext(read('js-apps-chat-prompt.js'), sandbox);
const { PromptEngine: E, buildMessages } = sandbox;
E.registerProvider('mem_facts', () => ''); E.registerProvider('mem_plans', () => '');
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('通过  ' + n); } catch (e) { console.log('失败  ' + n + '\n' + e.stack); process.exitCode = 1; } };

t('真实 buildMessages：系统消息在最前，历史消息按上下文深度在后', () => {
  const m = buildMessages('阿屿');
  assert.equal(m[0].role, 'system');
  assert.equal(m.slice(1).map(x => x.role).join(), 'assistant,user');
  assert.equal(m[m.length - 1].content, '到时候别迟到');
});
t('世界书、人设、用户人设、记忆、协议同时存在且顺序符合锚点', () => {
  const s = buildMessages('阿屿')[0].content;
  const order = ['【岛屿系统】', '【世界书·前】', '【角色人设】', '【用户人设】', '【重要记忆】', '【短期记忆】', '【向量记忆', '【时间上下文】', '【拍一拍】', '【Char与User对话上下文'];
  let last = -1; order.forEach(k => { const i = s.indexOf(k); assert.ok(i >= 0, '缺少 ' + k); assert.ok(i > last, k + ' 顺序不对'); last = i; });
});
t('关闭记忆相关模块后真的不再出现；其他内容不受影响', () => {
  E.setEnabled('mem_vector', false);
  const s = buildMessages('阿屿')[0].content;
  assert.ok(!s.includes('去年在海边拍过照')); assert.ok(s.includes('小明怕黑'));
  E.setEnabled('mem_vector', true);
});
t('快照记录的就是实际发送的消息', () => {
  const m = buildMessages('阿屿'); const snap = E.findSnapshot(m.__snapshotId);
  assert.ok(snap); assert.equal(snap.fingerprint, E.messagesFingerprint(m));
  assert.equal(snap.messages[0].content, m[0].content);
  E.markSent(m.__snapshotId, m); assert.equal(E.findSnapshot(m.__snapshotId).modifiedAfterAssembly, false);
});
t('JSON 序列化请求体时不会带出内部快照标记', () => {
  const m = buildMessages('阿屿'); assert.ok(!JSON.stringify(m).includes('__snapshotId'));
});
t('预览模式不产生请求记录', () => {
  const before = E.listSnapshots().length; const m = buildMessages('阿屿', { preview:true });
  assert.equal(E.listSnapshots().length, before); assert.ok(m.__assembled);
});
t('developer 角色生效', () => {
  E.setSystemRole('developer'); assert.equal(buildMessages('阿屿')[0].role, 'developer'); E.setSystemRole('system');
});
t('角色的生日和地区会写进提示词；没填就不出现', () => {
  const p = sandbox.State.personas[0];
  let s = buildMessages('阿屿')[0].content;
  assert.ok(!s.includes('【角色生日与地区】'));
  p.birthday = '3月14日'; p.location = '杭州';
  s = buildMessages('阿屿')[0].content;
  assert.ok(s.includes('【角色生日与地区】\n生日：3月14日\n所在地区：杭州'));
  delete p.birthday; delete p.location;
});
t('角色自带世界书跟随人设时，换行是真换行，不是 \\n 文字', () => {
  const p = sandbox.State.personas[0];
  p.profileWorldbooks = [{ enabled:true, followPersona:true, name:'书', entries:[{ name:'条目', content:'第一行\n第二行' }] }];
  const s = buildMessages('阿屿')[0].content;
  assert.ok(s.includes('【世界书：条目】\n第一行'));
  assert.ok(!s.includes('【世界书：条目】\\n'));
  p.profileWorldbooks = [];
});
t('必需模块被破坏时 buildMessages 直接抛错而不是少发', () => {
  E.load({ presets:[{ id:'preset_default', mods:{ mem_rules:{ enabled:false } } }], activePresetId:'preset_default' });
  assert.throws(() => buildMessages('阿屿'), e => e.name === 'PromptEngineError' && /记忆使用规则/.test(e.message));
  E.load(null);
});
t('语音通话场景不带私聊专属格式', () => {
  const s = buildMessages('阿屿', { scene:'voice_call' })[0].content;
  assert.ok(!s.includes('【回复格式】'));
});
t('语音通话：带语音通话专用模块，不带聊天专用的图片 / 转账 / 引用 / 拍一拍协议', () => {
  const s = buildMessages('阿屿', { scene:'voice_call' })[0].content;
  ['【语音通话】', '【语音通话·动作旁白】', '【语音通话·回复格式】', '【角色人设】', '【用户人设】', '【重要记忆】', '【世界书·前】'].forEach(k => assert.ok(s.includes(k), '缺少 ' + k));
  ['【拍一拍】', '【转账】', '【聊天媒体】', '【引用与转发】', '【撤回】', '【删除好友】', '【回复格式】'].forEach(k => assert.ok(!s.includes(k), '不应带有 ' + k));
  const chat = buildMessages('阿屿')[0].content;
  ['【拍一拍】', '【转账】', '【聊天媒体】'].forEach(k => assert.ok(chat.includes(k), '私聊应保留 ' + k));
  ['【语音通话】', '【语音通话·回复格式】'].forEach(k => assert.ok(!chat.includes(k), '私聊不应带有 ' + k));
});
t('语音通话：动作旁白开关决定提示词怎么写', () => {
  const on = buildMessages('阿屿', { scene:'voice_call' })[0].content;
  assert.ok(on.includes('<narration>阿屿'));
  const off = buildMessages('阿屿', { scene:'voice_call', voiceCallNarration:false })[0].content;
  assert.ok(off.includes('这通电话不写旁白')); assert.ok(!off.includes('<narration>阿屿'));
});
t('语音通话：预设里的语音通话格式模块是必需的，关不掉', () => {
  assert.throws(() => E.setEnabled('vc_format', false), e => /必需/.test(e.message));
  E.setEnabled('vc_scene', false);
  assert.ok(!buildMessages('阿屿', { scene:'voice_call' })[0].content.includes('【语音通话】\n'));
  E.setEnabled('vc_scene', true);
});
t('语音通话：通话里角色之前说的话用 <bubble> 带进上下文，旁白保持 <narration>', () => {
  sandbox.MESSAGES['阿屿'] = [
    { id:'c1', from:'me', type:'voice_call', text:'喂', createdAt:1 },
    { id:'c2', from:'them', type:'voice_call', text:'在呢', createdAt:2 },
    { id:'c3', from:'them', type:'voice_call', narration:true, text:'阿屿笑了一下', createdAt:3 }];
  const call = buildMessages('阿屿', { scene:'voice_call' });
  assert.equal(call[1].content, '<bubble>在呢</bubble>'); assert.equal(call[2].content, '<narration>阿屿笑了一下</narration>');
  const chat = buildMessages('阿屿');
  assert.equal(chat[1].content, '在呢');
});
console.log('\n共通过 ' + ok + ' 项');
