/* 岛屿 · 系统通知、主动消息调度
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

function getNotificationConfig(){
  var base = { enabled:false, minInterval:60, maxInterval:240, quietStart:'23:00', quietEnd:'08:00', lastProactiveAt:0, nextProactiveAt:0, running:false };
  var src = State.settings && State.settings.notifications && typeof State.settings.notifications === 'object' ? State.settings.notifications : {};
  var n = Object.assign({}, base, src);
  n.minInterval = Math.max(5, Number(n.minInterval) || 60);
  n.maxInterval = Math.max(n.minInterval, Number(n.maxInterval) || 240);
  return n;
}

function setNotificationConfig(patch){
  State.settings.notifications = Object.assign(getNotificationConfig(), patch || {});
  scheduleSettingsSave(80);
  renderNotificationSettings();
}

var islandNativePlugin = null;

var nativeNotificationStateCache = null;

try {
  if (window.Capacitor && typeof window.Capacitor.registerPlugin === 'function' &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()) {
    islandNativePlugin = window.Capacitor.registerPlugin('IslandNative');
  }
} catch(e) {}


function getNativeNotificationState(){
  var b = islandNativePlugin;
  if (!b) return Promise.resolve(null);
  try {
    if (typeof b.getNotificationPermissionState === 'function') {
      return b.getNotificationPermissionState({}).then(function(result){
        var state = result && result.state;
        if (state === 'granted' || state === 'denied' || state === 'default') {
          nativeNotificationStateCache = state;
          return state;
        }
        return null;
      }).catch(function(){ return null; });
    }
    if (typeof b.areNotificationsEnabled === 'function') {
      return b.areNotificationsEnabled({}).then(function(result){
        var state = result && result.enabled ? 'granted' : 'denied';
        nativeNotificationStateCache = state;
        return state;
      }).catch(function(){ return null; });
    }
  } catch(e) {}
  return Promise.resolve(null);
}


function refreshNativeNotificationState(){
  return getNativeNotificationState().then(function(state){
    if (state) nativeNotificationStateCache = state;
    renderNotificationSettings();
    return state;
  });
}


function notificationPermission(){
  if (nativeNotificationStateCache) return nativeNotificationStateCache;
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission || 'default';
}

function renderNotificationSettings(){
  var n = getNotificationConfig();
  var toggle = $('notificationEnabledToggle');
  var hint = $('notificationEnabledHint');
  if (toggle) { toggle.classList.toggle('is-on', !!n.enabled); toggle.setAttribute('aria-checked', n.enabled ? 'true' : 'false'); }
  if (hint) hint.textContent = n.enabled ? '已开启' : '关闭';
  var min = $('notificationMinInterval'); if (min) min.value = String(n.minInterval);
  var max = $('notificationMaxInterval'); if (max) max.value = String(n.maxInterval);
  var qs = $('notificationQuietStart'); if (qs) qs.value = n.quietStart || '23:00';
  var qe = $('notificationQuietEnd'); if (qe) qe.value = n.quietEnd || '08:00';
  var ps = $('notificationPermissionState');
  var perm = notificationPermission();
  if (ps) ps.textContent = perm === 'granted' ? '已允许' : perm === 'denied' ? '已拒绝' : perm === 'unsupported' ? '当前环境不支持' : '未授权';
}

function requestNotificationPermission(){
  var b = islandNativePlugin;
  if (b && typeof b.getNotificationPermissionState === 'function') {
    return getNativeNotificationState().then(function(state){
      if (state === 'granted') {
        renderNotificationSettings();
        return true;
      }
      if (typeof b.requestNotificationPermission !== 'function') return false;
      return b.requestNotificationPermission({}).then(function(result){
        var next = result && result.state;
        nativeNotificationStateCache = next || null;
        renderNotificationSettings();
        if (next === 'granted') toast('通知已允许');
        else toast('通知权限未开启');
        return next === 'granted';
      }).catch(function(){
        renderNotificationSettings();
        toast('通知权限请求失败，请在系统设置中允许通知');
        return false;
      });
    });
  }
  if (typeof Notification === 'undefined') { renderNotificationSettings(); toast('当前环境没有 Notification API'); return Promise.resolve(false); }
  if (Notification.permission === 'granted') { renderNotificationSettings(); return Promise.resolve(true); }
  return Notification.requestPermission().then(function(p){ renderNotificationSettings(); if (p === 'granted') toast('通知已允许'); else toast('通知权限未开启'); return p === 'granted'; });
}

function notificationUrl(name){
  return location.href.split('#')[0].split('?')[0] + '?island=chat&name=' + encodeURIComponent(name || '');
}

function showCharacterNotification(name, text, avatar, opts){
  var title = String(name || '岛屿');
  var body = String(text || '').trim();
  var data = { island:'chat', name:title, url:notificationUrl(title) };
  /* opts.unique：每条消息使用独立 tag，系统通知逐条堆叠（像微信），而不是互相覆盖 */
  var tagValue = 'island-chat-' + title + (opts && opts.unique ? '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : '');
  var nativePromise = getNativeNotificationState();
  return nativePromise.then(function(nativeState){
    var b = islandNativePlugin;
    if (b && typeof b.showWebNotification === 'function' && nativeState === 'granted') {
      return b.showWebNotification({
        title: title,
        body: body,
        tag: tagValue,
        url: data.url
      }).then(function(result){
        return !!(result && result.shown !== false);
      }).catch(function(){ return false; });
    }
    return false;
  }).then(function(nativeShown){
    if (nativeShown) return true;
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        var n = new Notification(title, { body:body, icon:avatar || './assets/icons/icon-192.png', tag:tagValue, data:data });
        n.onclick = function(){ try { window.focus(); } catch(e){}; try { openPM(title); } catch(e){}; n.close(); };
        return true;
      }
    } catch(e){}
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      return navigator.serviceWorker.ready.then(function(reg){
        if (!reg.showNotification) return false;
        return reg.showNotification(title, { body:body, icon:avatar || './assets/icons/icon-192.png', tag:tagValue, data:data }).then(function(){ return true; }).catch(function(){ return false; });
      }).catch(function(){ return false; });
    }
    return false;
  });
}


