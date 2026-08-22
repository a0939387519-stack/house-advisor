var CACHE_NAME = 'house-advisor-v1';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(e) {
  // 只快取靜態資源，API call不快取
  if (e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(function() {
    return caches.match(e.request);
  }));
});
