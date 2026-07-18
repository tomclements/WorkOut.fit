const CACHE_NAME = 'workout-v12';
const PRECACHE = [
  '/',
  '/index.html',
  '/workout.html',
  '/history.html',
  '/help.html',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never cache API / health
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for JS/CSS so deploys show up without hard-cache battles
  const isAsset = /\.(js|css)(\?|$)/i.test(url.pathname)
    || url.pathname.endsWith('.html')
    || url.pathname === '/';

  if (isAsset) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for icons and other static bits
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (url.origin === self.location.origin && response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
