const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `island-${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app.css',
  './jszip.min.js',
  './app.js',
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
