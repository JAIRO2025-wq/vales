// Service Worker para la app de Vales Digitales
// Estrategia: Network-first solo para navegaciones HTML.
// Los assets de Next.js (_next/static/*) NO se cachean porque ya tienen
// hashes únicos por build y Next.js los maneja nativamente.

const CACHE_NAME = 'valedigit-v2';

// Recursos que NUNCA deben ser interceptados por el SW
const NO_CACHE_PATTERNS = [
  /\/_next\/static\//,       // Chunks de Next.js (ya tienen hash único)
  /\/_next\/data\//,         // Data fetching de Next.js
  /\/api\//,                 // Endpoints de API
  /\/manifest\.json/,        // Manifest de PWA
  /\/icon-/,                 // Iconos de PWA
];

function shouldBypassCache(url) {
  return NO_CACHE_PATTERNS.some(pattern => pattern.test(url));
}

self.addEventListener('install', (event) => {
  // Activar inmediatamente, no esperar a que se cierren las pestañas viejas
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpiar cachés antiguas
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
      // Tomar control de todos los clientes inmediatamente
      await clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones que no sean GET
  if (request.method !== 'GET') return;

  // No interceptar recursos de Next.js, API, ni assets con hash
  if (shouldBypassCache(url.pathname)) return;

  // Solo cachear navegaciones (HTML) con estrategia network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // Guardar en caché solo si la respuesta es exitosa
          if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          // Si no hay red, servir desde caché
          const cachedResponse = await caches.match(request);
          return cachedResponse || new Response('Sin conexión', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        }
      })()
    );
  }
});
