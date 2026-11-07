const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const swPath = path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'sw.js');
const swSource = fs.readFileSync(swPath, 'utf8');

function makeRequest(url, method = 'GET') {
  return { url, method };
}

function makeResponse(status, body = '') {
  return {
    status,
    ok: status >= 200 && status < 300,
    clone() { return makeResponse(status, body); },
  };
}

function createMockCache() {
  const store = new Map();
  const puts = [];
  const addAllCalls = [];
  return {
    store,
    puts,
    addAllCalls,
    addAll: async (requests) => {
      addAllCalls.push(requests);
    },
    put: async (req, res) => {
      puts.push({ req, res });
      if (res.status !== 200) throw new TypeError('Cannot cache non-200 response');
      store.set(req.url || req, res);
    },
    match: async (req) => store.get(req.url || req) || undefined,
  };
}

function createMockCaches() {
  const caches = new Map();
  return {
    caches,
    open: async (name) => {
      if (!caches.has(name)) caches.set(name, createMockCache());
      return caches.get(name);
    },
    keys: async () => Array.from(caches.keys()),
    match: async (req) => {
      for (const cache of caches.values()) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
    },
    delete: async (key) => caches.delete(key),
  };
}

function runSw() {
  const listeners = {};
  const mockCaches = createMockCaches();
  const fetchCalls = [];
  const context = {
    self: {
      location: { origin: 'https://example.com' },
      addEventListener: (name, fn) => {
        listeners[name] = listeners[name] || [];
        listeners[name].push(fn);
      },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: mockCaches,
    URL,
    fetch: async (req, opts) => {
      fetchCalls.push({ req, opts });
      return makeResponse(200);
    },
    console: { error: () => {}, warn: () => {}, log: () => {} },
  };
  vm.createContext(context);
  vm.runInContext(swSource, context, { filename: swPath });
  return { listeners, caches: mockCaches, fetchCalls, context };
}

function makeEvent(req) {
  let responded = null;
  return {
    request: req,
    respondWith: (p) => { responded = p; },
    _response: async () => responded,
  };
}

async function flush() {
  await new Promise(r => setImmediate(r));
}

test('install precache uses cache.addAll for the static manifest and icons', async () => {
  const { listeners, caches } = runSw();
  const event = { waitUntil: (p) => { event._waited = p; } };
  assert.ok(listeners.install, 'install listener registered');
  listeners.install[0](event);
  assert.ok(event._waited, 'install waits on cache setup');
  await event._waited;
  const cache = await caches.open('plan4strength-v10');
  assert.equal(cache.addAllCalls.length, 1, 'addAll called once');
  assert.ok(cache.addAllCalls[0].includes('/manifest.json'), 'precache includes manifest');
});

test('network-first asset branch caches 200 and returns uncached 206', async () => {
  const { listeners, caches, context } = runSw();
  const event = makeEvent(makeRequest('https://example.com/js/app.js'));
  context.fetch = async () => makeResponse(200);
  listeners.fetch[0](event);
  const response = await event._response();
  assert.equal(response.status, 200);
  await flush();
  const cache = await caches.open('plan4strength-v10');
  assert.equal(cache.puts.length, 1, '200 asset is cached');
  assert.equal(cache.puts[0].res.status, 200);

  const event206 = makeEvent(makeRequest('https://example.com/js/app.js'));
  context.fetch = async () => makeResponse(206);
  listeners.fetch[0](event206);
  const r206 = await event206._response();
  assert.equal(r206.status, 206, '206 is returned');
  await flush();
  assert.equal(cache.puts.length, 1, '206 is not cached');
});

test('network-first asset branch does not cache 404 or 500', async () => {
  const { listeners, caches, context } = runSw();
  const cache = await caches.open('plan4strength-v10');
  for (const status of [404, 500]) {
    const event = makeEvent(makeRequest(`https://example.com/js/app${status}.js`));
    context.fetch = async () => makeResponse(status);
    listeners.fetch[0](event);
    const r = await event._response();
    assert.equal(r.status, status);
    await flush();
  }
  assert.equal(cache.puts.length, 0, 'error statuses are not cached');
});

test('cache-first static branch caches 200 and returns uncached 206', async () => {
  const { listeners, caches, context } = runSw();
  const event = makeEvent(makeRequest('https://example.com/icon-192.png'));
  context.fetch = async () => makeResponse(200);
  listeners.fetch[0](event);
  const response = await event._response();
  assert.equal(response.status, 200);
  await flush();
  const cache = await caches.open('plan4strength-v10');
  assert.equal(cache.puts.length, 1, '200 static is cached');

  const event206 = makeEvent(makeRequest('https://example.com/music/partial.mp3'));
  context.fetch = async () => makeResponse(206);
  listeners.fetch[0](event206);
  const r206 = await event206._response();
  assert.equal(r206.status, 206, '206 static is returned');
  await flush();
  assert.equal(cache.puts.length, 1, '206 static is not cached');
});

test('API and health requests bypass cache and are not stored', async () => {
  const { listeners, caches, context, fetchCalls } = runSw();
  const cache = await caches.open('plan4strength-v10');
  for (const pathname of ['/api/dashboard', '/health']) {
    fetchCalls.length = 0;
    const event = makeEvent(makeRequest(`https://example.com${pathname}`));
    context.fetch = async (req, opts) => {
      fetchCalls.push({ req, opts });
      return makeResponse(200);
    };
    listeners.fetch[0](event);
    const r = await event._response();
    assert.equal(r.status, 200);
    assert.ok(fetchCalls[0].opts && fetchCalls[0].opts.cache === 'no-store', `${pathname} uses no-store`);
    await flush();
  }
  assert.equal(cache.puts.length, 0, 'API/health not cached');
});

test('cross-origin responses are returned but not cached in either branch', async () => {
  const { listeners, caches, context } = runSw();
  const cache = await caches.open('plan4strength-v10');

  const assetEvent = makeEvent(makeRequest('https://other.cdn.com/js/app.js'));
  context.fetch = async () => makeResponse(200);
  listeners.fetch[0](assetEvent);
  await assetEvent._response();
  await flush();

  const staticEvent = makeEvent(makeRequest('https://other.cdn.com/icon.png'));
  listeners.fetch[0](staticEvent);
  await staticEvent._response();
  await flush();

  assert.equal(cache.puts.length, 0, 'cross-origin not cached');
});

test('non-GET requests are ignored by fetch handler', () => {
  const { listeners } = runSw();
  const event = makeEvent(makeRequest('https://example.com/api/plans', 'POST'));
  let responded = false;
  event.respondWith = () => { responded = true; };
  listeners.fetch[0](event);
  assert.equal(responded, false, 'POST not handled');
});

test('source uses response.status === 200, not response.ok', () => {
  assert.match(swSource, /response\.status === 200/);
  assert.doesNotMatch(swSource, /response\.ok\s*&&/);
});

for (const pathname of ['/js/runner.js', '/music/drive.mp3']) {
  test(`runtime ${pathname} only caches exactly 200, not other success or error statuses`, async () => {
    const { listeners, caches, context } = runSw();
    const cache = await caches.open('plan4strength-v10');
    for (const status of [201, 204, 206, 302, 404, 500]) {
      const response = makeResponse(status);
      context.fetch = async () => response;
      const event = makeEvent(makeRequest(`https://example.com${pathname}?status=${status}`));
      listeners.fetch[0](event);
      assert.equal(await event._response(), response, 'original response delivered');
      await flush();
    }
    assert.equal(cache.puts.length, 0);
  });

  test(`runtime ${pathname} delivers 200 even when caching fails`, async () => {
    const { listeners, caches, context } = runSw();
    const cache = await caches.open('plan4strength-v10');
    cache.put = async () => { throw new Error('quota exceeded'); };
    const response = makeResponse(200);
    context.fetch = async () => response;
    const event = makeEvent(makeRequest(`https://example.com${pathname}`));
    listeners.fetch[0](event);
    assert.equal(await event._response(), response);
    await flush(); // An unhandled cache rejection fails the node test runner.
  });
}

test('network-first falls back to cache offline; cache-first reuses an existing hit', async () => {
  const { listeners, caches, context } = runSw();
  const cache = await caches.open('plan4strength-v10');
  const cached = makeResponse(200);
  for (const pathname of ['/js/app.js', '/icon.svg']) {
    const request = makeRequest(`https://example.com${pathname}`);
    cache.store.set(request.url, cached);
    context.fetch = async () => { throw new Error('offline'); };
    const event = makeEvent(request);
    listeners.fetch[0](event);
    assert.equal(await event._response(), cached);
  }
});
