// Service worker: permite abrir la app sin señal.
// - Archivos de la app: se sirven desde caché y se actualizan en segundo plano.
// - Catálogo e imágenes de ejercicios (CDN): caché en tiempo de ejecución.
// - /api nunca se cachea (los datos sin conexión los maneja data.js).
// Sube VERSION cuando cambies la lista SHELL.
const VERSION = 'v3';
const SHELL_CACHE = `gymlog-shell-${VERSION}`;
const RUNTIME_CACHE = 'gymlog-runtime';
const SHELL = [
  '/', '/css/app.css', '/manifest.webmanifest', '/vendor/d3.min.js',
  '/js/main.js', '/js/api.js', '/js/catalog.js', '/js/charts.js', '/js/data.js', '/js/plates.js',
  '/js/rest-timer.js', '/js/stats.js', '/js/strong-csv.js', '/js/ui.js',
  '/js/views/editor.js', '/js/views/exercises.js', '/js/views/history.js', '/js/views/picker.js',
  '/js/views/profile.js', '/js/views/train.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gymlog-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(cacheKey);
  const network = fetch(request)
    .then((res) => {
      if (res.ok && !res.redirected) cache.put(cacheKey, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    if (request.mode === 'navigate') {
      event.respondWith(staleWhileRevalidate(request, SHELL_CACHE, '/'));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.endsWith('/exercises.json')) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  } else if (/\.(jpg|png|webp)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
