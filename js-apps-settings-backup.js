/* 岛屿 · 设置 · 备份与导入
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';


/* ---------- 字体 ↔ 备份 ----------
 * 本地 TTF 以 ArrayBuffer 存在 settings.font.items[].data 里；clone()/JSON.stringify 会把它变成 {}，
 * 导致备份里没有字体内容，导入后字体无法应用。这里导出时转成 base64，导入时还原成 ArrayBuffer。 */
function arrayBufferToBase64(buffer){
  var bytes = new Uint8Array(buffer);
  var chunk = 0x8000, parts = [];
  for (var i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
  }
  return btoa(parts.join(''));
}

function base64ToArrayBuffer(b64){
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function cloneSettingsForBackup(settings){
  settings = settings || {};
  var font = settings.font;
  var hasFontData = font && Array.isArray(font.items) && font.items.some(function(it){
    return it && (it.data instanceof ArrayBuffer || ArrayBuffer.isView(it.data));
  });
  if (!hasFontData) return clone(settings);
  var rest = Object.assign({}, settings);
  delete rest.font;
  var out = clone(rest);
  out.font = Object.assign({}, font, {
    items: font.items.map(function(it){
      if (!it || !(it.data instanceof ArrayBuffer || ArrayBuffer.isView(it.data))) return clone(it);
      var buf = it.data instanceof ArrayBuffer ? it.data : it.data.buffer.slice(it.data.byteOffset, it.data.byteOffset + it.data.byteLength);
      var copy = Object.assign({}, it);
      delete copy.data;
      copy.dataBase64 = arrayBufferToBase64(buf);
      return clone(copy);
    })
  });
  return out;
}

function restoreSettingsFromBackup(settings){
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
  var font = settings.font;
  if (!font || typeof font !== 'object' || !Array.isArray(font.items)) return settings;
  var items = [];
  font.items.forEach(function(it){
    if (!it || typeof it !== 'object') return;
    if (typeof it.dataBase64 === 'string' && it.dataBase64) {
      try {
        var buf = base64ToArrayBuffer(it.dataBase64);
        var copy = Object.assign({}, it, { data: buf, byteLength: buf.byteLength });
        delete copy.dataBase64;
        items.push(copy);
        return;
      } catch(e) { console.warn('[岛屿] 备份中的字体解码失败：', it.name || it.id, e); }
    }
    /* 链接字体保留；旧版备份里丢失了内容的本地字体（data 为空对象）无法恢复，直接丢弃，避免出现“已应用但不生效”的假字体。 */
    if (it.source === 'url' && it.url) items.push(it);
  });
  var activeOk = items.some(function(it){ return it.id === font.activeId; });
  settings.font = Object.assign({}, font, { items: items, activeId: activeOk ? font.activeId : '' });
  return settings;
}


function buildBackupPayload(){
  return {
    kind: 'island-backup',
    version: 1,
    app: '岛屿',
    exportedAt: Date.now(),
    data: {
      settings: cloneSettingsForBackup(State.settings),
      chats: clone(CHATS || []),
      contacts: clone(CONTACTS || []),
      moments: clone(MOMENTS || []),
      messages: clone(MESSAGES || {}),
      personas: clone(State.personas || []),
      userPersonas: clone(State.userPersonas || []),
      worldbooks: clone(State.worldbooks || []),
      stickers: clone(State.stickers || { activeGroupId:'', groups:[] }),
      memory: clone(State.memory || {})
    }
  };
}


function downloadBackup(){
  try {
    var payload = buildBackupPayload();
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type:'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    var stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
    a.href = url;
    a.download = 'island-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    toast('完整备份已导出');
  } catch(e){
    console.error('[岛屿] 备份导出失败：', e);
    toast('备份导出失败');
  }
}


var BACKUP_PART_META = {
  settings: { label:'系统设置', file:'settings' },
  chats: { label:'聊天', file:'chats' },
  contacts: { label:'通讯录', file:'contacts' },
  moments: { label:'动态', file:'moments' },
  phoneCalls: { label:'电话记录', file:'phone-calls' },
  memory: { label:'记忆', file:'memory' },
  personas: { label:'角色人设', file:'personas' },
  userPersonas: { label:'我的身份', file:'user-personas' },
  worldbooks: { label:'世界书', file:'worldbooks' },
  stickers: { label:'表情包', file:'stickers' }
};


function buildPartialBackupPayload(part){
  var data;
  switch(part){
    case 'settings': data = { settings: cloneSettingsForBackup(State.settings) }; break;
    case 'chats':
      data = { chats: clone(CHATS || []), messages: clone(MESSAGES || {}) };
      break;
    case 'contacts': data = { contacts: clone(CONTACTS || []) }; break;
    case 'moments': data = { moments: clone(MOMENTS || []) }; break;
    case 'phoneCalls': data = { phoneCalls: clone(State.phoneCalls || []) }; break;
    case 'memory': data = { memory: clone(State.memory || {}) }; break;
    case 'personas': data = { personas: clone(State.personas || []) }; break;
    case 'userPersonas': data = { userPersonas: clone(State.userPersonas || []) }; break;
    case 'worldbooks': data = { worldbooks: clone(State.worldbooks || []) }; break;
    case 'stickers': data = { stickers: clone(State.stickers || { activeGroupId:'', groups:[] }) }; break;
    default: throw new Error('未知的备份模块');
  }
  return {
    kind:'island-partial-backup',
    version:1,
    app:'岛屿',
    part:part,
    exportedAt:Date.now(),
    data:data
  };
}


function downloadPartialBackup(part){
  var meta = BACKUP_PART_META[part];
  if (!meta) { toast('未知的备份模块'); return; }
  try {
    var payload = buildPartialBackupPayload(part);
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type:'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    var stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
    a.href = url;
    a.download = 'island-backup-' + meta.file + '-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    toast(meta.label + '已导出');
  } catch(e){
    console.error('[岛屿] 分项备份导出失败：', e);
    toast(meta.label + '导出失败');
  }
}


function getSelectedBackupParts(){
  return $$('.js-backup-part-select:checked').map(function(input){ return input.value; }).filter(function(part){
    return !!BACKUP_PART_META[part];
  });
}


function updateBackupPartSelectionUI(){
  var selected = getSelectedBackupParts();
  var total = Object.keys(BACKUP_PART_META).length;
  var countEl = $('backupPartSelectionCount');
  if (countEl) countEl.textContent = '已选 ' + selected.length + ' / ' + total + ' 项';
  var selectAllBtn = $('backupPartSelectAllBtn');
  if (selectAllBtn) {
    selectAllBtn.textContent = selected.length === total ? '取消全选' : '全选';
    selectAllBtn.setAttribute('aria-pressed', selected.length === total ? 'true' : 'false');
  }
  var exportBtn = $('backupSelectedExportBtn');
  if (exportBtn) exportBtn.disabled = selected.length === 0;
  $$('.js-backup-part-select').forEach(function(input){
    var row = input.closest('.backup-part-item');
    if (row) row.classList.toggle('is-selected', input.checked);
  });
}


function toggleAllBackupPartSelection(){
  var inputs = $$('.js-backup-part-select');
  var allSelected = inputs.length > 0 && inputs.every(function(input){ return input.checked; });
  inputs.forEach(function(input){ input.checked = !allSelected; });
  updateBackupPartSelectionUI();
}


function readFileAsText(file){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(){ resolve(String(reader.result || '')); };
    reader.onerror = function(){ reject(new Error('文件读取失败')); };
    reader.readAsText(file);
  });
}


