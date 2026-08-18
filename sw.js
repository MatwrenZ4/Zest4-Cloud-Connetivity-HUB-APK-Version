// Zest4 Cloud & Connectivity Hub — Service Worker
// Bump CACHE_VERSION whenever any precached file changes, so old
// installs pick up the new content instead of serving stale copies.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `zest4-cc-hub-${CACHE_VERSION}`;

// Everything the app needs to run with zero network access.
// Paths are relative to the root the hub is deployed at.
const PRECACHE_URLS = [
  // App shell
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',

  // Icons
  'icons/favicon-16.png',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',

  // Self-hosted fonts (replaces Google Fonts CDN)
  'assets/fonts/fonts.css',
  'assets/fonts/inter-400.woff2',
  'assets/fonts/inter-500.woff2',
  'assets/fonts/inter-600.woff2',
  'assets/fonts/inter-700.woff2',
  'assets/fonts/space-grotesk-400.woff2',
  'assets/fonts/space-grotesk-500.woff2',
  'assets/fonts/space-grotesk-600.woff2',
  'assets/fonts/space-grotesk-700.woff2',
  'assets/fonts/jetbrains-mono-400.woff2',
  'assets/fonts/jetbrains-mono-500.woff2',

  // Vendored libraries (replaces cdnjs/jsdelivr CDN requests)
  'assets/vendor/jspdf.umd.min.js',
  'assets/vendor/tabler-icons/tabler-icons.min.css',
  'assets/vendor/tabler-icons/fonts/tabler-icons.woff2',
  'assets/vendor/tabler-icons/fonts/tabler-icons.woff',

  // Tools (kept in the same TWA instance/scope)
  'tools/pricing-calculator.html',
  'tools/callswitch-setup-form.html',
  'tools/cloa-form.html',

  // Local documents — rate cards, forms, guides.
  // NOTE: keep this list in sync with the file-row/guide-card links in index.html.
  'resources/CallSwitch_Rate_Card__WS___RRP__01-03-2026.xlsx',
  'resources/Zest4_8x8_RateCard_01-12-2022__2_.xlsx',
  'resources/Horizon-Rate-Card-WS-Call-Rates_01-06-2022.xlsx',
  'resources/Outbound_Caller_ID_Spoofing_Authorization_Form.docx',
  'resources/8x8-Security.pdf',
  'guides/how-to-create-and-submit-a-voip-broadband-order.pdf',
  'guides/how-to-create-a-number-port-request-ticket.pdf',
];

// ---------- Install: precache the app shell + tools + docs ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache files individually so one missing/renamed file (e.g. a
      // rate card that hasn't been uploaded yet) doesn't fail the whole
      // install and leave the app with no offline support at all.
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[sw] Skipped precaching (not found yet?):', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ---------- Activate: clean up old cache versions ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('zest4-cc-hub-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- Fetch: cache-first for same-origin assets, ----------
// ---------- with a network-first refresh for the app shell pages ----------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests; let everything else (e.g. POSTs) pass through.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Let true cross-origin requests (external help centres, portals, etc.)
  // go straight to the network — those genuinely need a connection, as expected.
  if (url.origin !== self.location.origin) return;

  // Navigations (hub, tool pages): try the network first so users always get
  // the latest version when online, but fall back to cache, then to the
  // offline page, when there's no connection.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('offline.html'))
        )
    );
    return;
  }

  // Everything else (fonts, vendored JS/CSS, documents, icons): cache-first,
  // fill the cache in the background on a hit, fetch-and-cache on a miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
