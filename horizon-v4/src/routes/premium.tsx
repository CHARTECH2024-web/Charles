import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { BadgeCheck, Check, CreditCard, Sparkles, Smartphone } from 'lucide-react'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import { AppShell } from '@/components/app-shell'
import { MobileMoneyForm } from '@/components/premium/mobile-money-form'
import { PageTitle, StatusBadge } from '@/components/page-parts'
import { Spinner } from '@/components/ui/spinner'
import { buttonVariants } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const meta = siteMetadata['/premium']

export const Route = createFileRoute('/premium')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: PremiumPage,
})

const LIMIT_ROWS = [
  { key: 'storage', label: 'premium.limit.storage' },
  { key: 'video', label: 'premium.limit.video' },
  { key: 'pdf', label: 'premium.limit.pdf' },
  { key: 'voice', label: 'premium.limit.voice' },
  { key: 'ai', label: 'premium.limit.ai' },
  { key: 'boosts', label: 'premium.limit.boosts' },
  { key: 'pro', label: 'premium.limit.pro' },
] as const

function PremiumPage() {
  const { t } = useI18n()
  const itemLabel = (item: string) => {
    if (item === 'yearly') return t('pay.item.yearly')
    if (item === 'credits50') return t('pay.item.credits50')
    if (item === 'credits150') return t('pay.item.credits150')
    if (item === 'credits500') return t('pay.item.credits500')
    return t('pay.item.monthly')
  }
  const statusLabel = (status: string) => {
    if (status === 'approved') return t('pay.status.approved')
    if (status === 'rejected') return t('pay.status.rejected')
    return t('pay.status.pending')
  }
  const data = useQuery(api.billing.entitlement, {})
  const requests = useQuery(api.billing.myRequests, {})

  if (data === undefined) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <Spinner className="size-6" />
        </div>
      </AppShell>
    )
  }

  const limits = data.catalog.limits
  const plans = data.catalog.plans
  const packs = data.catalog.packs

  return (
    <AppShell>
      <div data-testid="premium-page" data-state="ready">
        <PageTitle>{t('premium.pageTitle')}</PageTitle>
        <p className="text-sm text-muted-foreground">{t('premium.pageSubtitle')}</p>

        <section className="mt-5 rounded-xl border bg-card p-4 text-card-foreground">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('premium.current')}
          </p>
          <p className="mt-1 flex items-center gap-2 text-lg font-extrabold">
            {data.plan === 'free'
              ? t('premium.plan.free')
              : data.plan === 'yearly'
                ? t('premium.plan.yearly')
                : t('premium.plan.monthly')}
            {data.premium ? (
              <StatusBadge tone="brand">{t('premium.badge')}</StatusBadge>
            ) : null}
          </p>
          {data.until ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('premium.until')}{' '}
              {new Intl.DateTimeFormat('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              }).format(new Date(data.until))}
            </p>
          ) : null}
          <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
            <li>
              {t('premium.usage.ai')} : {data.usage.aiToday}/{data.limits.aiCreditsPerDay}
              {data.usage.aiBonus > 0 ? ` (+${data.usage.aiBonus})` : ''}
            </li>
            <li>
              {t('premium.usage.storage')} :{' '}
              {(data.usage.storageBytes / (1024 * 1024)).toFixed(1)} / {data.limits.storageMb} Mo
            </li>
            <li>
              {t('premium.usage.boosts')} : {data.usage.boostsThisMonth}/
              {data.limits.boostsPerMonth}
            </li>
          </ul>
          {data.premium ? (
            <Link
              to="/pro"
              search={{ handle: '' }}
              className="mt-3 inline-block text-xs font-semibold underline underline-offset-4"
            >
              {t('premium.proLink')}
            </Link>
          ) : null}
        </section>

        {data.adminGift ? (
          <p
            data-testid="premium-admin"
            className="mt-4 rounded-xl border bg-accent p-3 text-sm font-semibold text-accent-foreground"
          >
            {t('premium.adminGift')}
          </p>
        ) : null}

        {data.adminGift ? null : (
        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-sm font-bold">{t('premium.plan.free')}</p>
            <p className="mt-1 text-2xl font-extrabold">0 $</p>
            <p className="text-xs text-muted-foreground">{t('premium.freeNote')}</p>
          </article>
          {(['monthly', 'yearly'] as const).map((planId) => {
            const plan = plans[planId]
            return (
              <article key={planId} className="rounded-xl border bg-card p-4 text-card-foreground">
                <p className="text-sm font-bold">
                  {planId === 'monthly' ? t('premium.plan.monthly') : t('premium.plan.yearly')}
                </p>
                <p className="mt-1 text-2xl font-extrabold">
                  {plan.price} $
                  <span className="text-xs font-medium text-muted-foreground">
                    {planId === 'monthly' ? t('premium.perMonth') : t('premium.perYear')}
                  </span>
                </p>
                {planId === 'yearly' ? (
                  <p className="mt-1 text-xs font-semibold text-primary">-30 %</p>
                ) : null}
                <Link
                  to="/checkout"
                  search={{ plan: planId }}
                  className={cn(buttonVariants({ size: 'sm' }), 'mt-3 w-full')}
                >
                  <CreditCard />
                  {t('premium.payCard')}
                </Link>
              </article>
            )
          })}
        </section>
        )}

        <section className="mt-6 overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">{t('premium.limit.feature')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('premium.plan.free')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('premium.plan.monthly')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('premium.plan.yearly')}</th>
              </tr>
            </thead>
            <tbody>
              {LIMIT_ROWS.map((row) => (
                <tr key={row.key} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {t(row.label)}
                  </th>
                  {(['free', 'monthly', 'yearly'] as const).map((planId) => {
                    const plan = limits[planId]
                    const value =
                      row.key === 'storage'
                        ? `${plan.storageMb} Mo`
                        : row.key === 'video'
                          ? `${plan.videoMb} Mo`
                          : row.key === 'pdf'
                            ? `${plan.pdfMb} Mo`
                            : row.key === 'voice'
                              ? `${plan.voiceMinutes} min`
                              : row.key === 'ai'
                                ? `${plan.aiCreditsPerDay}`
                                : row.key === 'boosts'
                                  ? `${plan.boostsPerMonth}`
                                  : plan.proPage
                                    ? t('common.yes')
                                    : '—'
                    return (
                      <td key={planId} className="px-3 py-2 text-right">
                        {value}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {data.adminGift ? null : (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="size-4" aria-hidden="true" />
            {t('premium.packs')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('premium.packsHint')}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {Object.values(packs).map((pack) => (
              <li
                key={pack.id}
                className="rounded-xl border bg-card p-3 text-center text-card-foreground"
              >
                <p className="text-lg font-extrabold">{pack.credits}</p>
                <p className="text-xs text-muted-foreground">{t('premium.credits')}</p>
                <p className="mt-1 text-sm font-bold">{pack.price} $</p>
              </li>
            ))}
          </ul>
        </section>
        )}

        {data.adminGift ? null : <MobileMoneyForm />}

        {!data.adminGift && requests && requests.items.length > 0 ? (
          <section className="mt-6" data-testid="my-payments">
            <h2 className="text-sm font-bold">{t('pay.myRequests')}</h2>
            <ul className="mt-3 grid gap-2">
              {requests.items.map((request) => (
                <li
                  key={request.id}
                  data-testid="my-payment-row"
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{itemLabel(request.item)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {request.operator} · {request.transactionId}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-bold">
                      {request.amount} {request.currency}
                    </span>
                    <span
                      className={
                        request.status === 'approved'
                          ? 'text-xs font-semibold text-primary'
                          : request.status === 'rejected'
                            ? 'text-xs font-semibold text-destructive'
                            : 'text-xs font-semibold text-muted-foreground'
                      }
                    >
                      {statusLabel(request.status)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-6 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <Smartphone className="size-4" aria-hidden="true" />
            {t('premium.freeKeeps')}
          </p>
          <p className="mt-1 flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t('premium.freeKeepsBody')}
          </p>
          <p className="mt-1 flex items-start gap-2">
            <BadgeCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t('premium.secureHint')}
          </p>
        </section>
      </div>
    </AppShell>
  )
}
