const CACHE_NAME = 'plan4strength-v12';
const PRECACHE = [
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/js/share.js'
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

function offlineResponse(request) {
  const accept = (request.headers.get('Accept') || '').toLowerCase();
  const isNavigation = request.mode === 'navigate' || accept.includes('text/html');
  if (isNavigation) {
    return new Response('<h1>Offline</h1><p>Plan4Strength is offline. Check your connection and try again.</p>', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/html' }
    });
  }
  return new Response('', { status: 503, statusText: 'Offline' });
}

function safeFallback(request) {
  return caches.match(request).then(cached => cached || offlineResponse(request));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Don't intercept cross-origin or range requests.
  if (url.origin !== self.location.origin) return;
  if (event.request.headers.has('range')) return;

  // API / health / build info: return JSON offline fallback.
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Network-first for JS/CSS/demos so deploys show up without hard-cache battles
  const isAsset = /\.(js|css)(\?|$)/i.test(url.pathname)
    || url.pathname.endsWith('.html')
    || url.pathname === '/'
    || url.pathname.startsWith('/demos/');

  if (isAsset) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => safeFallback(event.request))
    );
    return;
  }

  // Cache-first for icons and other static bits
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (url.origin === self.location.origin && response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => safeFallback(event.request));
    })
  );
});
