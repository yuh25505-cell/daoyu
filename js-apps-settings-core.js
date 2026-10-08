/* 岛屿 · 设置 · App 入口、面板切换、更新日志、本机存储
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var settingsApp = $('settingsApp');

function openSettingsApp(){
  if (!settingsApp) return;
  releaseInputFocus();
  closeChatApp();
  settingsApp.classList.add('is-open');
  settingsApp.setAttribute('aria-hidden', 'false');
  switchSettingsPanel('main');
}

function closeSettingsApp(){
  if (!settingsApp) return;
  releaseInputFocus();
  closeModelSheet();
  settingsApp.classList.remove('is-open');
  settingsApp.setAttribute('aria-hidden', 'true');
  switchSettingsPanel('main');
}

function escapeChangelogHTML(value){
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatChangelogDate(date){
  var m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (m[1]+'.'+m[2]+'.'+m[3]) : String(date||'');
}

function renderChangelogEntries(entries){
  var el=$('islandChangelog');
  if(!el || !Array.isArray(entries)) return false;
  var rows=entries.map(function(entry,index){
    return {
      date:String(entry&&entry.date||''),
      number:(entry&&Number.isFinite(Number(entry.number)))?Number(entry.number):null,
      title:String(entry&&entry.title||''),
      body:String(entry&&entry.body||''),
      sourceIndex:index
    };
  }).filter(function(entry){ return entry.title || entry.body; });
  rows.sort(function(a,b){
    var d=b.date.localeCompare(a.date); if(d) return d;
    var an=a.number!==null, bn=b.number!==null;
    if(an&&bn&&a.number!==b.number) return a.number-b.number;
    if(an!==bn) return an?-1:1;
    return a.sourceIndex-b.sourceIndex;
  });
  var groups=[];
  rows.forEach(function(entry){
    var last=groups[groups.length-1];
    if(!last || last.date!==entry.date) groups.push({date:entry.date,entries:[entry]});
    else last.entries.push(entry);
  });
  if(!groups.length){
    el.innerHTML='<div class="storage-empty">暂无更新日志。</div>';
    return true;
  }
  el.innerHTML=groups.map(function(group){
    return '<section class="changelog-day" data-date="'+escapeChangelogHTML(group.date)+'">'+
      '<div class="changelog-day-head">'+escapeChangelogHTML(formatChangelogDate(group.date))+'</div>'+
      '<div class="changelog-day-list">'+
        group.entries.map(function(entry,index){
          return '<article class="changelog-item">'+
            '<h3><span class="changelog-index">'+(index+1)+'.</span>'+escapeChangelogHTML(entry.title)+'</h3>'+
            '<p>'+escapeChangelogHTML(entry.body)+'</p>'+
          '</article>';
        }).join('')+
      '</div></section>';
  }).join('');
  return true;
}

var _changelogRefreshPromise=null;

function refreshChangelog(force){
  var el=$('islandChangelog');
  if(!el) return Promise.resolve(false);
  if(!force && el.dataset.changelogLoaded==='1') return Promise.resolve(true);
  if(_changelogRefreshPromise) return _changelogRefreshPromise;
  var source=el.getAttribute('data-changelog-source') || 'changelog.json';
  var url=source + (source.indexOf('?')>=0?'&':'?') + '_ts=' + Date.now();
  _changelogRefreshPromise=fetch(url,{cache:'no-store'}).then(function(resp){
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    return resp.json();
  }).then(function(data){
    if(!Array.isArray(data)) throw new Error('更新日志格式无效');
    renderChangelogEntries(data);
    el.dataset.changelogLoaded='1';
    el.dataset.changelogSyncedAt=String(Date.now());
    return true;
  }).catch(function(err){
    console.warn('[岛屿] 更新日志同步失败，继续使用构建时内容：',err);
    return false;
  }).then(function(result){ _changelogRefreshPromise=null; return result; });
  return _changelogRefreshPromise;
}

function switchSettingsPanel(name){
  releaseInputFocus();
  $$('.settings-panel').forEach(function(p){ p.classList.toggle('is-active', p.dataset.panel === name); });
  if (name === 'api') refreshApiState();
  if (name === 'secondaryApi') refreshSecondaryApiState();
  if (name === 'main' || name === 'vectorMemoryApi' || name === 'vectorRerankApi') refreshVectorMemoryApiState();
  if (name === 'stt') refreshSttState();
  if (name === 'about') refreshChangelog(true);
}

function refreshSecondaryApiState(){
  var c = getSecondaryApiConfig();
  var el = $('secondaryApiState');
  if (!el) return;
  if (c && String(c.baseUrl || '').trim() && String(c.apiKey || '').trim() && String(c.model || '').trim()) { el.textContent = '已配置'; el.classList.add('ok'); el.classList.remove('err'); }
  else { el.textContent = '未配置'; el.classList.remove('ok','err'); }
}


function refreshSttState(){
  var el = $('sttState'); if (!el) return;
  var c = getSttConfig();
  if (isSttReady()) { el.textContent = '已启用'; el.classList.add('ok'); el.classList.remove('err'); }
  else if (c && c.baseUrl && c.apiKey && c.model) { el.textContent = '已配置'; el.classList.remove('ok','err'); }
  else { el.textContent = '未配置'; el.classList.remove('ok','err'); }
}


function formatBytes(bytes){
  bytes = Math.max(0, Number(bytes) || 0);
  if (bytes < 1024) return Math.round(bytes) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
}


function estimateJsonBytes(value){
  try { return new Blob([JSON.stringify(value == null ? null : value)]).size; } catch(e){ return 0; }
}


function isEmptyPersistedValue(value){
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}


function inspectIslandStorage(){
  return IslandDB.list().then(function(rows){
    rows = Array.isArray(rows) ? rows : [];
    /* 存储页只展示有实际内容的数据，空数组、空对象、空文本不再占一个“数据项”。 */
    rows = rows.filter(function(row){ return row && typeof row.key === 'string' && row.key.trim() && !isEmptyPersistedValue(row.value); });
    rows.forEach(function(row){ row.__bytes = estimateJsonBytes(row.value) + estimateJsonBytes(row.key); });
    rows.sort(function(a,b){ return (b.__bytes || 0) - (a.__bytes || 0); });
    return rows;
  });
}