function readFileAsArrayBuffer(file){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(){ resolve(reader.result); };
    reader.onerror = function(){ reject(new Error('文件读取失败')); };
    reader.readAsArrayBuffer(file);
  });
}


function downloadSelectedPartialBackups(){
  var parts = getSelectedBackupParts();
  if (!parts.length) { toast('请先选择要导出的模块'); return; }
  if (typeof JSZip === 'undefined') { toast('批量导出组件未加载'); return; }
  try {
    var zip = new JSZip();
    var d = new Date();
    var stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
    parts.forEach(function(part){
      var meta = BACKUP_PART_META[part];
      var payload = buildPartialBackupPayload(part);
      zip.file('island-backup-' + meta.file + '-' + stamp + '.json', JSON.stringify(payload, null, 2));
    });
    zip.generateAsync({
      type:'blob',
      compression:'DEFLATE',
      compressionOptions:{ level:6 }
    }).then(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'island-backup-parts-' + stamp + '.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      toast('已导出 ' + parts.length + ' 个模块');
    }).catch(function(err){
      console.error('[岛屿] 批量备份导出失败：', err);
      toast('批量导出失败');
    });
  } catch(e){
    console.error('[岛屿] 批量备份导出失败：', e);
    toast('批量导出失败');
  }
}


function parsePartialBatchEntry(raw, sourceLabel){
  if (!raw || typeof raw !== 'object') throw new Error('不是有效的 JSON 备份');
  if (raw.kind !== 'island-partial-backup') {
    if (raw.kind === 'island-backup') throw new Error('完整备份不能放入“分别备份”的批量导入，请使用上面的“完整备份 → 导入”');
    throw new Error('不是可识别的分项备份文件');
  }
  var part = String(raw.part || '');
  if (!BACKUP_PART_META[part]) throw new Error('包含未知的备份模块');
  return {
    part: part,
    data: normalizePartialBackup(raw, part),
    sourceLabel: sourceLabel || '备份文件'
  };
}