refreshNativeNotificationState();


function inQuietHours(now){
  var n = getNotificationConfig(), cur = now.getHours()*60 + now.getMinutes();
  function mins(v){ var p=String(v||'').split(':'); return (Number(p[0])||0)*60+(Number(p[1])||0); }
  var start=mins(n.quietStart), end=mins(n.quietEnd);
  if (start === end) return false;
  return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

function randomNextProactiveAt(now){
  var n=getNotificationConfig(), min=n.minInterval*60000, max=n.maxInterval*60000;
  return now.getTime() + Math.floor(min + Math.random()*Math.max(1,max-min));
}

function getProactiveCandidate(){
  var candidates = CHATS.filter(function(c){
    if (!c || !c.name) return false;
    var list = MESSAGES[c.name] || [];
    if (!list.length) return false;
    var last = list[list.length-1];
    if (!last || last.from !== 'me') return false;
    return true;
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random()*candidates.length)];
}

function buildProactiveMessages(name){
  return prepareMemoryForContext(name).then(function(){
    var msgs = buildMessages(name);
    msgs.push({ role:'user', content:'【后台主动消息任务】现在用户没有主动发消息。请根据角色设定、最近对话、时间上下文与已经发生的聊天内容，自然地发起一条短消息。时间只用于选择合适的节奏、场景和话题；不要报时间数字，不要解释为什么主动联系，不要提及 AI、任务、后台、系统或时间变量。不得仅凭时间流逝创造已发生的现实事件。只输出角色真正会发给用户的话。' });
    return msgs;
  });
}

function runProactiveMessage(force){
  var n=getNotificationConfig();
  if (!n.enabled && !force) return Promise.resolve(false);
  if (!isApiReady()) return Promise.resolve(false);
  var now=new Date();
  if (!force && inQuietHours(now)) return Promise.resolve(false);
  if (!force && n.nextProactiveAt && now.getTime() < n.nextProactiveAt) return Promise.resolve(false);
  if (n.running) return Promise.resolve(false);
  var c=getProactiveCandidate();
  if (!c) { setNotificationConfig({nextProactiveAt:randomNextProactiveAt(now)}); return Promise.resolve(false); }
  n.running=true; setNotificationConfig({running:true});
  var name=c.name;
  return buildProactiveMessages(name).then(function(messages){ return callApiOnce(messages); }).then(function(text){
    var transferResult=processAiChatDirectives(name,text);
    var segments=splitReply(transferResult.text);
    if (!segments.length) {
      if (transferResult.changed) {
        var proactivePreview = transferResult.notices && transferResult.notices.length ? transferResult.notices.join(' · ') : '发送了新消息';
        c.preview=proactivePreview; c.time='刚刚'; c.unread=(Number(c.unread)||0)+1;
        return saveMessages(name).then(function(){return saveChats();}).then(function(){
          if (transferResult.incomingCall && transferResult.incomingCall.event) showIncomingVoiceCall(transferResult.incomingCall.event, transferResult.incomingCall.name);
          return Promise.resolve(showCharacterNotification(name, proactivePreview, c.avatar)).then(function(){return true;});
        });
      }
      return false;
    }
    if (!Array.isArray(MESSAGES[name])) MESSAGES[name]=[];
    segments.forEach(function(seg, segIndex){ var proactiveMsg={from:'them',text:seg, proactive:true, createdAt:Date.now()}; if(segIndex===0 && transferResult.replyTo) proactiveMsg.replyTo=Object.assign({},transferResult.replyTo); MESSAGES[name].push(proactiveMsg); });
    return saveMessages(name).then(function(){
      c.preview=segments[segments.length-1]; c.time='刚刚'; c.unread=(Number(c.unread)||0)+1;
      return saveChats().then(function(){
        if (transferResult.incomingCall && transferResult.incomingCall.event) showIncomingVoiceCall(transferResult.incomingCall.event, transferResult.incomingCall.name);
        return Promise.resolve(notifySegments(name, segments, c.avatar)).then(function(){ return true; });
      });
    });
  }).catch(function(err){ console.warn('[岛屿] 后台主动消息失败',err); return false; }).then(function(result){
    setNotificationConfig({running:false,lastProactiveAt:Date.now(),nextProactiveAt:randomNextProactiveAt(new Date())});
    renderChats();
    return result;
  });
}

var proactiveTimer = null;

function startProactiveScheduler(){
  clearInterval(proactiveTimer);
  proactiveTimer=setInterval(function(){ runProactiveMessage(false); }, 60000);
  setTimeout(function(){ runProactiveMessage(false); }, 3500);
}

/* 点击系统通知后直接切到对应聊天——全程不重新加载页面：
 *  · 网页 / PWA：Service Worker 只聚焦已打开的窗口并 postMessage 过来；
 *  · 安卓 APK：原生把通知链接暂存，再触发 island-native-deeplink，由这里取走；
 *  · 软件完全未运行时（冷启动）才会带着 ?island=chat&name=… 打开，处理后立刻把参数清掉，
 *    避免之后每次回到前台都重复弹出这个聊天。 */
function openNotificationTarget(name){
  name = String(name || '');
  if (!name) return;
  setTimeout(function(){ try { openPM(name); } catch(e){} }, 80);
}

function consumeNativeDeepLink(){
  var b = islandNativePlugin;
  if (!b || typeof b.consumeDeepLink !== 'function') return;
  try {
    b.consumeDeepLink({}).then(function(res){
      var url = res && res.url;
      if (!url) return;
      var name = '';
      try { name = new URL(url).searchParams.get('name') || ''; } catch(e) {}
      openNotificationTarget(name);
    }).catch(function(){});
  } catch(e){}
}

function handleNotificationDeepLink(){
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('island') === 'chat') {
      var name = q.get('name');
      try { history.replaceState(null, '', location.pathname + location.hash); } catch(e){}
      openNotificationTarget(name);
    }
  } catch(e){}
  consumeNativeDeepLink();
}

window.addEventListener('island-native-deeplink', consumeNativeDeepLink);

if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
  navigator.serviceWorker.addEventListener('message', function(e){
    var d = e && e.data;
    if (d && d.type === 'island-open-chat') openNotificationTarget(d.name);
  });
}
