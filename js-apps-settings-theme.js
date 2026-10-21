/* 岛屿 · 设置 · 外观主题导出 / 导入
 * 主题文件（.json）只包含主屏幕桌面的装修：壁纸、图标主题与自定义图标、Dock、图标名称、屏幕比例、
 * 小组件样式，日历 / 音乐 / 拍立得组件里的照片与文字，以及第二页桌面（照片 / 天气背景 / ins 消息文字与时间戳 / 组件开关 / 9 个应用的自定义图标）（本地图片以内嵌方式保存，图床链接原样保存）。
 * 不包含系统主题（日间 / 夜间）、聊天外观、字体，也不包含聊天、API、铃声等任何其他数据。
 * 导入时只覆盖主屏幕外观，立即生效，不需要重启。
 * 所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var IslandTheme = (function(){
  var KIND = 'island-theme';
  var MAX_FILE_BYTES = 40 * 1024 * 1024;
  var IMAGE_HOME_KEYS = ['wallpaperData', 'calendarPhoto', 'musicCover', 'polaroidPhoto', 'photo2Photo', 'weather2Bg'];

  function toastSafe(msg){ try { toast(msg); } catch(e) {} }
  function plain(o){ return JSON.parse(JSON.stringify(o)); }

  /* ---------- 导出 ---------- */
  function buildThemePayload(){
    var home = plain(normalizeHomeAppearance());
    return {
      kind: KIND,
      version: 1,
      app: '岛屿',
      exportedAt: Date.now(),
      data: {
        homeAppearance: home
      }
    };
  }

  function exportTheme(){
    try {
      var payload = buildThemePayload();
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var d = new Date();
      var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
      var a = document.createElement('a');
      a.href = url;
      a.download = 'island-theme-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
      /* APK 里由原生桥自己提示“已保存到…” */
      if (!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform())) toastSafe('外观主题已导出');
    } catch(e) {
      console.error('[岛屿] 主题导出失败：', e);
      toastSafe('主题导出失败：' + ((e && e.message) || e));
    }
  }

  /* ---------- 导入 ---------- */
  function extract(raw){
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('文件格式不正确');
    if (raw.kind !== KIND) throw new Error('这不是岛屿的外观主题文件');
    var d = raw.data;
    if (!d || typeof d !== 'object') throw new Error('主题文件里没有内容');
    return d;
  }

  /* 主题文件来自外部：图片只接受本地内嵌的 data:image 或 http(s) 图床直链，其他值一律丢弃，防止奇怪的内容写进样式 */
  function cleanHome(src){
    var h = src && typeof src === 'object' && !Array.isArray(src) ? plain(src) : {};
    IMAGE_HOME_KEYS.forEach(function(k){ h[k] = isImageSrc(h[k]) ? h[k] : ''; });
    var icons = {};
    if (h.iconData && typeof h.iconData === 'object') {
      Object.keys(h.iconData).forEach(function(name){ if (isImageSrc(h.iconData[name])) icons[name] = h.iconData[name]; });
    }
    h.iconData = icons;
    return h;
  }

  function summarize(d){
    if (!d.homeAppearance || typeof d.homeAppearance !== 'object') return '';
    var h = d.homeAppearance, bits = ['图标 / Dock / 小组件样式'];
    if (isImageSrc(h.wallpaperData)) bits.unshift('壁纸');
    if (h.iconData && Object.keys(h.iconData).some(function(k){ return isImageSrc(h.iconData[k]); })) bits.push('自定义图标');
    if (['calendarPhoto', 'musicCover', 'polaroidPhoto', 'photo2Photo', 'weather2Bg'].some(function(k){ return isImageSrc(h[k]); }) || h.polaroidCaption) bits.push('组件照片与文字');
    if (h.widgets && (h.widgets.photo2 || h.widgets.weather2 || h.widgets.ins2) || h.ins2Text || h.insR2Text || h.ins2Time || h.insR2Time) bits.push('第二页桌面');
    return bits.join('、');
  }

  function applyTheme(d){
    State.settings.homeAppearance = cleanHome(d.homeAppearance);
    normalizeHomeAppearance();
  }

  function refreshUI(){
    try { applyHomeAppearance(); renderHomeAppearanceOptions(); } catch(e) {}
  }

  function importTheme(file){
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { toastSafe('主题文件太大'); return; }
    var reader = new FileReader();
    reader.onerror = function(){ toastSafe('主题文件读取失败'); };
    reader.onload = function(){
      var raw, d;
      try { raw = JSON.parse(String(reader.result || '')); } catch(e) { toastSafe('主题文件无法读取：JSON 格式错误'); return; }
      try { d = extract(raw); } catch(e) { toastSafe((e && e.message) || '主题文件无效'); return; }
      var what = summarize(d);
      if (!what) { toastSafe('这个主题文件里没有可导入的桌面设置'); return; }
      islandConfirm('将导入主屏幕桌面：' + what + '。\n\n会覆盖当前桌面的壁纸、图标和组件（含组件里的照片文字）。系统日夜间主题、聊天外观、字体及聊天、API、铃声等其他数据不受影响。', { title: '导入外观主题', confirmText: '导入' }).then(function(ok){
        if (!ok) return;
        try {
          applyTheme(d);
          saveSettings().then(function(){
            refreshUI();
            toastSafe('桌面主题已应用');
          }, function(){ toastSafe('保存失败，存储空间可能不足'); });
        } catch(e) {
          console.error('[岛屿] 主题导入失败：', e);
          toastSafe('主题导入失败：' + ((e && e.message) || e));
        }
      });
    };
    reader.readAsText(file);
  }

  function bind(){
    var exp = document.getElementById('themeExportBtn');
    var imp = document.getElementById('themeImportBtn');
    var input = document.getElementById('themeFileInput');
    if (exp) exp.addEventListener('click', exportTheme);
    if (imp && input) {
      imp.addEventListener('click', function(){
        try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch(e) {}
        input.click();
      });
      input.addEventListener('change', function(){
        var file = input.files && input.files[0];
        input.value = '';
        if (file) importTheme(file);
      });
    }
  }
  document.addEventListener('DOMContentLoaded', bind);

  return { exportTheme: exportTheme, importTheme: importTheme, buildPayload: buildThemePayload };
})();
