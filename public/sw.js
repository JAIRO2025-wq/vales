const CACHE_NAME = 'valedigit-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // El evento fetch es obligatorio para que Chrome considere la app como instalable
  event.respondWith(fetch(event.request).catch(() => {
    return caches.match(event.request);
  }));
});