function collectPartialEntriesFromZip(file){
  return readFileAsArrayBuffer(file).then(function(buffer){
    if (typeof JSZip === 'undefined') throw new Error('批量导入组件未加载');
    return JSZip.loadAsync(buffer).then(function(zip){
      var entries = [];
      var tasks = [];
      zip.forEach(function(relativePath, entry){
        if (entry.dir || !/\.json$/i.test(relativePath)) return;
        tasks.push(entry.async('string').then(function(text){
          var raw;
          try { raw = JSON.parse(text); } catch(e) {
            throw new Error('压缩包中的文件“' + relativePath + '”不是有效 JSON');
          }
          entries.push(parsePartialBatchEntry(raw, file.name + ' / ' + relativePath));
        }));
      });
      if (!tasks.length) throw new Error('压缩包内没有可导入的分项备份 JSON');
      return Promise.all(tasks).then(function(){ return entries; });
    });
  });
}


function importSelectedPartialBackupFiles(fileList){
  var files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return;

  var jobs = files.map(function(file){
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      return collectPartialEntriesFromZip(file);
    }
    return readFileAsText(file).then(function(text){
      var raw;
      try { raw = JSON.parse(text); } catch(e) {
        throw new Error('文件“' + file.name + '”不是有效 JSON');
      }
      return [parsePartialBatchEntry(raw, file.name)];
    });
  });

  Promise.all(jobs).then(function(groups){
    var entries = [];
    groups.forEach(function(group){ entries = entries.concat(group); });
    if (!entries.length) throw new Error('没有找到可导入的分项备份');
    var seen = Object.create(null);
    var duplicateParts = [];
    entries.forEach(function(entry){
      if (seen[entry.part]) duplicateParts.push(BACKUP_PART_META[entry.part].label);
      seen[entry.part] = true;
    });
    if (duplicateParts.length) throw new Error('同一模块选择了多份备份：' + Array.from(new Set(duplicateParts)).join('、') + '。请每个模块只保留一份。');

    var labels = entries.map(function(entry){ return BACKUP_PART_META[entry.part].label; });
    var uniqueLabels = Array.from(new Set(labels));
    return islandConfirm(
      '将导入 ' + entries.length + ' 个分项备份：' + uniqueLabels.join('、') +
      '。这些模块会覆盖当前对应数据，未选模块不会改变。完成后软件会自动重启。是否继续？',
      {title:'导入分项备份', confirmText:'导入'}
    ).then(function(ok){
      if (!ok) return;
      return entries.reduce(function(chain, entry){
        return chain.then(function(){
          return applyPartialBackup(entry.part, entry.data).then(function(saved){
            if (!saved) throw new Error(BACKUP_PART_META[entry.part].label + '写入失败');
          });
        });
      }, Promise.resolve()).then(function(){
        location.reload();
      });
    });
  }).catch(function(err){
    console.error('[岛屿] 批量分项备份导入失败：', err);
    toast(err && err.message ? err.message : '批量导入失败');
  });
}


function normalizeImportedBackup(raw){
  if (!raw || typeof raw !== 'object') throw new Error('备份文件格式不正确');
  var data = raw.kind === 'island-backup' && raw.data && typeof raw.data === 'object' ? raw.data : raw;
  var required = ['settings','chats','contacts','moments','messages','personas','userPersonas','worldbooks','stickers','memory'];
  var found = required.some(function(k){ return Object.prototype.hasOwnProperty.call(data, k); });
  if (!found) throw new Error('这不是可识别的岛屿备份文件');
  return {
    settings: data.settings && typeof data.settings === 'object' ? restoreSettingsFromBackup(data.settings) : {},
    chats: Array.isArray(data.chats) ? data.chats : [],
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    moments: Array.isArray(data.moments) ? data.moments : [],
    phoneCalls: Array.isArray(data.phoneCalls) ? data.phoneCalls : [],
    messages: data.messages && typeof data.messages === 'object' ? data.messages : {},
    personas: Array.isArray(data.personas) ? data.personas : [],
    userPersonas: Array.isArray(data.userPersonas) ? data.userPersonas : [],
    worldbooks: Array.isArray(data.worldbooks) ? data.worldbooks : [],
    stickers: data.stickers && typeof data.stickers === 'object' ? data.stickers : { activeGroupId:'', groups:[] },
    memory: data.memory && typeof data.memory === 'object' ? data.memory : {}
  };
}


