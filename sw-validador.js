// Service Worker ligero para el App Validador de Portería (recepcion.html)
const CACHE_NAME = 'validador-boda-fm-v1';
const ASSETS_TO_CACHE = [
  '/recepcion.html',
  '/assets/css/styles.css',
  '/assets/js/config.js',
  '/assets/js/pass-utils.js',
  '/assets/js/recepcion.js',
  '/assets/js/main.js',
  '/assets/js/vendor/html5-qrcode.min.js',
  '/assets/images/icon-validador-192.png',
  '/assets/images/icon-validador-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  // No cachear llamadas dinámicas a Google Apps Script
  if (url.indexOf('script.google.com') !== -1) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
