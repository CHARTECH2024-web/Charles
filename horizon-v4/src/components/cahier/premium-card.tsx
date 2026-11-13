import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { Check, Crown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export type PremiumPlanId = 'monthly' | 'yearly'

/** Free plan summary + premium upsell (or subscription management). */
export function PremiumCard({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const status = useQuery(api.premium.status)
  const openPortal = useAction(api.stripe.createPortalSession)
  const [plan, setPlan] = useState<PremiumPlanId>('monthly')
  const [busy, setBusy] = useState(false)

  if (!status) {
    return (
      <div className="mt-3 rounded-xl border bg-card p-4">
        <div className="flex justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const plans = status.plans
  const until = status.currentPeriodEnd
    ? new Date(status.currentPeriodEnd).toLocaleDateString(lang)
    : null

  async function manage() {
    setBusy(true)
    try {
      const { url } = await openPortal({})
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error(t('premium.portalError'))
    } finally {
      setBusy(false)
    }
  }

  function subscribe() {
    if (!status?.signedIn) {
      void navigate({ to: '/auth' })
      return
    }
    void navigate({ to: '/checkout', search: { plan } })
  }

  return (
    <section
      data-testid="cahier-premium"
      data-state={status.premium ? 'premium' : 'free'}
      className="mt-4 rounded-xl border border-brand-yellow/40 bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-yellow/20">
          <Crown className="size-4 text-brand-yellow" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
            {t('premium.title')}
            <span className="rounded-full bg-brand-yellow/20 px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
              {status.premium ? t('premium.active') : t('premium.subtitle')}
            </span>
          </p>
          {status.premium ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('premium.until')} {until ?? '—'}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t('premium.freeBody')}</p>
          )}
        </div>
      </div>

      {status.premium ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full rounded-full"
          onClick={() => void manage()}
          disabled={busy || !status.canManage}
          data-testid="premium-manage"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Crown />}
          {t('premium.manage')}
        </Button>
      ) : (
        <>
          <ul className="mt-3 grid gap-1.5 text-xs">
            {(['premium.perk1', 'premium.perk2', 'premium.perk3'] as const).map((key) => (
              <li key={key} className="flex items-center gap-2">
                <Check className="size-3.5 shrink-0 text-brand-yellow" aria-hidden="true" />
                {t(key)}
              </li>
            ))}
          </ul>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {(['monthly', 'yearly'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPlan(option)}
                data-testid={`premium-plan-${option}`}
                aria-pressed={plan === option}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  plan === option ? 'border-brand-yellow bg-brand-yellow/10' : 'border-border',
                )}
              >
                <p className="text-[11px] uppercase text-muted-foreground">
                  {option === 'monthly' ? t('premium.monthly') : t('premium.yearly')}
                </p>
                <p className="text-sm font-extrabold">
                  ${plans[option].price}
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {option === 'monthly' ? t('premium.perMonth') : t('premium.perYear')}
                  </span>
                </p>
              </button>
            ))}
          </div>

          {!compact ? (
            <Button
              type="button"
              className="mt-3 w-full rounded-full font-bold"
              onClick={subscribe}
              data-testid="premium-subscribe"
            >
              <Crown />
              {status.signedIn ? t('premium.cta') : t('premium.signIn')}
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}