function buildBackupRows(data){
  var rows = [
    { key:'island.settings', value:data.settings },
    { key:'island.chats', value:data.chats },
    { key:'island.contacts', value:data.contacts },
    { key:'island.moments', value:data.moments },
    { key:'island.phoneCalls', value:data.phoneCalls || [] },
    { key:'island.memory', value:data.memory },
    { key:'island.personas', value:data.personas },
    { key:'island.userPersonas', value:data.userPersonas },
    { key:'island.worldbooks', value:data.worldbooks },
    { key:'island.stickers', value:data.stickers }
  ];
  Object.keys(data.messages || {}).forEach(function(name){
    if (!name) return;
    rows.push({ key:'island.msg.' + name, value:Array.isArray(data.messages[name]) ? data.messages[name] : [] });
  });
  return rows;
}


function normalizePartialBackup(raw, requestedPart){
  if (!raw || typeof raw !== 'object') throw new Error('备份文件格式不正确');
  var source = raw;
  if (raw.kind === 'island-partial-backup') {
    if (raw.part !== requestedPart) throw new Error('这是“' + ((BACKUP_PART_META[raw.part] || {}).label || raw.part || '其他') + '”备份文件，请选择正确的导入模块');
    source = raw.data;
  } else if (raw.kind === 'island-backup') {
    source = raw.data;
  }
  if (!source || typeof source !== 'object') throw new Error('分项备份数据无效');
  var out = {};
  switch(requestedPart){
    case 'settings':
      if (!source.settings || typeof source.settings !== 'object' || Array.isArray(source.settings)) throw new Error('备份中没有有效的系统设置');
      out.settings = restoreSettingsFromBackup(source.settings); break;
    case 'chats':
      if (!Array.isArray(source.chats)) throw new Error('备份中没有有效的聊天列表');
      if (!source.messages || typeof source.messages !== 'object' || Array.isArray(source.messages)) throw new Error('备份中没有有效的聊天记录');
      out.chats = source.chats; out.messages = source.messages; break;
    case 'contacts':
      if (!Array.isArray(source.contacts)) throw new Error('备份中没有有效的通讯录');
      out.contacts = source.contacts; break;
    case 'moments':
      if (!Array.isArray(source.moments)) throw new Error('备份中没有有效的动态数据');
      out.moments = source.moments; break;
    case 'phoneCalls':
      if (!Array.isArray(source.phoneCalls)) throw new Error('备份中没有有效的电话记录');
      out.phoneCalls = source.phoneCalls; break;
    case 'memory':
      if (!source.memory || typeof source.memory !== 'object' || Array.isArray(source.memory)) throw new Error('备份中没有有效的记忆数据');
      out.memory = source.memory; break;
    case 'personas':
      if (!Array.isArray(source.personas)) throw new Error('备份中没有有效的角色人设');
      out.personas = source.personas; break;
    case 'userPersonas':
      if (!Array.isArray(source.userPersonas)) throw new Error('备份中没有有效的身份数据');
      out.userPersonas = source.userPersonas; break;
    case 'worldbooks':
      if (!Array.isArray(source.worldbooks)) throw new Error('备份中没有有效的世界书');
      out.worldbooks = source.worldbooks; break;
    case 'stickers':
      if (!source.stickers || typeof source.stickers !== 'object' || Array.isArray(source.stickers)) throw new Error('备份中没有有效的表情包数据');
      out.stickers = source.stickers; break;
    default: throw new Error('未知的备份模块');
  }
  return out;
}


