import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { BadgeCheck, Share2 } from 'lucide-react'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import { AppShell } from '@/components/app-shell'
import { PageTitle } from '@/components/page-parts'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'

const meta = siteMetadata['/pro']

export const Route = createFileRoute('/pro')({
  validateSearch: (search: Record<string, unknown>) => ({
    handle: typeof search.handle === 'string' ? search.handle : '',
  }),
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: ProPage,
})

function ProPage() {
  const { t } = useI18n()
  const { handle } = Route.useSearch()
  const me = useQuery(api.profiles.me, {})
  const ownHandle = me?.ok ? (me.profile?.handle ?? '') : ''
  const target = handle || ownHandle
  const page = useQuery(api.billing.proPage, target ? { handle: target } : 'skip')

  return (
    <AppShell>
      <div data-testid="pro-page" data-state={page === undefined ? 'loading' : 'ready'}>
        <PageTitle>{t('pro.title')}</PageTitle>
        <p className="text-sm text-muted-foreground">{t('pro.intro')}</p>

        {page === undefined ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-5" />
          </div>
        ) : page.ok ? (
          <article className="mt-6 rounded-2xl border bg-card p-5 text-card-foreground">
            <div className="flex items-center gap-3">
              {page.photoUrl ? (
                <img
                  src={page.photoUrl}
                  alt=""
                  className="size-14 rounded-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="flex size-14 items-center justify-center rounded-full bg-brand-black text-lg font-extrabold text-brand-yellow">
                  {page.displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-lg font-extrabold">
                  {page.displayName}
                  {page.verified ? <BadgeCheck className="size-4 text-primary" /> : null}
                </p>
                <p className="text-sm text-muted-foreground">{page.handle}.HZ</p>
              </div>
            </div>
            <p className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              {t('pro.contact')}
            </p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4"
              onClick={() => {
                const url = `${window.location.origin}/pro?handle=${encodeURIComponent(page.handle)}`
                void navigator.clipboard?.writeText(url)
              }}
            >
              <Share2 className="size-4" aria-hidden="true" />
              {t('pro.copyLink')}
            </button>
          </article>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">{t('pro.locked')}</p>
            <p className="mt-1 text-xs">{t('pro.lockedHint')}</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
