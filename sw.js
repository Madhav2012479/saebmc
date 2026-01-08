// Service Worker for Login System Pro
// Bump this version whenever you deploy UI changes, so clients get fresh HTML/JS.
const CACHE_NAME = 'login-system-pro-v2';
const OFFLINE_URL = './index.html';

// Files to cache for offline use
const FILES_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://cdn.jsdelivr.net/npm/otpauth@9.2.2/dist/otpauth.umd.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Montserrat:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=Poppins:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap'
];

// Install event - cache files
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        // Cache files one by one to handle failures gracefully
        return Promise.allSettled(
          FILES_TO_CACHE.map(url => 
            cache.add(url).catch(err => {
              console.warn('[ServiceWorker] Failed to cache:', url, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[ServiceWorker] All files cached');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache:', key);
          return caches.delete(key);
        }
      }));
    }).then(() => {
      console.log('[ServiceWorker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event
// Strategy:
// - HTML navigations: network-first (so updates ship reliably), fallback to cache/offline
// - Static assets: cache-first
// - Supabase: always network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Supabase calls must always hit network
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  const isHtmlNav = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

  // Network-first for HTML so new UI changes (buttons/modals) appear after deploy
  if (isHtmlNav) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Cache successful basic responses
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

// Background sync for offline messages (when supported)
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Sync event:', event.tag);
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push event');
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔐</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };
  
  event.waitUntil(
    self.registration.showNotification('Login System Pro', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click');
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});

// Sync messages function (placeholder for future enhancement)
async function syncMessages() {
  console.log('[ServiceWorker] Syncing messages...');
  // This would sync any offline messages to the server
  // The main app.js already handles this via flushChatOutbox()
}

console.log('[ServiceWorker] Service Worker loaded');