function applyPartialBackup(part, data){
  switch(part){
    case 'settings':
      return IslandDB.set('island.settings', data.settings);
    case 'chats':
      return inspectIslandStorage().then(function(rows){
        var jobs = rows.filter(function(row){ return row && typeof row.key === 'string' && row.key.indexOf('island.msg.') === 0; }).map(function(row){ return IslandDB.remove(row.key); });
        return Promise.all(jobs).then(function(){
          var writes = [IslandDB.set('island.chats', data.chats)];
          Object.keys(data.messages || {}).forEach(function(name){
            if (name) writes.push(IslandDB.set('island.msg.' + name, Array.isArray(data.messages[name]) ? data.messages[name] : []));
          });
          return Promise.all(writes).then(function(results){ return results.every(Boolean); });
        });
      });
    case 'contacts': return IslandDB.set('island.contacts', data.contacts);
    case 'moments': return IslandDB.set('island.moments', data.moments);
    case 'phoneCalls': return IslandDB.set('island.phoneCalls', data.phoneCalls);
    case 'memory': return IslandDB.set('island.memory', data.memory);
    case 'personas': return IslandDB.set('island.personas', data.personas);
    case 'userPersonas': return IslandDB.set('island.userPersonas', data.userPersonas);
    case 'worldbooks': return IslandDB.set('island.worldbooks', data.worldbooks);
    case 'stickers': return IslandDB.set('island.stickers', data.stickers);
    default: return Promise.resolve(false);
  }
}


function importPartialBackupFile(part, file){
  if (!file) return;
  var meta = BACKUP_PART_META[part];
  if (!meta) { toast('未知的备份模块'); return; }
  var reader = new FileReader();
  reader.onload = function(){
    var raw;
    try { raw = JSON.parse(String(reader.result || '')); } catch(e) { toast('备份文件无法读取：JSON 格式错误'); return; }
    var data;
    try { data = normalizePartialBackup(raw, part); } catch(e) { toast(e.message || '分项备份文件无效'); return; }
    islandConfirm('导入“' + meta.label + '”会覆盖当前对应数据，其他数据不会改变。完成后软件会自动重启。是否继续？', {title:'导入分项备份', confirmText:'导入'}).then(function(ok){
      if (!ok) return;
      applyPartialBackup(part, data).then(function(saved){
        if (!saved) throw new Error('本机存储写入失败');
        location.reload();
      }).catch(function(err){
        console.error('[岛屿] 分项备份导入失败：', err);
        toast(meta.label + '导入失败：' + (err && err.message ? err.message : '本机存储写入失败'));
      });
    });
  };
  reader.onerror = function(){ toast('备份文件读取失败'); };
  reader.readAsText(file);
}


function importBackupFile(file){
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    var raw;
    try { raw = JSON.parse(String(reader.result || '')); } catch(e) { toast('备份文件无法读取：JSON 格式错误'); return; }
    var data;
    try { data = normalizeImportedBackup(raw); } catch(e) { toast(e.message || '备份文件无效'); return; }
    islandConfirm('导入完整备份会覆盖当前岛屿的本地数据，并在完成后重启软件。是否继续？', {title:'导入完整备份', confirmText:'导入'}).then(function(ok){
      if (!ok) return;
      IslandDB.replaceAll(buildBackupRows(data)).then(function(saved){
        if (!saved) throw new Error('本机存储写入失败');
        location.reload();
      }).catch(function(err){
        console.error('[岛屿] 备份导入失败：', err);
        toast('备份导入失败：' + (err && err.message ? err.message : '本机存储写入失败'));
      });
    });
  };
  reader.onerror = function(){ toast('备份文件读取失败'); };
  reader.readAsText(file);
}


/* ---------- 清空整个岛屿的数据 ---------- */
function wipeAllIslandData(){
  islandConfirm('确定要清空整个岛屿的数据吗？\n\n聊天、通讯录、世界书、表情包、记忆、字体和所有设置都会被删除，且无法恢复。\n建议先用上方“完整备份 → 导出”保存一份。', {title:'清空岛屿数据', confirmText:'清空', danger:true}).then(function(ok){
    if (!ok) return;
    /* 先冻结所有写入，防止待保存的内容（含退出时的兜底保存）把数据又写回去 */
    try { clearTimeout(settingsSaveTimer); settingsSaveTimer = 0; } catch(e) {}
    islandStateHydrated = false;
    IslandDB.wipeAll().then(function(done){
      if (!done) throw new Error('本机存储清空失败');
      location.reload();
    }).catch(function(err){
      console.error('[岛屿] 清空数据失败：', err);
      toast('清空失败：' + (err && err.message ? err.message : '本机存储错误'));
    });
  });
}
