/* 结构化记忆接入自测（提示词 + 自动提取）。node test-chat-facts-integration.mjs */
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const read = f => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const mem = { retrievalMode:'summary', importantMemories:[{ id:'imp1', text:'2026-10-01：第一次约会', createdAt:1, memoryAt:1 }], summaries:[] };
let apiReply = '[]', apiCalls = 0, saved = 0, dbRows = [];
const sandbox = {
  console, JSON, Date, Math, Object, Array, String, Number, Error, Promise, RegExp, isFinite,
  State:{ personas:[{ name:'阿屿', desc:'摄影师' }] }, currentName:'阿屿',
  MESSAGES:{ 阿屿:[{ id:'m1', from:'me', type:'text', text:'周五晚上去海边吧', createdAt:1 }] },
  vectorMemoryContextCache:{}, ensureMessageIds(){}, getActiveUserPersona:() => ({ name:'小明', desc:'' }),
  collectWorldbookEntries:() => ({ highest:[], front:[], middle:[], back:[] }), formatWorldbookContextBlock:() => '',
  normalizeChatMemory:() => mem, saveMemoryState(){ saved++; return Promise.resolve(); },
  getMemorySettings:() => ({ contextDepth:5 }), getContextMessages:n => sandbox.MESSAGES[n], buildAgedMemoryBlocks:() => '',
  buildTimeContext:() => '【时间】', buildCharacterLanguageInstruction:() => '', getCharSplitPromptEnabled:() => false, SPLIT_RULES:'',
  buildCharacterAutoTranslationInstruction:() => '', messageCopyText:m => m.text || '', pad:n => String(n).padStart(2, '0'),
  getWeekdayLabel:() => '周五', getSeasonLabel:() => '秋季', isVisionReady:() => false,
  $:() => null, escapeHTML:s => s, releaseInputFocus(){}, toast(){}, islandConfirm:() => Promise.resolve(true),
  isSecondaryApiReady:() => true, getSecondaryApiConfig:() => ({ maxTokens:500 }),
  callApiOnce(){ apiCalls++; return Promise.resolve(apiReply); }, looksLikeSummaryRefusal:() => false,
  memoryMessageText:r => (r.from === 'me' ? '用户：' : '角色：') + r.text,
  readMemoryRowsFromDb:(n, after) => Promise.resolve(dbRows.filter(r => r.__islandSeq > after)),
  document:{ createElement(){ return {}; }, body:{ appendChild(){} } }
};
sandbox.window = sandbox; vm.createContext(sandbox);
['js-core-prompt-engine.js', 'js-core-memory-engine.js', 'js-apps-chat-prompt.js', 'js-apps-chat-facts.js'].forEach(f => vm.runInContext(read(f).replace(/^var (PromptEngine|MemoryEngine) =/m, 'this.$1 ='), sandbox));
const { PromptEngine: E, MemoryEngine: M, buildMessages, extractFactsFromChat } = sandbox;
let ok = 0; const queue = []; const t = (n, f) => queue.push([n, f]);
const sys = () => buildMessages('阿屿')[0].content;

