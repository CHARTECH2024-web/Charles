import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  Bell,
  BookOpen,
  Home,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { AccountButton } from '@/components/account-button'
import { HorizonLogo } from '@/components/horizon-logo'
import { PreferencesMenu } from '@/components/preferences-menu'
import { Spinner } from '@/components/ui/spinner'
import { useAccount } from '@/lib/account'
import { useI18n, type TranslationKey } from '@/lib/i18n'

type NavItem = {
  to: string
  key: TranslationKey
  icon: typeof Home
}

const NAV: ReadonlyArray<NavItem> = [
  { to: '/', key: 'nav.home', icon: Home },
  { to: '/notifications', key: 'nav.notifications', icon: Bell },
  { to: '/ai', key: 'nav.ai', icon: Sparkles },
  { to: '/messages', key: 'nav.messaging', icon: MessageCircle },
  { to: '/cahier', key: 'nav.cahier', icon: BookOpen },
  { to: '/connect', key: 'nav.connect', icon: Users },
]

const ADMIN_NAV: NavItem = { to: '/admin', key: 'nav.admin', icon: ShieldCheck }

function Splash() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-black"
      aria-live="polite"
    >
      <img src="/logo-h.svg" alt="HORIZON" className="h-16 w-auto" draggable={false} />
      <Spinner className="size-5 text-brand-yellow" />
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const account = useAccount()
  const navigate = useNavigate()
  const admin = useQuery(api.admin.amIAdmin)

  // The app is only reachable once authentication is complete.
  useEffect(() => {
    if (account.status === 'signed-out' || account.status === 'needs-profile') {
      void navigate({ to: '/auth', replace: true })
    }
  }, [account.status, navigate])

  if (account.status !== 'ready') return <Splash />

  // The admin entry only exists for administrators.
  const nav = admin?.isAdmin ? [...NAV, ADMIN_NAV] : NAV

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      {/* Desktop side rail */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <Link to="/" aria-label="HORIZON">
          <HorizonLogo withName />
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Navigation">
          {nav.map(({ to, key, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{
                className: 'bg-primary !text-primary-foreground hover:bg-primary',
              }}
            >
              <Icon className="size-5" />
              {t(key)}
            </Link>
          ))}
        </nav>
        <p className="mt-auto text-xs text-muted-foreground">
          {t('brand.slogan')}
        </p>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/90 px-4 py-2.5 backdrop-blur md:px-6">
          <Link to="/" aria-label="HORIZON" className="md:invisible">
            <HorizonLogo withName />
          </Link>
          <div className="flex items-center gap-2">
            <PreferencesMenu />
            <AccountButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Navigation"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {nav.map(({ to, key, icon: Icon }) => (
            <li key={to} className="flex-1">
              <Link
                to={to}
                activeOptions={{ exact: true }}
                className="group flex flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors"
                activeProps={{ className: 'text-foreground' }}
              >
                <span className="flex h-7 w-10 items-center justify-center rounded-full transition-colors group-[[aria-current=page]]:bg-primary group-[[aria-current=page]]:text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="max-w-full truncate">{t(key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
