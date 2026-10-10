(function () {
  'use strict';

  // Every setting that belongs to an API configuration: main API, secondary API,
  // speech-to-text, and vector-memory embedding / rerank APIs (plus their saved presets).
  var API_SETTING_KEYS = [
    'api', 'apiPresets', 'activeApiPresetId', 'apiQuickKeys',
    'secondaryApi', 'secondaryApiPresets', 'activeSecondaryApiPresetId', 'secondaryApiQuickKeys',
    'stt', 'sttPresets', 'activeSttPresetId', 'sttQuickKeys',
    'vectorMemory'
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { try { window.alert(msg); } catch (e) {} return; }
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-show'); }, 2600);
  }

  function currentSettings() {
    if (!window.Island || typeof window.Island.backup !== 'function') {
      throw new Error('岛屿尚未加载完成，请稍后再试');
    }
    var backup = window.Island.backup();
    return (backup && backup.data && backup.data.settings) || {};
  }

  function pickApiSettings(settings) {
    var out = {};
    var found = 0;
    API_SETTING_KEYS.forEach(function (key) {
      if (settings && Object.prototype.hasOwnProperty.call(settings, key) && settings[key] !== undefined) {
        out[key] = JSON.parse(JSON.stringify(settings[key]));
        found++;
      }
    });
    return { values: out, count: found };
  }

  function exportApiSettings() {
    try {
      var picked = pickApiSettings(currentSettings());
      if (!picked.count) { toast('没有可导出的 API 设置'); return; }
      var payload = {
        kind: 'island-api-backup',
        version: 1,
        app: '岛屿',
        exportedAt: Date.now(),
        data: picked.values
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var d = new Date();
      var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
      var a = document.createElement('a');
      a.href = url;
      a.download = 'island-backup-api-settings-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      // Inside the APK the native bridge shows its own "saved to ..." message.
      if (!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform())) {
        toast('API 设置已导出');
      }
    } catch (e) {
      toast('API 设置导出失败：' + ((e && e.message) || e));
    }
  }

  function extractImportedApiSettings(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('备份文件格式不正确');
    var source;
    if (raw.kind === 'island-api-backup') {
      source = raw.data;
    } else if (raw.data && typeof raw.data === 'object' && raw.data.settings && typeof raw.data.settings === 'object') {
      source = raw.data.settings; // full backup or "系统设置" partial backup
    } else if (raw.settings && typeof raw.settings === 'object') {
      source = raw.settings;
    } else {
      source = raw;
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('备份中没有有效的 API 设置');
    var picked = pickApiSettings(source);
    if (!picked.count) throw new Error('这个文件里没有找到 API 设置');
    return picked.values;
  }

  function applyThroughAppImporter(apiValues) {
    // Reuse the app's own "系统设置" import pipeline (same write + restart path as the
    // existing backup importer) with the current settings merged with the imported API keys.
    var input = document.getElementById('backupPartFileInput');
    if (!input) throw new Error('找不到备份导入组件');
    var merged = Object.assign({}, currentSettings(), apiValues);
    var payload = {
      kind: 'island-partial-backup',
      version: 1,
      app: '岛屿',
      part: 'settings',
      exportedAt: Date.now(),
      data: { settings: merged }
    };
    var file = new File([JSON.stringify(payload)], 'island-api-settings-import.json', { type: 'application/json' });
    var transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.setAttribute('data-import-part', 'settings');

    // Our own confirmation was already accepted; let the app's generic prompt pass through once.
    var originalConfirm = window.islandConfirm;
    window.islandConfirm = function () { window.islandConfirm = originalConfirm; return Promise.resolve(true); };
    setTimeout(function () { if (window.islandConfirm !== originalConfirm) window.islandConfirm = originalConfirm; }, 5000);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function importApiSettings(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { toast('备份文件读取失败'); };
    reader.onload = function () {
      var raw;
      try { raw = JSON.parse(String(reader.result || '')); } catch (e) { toast('备份文件无法读取：JSON 格式错误'); return; }
      var values;
      try { values = extractImportedApiSettings(raw); } catch (e) { toast((e && e.message) || 'API 备份文件无效'); return; }
      islandConfirm('将导入 API 设置（主 API、副 API、语音转文字、向量记忆与重排 API 及其预设），覆盖当前对应配置，其他数据不会改变。完成后软件会自动重启。是否继续？', {title:'导入 API 设置', confirmText:'导入'}).then(function(ok){
        if (!ok) return;
        try { applyThroughAppImporter(values); } catch (e) { toast('API 设置导入失败：' + ((e && e.message) || e)); }
      });
    };
    reader.readAsText(file);
  }

  function mount() {
    if (document.getElementById('apiBackupCard')) return;
    var fullCard = document.querySelector('.backup-full-card');
    if (!fullCard || !fullCard.parentNode) return;

    var card = document.createElement('div');
    card.className = 'backup-full-card';
    card.id = 'apiBackupCard';
    card.style.marginTop = '12px';
    card.innerHTML =
      '<div class="backup-full-copy">' +
        '<strong>API 设置</strong>' +
        '<span>单独导出或导入所有 API 配置（含 API Key，请妥善保管）</span>' +
      '</div>' +
      '<div class="backup-full-actions">' +
        '<button class="backup-action-btn" id="apiBackupImportBtn" type="button">导入</button>' +
        '<button class="backup-action-btn primary" id="apiBackupExportBtn" type="button">导出</button>' +
      '</div>';
    fullCard.parentNode.insertBefore(card, fullCard.nextSibling);

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.hidden = true;
    fileInput.id = 'apiBackupFileInput';
    card.appendChild(fileInput);

    document.getElementById('apiBackupExportBtn').addEventListener('click', exportApiSettings);
    document.getElementById('apiBackupImportBtn').addEventListener('click', function () {
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) importApiSettings(file);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

// Load the extra modules (index.html only references api-backup.js, so they are pulled in from
// here; this makes them available in both the web build and the APK):
//  - keep-alive.js : silent-audio keep-alive switch (+ Android foreground service)
//  - bg-guard.js   : AI-generation protection + per-message system notifications
(function () {
  try {
    ['keep-alive.js', 'bg-guard.js'].forEach(function (file) {
      if (document.querySelector('script[data-island-extra="' + file + '"]')) return;
      var s = document.createElement('script');
      s.src = './' + file;
      s.async = false; // keep the order: keep-alive.js first
      s.setAttribute('data-island-extra', file);
      (document.body || document.documentElement).appendChild(s);
    });
  } catch (e) {}
})();
