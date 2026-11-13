import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Check, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'

const OPERATOR_IDS = [
  { id: 'orange', label: 'Orange Money' },
  { id: 'airtel', label: 'Airtel Money' },
  { id: 'mpesa', label: 'M-Pesa' },
  { id: 'afrimoney', label: 'AfriMoney' },
] as const

type OperatorForm = {
  id: string
  merchantNumber: string
  ussdCode: string
  instructions: string
  enabled: boolean
}

export function PaymentsAdmin() {
  const { t } = useI18n()
  const pending = useQuery(api.billing.pendingRequests, {})
  const settings = useQuery(api.billing.paymentSettings, {})
  const review = useMutation(api.billing.reviewRequest)
  const save = useMutation(api.billing.savePaymentSettings)

  const [currency, setCurrency] = useState('CDF')
  const [monthlyAmount, setMonthlyAmount] = useState('14000')
  const [yearlyAmount, setYearlyAmount] = useState('117600')
  const [operators, setOperators] = useState<OperatorForm[]>([])
  const [saving, setSaving] = useState(false)
  const itemLabel = (item: string) => {
    if (item === 'yearly') return t('pay.item.yearly')
    if (item === 'credits50') return t('pay.item.credits50')
    if (item === 'credits150') return t('pay.item.credits150')
    if (item === 'credits500') return t('pay.item.credits500')
    return t('pay.item.monthly')
  }

  useEffect(() => {
    if (!settings) return
    setCurrency(settings.currency)
    setMonthlyAmount(String(settings.monthlyAmount))
    setYearlyAmount(String(settings.yearlyAmount))
    setOperators(
      OPERATOR_IDS.map((entry) => {
        const found = settings.operators.find((item) => item.id === entry.id)
        return {
          id: entry.id,
          merchantNumber: found?.merchantNumber ?? '',
          ussdCode: found?.ussdCode ?? '',
          instructions: found?.instructions ?? '',
          enabled: found?.enabled ?? true,
        }
      }),
    )
  }, [settings])

  function patchOperator(id: string, patch: Partial<OperatorForm>) {
    setOperators((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    )
  }

  async function onSave() {
    setSaving(true)
    try {
      await save({
        currency,
        monthlyAmount: Number(monthlyAmount) || 0,
        yearlyAmount: Number(yearlyAmount) || 0,
        operators,
      })
      toast.success(t('admin.pay.saved'))
    } catch {
      toast.error(t('admin.pay.saveError'))
    } finally {
      setSaving(false)
    }
  }

  // The on/off switch saves immediately: cutting an operator must never depend
  // on remembering to press "Enregistrer".
  async function toggleOperator(id: string, enabled: boolean) {
    const next = operators.map((entry) => (entry.id === id ? { ...entry, enabled } : entry))
    const previous = operators
    setOperators(next)
    setSaving(true)
    try {
      await save({
        currency,
        monthlyAmount: Number(monthlyAmount) || 0,
        yearlyAmount: Number(yearlyAmount) || 0,
        operators: next,
      })
      toast.success(enabled ? t('admin.pay.switchedOn') : t('admin.pay.switchedOff'))
    } catch {
      setOperators(previous)
      toast.error(t('admin.pay.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function onReview(requestId: Id<'mobileMoneyRequests'>, approve: boolean) {
    try {
      const result = await review({ requestId, approve })
      if (!result.ok) toast.error(t('admin.pay.reviewError'))
      else toast.success(approve ? t('admin.pay.approved') : t('admin.pay.rejected'))
    } catch {
      toast.error(t('admin.pay.reviewError'))
    }
  }

  if (!pending || !settings) {
    return (
      <div className="mt-6 flex justify-center py-10">
        <Spinner className="size-5" />
      </div>
    )
  }

  if (!pending.isAdmin) return null

  return (
    <>
      <section className="mt-8" data-testid="admin-payments">
        <h2 className="text-sm font-bold">{t('admin.pay.pendingTitle')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('admin.pay.pendingHint')}</p>
        {pending.items.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t('admin.pay.pendingEmpty')}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {pending.items.map((item) => (
              <li
                key={item.id}
                data-testid="admin-payment-row"
                className="rounded-xl border bg-card p-3 text-sm text-card-foreground"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{item.memberName}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.memberEmail}</p>
                    <p className="mt-1 text-xs">
                      {itemLabel(item.item)} · {item.operator} · {item.phone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('admin.pay.transaction')} : {item.transactionId}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-bold">
                    {item.amount} {item.currency}
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    data-testid={`admin-approve-${item.id}`}
                    onClick={() => void onReview(item.id, true)}
                  >
                    <Check />
                    {t('admin.pay.approve')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid={`admin-reject-${item.id}`}
                    onClick={() => void onReview(item.id, false)}
                  >
                    <X />
                    {t('admin.pay.reject')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" data-testid="admin-payment-settings">
        <h2 className="text-sm font-bold">{t('admin.pay.settingsTitle')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('admin.pay.settingsHint')}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pay-currency">{t('admin.pay.currency')}</Label>
            <Input
              id="pay-currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              maxLength={8}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-monthly">{t('admin.pay.monthlyAmount')}</Label>
            <Input
              id="pay-monthly"
              inputMode="numeric"
              value={monthlyAmount}
              onChange={(event) => setMonthlyAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-yearly">{t('admin.pay.yearlyAmount')}</Label>
            <Input
              id="pay-yearly"
              inputMode="numeric"
              value={yearlyAmount}
              onChange={(event) => setYearlyAmount(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {OPERATOR_IDS.map((entry) => {
            const value =
              operators.find((item) => item.id === entry.id) ?? {
                id: entry.id,
                merchantNumber: '',
                ussdCode: '',
                instructions: '',
                enabled: true,
              }
            return (
              <fieldset key={entry.id} className="rounded-xl border p-3">
                <legend className="px-1 text-xs font-bold">{entry.label}</legend>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold">
                    {value.enabled ? t('admin.pay.active') : t('admin.pay.inactive')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={value.enabled}
                    aria-label={`${entry.label} — ${
                      value.enabled ? t('admin.pay.active') : t('admin.pay.inactive')
                    }`}
                    data-testid={`toggle-${entry.id}`}
                    data-state={value.enabled ? 'on' : 'off'}
                    disabled={saving}
                    onClick={() => void toggleOperator(entry.id, !value.enabled)}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
                      value.enabled ? 'border-primary bg-primary' : 'border-border bg-muted'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block size-5 rounded-full bg-background shadow transition-transform ${
                        value.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`merchant-${entry.id}`}>{t('admin.pay.merchant')}</Label>
                    <Input
                      id={`merchant-${entry.id}`}
                      data-testid={`merchant-${entry.id}`}
                      value={value.merchantNumber}
                      onChange={(event) =>
                        patchOperator(entry.id, { merchantNumber: event.target.value })
                      }
                      placeholder={t('admin.pay.toComplete')}
                      maxLength={40}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`ussd-${entry.id}`}>{t('admin.pay.ussd')}</Label>
                    <Input
                      id={`ussd-${entry.id}`}
                      data-testid={`ussd-${entry.id}`}
                      value={value.ussdCode}
                      onChange={(event) => patchOperator(entry.id, { ussdCode: event.target.value })}
                      placeholder={t('admin.pay.toComplete')}
                      maxLength={60}
                    />
                  </div>
                </div>
                <div className="mt-2 grid gap-1.5">
                  <Label htmlFor={`instructions-${entry.id}`}>{t('admin.pay.instructions')}</Label>
                  <Textarea
                    id={`instructions-${entry.id}`}
                    data-testid={`instructions-${entry.id}`}
                    value={value.instructions}
                    onChange={(event) =>
                      patchOperator(entry.id, { instructions: event.target.value })
                    }
                    placeholder={t('admin.pay.toComplete')}
                    maxLength={300}
                    rows={2}
                  />
                </div>
              </fieldset>
            )
          })}
        </div>

        <Button
          type="button"
          className="mt-4"
          data-testid="admin-save-settings"
          onClick={() => void onSave()}
          disabled={saving}
        >
          <Save />
          {saving ? t('admin.pay.saving') : t('admin.pay.save')}
        </Button>
      </section>
    </>
  )
}
