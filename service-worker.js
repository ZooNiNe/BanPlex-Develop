const STATIC_CACHE = 'banplex-static-v20'; // <-- Versi dinaikkan
const DYNAMIC_CACHE = 'banplex-dynamic-v20';
const IMG_CACHE = 'banplex-img-v20';
const FONT_CACHE = 'banplex-font-v20';

const IMG_CACHE_MAX_ENTRIES = 120;
const FONT_CACHE_MAX_ENTRIES = 10;

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './logo-main.png',
  './icons-logo.png',
  './background-image.png',
  './logo-data.js',
  'https://unpkg.com/dexie@3/dist/dexie.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
  'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js'
];

self.addEventListener('install', event => {
  console.log('[Service Worker] Menginstall...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[Service Worker] Precaching App Shell dan aset penting...');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.error('[Service Worker] Gagal melakukan precaching:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[Service Worker] Mengaktifkan...');
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMG_CACHE && key !== FONT_CACHE) {
          console.log('[Service Worker] Menghapus cache lama:', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      await cache.delete(keys[0]); // Hapus entri tertua
      return trimCache(cacheName, maxEntries); // Rekursif jika masih berlebih
    }
  } catch (e) {
    console.error(`[Service Worker] Gagal memangkas cache ${cacheName}:`, e);
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebaseapp.com')) {
    return; // Langsung lanjutkan ke jaringan (Firestore/Auth akan menanganinya)
  }

  if (STATIC_ASSETS.includes(url.pathname) || STATIC_ASSETS.includes(url.href)) {
    event.respondWith(caches.match(request));
    return;
  }
  
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache => {
        return cache.match(request).then(response => {
          const fetchPromise = fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
              trimCache(FONT_CACHE, FONT_CACHE_MAX_ENTRIES);
            }
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
    return;
  }

  if (request.destination === 'image' || url.hostname.includes('firebasestorage.googleapis.com')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(cache => {
        return cache.match(request).then(response => {
          return response || fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
              trimCache(IMG_CACHE, IMG_CACHE_MAX_ENTRIES);
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.open(DYNAMIC_CACHE).then(cache => {
      return cache.match(request).then(response => {
        return response || fetch(request).then(networkResponse => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});