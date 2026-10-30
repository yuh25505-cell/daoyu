/* 记忆引擎自测：node test-memory-engine.mjs */
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const mod = { exports:{} };
vm.runInNewContext(fs.readFileSync(new URL('./js-core-memory-engine.js', import.meta.url), 'utf8'), { module:mod, JSON, Date, Math, Object, Array, String, Number, Error, RegExp, isFinite });
const M = mod.exports; const DAY = 86400000; const NOW = new Date(2026, 9, 30, 12, 0).getTime();
const book = () => M.ensureBook({});
const cand = (text, extra) => Object.assign({ kind:'fact', text, importance:3, origin:'extractor', source:{ app:'chat', messageIds:['m1'] } }, extra || {});
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('通过  ' + n); } catch (e) { console.log('失败  ' + n + '\n' + e.stack); process.exitCode = 1; } };

t('新增一条：带来源、写入时间、状态和历史', () => {
  const b = book(); const r = M.propose(b, cand('小明怕黑'), { now:NOW });
  assert.equal(r.action, 'added'); assert.equal(r.item.status, 'active'); assert.equal(r.item.recordedAt, NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(r.item.source.messageIds)), ['m1']); assert.equal(r.item.history[0].action, 'create');
});
t('模型提取必须有来源；引用不存在的消息会被拒收', () => {
  const b = book();
  assert.equal(M.propose(b, cand('x的事', { source:{ messageIds:[] } }), { now:NOW }).reason, 'no_source');
  assert.equal(M.propose(b, cand('小明怕黑', { source:{ messageIds:['zzz'] } }), { now:NOW, validMessageIds:{ m1:1 } }).reason, 'source_unverified');
  assert.equal(b.items.length, 0);
});
t('时间不编造：没有时间就是“时间不详”；未来时间当作计划而不是已发生', () => {
  const b = book(); const a = M.propose(b, cand('小明怕黑'), { now:NOW }).item;
  assert.equal(a.occurredPrecision, 'unknown'); assert.equal(M.describeTime(a, NOW), '时间不详');
  const p = M.propose(b, cand('周五晚上七点去海边', { kind:'event', occurredAt:NOW + 3 * DAY }), { now:NOW }).item;
  assert.equal(p.occurredAt, 0); assert.equal(p.planStatus, 'pending'); assert.ok(p.plannedAt > NOW);
});
t('发生时间、写入时间、计划时间互相独立；过期未确认的计划如实说明', () => {
  const b = book();
  const e = M.propose(b, cand('一起去了海边', { kind:'event', occurredAt:'2026-10-20', occurredPrecision:'day' }), { now:NOW }).item;
  assert.ok(M.describeTime(e, NOW).includes('2026-10-20') && M.describeTime(e, NOW).includes('10天前'));
  const p = M.propose(b, cand('约好看电影', { kind:'promise', plannedAt:NOW - DAY }), { now:NOW }).item;
  assert.ok(M.describePlan(p, NOW).includes('是否完成没有确认'));
  const f = M.propose(b, cand('约好吃饭', { kind:'promise', plannedAt:NOW + DAY }), { now:NOW }).item;
  assert.ok(M.describePlan(f, NOW).includes('尚未发生'));
});
t('去重：同一内容再出现只合并来源，不新增', () => {
  const b = book(); M.propose(b, cand('小明喜欢吃草莓蛋糕'), { now:NOW });
  const r = M.propose(b, cand('小明喜欢吃草莓蛋糕。', { source:{ messageIds:['m9'] } }), { now:NOW });
  assert.equal(r.action, 'merged'); assert.equal(b.items.length, 1); assert.equal(b.items[0].sources.length, 1);
});
t('冲突：数字不同或肯定否定相反会标记，双方都降为不确定，不会悄悄覆盖', () => {
  const b = book(); const a = M.propose(b, cand('约好周五晚上7点见面'), { now:NOW }).item;
  const c = M.propose(b, cand('约好周五晚上8点见面', { source:{ messageIds:['m2'] } }), { now:NOW });
  assert.equal(c.action, 'conflict'); assert.equal(a.confidence, 'uncertain'); assert.equal(a.conflictWith[0], c.item.id);
  const d = M.propose(b, cand('小明喜欢香菜'), { now:NOW }); const e = M.propose(b, cand('小明不喜欢香菜', { source:{ messageIds:['m3'] } }), { now:NOW });
  assert.equal(e.action, 'conflict'); assert.equal(M.stats(b).conflict, 4);
});
t('裁决冲突：保留一条，另一条被替代并留下历史', () => {
  const b = book(); const a = M.propose(b, cand('约好周五晚上7点见面'), { now:NOW }).item;
  const c = M.propose(b, cand('约好周五晚上8点见面', { source:{ messageIds:['m2'] } }), { now:NOW }).item;
  M.resolveConflict(b, c.id, NOW); assert.equal(a.status, 'superseded'); assert.equal(c.confidence, 'confirmed'); assert.equal(c.conflictWith.length, 0);
});
t('用户纠正：旧的被替代，新的已确认，历史里能看到旧版本', () => {
  const b = book(); const a = M.propose(b, cand('小明在北京工作'), { now:NOW }).item;
  const n = M.correct(b, a.id, { text:'小明在上海工作' }, NOW);
  assert.equal(a.status, 'superseded'); assert.equal(a.supersededBy, n.id); assert.equal(n.supersedes, a.id); assert.equal(n.confidence, 'confirmed');
  assert.ok(n.history[0].note.includes('北京')); assert.equal(M.retrieve(b, { query:'工作', now:NOW }).length, 1);
});
t('用户要求删除：内容清空，不再被检索，同样内容不会被再次提取', () => {
  const b = book(); const a = M.propose(b, cand('小明怕黑'), { now:NOW }).item;
  assert.ok(M.revoke(b, a.id, NOW)); assert.equal(a.text, ''); assert.equal(M.retrieve(b, { query:'怕黑', now:NOW }).length, 0);
  assert.equal(M.propose(b, cand('小明怕黑'), { now:NOW }).reason, 'deleted_before');
  assert.equal(M.propose(b, cand('小明怕黑', { origin:'user', source:{} }), { now:NOW }).action, 'added');
});
t('计划被取消或完成后不再当作待办', () => {
  const b = book(); const p = M.propose(b, cand('约好看电影', { kind:'promise', plannedAt:NOW + DAY }), { now:NOW }).item;
  assert.equal(M.renderForPrompt(M.retrieve(b, { query:'', now:NOW }), NOW).plans.includes('看电影'), true);
  M.setPlanStatus(b, p.id, 'cancelled', NOW);
  assert.equal(M.renderForPrompt(M.retrieve(b, { query:'', now:NOW }), NOW).plans, '');
});
t('关系变化：一次对话只算“不确定”，另一段对话再次出现才升为“比较确定”', () => {
  const b = book(); const r = M.propose(b, cand('小明和阿屿确认了恋爱关系', { kind:'relationship' }), { now:NOW }).item;
  assert.equal(r.confidence, 'uncertain');
  M.propose(b, cand('小明和阿屿确认了恋爱关系', { kind:'relationship', source:{ messageIds:['m50'] } }), { now:NOW });
  assert.equal(r.confidence, 'likely'); assert.equal(r.sources.length, 1);
});
t('检索：关键词、类型、重要度、时间过滤；待办计划和冲突项不会因为没搭上话题而被丢掉', () => {
  const b = book();
  M.propose(b, cand('小明怕黑', { importance:2 }), { now:NOW }); M.propose(b, cand('阿屿喜欢拍照', { importance:2, source:{ messageIds:['m4'] } }), { now:NOW });
  M.propose(b, cand('约好看电影', { kind:'promise', plannedAt:NOW + DAY, importance:2, source:{ messageIds:['m5'] } }), { now:NOW });
  const r = M.retrieve(b, { query:'拍照', now:NOW }).map(x => x.item.text);
  assert.ok(r.includes('阿屿喜欢拍照')); assert.ok(r.includes('约好看电影')); assert.ok(!r.includes('小明怕黑'));
  assert.equal(M.retrieve(b, { query:'', kinds:['promise'], now:NOW }).length, 1);
  assert.equal(M.retrieve(b, { query:'', minImportance:4, now:NOW }).length, 0);
});
t('提示词渲染：已确认 / 未确认 / 矛盾分开写，计划单独写', () => {
  const b = book(); M.propose(b, cand('小明怕黑', { origin:'user', source:{} }), { now:NOW });
  M.propose(b, cand('小明喜欢跑步', { source:{ messageIds:['m6'] } }), { now:NOW });
  M.propose(b, cand('约好周五7点见面'), { now:NOW }); M.propose(b, cand('约好周五8点见面', { source:{ messageIds:['m7'] } }), { now:NOW });
  const o = M.renderForPrompt(M.retrieve(b, { query:'', now:NOW }), NOW);
  assert.ok(/已确认：\n· \[时间不详\] 小明怕黑/.test(o.facts)); assert.ok(o.facts.includes('未经确认')); assert.ok(o.facts.includes('互相矛盾'));
});
t('旧版重要记忆同步：只迁一次；用户在旧页面删除后这里也撤销；日期被解析', () => {
  const b = book(); const old = [{ id:'imp1', text:'2026-10-01：第一次约会', memoryAt:1 }, { id:'imp2', text:'时间不详：小明怕黑' }];
  assert.equal(M.syncLegacyImportant(b, old, NOW), 2); assert.equal(M.syncLegacyImportant(b, old, NOW), 0);
  assert.equal(b.items.find(i => i.legacyId === 'imp1').occurredPrecision, 'day'); assert.equal(b.items.find(i => i.legacyId === 'imp2').occurredPrecision, 'unknown');
  assert.equal(M.syncLegacyImportant(b, [old[0]], NOW), 1); assert.equal(b.items.find(i => i.legacyId === 'imp2').status, 'revoked');
});
t('提取结果解析：带代码块的 JSON 能解析，格式错误会报错', () => {
  const rows = M.parseExtraction('```json\n[{"kind":"promise","text":"周五见面","plannedAt":"2026-11-06T19:00","sources":["m1"],"importance":4}]\n```');
  assert.equal(rows.length, 1); assert.equal(rows[0].source.messageIds[0], 'm1'); assert.equal(rows[0].origin, 'extractor');
  assert.throws(() => M.parseExtraction('没有'), /JSON/); assert.throws(() => M.parseExtraction('[oops'), /JSON/);
});
t('归档：低重要度、未确认、长期未更新的才归档；待办与已确认不会', () => {
  const b = book(); const a = M.propose(b, cand('随口一提的小事', { importance:1 }), { now:NOW - 400 * DAY }).item;
  const c = M.propose(b, cand('重要的事', { importance:5, source:{ messageIds:['m8'] } }), { now:NOW - 400 * DAY }).item;
  assert.equal(M.archiveStale(b, NOW, 180), 1); assert.equal(a.status, 'archived'); assert.equal(c.status, 'active');
});
t('同一个人的长文本不会被截断到丢失（上限 600 字内原样保留）', () => {
  const b = book(); const s = '字'.repeat(500); assert.equal(M.propose(b, cand(s), { now:NOW }).item.text.length, 500);
});
console.log('\n共通过 ' + ok + ' 项');
