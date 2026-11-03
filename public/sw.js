/* ObraPro - sw.js (Service Worker)
   Permite abrir la app sin internet.
   Estrategia: muestra la copia guardada al instante y, si hay internet,
   descarga la versión nueva en segundo plano (se verá al volver a abrir).
   IMPORTANTE: al publicar cambios, sube el número de versión de CACHE. */
const CACHE = 'obrapro-v0.8.0';

/* No se guarda './index.html' aparte: Cloudflare lo redirige a './' y un
   Service Worker no puede entregar respuestas redirigidas al navegar. */
const ARCHIVOS = [
  './',
  './styles.css',
  './calc.js',
  './db.js',
  './fotos.js',
  './presupuesto.js',
  './app.js',
  './manifest.json',
  './logo.png',
  './logo-sm.png',
  './favicon-32.png',
  './favicon.ico',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './fonts/lato-400.woff',
  './fonts/lato-700.woff'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(caches.open(CACHE).then(async cache => {
    const guardado = await cache.match(req, { ignoreSearch: true });
    const red = fetch(req)
      .then(res => { if (res && res.ok && !res.redirected) cache.put(req, res.clone()); return res; })
      .catch(() => null);

    if (guardado) {
      event.waitUntil(red);
      return guardado;
    }
    const res = await red;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('./');
    return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión' });
  }));
});
