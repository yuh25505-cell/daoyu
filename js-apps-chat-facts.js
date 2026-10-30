/* 岛屿 · 聊天 · 结构化记忆（提示词接入 / 自动提取 / 管理页）
 * 依赖：js-core-memory-engine.js、js-core-prompt-engine.js、js-apps-chat-memory.js */
'use strict';

(function(){
  var KIND_NAMES = MemoryEngine.KINDS;
  var CONF_NAMES = { confirmed:'已确认', likely:'比较确定', uncertain:'不确定' };
  var STATUS_NAMES = { active:'有效', superseded:'已被替代', revoked:'已删除', archived:'已归档' };
  var PLAN_NAMES = { pending:'待办', done:'已完成', cancelled:'已取消', none:'' };
  var EXTRACT_CHAR_LIMIT = 30000;
  var extracting = {};

  function h(s){ return escapeHTML(String(s == null ? '' : s)); }
  function bookOf(name){ return MemoryEngine.ensureBook(normalizeChatMemory(name)); }

  /* ───────── 提示词来源 ───────── */
  function recentUserText(messages){
    var out = [];
    for (var i = (messages || []).length - 1; i >= 0 && out.length < 3; i--) {
      var m = messages[i];
      if (m && m.from === 'me' && !m.recalled && typeof m.text === 'string' && m.text.trim()) out.push(m.text.trim());
    }
    return out.join(' ');
  }
  function factsRetrieval(ctx){
    if (ctx._facts) return ctx._facts;
    var mem = normalizeChatMemory(ctx.name), book = MemoryEngine.ensureBook(mem), now = Date.now();
    if (MemoryEngine.syncLegacyImportant(book, mem.importantMemories, now)) saveMemoryState();
    var rows = MemoryEngine.retrieve(book, { query:recentUserText(ctx.messages), limit:24, now:now });
    ctx._facts = MemoryEngine.renderForPrompt(rows, now);
    return ctx._facts;
  }
  PromptEngine.registerProvider('mem_facts', function(ctx){ return factsRetrieval(ctx).facts; });
  PromptEngine.registerProvider('mem_plans', function(ctx){ return factsRetrieval(ctx).plans; });

  /* 结构化记忆模块开着时，旧的“重要记忆”已经并入其中，不再重复注入；用户把它关掉时才退回旧方式 */
  window.isFactsModuleEnabled = function(){
    return PromptEngine.resolveModules().some(function(m){ return m.id === 'mem_facts' && m.enabled; });
  };

  /* ───────── 自动提取：副 API 读聊天 → 校验来源 → 入库 ───────── */
  function rowId(row){ return row && row.id ? String(row.id) : ''; }

  function extractFacts(name){
    if (!name) return Promise.resolve({ ok:false, message:'没有选中聊天' });
    if (extracting[name]) return extracting[name];
    if (!isSecondaryApiReady()) return Promise.resolve({ ok:false, message:'副 API 还没有配置，请先到设置里检查副 API' });
    var book = bookOf(name), after = book.extractedThroughSeq;
    extracting[name] = readMemoryRowsFromDb(name, after, 0, 300).then(function(rows){
      var lines = [], valid = {}, used = 0, lastSeq = after, skipped = 0, firstSeq = 0, total = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], seq = Number(r.__islandSeq) || 0, id = rowId(r), text = memoryMessageText(r);
        if (!text) { lastSeq = seq; continue; }
        if (!id) { skipped++; lastSeq = seq; continue; }
        var line = '[' + id + '] ' + text;
        if (total + line.length > EXTRACT_CHAR_LIMIT && used > 0) break;
        lines.push(line); valid[id] = 1; used++; total += line.length; lastSeq = seq; if (!firstSeq) firstSeq = seq;
      }
      if (!used) {
        if (lastSeq > after) { book.extractedThroughSeq = lastSeq; return saveMemoryState().then(function(){ return { ok:true, added:0, merged:0, conflict:0, rejected:0, remaining:false, message:'没有新的可提取内容' }; }); }
        return { ok:true, added:0, merged:0, conflict:0, rejected:0, remaining:false, message:'没有新的聊天内容' };
      }
      var remaining = rows.length > used + skipped && lastSeq < (Number(rows[rows.length - 1].__islandSeq) || 0);
      var cfg = Object.assign({}, getSecondaryApiConfig(), { temperature:0.1, maxTokens:Math.max(1200, Number(getSecondaryApiConfig().maxTokens) || 1200) });
      var now = new Date();
      var msgs = [
        { role:'system', content:MemoryEngine.EXTRACTION_PROMPT },
        { role:'user', content:'现在是 ' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '。角色名：' + name + '。\n【聊天原文】\n' + lines.join('\n') }
      ];
      return callApiOnce(msgs, cfg).then(function(raw){
        var text = String(raw || '').trim();
        if (looksLikeSummaryRefusal(text)) throw new Error('模型拒绝了这次提取');
        var cands = MemoryEngine.parseExtraction(text);
        var res = { ok:true, added:0, merged:0, conflict:0, rejected:0, rejectedReasons:[], remaining:remaining, firstSeq:firstSeq, lastSeq:lastSeq };
        cands.forEach(function(c){
          c.source.seqStart = firstSeq; c.source.seqEnd = lastSeq;
          var r = MemoryEngine.propose(book, c, { validMessageIds:valid });
          if (r.action === 'added') res.added++;
          else if (r.action === 'merged') res.merged++;
          else if (r.action === 'conflict') res.conflict++;
          else { res.rejected++; res.rejectedReasons.push(r.message); }
        });
        /* 只有解析和入库都成功才推进进度，失败时下次会重新读这一段 */
        book.extractedThroughSeq = lastSeq;
        return saveMemoryState().then(function(){ return res; });
      });
    }).catch(function(err){
      return { ok:false, message:(typeof memorySummaryErrorText === 'function' ? memorySummaryErrorText(err).replace(/^总结失败：/, '提取失败：') : '提取失败：' + (err && err.message || '未知错误')) };
    }).then(function(res){ delete extracting[name]; return res; });
    return extracting[name];
  }
  window.extractFactsFromChat = extractFacts;

  /* ───────── 管理页（沿用预设 APP 的页面与弹窗样式） ───────── */
  var root = null, listEl = null, nameEl = null, current = '';

  function build(){
    if (root) return;
    root = document.createElement('div');
    root.className = 'preset-app facts-app';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('data-swipe-back', '');
    root.innerHTML =
      '<div class="preset-shell">' +
        '<header class="preset-head">' +
          '<button aria-label="返回" class="ph-btn" data-swipe-back-close id="factsBack" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg></button>' +
          '<h1 class="preset-title" id="factsTitle">结构化记忆</h1>' +
          '<div class="preset-head-actions"><button class="preset-icon-btn" id="factsAdd" type="button">添加</button><button class="preset-icon-btn" id="factsExtract" type="button">提取</button></div>' +
        '</header>' +
        '<main class="preset-body"><div class="preset-list" id="factsList"></div></main>' +
      '</div>' +
      '<div class="preset-mask" id="factsMask"></div>' +
      '<section class="preset-sheet" id="factsSheet" role="dialog" aria-modal="true"></section>';
    document.body.appendChild(root);
    listEl = root.querySelector('#factsList');
    root.querySelector('#factsBack').addEventListener('click', closePage);
    root.querySelector('#factsMask').addEventListener('click', closeSheet);
    root.querySelector('#factsAdd').addEventListener('click', openAdd);
    root.querySelector('#factsExtract').addEventListener('click', runExtract);
    listEl.addEventListener('click', function(e){ var row = e.target.closest('[data-fid]'); if (row) openDetail(row.dataset.fid); });
  }
  function openPage(){
    if (!currentName) { toast('请先打开一个聊天'); return; }
    build(); current = currentName;
    root.querySelector('#factsTitle').textContent = current + ' · 结构化记忆';
    root.classList.add('is-open'); root.setAttribute('aria-hidden', 'false'); render();
  }
  function closePage(){ if (!root) return; closeSheet(); root.classList.remove('is-open'); root.setAttribute('aria-hidden', 'true'); if (typeof renderMemoryHomePage === 'function') renderMemoryHomePage(); }
  function openSheet(html){
    var s = root.querySelector('#factsSheet'); s.innerHTML = '<div class="preset-grab"></div>' + html;
    root.querySelector('#factsMask').classList.add('is-open'); s.classList.add('is-open'); s.scrollTop = 0; return s;
  }
  function closeSheet(){ if (!root) return; root.querySelector('#factsMask').classList.remove('is-open'); root.querySelector('#factsSheet').classList.remove('is-open'); releaseInputFocus(); }
  function head(t){ return '<div class="preset-sheet-head"><h2>' + h(t) + '</h2><button class="preset-x" data-close type="button">×</button></div>'; }
  function bindClose(s){ Array.prototype.forEach.call(s.querySelectorAll('[data-close]'), function(b){ b.addEventListener('click', closeSheet); }); }
  function save(){ return saveMemoryState().then(function(){ render(); }); }
  function guard(fn){ try { return fn(); } catch (e) { toast(e && e.message ? e.message : '操作失败'); return null; } }

  function tagsOf(it){
    var t = ['<em>' + h(KIND_NAMES[it.kind] || it.kind) + '</em>', '<em>' + h(CONF_NAMES[it.confidence] || '') + '</em>'];
    if (it.planStatus && it.planStatus !== 'none') t.push('<em>' + h(PLAN_NAMES[it.planStatus]) + '</em>');
    if (it.conflictWith.length) t.push('<em class="is-hot">冲突</em>');
    return t.join('');
  }
  function timeText(it){
    var now = Date.now();
    if (it.planStatus === 'pending' || (it.plannedAt && !it.occurredAt)) return MemoryEngine.describePlan({ plannedAt:it.plannedAt, text:'' }, now).replace(/：$/, '');
    return MemoryEngine.describeTime(it, now);
  }
  function rowHtml(it){
    return '<button class="facts-row" data-fid="' + h(it.id) + '" type="button"><span class="facts-tags">' + tagsOf(it) + '</span><strong>' + h(it.text) + '</strong><span class="facts-time">' + h(timeText(it)) + '</span></button>';
  }
  function render(){
    if (!root || !current) return;
    var book = bookOf(current), live = book.items.filter(MemoryEngine.isLive);
    var conflict = live.filter(function(x){ return x.conflictWith.length; });
    var plans = live.filter(function(x){ return x.planStatus === 'pending' && !x.conflictWith.length; });
    var rest = live.filter(function(x){ return !x.conflictWith.length && x.planStatus !== 'pending'; }).sort(function(a, b){ return (b.recordedAt || 0) - (a.recordedAt || 0); });
    var html = '';
    function group(title, rows){ if (rows.length) html += '<section class="preset-group"><div class="preset-group-head">' + h(title) + ' · ' + rows.length + '</div>' + rows.map(rowHtml).join('') + '</section>'; }
    group('有冲突，需要你裁决', conflict); group('待履行的计划', plans); group('记忆', rest);
    if (!html) html = '<div class="preset-empty-log">还没有结构化记忆</div>';
    listEl.innerHTML = html;
  }

  function sourceText(it){
    var all = [it.source].concat(it.sources || []), out = [], list = (typeof MESSAGES !== 'undefined' && MESSAGES[current]) || [];
    all.forEach(function(s, i){
      var ids = (s && s.messageIds) || [];
      if (!ids.length && !(s && s.summaryId)) return;
      var rows = ids.map(function(id){
        var m = list.filter(function(x){ return x && String(x.id) === id; })[0];
        return m ? '· ' + (m.from === 'me' ? '用户' : '角色') + '：' + String(m.text || '[非文字消息]').slice(0, 80) : '· 消息 ' + id + '（不在当前已加载的聊天窗口里）';
      });
      if (s.summaryId) rows.push('· 来自短期记忆总结 ' + s.summaryId);
      out.push('来源 ' + (i + 1) + (s.seqStart ? '（第 ' + s.seqStart + '–' + s.seqEnd + ' 条）' : '') + '\n' + rows.join('\n'));
    });
    return out.length ? out.join('\n\n') : (it.origin === 'user' ? '你亲手添加的' : '没有记录来源');
  }
  var ACTION_NAMES = { create:'创建', merge:'合并来源', confirm:'确认', correct:'修正', superseded:'被替代', conflict:'发现冲突', resolve:'裁决', revoke:'删除', archive:'归档', plan_done:'计划完成', plan_cancelled:'计划取消', plan_pending:'计划恢复' };

  function openDetail(id){
    var book = bookOf(current), it = MemoryEngine.find(book, id);
    if (!it) return;
    var conflicts = it.conflictWith.map(function(cid){ return MemoryEngine.find(book, cid); }).filter(Boolean);
    var hist = (it.history || []).map(function(x){ var d = new Date(x.at); return '<div class="preset-diag"><span>' + h(ACTION_NAMES[x.action] || x.action) + '</span><em>' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</em>' + (x.note ? '<div class="preset-prob">' + h(x.note) + '</div>' : '') + '</div>'; }).join('');
    var btns = [];
    if (it.confidence !== 'confirmed') btns.push('<button class="preset-btn" data-do="confirm" type="button">确认无误</button>');
    btns.push('<button class="preset-btn" data-do="edit" type="button">修正</button>');
    if (it.conflictWith.length) btns.push('<button class="preset-btn is-primary" data-do="keep" type="button">以这条为准</button>');
    if (it.planStatus === 'pending') { btns.push('<button class="preset-btn" data-do="done" type="button">已完成</button>'); btns.push('<button class="preset-btn" data-do="cancel" type="button">取消计划</button>'); }
    else if (it.planStatus === 'done' || it.planStatus === 'cancelled') btns.push('<button class="preset-btn" data-do="reopen" type="button">恢复为待办</button>');
    btns.push('<button class="preset-btn" data-do="delete" type="button">删除</button>');
    var s = openSheet(head(KIND_NAMES[it.kind] || '记忆') +
      '<div class="preset-pre facts-text">' + h(it.text) + '</div>' +
      '<div class="preset-meta">' + h(timeText(it)) + ' · 重要度 ' + it.importance + ' · ' + h(CONF_NAMES[it.confidence]) + ' · ' + h(STATUS_NAMES[it.status]) + '</div>' +
      (conflicts.length ? '<div class="preset-warn is-error">与下面的说法矛盾：<br>' + conflicts.map(function(c){ return '· ' + h(c.text); }).join('<br>') + '</div>' : '') +
      '<details class="preset-msg" open><summary>来源</summary><pre class="preset-pre">' + h(sourceText(it)) + '</pre></details>' +
      '<details class="preset-msg"><summary>修改历史</summary><div class="preset-diag-list">' + hist + '</div></details>' +
      '<div class="facts-btns">' + btns.join('') + '</div>');
    bindClose(s);
    Array.prototype.forEach.call(s.querySelectorAll('[data-do]'), function(b){
      b.addEventListener('click', function(){
        var k = b.dataset.do;
        if (k === 'edit') return openEdit(it);
        if (k === 'delete') {
          islandConfirm('删除后这条记忆的内容会被清空，同样的内容也不会再被自动提取。', { title:'删除记忆', confirmText:'删除' }).then(function(yes){ if (!yes) return; MemoryEngine.revoke(book, it.id); closeSheet(); save(); });
          return;
        }
        guard(function(){
          if (k === 'confirm') MemoryEngine.confirm(book, it.id);
          else if (k === 'keep') MemoryEngine.resolveConflict(book, it.id);
          else if (k === 'done') MemoryEngine.setPlanStatus(book, it.id, 'done');
          else if (k === 'cancel') MemoryEngine.setPlanStatus(book, it.id, 'cancelled');
          else if (k === 'reopen') MemoryEngine.setPlanStatus(book, it.id, 'pending');
        });
        closeSheet(); save();
      });
    });
  }
  function dateInput(ts){ if (!ts) return ''; var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function openEdit(it){
    var isPlan = it.planStatus === 'pending' || it.kind === 'promise';
    var s = openSheet(head('修正') +
      '<label class="preset-field"><span>内容</span><textarea id="factsEdText" rows="5">' + h(it.text) + '</textarea></label>' +
      '<label class="preset-field"><span>' + (isPlan ? '计划日期（不知道就留空）' : '发生日期（不知道就留空）') + '</span><input id="factsEdDate" type="date" value="' + dateInput(isPlan ? it.plannedAt : it.occurredAt) + '"/></label>' +
      '<div class="preset-actions"><button class="preset-btn" data-close type="button">取消</button><button class="preset-btn is-primary" id="factsEdSave" type="button">保存</button></div>');
    bindClose(s);
    s.querySelector('#factsEdSave').addEventListener('click', function(){
      var text = s.querySelector('#factsEdText').value, date = s.querySelector('#factsEdDate').value;
      var ok = guard(function(){
        var patch = { text:text };
        var ts = date ? new Date(date + 'T00:00:00').getTime() : 0;
        if (isPlan) patch.plannedAt = ts; else { patch.occurredAt = ts; patch.occurredPrecision = 'day'; }
        MemoryEngine.correct(bookOf(current), it.id, patch); return true;
      });
      if (ok) { closeSheet(); save(); }
    });
  }
  function openAdd(){
    var opts = Object.keys(KIND_NAMES).map(function(k){ return '<option value="' + k + '">' + h(KIND_NAMES[k]) + '</option>'; }).join('');
    var s = openSheet(head('添加记忆') +
      '<label class="preset-field"><span>类型</span><select id="factsAddKind">' + opts + '</select></label>' +
      '<label class="preset-field"><span>内容</span><textarea id="factsAddText" rows="5"></textarea></label>' +
      '<label class="preset-field"><span>日期（不知道就留空）</span><input id="factsAddDate" type="date"/></label>' +
      '<div class="preset-actions"><button class="preset-btn" data-close type="button">取消</button><button class="preset-btn is-primary" id="factsAddSave" type="button">添加</button></div>');
    bindClose(s);
    s.querySelector('#factsAddSave').addEventListener('click', function(){
      var kind = s.querySelector('#factsAddKind').value, text = s.querySelector('#factsAddText').value, date = s.querySelector('#factsAddDate').value;
      var ts = date ? new Date(date + 'T00:00:00').getTime() : 0, c = { kind:kind, text:text, origin:'user', importance:4, source:{ app:'chat' } };
      if (kind === 'promise') c.plannedAt = ts; else if (ts) { c.occurredAt = ts; c.occurredPrecision = 'day'; }
      var r = MemoryEngine.propose(bookOf(current), c);
      if (r.action === 'rejected') { toast(r.message || '添加失败'); return; }
      closeSheet(); save();
    });
  }
  function runExtract(){
    var btn = root.querySelector('#factsExtract'); btn.disabled = true; btn.textContent = '提取中…';
    extractFacts(current).then(function(r){
      btn.disabled = false; btn.textContent = '提取';
      if (!r.ok) { toast(r.message); return; }
      var parts = [];
      if (r.added) parts.push('新增 ' + r.added + ' 条'); if (r.merged) parts.push('合并 ' + r.merged + ' 条'); if (r.conflict) parts.push('发现冲突 ' + r.conflict + ' 条'); if (r.rejected) parts.push('拒收 ' + r.rejected + ' 条（来源无效或已被删除过）');
      toast((parts.length ? parts.join('，') : (r.message || '没有新的记忆')) + (r.remaining ? '。后面还有未处理的聊天，可再点一次' : ''));
      render();
    });
  }

  /* 记忆首页入口 + 数量 */
  var entry = $('pmFactsEntry');
  if (entry) entry.addEventListener('click', openPage);
  if (typeof renderMemoryHomePage === 'function') {
    var origRender = renderMemoryHomePage;
    renderMemoryHomePage = function(){
      origRender.apply(this, arguments);
      var c = $('pmFactsCount');
      if (c && currentName) { var s = MemoryEngine.stats(bookOf(currentName)); c.textContent = s.active + ' 条' + (s.conflict ? '，' + s.conflict + ' 条冲突' : ''); }
    };
  }
  window.IslandFactsPage = { open:openPage, close:closePage };
})();
