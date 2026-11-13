import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Smartphone } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'

const OPERATORS = [
  { id: 'orange', label: 'Orange Money' },
  { id: 'airtel', label: 'Airtel Money' },
  { id: 'mpesa', label: 'M-Pesa' },
  { id: 'afrimoney', label: 'AfriMoney' },
] as const

const ITEMS = [
  { id: 'monthly', kind: 'plan' },
  { id: 'yearly', kind: 'plan' },
  { id: 'credits50', kind: 'credits' },
  { id: 'credits150', kind: 'credits' },
  { id: 'credits500', kind: 'credits' },
] as const

function formatAmount(amount: number, currency: string): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount)} ${currency}`
}

export function MobileMoneyForm() {
  const { t } = useI18n()
  const settings = useQuery(api.billing.paymentSettings, {})
  const entitlement = useQuery(api.billing.entitlement, {})
  const submit = useMutation(api.billing.submitMobileMoney)

  const [item, setItem] = useState<string>('monthly')
  const [operator, setOperator] = useState<string>('airtel')
  const [phone, setPhone] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  // Operators switched off by the admin never reach the client form.
  const visibleOperators = OPERATORS.filter((entry) => {
    const config = settings?.operators.find((item) => item.id === entry.id)
    return config ? config.enabled !== false : entry.id === 'airtel'
  })
  const activeOperator = visibleOperators.some((entry) => entry.id === operator)
    ? operator
    : (visibleOperators[0]?.id ?? '')
  const operatorInfo = settings?.operators.find((entry) => entry.id === activeOperator)
  const operatorReady =
    !!operatorInfo?.merchantNumber && operatorInfo.merchantNumber !== 'À COMPLÉTER'
  const amount =
    item === 'yearly'
      ? (settings?.yearlyAmount ?? 0)
      : item === 'monthly'
        ? (settings?.monthlyAmount ?? 0)
        : Math.round(
            ((entitlement?.catalog.packs[item as 'credits50']?.price ?? 0) *
              (settings?.monthlyAmount ?? 0)) /
              5,
          )
  const currency = settings?.currency ?? 'CDF'
  const mainNumber =
    settings?.operators.find((entry) => entry.id === 'airtel')?.merchantNumber ?? ''

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSent(false)
    setBusy(true)
    try {
      const result = await submit({ item, operator: activeOperator, phone, transactionId })
      if (result.ok) {
        setSent(true)
        setPhone('')
        setTransactionId('')
        return
      }
      const messages: Record<string, string> = {
        INVALID_PHONE: t('pay.phoneError'),
        INVALID_TRANSACTION: t('pay.transactionError'),
        ALREADY_PENDING: t('pay.alreadyPending'),
        DUPLICATE_TRANSACTION: t('pay.duplicateTransaction'),
        INVALID_OPERATOR: t('pay.operatorMissing'),
      }
      setError(messages[result.code] ?? t('pay.error'))
    } catch {
      setError(t('pay.error'))
    } finally {
      setBusy(false)
    }
  }

  if (settings === undefined || entitlement === undefined) {
    return (
      <div className="mt-4 flex justify-center py-8">
        <Spinner className="size-5" />
      </div>
    )
  }

  return (
    <section
      data-testid="mobile-money"
      className="mt-6 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Smartphone className="size-4" aria-hidden="true" />
        {t('pay.mobileTitle')}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('pay.mobileIntro')}</p>
      {mainNumber && visibleOperators.some((entry) => entry.id === 'airtel') ? (
        <p
          data-testid="pay-main-number"
          className="mt-3 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-foreground"
        >
          {t('pay.receivingNumber')} : <span className="font-mono">{mainNumber}</span> (Airtel Money)
        </p>
      ) : null}

      <div className="mt-4 grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('pay.chooseOffer')}
        </p>
        <div className="flex flex-wrap gap-2">
          {ITEMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-testid={`pay-item-${entry.id}`}
              onClick={() => setItem(entry.id)}
              aria-pressed={item === entry.id}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                item === entry.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'
              }`}
            >
              {t(`pay.item.${entry.id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('pay.chooseOperator')}
        </p>
        {visibleOperators.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            {t('pay.noOperator')}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {visibleOperators.map((entry) => {
            const config = settings?.operators.find((item) => item.id === entry.id)
            const number = config?.merchantNumber?.trim() ?? ''
            const ready = number.length > 0 && number !== 'À COMPLÉTER'
            return (
              <button
                key={entry.id}
                type="button"
                data-testid={`pay-operator-${entry.id}`}
                onClick={() => {
                  if (ready) setOperator(entry.id)
                }}
                aria-pressed={activeOperator === entry.id}
                aria-disabled={!ready}
                disabled={!ready}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                  activeOperator === entry.id ? 'border-primary bg-accent' : 'bg-card'
                } ${ready ? '' : 'cursor-not-allowed opacity-50'}`}
              >
                <span className="block">{entry.label}</span>
                {!ready ? (
                  <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">
                    {t('pay.soon')}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <dl className="mt-4 grid gap-2 rounded-xl bg-muted p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{t('pay.amount')}</dt>
          <dd data-testid="pay-amount" className="font-bold">
            {formatAmount(amount, currency)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{t('pay.merchant')}</dt>
          <dd data-testid="pay-merchant" className="font-mono font-bold">
            {operatorInfo?.merchantNumber || t('pay.notConfigured')}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{t('pay.ussd')}</dt>
          <dd data-testid="pay-ussd" className="font-mono font-bold">
            {operatorInfo?.ussdCode || t('pay.notConfigured')}
          </dd>
        </div>
        {operatorInfo?.instructions ? (
          <p className="text-xs text-muted-foreground">{operatorInfo.instructions}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('pay.instructionsPending')}</p>
        )}
      </dl>

      <form onSubmit={onSubmit} noValidate className="mt-4 grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="pay-phone">{t('pay.phoneLabel')}</Label>
          <Input
            id="pay-phone"
            data-testid="pay-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+243 …"
            maxLength={24}
            disabled={busy}
            className="h-12"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-transaction">{t('pay.transactionLabel')}</Label>
          <Input
            id="pay-transaction"
            data-testid="pay-transaction"
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            maxLength={60}
            disabled={busy}
            className="h-12"
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert" data-testid="pay-error">
            {error}
          </p>
        ) : null}
        {sent ? (
          <p className="text-sm font-semibold text-primary" role="status" data-testid="pay-sent">
            {t('pay.sent')}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          data-testid="pay-submit"
          disabled={
            busy ||
            !operatorReady ||
            phone.trim().length < 8 ||
            transactionId.trim().length < 4
          }
        >
          {busy ? t('pay.sending') : t('pay.submit')}
        </Button>
      </form>
    </section>
  )
}
