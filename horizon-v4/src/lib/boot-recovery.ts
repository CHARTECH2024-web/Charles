/**
 * Boot recovery for installed/updated apps.
 *
 * A phone can keep an old service worker and old hashed JavaScript files after
 * a new release. The browser then fails to load a chunk, the React tree never
 * mounts and the screen stays blank with "Uncaught" in the corner. This module
 * detects that specific class of failure, drops the cached shell and reloads
 * once with a fresh network fetch.
 */

const GUARD_KEY = 'horizon.boot-recovery'

const FATAL_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \d+ failed/i,
  /chunkloaderror/i,
  /is not a valid javascript mime type/i,
  /unexpected token '<'/i,
]

function isFatal(message: string): boolean {
  return FATAL_PATTERNS.some((pattern) => pattern.test(message))
}

async function recover(): Promise<void> {
  if (typeof window === 'undefined') return
  if (sessionStorage.getItem(GUARD_KEY) === '1') return
  sessionStorage.setItem(GUARD_KEY, '1')

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith('horizon-')).map((key) => caches.delete(key)),
      )
    }
  } catch {
    // Nothing cached after all: the reload below still fixes a bad chunk.
  }

  const url = new URL(window.location.href)
  url.searchParams.set('_v', `${Date.now()}`)
  window.location.replace(url.toString())
}

let installed = false

export function installBootRecovery(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    const message = `${event.message ?? ''} ${event.filename ?? ''}`
    if (isFatal(message)) void recover()
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason ?? '')
    if (isFatal(message)) void recover()
  })

  // A successful mount clears the guard so a later release can recover again.
  window.setTimeout(() => {
    if (document.querySelector('#app, main, body > div')) sessionStorage.removeItem(GUARD_KEY)
  }, 4000)
}

installBootRecovery()
