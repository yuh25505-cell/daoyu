/* 岛屿 · 设置 · 字体库
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var fontBlobUrls = {};

function revokeFontUrls(){
  Object.keys(fontBlobUrls).forEach(function(id){ try { URL.revokeObjectURL(fontBlobUrls[id]); } catch(e){} });
  fontBlobUrls = {};
}

function ensureFontStyle(){
  var el = $('islandCustomFontStyle');
  if (!el) {
    el = document.createElement('style');
    el.id = 'islandCustomFontStyle';
    document.head.appendChild(el);
  }
  return el;
}

function getSafeFontName(id){ return 'IslandFont_' + String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_'); }

function fontLabel(item){ return String(item && (item.name || item.fileName || '自定义字体') || '自定义字体'); }

function applyFontPreference(){
  var cfg = getFontConfig();
  var rootStyle = document.documentElement.style;
  rootStyle.setProperty('--island-font-size-scale', String(cfg.sizeScale));
  var selectedWeight = Math.round(Number(cfg.weight));
  [300,400,500,520,550,600,650,680,700,720].forEach(function(base){
    var shifted = Math.max(100, Math.min(900, base + (selectedWeight - 400)));
    rootStyle.setProperty('--island-fw-' + base, String(shifted));
  });
  var active = cfg.items.find(function(item){ return item && item.id === cfg.activeId; }) || null;
  var style = ensureFontStyle();
  revokeFontUrls();
  var rules = [];
  var activeFamily = '';
  if (active) {
    var family = getSafeFontName(active.id);
    var src = '';
    if (active.data instanceof ArrayBuffer || ArrayBuffer.isView(active.data)) {
      try {
        var buffer = active.data instanceof ArrayBuffer ? active.data : active.data.buffer;
        var blob = new Blob([buffer], {type:'font/ttf'});
        var url = URL.createObjectURL(blob);
        fontBlobUrls[active.id] = url;
        src = 'url("' + url + '") format("truetype")';
      } catch(e) {}
    } else if (active.url) {
      src = 'url("' + String(active.url).replace(/"/g, '\\"') + '")';
    }
    if (src) {
      rules.push('@font-face{font-family:"' + family + '";font-style:normal;font-weight:100 900;font-display:swap;src:' + src + ';}');
      activeFamily = '"' + family + '"';
    }
  }
  if (activeFamily) {
    rules.push('body,button,input,textarea,select{font-family:' + activeFamily + ',-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif !important;}');
  }
  style.textContent = rules.join('\n');
  updateFontStateUI();
}

function updateFontStateUI(){
  var cfg = getFontConfig();
  var active = cfg.items.find(function(item){ return item && item.id === cfg.activeId; }) || null;
  var label = active ? fontLabel(active) : '跟随系统';
  var source = active ? (active.source === 'url' ? '字体链接' : '本地 TTF') : '跟随手机系统字体';
  var state = $('fontState'); if (state) state.textContent = label;
  var current = $('fontCurrentName'); if (current) current.textContent = label;
  var currentSource = $('fontCurrentSource'); if (currentSource) currentSource.textContent = source;
  var fileState = $('fontFileState'); if (fileState) fileState.textContent = '选择一个 .ttf 文件并保存在本机';
  var systemBtn = $('fontSystemBtn'); if (systemBtn) { systemBtn.disabled = !active; systemBtn.textContent = active ? '跟随系统' : '已启用'; }
  var sizeRange = $('fontSizeRange'); if (sizeRange) sizeRange.value = String(Math.round(cfg.sizeScale * 100));
  var sizeValue = $('fontSizeValue'); if (sizeValue) sizeValue.textContent = Math.round(cfg.sizeScale * 100) + '%';
  var weightRange = $('fontWeightRange'); if (weightRange) weightRange.value = String(cfg.weight);
  var weightValue = $('fontWeightValue'); if (weightValue) weightValue.textContent = String(cfg.weight);
}

function saveFontConfig(){ State.settings.font = getFontConfig(); return saveSettings(); }

function renderFontLibrary(){
  var list = $('fontLibrary'); if (!list) return;
  var cfg = getFontConfig();
  if (!cfg.items.length) { list.innerHTML = '<div class="font-library-empty">还没有导入自定义字体。</div>'; return; }
  list.innerHTML = cfg.items.map(function(item){
    var active = item.id === cfg.activeId;
    var name = escapeHTML(fontLabel(item));
    var source = item.source === 'url' ? '字体链接' : '本地 TTF';
    var action = active ? '<button class="font-apply-btn" type="button" disabled>已应用</button>' : '<button class="font-apply-btn" type="button" data-font-apply="' + escapeHTML(item.id) + '">应用</button>';
    return '<article class="font-card ' + (active ? 'is-active' : '') + '"><div class="font-card-head"><div class="font-card-copy"><strong>' + name + '</strong><em>' + source + '</em></div><div class="font-card-actions">' + action + '<button class="font-delete-btn" type="button" data-font-delete="' + escapeHTML(item.id) + '">删除</button></div></div><div class="font-card-preview">Aa 中文字体预览 · 岛屿 Personal AI</div></article>';
  }).join('');
}

function inferFontName(fileNameOrUrl){
  var raw = String(fileNameOrUrl || '').split(/[?#]/)[0].split('/').pop() || '自定义字体';
  raw = raw.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/i, '');
  try { raw = decodeURIComponent(raw); } catch(e) {}
  raw = raw.replace(/[._-]+/g, ' ').trim();
  return raw || '自定义字体';
}

function activateFont(id){
  var cfg = getFontConfig();
  if (!cfg.items.some(function(item){ return item && item.id === id; })) return;
  cfg.activeId = id;
  saveFontConfig().then(function(){ applyFontPreference(); renderFontLibrary(); toast('已应用字体'); });
}

function deleteFont(id){
  var cfg = getFontConfig();
  var hit = cfg.items.find(function(item){ return item && item.id === id; });
  if (!hit) return;
  if (!window.confirm('确定要删除字体“' + fontLabel(hit) + '”吗？')) return;
  cfg.items = cfg.items.filter(function(item){ return item && item.id !== id; });
  if (cfg.activeId === id) cfg.activeId = '';
  saveFontConfig().then(function(){ applyFontPreference(); renderFontLibrary(); toast('字体已删除'); });
}

function resetFont(){
  var cfg = getFontConfig();
  cfg.activeId = '';
  saveFontConfig().then(function(){ applyFontPreference(); renderFontLibrary(); toast('已恢复系统字体'); });
}

function addFontItem(item){
  var cfg = getFontConfig();
  var existing = cfg.items.find(function(it){ return it && ((item.source === 'url' && it.url === item.url) || (item.source === 'file' && it.fileName === item.fileName && it.byteLength === item.byteLength)); });
  if (existing) {
    cfg.activeId = existing.id;
    return saveFontConfig().then(function(){ applyFontPreference(); renderFontLibrary(); toast('字体已存在，已应用'); });
  }
  cfg.items.push(item);
  cfg.activeId = item.id;
  return saveFontConfig().then(function(){ applyFontPreference(); renderFontLibrary(); toast('字体已添加并应用'); });
}

function importFontFile(file){
  if (!file) return;
  if (!/\.ttf$/i.test(file.name || '') && file.type !== 'font/ttf') { toast('只支持 TTF 字体文件'); return; }
  /* 不设置应用层的 TTF 文件大小上限；实际可用大小由浏览器/Android 的本机存储配额决定。 */
  var reader = new FileReader();
  reader.onload = function(e){
    var data = e.target.result;
    if (!(data instanceof ArrayBuffer)) { toast('字体读取失败'); return; }
    addFontItem({id:genId('font_'), name:inferFontName(file.name), fileName:file.name, source:'file', data:data, byteLength:file.size, createdAt:Date.now()});
  };
  reader.onerror = function(){ toast('字体读取失败'); };
  reader.readAsArrayBuffer(file);
}

function importFontUrl(url){
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) { toast('请输入 http 或 https 字体链接'); return; }
  var name = inferFontName(url);
  var fallbackItem = {id:genId('font_'), name:name, source:'url', url:url, createdAt:Date.now()};
  fetch(url, {mode:'cors'}).then(function(resp){
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.arrayBuffer();
  }).then(function(buffer){
    fallbackItem.source='file';
    fallbackItem.data=buffer;
    fallbackItem.fileName=name + '.ttf';
    fallbackItem.byteLength=buffer.byteLength;
    return addFontItem(fallbackItem);
  }).catch(function(){
    return addFontItem(fallbackItem).then(function(){ toast('已保存字体链接；如浏览器拦截跨域字体，请使用支持 CORS 的字体链接。'); });
  });
}

function renderFontSettings(){
  applyFontPreference();
  updateFontStateUI();
  renderFontLibrary();
}
