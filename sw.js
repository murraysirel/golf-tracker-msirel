// ─────────────────────────────────────────────────────────────────
// LOOPER — Service Worker
// Cache-first for static assets, network-first for API calls.
// ─────────────────────────────────────────────────────────────────
const CACHE_NAME = 'looper-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/app.css',
  '/assets/looper_caddie.png',
  '/assets/looper-logo.png',
];

// Cache all JS modules dynamically on first fetch
const JS_PATTERN = /\/js\/.*\.js$/;
const FONT_PATTERN = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
const CDN_PATTERN = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls: network-first, fall back to cache, then graceful offline JSON
  if (url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then(cached =>
            cached || new Response(JSON.stringify({ offline: true, error: 'No network connection' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            })
          )
        )
    );
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    JS_PATTERN.test(url.pathname) ||
    url.pathname.startsWith('/assets/') ||
    FONT_PATTERN.test(url.href) ||
    CDN_PATTERN.test(url.href)
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        // Return cache immediately, update in background
        const fetchPromise = fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else: network only
  event.respondWith(fetch(event.request));
});
