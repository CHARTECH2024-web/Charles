import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Version detection for a statically exported app.
 *
 * Every deployment publishes new hashed asset files (for example
 * `/assets/index-a1b2c3d4.js`). Comparing the asset marker of the running page
 * with the marker served by the network tells us whether a newer build exists,
 * without any extra endpoint or build configuration.
 */

const HASHED_ASSET = /(?:src|href)="(\/assets\/[^"]+-[A-Za-z0-9_-]{6,}\.(?:js|css))"/g
const POLL_INTERVAL_MS = 60_000
const FOCUS_THROTTLE_MS = 15_000

export type UpdateStatus = 'idle' | 'available' | 'applying'

/** Extracts the sorted set of hashed asset URLs referenced by an HTML page. */
export function parseBuildMarker(html: string): string | null {
  const found = new Set<string>()
  for (const match of html.matchAll(HASHED_ASSET)) {
    if (match[1]) found.add(match[1])
  }
  if (found.size === 0) return null
  return [...found].sort().join('|')
}

/** Marker of the page currently running in this tab. */
function currentBuildMarker(): string | null {
  if (typeof document === 'undefined') return null
  return parseBuildMarker(document.documentElement.outerHTML)
}

type UpdateContextValue = {
  status: UpdateStatus
  applyUpdate: () => void
  checkNow: () => void
  /** Last resort: drops the service worker + caches, then reloads. */
  forceUpdate: () => void
  /** Short build fingerprint of the page currently running. */
  version: string | null
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

function reload(): void {
  window.location.reload()
}

/** Drops every cached shell/bundle and reloads with a cache-busting query. */
async function hardReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((reg) => reg.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith('horizon-')).map((key) => caches.delete(key)),
      )
    }
  } catch {
    // Even if cleanup fails, the cache-busting reload below still helps.
  }
  const url = new URL(window.location.href)
  url.searchParams.set('_v', String(Date.now()))
  window.location.replace(url.toString())
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [version, setVersion] = useState<string | null>(null)
  const currentMarker = useRef<string | null>(null)
  const lastCheck = useRef(0)
  const checking = useRef(false)

  useEffect(() => {
    currentMarker.current = currentBuildMarker()
    setVersion(currentMarker.current?.split('|')[0]?.split('/').pop() ?? null)

    // Dev-only hook so the update flow can be exercised without a second build.
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(window.location.search)
      if (params.has('simulateUpdate')) {
        // Remove the flag first, otherwise the automatic reload would loop.
        params.delete('simulateUpdate')
        const search = params.toString()
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${search ? `?${search}` : ''}`,
        )
        setStatus('available')
      }
    }
  }, [])

  const applyUpdate = useCallback(() => {
    setStatus('applying')
    const registration = navigator.serviceWorker?.getRegistration?.()
    void Promise.resolve(registration)
      .then((reg) => {
        const waiting = reg?.waiting
        if (waiting) {
          // The new worker activates, then `controllerchange` reloads the page.
          waiting.postMessage({ type: 'SKIP_WAITING' })
          window.setTimeout(reload, 2000)
          return
        }
        // No waiting worker: the shell cache may be stale, so clear it.
        void hardReload()
      })
      .catch(() => void hardReload())
  }, [])

  const forceUpdate = useCallback(() => {
    setStatus('applying')
    void hardReload()
  }, [])

  const checkNow = useCallback(() => {
    if (checking.current) return
    const marker = currentMarker.current
    if (!marker) return
    lastCheck.current = Date.now()
    checking.current = true

    const url = `/index.html?ts=${Date.now()}`
    fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.text() : fetch(`/?ts=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''))))
      .then((html) => {
        const next = parseBuildMarker(html)
        if (next && next !== marker) setStatus((prev) => (prev === 'idle' ? 'available' : prev))
      })
      .catch(() => undefined)
      .finally(() => {
        checking.current = false
      })
  }, [])

  // Poll while the tab is visible, and check again whenever it comes back.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') checkNow()
    }
    const onFocus = () => {
      if (Date.now() - lastCheck.current > FOCUS_THROTTLE_MS) tick()
    }
    const timer = window.setInterval(tick, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', onFocus)
    // Restored from the back/forward cache: the page may be several builds old.
    window.addEventListener('pageshow', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', tick)
    }
  }, [checkNow])

  // A service worker already waiting for activation is also a new version.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cancelled = false

    const watch = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        if (!reg || cancelled) return
        if (reg.waiting && navigator.serviceWorker.controller) setStatus('available')
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              setStatus('available')
            }
          })
        })
        // Installed apps keep running from the shell cache: ask for an update
        // check regularly so a new deployment is noticed without reinstalling.
        void reg.update().catch(() => undefined)
        const timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') {
            void reg.update().catch(() => undefined)
          }
        }, POLL_INTERVAL_MS)
        return () => window.clearInterval(timer)
      } catch {
        return undefined
      }
    }

    let cleanup: (() => void) | undefined
    void watch().then((stop) => {
      cleanup = stop
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  // Never leave the app stuck on an old build: apply silently once it is hidden.
  useEffect(() => {
    if (status !== 'available') return
    const onHidden = () => {
      if (document.visibilityState === 'hidden') applyUpdate()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [status, applyUpdate])

  // Automatic update: as soon as a new build is detected, switch to it without
  // asking anything. A short delay keeps the current tap from being lost.
  useEffect(() => {
    if (status !== 'available') return
    const timer = window.setTimeout(() => applyUpdate(), 1200)
    return () => window.clearTimeout(timer)
  }, [status, applyUpdate])

  const value = useMemo(
    () => ({ status, applyUpdate, checkNow, forceUpdate, version }),
    [status, applyUpdate, checkNow, forceUpdate, version],
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useAppUpdate() {
  const ctx = useContext(UpdateContext)
  if (!ctx) throw new Error('useAppUpdate must be used inside UpdateProvider')
  return ctx
}
