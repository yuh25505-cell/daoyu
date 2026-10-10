/* 岛屿 · 聊天 · 表情包、图片与文件发送
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var stickerSelectionMode = false;

var stickerSelectedIds = {};

var stickerLongPressTimer = 0;

var stickerLongPressTriggered = false;

var stickerLongPressMoveX = 0;

var stickerLongPressMoveY = 0;

var stickerIgnoreNextClick = false;


function clearStickerSelection(){
  if (stickerLongPressTimer) { clearTimeout(stickerLongPressTimer); stickerLongPressTimer = 0; }
  stickerSelectionMode = false;
  stickerSelectedIds = {};
  stickerLongPressTriggered = false;
  stickerIgnoreNextClick = false;
}

function selectedStickerCount(){ return Object.keys(stickerSelectedIds).length; }

function setStickerSelected(id, selected){
  if (!id) return;
  if (selected) stickerSelectedIds[id] = true;
  else delete stickerSelectedIds[id];
}

function enterStickerSelection(id){
  stickerSelectionMode = true;
  setStickerSelected(id, true);
  stickerLongPressTriggered = true;
  stickerIgnoreNextClick = true;
  renderStickerPanelInto();
}

function toggleStickerSelection(id){
  stickerSelectionMode = true;
  setStickerSelected(id, !stickerSelectedIds[id]);
  renderStickerPanelInto();
}

function selectAllStickers(){
  var group = activeStickerGroup();
  if (!group || !group.stickers.length) { toast('这个分组还没有表情包'); return; }
  stickerSelectionMode = true;
  stickerSelectedIds = {};
  group.stickers.forEach(function(item){ stickerSelectedIds[item.id] = true; });
  renderStickerPanelInto();
}

function renderStickerMovePanel(){
  var st = getStickerState();
  var current = activeStickerGroup();
  var groups = st.groups.filter(function(g){ return !current || g.id !== current.id; });
  if (!groups.length) {
    return '<div class="sticker-sub-head"><button type="button" class="sticker-back-btn" data-sticker-manage="back">‹</button><strong>移到分组</strong></div>' +
      '<div class="sticker-move-empty">暂时没有其他分组可移动</div>';
  }
  var rows = groups.map(function(g){
    return '<button type="button" class="sticker-move-row" data-sticker-move-to="' + escapeHTML(g.id) + '"><span>' + escapeHTML(g.name) + '</span><small>' + g.stickers.length + ' 个</small><span class="sticker-move-arrow">›</span></button>';
  }).join('');
  return '<div class="sticker-sub-head"><button type="button" class="sticker-back-btn" data-sticker-manage="back">‹</button><strong>移到分组</strong><span class="sticker-move-count">已选 ' + selectedStickerCount() + '</span></div>' +
    '<div class="sticker-move-list">' + rows + '</div>';
}

function moveSelectedStickers(targetGroupId){
  var count = selectedStickerCount();
  if (!count) { toast('请先选择表情包'); return; }
  var st = getStickerState();
  var source = st.groups.find(function(g){ return g.id === st.activeGroupId; });
  var target = st.groups.find(function(g){ return g.id === targetGroupId; });
  if (!source || !target || source.id === target.id) return;
  var moved = [];
  var remain = [];
  source.stickers.forEach(function(item){
    if (stickerSelectedIds[item.id]) moved.push(item);
    else remain.push(item);
  });
  if (!moved.length) return;
  var existing = {};
  target.stickers.forEach(function(item){ existing[item.url] = true; });
  moved.forEach(function(item){
    if (!existing[item.url]) { target.stickers.push(item); existing[item.url] = true; }
  });
  source.stickers = remain;
  saveStickers().then(function(){
    clearStickerSelection();
    renderStickerPanelInto();
    toast('已移动 ' + moved.length + ' 个表情包');
  });
}

function deleteSelectedStickers(){
  var count = selectedStickerCount();
  if (!count) { toast('请先选择表情包'); return; }
  islandConfirm('确定删除已选择的 ' + count + ' 个表情包吗？', {title:'删除表情包', confirmText:'删除', danger:true}).then(function(ok){
    if (!ok) return;
    var st = getStickerState();
    var group = activeStickerGroup();
    if (!group) return;
    group.stickers = group.stickers.filter(function(item){ return !stickerSelectedIds[item.id]; });
    st.activeGroupId = group.id;
    saveStickers().then(function(){
      clearStickerSelection();
      renderStickerPanelInto();
      toast('已删除 ' + count + ' 个表情包');
    });
  });
}


function normalizeStickerState(){
  var src = State.stickers && typeof State.stickers === 'object' ? State.stickers : {};
  var groups = Array.isArray(src.groups) ? src.groups : [];
  var cleaned = [];
  groups.forEach(function(g){
    if (!g || typeof g !== 'object') return;
    var id = typeof g.id === 'string' && g.id ? g.id : genId('stkgrp_');
    var name = String(g.name || '默认').trim().slice(0, 30) || '默认';
    var items = Array.isArray(g.stickers) ? g.stickers : [];
    var stickers = [];
    items.forEach(function(st){
      if (!st || typeof st !== 'object') return;
      var url = String(st.url || '').trim();
      if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) return;
      stickers.push({
        id: typeof st.id === 'string' && st.id ? st.id : genId('sticker_'),
        url: url,
        name: String(st.name || '').trim().slice(0, 60),
        createdAt: Number(st.createdAt) || Date.now()
      });
    });
    cleaned.push({ id:id, name:name, stickers:stickers });
  });
  if (!cleaned.some(function(g){ return g.name === '默认'; })) cleaned.unshift({ id:genId('stkgrp_'), name:'默认', stickers:[] });
  if (!cleaned.length) cleaned.push({ id:genId('stkgrp_'), name:'默认', stickers:[] });
  var active = typeof src.activeGroupId === 'string' ? src.activeGroupId : '';
  if (!cleaned.some(function(g){ return g.id === active; })) active = cleaned[0].id;
  State.stickers = { activeGroupId: active, groups: cleaned };
  return State.stickers;
}

function saveStickers(){ return IslandDB.set('island.stickers', State.stickers); }

function getStickerState(){ return normalizeStickerState(); }

function activeStickerGroup(){
  var st = getStickerState();
  for (var i=0;i<st.groups.length;i++) if (st.groups[i].id === st.activeGroupId) return st.groups[i];
  return st.groups[0];
}

function renderStickerPanel(){
  var st = getStickerState();
  var group = activeStickerGroup();
  var tabs = st.groups.map(function(g){
    return '<button type="button" class="sticker-group-tab ' + (g.id === st.activeGroupId ? 'is-active' : '') + '" data-sticker-group="' + escapeHTML(g.id) + '">' + escapeHTML(g.name) + '</button>';
  }).join('');
  var actions = stickerSelectionMode
    ? '<span class="sticker-selection-count">已选 ' + selectedStickerCount() + '</span><button type="button" class="sticker-selection-btn" data-sticker-action="select-all">全选</button><button type="button" class="sticker-selection-btn" data-sticker-action="move-group">移分组</button><button type="button" class="sticker-selection-btn danger" data-sticker-action="delete-selected">删除</button><button type="button" class="sticker-selection-btn" data-sticker-action="cancel-select">完成</button>'
    : '<button class="sticker-mini-btn" type="button" data-sticker-manage="import">导入链接</button><button class="sticker-mini-btn" type="button" data-sticker-manage="groups">分组</button>';
  var grid = group && group.stickers.length ? group.stickers.map(function(item){
    var label = getStickerDisplayName(item);
    var selected = !!stickerSelectedIds[item.id];
    return '<button type="button" class="sticker-item' + (selected ? ' is-selected' : '') + '" data-sticker-id="' + escapeHTML(item.id) + '" data-sticker-url="' + escapeHTML(item.url) + '" aria-label="' + escapeHTML(label) + '"><span class="sticker-select-mark">✓</span><span class="sticker-image-wrap"><img src="' + escapeHTML(item.url) + '" alt="' + escapeHTML(label) + '" loading="lazy"></span><span class="sticker-name">' + escapeHTML(label) + '</span></button>';
  }).join('') : '<div class="sticker-empty">这个分组还没有表情包</div>';
  var headClass = 'sticker-panel-head' + (stickerSelectionMode ? ' is-selection-mode' : '');
  return '<div class="' + headClass + '"><div class="sticker-groups">' + tabs + '</div><div class="sticker-head-actions">' + actions + '</div></div>' +
    '<div class="sticker-grid-scroll"><div class="sticker-grid">' + grid + '</div></div>';
}

function renderStickerImportPanel(){
  var st = getStickerState();
  var options = st.groups.map(function(g){ return '<option value="' + escapeHTML(g.id) + '" ' + (g.id === st.activeGroupId ? 'selected' : '') + '>' + escapeHTML(g.name) + '</option>'; }).join('');
  return '<div class="sticker-sub-head"><button type="button" class="sticker-back-btn" data-sticker-manage="back">‹</button><strong>导入表情包</strong></div>' +
    '<div class="sticker-form"><label>导入到<select id="stickerImportGroup">' + options + '</select></label>' +
    '<label>表情包链接<textarea id="stickerImportUrls" rows="5" placeholder="每行一个：表情包描述/名称：表情包链接\n开心：https://example.com/happy.webp\n震惊：https://example.com/shocked.png"></textarea></label>' +
    '<div class="sticker-import-note">也支持只填链接；会自动读取名称。可一次导入多行。</div>' +
    '<div class="sticker-import-actions"><button type="button" class="sticker-primary-btn" data-sticker-action="import">导入链接</button><button type="button" class="sticker-mini-btn" data-sticker-action="choose-file">导入文件</button><input id="stickerFileInput" type="file" hidden multiple accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></div></div>';
}

function renderStickerGroupsPanel(){
  var st = getStickerState();
  var list = st.groups.map(function(g){
    var canDelete = g.name !== '默认' && st.groups.length > 1;
    return '<div class="sticker-group-row"><button type="button" class="sticker-group-select" data-sticker-group="' + escapeHTML(g.id) + '">' + escapeHTML(g.name) + '</button><span>' + g.stickers.length + ' 个</span>' +
      (canDelete ? '<button type="button" class="sticker-group-delete" data-sticker-delete-group="' + escapeHTML(g.id) + '">删除</button>' : '') + '</div>';
  }).join('');
  return '<div class="sticker-sub-head"><button type="button" class="sticker-back-btn" data-sticker-manage="back">‹</button><strong>表情包分组</strong></div>' +
    '<div class="sticker-group-list">' + list + '</div>' +
    '<div class="sticker-new-group"><input id="stickerNewGroupName" type="text" placeholder="新分组名称" maxlength="30"><button type="button" class="sticker-primary-btn" data-sticker-action="add-group">新建</button></div>';
}

function getStickerDisplayName(item){
  var name = String(item && item.name || '').trim();
  if (name) return name.slice(0, 60);
  var url = String(item && item.url || '').trim();
  if (/^data:image\//i.test(url)) return '表情包';
  try {
    var path = new URL(url, location.href).pathname || '';
    var last = path.split('/').filter(Boolean).pop() || '';
    last = decodeURIComponent(last);
    last = last.replace(/\.[a-z0-9]{2,6}$/i, '');
    if (last) return last.slice(0, 60);
  } catch (_) {}
  return '表情包';
}


function addStickerItems(items, groupId){
  var st = getStickerState();
  var group = st.groups.find(function(g){ return g.id === groupId; }) || st.groups[0];
  var existing = {};
  group.stickers.forEach(function(item){ existing[item.url] = true; });
  var added = 0;
  (items || []).forEach(function(item){
    var url = String(item.url || '').trim();
    if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) return;
    if (existing[url]) return;
    group.stickers.push({ id:genId('sticker_'), url:url, name:String(item.name || '').trim().slice(0,60), createdAt:Date.now() });
    existing[url] = true;
    added++;
  });
  st.activeGroupId = group.id;
  return { state:st, group:group, added:added };
}

function importStickerUrls(){
  var urlsEl = $('stickerImportUrls'), groupEl = $('stickerImportGroup');
  if (!urlsEl || !groupEl) return;
  var parsed = parseStickerImportText(urlsEl.value);
  if (!parsed.length) { toast('请输入“名称：图片链接”，或直接输入图片链接'); return; }
  var out = addStickerItems(parsed, groupEl.value);
  saveStickers().then(function(){ renderStickerPanelInto(); toast(out.added ? '已导入 ' + out.added + ' 个表情包' : '这些表情包已经存在'); });
}

function stickerUrl(value){
  var url = String(value == null ? '' : value).trim().replace(/^['"]|['"]$/g,'');
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url) || /^blob:/i.test(url)) return url;
  return '';
}

function normalizeStickerFileUrl(raw){
  var url = String(raw == null ? '' : raw)
    .trim()
    .replace(/^[\s\"'“”‘’(<\[]+/, '')
    .replace(/[\s\"'“”‘’)>\],。；，、！!？?]+$/g, '');
  if (!/^https?:\/\//i.test(url)) return '';
  return url;
}


// 只识别“描述/名称：链接”这一类表情包行，其他说明文字、编号、图片替代文字等全部忽略。
// 同时兼容中文冒号“：”与英文冒号“:”，并允许行首存在项目符号/编号。
function parseStickerImportText(text){
  var source = String(text == null ? '' : text).replace(/\u0000/g, '');
  var lines = source.split(/\r?\n/);
  var out = [];
  var seen = {};
  var linePattern = /^\s*(?:(?:[-*+•·]\s*)|(?:\d{1,4}\s*[.)、]\s*))?(.+?)\s*[：:]\s*(https?:\/\/\S+)\s*$/i;

  lines.forEach(function(rawLine){
    var line = String(rawLine || '')
      .replace(/\t+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
    if (!line) return;

    var match = line.match(linePattern);
    if (!match) return;

    var name = String(match[1] || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, '');
    var url = normalizeStickerFileUrl(match[2]);
    if (!name || !url) return;

    // 过滤明显不是导入格式的长段落，避免把文档说明误认成表情包名称。
    if (name.length > 120) return;
    if (/^(?:说明|备注|注释|注意|网址|链接|图片链接|URL|来源)$/i.test(name)) return;
    if (seen[url]) return;
    seen[url] = true;
    out.push({ name:name.slice(0,60), url:url });
  });

  return out;
}


function parseDocxText(arrayBuffer){
  if (!window.JSZip || !arrayBuffer) return Promise.resolve('');
  return window.JSZip.loadAsync(arrayBuffer).then(function(zip){
    var entry = zip.file('word/document.xml');
    if (!entry) return '';
    return entry.async('string').then(function(xml){
      var text = String(xml || '')
        .replace(/<w:tab\s*\/?>/gi, '\t')
        .replace(/<w:br\s*\/?>/gi, '\n')
        .replace(/<\/w:p\s*>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      var ta = document.createElement('textarea');
      ta.innerHTML = text;
      return ta.value.replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim();
    });
  }).catch(function(){ return ''; });
}

function parseStickerFile(file){
  var name = String(file && file.name || '');
  var lower = name.toLowerCase();
  if (lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return file.arrayBuffer().then(function(buf){ return parseDocxText(buf); }).then(function(text){
      var items = parseStickerImportText(text);
      if (!items.length) {
        var urls = String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
        items = urls.map(function(url){ return { url:url, name:'' }; });
      }
      return items;
    }).catch(function(){ return []; });
  }
  if (lower.endsWith('.txt') || file.type === 'text/plain') {
    return file.arrayBuffer().then(function(buf){
      var bytes = new Uint8Array(buf);
      var utf8 = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
      // 部分手机导出的 TXT 仍可能是 GB18030/GBK；若 UTF-8 出现明显替换字符则自动回退。
      var text = utf8;
      if ((utf8.match(/\uFFFD/g) || []).length >= 2) {
        try { text = new TextDecoder('gb18030').decode(bytes).replace(/^\uFEFF/, ''); } catch (_) {}
      }
      return parseStickerImportText(text);
    }).catch(function(){ return []; });
  }
  return Promise.resolve([]);
}

function importStickerFiles(files){
  var groupEl = $('stickerImportGroup');
  if (!groupEl || !files || !files.length) return;
  var list = Array.prototype.slice.call(files);
  Promise.all(list.map(parseStickerFile)).then(function(results){
    var items = [];
    results.forEach(function(result){ if (Array.isArray(result)) items = items.concat(result); });
    var out = addStickerItems(items, groupEl.value);
    saveStickers().then(function(){ renderStickerPanelInto(); toast(out.added ? '已导入 ' + out.added + ' 个表情包' : 'TXT / DOCX 中没有找到可导入的表情包'); });
  });
}

function addStickerGroup(){
  var input = $('stickerNewGroupName'); if (!input) return;
  var name = String(input.value || '').trim();
  if (!name) { toast('请输入分组名称'); return; }
  var st = getStickerState();
  if (st.groups.some(function(g){ return g.name === name; })) { toast('这个分组已经存在'); return; }
  var group = { id:genId('stkgrp_'), name:name, stickers:[] };
  st.groups.push(group); st.activeGroupId = group.id;
  saveStickers().then(function(){ renderStickerPanelInto(); toast('分组已创建'); });
}

function deleteStickerGroup(id){
  var st = getStickerState();
  if (st.groups.length <= 1) { toast('至少保留一个分组'); return; }
  var group = st.groups.find(function(g){ return g.id === id; });
  if (!group) return;
  if (group.name === '默认') { toast('默认分组不能删除'); return; }
  islandConfirm('确定删除分组“' + group.name + '”吗？其中的表情包也会删除。', {title:'删除分组', confirmText:'删除', danger:true}).then(function(ok){
    if (!ok) return;
    st.groups = st.groups.filter(function(g){ return g.id !== id; });
    if (st.activeGroupId === id) st.activeGroupId = st.groups[0].id;
    saveStickers().then(function(){ renderStickerPanelInto(); toast('分组已删除'); });
  });
}

function renderStickerPanelInto(){
  if (pmPanel) pmPanel.classList.remove('is-sticker-manage');
  if (pmPanelInner) pmPanelInner.innerHTML = renderStickerPanel();
}

function openStickerPanel(){
  clearStickerSelection();
  panelMode = 'sticker';
  if (!pmPanel) return;
  pmPanel.classList.add('is-sticker-panel');
  pmPanel.classList.remove('is-sticker-manage');
  releaseInputFocus();
  renderStickerPanelInto();
  pmPanel.classList.add('is-open');
}

function sendSticker(url){
  url = String(url || '').trim();
  if ((!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) || !currentName) return;
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  MESSAGES[currentName].push({ from:'me', type:'sticker', url:url, text:'[表情包]', createdAt:Date.now() });
  saveMessages(currentName);
  renderMessages(true); scrollBottom(true);
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === currentName) { CHATS[i].preview = '[表情包]'; CHATS[i].time = '刚刚'; break; }
  }
  renderChats(); saveChats();
  closePanel();
}


function compressChatImage(file){
  return new Promise(function(resolve){
    var reader = new FileReader();
    reader.onload = function(e){
      var raw = e.target.result;
      var img = new Image();
      img.onload = function(){
        try {
          var maxEdge = 1600;
          var scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
          var w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
          var h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          if (!ctx) { resolve(raw); return; }
          ctx.drawImage(img, 0, 0, w, h);
          var data = canvas.toDataURL('image/jpeg', 0.86);
          resolve(data || raw);
        } catch(err) { resolve(raw); }
      };
      img.onerror = function(){ resolve(raw); };
      img.src = raw;
    };
    reader.onerror = function(){ resolve(null); };
    reader.readAsDataURL(file);
  });
}

function sendChatImageData(dataUrl){
  if (!dataUrl || !/^data:image\//i.test(dataUrl) || !currentName) return false;
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  MESSAGES[currentName].push({ from:'me', type:'image', url:dataUrl, text:'[图片]', createdAt:Date.now() });
  saveMessages(currentName);
  renderMessages(true); scrollBottom(true);
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === currentName) { CHATS[i].preview = '[图片]'; CHATS[i].time = '刚刚'; break; }
  }
  renderChats(); saveChats();
  return true;
}

function sendChatImageFiles(fileList){
  if (!fileList || !fileList.length || !currentName) return;
  closePanel();
  var files = Array.prototype.slice.call(fileList).filter(function(file){ return file && /^image\//i.test(file.type); });
  if (!files.length) { toast('请选择图片'); return; }
  var chain = Promise.resolve();
  files.forEach(function(file){
    chain = chain.then(function(){ return compressChatImage(file); }).then(function(data){
      if (!data) throw new Error('图片读取失败');
      sendChatImageData(data);
    });
  });
  chain.catch(function(err){ toast(err && err.message ? err.message : '图片发送失败'); });
}


function formatFileSize(bytes){
  bytes = Math.max(0, Number(bytes) || 0);
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

var CHAT_FILE_EXTENSIONS = /\.(txt|md|markdown|json|jsonl|csv|xml|html?|css|js|ts|jsx|tsx|py|java|c|cpp|h|hpp|log|yaml|yml|toml|ini|conf|sql|sh|bat|docx)$/i;

function isSupportedChatFile(file){
  if (!file) return false;
  var name = String(file.name || '').toLowerCase();
  var type = String(file.type || '').toLowerCase();
  if (/wordprocessingml\.document/.test(type) || /\.docx$/i.test(name)) return true;
  if (/^text\//.test(type) || /application\/(json|xml|javascript)/.test(type)) return true;
  return CHAT_FILE_EXTENSIONS.test(name);
}

function fileIconKind(file){
  var name = String(file && file.name || '').toLowerCase();
  var type = String(file && file.type || '').toLowerCase();
  if (/wordprocessingml\.document/.test(type) || /\.docx$/i.test(name)) return 'DOC';
  if (/^text\//.test(type) || /application\/(json|xml|javascript)/.test(type) || CHAT_FILE_EXTENSIONS.test(name)) return 'TXT';
  return '文件';
}

function decodeUTF8(bytes){
  try { return new TextDecoder('utf-8', { fatal:false }).decode(bytes); } catch(e) { return ''; }
}

function looksReadableText(file, text){
  var name = String(file && file.name || '').toLowerCase();
  var type = String(file && file.type || '').toLowerCase();
  if (/^(text\/|application\/(json|xml|javascript)|text\/markdown)/.test(type)) return true;
  if (/\.(txt|md|markdown|json|csv|xml|html?|css|js|ts|py|java|c|cpp|h|hpp|log|yaml|yml|toml|ini|conf|sql|sh|bat)$/.test(name)) return true;
  if (!text) return false;
  var sample = text.slice(0, 1800);
  if (/\u0000/.test(sample)) return false;
  var printable = 0, total = Math.max(1, sample.length);
  for (var i = 0; i < sample.length; i++) {
    var code = sample.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) printable++;
  }
  return printable / total > 0.92;
}

async function extractDocxText(file){
  if (typeof JSZip === 'undefined') return '';
  try {
    var buf = await file.arrayBuffer();
    var zip = await JSZip.loadAsync(buf);
    var entry = zip.file('word/document.xml');
    if (!entry) return '';
    var xml = await entry.async('string');
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var paragraphs = [];
    var ps = doc.getElementsByTagName('w:p');
    for (var i = 0; i < ps.length; i++) {
      var texts = ps[i].getElementsByTagName('w:t');
      var line = '';
      for (var j = 0; j < texts.length; j++) line += texts[j].textContent || '';
      if (line.trim()) paragraphs.push(line.trim());
    }
    return paragraphs.join('\n').trim();
  } catch(e) { return ''; }
}

async function extractChatFileText(file){
  var maxRead = 2 * 1024 * 1024;
  var name = String(file && file.name || '').toLowerCase();
  var type = String(file && file.type || '').toLowerCase();
  if (/\.(docx)$/.test(name) || /wordprocessingml\.document/.test(type)) {
    return await extractDocxText(file);
  }
  try {
    var blob = file.size > maxRead ? file.slice(0, maxRead) : file;
    var text = await blob.text();
    return looksReadableText(file, text) ? text : '';
  } catch(e) { return ''; }
}

function clampFileText(text, limit){
  text = String(text || '').replace(/\r\n?/g, '\n').trim();
  limit = Number(limit) || 16000;
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '\n\n[文件内容过长，以上为前 ' + limit + ' 字符。]';
}

function sendChatFileMessage(file, extractedText){
  if (!file || !currentName) return false;
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  var content = clampFileText(extractedText || '', 16000);
  var msg = {
    from:'me', type:'file', text:'[文件] ' + String(file.name || '未命名文件'),
    name:String(file.name || '未命名文件'),
    size:Number(file.size) || 0,
    mime:String(file.type || 'application/octet-stream'),
    kind:fileIconKind(file),
    content:content,
    readable:!!content,
    createdAt:Date.now()
  };
  MESSAGES[currentName].push(msg);
  saveMessages(currentName);
  renderMessages(true); scrollBottom(true);
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === currentName) { CHATS[i].preview = '[文件] ' + String(file.name || '未命名文件'); CHATS[i].time = '刚刚'; break; }
  }
  renderChats(); saveChats();
  return true;
}

async function sendChatFiles(fileList){
  if (!fileList || !fileList.length || !currentName) return;
  closePanel();
  var files = Array.prototype.slice.call(fileList).filter(Boolean);
  if (!files.length) return;
  var unsupported = 0;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (!isSupportedChatFile(file)) { unsupported++; continue; }
    var text = await extractChatFileText(file);
    sendChatFileMessage(file, text);
  }
  if (unsupported) toast('文件功能仅支持可读取的文本类文件和 DOCX，图片、PDF、压缩包、音视频请使用对应功能。');
}
