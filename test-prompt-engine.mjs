/* 提示词引擎自测：node test-prompt-engine.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

function fresh(){
  const mod = { exports:{} };
  vm.runInNewContext(fs.readFileSync(new URL('./js-core-prompt-engine.js', import.meta.url), 'utf8'), { module:mod, JSON, Date, Math, Object, Array, String, Number, Error });
  const E = mod.exports;
  const data = { wb_highest:'【世界书·最高】\nA', char_persona:'温柔的程序员', user_persona:'【用户人设】\n小明',
    time_context:'【时间】12:00', ctx_header:'【对话上下文】', mem_important:'约好周五见面' };
  E.DEFAULT_MODULES.forEach(m => { if (m.provider) E.registerProvider(m.provider, ctx => ctx.data && ctx.data[m.provider] || ''); });
  return { E, data };
}
const ctxOf = (data, extra) => Object.assign({ scene:'private', data, vars:{ char:'阿屿', user:'小明', date:'2026-10-30', time:'12:00', weekday:'周五', season:'秋季', char_desc:'x', user_desc:'' } }, extra);
let passed = 0;
function t(name, fn){ try { fn(); passed++; console.log('通过  ' + name); } catch (e) { console.log('失败  ' + name + '\n' + e.stack); process.exitCode = 1; } }

t('默认预设能组装，必需模块都在', () => {
  const { E, data } = fresh(); const r = E.assemble(ctxOf(data));
  assert.ok(r.systemText.includes('你是「阿屿」'));
  assert.ok(r.systemText.includes('【角色人设】\n温柔的程序员'));
  assert.ok(r.systemText.includes('【对话上下文】'));
  assert.ok(r.systemText.trimEnd().endsWith('【对话上下文】'), '对话上下文必须在最后');
  assert.ok(r.systemText.startsWith('【岛屿系统】'), '系统核心必须在最前');
});
t('关闭可选模块后不再注入', () => {
  const { E, data } = fresh(); E.setEnabled('roleplay_mode', false);
  const r = E.assemble(ctxOf(data)); assert.ok(!r.systemText.includes('沉浸式角色扮演'));
  assert.equal(r.blocks.find(b => b.id === 'roleplay_mode').status, 'off');
});
t('必需模块不能关闭、不能清空', () => {
  const { E } = fresh();
  assert.throws(() => E.setEnabled('sys_core', false), /必需/);
  assert.throws(() => E.setTemplate('sys_core', '  '), /必需/);
  assert.throws(() => E.setTemplate('char_persona', '没有内容槽'), /\{\{content\}\}/);
});
t('预设数据被改坏（必需模块被关）时组装直接报错，不静默跳过', () => {
  const { E, data } = fresh();
  E.load({ presets:[{ id:'preset_default', mods:{ sys_core:{ enabled:false } } }], activePresetId:'preset_default' });
  assert.throws(() => E.assemble(ctxOf(data)), e => e.code === 'assemble_failed' && /系统核心规则/.test(e.message));
});
t('provider 读取失败时抛错并指出模块', () => {
  const { E, data } = fresh(); E.registerProvider('mem_important', () => { throw new Error('读取失败了'); });
  assert.throws(() => E.assemble(ctxOf(data)), e => /重要记忆/.test(e.message) && /读取失败了/.test(e.message));
});
t('必需数据模块没有内容时给出警告而不是静默', () => {
  const { E, data } = fresh(); delete data.char_persona;
  const r = E.assemble(ctxOf(data)); assert.ok(r.warnings.some(w => /角色人设/.test(w)));
  assert.equal(r.blocks.find(b => b.id === 'char_persona').status, 'no_data');
});
t('拖动排序：同位置内移动', () => {
  const { E, data } = fresh();
  E.moveModule('motive_consistency', 'persona_understanding');
  const ids = E.resolveModules().filter(m => m.anchor === 'character_core').map(m => m.id);
  assert.ok(ids.indexOf('motive_consistency') < ids.indexOf('persona_understanding'));
  const r = E.assemble(ctxOf(data));
  assert.ok(r.systemText.indexOf('【一致性】') < r.systemText.indexOf('【理解人设】'));
});
t('拖动排序：跨位置移动会改插入位置', () => {
  const { E, data } = fresh();
  E.moveModule('persona_understanding', null, 'worldbook_low');
  assert.equal(E.resolveModules().find(m => m.id === 'persona_understanding').anchor, 'worldbook_low');
  const r = E.assemble(ctxOf(data)); assert.ok(r.systemText.indexOf('【理解人设】') > r.systemText.indexOf('【角色人设】'));
});
t('固定模块不能被移走，也不能被排到别人后面', () => {
  const { E, data } = fresh();
  assert.throws(() => E.moveModule('sys_core', null, 'life_state'), /固定/);
  assert.throws(() => E.setAnchor('ctx_header', 'system_head'), /固定/);
  E.moveModule('proto_poke', null, 'conversation_context');
  const r = E.assemble(ctxOf(data)); assert.ok(r.systemText.trimEnd().endsWith('【对话上下文】'));
});
t('自定义模块：新增、排序、改内容、删除', () => {
  const { E, data } = fresh();
  const c = E.addCustomModule({ name:'语气', anchor:'output_protocol', template:'说话带点方言' });
  let r = E.assemble(ctxOf(data)); assert.ok(r.systemText.includes('【补充设定·语气】\n说话带点方言'));
  E.setTemplate(c.id, '全部用短句'); r = E.assemble(ctxOf(data)); assert.ok(r.systemText.includes('全部用短句'));
  E.deleteCustomModule(c.id); r = E.assemble(ctxOf(data)); assert.ok(!r.systemText.includes('全部用短句'));
  assert.throws(() => E.deleteCustomModule('sys_core'), /内置/);
});
t('变量：已知变量被替换', () => {
  const { E, data } = fresh(); const c = E.addCustomModule({ name:'称呼', anchor:'character_core', template:'{{char}}叫{{user}}，今天{{weekday}}' });
  assert.ok(E.assemble(ctxOf(data)).systemText.includes('阿屿叫小明，今天周五'));
});
t('变量：不存在的变量在可选模块里警告并按空处理，在必需模块里报错', () => {
  const { E, data } = fresh(); E.addCustomModule({ name:'坏变量', anchor:'character_core', template:'你好{{nobody}}' });
  const r = E.assemble(ctxOf(data));
  assert.ok(r.warnings.some(w => /nobody/.test(w)));
  E.setTemplate('mem_rules', '规则{{nobody}}');
  assert.throws(() => E.assemble(ctxOf(data)), e => /nobody/.test(e.message));
});
t('变量：值为空（如用户没写人设）同样会提示', () => {
  const { E, data } = fresh(); E.addCustomModule({ name:'空变量', anchor:'character_core', template:'{{user_desc}}' });
  const r = E.assemble(ctxOf(data)); assert.ok(r.warnings.some(w => /user_desc/.test(w)));
});
t('场景条件：线下场景不注入私聊专属模块', () => {
  const { E, data } = fresh();
  const r = E.assemble(ctxOf(data, { scene:'voice_call' }));
  assert.equal(r.blocks.find(b => b.id === 'out_style').status, 'scene_skip');
});
t('多套预设：复制、切换、互不影响、删除', () => {
  const { E, data } = fresh();
  const p = E.createPreset('我的', 'preset_default'); E.setEnabled('roleplay_mode', false);
  assert.ok(!E.assemble(ctxOf(data)).systemText.includes('沉浸式角色扮演'));
  E.setActivePreset('preset_default'); assert.ok(E.assemble(ctxOf(data)).systemText.includes('沉浸式角色扮演'));
  assert.throws(() => E.deletePreset('preset_default'), /不能/);
  E.deletePreset(p.id); assert.equal(E.listPresets().length, 1);
});
t('导出再导入内容一致，且不含密钥', () => {
  const { E, data } = fresh(); const c = E.addCustomModule({ name:'x', anchor:'life_state', template:'T' }); E.setEnabled('time_rules', false);
  const text = E.exportPreset(); assert.ok(!/apiKey|api_key|sk-/i.test(text));
  const p = E.importPreset(text); assert.equal(E.getActivePreset().id, p.id);
  assert.ok(E.assemble(ctxOf(data)).systemText.includes('【补充设定·x】'));
  assert.equal(E.resolveModules().find(m => m.id === 'time_rules').enabled, false);
  assert.throws(() => E.importPreset('{"a":1}'), /不是岛屿/);
});
t('存储：序列化后重新加载保持一致', () => {
  const { E } = fresh(); E.setEnabled('roleplay_mode', false); E.addCustomModule({ name:'k', template:'v' });
  const raw = JSON.parse(JSON.stringify(E.serialize()));
  const { E:E2 } = fresh(); E2.load(raw);
  assert.equal(E2.resolveModules().find(m => m.id === 'roleplay_mode').enabled, false);
  assert.equal(E2.resolveModules().filter(m => m.custom).length, 1);
});
t('请求适配：system / developer 两种角色，历史消息原样保留', () => {
  const { E } = fresh(); const hist = [{ role:'user', content:'你好' }, { role:'assistant', content:'嗨' }];
  let m = E.adaptRequest('SYS', hist); assert.equal(m.map(x => x.role).join(), 'system,user,assistant');
  E.setSystemRole('developer'); m = E.adaptRequest('SYS', hist); assert.equal(m[0].role, 'developer'); assert.equal(m[1].content, '你好');
});
t('快照：与实际发送一致；组装后被追加内容会如实标记', () => {
  const { E, data } = fresh(); const r = E.assemble(ctxOf(data));
  const msgs = E.adaptRequest(r.systemText, [{ role:'user', content:'你好' }]);
  const id = E.recordSnapshot({ name:'阿屿', blocks:r.blocks, warnings:r.warnings, messages:msgs, presetName:r.presetName });
  E.markSent(id, msgs); let s = E.findSnapshot(id);
  assert.equal(s.status, 'sent'); assert.equal(s.modifiedAfterAssembly, false); assert.equal(s.messages[0].content, msgs[0].content);
  const msgs2 = E.adaptRequest(r.systemText, []); const id2 = E.recordSnapshot({ name:'阿屿', blocks:r.blocks, messages:msgs2 });
  const sent = msgs2.concat([{ role:'user', content:'【后台主动消息任务】' }]); E.markSent(id2, sent);
  s = E.findSnapshot(id2); assert.equal(s.modifiedAfterAssembly, true); assert.equal(s.messages.length, 2);
});
t('状态区分：已组装 / 已发送 / 服务端已接受 / 失败；超限错误被识别', () => {
  const { E, data } = fresh(); const r = E.assemble(ctxOf(data)); const msgs = E.adaptRequest(r.systemText, []);
  const id = E.recordSnapshot({ name:'a', blocks:r.blocks, messages:msgs }); assert.equal(E.findSnapshot(id).status, 'assembled');
  E.markSent(id, msgs); assert.equal(E.findSnapshot(id).status, 'sent');
  E.markAccepted(id); assert.equal(E.findSnapshot(id).status, 'accepted');
  const id2 = E.recordSnapshot({ name:'b', blocks:r.blocks, messages:msgs });
  E.markFailed(id2, { kind:'http', message:'HTTP 400', detail:'This model\'s maximum context length is 8192 tokens' });
  assert.equal(E.findSnapshot(id2).status, 'failed'); assert.equal(E.findSnapshot(id2).errorKind, 'context_overflow');
  const id3 = E.recordSnapshot({ name:'c', blocks:r.blocks, messages:msgs }); E.markFailed(id3, { kind:'network', message:'断网' });
  assert.notEqual(E.findSnapshot(id3).errorKind, 'context_overflow');
});
t('快照里不保存内嵌图片数据；不截断必需内容', () => {
  const { E, data } = fresh(); data.char_persona = '长'.repeat(200000);
  const r = E.assemble(ctxOf(data)); assert.ok(r.systemText.includes('长'.repeat(200000)));
  const big = 'data:image/png;base64,' + 'A'.repeat(500);
  const id = E.recordSnapshot({ name:'a', blocks:r.blocks, messages:[{ role:'user', content:[{ type:'text', text:'图' }, { type:'image_url', image_url:{ url:big } }] }, { role:'user', content:'看 ' + big }] });
  assert.ok(!JSON.stringify(E.findSnapshot(id).messages).includes('AAAAAAAAAA'));
});
console.log('\n共通过 ' + passed + ' 项' + (process.exitCode ? '，有失败项' : ''));
