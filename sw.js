// Productivity App service worker
// Only caches the app shell (this file, index.html, manifest, icons) for
// offline loading. Every request to a different origin — Open-Meteo,
// Hacker News, BBC, the CORS proxies, etc. — is left completely untouched
// and goes straight to the network, exactly as if there were no service
// worker at all. Intercepting cross-origin requests here would risk
// breaking those fetches (opaque responses can't be read as JSON/text),
// so this worker deliberately stays out of their way.

const CACHE_NAME = 'productivityapp-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => { /* ok if some files are missing when hosted differently */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests for the app shell.
  // Everything else (all the live weather/news APIs and proxies, which are
  // all cross-origin) is left alone entirely.
  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(()=>{});
        return res;
      }).catch(() => cached);
    })
  );
});
