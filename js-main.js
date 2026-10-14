/* 岛屿 · 启动入口：事件绑定总调度、init、对外接口、Service Worker 注册
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 启动层由 CSS 动画自行淡出（约 3.15s），这里只做兜底移除，避免异常情况下遮挡界面。 */
setTimeout(function(){ var boot = $('boot'); if (boot) boot.style.display = 'none'; }, 3500);
/* 淡出前先让启动画面里循环播放的小动画（雾气、星光、飞鸟、涟漪）定格：这些是主线程动画，定格后淡出更顺。 */
setTimeout(function(){ var boot = $('boot'); if (boot) boot.classList.add('is-calm'); }, 2200);

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


/* 存档读完后的数据保护：① 申请持久化存储；② 若本次启动是从安全快照自动恢复的，提示一下；
 * ③ 每 24 小时在空闲时拍一次整库安全快照（更新前还会另拍一张）。 */
function protectStorageAfterLoad(){
  try { IslandDB.requestPersistent(); } catch(e) {}
  try {
    var n = IslandDB.recoveredCount();
    if (n > 0) setTimeout(function(){ toast('检测到本地数据异常为空，已从安全快照恢复 ' + n + ' 项'); }, 4200);
  } catch(e) {}
  setTimeout(function(){
    try {
      var last = Number(localStorage.getItem('island.snapshot.dailyAt') || 0);
      if (Date.now() - last < 24 * 3600 * 1000) return;
      IslandDB.snapshot('daily').then(function(ok){ if (ok) { try { localStorage.setItem('island.snapshot.dailyAt', String(Date.now())); } catch(e) {} } });
    } catch(e) {}
  }, 15000);
}

function init(){
  renderPlayIcon();
  applyChatAppearance();
  applyThemePreference();
  applyHomeAppearance();
  applyFontPreference();
  bindEvents();
  /* 更新日志同步不急：等启动动画结束再拉取并重绘，免得和动画抢主线程 */
  setTimeout(function(){ refreshChangelog(false); }, 3400);
  /* 启动层动画期间尽量别让主线程连续跑太久：每一段重活之间让出一帧，动画不再被"一口气"卡住。 */
  loadState().then(function(){
    protectStorageAfterLoad();
    HOME_ICONS_READY = true;
    applyChatAppearance();
    applyThemePreference();
    applyHomeAppearance();
    applyFontPreference();
    return yieldToPaint();
  }).then(function(){
    /* 主屏幕要用的内容已经画好；其余 App 的列表、API 状态等要等启动层淡出结束后再处理（它们此刻看不见） */
    return new Promise(function(resolve){ runOutsideBootFade(resolve); });
  }).then(function(){
    renderAll();
    return yieldToPaint();
  }).then(function(){
    refreshApiState();
    refreshSecondaryApiState();
    refreshVectorMemoryApiState();
    refreshSttState();
    renderNotificationSettings();
    return yieldToPaint();
  }).then(function(){
    startProactiveScheduler();
    handleNotificationDeepLink();
  }).catch(function(err){
    console.error('[岛屿] 数据加载失败：', err);
    State.settings = clone(DEFAULT_SETTINGS);
    HOME_ICONS_READY = true;
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
    islandConfirm('确定要清除 岛屿 的所有本地数据吗？此操作不可撤销。', {title:'清除所有数据', confirmText:'清除', danger:true}).then(function(ok){
      if (!ok) return;
      IslandDB.clear().then(function(){ location.reload(); });
    });
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
  IslandUpdate.bind();
}

// PWA service worker
if ('serviceWorker' in navigator) {
window.addEventListener('load', function () {
  /* 注册并预缓存 60 多个文件很吃网络和 CPU：等启动动画播完再做 */
  setTimeout(function () {
    navigator.serviceWorker.register('./sw.js').catch(function (err) {
      console.warn('[Island PWA] Service worker registration failed:', err);
    });
  }, 3800);
});
}
