/* Service worker: la app completa queda guardada en el móvil y abre sin conexión. */
const VERSION = 'v1.3.1';
const SHELL = `rutas-shell-${VERSION}`;
const TILES = 'rutas-tiles';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './vendor/leaflet.js', './vendor/leaflet.css', './vendor/dexie.min.js', './vendor/xlsx.full.min.js', './vendor/supabase.js',
  './vendor/images/marker-icon.png', './vendor/images/marker-icon-2x.png', './vendor/images/marker-shadow.png', './vendor/images/layers.png', './vendor/images/layers-2x.png',
  './js/util.js', './js/db.js', './js/geo.js', './js/route.js', './js/xlsxio.js', './js/sync.js', './js/ui.js', './js/screens.js', './js/screens2.js', './js/app.js',
  './data/demo-clientes.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.allSettled(FILES.map(f => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('rutas-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Teselas del mapa: red primero, caché de respaldo (para zonas ya vistas sin cobertura)
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open(TILES).then(async c => {
      try { const r = await fetch(e.request); if (r.ok) { c.put(e.request, r.clone()); trimTiles(c); } return r; }
      catch (err) { const hit = await c.match(e.request); return hit || Response.error(); }
    }));
    return;
  }
  // API externas (geocodificación, rutas, Supabase): siempre red
  if (url.origin !== location.origin && !url.hostname.includes('fonts.g')) return;
  // App: caché primero, red de respaldo
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname.includes('fonts.g'))) caches.open(SHELL).then(c => c.put(e.request, r.clone()));
    return r;
  }).catch(() => caches.match('./index.html'))));
});

let trimming = false;
async function trimTiles(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); if (keys.length > 1500) for (const k of keys.slice(0, keys.length - 1200)) await c.delete(k); }
  finally { trimming = false; }
}
