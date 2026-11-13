import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n'

type InstallChoice = { outcome: 'accepted' | 'dismissed' }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

type PwaValue = {
  /** True once the app runs installed (standalone window). */
  installed: boolean
  /** Starts the native install flow, or shows manual steps when unavailable. */
  install: () => Promise<void>
}

const PwaContext = createContext<PwaValue | null>(null)

function detectStandalone() {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  )
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [installed, setInstalled] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [isApple, setIsApple] = useState(false)

  useEffect(() => {
    setInstalled(detectStandalone())
    const ua = window.navigator.userAgent
    setIsApple(
      /iPad|iPhone|iPod|Macintosh/.test(ua) && !/Chrome|Chromium|Edg/.test(ua),
    )

    const onBefore = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Service worker: production builds only, so dev hot reload is never cached.
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    let reloading = false
    const reloadOnce = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }

    // A freshly activated worker means new code is in control: reload silently.
    const onControllerChange = () => reloadOnce()

    const activate = (worker: ServiceWorker) => {
      // No prompt: installed apps must update by themselves.
      try {
        worker.postMessage({ type: 'SKIP_WAITING' })
      } catch {
        // Ignore: the fallback timer below still reloads the page.
      }
      window.setTimeout(reloadOnce, 2500)
    }

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) activate(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              activate(worker)
            }
          })
        })
        // Look for a new version when the app regains focus or becomes visible.
        const check = () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => undefined)
        }
        check()
        document.addEventListener('visibilitychange', check)
        window.addEventListener('pageshow', check)
        window.addEventListener('load', check)
        window.setInterval(check, 60_000)
      })
      .catch(() => undefined)

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') setInstalled(true)
      setDeferred(null)
      return
    }
    setHelpOpen(true)
  }, [deferred])

  const value = useMemo(() => ({ installed, install }), [installed, install])

  return (
    <PwaContext.Provider value={value}>
      {children}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pwa.iosTitle')}</DialogTitle>
            <DialogDescription>
              {isApple ? t('pwa.iosBody') : t('pwa.genericBody')}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </PwaContext.Provider>
  )
}

export function usePwa() {
  const ctx = useContext(PwaContext)
  if (!ctx) throw new Error('usePwa must be used inside PwaProvider')
  return ctx
}
