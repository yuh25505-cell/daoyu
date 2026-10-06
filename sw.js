const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `island-${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css-core-base.css',
  './css-core-shared.css',
  './css-apps-home.css',
  './css-apps-music.css',
  './css-apps-polaroid.css',
  './css-apps-chat.css',
  './css-apps-phone.css',
  './css-apps-worldbook.css',
  './css-apps-settings.css',
  './css-apps-browser.css',
  './css-apps-calendar.css',
  './css-apps-clock.css',
  './css-apps-contacts.css',
  './css-apps-gallery.css',
  './css-apps-notes.css',
  './css-apps-weather.css',
  './jszip.min.js',
  './js-core-util.js',
  './js-core-storage.js',
  './js-core-state.js',
  './js-core-ui.js',
  './js-core-notifications.js',
  './js-core-ai.js',
  './js-core-apps.js',
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
  './js-apps-phone.js',
  './js-apps-worldbook.js',
  './js-apps-music.js',
  './js-apps-polaroid.js',
  './js-apps-settings-core.js',
  './js-apps-settings-api.js',
  './js-apps-settings-fonts.js',
  './js-apps-settings-backup.js',
  './js-apps-contacts.js',
  './js-apps-gallery.js',
  './js-apps-calendar.js',
  './js-apps-notes.js',
  './js-apps-weather.js',
  './js-apps-clock.js',
  './js-apps-browser.js',
  './js-main.js',
  './keep-alive.js',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
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
  const url = data.url || './';
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      try {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && url) await client.navigate(url);
          return;
        }
      } catch (_) {}
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
