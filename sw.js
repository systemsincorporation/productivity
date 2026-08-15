// Productivity App service worker
//
// VERSION — bump this string every time you deploy a change, so browsers
// that already have this app installed pick up the new version instead of
// silently continuing to run the old cached one. This is the #1 fix for
// "my GitHub Pages update isn't showing up."
const SW_VERSION = 'v11';
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


/* ============================================================
   REMINDERS FROM THE SERVICE WORKER

   The page can only run timers while it is open. The service worker
   can outlive it, so the reminder queue lives in IndexedDB where the
   worker can read it without the page existing at all.

   Honest scope: the worker does not run continuously either. The
   browser wakes it for events — a periodic sync, a push, a fetch — and
   how often that happens is entirely the browser's decision. Chromium
   grants periodic sync to installed apps at roughly hourly intervals
   and skips it on battery saver; iOS Safari does not implement it.
   So this catches reminders LATE rather than never, which is the best
   any backend-less web app can honestly offer.
   ============================================================ */

const DB_NAME = 'productivityapp';
const DB_VERSION = 1;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
    // Never upgrade from here: the page owns the schema. If the worker
    // wakes before the page has ever run, there is nothing to deliver.
    req.onupgradeneeded = ()=>{ try{ req.transaction.abort(); }catch(e){} };
  });
}

async function dueReminders(){
  let db;
  try{ db = await openDB(); }catch(e){ return []; }
  if(!db.objectStoreNames.contains('reminders')) return [];
  return new Promise((resolve)=>{
    const out = [];
    const tx = db.transaction('reminders', 'readonly');
    const req = tx.objectStore('reminders').getAll();
    req.onsuccess = ()=>{
      const now = Date.now();
      for(const r of (req.result||[])){
        // A window either side: too old and it's noise rather than a
        // reminder, so it's marked done without being shown.
        if(!r.fired && r.fireAt <= now) out.push(r);
      }
      resolve(out);
    };
    req.onerror = ()=>resolve([]);
  });
}

async function markFired(ids){
  let db;
  try{ db = await openDB(); }catch(e){ return; }
  if(!db.objectStoreNames.contains('reminders')) return;
  const tx = db.transaction('reminders', 'readwrite');
  const store = tx.objectStore('reminders');
  for(const id of ids){
    const g = store.get(id);
    g.onsuccess = ()=>{
      const rec = g.result;
      if(rec){ rec.fired = true; rec.firedAt = Date.now(); store.put(rec); }
    };
  }
}

async function deliverDueReminders(){
  const due = await dueReminders();
  if(!due.length) return 0;
  const STALE_MS = 6*60*60*1000;
  const shown = [];
  for(const r of due){
    const lateBy = Date.now() - r.fireAt;
    if(lateBy > STALE_MS){ shown.push(r.id); continue; } // too old to be useful
    await self.registration.showNotification(r.title, {
      body: (lateBy > 5*60*1000 ? `(delayed) ` : '') + (r.body||''),
      tag: r.tag || r.id,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: {url: r.url || './'},
      requireInteraction: r.kind === 'event'
    });
    shown.push(r.id);
  }
  await markFired(shown);
  return shown.length;
}

self.addEventListener('periodicsync', (event)=>{
  if(event.tag === 'check-reminders'){
    event.waitUntil(deliverDueReminders());
  }
});

// Manual sync as a fallback where periodic sync isn't available.
self.addEventListener('sync', (event)=>{
  if(event.tag === 'check-reminders'){
    event.waitUntil(deliverDueReminders());
  }
});

// The page can ask the worker to check immediately — used on close.
self.addEventListener('message', (event)=>{
  if(event.data && event.data.type === 'check-reminders'){
    event.waitUntil(deliverDueReminders());
  }
});

self.addEventListener('notificationclick', (event)=>{
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async ()=>{
    const all = await clients.matchAll({type:'window', includeUncontrolled:true});
    // Focus an existing window rather than opening a duplicate.
    for(const c of all){
      if('focus' in c) return c.focus();
    }
    if(clients.openWindow) return clients.openWindow(target);
  })());
});
