/* NURU PWA service worker
 * Versionner ce cache à chaque changement important.
 * Les pages HTML, comptes, messages et données métier ne sont jamais mis en cache.
 */
const CACHE_NAME = "nuru-static-v1";
const OFFLINE_URL = "/offline.html";
const STATIC_EXTENSIONS = /\.(?:css|js|svg|png|jpg|jpeg|webp|ico|woff2?)$/i;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("nuru-static-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Les navigations sont toujours récupérées du réseau : aucune page privée
  // ou donnée de compte n'est stockée. Hors connexion, afficher une page neutre.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Ne mettre en cache que les fichiers statiques du même domaine.
  // Les requêtes Firebase, les données et les réponses personnalisées sont exclues.
  if (!STATIC_EXTENSIONS.test(url.pathname) || url.pathname.startsWith("/__/")) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
