const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `island-${CACHE_VERSION}`;
// 由 stamp-version.mjs 自动写入：每次发布内容变化，sw.js 的字节也跟着变，浏览器就能发现新版本。
const BUILD_STAMP = '1.69.2-a33aed34';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css-core-base.css',
  './css-core-shared.css',
  './css-apps-home.css',
  './css-apps-music.css',
  './css-apps-polaroid.css',
  './css-apps-home-page2.css',
  './css-apps-chat.css',
  './css-apps-phone.css',
  './css-apps-worldbook.css',
  './css-apps-settings.css',
  './css-apps-countdown.css',
  './css-apps-calendar.css',
  './css-apps-clock.css',
  './css-apps-yunian.css',
  './css-apps-gallery.css',
  './css-apps-notes.css',
  './css-apps-weather.css',
  './jszip.min.js',
  './js-core-version.js',
  './js-core-util.js',
  './js-core-storage.js',
  './js-core-state.js',
  './js-core-ui.js',
  './js-core-sounds.js',
  './js-core-notifications.js',
  './js-core-ai.js',
  './js-core-apps.js',
  './js-core-update.js',
  './js-apps-home.js',
  './js-apps-chat-language.js',
  './js-apps-chat-extras.js',
  './js-apps-chat-memory.js',
  './js-apps-chat-stickers.js',
  './js-apps-chat-render.js',
  './js-apps-chat-app.js',
  './js-apps-chat-prompt.js',
  './js-apps-chat-state.js',
  './js-apps-chat-voice.js',
  './js-apps-chat-message-actions.js',
  './js-apps-chat-messages.js',
  './js-apps-chat-session.js',
  './js-apps-chat-voicecall.js',
  './js-apps-chat-panel.js',
  './js-apps-chat-persona.js',
  './js-apps-chat-settings.js',
  './js-apps-phone.js',
  './js-apps-worldbook.js',
  './js-apps-music.js',
  './js-apps-polaroid.js',
  './js-apps-home-page2.js',
  './js-apps-settings-core.js',
  './js-apps-settings-api.js',
  './js-apps-settings-fonts.js',
  './js-apps-settings-theme.js',
  './js-apps-settings-backup.js',
  './js-apps-yunian.js',
  './js-apps-gallery.js',
  './js-apps-calendar.js',
  './js-apps-notes.js',
  './js-apps-weather.js',
  './js-apps-clock.js',
  './js-apps-countdown.js',
  './js-core-viewport.js',
  './js-core-systembars.js',
  './js-main.js',
  './js-core-swipeback.js',
  './keep-alive.js',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icons/chat.png',
  './icons/yunian.png',
  './icons/photos.png',
  './icons/calendar.png',
  './icons/notes.png',
  './icons/weather.png',
  './icons/clock.png',
  './icons/settings.png',
  './icons/phone.png',
  './icons/countdowndays.png',
  './icons/worldbook.png',
  './icons/music.png',
  './icons/xiangyu.png',
  './icons/guanlianzhanghao.png',
  './icons/luntan.png',
  './icons/wenxuecheng.png',
  './icons/qinglvkongjian.png',
  './icons/yushe.png',
  './icons/fanwaijian.png',
  './icons/meituan.png',
  './icons/xichi.png'
];

// Inside the Android APK (Capacitor serves the bundle from https://localhost) the
// files are already bundled in the app, so a service worker is unnecessary and can
// serve pages without Capacitor's injected native bridge. In that environment this
// worker removes its caches and unregisters itself instead of intercepting requests.
const IS_CAPACITOR_APP = self.location.hostname === 'localhost';

self.addEventListener('install', event => {
  if (IS_CAPACITOR_APP) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  if (IS_CAPACITOR_APP) {
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.registration.unregister())
    );
    return;
  }
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always try to read the app shell fresh. Cache Storage is only used
// as an offline fallback, and is stamped with CACHE_VERSION above so each new build
// gets its own bucket and old ones are swept in activate().
self.addEventListener('fetch', event => {
  if (IS_CAPACITOR_APP) return;
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 版本文件只走网络、不进缓存：离线时检查更新应当失败，而不是读到旧缓存谎称"已是最新"。
  if (url.pathname.endsWith('/version.json')) { event.respondWith(fetch(request)); return; }

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification && event.notification.data ? event.notification.data : {};
  const action = event.action || '';
  let url = data.url || './';
  if (data.call) {
    if (action === 'accept') url = data.acceptUrl || url;
    else if (action === 'decline') url = data.declineUrl || url;
  }
  let name = data.name || '';
  if (!name) { try { name = new URL(url, self.location.href).searchParams.get('name') || ''; } catch (_) {} }
  const call = data.call && (action === 'accept' || action === 'decline') ? action : '';
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 岛屿已经在运行：只把窗口带到前台，并告诉页面打开哪个聊天。
    // 不再 client.navigate(url)——那会让整个页面重新加载，打断正在进行的聊天 / AI 请求。
    const target = list.find(c => c.visibilityState === 'visible') || list[0];
    if (target) {
      // 拒接不需要把软件带到前台，只通知页面把来电标为已拒接
      if (call !== 'decline') { try { if ('focus' in target) await target.focus(); } catch (_) {} }
      try {
        target.postMessage({ type: 'island-open-chat', name, url, call });
        return;
      } catch (_) {}
    }
    // 软件没有在运行：拒接无事可做；其余才需要新开窗口（冷启动，页面会从 ?island=chat&name=… 读取并打开聊天）
    if (call === 'decline') return;
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
