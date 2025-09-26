/* global workbox */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  // Precache: jika Anda memakai bundler, Workbox akan inject manifest.
  // Di setup ini, kita kosongkan lalu andalkan runtime caching.
  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

  // Offline fallback untuk navigasi (SPA)
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'wb-html',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 10 }),
      ],
    })
  );

  // Cache CSS/JS statis
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'script' || request.destination === 'style',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'wb-assets',
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 80 })],
    })
  );

  // Cache gambar dan Firebase Storage
  workbox.routing.registerRoute(
    ({ request, url }) => request.destination === 'image' || url.hostname.includes('firebasestorage.googleapis.com'),
    new workbox.strategies.CacheFirst({
      cacheName: 'wb-images',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      ],
    })
  );

  // Google Fonts
  workbox.routing.registerRoute(
    ({ url }) => url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'wb-fonts',
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 20 })],
    })
  );

  // Default handler
  workbox.routing.setDefaultHandler(new workbox.strategies.NetworkFirst({ cacheName: 'wb-dynamic' }));

  self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') self.skipWaiting();
  });
} else {
  // Fallback minimal jika workbox gagal dimuat
  self.addEventListener('fetch', () => {});
}

