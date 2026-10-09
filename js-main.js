/* 岛屿 · 启动入口：事件绑定总调度、init、对外接口、Service Worker 注册
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 启动层由 CSS 动画自行淡出（约 3.15s），这里只做兜底移除，避免异常情况下遮挡界面。 */
setTimeout(function(){ var boot = $('boot'); if (boot) boot.style.display = 'none'; }, 3500);

function bindSafetyEvents(){

  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') flushSafetyState();
  });
  window.addEventListener('pagehide', function(){ flushSafetyState(); });
  window.addEventListener('unhandledrejection', function(e){
    var reason = e && e.reason;
    if (reason && reason.code === 'ISLAND_STORAGE_ERROR') notifyStorageError(reason);
  });
}


var _storageErrorToastAt = 0;

function notifyStorageError(err){
  var now = Date.now();
  if (now - _storageErrorToastAt < 5000) return;
  _storageErrorToastAt = now;
  console.error('[岛屿] 本机数据保存失败：', err);
  try { toast('本机数据保存失败，请检查存储空间后再关闭应用'); } catch(e) {}
}


function flushSafetyState(){
  if (!islandStateHydrated) return Promise.resolve(false);
  var jobs = [saveSettings(), saveChats(), saveContacts(), saveMoments(), savePhoneCalls(), savePersonas(), saveUserPersonas(), saveWorldbooks(), saveStickers()];
  if (currentName && Array.isArray(MESSAGES[currentName])) jobs.push(saveMessages(currentName));
  return Promise.all(jobs).then(function(){ return IslandDB.flush(); }).catch(function(err){ notifyStorageError(err); return false; });
}


function init(){
  renderPlayIcon();
  applyChatAppearance();
  applyThemePreference();
  applyHomeAppearance();
  applyFontPreference();
  bindEvents();
  refreshChangelog(false);
  loadState().then(function(){
    applyChatAppearance();
    applyThemePreference();
    applyHomeAppearance();
    applyFontPreference();
    renderAll();
    refreshApiState();
    refreshSecondaryApiState();
    refreshVectorMemoryApiState();
    refreshSttState();
    renderNotificationSettings();
    startProactiveScheduler();
    handleNotificationDeepLink();
  }).catch(function(err){
    console.error('[岛屿] 数据加载失败：', err);
    State.settings = clone(DEFAULT_SETTINGS);
    normalizeApiPresetState();
    normalizeSecondaryApiPresetState();
    normalizeSttState();
    normalizeHomeAppearance();
    applyChatAppearance();
    applyThemePreference();
    applyHomeAppearance();
    applyFontPreference();
    renderAll();
    refreshApiState();
    refreshSecondaryApiState();
    refreshVectorMemoryApiState();
    refreshSttState();
  });
}


init();


window.IslandBackground = {
  tick: function(force){ return runProactiveMessage(!!force); },
  start: function(){ startProactiveScheduler(); return true; },
  status: function(){ return { hidden:document.hidden, notificationPermission:notificationPermission(), config:clone(getNotificationConfig()), apiReady:isApiReady(), chats:CHATS.length }; }
};


window.Island = {
  reset: function(){
    if (!window.confirm('确定要清除 岛屿 的所有本地数据吗？此操作不可撤销。')) return;
    IslandDB.clear().then(function(){ location.reload(); });
  },
  export: function(){
    return buildBackupPayload().data;
  },
  backup: function(){
    return buildBackupPayload();
  },
  chat: function(name, text){
    if (!isApiReady()) return Promise.reject(new Error('API 未配置'));
    return prepareMemoryForContext(name).then(function(){
      var msgs = buildMessages(name);
      msgs.push({ role: 'user', content: text });
      return callApiOnce(msgs);
    });
  },
  endpoint: function(url){ return normalizeBaseUrl(url || (getApiConfig().baseUrl)); },
  modelsEndpoint: function(url){ return normalizeModelsUrl(url || (getApiConfig().baseUrl)); },
  sttEndpoint: function(url){ return normalizeTranscriptionsUrl(url || (getSttConfig().baseUrl)); },
  notifications: { test: function(){ return requestNotificationPermission().then(function(ok){ return ok ? showCharacterNotification('岛屿','这是一条通知测试消息。') : false; }); }, runNow: function(){ return runProactiveMessage(true); }, config: function(){ return clone(getNotificationConfig()); } }
};

/* 事件绑定总调度：保持与拆分前 bindEvents 完全相同的绑定顺序。 */
function bindEvents(){
  bindHomeThemeEvents();
  bindSettingsAppearanceEvents();
  bindHomeVisibilityEvents();
  bindMusicEvents();
  bindHomeGridEvents();
  bindCalendarWidgetEvents();
  bindPolaroidEvents();
  bindHomeAppClickEvents();
  bindPhoneEvents();
  bindWorldbookEvents();
  bindChatEvents();
  bindSettingsApiEvents();
  bindChatPersonaEvents();
  bindSafetyEvents();
}

// PWA service worker
if ('serviceWorker' in navigator) {
window.addEventListener('load', function () {
  navigator.serviceWorker.register('./sw.js').catch(function (err) {
    console.warn('[Island PWA] Service worker registration failed:', err);
  });
});
}
