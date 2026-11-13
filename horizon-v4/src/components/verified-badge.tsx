import { BadgeCheck } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Premium verification badge, shown next to a member's name. */
export function VerifiedBadge({
  className,
  withLabel = false,
}: {
  className?: string
  withLabel?: boolean
}) {
  const { t } = useI18n()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-brand-yellow',
        className,
      )}
      title={t('verified.label')}
    >
      <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('verified.label')}</span>
      {withLabel ? (
        <span className="text-xs font-semibold">{t('verified.label')}</span>
      ) : null}
    </span>
  )
}
