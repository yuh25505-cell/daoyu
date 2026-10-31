/* 岛屿 · 记忆引擎（结构化记忆层）
 * 管的是“能被追溯、能被修正”的条目：事实、事件、偏好、承诺与计划、关系变化、成长。
 * 每一条都有：来源（哪条消息）、事件发生时间、写入时间、可信度、状态、修改历史。
 * 原有的短期总结（清晰/模糊/鱼的记忆）和向量记忆继续由 js-apps-chat-memory.js 负责，本层不重复它们。
 * 不依赖页面，可在 node 里直接测试。 */
'use strict';

var MemoryEngine = (function(){
  var KINDS = { fact:'事实', event:'事件', preference:'偏好', promise:'承诺与计划', relationship:'关系变化', growth:'成长' };
  var DAY = 86400000;

  function newId(){ return 'mf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function normKey(text){ return String(text || '').toLowerCase().replace(/[\s\u3000，。！？、；：,.!?;:"'“”‘’（）()\[\]【】《》\-—_~…·]/g, ''); }

  /* 中文按相邻两字、英文按单词、数字单独成词 */
  function tokens(text){
    var s = String(text || '').toLowerCase(), out = {}, i;
    (s.match(/[a-z]+|\d+/g) || []).forEach(function(w){ out[w] = 1; });
    var cjk = s.replace(/[^\u4e00-\u9fff]/g, '');
    for (i = 0; i < cjk.length - 1; i++) out[cjk.slice(i, i + 2)] = 1;
    if (cjk.length === 1) out[cjk] = 1;
    return out;
  }
  function similarity(a, b){
    var ta = tokens(a), tb = tokens(b), inter = 0, ka = Object.keys(ta), kb = Object.keys(tb);
    if (!ka.length || !kb.length) return 0;
    ka.forEach(function(k){ if (tb[k]) inter++; });
    return inter / (ka.length + kb.length - inter);
  }
  function numbersOf(text){ return (String(text || '').match(/\d+/g) || []).sort().join(','); }
  function negationOf(text){ return (String(text || '').match(/[不没未别无非]/g) || []).length % 2; }
  function looksContradictory(a, b){
    var na = numbersOf(a), nb = numbersOf(b);
    if (na && nb && na !== nb) return '数字或日期不同';
    if (negationOf(a) !== negationOf(b)) return '肯定与否定相反';
    return '';
  }

  function ensureBook(mem){
    if (!mem.facts || typeof mem.facts !== 'object' || Array.isArray(mem.facts)) mem.facts = { version:1, items:[], tombstones:[], extractedThroughSeq:0 };
    var b = mem.facts;
    if (!Array.isArray(b.items)) b.items = [];
    if (!Array.isArray(b.tombstones)) b.tombstones = [];
    b.extractedThroughSeq = Number(b.extractedThroughSeq) || 0;
    return b;
  }
  function find(book, id){ for (var i = 0; i < book.items.length; i++) if (book.items[i].id === id) return book.items[i]; return null; }
  function isLive(it){ return !!it && it.status === 'active'; }
  function pushHistory(it, now, action, note){
    it.history = it.history || [];
    it.history.push({ at:now, action:action, note:note || '' });
  }
  function sameRange(a, b){
    if (!a || !b) return false;
    if (a.summaryId && a.summaryId === b.summaryId) return true;
    var ia = a.messageIds || [], ib = b.messageIds || [];
    return ia.length > 0 && ib.length > 0 && ia.some(function(x){ return ib.indexOf(x) >= 0; });
  }
  function parseTs(v){
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) && v > 0 ? v : 0;
    var t = Date.parse(String(v)); return isFinite(t) ? t : 0;
  }

  /* ───────── 写入：提出一条候选记忆 ─────────
   * cand: { kind, text, subjects[], occurredAt, occurredPrecision, plannedAt, importance, source:{app,messageIds,seqStart,seqEnd,summaryId}, origin }
   * origin: 'extractor'（模型提取）| 'user'（用户亲手写/确认）| 'legacy'（旧版重要记忆迁入）| 'app'（其他 APP 写入）
   * ctx: { now, validMessageIds } —— 给了 validMessageIds 时，模型引用的消息 id 必须真实存在，否则整条拒收 */
  function propose(book, cand, ctx){
    ctx = ctx || {}; var now = ctx.now || Date.now();
    cand = cand || {};
    var origin = cand.origin || 'extractor';
    var text = String(cand.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) return { action:'rejected', reason:'empty', message:'内容为空' };
    if (text.length > 600) text = text.slice(0, 600);
    var kind = KINDS[cand.kind] ? cand.kind : 'fact';
    var src = cand.source || {};
    var ids = Array.isArray(src.messageIds) ? src.messageIds.map(String).filter(Boolean) : [];
    if (origin === 'extractor') {
      if (!ids.length) return { action:'rejected', reason:'no_source', message:'没有标明来自哪条消息' };
      if (ctx.validMessageIds) {
        var bad = ids.filter(function(id){ return !ctx.validMessageIds[id]; });
        if (bad.length) return { action:'rejected', reason:'source_unverified', message:'引用了不存在的消息：' + bad.join(',') };
      }
    }
    var key = normKey(text);
    if (origin !== 'user' && book.tombstones.indexOf(key) >= 0) return { action:'rejected', reason:'deleted_before', message:'用户删除过同样的内容' };

    /* 时间：不编造。没有可信时间就标“不详” */
    var occurredAt = parseTs(cand.occurredAt), precision = cand.occurredPrecision;
    if (['exact', 'day', 'month', 'unknown'].indexOf(precision) < 0) precision = occurredAt ? 'day' : 'unknown';
    if (!occurredAt) { occurredAt = 0; precision = 'unknown'; }
    var plannedAt = parseTs(cand.plannedAt);
    if (occurredAt > now + 60000) { plannedAt = plannedAt || occurredAt; occurredAt = 0; precision = 'unknown'; }
    var isPlan = kind === 'promise' || plannedAt > now;

    var live = book.items.filter(isLive), i, other, sim;
    /* 去重：几乎相同 → 合并来源，不新增 */
    for (i = 0; i < live.length; i++) {
      other = live[i];
      if ((other.kind === 'promise') !== (kind === 'promise')) continue;
      sim = other.normKey === key ? 1 : similarity(other.text, text);
      if (sim >= 0.85 && !looksContradictory(other.text, text)) {
        if (ids.length && !sameRange(other.source, src) && !(other.sources || []).some(function(s){ return sameRange(s, src); })) {
          other.sources = (other.sources || []).concat([{ app:src.app || 'chat', messageIds:ids, seqStart:Number(src.seqStart) || 0, seqEnd:Number(src.seqEnd) || 0, summaryId:src.summaryId || '' }]);
          if (other.kind === 'relationship' && other.confidence === 'uncertain') other.confidence = 'likely';
          pushHistory(other, now, 'merge', '同一内容在另一段对话中再次出现，已合并来源');
        }
        if (Number(cand.importance) > other.importance) other.importance = Math.min(5, Number(cand.importance));
        if (origin === 'user' && other.confidence !== 'confirmed') { other.confidence = 'confirmed'; pushHistory(other, now, 'confirm', '用户确认'); }
        other.updatedAt = now;
        if (cand.legacyId && !other.legacyId) other.legacyId = cand.legacyId;
        return { action:'merged', item:other, reason:'duplicate' };
      }
    }
    var item = {
      id:newId(), kind:kind, text:text, normKey:key,
      subjects:Array.isArray(cand.subjects) ? cand.subjects.map(String).filter(Boolean).slice(0, 6) : [],
      occurredAt:occurredAt, occurredPrecision:precision, recordedAt:now, updatedAt:now,
      plannedAt:plannedAt, planStatus:isPlan ? 'pending' : 'none',
      importance:Math.max(1, Math.min(5, Number(cand.importance) || 3)),
      confidence: origin === 'user' ? 'confirmed' : (kind === 'relationship' ? 'uncertain' : 'likely'),
      status:'active', origin:origin, legacyId:cand.legacyId || '',
      source:{ app:src.app || 'chat', messageIds:ids, seqStart:Number(src.seqStart) || 0, seqEnd:Number(src.seqEnd) || 0, summaryId:src.summaryId || '' },
      sources:[], conflictWith:[], supersedes:'', supersededBy:'', history:[]
    };
    pushHistory(item, now, 'create', origin === 'user' ? '用户添加' : (origin === 'legacy' ? '从旧版重要记忆迁入' : '自动提取'));
    /* 冲突：很像但数字/肯定否定不同 → 双方都降为“不确定”，互相标记，等用户裁决 */
    if (origin !== 'user') {
      for (i = 0; i < live.length; i++) {
        other = live[i];
        if (similarity(other.text, text) < 0.4) continue;
        var why = looksContradictory(other.text, text);
        if (!why) continue;
        item.conflictWith.push(other.id);
        if (other.conflictWith.indexOf(item.id) < 0) other.conflictWith.push(item.id);
        if (other.confidence !== 'confirmed') other.confidence = 'uncertain';
        item.confidence = 'uncertain';
        pushHistory(item, now, 'conflict', '与已有记忆矛盾（' + why + '）');
        pushHistory(other, now, 'conflict', '新出现了与它矛盾的说法（' + why + '）');
      }
    }
    book.items.push(item);
    return { action:item.conflictWith.length ? 'conflict' : 'added', item:item };
  }

  /* ───────── 修正 / 确认 / 撤销 / 计划状态 / 归档 ───────── */
  function correct(book, id, patch, now){
    now = now || Date.now();
    var old = find(book, id);
    if (!old || !isLive(old)) throw new Error('找不到这条记忆，或它已经不是有效状态');
    patch = patch || {};
    var text = String(patch.text || '').trim();
    if (text.length < 2) throw new Error('修正后的内容不能为空');
    var fresh = clone(old);
    fresh.id = newId(); fresh.text = text.slice(0, 600); fresh.normKey = normKey(fresh.text);
    fresh.origin = 'user'; fresh.confidence = 'confirmed'; fresh.recordedAt = now; fresh.updatedAt = now;
    fresh.supersedes = old.id; fresh.supersededBy = ''; fresh.conflictWith = []; fresh.history = []; fresh.legacyId = '';
    if (patch.occurredAt != null) { var t = parseTs(patch.occurredAt); fresh.occurredAt = t; fresh.occurredPrecision = t ? (patch.occurredPrecision || 'day') : 'unknown'; }
    if (patch.plannedAt != null) fresh.plannedAt = parseTs(patch.plannedAt);
    if (patch.importance) fresh.importance = Math.max(1, Math.min(5, Number(patch.importance)));
    pushHistory(fresh, now, 'correct', '用户修正；旧版本：' + old.text);
    old.status = 'superseded'; old.supersededBy = fresh.id; old.updatedAt = now;
    pushHistory(old, now, 'superseded', '被用户修正替代');
    book.items.forEach(function(x){
      var k = x.conflictWith.indexOf(old.id);
      if (k >= 0) { x.conflictWith.splice(k, 1); if (!x.conflictWith.length && x.confidence === 'uncertain' && x.origin !== 'user') x.confidence = 'likely'; }
    });
    book.items.push(fresh);
    return fresh;
  }
  function confirm(book, id, now){
    var it = find(book, id); if (!it || !isLive(it)) throw new Error('找不到这条记忆');
    it.confidence = 'confirmed'; it.updatedAt = now || Date.now(); pushHistory(it, it.updatedAt, 'confirm', '用户确认');
    return it;
  }
  /* 用户要求删除：内容清空，只留一个空壳和“不要再提取”的标记 */
  function revoke(book, id, now){
    now = now || Date.now();
    var it = find(book, id); if (!it) return false;
    if (it.normKey && book.tombstones.indexOf(it.normKey) < 0) book.tombstones.push(it.normKey);
    it.status = 'revoked'; it.text = ''; it.updatedAt = now; it.sources = []; it.conflictWith = [];
    it.history = [{ at:now, action:'revoke', note:'用户删除' }];
    book.items.forEach(function(x){ var k = x.conflictWith.indexOf(id); if (k >= 0) x.conflictWith.splice(k, 1); });
    return true;
  }
  function resolveConflict(book, keepId, now){
    now = now || Date.now();
    var keep = find(book, keepId); if (!keep || !isLive(keep)) throw new Error('找不到要保留的记忆');
    keep.conflictWith.slice().forEach(function(id){
      var o = find(book, id);
      if (o && isLive(o)) { o.status = 'superseded'; o.supersededBy = keep.id; o.updatedAt = now; o.conflictWith = []; pushHistory(o, now, 'superseded', '冲突裁决：用户选择了另一条'); }
    });
    keep.conflictWith = []; keep.confidence = 'confirmed'; keep.updatedAt = now; pushHistory(keep, now, 'resolve', '用户裁决保留这一条');
    return keep;
  }
  function setPlanStatus(book, id, status, now){
    var it = find(book, id); if (!it || !isLive(it)) throw new Error('找不到这条记忆');
    if (['pending', 'done', 'cancelled'].indexOf(status) < 0) throw new Error('状态不对');
    it.planStatus = status; it.updatedAt = now || Date.now();
    pushHistory(it, it.updatedAt, 'plan_' + status, status === 'done' ? '计划已完成' : (status === 'cancelled' ? '计划已取消' : '计划恢复'));
    return it;
  }
  function archiveStale(book, now, days){
    now = now || Date.now(); var limit = (days || 180) * DAY, n = 0;
    book.items.forEach(function(it){
      if (isLive(it) && it.importance <= 2 && it.confidence !== 'confirmed' && it.planStatus !== 'pending' && !it.conflictWith.length && now - (it.updatedAt || it.recordedAt) > limit) {
        it.status = 'archived'; pushHistory(it, now, 'archive', '长期未更新的低重要度记忆，已归档'); n++;
      }
    });
    return n;
  }

  /* ───────── 旧版“重要记忆”同步（可重复执行，不会重复写入） ───────── */
  function parseLegacyImportant(text){
    var s = String(text || '').trim(), m = /^([^：:]{1,30})[：:](.+)$/.exec(s), label = '', body = s;
    if (m) { label = m[1].trim(); body = m[2].trim(); }
    var occurredAt = 0, precision = 'unknown';
    var d = /(\d{4})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})/.exec(label);
    if (d) { var ts = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])).getTime(); if (isFinite(ts)) { occurredAt = ts; precision = 'day'; } }
    else if (label && label !== '时间不详') body = s;   /* 标签不是日期：整句保留，不丢信息 */
    return { text:body || s, occurredAt:occurredAt, precision:precision };
  }
  function syncLegacyImportant(book, important, now){
    now = now || Date.now(); var changed = 0, present = {};
    (important || []).forEach(function(im){
      if (!im || !im.id) return;
      present[im.id] = true;
      if (book.items.some(function(f){ return f.legacyId === im.id; })) return;
      var p = parseLegacyImportant(im.text);
      var r = propose(book, { kind:'fact', text:p.text, occurredAt:p.occurredAt, occurredPrecision:p.precision, importance:4, origin:'legacy', legacyId:im.id,
        source:{ app:'chat', summaryId:im.sourceSummaryId || '' } }, { now:now });
      if (r.action !== 'rejected') changed++;
    });
    book.items.forEach(function(f){
      if (f.legacyId && !present[f.legacyId] && f.status === 'active' && f.origin === 'legacy') { revoke(book, f.id, now); changed++; }
    });
    return changed;
  }

  /* ───────── 检索：关键词 + 重要性 + 时间 + 人物 + 类型过滤，可叠加向量分数 ───────── */
  function retrieve(book, opt){
    opt = opt || {}; var now = opt.now || Date.now();
    var qt = tokens(opt.query || ''), qk = Object.keys(qt), vs = opt.vectorScores || {}, rows = [];
    book.items.forEach(function(it){
      if (!isLive(it)) return;
      if (opt.kinds && opt.kinds.length && opt.kinds.indexOf(it.kind) < 0) return;
      if (opt.subjects && opt.subjects.length && it.subjects.length && !it.subjects.some(function(s){ return opt.subjects.indexOf(s) >= 0; })) return;
      var when = it.occurredAt || it.plannedAt || 0;
      if (opt.from && when && when < opt.from) return;
      if (opt.to && when && when > opt.to) return;
      if (opt.minImportance && it.importance < opt.minImportance) return;
      var reasons = [], score = 0, matched = false;
      if (qk.length) {
        var tk = tokens(it.text), hit = 0; qk.forEach(function(k){ if (tk[k]) hit++; });
        if (hit) { score += hit / qk.length * 3; reasons.push('关键词匹配'); matched = true; }
        var q = String(opt.query || '').trim();
        if (q.length >= 2 && it.text.indexOf(q) >= 0) { score += 1.5; reasons.push('原文包含'); matched = true; }
      }
      if (vs[it.id]) { score += vs[it.id] * 2; reasons.push('语义相近'); matched = true; }
      if (it.importance >= 4) { score += 0.6; reasons.push('重要'); }
      if (it.confidence === 'confirmed') score += 0.2;
      var age = Math.max(0, now - (it.occurredAt || it.recordedAt || now)) / DAY; score += Math.max(0, 0.4 - age / 365 * 0.4);
      if (it.planStatus === 'pending') { score += 1; reasons.push('待办计划'); }
      if (it.conflictWith.length) { score += 0.5; reasons.push('存在冲突，需要提醒'); }
      /* 待办计划、有冲突的、最高重要度的，不管聊到什么都要带上，不能因为没搭上话题而被悄悄丢掉 */
      var must = it.planStatus === 'pending' || it.conflictWith.length > 0 || it.importance >= 5;
      if (qk.length && !matched && !must && it.importance < 4) return;
      rows.push({ item:it, score:score, reasons:reasons });
    });
    rows.sort(function(a, b){ return b.score - a.score; });
    return rows.slice(0, opt.limit || 20);
  }

  /* ───────── 写进提示词的文字（区分：已发生 / 计划中 / 计划已过期未确认） ───────── */
  function pad2(n){ return n < 10 ? '0' + n : '' + n; }
  function describeTime(it, now){
    var t = it.occurredAt;
    if (!t || it.occurredPrecision === 'unknown') return '时间不详';
    var d = new Date(t), base = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    if (it.occurredPrecision === 'month') base = d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
    if (it.occurredPrecision === 'exact') base += ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    var days = Math.floor((now - t) / DAY);
    return base + (days >= 1 ? '（约' + days + '天前）' : '（今天）');
  }
  function describePlan(it, now){
    var p = it.plannedAt;
    if (!p) return it.text + '（没有明确时间）';
    var d = new Date(p), s = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (p > now) return '计划于 ' + s + '，尚未发生：' + it.text;
    return '原定 ' + s + '，时间已过，是否完成没有确认：' + it.text;
  }
  function renderForPrompt(rows, now){
    now = now || Date.now();
    var sure = [], maybe = [], conflict = [], plans = [], seen = {};
    rows.forEach(function(r){
      var it = r.item;
      if (seen[it.id]) return; seen[it.id] = 1;
      if (it.planStatus === 'pending') { plans.push('· ' + describePlan(it, now)); return; }
      var line = '· [' + describeTime(it, now) + '] ' + it.text;
      if (it.planStatus === 'done') line += '（计划已完成）';
      if (it.planStatus === 'cancelled') line += '（计划已取消）';
      if (it.conflictWith.length) conflict.push(line);
      else if (it.confidence === 'confirmed') sure.push(line);
      else maybe.push(line);
    });
    var facts = [];
    if (sure.length) facts.push('已确认：\n' + sure.join('\n'));
    if (maybe.length) facts.push('未经确认，只能当作“可能”，需要时向对方确认：\n' + maybe.join('\n'));
    if (conflict.length) facts.push('说法互相矛盾，两种都不要当成事实，也不要自己选一个：\n' + conflict.join('\n'));
    return { facts:facts.join('\n\n'), plans:plans.join('\n') };
  }

  /* ───────── 模型提取：提示词与结果解析 ───────── */
  var EXTRACTION_PROMPT = [
    '你是聊天记忆的“事实提取器”。只从下面给出的聊天原文里提取值得长期记住的内容。',
    '类别 kind：fact（稳定事实）、event（已发生的事件）、preference（偏好）、promise（承诺或未来计划）、relationship（双方关系的明确变化）、growth（角色的学习、工作、人生阶段变化）。',
    '严格规则：',
    '1. 每条必须引用来源消息：sources 填方括号里的消息编号，只能用原文里出现过的编号。',
    '2. 时间只能依据原文里明确的日期，或原文标注的消息时间推出；推不出来就填 null，不要猜。已经发生的事用 occurredAt，未来才发生的事用 plannedAt。格式 2026-10-30 或 2026-10-30T20:00。',
    '3. 不要补充原文没有的细节、动机、对白；不确定就不要提取。日常闲聊不要提取，宁缺毋滥。',
    '4. 一次情绪化的对话不算关系变化；只有双方明确确认的关系变化才用 relationship。',
    '5. importance 为 1 到 5 的整数。',
    '只输出一个 JSON 数组，不要任何解释。每个元素：{"kind":"","text":"","subjects":["涉及的人名"],"occurredAt":null,"plannedAt":null,"importance":3,"sources":["消息编号"]}。没有可提取的内容就输出 []。'
  ].join('\n');

  function parseExtraction(raw){
    var s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var a = s.indexOf('['), b = s.lastIndexOf(']');
    if (a < 0 || b < a) throw new Error('模型没有返回 JSON 数组');
    var arr;
    try { arr = JSON.parse(s.slice(a, b + 1)); } catch (e) { throw new Error('模型返回的 JSON 无法解析'); }
    if (!Array.isArray(arr)) throw new Error('模型返回的不是数组');
    return arr.filter(function(x){ return x && typeof x === 'object' && x.text; }).map(function(x){
      var occ = x.occurredAt ? String(x.occurredAt) : '';
      var prec = /T\d{2}:\d{2}/.test(occ) ? 'exact' : (/^\d{4}-\d{2}-\d{2}$/.test(occ) ? 'day' : (/^\d{4}-\d{2}$/.test(occ) ? 'month' : undefined));
      return { kind:x.kind, text:x.text, subjects:x.subjects, occurredAt:occ, occurredPrecision:prec, plannedAt:x.plannedAt ? String(x.plannedAt) : '',
        importance:x.importance, source:{ app:'chat', messageIds:Array.isArray(x.sources) ? x.sources : [] }, origin:'extractor' };
    });
  }

  function stats(book){
    var s = { total:0, active:0, conflict:0, pendingPlans:0, uncertain:0 };
    book.items.forEach(function(it){
      s.total++;
      if (!isLive(it)) return;
      s.active++; if (it.conflictWith.length) s.conflict++; if (it.planStatus === 'pending') s.pendingPlans++; if (it.confidence === 'uncertain') s.uncertain++;
    });
    return s;
  }

  return { KINDS:KINDS, EXTRACTION_PROMPT:EXTRACTION_PROMPT, ensureBook:ensureBook, find:find, isLive:isLive,
    propose:propose, correct:correct, confirm:confirm, revoke:revoke, resolveConflict:resolveConflict, setPlanStatus:setPlanStatus, archiveStale:archiveStale,
    syncLegacyImportant:syncLegacyImportant, parseLegacyImportant:parseLegacyImportant, retrieve:retrieve, renderForPrompt:renderForPrompt,
    describeTime:describeTime, describePlan:describePlan, parseExtraction:parseExtraction, similarity:similarity, stats:stats, normKey:normKey };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MemoryEngine;
