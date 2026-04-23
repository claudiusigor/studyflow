const CACHE = 'studyflow-v26';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './vendor/lucide.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/pmmg-logo.png',
  './icons/nohumor.png',
  './icons/1.png',
  './icons/2.png',
  './icons/3.png',
  './icons/4.png',
  './icons/5.png',
];

const RUNTIME_CACHE = `${CACHE}-runtime`;
const OFFLINE_DOCUMENT = './index.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => ![CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const cache = await caches.open(RUNTIME_CACHE);
  const network = fetch(request)
    .then(response => {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate';
  const isSameOrigin = url.origin === self.location.origin;
  const isApprovedExternal = ['unpkg.com', 'cdn.jsdelivr.net'].includes(url.hostname);

  if (isNavigation) {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_DOCUMENT)));
    return;
  }

  if (isSameOrigin || isApprovedExternal) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});







