import { useCallback, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useAction, useQuery } from 'convex/react'
import { ArrowLeft, Crown } from 'lucide-react'
import { z } from 'zod'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import { PageTitle } from '@/components/page-parts'
import { useI18n } from '@/lib/i18n'

const meta = siteMetadata['/checkout']

const checkoutSearchSchema = z.object({
  plan: z.enum(['monthly', 'yearly']).default('monthly'),
})

export const Route = createFileRoute('/checkout')({
  validateSearch: checkoutSearchSchema,
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CheckoutPage,
})

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined
const stripePromise = publishableKey ? loadStripe(publishableKey) : null

function CheckoutPage() {
  const { t } = useI18n()
  const { plan } = Route.useSearch()
  const premiumStatus = useQuery(api.premium.status)
  const createCheckout = useAction(api.stripe.createSubscriptionCheckout)

  const fetchClientSecret = useCallback(async () => {
    const { clientSecret } = await createCheckout({ plan })
    return clientSecret
  }, [createCheckout, plan])

  const options = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret])

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 py-6">
      <Link
        to="/cahier"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('premium.back')}
      </Link>

      <div className="mt-4 flex items-center gap-2">
        <Crown className="size-5 text-brand-yellow" aria-hidden="true" />
        <PageTitle>{t('premium.checkoutTitle')}</PageTitle>
      </div>
      <p className="text-sm text-muted-foreground">{t('premium.checkoutHint')}</p>

      <div
        data-testid="checkout-embed"
        data-state={stripePromise ? 'ready' : 'error'}
        className="mt-4 overflow-hidden rounded-xl border bg-card p-1"
      >
        {stripePromise && premiumStatus?.signedIn ? (
          <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        ) : premiumStatus && !premiumStatus.signedIn ? (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">{t('premium.signIn')}</p>
            <Link
              to="/auth"
              className="mt-2 inline-block rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              {t('auth.signIn')}
            </Link>
          </div>
        ) : premiumStatus ? (
          <p className="p-4 text-sm text-destructive">{t('premium.error')}</p>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{t('premium.loading')}</p>
        )}
      </div>
    </main>
  )
}
