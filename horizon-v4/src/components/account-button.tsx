import { Link } from '@tanstack/react-router'
import { LogIn } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useAccount } from '@/lib/account'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Header entry point: avatar when signed in, sign-in link otherwise. */
export function AccountButton() {
  const { t } = useI18n()
  const account = useAccount()

  if (account.status === 'loading') {
    return <span className="size-9 rounded-full bg-muted" aria-hidden />
  }

  if (account.status === 'ready') {
    const { displayName, photoUrl, horizonId } = account.profile
    return (
      <Link
        to="/account"
        aria-label={`${t('acc.title')}: ${horizonId}`}
        title={horizonId}
        className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-extrabold text-primary-foreground ring-offset-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          displayName.slice(0, 1).toUpperCase()
        )}
      </Link>
    )
  }

  return (
    <Link
      to="/auth"
      className={cn(buttonVariants({ size: 'sm' }), 'font-bold')}
    >
      <LogIn />
      {t('home.login')}
    </Link>
  )
}