function clearEmptyIslandData(){
  return IslandDB.list().then(function(rows){
    rows = Array.isArray(rows) ? rows : [];
    var empty = rows.filter(function(row){
      return row && typeof row.key === 'string' && (!row.key.trim() || isEmptyPersistedValue(row.value));
    });
    return Promise.all(empty.map(function(row){ return IslandDB.remove(row.key); })).then(function(){
      return IslandDB.flush().then(function(){
        renderIslandStorage();
        toast(empty.length ? ('已清理 ' + empty.length + ' 个空数据项') : '没有可清理的空数据');
        return empty.length;
      });
    });
  }).catch(function(err){
    console.error('[岛屿] 清理空数据失败：', err);
    toast('清理失败：本机存储暂不可用');
    throw err;
  });
}


function renderIslandStorage(){
  return inspectIslandStorage().then(function(rows){
    var list = $('storageList');
    var usage = rows.reduce(function(n,row){ return n + (row.__bytes || 0); }, 0);
    if ($('storageUsage')) $('storageUsage').textContent = formatBytes(usage);
    if ($('storageItemCount')) $('storageItemCount').textContent = String(rows.length);
    if (list) {
      if (!rows.length) list.innerHTML = '<div class="storage-empty">岛屿 当前没有可识别的持久化数据。</div>';
      else list.innerHTML = rows.map(function(row){
        var rawKey = String(row.key || '');
        var labelMap = {
          'island.settings': '系统设置',
          'island.chats': '聊天列表',
          'island.contacts': '通讯录',
          'island.moments': '动态',
          'island.phoneCalls': '通话记录',
          'island.memory': '记忆数据',
          'island.personas': '角色人设',
          'island.userPersonas': '我的身份',
          'island.worldbooks': '世界书',
          'island.stickers': '表情包'
        };
        var label = labelMap[rawKey] || (rawKey.indexOf('island.msg.') === 0 ? '聊天记录 · ' + rawKey.slice('island.msg.'.length) : '本地数据 · ' + rawKey);
        var count = Array.isArray(row.value) ? (' · ' + row.value.length + ' 条') : '';
        var typeText = typeof row.value === 'object' ? (Array.isArray(row.value) ? '数组' : '对象') : ({string:'文本',number:'数字',boolean:'开关'}[typeof row.value] || typeof row.value);
        return '<article class="storage-item"><div class="storage-item-head"><strong>' + escapeHTML(label) + '</strong><span>' + formatBytes(row.__bytes || 0) + '</span></div><div class="storage-item-foot"><span>' + typeText + count + '</span><span>本机存储</span></div></article>';
      }).join('');
    }
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function(info){
        var quota = Number(info.quota || 0); var browserUsage = Number(info.usage || 0);
        var quotaText = quota ? ('浏览器已用 ' + formatBytes(browserUsage) + ' / ' + formatBytes(quota)) : '浏览器存储：可用但无法读取配额';
        if ($('storageQuota')) $('storageQuota').textContent = quotaText;
        if ($('storageBar')) $('storageBar').style.width = quota ? Math.min(100, browserUsage / quota * 100).toFixed(2) + '%' : '0%';
      }).catch(function(){ if ($('storageQuota')) $('storageQuota').textContent = '浏览器存储：暂不可用'; });
    }
    return null;
  }).catch(function(err){
    console.error('[岛屿] 读取存储列表失败：', err);
    if ($('storageUsage')) $('storageUsage').textContent = '读取失败';
    if ($('storageItemCount')) $('storageItemCount').textContent = '—';
    if ($('storageList')) $('storageList').innerHTML = '<div class="storage-empty">本机存储暂时无法读取，请不要继续进行导入/清理操作。</div>';
    if ($('storageQuota')) $('storageQuota').textContent = '浏览器存储：暂不可用';
    return null;
  });
}

