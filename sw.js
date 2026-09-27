const CACHE_NAME='island-v1.50';
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

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
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
