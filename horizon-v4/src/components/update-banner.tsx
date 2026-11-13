import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useAppUpdate } from '@/lib/app-update'
import { useI18n } from '@/lib/i18n'

/**
 * Global banner shown as soon as a newer deployment is detected. It stays
 * visible until the app runs the new build, so nobody is silently stuck.
 */
export function UpdateBanner() {
  const { t } = useI18n()
  const { status, applyUpdate, forceUpdate } = useAppUpdate()

  if (status === 'idle') return null
  const applying = status === 'applying'

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="update-banner"
      data-state={status}
      className="pb-safe fixed inset-x-0 bottom-20 z-50 px-3 md:bottom-6"
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-brand-yellow/40 bg-brand-black p-3 text-white shadow-lg">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
          {applying ? (
            <Spinner className="size-4" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{t('update.title')}</p>
          <p className="mt-0.5 text-xs text-white/70">
            {applying ? t('update.applying') : t('update.body')}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={applyUpdate}
          disabled={applying}
          data-testid="update-apply"
          className="shrink-0 rounded-full bg-brand-yellow font-bold text-brand-black hover:bg-brand-yellow/90"
        >
          {t('update.action')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={forceUpdate}
          disabled={applying}
          data-testid="update-force"
          className="shrink-0 rounded-full text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
        >
          {t('update.force')}
        </Button>
      </div>
    </div>
  )
}
