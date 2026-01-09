const CACHE_NAME = 'saebmc-v25-obsidian-v2';
const ASSETS = [
    'index.html',
    'app.js'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => 
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('supabase')) {
        e.respondWith(fetch(e.request));
        return;
    }
    
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});

// Background Notification Support
self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : { title: 'New Message', body: 'You have a new alert in SaebMC Studio.' };
    const options = {
        body: data.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/6065/6065063.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/6065/6065063.png',
        vibrate: [100, 50, 100],
        data: { url: '/' }
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url));
});
