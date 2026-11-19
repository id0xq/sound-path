// Офлайн-режим: приложение сохраняется на телефоне и открывается без сети (например, на прогулке в лесу).
// Стратегия «сначала сеть»: если сеть есть — берём свежую версию, если нет — из кеша.
const CACHE = 'zvukovoy-put-v1';
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  './js/app.js', './js/atmos.js', './js/conductor.js', './js/dsp.js', './js/engine.js', './js/generators.js', './js/instruments.js',
  './js/live.js', './js/main.js', './js/nature.js', './js/recorder.js', './js/rhythm.js', './js/sets.js', './js/sphere.js',
  './js/theory.js', './js/util.js', './js/voice.js', './js/worklets/capture.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
