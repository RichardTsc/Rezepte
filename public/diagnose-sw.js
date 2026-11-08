// Minimaler Service Worker nur für diagnose.html (Scope wird beim Registrieren beschränkt).
// Er existiert, damit der Browser die Seite als installierbare App erkennen kann.
// Strategie: immer zuerst Netzwerk, Cache nur als Offline-Notlösung.
var CACHE = 'diagnose-v1';

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(['diagnose.html', 'diagnose.webmanifest']); })
      .catch(function () { /* Offline-Cache ist optional */ })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || req.url.indexOf(self.location.origin) !== 0) return;
  event.respondWith(
    fetch(req).catch(function () { return caches.match(req, { ignoreSearch: true }); })
  );
});
