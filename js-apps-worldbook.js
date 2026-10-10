/* 岛屿 · 世界书 App
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var worldbookApp = $('worldbookApp');

var activeWorldbookId = '';

var worldbookEditorMode = 'create';

var worldbookEditingId = '';


function getWorldbookById(id){
  var list = State.worldbooks || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === id) return list[i];
  }
  return null;
}


function formatWorldbookDate(ts){
  if (!ts) return '';
  var d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}


function renderWorldbooks(){
  var listEl = $('worldbookList');
  var subtitleEl = $('worldbookSubtitle');
  if (!listEl) return;

  var list = Array.isArray(State.worldbooks) ? State.worldbooks : [];
  if (subtitleEl) subtitleEl.textContent = list.length ? (list.length + ' 本世界书') : '管理 AI 世界设定';

  if (!list.length) {
    listEl.innerHTML = '';
  } else {
    listEl.innerHTML = list.map(function(book, index){
      var name = String(book.name || '未命名世界');
      var desc = String(book.description || '').trim();
      var entries = Array.isArray(book.entries) ? book.entries.length : 0;
      var mountText = getWorldbookScopeText(book);
      if (mountText === '局部' && book.mountTarget) mountText += ' · ' + String(book.mountTarget);
      var initial = escapeHTML(name.charAt(0) || '书');
      var rotate = (index * 23) % 18 - 9;
      return '<button type="button" class="worldbook-item" data-worldbook-id="' + escapeHTML(book.id) + '">' +
        '<span class="worldbook-item-icon" style="--book-rotate:' + rotate + 'deg">' + initial + '</span>' +
        '<span class="worldbook-item-main">' +
          '<span class="worldbook-item-name">' + escapeHTML(name) + '</span>' +
          '<span class="worldbook-item-desc">' + escapeHTML(desc || '还没有简介') + '</span>' +
          '<span class="worldbook-item-mount">' + escapeHTML(mountText) + '</span>' +
        '</span>' +
        '<span class="worldbook-item-meta"><strong>' + entries + '</strong><span>条</span><em>' + escapeHTML(formatWorldbookDate(book.updatedAt || book.createdAt)) + '</em></span>' +
        '<svg class="worldbook-item-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5.5 6.5 6.5-6.5 6.5"/></svg>' +
      '</button>';
    }).join('');
  }

  if (activeWorldbookId) {
    var active = getWorldbookById(activeWorldbookId);
    if (active) renderWorldbookDetail(active);
    else {
      activeWorldbookId = '';
      showWorldbookListView();
    }
  }
}


function normalizeWorldbookEntryPosition(value){
  var v = String(value || '').toLowerCase().trim();
  if (v === 'highest' || v === 'top' || v === 'system' || v === '最高') return 'highest';
  if (v === 'front' || v === 'before' || v === '前') return 'front';
  if (v === 'back' || v === 'after' || v === '后') return 'back';
  return 'middle';
}


function worldbookEntryPositionText(position){
  var map = { highest:'最高', front:'前', middle:'中', back:'后' };
  return map[normalizeWorldbookEntryPosition(position)] || '中';
}


function normalizeWorldbookEntry(entry){
  var e = entry && typeof entry === 'object' ? entry : {};
  var keywords = Array.isArray(e.keywords) ? e.keywords : String(e.keywords || '').split(/[\s,，、;；\n]+/).map(function(v){ return v.trim(); }).filter(Boolean);
  return {
    id: e.id || genId('wbe_'),
    name: String(e.name || e.title || '未命名条目'),
    keywords: keywords,
    content: String(e.content || ''),
    enabled: e.enabled !== false,
    priority: Math.max(0, Math.min(999, Number.isFinite(Number(e.priority)) ? Number(e.priority) : 100)),
    mode: e.mode === 'keyword' ? 'keyword' : 'always',
    position: normalizeWorldbookEntryPosition(e.position || e.insertionPosition),
    createdAt: e.createdAt || Date.now(),
    updatedAt: e.updatedAt || e.createdAt || Date.now()
  };
}


function getWorldbookEntries(book){
  if (!book) return [];
  if (!Array.isArray(book.entries)) book.entries = [];
  book.entries = book.entries.map(normalizeWorldbookEntry);
  return book.entries;
}


function saveWorldbook(book){
  if (!book) return Promise.resolve(false);
  book.updatedAt = Date.now();
  return saveWorldbooks();
}


function renderWorldbookEntries(book){
  var listEl = $('worldbookEntryList');
  var emptyEl = $('worldbookEntryEmpty');
  if (!listEl || !emptyEl || !book) return;
  var entries = getWorldbookEntries(book).slice().sort(function(a,b){ return Number(b.priority) - Number(a.priority) || Number(b.updatedAt) - Number(a.updatedAt); });
  $('worldbookEntryCount').textContent = entries.length + ' 条设定';
  if (!entries.length) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = entries.map(function(entry){
    var keywords = entry.keywords.slice(0, 4).map(function(k){ return '<span>' + escapeHTML(k) + '</span>'; }).join('');
    if (entry.keywords.length > 4) keywords += '<span>+' + (entry.keywords.length - 4) + '</span>';
    var modeText = entry.mode === 'always' ? '常驻' : '关键词触发';
    var positionText = worldbookEntryPositionText(entry.position);
    var preview = String(entry.content || '').replace(/\s+/g, ' ').trim();
    if (preview.length > 92) preview = preview.slice(0, 92) + '…';
    return '<article class="worldbook-entry-item ' + (entry.enabled ? '' : 'is-disabled') + '" data-entry-id="' + escapeHTML(entry.id) + '">' +
      '<div class="worldbook-entry-item-head">' +
        '<div class="worldbook-entry-item-title-wrap"><strong>' + escapeHTML(entry.name) + '</strong><span class="worldbook-entry-priority">P' + escapeHTML(String(entry.priority)) + '</span></div>' +
        '<button type="button" class="worldbook-entry-toggle small ' + (entry.enabled ? 'is-on' : '') + '" data-entry-action="toggle" aria-pressed="' + (entry.enabled ? 'true' : 'false') + '" aria-label="' + (entry.enabled ? '停用' : '启用') + '"><span></span></button>' +
      '</div>' +
      '<div class="worldbook-entry-tags">' + '<span class="worldbook-entry-mode">' + modeText + '</span><span class=\"worldbook-entry-position\">插入：' + positionText + '</span>' + keywords + '</div>' +
      '<p class=\"worldbook-entry-preview\">' + escapeHTML(preview || '还没有内容') + '</p>' +
      '<div class=\"worldbook-entry-item-actions\">' +
        '<button type=\"button\" class=\"worldbook-entry-edit\" data-entry-action=\"edit\">编辑条目</button>' +
        '<button type=\"button\" class=\"worldbook-entry-delete\" data-entry-action=\"delete\">删除条目</button>' +
      '</div>' +
    '</article>';
  }).join('');
}


function renderWorldbookDetail(book){
  var nameEl = $('worldbookDetailName');
  var descEl = $('worldbookDetailDescription');
  var badgeEl = $('worldbookDetailBadge');
  if (!book) return;
  if (nameEl) nameEl.textContent = book.name || '未命名世界';
  if (descEl) descEl.textContent = book.description || '还没有简介。';
  if (badgeEl) badgeEl.textContent = String(book.name || '书').charAt(0);
  renderWorldbookEntries(book);
}


var worldbookEntryEditorMode = 'create';

var worldbookEditingEntryId = '';

var worldbookEntrySelectedMode = 'always';

var worldbookEntrySelectedPosition = 'middle';

var worldbookEntryEnabled = true;


function openWorldbookEntryEditor(mode, entryId){
  var book = getWorldbookById(activeWorldbookId);
  var sheet = $('worldbookEntryEditorSheet');
  var mask = $('worldbookEntryEditorMask');
  if (!book || !sheet) return;
  var entry = mode === 'edit' ? getWorldbookEntries(book).find(function(e){ return e.id === entryId; }) : null;
  worldbookEntryEditorMode = mode === 'edit' ? 'edit' : 'create';
  worldbookEditingEntryId = entryId || '';
  worldbookEntrySelectedMode = entry && entry.mode === 'keyword' ? 'keyword' : 'always';
  worldbookEntrySelectedPosition = normalizeWorldbookEntryPosition(entry ? entry.position : 'middle');
  worldbookEntryEnabled = entry ? entry.enabled !== false : true;
  $('worldbookEntryEditorTitle').textContent = worldbookEntryEditorMode === 'edit' ? '编辑条目' : '新建条目';
  $('worldbookEntryNameInput').value = entry ? entry.name : '';
  $('worldbookEntryKeywordsInput').value = entry ? entry.keywords.join(', ') : '';
  $('worldbookEntryContentInput').value = entry ? entry.content : '';
  $('worldbookEntryPriorityInput').value = entry ? String(entry.priority) : '100';
  setWorldbookEntryMode(worldbookEntrySelectedMode);
  setWorldbookEntryPosition(worldbookEntrySelectedPosition);
  setWorldbookEntryEnabled(worldbookEntryEnabled);
  $('worldbookEntryEditorSave').disabled = !(entry ? entry.name.trim() && entry.content.trim() : false);
  sheet.classList.add('is-open');
  if (mask) mask.classList.add('is-open');
}


function closeWorldbookEntryEditor(){
  var sheet = $('worldbookEntryEditorSheet');
  var mask = $('worldbookEntryEditorMask');
  if (sheet) sheet.classList.remove('is-open');
  if (mask) mask.classList.remove('is-open');
  ['worldbookEntryNameInput','worldbookEntryKeywordsInput','worldbookEntryContentInput'].forEach(function(id){ var el=$(id); if(el) el.blur(); });
  worldbookEntryEditorMode = 'create';
  worldbookEditingEntryId = '';
}


function setWorldbookEntryMode(mode){
  worldbookEntrySelectedMode = mode === 'keyword' ? 'keyword' : 'always';
  $$('#worldbookEntryModeSegment [data-entry-mode]').forEach(function(btn){ btn.classList.toggle('is-active', btn.dataset.entryMode === worldbookEntrySelectedMode); });
}


function setWorldbookEntryPosition(position){
  worldbookEntrySelectedPosition = normalizeWorldbookEntryPosition(position);
  $$('#worldbookEntryPositionSegment [data-entry-position]').forEach(function(btn){ btn.classList.toggle('is-active', btn.dataset.entryPosition === worldbookEntrySelectedPosition); });
}


function setWorldbookEntryEnabled(enabled){
  worldbookEntryEnabled = !!enabled;
  var btn = $('worldbookEntryEnabledToggle');
  if (btn) { btn.classList.toggle('is-on', worldbookEntryEnabled); btn.setAttribute('aria-pressed', worldbookEntryEnabled ? 'true' : 'false'); }
}


function saveWorldbookEntryFromEditor(){
  var book = getWorldbookById(activeWorldbookId);
  if (!book) return;
  var name = $('worldbookEntryNameInput').value.trim();
  var content = $('worldbookEntryContentInput').value.trim();
  var rawKeywords = $('worldbookEntryKeywordsInput').value;
  var priority = parseInt($('worldbookEntryPriorityInput').value, 10);
  if (!Number.isFinite(priority)) priority = 100;
  priority = Math.max(0, Math.min(999, priority));
  var keywords = rawKeywords.split(/[\s,，、;；\n]+/).map(function(v){ return v.trim(); }).filter(Boolean).filter(function(v,i,a){ return a.indexOf(v) === i; });
  if (!name) { toast('请填写条目名称'); return; }
  if (!content) { toast('请填写条目内容'); return; }
  if (worldbookEntrySelectedMode === 'keyword' && !keywords.length) { toast('关键词触发需要至少一个关键词'); return; }
  var entries = getWorldbookEntries(book);
  var now = Date.now();
  if (worldbookEntryEditorMode === 'edit') {
    var entry = entries.find(function(e){ return e.id === worldbookEditingEntryId; });
    if (!entry) return;
    entry.name = name; entry.keywords = keywords; entry.content = content;
    entry.priority = priority; entry.mode = worldbookEntrySelectedMode; entry.position = worldbookEntrySelectedPosition; entry.enabled = worldbookEntryEnabled; entry.updatedAt = now;
    saveWorldbook(book); closeWorldbookEntryEditor(); renderWorldbooks(); renderWorldbookDetail(book); toast('条目已更新'); return;
  }
  entries.push({ id: genId('wbe_'), name:name, keywords:keywords, content:content, enabled:worldbookEntryEnabled, priority:priority, mode:worldbookEntrySelectedMode, position:worldbookEntrySelectedPosition, createdAt:now, updatedAt:now });
  book.entries = entries;
  saveWorldbook(book); closeWorldbookEntryEditor(); renderWorldbooks(); renderWorldbookDetail(book); toast('已创建条目 · ' + name);
}


function worldbookFileBaseName(name){
  return String(name || '导入条目').replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '').trim() || '导入条目';
}


function parseWorldbookEntryImportData(data, fallbackName){
  var raw = data;
  var source = [];
  var containers = [];
  function pushEntries(value){
    if (Array.isArray(value)) {
      value.forEach(function(item){ containers.push(item); });
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function(key){
        var item=value[key];
        if (item && typeof item === 'object') containers.push(item);
      });
    }
  }
  if (Array.isArray(raw)) source = raw;
  else if (raw && raw.entries) pushEntries(raw.entries);
  else if (raw && raw.data && raw.data.entries) pushEntries(raw.data.entries);
  else if (raw && raw.worldbook && raw.worldbook.entries) pushEntries(raw.worldbook.entries);
  else if (raw && raw.world_book && raw.world_book.entries) pushEntries(raw.world_book.entries);
  else if (raw && raw.character_book && raw.character_book.entries) pushEntries(raw.character_book.entries);
  else if (raw && raw.book && raw.book.entries) pushEntries(raw.book.entries);
  else if (raw && raw.entry && typeof raw.entry === 'object') source = [raw.entry];
  else if (raw && typeof raw === 'object') source = [raw];
  if (containers.length) source = containers;

  return source.map(function(item, index){
    item = item && typeof item === 'object' ? item : {};
    var keys = item.keywords != null ? item.keywords : (item.keys != null ? item.keys : (item.key != null ? item.key : (item.triggerWords != null ? item.triggerWords : item.triggers)));
    var keywords;
    if (Array.isArray(keys)) keywords = keys.map(String);
    else keywords = String(keys || '').split(/[\s,，、;；\n]+/).map(function(v){ return v.trim(); }).filter(Boolean);
    var name = String(item.name || item.title || item.comment || item.label || (fallbackName + (source.length > 1 ? ' ' + (index + 1) : ''))).trim();
    var content = String(item.content != null ? item.content : (item.text != null ? item.text : (item.value != null ? item.value : ''))).trim();
    if (!content) return null;
    var disabled = item.enabled === false || item.disable === true || item.disabled === true;
    var mode = item.mode === 'keyword' ? 'keyword' : (item.mode === 'always' || item.constant === true ? 'always' : (keywords.length ? 'keyword' : 'always'));
    var priorityValue = item.priority != null ? item.priority : item.order;
    var priority = Number(priorityValue);
    if (!Number.isFinite(priority)) priority = 100;
    priority = Math.max(0, Math.min(999, Math.round(priority)));
    var position = normalizeWorldbookEntryPosition(item.position || item.insertionPosition || item.insertPosition);
    return normalizeWorldbookEntry({
      id: genId('wbe_'),
      name: name || (fallbackName + (source.length > 1 ? ' ' + (index + 1) : '')),
      keywords: keywords,
      content: content,
      enabled: !disabled,
      priority: priority,
      mode: mode,
      position: position,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }).filter(Boolean);
}


function parseWorldbookImportText(text, fileName){
  var base = worldbookFileBaseName(fileName);
  var trimmed = String(text || '').trim();
  if (!trimmed) return [];
  var ext = String(fileName || '').toLowerCase().split('.').pop();
  if (ext === 'json' || ext === 'jsonl') {
    if (ext === 'jsonl') {
      var lines = trimmed.split(/\r?\n/).map(function(line){ return line.trim(); }).filter(Boolean);
      var parsedLines = [];
      lines.forEach(function(line){
        try { parsedLines.push(JSON.parse(line)); } catch(e) {}
      });
      if (!parsedLines.length) throw new Error('JSONL');
      return parseWorldbookEntryImportData(parsedLines, base);
    }
    try {
      return parseWorldbookEntryImportData(JSON.parse(trimmed), base);
    } catch(e) {
      throw new Error('JSON');
    }
  }

  var lines = trimmed.split(/\r?\n/);
  var first = lines[0].replace(/^\s{0,3}#{1,6}\s+/, '').trim();
  var name = first && first.length <= 60 ? first : base;
  if (/^#{1,6}\s+/.test(lines[0])) lines.shift();
  var content = lines.join('\n').trim() || trimmed;
  return [normalizeWorldbookEntry({
    id: genId('wbe_'), name:name, keywords:[], content:content,
    enabled:true, priority:100, mode:'always', position:'middle', createdAt:Date.now(), updatedAt:Date.now()
  })];
}


async function extractDocxText(file){
  if (!window.JSZip) throw new Error('DOCX_LIBRARY');
  var zip = await window.JSZip.loadAsync(file);
  var documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('DOCX_DOCUMENT');
  var xmlText = await documentFile.async('text');
  var xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('DOCX_XML');
  var paragraphs = Array.prototype.slice.call(xml.getElementsByTagNameNS('*', 'p')).map(function(p){
    var out = '';
    function walk(node){
      for (var child=node.firstChild; child; child=child.nextSibling){
        if (child.nodeType !== 1) continue;
        var local=String(child.localName || child.nodeName || '').split(':').pop();
        if (local === 't' || local === 'instrText') out += child.textContent || '';
        else if (local === 'tab') out += '\t';
        else if (local === 'br' || local === 'cr') out += '\n';
        else walk(child);
      }
    }
    walk(p);
    return out.replace(/\t+/g,'\t').trim();
  });
  var text=paragraphs.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  if (!text){
    var nodes=xml.getElementsByTagNameNS('*','t');
    var parts=[];
    for(var i=0;i<nodes.length;i++) parts.push(nodes[i].textContent || '');
    text=parts.join(' ').trim();
  }
  return text;
}


async function importWorldbookEntriesFromFile(file){
  var book=getWorldbookById(activeWorldbookId);
  if(!book || !file) return;
  var MAX_WORLD_BOOK_IMPORT=8*1024*1024;
  if(file.size>MAX_WORLD_BOOK_IMPORT){ toast('文件过大，请小于 8MB'); return; }
  var isDocx=/\.docx$/i.test(file.name || '') || file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  try{
    var text=isDocx ? await extractDocxText(file) : await file.text();
    var entries=parseWorldbookImportText(text,file.name);
    if(!entries.length){ toast('没有读到可导入的条目'); return; }
    book.entries=getWorldbookEntries(book).concat(entries);
    book.updatedAt=Date.now();
    saveWorldbooks();
    renderWorldbooks();
    renderWorldbookDetail(book);
    toast('已导入 '+entries.length+' 条 · '+file.name);
  }catch(err){
    var message='文件读取失败';
    if(err && err.message==='DOCX_LIBRARY') message='DOCX 解析组件未加载，请刷新页面后重试';
    else if(isDocx) message='DOCX 文件解析失败，请确认是有效的 .docx 文件';
    else if(err && /JSON/.test(err.message || '')) message='文件格式无法识别，请使用 TXT / MD / DOCX / JSON / JSONL';
    toast(message);
  }
}


function getImportedWorldbookName(raw, fallbackName){
  var source = raw && typeof raw === 'object' ? raw : {};
  var nested = source.worldbook || source.world_book || source.data || source.character_book || source.book || {};
  var name = source.name || source.title || source.worldbookName || nested.name || nested.title || '';
  return String(name || fallbackName || '导入世界书').trim().slice(0, 40) || '导入世界书';
}


function entrySignature(entry){
  return [String(entry.name || '').trim(), String(entry.content || '').trim()].join('\n@@\n');
}


function appendUniqueWorldbookEntries(target, incoming, seen){
  incoming.forEach(function(entry){
    if (!entry || !entry.content) return;
    var sig = entrySignature(entry);
    if (seen[sig]) return;
    seen[sig] = true;
    target.push(entry);
  });
}


async function parseWorldbookZip(file){
  if (!window.JSZip) throw new Error('ZIP_LIBRARY');
  var zip = await window.JSZip.loadAsync(file);
  var entries = [];
  var seen = {};
  var discoveredName = '';
  var files = [];
  Object.keys(zip.files || {}).forEach(function(path){
    var item = zip.files[path];
    if (!item || item.dir) return;
    var clean = String(path || '').replace(/\\/g, '/');
    var base = clean.split('/').pop();
    var ext = base.toLowerCase().split('.').pop();
    if (!['json','jsonl','txt','md','markdown','docx'].includes(ext)) return;
    // 常见压缩包元数据文件不参与条目导入
    if (/^(package|manifest|metadata|meta|readme)([-_].*)?\.(json|txt|md|markdown)$/i.test(base)) return;
    files.push({ path: clean, file: item, ext: ext });
  });
  files.sort(function(a,b){ return a.path.localeCompare(b.path); });

  for (var i=0;i<files.length;i++){
    var item = files[i];
    var baseName = worldbookFileBaseName(item.path);
    try {
      if (item.ext === 'json' || item.ext === 'jsonl') {
        var jsonText = await item.file.async('text');
        var trimmed = String(jsonText || '').trim();
        if (!trimmed) continue;
        if (item.ext === 'jsonl') {
          var parsedLines = [];
          trimmed.split(/\r?\n/).map(function(line){ return line.trim(); }).filter(Boolean).forEach(function(line){
            try { parsedLines.push(JSON.parse(line)); } catch(e) {}
          });
          if (!parsedLines.length) continue;
          appendUniqueWorldbookEntries(entries, parseWorldbookEntryImportData(parsedLines, baseName), seen);
          if (!discoveredName) discoveredName = getImportedWorldbookName(parsedLines[0], baseName);
        } else {
          var parsed = JSON.parse(trimmed);
          appendUniqueWorldbookEntries(entries, parseWorldbookEntryImportData(parsed, baseName), seen);
          if (!discoveredName) discoveredName = getImportedWorldbookName(parsed, baseName);
        }
      } else if (item.ext === 'docx') {
        var blob = await item.file.async('blob');
        var docxText = await extractDocxText(blob);
        appendUniqueWorldbookEntries(entries, parseWorldbookImportText(docxText, baseName + '.txt'), seen);
      } else {
        var text = await item.file.async('text');
        appendUniqueWorldbookEntries(entries, parseWorldbookImportText(text, item.path), seen);
      }
    } catch(e) {
      // 压缩包中的单个坏文件不阻断整个导入；其他可识别文件仍继续处理
    }
  }
  return { entries: entries, name: discoveredName || worldbookFileBaseName(file.name) };
}


async function importWorldbookFromFile(file){
  if (!file) return;
  var MAX_WORLD_BOOK_IMPORT = 32 * 1024 * 1024;
  if (file.size > MAX_WORLD_BOOK_IMPORT) { toast('文件过大，请小于 32MB'); return; }
  var ext = String(file.name || '').toLowerCase().split('.').pop();
  var isZip = ext === 'zip' || /zip/i.test(file.type || '');
  var result = null;
  var fallbackName = worldbookFileBaseName(file.name);
  try {
    if (isZip) {
      result = await parseWorldbookZip(file);
    } else {
      var text = await file.text();
      var trimmed = String(text || '').trim();
      if (!trimmed) { toast('文件没有可导入的内容'); return; }
      var parsed = JSON.parse(trimmed);
      result = {
        entries: parseWorldbookEntryImportData(parsed, fallbackName),
        name: getImportedWorldbookName(parsed, fallbackName)
      };
    }
    if (!result.entries.length) {
      toast(isZip ? 'ZIP 中没有识别到可导入的条目' : 'JSON 中没有识别到可导入的条目');
      return;
    }
    var now = Date.now();
    var name = result.name || fallbackName;
    var created = {
      id: genId('wb_'),
      name: name,
      description: '从 ' + file.name + ' 导入，共 ' + result.entries.length + ' 条设定。',
      mountScope: 'global',
      mountTarget: '',
      entries: result.entries.map(function(entry, index){
        entry.id = genId('wbe_');
        if (!entry.name || entry.name === '未命名条目') entry.name = name + ' · ' + (index + 1);
        entry.createdAt = now + index;
        entry.updatedAt = now + index;
        return normalizeWorldbookEntry(entry);
      }),
      createdAt: now,
      updatedAt: now
    };
    State.worldbooks = Array.isArray(State.worldbooks) ? State.worldbooks : [];
    State.worldbooks.unshift(normalizeWorldbookBook(created));
    await saveWorldbooks();
    renderWorldbooks();
    showWorldbookDetailView(created.id);
    toast('已导入世界书 · ' + created.entries.length + ' 条');
  } catch (err) {
    if (err && err.message === 'ZIP_LIBRARY') toast('ZIP 解析组件未加载，请刷新页面后重试');
    else toast('导入失败，请确认是有效的 JSON 或 ZIP 世界书文件');
  }
}


function deleteWorldbook(worldbookId){
  var book=getWorldbookById(worldbookId);
  if(!book) return;
  islandConfirm('确定删除世界书“'+(book.name || '未命名世界')+'”吗？\n其中的所有条目也会一起删除。', {title:'删除世界书', confirmText:'删除', danger:true}).then(function(ok){
    if (!ok) return;
    State.worldbooks=(State.worldbooks || []).filter(function(item){ return item && item.id!==worldbookId; });
    saveWorldbooks();
    if(activeWorldbookId===worldbookId){ activeWorldbookId=''; showWorldbookListView(); }
    renderWorldbooks();
    toast('已删除世界书');
  });
}


function deleteWorldbookEntry(entryId){
  var book=getWorldbookById(activeWorldbookId);
  if(!book) return;
  var entries=getWorldbookEntries(book);
  var entry=entries.find(function(item){ return item.id===entryId; });
  if(!entry) return;
  islandConfirm('确定删除条目“'+(entry.name || '未命名条目')+'”吗？删除后不可恢复。', {title:'删除条目', confirmText:'删除', danger:true}).then(function(ok){
    if (!ok) return;
    book.entries=entries.filter(function(item){ return item.id!==entryId; });
    saveWorldbook(book);
    renderWorldbooks();
    renderWorldbookDetail(book);
    toast('已删除世界书条目');
  });
}


function toggleWorldbookEntry(entryId){
  var book = getWorldbookById(activeWorldbookId);
  if (!book) return;
  var entry = getWorldbookEntries(book).find(function(e){ return e.id === entryId; });
  if (!entry) return;
  entry.enabled = !entry.enabled; entry.updatedAt = Date.now();
  saveWorldbook(book); renderWorldbooks(); renderWorldbookDetail(book);
}


function syncWorldbookHeaderContext(){
  var back = document.querySelector('.js-worldbook-back');
  if (!back) return;
  var inDetail = !!activeWorldbookId && worldbookApp && worldbookApp.classList.contains('is-open');
  back.setAttribute('aria-label', inDetail ? '返回世界书列表' : '返回桌面');
}


function showWorldbookListView(){
  var listView = $('worldbookListView');
  var detailView = $('worldbookDetailView');
  if (listView) listView.hidden = false;
  if (detailView) detailView.hidden = true;
  syncWorldbookHeaderContext();
}


function showWorldbookDetailView(id){
  var book = getWorldbookById(id);
  if (!book) return;
  activeWorldbookId = id;
  renderWorldbookDetail(book);
  var listView = $('worldbookListView');
  var detailView = $('worldbookDetailView');
  if (listView) listView.hidden = true;
  if (detailView) detailView.hidden = false;
  syncWorldbookHeaderContext();
}


function openWorldbookApp(){
  if (!worldbookApp) return;
  releaseInputFocus();
  closeSettingsApp();
  closeChatApp();
  worldbookApp.classList.add('is-open');
  worldbookApp.setAttribute('aria-hidden', 'false');
  showWorldbookListView();
  activeWorldbookId = '';
  renderWorldbooks();
}


function closeWorldbookApp(){
  if (!worldbookApp) return;
  releaseInputFocus();
  closeWorldbookEditor();
  closeWorldbookEntryEditor();
  worldbookApp.classList.remove('is-open');
  worldbookApp.setAttribute('aria-hidden', 'true');
  activeWorldbookId = '';
  showWorldbookListView();
}


var worldbookSelectedScope = 'global';

var worldbookSelectedMountTarget = '';


function getWorldbookMountTargets(){
  var names = [];
  var seen = {};
  (Array.isArray(State.personas) ? State.personas : []).forEach(function(persona){
    var name = String(persona && persona.name || '').trim();
    if (name && !seen[name]) { seen[name] = true; names.push(name); }
  });
  (Array.isArray(CHATS) ? CHATS : []).forEach(function(chat){
    var name = String(chat && chat.name || '').trim();
    if (name && !seen[name]) { seen[name] = true; names.push(name); }
  });
  return names;
}


function renderWorldbookMountTargets(){
  var select = $('worldbookMountTarget');
  if (!select) return;
  var names = getWorldbookMountTargets();
  if (worldbookSelectedMountTarget && names.indexOf(worldbookSelectedMountTarget) < 0) names.unshift(worldbookSelectedMountTarget);
  select.innerHTML = names.length ? names.map(function(name){
    return '<option value="' + escapeHTML(name) + '">' + escapeHTML(name) + '</option>';
  }).join('') : '<option value="">还没有可挂载的角色</option>';
  select.value = worldbookSelectedMountTarget || (names[0] || '');
  if (worldbookSelectedScope === 'local' && !select.value) select.disabled = true;
  else select.disabled = false;
}


function setWorldbookMountScope(scope){
  worldbookSelectedScope = normalizeWorldbookScope(scope);
  $$('#worldbookMountScopeSegment [data-worldbook-scope]').forEach(function(btn){
    btn.classList.toggle('is-active', btn.dataset.worldbookScope === worldbookSelectedScope);
  });
  var wrap = $('worldbookMountTargetWrap');
  if (wrap) wrap.hidden = worldbookSelectedScope !== 'local';
  if (worldbookSelectedScope === 'local') renderWorldbookMountTargets();
}


function openWorldbookEditor(mode, id){
  var sheet = $('worldbookEditorSheet');
  var mask = $('worldbookEditorMask');
  var nameInput = $('worldbookNameInput');
  var descInput = $('worldbookDescriptionInput');
  var title = $('worldbookEditorTitle');
  var saveBtn = $('worldbookEditorSave');
  if (!sheet || !nameInput || !descInput || !title || !saveBtn) return;

  worldbookEditorMode = mode === 'edit' ? 'edit' : 'create';
  worldbookEditingId = id || '';
  var book = worldbookEditorMode === 'edit' ? getWorldbookById(worldbookEditingId) : null;

  title.textContent = worldbookEditorMode === 'edit' ? '编辑世界书' : '新建世界书';
  saveBtn.textContent = worldbookEditorMode === 'edit' ? '保存修改' : '创建世界书';
  nameInput.value = book ? (book.name || '') : '';
  descInput.value = book ? (book.description || '') : '';
  worldbookSelectedScope = normalizeWorldbookScope(book ? book.mountScope : 'global');
  worldbookSelectedMountTarget = book ? String(book.mountTarget || '') : '';
  setWorldbookMountScope(worldbookSelectedScope);
  renderWorldbookMountTargets();
  saveBtn.disabled = !nameInput.value.trim() || (worldbookSelectedScope === 'local' && !worldbookSelectedMountTarget);

  sheet.classList.add('is-open');
  if (mask) mask.classList.add('is-open');
}


function closeWorldbookEditor(){
  var sheet = $('worldbookEditorSheet');
  var mask = $('worldbookEditorMask');
  var nameInput = $('worldbookNameInput');
  var descInput = $('worldbookDescriptionInput');
  if (sheet) sheet.classList.remove('is-open');
  if (mask) mask.classList.remove('is-open');
  if (nameInput) nameInput.blur();
  if (descInput) descInput.blur();
  worldbookEditorMode = 'create';
  worldbookEditingId = '';
  worldbookSelectedScope = 'global';
  worldbookSelectedMountTarget = '';
}


function saveWorldbookFromEditor(){
  var nameInput = $('worldbookNameInput');
  var descInput = $('worldbookDescriptionInput');
  if (!nameInput) return;
  var name = nameInput.value.trim();
  var description = descInput ? descInput.value.trim() : '';
  if (!name) { toast('请先填写世界书名称'); return; }
  if (worldbookSelectedScope === 'local' && !worldbookSelectedMountTarget) { toast('局部挂载需要先选择角色'); return; }

  var now = Date.now();
  if (worldbookEditorMode === 'edit') {
    var book = getWorldbookById(worldbookEditingId);
    if (!book) return;
    book.name = name;
    book.description = description;
    book.mountScope = worldbookSelectedScope;
    book.mountTarget = worldbookSelectedScope === 'local' ? worldbookSelectedMountTarget : '';
    book.updatedAt = now;
    if (!Array.isArray(book.entries)) book.entries = [];
    saveWorldbooks();
    closeWorldbookEditor();
    renderWorldbooks();
    if (activeWorldbookId === book.id) renderWorldbookDetail(book);
    toast('世界书已更新');
    return;
  }

  var created = {
    id: genId('wb_'),
    name: name,
    description: description,
    mountScope: worldbookSelectedScope,
    mountTarget: worldbookSelectedScope === 'local' ? worldbookSelectedMountTarget : '',
    entries: [],
    createdAt: now,
    updatedAt: now
  };
  State.worldbooks.unshift(created);
  saveWorldbooks();
  closeWorldbookEditor();
  renderWorldbooks();
  showWorldbookDetailView(created.id);
  toast('已创建世界书 · ' + name);
}


function normalizeWorldbookScope(value){
  var v = String(value || '').toLowerCase().trim();
  return (v === 'local' || v === 'character' || v === 'chat' || v === '局部') ? 'local' : 'global';
}


function getWorldbookScopeText(book){
  return normalizeWorldbookScope(book && (book.mountScope || book.scope || book.mountType)) === 'local' ? '局部' : '全局';
}


function normalizeWorldbookBook(book){
  var src = book && typeof book === 'object' ? book : {};
  var scope = normalizeWorldbookScope(src.mountScope || src.scope || src.mountType);
  var target = String(src.mountTarget || src.targetCharacter || src.character || src.chat || '').trim();
  return {
    id: String(src.id || genId('wb_')),
    name: String(src.name || src.title || '未命名世界'),
    description: String(src.description || src.desc || ''),
    mountScope: scope,
    mountTarget: scope === 'local' ? target : '',
    entries: Array.isArray(src.entries) ? src.entries.map(normalizeWorldbookEntry) : [],
    createdAt: Number(src.createdAt || Date.now()),
    updatedAt: Number(src.updatedAt || src.createdAt || Date.now())
  };
}


function normalizeLoadedWorldbooks(){
  State.worldbooks = (Array.isArray(State.worldbooks) ? State.worldbooks : []).map(normalizeWorldbookBook);
}


function getWorldbookEntriesForChat(name){
  var books = Array.isArray(State.worldbooks) ? State.worldbooks : [];
  return books.filter(function(book){
    if (!book) return false;
    var scope = normalizeWorldbookScope(book.mountScope);
    return scope === 'global' || (scope === 'local' && String(book.mountTarget || '').trim() === String(name || '').trim());
  });
}


function getWorldbookTriggerContext(name){
  var list = MESSAGES[name] || [];
  var start = Math.max(0, list.length - 12);
  var parts = [];
  for (var i = start; i < list.length; i++) {
    var m = list[i];
    if (m && m.text) parts.push(String(m.text));
  }
  var persona = findPersona(name);
  var user = getActiveUserPersona();
  if (persona && persona.name) parts.push(String(persona.name));
  if (user && user.name) parts.push(String(user.name));
  return parts.join('\n').toLocaleLowerCase();
}


function worldbookEntryTriggered(entry, triggerContext){
  if (!entry || entry.enabled === false) return false;
  if (entry.mode !== 'keyword') return true;
  var context = String(triggerContext || '').toLocaleLowerCase();
  if (!context) return false;
  var keys = Array.isArray(entry.keywords) ? entry.keywords : [];
  return keys.some(function(keyword){
    var key = String(keyword || '').trim().toLocaleLowerCase();
    return key && context.indexOf(key) !== -1;
  });
}


function collectWorldbookEntries(name){
  var books = getWorldbookEntriesForChat(name);
  var triggerContext = getWorldbookTriggerContext(name);
  var buckets = { highest:[], front:[], middle:[], back:[] };
  books.forEach(function(book){
    getWorldbookEntries(book).forEach(function(entry){
      if (!worldbookEntryTriggered(entry, triggerContext)) return;
      var position = normalizeWorldbookEntryPosition(entry.position);
      if (!buckets[position]) buckets[position] = [];
      buckets[position].push({ entry:entry, book:book });
    });
  });
  Object.keys(buckets).forEach(function(key){
    buckets[key].sort(function(a,b){
      return Number(b.entry.priority) - Number(a.entry.priority) || Number(b.entry.updatedAt) - Number(a.entry.updatedAt);
    });
  });
  return buckets;
}


function formatWorldbookContextBlock(title, rows){
  if (!rows || !rows.length) return '';
  var text = title + '\n';
  rows.forEach(function(item, index){
    var entry = item.entry;
    text += '\n[' + (index + 1) + '] ' + String(entry.name || '未命名条目') + '\n' + String(entry.content || '').trim();
  });
  return text;
}

function bindWorldbookEvents(){

  $$('.js-worldbook-back').forEach(function(btn){ btn.addEventListener('click', function(){
    if (activeWorldbookId) {
      activeWorldbookId = '';
      showWorldbookListView();
      renderWorldbooks();
    } else {
      closeWorldbookApp();
    }
  }); });
  var worldbookImportBtn = $('worldbookImportBtn');
  var worldbookImportFileInput = $('worldbookImportFileInput');
  if (worldbookImportBtn && worldbookImportFileInput) {
    worldbookImportBtn.addEventListener('click', function(){ worldbookImportFileInput.click(); });
    worldbookImportFileInput.addEventListener('change', function(){
      var file = worldbookImportFileInput.files && worldbookImportFileInput.files[0];
      if (file) importWorldbookFromFile(file);
      worldbookImportFileInput.value = '';
    });
  }
  var worldbookNewBtn = $('worldbookNewBtn');
  if (worldbookNewBtn) worldbookNewBtn.addEventListener('click', function(){ openWorldbookEditor('create'); });
  var worldbookList = $('worldbookList');
  if (worldbookList) {
    worldbookList.addEventListener('click', function(e){
      var item = e.target.closest('[data-worldbook-id]');
      if (item) showWorldbookDetailView(item.dataset.worldbookId);
    });
  }
  var worldbookEditBtn = $('worldbookEditBtn');
  if (worldbookEditBtn) worldbookEditBtn.addEventListener('click', function(){
    if (activeWorldbookId) openWorldbookEditor('edit', activeWorldbookId);
  });
  var worldbookDeleteBtn = $('worldbookDeleteBtn');
  if (worldbookDeleteBtn) worldbookDeleteBtn.addEventListener('click', function(){
    if (activeWorldbookId) deleteWorldbook(activeWorldbookId);
  });
  var worldbookEntryAddBtn = $('worldbookEntryAddBtn');
  if (worldbookEntryAddBtn) worldbookEntryAddBtn.addEventListener('click', function(){ openWorldbookEntryEditor('create'); });
  var worldbookEntryList = $('worldbookEntryList');
  if (worldbookEntryList) worldbookEntryList.addEventListener('click', function(e){
    var item = e.target.closest('[data-entry-id]');
    var action = e.target.closest('[data-entry-action]');
    if (!item || !action) return;
    var id = item.dataset.entryId;
    if (action.dataset.entryAction === 'toggle') toggleWorldbookEntry(id);
    if (action.dataset.entryAction === 'edit') openWorldbookEntryEditor('edit', id);
    if (action.dataset.entryAction === 'delete') deleteWorldbookEntry(id);
  });
  var entryClose = $('worldbookEntryEditorClose');
  var entryCancel = $('worldbookEntryEditorCancel');
  var entryMask = $('worldbookEntryEditorMask');
  if (entryClose) entryClose.addEventListener('click', closeWorldbookEntryEditor);
  if (entryCancel) entryCancel.addEventListener('click', closeWorldbookEntryEditor);
  if (entryMask) entryMask.addEventListener('click', closeWorldbookEntryEditor);
  $$('#worldbookEntryModeSegment [data-entry-mode]').forEach(function(btn){
    btn.addEventListener('click', function(){ setWorldbookEntryMode(btn.dataset.entryMode); });
  });
  $$('#worldbookEntryPositionSegment [data-entry-position]').forEach(function(btn){
    btn.addEventListener('click', function(){ setWorldbookEntryPosition(btn.dataset.entryPosition); });
  });
  var worldbookEntryImportBtn = $('worldbookEntryImportBtn');
  var worldbookEntryFileInput = $('worldbookEntryFileInput');
  if (worldbookEntryImportBtn && worldbookEntryFileInput) {
    worldbookEntryImportBtn.addEventListener('click', function(){ worldbookEntryFileInput.click(); });
    worldbookEntryFileInput.addEventListener('change', function(){
      var file = worldbookEntryFileInput.files && worldbookEntryFileInput.files[0];
      if (file) importWorldbookEntriesFromFile(file);
      worldbookEntryFileInput.value = '';
    });
  }
  var entryEnabledToggle = $('worldbookEntryEnabledToggle');
  if (entryEnabledToggle) entryEnabledToggle.addEventListener('click', function(){ setWorldbookEntryEnabled(!worldbookEntryEnabled); });
  var entrySave = $('worldbookEntryEditorSave');
  var entryName = $('worldbookEntryNameInput');
  var entryContent = $('worldbookEntryContentInput');
  function updateEntrySaveState(){
    if (entrySave) entrySave.disabled = !(entryName && entryContent && entryName.value.trim() && entryContent.value.trim());
  }
  if (entrySave) entrySave.addEventListener('click', saveWorldbookEntryFromEditor);
  if (entryName) entryName.addEventListener('input', updateEntrySaveState);
  if (entryContent) entryContent.addEventListener('input', updateEntrySaveState);
  function updateWorldbookEditorSaveState(){
    var save = $('worldbookEditorSave');
    var name = $('worldbookNameInput');
    if (!save) return;
    save.disabled = !(name && name.value.trim()) || (worldbookSelectedScope === 'local' && !worldbookSelectedMountTarget);
  }
  var worldbookEditorClose = $('worldbookEditorClose');
  var worldbookEditorCancel = $('worldbookEditorCancel');
  var worldbookEditorMask = $('worldbookEditorMask');
  if (worldbookEditorClose) worldbookEditorClose.addEventListener('click', closeWorldbookEditor);
  if (worldbookEditorCancel) worldbookEditorCancel.addEventListener('click', closeWorldbookEditor);
  if (worldbookEditorMask) worldbookEditorMask.addEventListener('click', closeWorldbookEditor);
  $$('#worldbookMountScopeSegment [data-worldbook-scope]').forEach(function(btn){
    btn.addEventListener('click', function(){ setWorldbookMountScope(btn.dataset.worldbookScope); updateWorldbookEditorSaveState(); });
  });
  var worldbookMountTarget = $('worldbookMountTarget');
  if (worldbookMountTarget) worldbookMountTarget.addEventListener('change', function(){ worldbookSelectedMountTarget = worldbookMountTarget.value; updateWorldbookEditorSaveState(); });
  var worldbookEditorSave = $('worldbookEditorSave');
  var worldbookNameInput = $('worldbookNameInput');
  if (worldbookEditorSave) worldbookEditorSave.addEventListener('click', saveWorldbookFromEditor);
  if (worldbookNameInput) worldbookNameInput.addEventListener('input', function(){
    updateWorldbookEditorSaveState();
  });
}

registerApp('世界书', function(){ openWorldbookApp(); });
