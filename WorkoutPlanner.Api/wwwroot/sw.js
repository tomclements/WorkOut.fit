const CACHE_NAME = 'workout-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/workout.html',
  '/admin.html',
  '/css/styles.css',
  '/css/admin.css',
  '/css/workoutRunner.css',
  '/js/app.js',
  '/js/admin.js',
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

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(response => {
        // Cache same-origin static assets dynamically
        const url = new URL(event.request.url);
        if (url.origin === self.location.origin && !url.pathname.startsWith('/api/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
