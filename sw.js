// YR FurniTune — offline helper (round 36). The app screen (index.html, web.js, konva, icons) is kept on the device, so it
// opens instantly, even offline. Data always comes live from the Apps Script door (never cached here).
// A new version installs in the background and waits; the page shows "New version ready" and the tap sends 'skipWaiting'.
var VERSION = 'v2026.11.13-0910';
var CACHE = 'furnitune-' + VERSION;
var FILES = ["./","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","index.html","manifest.webmanifest","privacy.html","vendor/konva.min.js","web.js"];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () {
    return self.clients.matchAll({ type: 'window' }).then(function (wins) { if (!wins.length) return self.skipWaiting(); });
  }));
});

self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('furnitune-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // Google sign-in + the Apps Script door: always live
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match('index.html').then(function (hit) { return hit || fetch(req); });
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) { return hit || fetch(req); });
  }));
});
