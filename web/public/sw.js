/*
 * Service worker a mano. Workbox resuelve más casos de los que esta app tiene
 * y suma peso; acá alcanza con precache del shell + una estrategia por tipo.
 *
 * __PRECACHE__ lo reemplaza scripts/build-sw.mjs post-build con la lista real
 * de assets hasheados. En dev queda [] y el SW no precachea nada.
 */
const PRECACHE_ASSETS = self.__PRECACHE__ || [];
const VERSION = self.__SW_VERSION__ || 'dev';
const CACHE = `gasto-shell-${VERSION}`;

self.addEventListener('install', (event) => {
  // El shell debe quedar completo o no quedar: addAll es atómico.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Barre versiones viejas del shell para no acumular caches entre deploys.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('gasto-shell-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/*
 * Background Sync (Android/Chrome; iOS Safari no lo implementa). El token de la
 * app solo vive en el contexto de la página, así que en vez de postear desde
 * acá, despertamos a los clientes para que vacíen la cola ellos. Sirve cuando la
 * PWA está viva en segundo plano; el flush en primer plano cubre el resto.
 */
self.addEventListener('sync', (event) => {
  if (event.tag !== 'qe-sync') return;
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      for (const client of clients) client.postMessage('qe-sync');
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // La API nunca se cachea: los gastos van directo a la red. Si falla, la cola
  // offline en IndexedDB se hace cargo — no un GET cacheado.
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;

  // Navegaciones: la app es una sola página. Servimos el shell desde cache y así
  // abre sin red. La red se intenta primero para tomar deploys nuevos.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Assets con hash en el nombre: inmutables. Cache-first es seguro y elimina
  // el round-trip en cada arranque.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
