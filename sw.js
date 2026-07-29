// Productivity App service worker
//
// VERSION — bump this string every time you deploy a change, so browsers
// that already have this app installed pick up the new version instead of
// silently continuing to run the old cached one. This is the #1 fix for
// "my GitHub Pages update isn't showing up."
const SW_VERSION = 'v10';
const CACHE_NAME = `productivityapp-shell-${SW_VERSION}`;

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
  self.skipWaiting(); // don't wait for old tabs to close — activate immediately
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim(); // take control of already-open tabs right away
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests for the app shell.
  // Everything else (all the live weather/news APIs and proxies, which are
  // all cross-origin) is left alone entirely — never intercepted.
  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  const isHTML = event.request.mode === 'navigate' ||
                 (event.request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first for the app page itself: always try to get the latest
    // version when online (this is what actually prevents "stale version
    // still running" after you push an update) — only fall back to the
    // cached copy if there's genuinely no network.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(()=>{});
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest) — these rarely change,
  // so instant-from-cache is the right tradeoff, and a version bump above
  // still forces a fresh copy of everything on the next deploy.
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
