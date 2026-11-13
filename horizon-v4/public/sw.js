/* HORIZON Workspace — service worker
 *
 * Rules that keep phones out of a white screen:
 *  - HTML is NEVER cached or replayed. A cached HTML file points at hashed
 *    assets from an old release, so it loads unstyled or blank forever.
 *    Navigations always go to the network; offline shows a small self-contained
 *    offline page instead of a stale app shell.
 *  - Only static files (/assets/*, images, fonts) are cached, and only as an
 *    offline fallback: hashed names change on every release, so a new build can
 *    never run a script from a previous one.
 *  - Old caches are deleted on activation and this worker takes control at once.
 *
 * Privacy: only same-origin GET requests are cached, never API calls and never
 * requests carrying credentials headers.
 */
const CACHE_VERSION = 'horizon-v6'
const PRECACHE = [
  '/manifest.json',
  '/favicon.svg',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/maskable-192.png',
  '/maskable-512.png',
  '/apple-touch-icon.png',
]

const OFFLINE_HTML =
  '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>HORIZON — hors ligne</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
  'background:#0D0D0D;color:#F5F5F5;font-family:system-ui,-apple-system,sans-serif;padding:24px">' +
  '<div style="max-width:340px;width:100%;border:1px solid #333;border-radius:18px;padding:20px;background:#141414">' +
  '<p style="margin:0;font-size:18px;font-weight:800;letter-spacing:.04em">HORIZON</p>' +
  '<p style="margin:10px 0 0;font-size:14px;line-height:1.45;color:#B9B9B9">' +
  'Pas de connexion internet. Vérifiez votre réseau puis réessayez.</p>' +
  '<p style="margin:6px 0 0;font-size:12px;line-height:1.45;color:#8A8A8A">' +
  'No internet connection. Check your network and try again.</p>' +
  '<button type="button" onclick="location.reload()" style="margin-top:16px;width:100%;padding:12px;' +
  'border-radius:999px;border:0;background:#FFD60A;color:#0D0D0D;font-size:14px;font-weight:800">' +
  'Réessayer / Retry</button></div></body></html>'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      // A new release must never wait for a user tap on an installed app.
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('horizon-') && key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data && event.data.type === 'PURGE') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k.startsWith('horizon-')).map((k) => caches.delete(k))),
        )
        .catch(() => undefined),
    )
  }
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    /\.(?:png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (req.headers.has('authorization')) return

  // Pages: network only. Never replay HTML from a cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store', credentials: 'same-origin' }).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          }),
      ),
    )
    return
  }

  // Static files: network first, cache only as an offline fallback.
  if (isStaticAsset(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy))
          }
          return res
        })
        .catch(() =>
          caches
            .open(CACHE_VERSION)
            .then((cache) => cache.match(req))
            .then((hit) => hit || Response.error()),
        ),
    )
  }
})