function bindSettingsAppearanceEvents(){
  var appearanceBack = $$('.js-appearance-back');
  appearanceBack.forEach(function(btn){ btn.addEventListener('click', function(){ switchSettingsPanel('main'); }); });
  var appearanceOpen = $('openAppearance');
  if (appearanceOpen) appearanceOpen.addEventListener('click', function(){ switchSettingsPanel('appearance'); renderThemeOptions(); });
  var islandAboutOpen = $('openIslandAbout');
  if (islandAboutOpen) islandAboutOpen.addEventListener('click', function(){ switchSettingsPanel('about'); refreshChangelog(true); });
  var fontsOpen = $('openFonts');
  if (fontsOpen) fontsOpen.addEventListener('click', function(){ switchSettingsPanel('fonts'); renderFontSettings(); });
  $$('.js-fonts-back').forEach(function(btn){ btn.addEventListener('click', function(){ switchSettingsPanel('main'); }); });
  var fontResetBtn = $('fontResetBtn'); if (fontResetBtn) fontResetBtn.addEventListener('click', resetFont);
  var fontSystemBtn = $('fontSystemBtn'); if (fontSystemBtn) fontSystemBtn.addEventListener('click', resetFont);
  var fontFileBtn = $('fontFileBtn'); var fontFileInput = $('fontFileInput');
  if (fontFileBtn && fontFileInput) fontFileBtn.addEventListener('click', function(){ releaseInputFocus(); fontFileInput.click(); });
  if (fontFileInput) fontFileInput.addEventListener('change', function(){ var file=fontFileInput.files && fontFileInput.files[0]; if(file) importFontFile(file); fontFileInput.value=''; });
  var fontUrlAddBtn = $('fontUrlAddBtn'); var fontUrlInput = $('fontUrlInput');
  if (fontUrlAddBtn && fontUrlInput) fontUrlAddBtn.addEventListener('click', function(){ importFontUrl(fontUrlInput.value); fontUrlInput.value=''; releaseInputFocus(); });
  if (fontUrlInput) fontUrlInput.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); if(fontUrlAddBtn) fontUrlAddBtn.click(); } });
  var fontLibrary = $('fontLibrary');
  if (fontLibrary) fontLibrary.addEventListener('click', function(e){ var apply=e.target.closest('[data-font-apply]'); if(apply){ activateFont(apply.dataset.fontApply); return; } var del=e.target.closest('[data-font-delete]'); if(del){ deleteFont(del.dataset.fontDelete); return; } });
  var fontSizeRange = $('fontSizeRange');
  if (fontSizeRange) fontSizeRange.addEventListener('input', function(){ var cfg=getFontConfig(); cfg.sizeScale=Number(fontSizeRange.value)/100; applyFontPreference(); scheduleSettingsSave(0); });
  var fontWeightRange = $('fontWeightRange');
  if (fontWeightRange) fontWeightRange.addEventListener('input', function(){ var cfg=getFontConfig(); cfg.weight=Number(fontWeightRange.value); applyFontPreference(); scheduleSettingsSave(0); });
  var islandStorageOpen = $('openIslandStorage');
  if (islandStorageOpen) islandStorageOpen.addEventListener('click', function(){ switchSettingsPanel('storage'); renderIslandStorage(); });
  $$('.js-about-back').forEach(function(btn){ btn.addEventListener('click', function(){ switchSettingsPanel('main'); }); });
  $$('.js-storage-back').forEach(function(btn){ btn.addEventListener('click', function(){ switchSettingsPanel('main'); }); });
  var refreshStorage = $('refreshStorage');
  if (refreshStorage) refreshStorage.addEventListener('click', renderIslandStorage);
  var clearIslandCache = $('clearIslandCache');
  if (clearIslandCache) clearIslandCache.addEventListener('click', clearEmptyIslandData);
  var exportBackupBtn = $('exportBackupBtn');
  if (exportBackupBtn) exportBackupBtn.addEventListener('click', downloadBackup);
  var importBackupBtn = $('importBackupBtn');
  var backupFileInput = $('backupFileInput');
  if (importBackupBtn && backupFileInput) {
    importBackupBtn.addEventListener('click', function(){ releaseInputFocus(); backupFileInput.click(); });
    backupFileInput.addEventListener('change', function(){
      var file = backupFileInput.files && backupFileInput.files[0];
      if (file) importBackupFile(file);
      backupFileInput.value = '';
    });
  }
  var backupPartFileInput = $('backupPartFileInput');
  if (backupPartFileInput) {
    $$('[data-backup-part]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var part = btn.getAttribute('data-backup-part');
        var isImport = btn.classList.contains('js-backup-import');
        if (isImport) {
          releaseInputFocus();
          backupPartFileInput.setAttribute('data-import-part', part || '');
          backupPartFileInput.click();
        } else {
          downloadPartialBackup(part);
        }
      });
    });
    backupPartFileInput.addEventListener('change', function(){
      var file = backupPartFileInput.files && backupPartFileInput.files[0];
      var part = backupPartFileInput.getAttribute('data-import-part') || '';
      if (file && part) importPartialBackupFile(part, file);
      backupPartFileInput.value = '';
      backupPartFileInput.removeAttribute('data-import-part');
    });
  }

  var backupPartSelectAllBtn = $('backupPartSelectAllBtn');
  if (backupPartSelectAllBtn) backupPartSelectAllBtn.addEventListener('click', toggleAllBackupPartSelection);
  $$('.js-backup-part-select').forEach(function(input){
    input.addEventListener('change', updateBackupPartSelectionUI);
  });
  updateBackupPartSelectionUI();

  var backupSelectedExportBtn = $('backupSelectedExportBtn');
  if (backupSelectedExportBtn) backupSelectedExportBtn.addEventListener('click', downloadSelectedPartialBackups);

  var backupPartBatchImportBtn = $('backupPartBatchImportBtn');
  var backupPartBatchFileInput = $('backupPartBatchFileInput');
  if (backupPartBatchImportBtn && backupPartBatchFileInput) {
    backupPartBatchImportBtn.addEventListener('click', function(){
      releaseInputFocus();
      backupPartBatchFileInput.click();
    });
    backupPartBatchFileInput.addEventListener('change', function(){
      var files = backupPartBatchFileInput.files;
      if (files && files.length) importSelectedPartialBackupFiles(files);
      backupPartBatchFileInput.value = '';
    });
  }
  var appearanceOpenFromChat = $('openAppearanceFromChat');
  if (appearanceOpenFromChat) appearanceOpenFromChat.addEventListener('click', function(){ openChatAppearance(); });
  $$('#themeMenu .theme-option').forEach(function(btn){
    btn.addEventListener('click', function(){ setThemePreference(btn.dataset.themeChoice); });
  });

  $$('[data-home-icon-theme]').forEach(function(btn){
    btn.addEventListener('click', function(){ setHomeIconOption('theme', btn.dataset.homeIconTheme); });
  });
  $$('[data-home-icon-shape]').forEach(function(btn){
    btn.addEventListener('click', function(){ setHomeIconOption('shape', btn.dataset.homeIconShape); });
  });
  $$('[data-home-icon-size]').forEach(function(btn){
    btn.addEventListener('click', function(){ setHomeIconOption('size', btn.dataset.homeIconSize); });
  });
  var dockRadiusRange = $('dockRadiusRange');
  if (dockRadiusRange) {
    dockRadiusRange.addEventListener('input', function(){ setDockSetting('radius', dockRadiusRange.value); });
    dockRadiusRange.addEventListener('change', function(){ saveSettings(); });
  }
  var dockTransparencyRange = $('dockTransparencyRange');
  if (dockTransparencyRange) {
    dockTransparencyRange.addEventListener('input', function(){ setDockSetting('transparency', dockTransparencyRange.value); });
    dockTransparencyRange.addEventListener('change', function(){ saveSettings(); });
  }
  var dockRadiusLock = $('dockRadiusLock');
  if (dockRadiusLock) dockRadiusLock.addEventListener('click', function(){ setDockLock('radius', !normalizeHomeAppearance().dockRadiusLocked); });
  var dockTransparencyLock = $('dockTransparencyLock');
  if (dockTransparencyLock) dockTransparencyLock.addEventListener('click', function(){ setDockLock('transparency', !normalizeHomeAppearance().dockTransparencyLocked); });
  var dimDarkWallpaperAmount = $('dimDarkWallpaperAmount');
  if (dimDarkWallpaperAmount) {
    dimDarkWallpaperAmount.addEventListener('input', function(){ setDimDarkAmount('wallpaper', dimDarkWallpaperAmount.value); });
    dimDarkWallpaperAmount.addEventListener('change', function(){ saveSettings(); });
  }
  var dimDarkIconAmount = $('dimDarkIconAmount');
  if (dimDarkIconAmount) {
    dimDarkIconAmount.addEventListener('input', function(){ setDimDarkAmount('icon', dimDarkIconAmount.value); });
    dimDarkIconAmount.addEventListener('change', function(){ saveSettings(); });
  }
  var dimDarkWallpaperLock = $('dimDarkWallpaperLock');
  if (dimDarkWallpaperLock) dimDarkWallpaperLock.addEventListener('click', function(){ setDimDarkLock('wallpaper', !normalizeHomeAppearance().dimDarkWallpaperLocked); });
  var dimDarkIconLock = $('dimDarkIconLock');
  if (dimDarkIconLock) dimDarkIconLock.addEventListener('click', function(){ setDimDarkLock('icon', !normalizeHomeAppearance().dimDarkIconLocked); });
  var dimDarkWallpaperToggle = $('dimDarkWallpaperToggle');
  if (dimDarkWallpaperToggle) dimDarkWallpaperToggle.addEventListener('click', function(){ setDimDarkWallpaper(!normalizeHomeAppearance().dimDarkWallpaper); });
  var homeIconLabelsToggle = $('homeIconLabelsToggle');
  if (homeIconLabelsToggle) homeIconLabelsToggle.addEventListener('click', function(){ setHomeIconLabels(!normalizeHomeAppearance().iconLabels); });
  var wallpaperUploadBtn = $('wallpaperUploadBtn');
  var wallpaperInput = $('wallpaperInput');
  if (wallpaperUploadBtn && wallpaperInput) {
    wallpaperUploadBtn.addEventListener('click', function(){ wallpaperInput.click(); });
    wallpaperInput.addEventListener('change', function(){ handleWallpaperFile(wallpaperInput.files && wallpaperInput.files[0]); wallpaperInput.value = ''; });
  }
  var iconLibrary = $('iconLibrary');
  if (iconLibrary) {
    iconLibrary.addEventListener('click', function(e){
      var upload = e.target.closest ? e.target.closest('[data-icon-upload]') : null;
      var clear = e.target.closest ? e.target.closest('[data-icon-clear]') : null;
      if (upload) {
        var targetName = upload.getAttribute('data-icon-upload');
        var input = null;
        iconLibrary.querySelectorAll('[data-icon-input]').forEach(function(candidate){ if (candidate.getAttribute('data-icon-input') === targetName) input = candidate; });
        if (input) input.click();
        return;
      }
      if (clear) clearHomeAppIcon(clear.getAttribute('data-icon-clear'));
    });
    iconLibrary.addEventListener('change', function(e){
      var input = e.target;
      if (!input || !input.matches || !input.matches('[data-icon-input]')) return;
      handleHomeAppIconFile(input.getAttribute('data-icon-input'), input.files && input.files[0]);
      input.value = '';
    });
  }
  $$('.widget-card').forEach(function(card){
    var key = card.dataset.widgetCard;
    var head = card.querySelector('.widget-card-head');
    if (head) head.addEventListener('click', function(){
      var cfg = normalizeHomeAppearance().widgets[key];
      if (cfg) setWidgetEnabled(key, !cfg.enabled);
    });
    card.querySelectorAll('[data-widget-size]').forEach(function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); setWidgetSize(key, btn.dataset.widgetSize); });
    });
  });
  $$('.js-chat-appearance-back').forEach(function(btn){ btn.addEventListener('click', closeChatAppearance); });
  $$('.chat-theme-option').forEach(function(btn){
    btn.addEventListener('click', function(){ setChatAppearance(btn.dataset.chatAppearanceChoice); });
  });
}

registerApp('设置', function(){ openSettingsApp(); });
