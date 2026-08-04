// Keep this in step with APP_VERSION in index.html - bump both together.
const CACHE_NAME = 'flight-timer-cache-v41';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-152.png',
  './icon-167.png',
  './icon-1024.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // {cache:'reload'} bypasses the browser's own HTTP cache. Without it a
      // freshly named cache can be filled with the *old* index.html, so the
      // version bump appears to do nothing.
      cache.addAll(FILES_TO_CACHE.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Leave anything else alone - notably the cross-origin POST to the Telegram
  // relay, which must never be served from or written to a cache.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // The page itself is network-first, so a relaunch picks up a new version as
  // soon as there is signal, falling back to the cache when there is none.
  if (req.mode === 'navigate' || req.destination === 'document'){
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Icons and the manifest are cache-first; they only change with a version bump.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
