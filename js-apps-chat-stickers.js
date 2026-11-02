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
      var entry = {
        id: typeof st.id === 'string' && st.id ? st.id : genId('sticker_'),
        url: url,
        name: String(st.name || '').trim().slice(0, 60),
        createdAt: Number(st.createdAt) || Date.now()
      };
      if (typeof st.thumb === 'string' && /^data:image\//i.test(st.thumb) && st.thumb.length < 150000) entry.thumb = st.thumb;
      stickers.push(entry);
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

function saveStickers(){
  IslandDB.set('island.stickers.active', State.stickers.activeGroupId || '');
  return IslandDB.set('island.stickers', State.stickers);
}

/* 只切换分组时，只保存一个很小的记录，不再重写整库的表情包数据，切换才不会卡。 */
function saveStickerActiveGroup(){ return IslandDB.set('island.stickers.active', State.stickers.activeGroupId || ''); }

function getStickerState(){ return normalizeStickerState(); }

function stickerUrlById(id){
  var st = getStickerState();
  for (var i = 0; i < st.groups.length; i++) {
    var list = st.groups[i].stickers;
    for (var j = 0; j < list.length; j++) if (list[j].id === id) return list[j].url;
  }
  return '';
}

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
    return '<button type="button" class="sticker-item' + (selected ? ' is-selected' : '') + '" data-sticker-id="' + escapeHTML(item.id) + '" data-sticker-url="' + (/^data:/i.test(item.url) ? '' : escapeHTML(item.url)) + '" aria-label="' + escapeHTML(label) + '"><span class="sticker-select-mark">✓</span><span class="sticker-image-wrap"><img src="' + escapeHTML(stickerPanelImageSrc(item)) + '" alt="' + escapeHTML(label) + '" loading="lazy" decoding="async"></span><span class="sticker-name">' + escapeHTML(label) + '</span></button>';
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
    '<div class="sticker-import-actions"><button type="button" class="sticker-primary-btn" data-sticker-action="import">导入链接</button><button type="button" class="sticker-mini-btn" data-sticker-action="choose-file">导入文件</button><input id="stickerFileInput" type="file" hidden multiple accept=".txt,.docx,.json,.jsonl,application/json,text/json,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></div></div>';
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
  var parsed = [];
  var skipped = 0;
  if (looksLikeStickerJson(urlsEl.value)) { var jr = parseStickerJsonText(urlsEl.value); parsed = jr.items; skipped = jr.skipped || 0; }
  if (!parsed.length) parsed = parseStickerImportText(urlsEl.value);
  if (!parsed.length) { toast('请输入“名称：图片链接”，或直接输入图片链接'); return; }
  var out = addStickerItemsSmart(parsed, groupEl.value);
  saveStickers().then(function(){ renderStickerPanelInto(); stickerImportToast(out, skipped); });
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


/* ===== JSON 表情包导入：兼容多种常见写法 =====
 * 支持：[{name,url}]、{"名称":"链接"}、{stickers:[…]}、{groups:[{name,stickers:[…]}]}（本软件自己的格式）、
 * 链接数组、字段名 url/src/image/link/emoji_url 等、中文字段名、多层嵌套。 */
var STICKER_JSON_URL_KEYS = ['url','src','image','img','imageurl','imgurl','imagedata','originalurl','link','href','uri','file','path','emojiurl','stickerurl','pic','picture','photo','gif','链接','图片','图片链接','地址','网址','表情链接'];
var STICKER_JSON_NAME_KEYS = ['name','title','desc','description','label','text','keyword','keywords','tag','tags','alt','caption','meaning','emotion','mood','word','emojiname','stickername','名称','名字','标题','描述','说明','表情','含义','关键词'];
var STICKER_JSON_GROUP_NAME_KEYS = ['name','title','groupname','packname','名称','名字','标题','分组名'];
var STICKER_JSON_ITEM_GROUP_KEYS = ['group','groupname','category','pack','packname','分组','分类','分组名'];
var STICKER_JSON_WRAPPER_KEYS = ['stickers','sticker','emojis','emoji','items','list','data','images','pictures','memes','packs','pack','groups','group','categories','category','sets','expressions','emoticons','results','files','stickerlist','emojilist','表情包','表情','列表','分组','贴纸','数据'];

function stickerJsonKeyNorm(k){ return String(k).toLowerCase().replace(/[\s_\-]/g, ''); }

function stickerJsonUrl(v){
  if (typeof v !== 'string') return '';
  var u = v.trim();
  if (/^\/\/[^\s\/]/.test(u)) u = 'https:' + u;
  if (/^https?:\/\/\S+$/i.test(u) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(u)) return u;
  return '';
}

function stickerJsonPick(obj, keys, wantUrl){
  var norm = {};
  Object.keys(obj).forEach(function(k){ norm[stickerJsonKeyNorm(k)] = k; });
  for (var i = 0; i < keys.length; i++) {
    var real = norm[keys[i]];
    if (real === undefined) continue;
    var v = obj[real];
    if (Array.isArray(v)) v = v.filter(function(x){ return typeof x === 'string'; })[0];
    if (wantUrl) {
      var u = stickerJsonUrl(v);
      if (u) return u;
    } else if (typeof v === 'string' || typeof v === 'number') {
      var s = String(v).replace(/\s+/g, ' ').trim();
      if (s && !stickerJsonUrl(s)) return s;
    }
  }
  return '';
}

var STICKER_JSON_MEANING_KEYS = ['meaning','description','desc','含义','描述','说明','label','caption','alt','keyword','keywords','text'];
var STICKER_JSON_GENERIC_GROUPS = {custom:1,batch_url:1,'default':1,personal:1,uncategorized:1,other:1,others:1,none:1,'null':1,undefined:1,'未分类':1,'其他':1,'自定义':1};

function stickerJsonAutoName(name){
  var n = String(name || '').trim();
  if (!n) return true;
  if (/^(?:表情包|表情|图片|微信图片|image|img|pic|photo|emoji|sticker|mmexport|screenshot)[\s_\-]*\d{5,}$/i.test(n)) return true;
  if (/^[A-Za-z0-9_\-. ]*\d{5,}[A-Za-z0-9_\-. ]*$/.test(n)) return true;
  return false;
}

function stickerJsonItemName(node, nameHint){
  var strong = stickerJsonPick(node, ['name','title','名称','名字','标题'], false);
  if (strong && !stickerJsonAutoName(strong)) return strong;
  var meaning = stickerJsonPick(node, STICKER_JSON_MEANING_KEYS, false);
  if (meaning) return meaning;
  return nameHint || strong || stickerJsonPick(node, STICKER_JSON_NAME_KEYS, false) || '';
}

function stickerJsonItemGroup(node){
  var g = stickerJsonPick(node, STICKER_JSON_ITEM_GROUP_KEYS, false);
  if (!g || STICKER_JSON_GENERIC_GROUPS[g.toLowerCase()]) return '';
  return g;
}

function stickerJsonHasNonUrlValue(obj){
  var norm = {};
  Object.keys(obj).forEach(function(k){ norm[stickerJsonKeyNorm(k)] = k; });
  for (var i = 0; i < STICKER_JSON_URL_KEYS.length; i++) {
    var real = norm[STICKER_JSON_URL_KEYS[i]];
    if (real !== undefined && typeof obj[real] === 'string' && obj[real].trim() && !stickerJsonUrl(obj[real])) return true;
  }
  return false;
}

function parseStickerJsonValue(root){
  var out = [];
  var skipped = 0;
  var urlSet = {}, nameSet = {}, wrapSet = {};
  STICKER_JSON_URL_KEYS.forEach(function(k){ urlSet[k] = true; });
  STICKER_JSON_NAME_KEYS.forEach(function(k){ nameSet[k] = true; });
  STICKER_JSON_WRAPPER_KEYS.forEach(function(k){ wrapSet[k] = true; });

  function fillGroup(from, name){
    if (!name) return;
    for (var i = from; i < out.length; i++) if (!out[i].group) out[i].group = name;
  }
  function isLeafObj(v){
    return v && typeof v === 'object' && !Array.isArray(v) && !!stickerJsonPick(v, STICKER_JSON_URL_KEYS, true);
  }

  function walk(node, ctx, depth){
    if (node == null || depth > 10) return;
    if (typeof node === 'string') {
      var su = stickerJsonUrl(node);
      if (su) out.push({ url:su, name:ctx.nameHint || '', group:ctx.group || '' });
      else if (ctx.nameHint && node.trim()) skipped++;
      return;
    }
    if (Array.isArray(node)) {
      var c2 = { group:ctx.group || '', nameHint:'' };
      node.forEach(function(el){ walk(el, c2, depth + 1); });
      return;
    }
    if (typeof node !== 'object') return;

    var before = out.length;
    var ownUrl = stickerJsonPick(node, STICKER_JSON_URL_KEYS, true);
    var keys = Object.keys(node);

    keys.forEach(function(k){
      var v = node[k];
      if (v == null || typeof v !== 'object') return;
      var nk = stickerJsonKeyNorm(k);
      if (urlSet[nk] || nameSet[nk]) return;
      var mark = out.length;
      if (wrapSet[nk]) {
        walk(v, { group:ctx.group || '', nameHint:'' }, depth + 1);
      } else if (!ownUrl) {
        if (Array.isArray(v)) {
          walk(v, { group:'', nameHint:'' }, depth + 1);
          fillGroup(mark, k);
        } else if (isLeafObj(v)) {
          walk(v, { group:ctx.group || '', nameHint:k }, depth + 1);
        } else {
          walk(v, { group:'', nameHint:'' }, depth + 1);
          fillGroup(mark, k);
        }
      }
    });

    if (out.length > before) {
      fillGroup(before, stickerJsonPick(node, STICKER_JSON_GROUP_NAME_KEYS, false) || ctx.group || '');
      return;
    }

    if (ownUrl) {
      out.push({
        url: ownUrl,
        name: stickerJsonItemName(node, ctx.nameHint),
        group: stickerJsonItemGroup(node) || ctx.group || ''
      });
      return;
    }
    if (stickerJsonHasNonUrlValue(node)) { skipped++; return; }

    keys.forEach(function(k){
      var v = node[k];
      if (typeof v !== 'string') return;
      var u = stickerJsonUrl(v);
      var nk = stickerJsonKeyNorm(k);
      if (u && !urlSet[nk]) out.push({ url:u, name:String(k).trim(), group:ctx.group || '' });
      else if (!u && !nameSet[nk] && /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i.test(v.trim())) skipped++;
    });
  }

  walk(root, { group:'', nameHint:'' }, 0);
  return { items: out, skipped: skipped };
}

function parseStickerJsonText(text){
  var src = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
  if (!src) return { items:[], skipped:0 };
  var data;
  var ok = false;
  try { data = JSON.parse(src); ok = true; } catch (_) {}
  if (!ok) {
    try { data = JSON.parse(src.replace(/,\s*([}\]])/g, '$1')); ok = true; } catch (_) {}
  }
  if (!ok) {
    var rows = [];
    src.split(/\r?\n/).forEach(function(line){
      var t = line.trim();
      if (!t) return;
      try { rows.push(JSON.parse(t.replace(/,$/, ''))); } catch (_) {}
    });
    if (rows.length) { data = rows; ok = true; }
  }
  if (!ok) {
    var plain = parseStickerImportText(src);
    if (!plain.length) {
      var urls = src.match(/https?:\/\/[^\s"'<>,\\]+/gi) || [];
      plain = urls.map(function(u){ return { url:u, name:'' }; });
    }
    return { items:plain, skipped:0 };
  }
  var res = parseStickerJsonValue(data);
  var seen = {};
  res.items = res.items.filter(function(it){
    var key = (it.group || '') + '|' + it.url;
    if (seen[key]) return false;
    seen[key] = true;
    it.name = String(it.name || '').slice(0, 60);
    it.group = String(it.group || '').trim().slice(0, 30);
    return true;
  });
  return res;
}

function looksLikeStickerJson(text){
  var t = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
  return /^[\[{]/.test(t) && /[\]}]$/.test(t);
}

function decodeStickerTextBuffer(buf){
  var bytes = new Uint8Array(buf);
  var text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  if ((text.match(/\uFFFD/g) || []).length >= 2) {
    try { text = new TextDecoder('gb18030').decode(bytes).replace(/^\uFEFF/, ''); } catch (_) {}
  }
  return text;
}

/* 把解析出的表情包放进分组：JSON 里带有 2 个及以上不同分组名时，按分组名建立/合并分组；否则全部放进所选分组。 */
function addStickerItemsSmart(items, selectedGroupId){
  var names = {}, count = 0;
  (items || []).forEach(function(it){
    var g = String(it.group || '').trim();
    if (g && !names[g]) { names[g] = true; count++; }
  });
  if (count < 2) return addStickerItems(items, selectedGroupId);
  var st = getStickerState();
  var buckets = {}, order = [], loose = [];
  items.forEach(function(it){
    var g = String(it.group || '').trim().slice(0, 30);
    if (!g) { loose.push(it); return; }
    if (!buckets[g]) { buckets[g] = []; order.push(g); }
    buckets[g].push(it);
  });
  var added = 0, first = null;
  order.forEach(function(g){
    var group = st.groups.filter(function(x){ return x.name === g; })[0];
    if (!group) { group = { id:genId('stkgrp_'), name:g, stickers:[] }; st.groups.push(group); }
    var r = addStickerItems(buckets[g], group.id);
    added += r.added;
    if (!first) first = group.id;
  });
  if (loose.length) added += addStickerItems(loose, selectedGroupId).added;
  if (first) st.activeGroupId = first;
  return { state:st, group:activeStickerGroup(), added:added, groups:order.length };
}

function stickerImportToast(out, skipped){
  var msg = out.added ? '已导入 ' + out.added + ' 个表情包' + (out.groups ? '（' + out.groups + ' 个分组）' : '') : '没有找到可导入的新表情包';
  if (skipped) msg += '，' + skipped + ' 个不是网络链接已跳过';
  toast(msg);
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

var stickerImportSkipped = 0;

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
  if (lower.endsWith('.json') || lower.endsWith('.jsonl') || file.type === 'application/json' || file.type === 'text/json') {
    return file.arrayBuffer().then(function(buf){
      var res = parseStickerJsonText(decodeStickerTextBuffer(buf));
      stickerImportSkipped += res.skipped || 0;
      return res.items;
    }).catch(function(){ return []; });
  }
  if (lower.endsWith('.txt') || file.type === 'text/plain') {
    return file.arrayBuffer().then(function(buf){
      var text = decodeStickerTextBuffer(buf);
      if (looksLikeStickerJson(text)) {
        var res = parseStickerJsonText(text);
        if (res.items.length) { stickerImportSkipped += res.skipped || 0; return res.items; }
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
  var fileInput = $('stickerFileInput');
  if (fileInput) fileInput.value = '';
  stickerImportSkipped = 0;
  Promise.all(list.map(parseStickerFile)).then(function(results){
    var items = [];
    results.forEach(function(result){ if (Array.isArray(result)) items = items.concat(result); });
    var skipped = stickerImportSkipped;
    if (!items.length) { toast(skipped ? skipped + ' 个不是网络链接，无法导入' : '文件中没有找到可导入的表情包'); return; }
    var out = addStickerItemsSmart(items, groupEl.value);
    saveStickers().then(function(){ renderStickerPanelInto(); stickerImportToast(out, skipped); });
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

var STICKER_BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
var STICKER_BIG_DATA_LIMIT = 30000;
var stickerThumbRun = 0;
var stickerThumbFailed = {};
var stickerThumbTimer = null;

/* 面板里显示的图：网络图片用原链接；内嵌的大图（动图等）用小缩略图，避免一次塞进几十 MB 数据导致卡顿。 */
function stickerPanelImageSrc(item){
  var url = String(item && item.url || '');
  if (!/^data:/i.test(url)) return url;
  if (item.thumb) return item.thumb;
  if (stickerThumbFailed[item.id]) return url;
  return url.length <= STICKER_BIG_DATA_LIMIT ? url : STICKER_BLANK_IMG;
}

function makeStickerThumb(url){
  return new Promise(function(resolve){
    var img = new Image();
    img.onload = function(){
      try {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) { resolve(''); return; }
        var tries = [[192, 0.8], [128, 0.6], [96, 0.45]];
        for (var i = 0; i < tries.length; i++) {
          var scale = Math.min(1, tries[i][0] / Math.max(w, h));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
          var cx = cv.getContext('2d');
          if (!cx) { resolve(''); return; }
          var out = cv.toDataURL('image/webp', tries[i][1]);
          if (!/^data:image\/webp/i.test(out)) {
            /* 部分手机（如 iPhone）不支持 webp，改用 jpeg，透明处垫白色 */
            cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
            cx.drawImage(img, 0, 0, cv.width, cv.height);
            out = cv.toDataURL('image/jpeg', tries[i][1]);
          } else {
            cx.drawImage(img, 0, 0, cv.width, cv.height);
            out = cv.toDataURL('image/webp', tries[i][1]);
          }
          if (/^data:image\//i.test(out) && out.length < 150000) { resolve(out); return; }
        }
        resolve('');
      } catch (_) { resolve(''); }
    };
    img.onerror = function(){ resolve(''); };
    img.src = url;
  });
}

/* 还没有缩略图的内嵌大图，先做当前分组，再做其他分组，一张一张在后台生成，生成后记住，下次切换秒开。
 * 菜单刚弹出时先不做（等动画结束），菜单关了就暂停；做不出来的图只试一次，不会每次打开都重试。 */
function queueStickerThumbs(){
  clearTimeout(stickerThumbTimer);
  var st0 = getStickerState();
  var active = activeStickerGroup();
  var ordered = active ? [active] : [];
  st0.groups.forEach(function(g){ if (g !== active) ordered.push(g); });
  var todo = [];
  ordered.forEach(function(g){
    g.stickers.forEach(function(item){
      if (/^data:image\//i.test(item.url) && !item.thumb && !stickerThumbFailed[item.id] && item.url.length > STICKER_BIG_DATA_LIMIT) todo.push({ id:item.id, url:item.url });
    });
  });
  if (!todo.length) return;
  var run = ++stickerThumbRun, i = 0, made = {}, madeCount = 0;
  function finish(){
    if (!madeCount) return;
    var st = getStickerState();
    st.groups.forEach(function(g){ g.stickers.forEach(function(it){ if (made[it.id]) it.thumb = made[it.id]; }); });
    made = {}; madeCount = 0;
    saveStickers();
  }
  function next(){
    if (run !== stickerThumbRun || i >= todo.length || panelMode !== 'sticker') { finish(); return; }
    var job = todo[i++];
    makeStickerThumb(job.url).then(function(thumb){
      var img = pmPanelInner ? pmPanelInner.querySelector('.sticker-item[data-sticker-id="' + job.id + '"] img') : null;
      if (thumb) { made[job.id] = thumb; madeCount++; if (img) img.src = thumb; }
      else { stickerThumbFailed[job.id] = true; if (img) img.src = job.url; }
      stickerThumbTimer = setTimeout(next, 80);
    });
  }
  stickerThumbTimer = setTimeout(next, 750);
}

function renderStickerPanelInto(){
  if (pmPanel) pmPanel.classList.remove('is-sticker-manage');
  if (pmPanelInner) pmPanelInner.innerHTML = renderStickerPanel();
  queueStickerThumbs();
}

function openStickerPanel(){
  clearStickerSelection();
  panelMode = 'sticker';
  if (!pmPanel) return;
  pmPanel.classList.add('is-sticker-panel');
  pmPanel.classList.remove('is-tools-panel');
  pmPanel.classList.remove('is-sticker-manage');
  releaseInputFocus();
  renderStickerPanelInto();
  pmPanel.classList.add('is-open');
  setPmHasPanel(true);
}

function sendSticker(url){
  url = String(url || '').trim();
  if ((!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) || !currentName) return;
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  var stickerMsg = { from:'me', type:'sticker', url:url, text:'[表情包]', createdAt:Date.now() };
  MESSAGES[currentName].push(stickerMsg);
  saveMessages(currentName);
  visionPrewarm(currentName, stickerMsg);   /* 配置了识图 API 时在后台先识别，回复时直接复用 */
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
  var imageMsg = { from:'me', type:'image', url:dataUrl, text:'[图片]', createdAt:Date.now() };
  MESSAGES[currentName].push(imageMsg);
  saveMessages(currentName);
  visionPrewarm(currentName, imageMsg);
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
