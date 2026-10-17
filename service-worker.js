/* HORIZON PWA service worker
 * Scope-aware for GitHub Pages (/Charles/) and Cloudflare Workers (/).
 * Cache only public static assets; never cache HTML, accounts, messages or business data.
 */
const CACHE_NAME = "horizon-static-v5";
const SCOPE_URL = new URL(self.registration.scope);
const OFFLINE_URL = new URL("offline.html", SCOPE_URL).href;
const STATIC_EXTENSIONS = /\.(?:css|js|svg|png|jpg|jpeg|webp|ico|woff2?)$/i;

function isInsideScope(url) {
  return url.origin === SCOPE_URL.origin && url.pathname.startsWith(SCOPE_URL.pathname);
}

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
        keys.filter(key => /-static-v\d+$/.test(key) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isInsideScope(url)) return;

  // Navigations stay network-first. Only the neutral offline page is a fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) ||
          new Response("HORIZON est hors connexion.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      })
    );
    return;
  }

  // Public same-scope static files only. Firebase/API and dynamic responses are excluded.
  if (!STATIC_EXTENSIONS.test(url.pathname) || url.pathname.includes("/__/")) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      return cached || new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