t('旧的重要记忆并入结构化记忆，且不重复注入', async () => {
  const s = sys(); assert.ok(s.includes('【结构化记忆】') && s.includes('第一次约会')); assert.ok(!s.includes('【重要记忆】'));
  assert.equal(s.split('第一次约会').length - 1, 1); assert.equal(mem.facts.items.length, 1);
});
t('再次组装不会重复迁入', async () => { sys(); sys(); assert.equal(mem.facts.items.length, 1); });
t('用户在旧页面删掉重要记忆后，提示词里也没有了', async () => {
  mem.importantMemories.splice(0); const s = sys(); assert.ok(!s.includes('第一次约会'));
  assert.equal(M.ensureBook(mem).items.find(x => x.legacyId === 'imp1').status, 'revoked');
  mem.importantMemories.push({ id:'imp2', text:'2026-10-02：第一次牵手', createdAt:2, memoryAt:2 });
});
t('待履行计划单独成块，并写明“尚未发生”', async () => {
  const b = M.ensureBook(mem); M.propose(b, { kind:'promise', text:'周五晚上去海边', plannedAt:Date.now() + 86400000, origin:'user', source:{ app:'chat' } });
  const s = sys(); assert.ok(s.includes('【待履行的承诺与计划】') && s.includes('尚未发生：周五晚上去海边'));
});
t('关闭结构化记忆模块后退回旧的重要记忆注入', async () => {
  E.setEnabled('mem_facts', false); const s = sys(); assert.ok(s.includes('【重要记忆】') && s.includes('第一次牵手')); assert.ok(!s.includes('【结构化记忆】')); E.setEnabled('mem_facts', true);
});
t('用户修正后，提示词里是新内容', async () => {
  const b = M.ensureBook(mem), it = b.items.find(x => x.text.includes('第一次牵手') && x.status === 'active');
  sys(); M.correct(b, it.id, { text:'第一次牵手在海边', occurredAt:'2026-10-01', occurredPrecision:'day' });
  const s = sys(); assert.ok(s.includes('第一次牵手在海边')); assert.ok(!s.includes('] 第一次牵手\n'));
});
t('自动提取：来源真实的入库，编造来源的拒收，进度只在成功后推进', async () => {
  dbRows = [{ id:'a1', from:'me', text:'我下周三生日', __islandSeq:5 }, { id:'a2', from:'them', text:'我记住了', __islandSeq:6 }];
  apiReply = JSON.stringify([
    { kind:'fact', text:'小明下周三生日', subjects:['小明'], occurredAt:null, importance:4, sources:['a1'] },
    { kind:'fact', text:'小明有一只猫', sources:['zzz'] }, { kind:'fact', text:'没有来源的内容', sources:[] }]);
  const r = await extractFactsFromChat('阿屿');
  assert.equal(r.ok, true); assert.equal(r.added, 1); assert.equal(r.rejected, 2);
  const b = M.ensureBook(mem); assert.ok(b.items.some(x => x.text === '小明下周三生日' && x.source.messageIds[0] === 'a1')); assert.ok(!b.items.some(x => x.text.includes('猫')));
  assert.equal(b.extractedThroughSeq, 6);
});
t('自动提取：模型返回坏格式时报错，不推进进度，不入库', async () => {
  dbRows.push({ id:'a3', from:'me', text:'随便聊聊', __islandSeq:9 }); apiReply = '我无法完成';
  const before = M.ensureBook(mem).items.length, r = await extractFactsFromChat('阿屿');
  assert.equal(r.ok, false); assert.equal(M.ensureBook(mem).extractedThroughSeq, 6); assert.equal(M.ensureBook(mem).items.length, before);
});
t('自动提取：同样的内容再提取只合并，不重复；被用户删过的不再回来', async () => {
  apiReply = JSON.stringify([{ kind:'fact', text:'小明下周三生日', sources:['a3'] }]);
  const b = M.ensureBook(mem), n = b.items.length, r = await extractFactsFromChat('阿屿');
  assert.equal(r.merged, 1); assert.equal(b.items.length, n);
  M.revoke(b, b.items.find(x => x.text === '小明下周三生日').id);
  dbRows.push({ id:'a4', from:'me', text:'再说一次生日', __islandSeq:12 }); apiReply = JSON.stringify([{ kind:'fact', text:'小明下周三生日', sources:['a4'] }]);
  const r2 = await extractFactsFromChat('阿屿'); assert.equal(r2.added, 0); assert.equal(r2.rejected, 1);
});
t('没有新聊天时不调用模型', async () => { const c = apiCalls; const r = await extractFactsFromChat('阿屿'); assert.equal(apiCalls, c); assert.equal(r.ok, true); });

for (const [n, f] of queue) { try { await f(); ok++; console.log('通过  ' + n); } catch (e) { console.log('失败  ' + n + '\n' + e.stack); process.exitCode = 1; } }
console.log('\n共通过 ' + ok + ' 项');
