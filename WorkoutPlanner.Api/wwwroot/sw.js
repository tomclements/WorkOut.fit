const CACHE_NAME = 'workout-v7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/workout.html',
  '/history.html',
  '/help.html',
  '/admin.html',
  '/css/styles.css',
  '/css/admin.css',
  '/css/workoutRunner.css',
  '/js/site.js',
  '/js/app.js',
  '/js/admin.js',
  '/js/history.js',
  '/js/workoutRunner.js',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
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

  // Never cache health checks or API calls
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(response => {
        if (url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
