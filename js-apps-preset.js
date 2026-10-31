/* 岛屿 · 预设 App：提示词模块管理（列表 / 拖动排序 / 编辑 / 预设切换 / 预览 / 请求记录） */
'use strict';

(function(){
  var root = null, listEl = null, titleEl = null;
  var drag = null;
  var editing = { id:'', mode:'edit' };
  var previewName = '';

  var STATUS_TEXT = { injected:'已注入', off:'已关闭', scene_skip:'本场景不用', no_data:'暂无内容', empty_template:'正文为空', error:'出错' };
  var SNAP_TEXT = { assembled:'已组装', sent:'已发送', accepted:'服务端已接受', failed:'失败' };

  function h(s){ return escapeHTML(String(s == null ? '' : s)); }

  function build(){
    if (root) return;
    root = document.createElement('div');
    root.className = 'preset-app';
    root.id = 'presetApp';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('data-swipe-back', '');
    root.innerHTML =
      '<div class="preset-shell">' +
        '<header class="preset-head">' +
          '<button aria-label="返回桌面" class="ph-btn preset-back" data-swipe-back-close type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg></button>' +
          '<h1 class="preset-title">预设</h1>' +
          '<div class="preset-head-actions">' +
            '<button class="preset-icon-btn" id="presetLogBtn" type="button">记录</button>' +
            '<button class="preset-icon-btn" id="presetPreviewBtn" type="button">预览</button>' +
            '<button class="preset-icon-btn" id="presetMenuBtn" aria-label="更多" type="button">⋯</button>' +
          '</div>' +
        '</header>' +
        '<main class="preset-body">' +
          '<button class="preset-current" id="presetCurrent" type="button"><span id="presetCurrentName"></span><i>切换</i></button>' +
          '<div class="preset-list" id="presetList"></div>' +
        '</main>' +
      '</div>' +
      '<div class="preset-mask" id="presetMask"></div>' +
      '<section class="preset-sheet" id="presetSheet" role="dialog" aria-modal="true"></section>';
    document.body.appendChild(root);
    listEl = root.querySelector('#presetList');
    root.querySelector('#presetCurrent').addEventListener('click', openPresetSwitcher);
    root.querySelector('#presetMenuBtn').addEventListener('click', openMenu);
    root.querySelector('#presetPreviewBtn').addEventListener('click', function(){ openPreview(); });
    root.querySelector('#presetLogBtn').addEventListener('click', openLog);
    root.querySelector('.preset-back').addEventListener('click', closeApp);
    root.querySelector('#presetMask').addEventListener('click', closeSheet);
    listEl.addEventListener('click', onListClick);
    listEl.addEventListener('pointerdown', onPointerDown);
  }

  function openApp(){
    build();
    releaseInputFocus();
    if (typeof closeSettingsApp === 'function') closeSettingsApp();
    if (typeof closeChatApp === 'function') closeChatApp();
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    render();
  }
  function closeApp(){
    if (!root) return;
    closeSheet();
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
  }

  function guard(fn){
    try { return fn(); } catch (e) { toast(e && e.message ? e.message : '操作失败'); return null; }
  }

  /* ───────── 列表 ───────── */
  function render(){
    if (!root) return;
    var preset = PromptEngine.getActivePreset();
    root.querySelector('#presetCurrentName').textContent = preset.name;
    var mods = PromptEngine.resolveModules(preset);
    var html = '';
    PromptEngine.ANCHORS.forEach(function(a){
      var rows = mods.filter(function(m){ return m.anchor === a.id; });
      html += '<section class="preset-group" data-anchor="' + a.id + '"><div class="preset-group-head" data-anchor-head="' + a.id + '">' + h(a.name) + '</div>';
      rows.forEach(function(m){
        var lock = m.required || m.pinned;
        html += '<div class="preset-row' + (m.enabled ? '' : ' is-off') + '" data-mid="' + h(m.id) + '">' +
          (m.pinned ? '<span class="preset-grip is-fixed">固定</span>' : '<span class="preset-grip" data-grip>≡</span>') +
          '<button class="preset-row-main" data-act="edit" type="button"><strong>' + h(m.name) + '</strong>' +
            (m.custom ? '<em>自定义</em>' : '') + (m.edited ? '<em>已修改</em>' : '') + '</button>' +
          (m.required ? '<span class="preset-need">必需</span>' :
            '<button class="preset-switch' + (m.enabled ? ' is-on' : '') + '" data-act="toggle" aria-label="开关" type="button"><i></i></button>') +
          '</div>';
      });
      if (!rows.length) html += '<div class="preset-empty-slot" data-slot="' + a.id + '">空</div>';
      html += '</section>';
    });
    listEl.innerHTML = html;
  }

  function onListClick(e){
    var row = e.target.closest('[data-mid]');
    var act = e.target.closest('[data-act]');
    if (!row || !act) return;
    var id = row.dataset.mid;
    if (act.dataset.act === 'toggle') {
      var m = PromptEngine.resolveModules().filter(function(x){ return x.id === id; })[0];
      guard(function(){ PromptEngine.setEnabled(id, !m.enabled); });
      render();
    } else if (act.dataset.act === 'edit') openEditor(id);
  }

  /* ───────── 拖动排序 ───────── */
  function onPointerDown(e){
    var grip = e.target.closest('[data-grip]');
    if (!grip) return;
    var row = grip.closest('[data-mid]');
    if (!row) return;
    e.preventDefault();
    drag = { id:row.dataset.mid, row:row, pointerId:e.pointerId, target:null };
    row.classList.add('is-dragging');
    try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    grip.addEventListener('pointermove', onPointerMove);
    grip.addEventListener('pointerup', onPointerUp);
    grip.addEventListener('pointercancel', onPointerCancel);
    drag.grip = grip;
  }
  function clearMarks(){
    Array.prototype.forEach.call(listEl.querySelectorAll('.drop-before,.drop-after,.drop-slot'), function(n){ n.classList.remove('drop-before', 'drop-after', 'drop-slot'); });
  }
  function onPointerMove(e){
    if (!drag) return;
    clearMarks();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    drag.target = null;
    if (!el) return;
    var row = el.closest && el.closest('[data-mid]');
    var slot = el.closest && el.closest('[data-slot]');
    var head = el.closest && el.closest('[data-anchor-head]');
    if (row && row !== drag.row) {
      var r = row.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2;
      row.classList.add(before ? 'drop-before' : 'drop-after');
      drag.target = { rowId:row.dataset.mid, before:before };
    } else if (slot) {
      slot.classList.add('drop-slot'); drag.target = { anchor:slot.dataset.slot };
    } else if (head) {
      head.classList.add('drop-slot'); drag.target = { anchor:head.dataset.anchorHead, atStart:true };
    }
    var body = root.querySelector('.preset-body'), br = body.getBoundingClientRect();
    if (e.clientY < br.top + 60) body.scrollTop -= 14; else if (e.clientY > br.bottom - 60) body.scrollTop += 14;
  }
  function endDrag(){
    if (!drag) return;
    drag.row.classList.remove('is-dragging');
    drag.grip.removeEventListener('pointermove', onPointerMove);
    drag.grip.removeEventListener('pointerup', onPointerUp);
    drag.grip.removeEventListener('pointercancel', onPointerCancel);
    clearMarks();
  }
  function onPointerCancel(){ endDrag(); drag = null; }
  function onPointerUp(){
    var d = drag; endDrag(); drag = null;
    if (!d || !d.target) return;
    var t = d.target;
    guard(function(){
      var mods = PromptEngine.resolveModules();
      if (t.rowId) {
        var idx = -1; mods.forEach(function(m, i){ if (m.id === t.rowId) idx = i; });
        var beforeId = t.rowId;
        if (!t.before) {
          var next = mods[idx + 1];
          var tgt = mods[idx];
          beforeId = (next && next.anchor === tgt.anchor && next.id !== d.id) ? next.id : null;
          if (next && next.id === d.id) { var n2 = mods[idx + 2]; beforeId = (n2 && n2.anchor === tgt.anchor) ? n2.id : null; }
          PromptEngine.moveModule(d.id, beforeId, tgt.anchor);
        } else PromptEngine.moveModule(d.id, beforeId);
      } else if (t.atStart) {
        var first = mods.filter(function(m){ return m.anchor === t.anchor && m.id !== d.id; })[0];
        PromptEngine.moveModule(d.id, first ? first.id : null, t.anchor);
      } else PromptEngine.moveModule(d.id, null, t.anchor);
    });
    render();
  }

  /* ───────── 弹窗外壳（岛屿底部弹窗） ───────── */
  function openSheet(html){
    var sheet = root.querySelector('#presetSheet');
    sheet.innerHTML = '<div class="preset-grab" aria-hidden="true"></div>' + html;
    root.querySelector('#presetMask').classList.add('is-open');
    sheet.classList.add('is-open');
    sheet.scrollTop = 0;
    return sheet;
  }
  function closeSheet(){
    if (!root) return;
    root.querySelector('#presetMask').classList.remove('is-open');
    root.querySelector('#presetSheet').classList.remove('is-open');
    releaseInputFocus();
  }
  function sheetHead(title){
    return '<div class="preset-sheet-head"><h2>' + h(title) + '</h2><button class="preset-x" data-close aria-label="关闭" type="button">×</button></div>';
  }
  function bindClose(sheet){ Array.prototype.forEach.call(sheet.querySelectorAll('[data-close]'), function(b){ b.addEventListener('click', closeSheet); }); }

  /* ───────── 编辑模块 ───────── */
  function openEditor(id, createMode){
    var mods = PromptEngine.resolveModules();
    var m = createMode ? { id:'', name:'', anchor:'character_core', template:'', custom:true, required:false, pinned:'', kind:'rule', edited:false } : mods.filter(function(x){ return x.id === id; })[0];
    if (!m) return;
    editing = { id:m.id, mode:createMode ? 'create' : 'edit' };
    var anchorOpts = PromptEngine.ANCHORS.map(function(a){ return '<option value="' + a.id + '"' + (a.id === m.anchor ? ' selected' : '') + '>' + h(a.name) + '</option>'; }).join('');
    var chips = PromptEngine.VARIABLES.filter(function(v){ return m.kind === 'data' || v !== 'content'; }).map(function(v){ return '<button class="preset-chip" data-var="' + v + '" type="button">{{' + v + '}}</button>'; }).join('');
    var sheet = openSheet(
      sheetHead(createMode ? '新建模块' : m.name) +
      (m.custom ? '<label class="preset-field"><span>名称</span><input id="presetEdName" maxlength="40" value="' + h(m.name) + '" type="text"/></label>' : '') +
      (m.pinned ? '' : '<label class="preset-field"><span>插入位置</span><select id="presetEdAnchor">' + anchorOpts + '</select></label>') +
      '<label class="preset-field"><span>正文</span><textarea id="presetEdText" rows="10">' + h(m.template) + '</textarea></label>' +
      '<div class="preset-chips">' + chips + '</div>' +
      '<div class="preset-actions">' +
        (m.custom && !createMode ? '<button class="preset-btn" id="presetEdDelete" type="button">删除</button>' : (m.edited ? '<button class="preset-btn" id="presetEdReset" type="button">恢复默认</button>' : '<button class="preset-btn" data-close type="button">取消</button>')) +
        '<button class="preset-btn is-primary" id="presetEdSave" type="button">保存</button>' +
      '</div>');
    bindClose(sheet);
    var ta = sheet.querySelector('#presetEdText');
    Array.prototype.forEach.call(sheet.querySelectorAll('[data-var]'), function(b){
      b.addEventListener('click', function(){
        var tok = '{{' + b.dataset.var + '}}', s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
        ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e);
        ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length;
      });
    });
    sheet.querySelector('#presetEdSave').addEventListener('click', function(){
      var text = ta.value, nameEl = sheet.querySelector('#presetEdName'), anchorEl = sheet.querySelector('#presetEdAnchor');
      var ok = guard(function(){
        if (createMode) {
          if (!nameEl.value.trim()) throw new Error('请填写模块名称');
          PromptEngine.addCustomModule({ name:nameEl.value.trim(), anchor:anchorEl.value, template:text });
        } else {
          PromptEngine.setTemplate(m.id, text);
          if (m.custom && nameEl && nameEl.value.trim() !== m.name) PromptEngine.renameCustom(m.id, nameEl.value.trim());
          if (anchorEl && anchorEl.value !== m.anchor) PromptEngine.setAnchor(m.id, anchorEl.value);
        }
        return true;
      });
      if (ok) { closeSheet(); render(); }
    });
    var del = sheet.querySelector('#presetEdDelete');
    if (del) del.addEventListener('click', function(){
      islandConfirm('删除这个自定义模块？', { title:'删除模块', confirmText:'删除' }).then(function(yes){
        if (!yes) return;
        guard(function(){ PromptEngine.deleteCustomModule(m.id); });
        closeSheet(); render();
      });
    });
    var rst = sheet.querySelector('#presetEdReset');
    if (rst) rst.addEventListener('click', function(){ PromptEngine.resetModule(m.id); closeSheet(); render(); });
  }

  /* ───────── 预设切换 / 菜单 ───────── */
  function openPresetSwitcher(){
    var rows = PromptEngine.listPresets().map(function(p){
      return '<button class="preset-pick' + (p.active ? ' is-active' : '') + '" data-pid="' + h(p.id) + '" type="button"><span>' + h(p.name) + '</span>' + (p.active ? '<i>使用中</i>' : '') + '</button>';
    }).join('');
    var sheet = openSheet(sheetHead('切换预设') + '<div class="preset-picks">' + rows + '</div>');
    bindClose(sheet);
    Array.prototype.forEach.call(sheet.querySelectorAll('[data-pid]'), function(b){
      b.addEventListener('click', function(){ guard(function(){ PromptEngine.setActivePreset(b.dataset.pid); }); closeSheet(); render(); });
    });
  }

  function openMenu(){
    var role = PromptEngine.getSystemRole();
    var active = PromptEngine.getActivePreset();
    var sheet = openSheet(sheetHead('更多') +
      '<div class="preset-menu">' +
        '<button data-m="newmod" type="button">新建模块</button>' +
        '<button data-m="copy" type="button">复制当前预设</button>' +
        '<button data-m="rename" type="button"' + (active.builtin ? ' disabled' : '') + '>重命名预设</button>' +
        '<button data-m="export" type="button">导出当前预设</button>' +
        '<button data-m="import" type="button">导入预设</button>' +
        '<button data-m="reset" type="button">恢复当前预设默认</button>' +
        '<button data-m="delete" type="button"' + (active.builtin ? ' disabled' : '') + '>删除当前预设</button>' +
      '</div>' +
      '<div class="preset-field"><span>系统消息角色</span><div class="preset-seg" id="presetRoleSeg">' +
        '<button data-role="system" type="button" class="' + (role === 'system' ? 'is-active' : '') + '">system</button>' +
        '<button data-role="developer" type="button" class="' + (role === 'developer' ? 'is-active' : '') + '">developer</button></div></div>' +
      '<input id="presetImportFile" type="file" accept=".json,application/json" hidden/>');
    bindClose(sheet);
    Array.prototype.forEach.call(sheet.querySelectorAll('[data-role]'), function(b){
      b.addEventListener('click', function(){
        PromptEngine.setSystemRole(b.dataset.role);
        Array.prototype.forEach.call(sheet.querySelectorAll('[data-role]'), function(x){ x.classList.toggle('is-active', x === b); });
      });
    });
    var file = sheet.querySelector('#presetImportFile');
    file.addEventListener('change', function(){
      var f = file.files && file.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function(){ guard(function(){ var p = PromptEngine.importPreset(String(r.result || '')); toast('已导入：' + p.name); }); closeSheet(); render(); };
      r.readAsText(f);
    });
    Array.prototype.forEach.call(sheet.querySelectorAll('[data-m]'), function(b){
      b.addEventListener('click', function(){
        var k = b.dataset.m, cur = PromptEngine.getActivePreset();
        if (k === 'newmod') { openEditor('', true); return; }
        if (k === 'import') { file.click(); return; }
        if (k === 'copy') {
          islandPrompt('', { title:'复制预设', placeholder:'新预设名称', value:cur.name + ' 副本', confirmText:'创建', maxLength:30 }).then(function(v){
            if (v === null) return; guard(function(){ PromptEngine.createPreset(v, cur.id); }); closeSheet(); render();
          });
        } else if (k === 'rename') {
          islandPrompt('', { title:'重命名预设', value:cur.name, confirmText:'保存', maxLength:30 }).then(function(v){
            if (v === null) return; guard(function(){ PromptEngine.renamePreset(cur.id, v); }); closeSheet(); render();
          });
        } else if (k === 'export') {
          guard(function(){
            var blob = new Blob([PromptEngine.exportPreset(cur.id)], { type:'application/json' });
            downloadBlobFile(blob, '岛屿预设-' + cur.name + '.json');
          });
        } else if (k === 'reset') {
          islandConfirm('把当前预设恢复成默认状态？自定义模块也会一并删除。', { title:'恢复默认', confirmText:'恢复' }).then(function(yes){
            if (!yes) return; PromptEngine.resetPreset(cur.id); closeSheet(); render();
          });
        } else if (k === 'delete') {
          islandConfirm('删除预设「' + cur.name + '」？', { title:'删除预设', confirmText:'删除' }).then(function(yes){
            if (!yes) return; guard(function(){ PromptEngine.deletePreset(cur.id); }); closeSheet(); render();
          });
        }
      });
    });
  }

  /* ───────── 预览 ───────── */
  function blockRows(blocks){
    return blocks.map(function(b){
      var tail = b.status === 'injected' ? (b.chars + ' 字') : '';
      var prob = (b.problems && b.problems.length) ? '<div class="preset-prob">变量没有值：' + b.problems.map(function(p){ return '{{' + h(p.variable) + '}}'; }).join('、') + '</div>' : '';
      return '<div class="preset-diag is-' + h(b.status) + '"><span>' + h(b.name) + '</span><em>' + h(STATUS_TEXT[b.status] || b.status) + (tail ? ' · ' + tail : '') + '</em>' + prob + '</div>';
    }).join('');
  }
  function openPreview(name){
    var names = (State.personas || []).map(function(p){ return p && p.name; }).filter(Boolean);
    if (!names.length) { toast('还没有角色，先去聊天里创建一个'); return; }
    previewName = (name && names.indexOf(name) >= 0) ? name : (names.indexOf(previewName) >= 0 ? previewName : names[0]);
    var body = '', fail = '';
    try {
      var msgs = buildMessages(previewName, { preview:true });
      var snap = msgs.__assembled;
      var sys = msgs[0].content;
      body = '<div class="preset-diag-list">' + (snap && snap.blocks ? blockRows(snap.blocks) : '') + '</div>' +
        ((snap && snap.warnings && snap.warnings.length) ? '<div class="preset-warn">' + snap.warnings.map(h).join('<br>') + '</div>' : '') +
        '<pre class="preset-pre">' + h(sys) + '</pre>';
    } catch (e) {
      var d = e && e.detail;
      fail = '<div class="preset-warn is-error">' + h(e && e.message ? e.message : '组装失败') + '</div>' + (d && d.blocks ? '<div class="preset-diag-list">' + blockRows(d.blocks) + '</div>' : '');
    }
    var sel = '<select id="presetPvName" class="preset-select">' + names.map(function(n){ return '<option' + (n === previewName ? ' selected' : '') + '>' + h(n) + '</option>'; }).join('') + '</select>';
    var sheet = openSheet(sheetHead('最终提示词') + sel + (fail || body));
    bindClose(sheet);
    sheet.querySelector('#presetPvName').addEventListener('change', function(e){ openPreview(e.target.value); });
  }

  /* ───────── 请求记录 ───────── */
  function fmtTime(ts){ var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function openLog(){
    var snaps = PromptEngine.listSnapshots();
    var rows = snaps.map(function(s){
      return '<button class="preset-log-row is-' + s.status + '" data-sid="' + h(s.id) + '" type="button"><span>' + fmtTime(s.at) + ' · ' + h(s.name) + '</span><em>' + h(SNAP_TEXT[s.status] || s.status) + '</em></button>';
    }).join('');
    var sheet = openSheet(sheetHead('请求记录') + (rows ? '<div class="preset-picks">' + rows + '</div>' : '<div class="preset-empty-log">还没有请求</div>') +
      (snaps.length ? '<div class="preset-actions"><button class="preset-btn" id="presetLogClear" type="button">清空记录</button></div>' : ''));
    bindClose(sheet);
    Array.prototype.forEach.call(sheet.querySelectorAll('[data-sid]'), function(b){ b.addEventListener('click', function(){ openLogDetail(b.dataset.sid); }); });
    var clr = sheet.querySelector('#presetLogClear');
    if (clr) clr.addEventListener('click', function(){ PromptEngine.clearSnapshots(); openLog(); });
  }
  function openLogDetail(id){
    var s = PromptEngine.findSnapshot(id);
    if (!s) return openLog();
    var steps = ['assembled', 'sent', 'accepted'].map(function(k, i){
      var order = { assembled:0, sent:1, accepted:2, failed:1 }, reached = order[s.status] >= i;
      return '<span class="preset-step' + (reached ? ' is-on' : '') + '">' + SNAP_TEXT[k] + '</span>';
    }).join('') + '<span class="preset-step">遵循情况：无法确认</span>';
    var err = s.status === 'failed' ? '<div class="preset-warn is-error">' + (s.errorKind === 'context_overflow' ? '服务端提示内容超出模型可接受的长度。请换用上下文更大的模型，或在设置里调小“上下文深度”。<br>' : '') + h(s.error) + '</div>' : '';
    var edited = s.modifiedAfterAssembly ? '<div class="preset-warn">发送前调用方追加了内容，下面显示的是实际发送的消息。</div>' : '';
    var msgs = s.messages.map(function(m, i){
      var c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 1);
      return '<details class="preset-msg"' + (i === 0 ? '' : '') + '><summary>' + h(m.role) + ' · ' + c.length + ' 字</summary><pre class="preset-pre">' + h(c) + '</pre></details>';
    }).join('');
    var sheet = openSheet(sheetHead(s.name + ' · ' + fmtTime(s.at)) +
      '<div class="preset-steps">' + steps + '</div>' + err + edited +
      '<div class="preset-meta">预设：' + h(s.presetName) + ' · 消息 ' + s.messageCount + ' 条 · 共 ' + s.totalChars + ' 字（字数，不是 token）</div>' +
      '<div class="preset-diag-list">' + blockRows(s.blocks) + '</div>' + msgs +
      '<div class="preset-actions"><button class="preset-btn" id="presetLogBack" type="button">返回</button></div>');
    bindClose(sheet);
    sheet.querySelector('#presetLogBack').addEventListener('click', openLog);
  }

  registerApp('预设', openApp);
  window.IslandPresetApp = { open:openApp, close:closeApp };
})();
