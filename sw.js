// Офлайн-режим: приложение сохраняется на телефоне и открывается без сети (например, на прогулке в лесу).
// Стратегия «сначала сеть»: если сеть есть — берём свежую версию, если нет — из кеша.
const CACHE = 'zvukovoy-put-v19';
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest', './favicon.png', './logo-smoke.webp', './icon-192.png', './icon-512.png',
  './js/app.js', './js/atmos.js', './js/conductor.js', './js/dsp.js', './js/engine.js', './js/generators.js', './js/instruments.js',
  './js/live.js', './js/main.js', './js/nature.js', './js/recorder.js', './js/rhythm.js', './js/sets.js', './js/sphere.js',
  './js/theory.js', './js/util.js', './js/voice.js', './js/worklets/capture.js', './js/worklets/fdn.js',
  './js/samples.js', './js/narrator.js', './js/headtrack.js', './js/scripts.js', './js/breath.js', './js/builder.js', './js/sampler.js', './js/groove.js', './js/improv.js', './js/fauna.js', './js/stories.js', './js/field.js', './js/piano.js', './js/path.js', './samples/field/field.json', './voice/manifest.json',
  './samples/lib.json', './samples/kits/natural.mp3', './samples/kits/edm.mp3', './samples/kits/wet.mp3', './samples/kits/vocal.mp3',
  './samples/inst/rhodes.mp3', './samples/inst/mantra.mp3', './samples/inst/brokenpad.mp3', './samples/inst/synthpad.mp3', './samples/inst/classic.mp3', './samples/inst/soulsynth.mp3', './samples/inst/samplepad.mp3', './samples/inst/sub.mp3', './samples/inst/flute.mp3',
  './samples/handpan/A2.mp3', './samples/handpan/A3.mp3', './samples/handpan/A4.mp3', './samples/handpan/A5.mp3', './samples/handpan/As2.mp3', './samples/handpan/As3.mp3', './samples/handpan/As4.mp3', './samples/handpan/As5.mp3', './samples/handpan/B2.mp3', './samples/handpan/B3.mp3', './samples/handpan/B4.mp3', './samples/handpan/B5.mp3', './samples/handpan/C2.mp3', './samples/handpan/C3.mp3', './samples/handpan/C4.mp3', './samples/handpan/C5.mp3', './samples/handpan/C6.mp3', './samples/handpan/Cs2.mp3', './samples/handpan/Cs3.mp3', './samples/handpan/Cs4.mp3', './samples/handpan/Cs5.mp3', './samples/handpan/Cs6.mp3', './samples/handpan/D2.mp3', './samples/handpan/D3.mp3', './samples/handpan/D4.mp3', './samples/handpan/D5.mp3', './samples/handpan/D6.mp3', './samples/handpan/Ds2.mp3', './samples/handpan/Ds3.mp3', './samples/handpan/Ds4.mp3', './samples/handpan/Ds5.mp3', './samples/handpan/Ds6.mp3', './samples/handpan/E2.mp3', './samples/handpan/E3.mp3', './samples/handpan/E4.mp3', './samples/handpan/E5.mp3', './samples/handpan/E6.mp3', './samples/handpan/F2.mp3', './samples/handpan/F3.mp3', './samples/handpan/F4.mp3', './samples/handpan/F5.mp3', './samples/handpan/Fs2.mp3', './samples/handpan/Fs3.mp3', './samples/handpan/Fs4.mp3', './samples/handpan/Fs5.mp3', './samples/handpan/G2.mp3', './samples/handpan/G3.mp3', './samples/handpan/G4.mp3', './samples/handpan/G5.mp3', './samples/handpan/Gs2.mp3', './samples/handpan/Gs3.mp3', './samples/handpan/Gs4.mp3', './samples/handpan/Gs5.mp3', './samples/handpan/hall.mp3', './samples/handpan/knuckle.mp3', './samples/handpan/slap.mp3',
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
