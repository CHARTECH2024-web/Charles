import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  BellRing,
  Check,
  Coins,
  Crown,
  FileDown,
  FileSpreadsheet,
  ScanLine,
  Store,
  Target,
  Trash2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'
import { exportReportPdf, exportReportXlsx } from '@/lib/cahier-export'
import { cn } from '@/lib/utils'

export type ReportData = {
  period: 'day' | 'month' | 'year'
  label: string
  totals: {
    sales: number
    expenses: number
    profit: number
    receivable: number
    payable: number
    purchases: number
    salesCount: number
    stockValue: number
    lowStock: number
  }
  stock: {
    name: string
    unit: string
    stock: number
    price: number
    value: number
    low: boolean
  }[]
}

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground'

function formatAmount(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} CDF`
}

function Card({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'bad'
}) {
  return (
    <li className="rounded-xl border bg-card p-3 text-card-foreground">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-sm font-extrabold', tone === 'bad' && 'text-destructive')}>
        {value}
      </p>
    </li>
  )
}

// --- Reports ---------------------------------------------------------------

export function ReportsTab({ shopId }: { shopId?: Id<'shops'> }) {
  const { t } = useI18n()
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('day')
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const report = useQuery(api.cahier_plus.report, {
    period,
    ...(shopId ? { shopId } : {}),
  })

  const labels = {
    title: t('cahier.report.title'),
    period: t('cahier.report.period'),
    sales: t('cahier.totals.sales'),
    expenses: t('cahier.totals.expenses'),
    profit: t('cahier.report.profit'),
    receivable: t('cahier.totals.receivable'),
    payable: t('cahier.totals.payable'),
    purchases: t('cahier.purchase.monthTotal'),
    stockValue: t('cahier.product.value'),
    lowStock: t('cahier.lowStockAlert'),
    stock: t('cahier.report.stock'),
    product: t('cahier.product.name'),
    quantity: t('cahier.product.stock'),
    unitPrice: t('cahier.product.price'),
    value: t('cahier.product.value'),
  }

  async function download(kind: 'pdf' | 'xlsx') {
    if (!report) return
    setBusy(kind)
    try {
      const data: ReportData = {
        period: report.period,
        label: report.label,
        totals: report.totals,
        stock: report.stock,
      }
      if (kind === 'pdf') await exportReportPdf(data, labels)
      else await exportReportXlsx(data, labels)
    } catch {
      toast.error(t('cahier.report.exportError'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-testid="cahier-reports" data-state={report ? 'ready' : 'loading'} className="mt-4">
      <div className="flex gap-2">
        {(['day', 'month', 'year'] as const).map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={period === option ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setPeriod(option)}
            data-testid={`report-period-${option}`}
          >
            {t(`cahier.report.${option}`)}
          </Button>
        ))}
      </div>

      {!report ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm font-bold capitalize">{report.label}</p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            <Card label={t('cahier.totals.sales')} value={formatAmount(report.totals.sales)} />
            <Card label={t('cahier.totals.expenses')} value={formatAmount(report.totals.expenses)} />
            <Card
              label={t('cahier.report.profit')}
              value={formatAmount(report.totals.profit)}
              tone={report.totals.profit >= 0 ? undefined : 'bad'}
            />
            <Card label={t('cahier.totals.receivable')} value={formatAmount(report.totals.receivable)} />
            <Card label={t('cahier.totals.payable')} value={formatAmount(report.totals.payable)} />
            <Card label={t('cahier.purchase.monthTotal')} value={formatAmount(report.totals.purchases)} />
            <Card label={t('cahier.product.value')} value={formatAmount(report.totals.stockValue)} />
            <Card label={t('cahier.lowStockAlert')} value={`${report.totals.lowStock}`} />
          </ul>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void download('pdf')}
              disabled={busy !== null}
              data-testid="report-pdf"
              className="rounded-full"
            >
              {busy === 'pdf' ? <Spinner className="size-4" /> : <FileDown />}
              PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void download('xlsx')}
              disabled={busy !== null}
              data-testid="report-xlsx"
              className="rounded-full"
            >
              {busy === 'xlsx' ? <Spinner className="size-4" /> : <FileSpreadsheet />}
              Excel
            </Button>
          </div>

          <h3 className="mt-4 text-sm font-bold">{t('cahier.report.stock')}</h3>
          <ul className="mt-2 grid gap-1.5">
            {report.stock.map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
              >
                <span className="truncate font-semibold">{row.name}</span>
                <span className="text-muted-foreground">
                  {row.stock} {row.unit} · {formatAmount(row.value)}
                </span>
              </li>
            ))}
            {report.stock.length === 0 ? (
              <li className="text-xs text-muted-foreground">{t('cahier.product.empty')}</li>
            ) : null}
          </ul>
        </>
      )}
    </div>
  )
}

// --- Cash closing ----------------------------------------------------------

export function CashTab({ shopId }: { shopId?: Id<'shops'> }) {
  const { t, lang } = useI18n()
  const data = useQuery(api.cahier_plus.cashToday, { ...(shopId ? { shopId } : {}) })
  const closeCash = useMutation(api.cahier_plus.closeCash)
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amount = Number(counted.replace(/\s/g, '').replace(',', '.'))
    setSaving(true)
    try {
      const res = await closeCash({
        counted: amount,
        note,
        ...(shopId ? { shopId } : {}),
      })
      if (res.ok) {
        toast.success(t('cahier.cash.saved'))
        setCounted('')
        setNote('')
      } else {
        toast.error(t('cahier.invalid'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="cahier-cash" data-state={data ? 'ready' : 'loading'} className="mt-4">
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2">
            <Card label={t('cahier.totals.sales')} value={formatAmount(data.sales)} />
            <Card label={t('cahier.totals.expenses')} value={formatAmount(data.expenses)} />
            <Card label={t('cahier.cash.expected')} value={formatAmount(data.expected)} />
            <Card
              label={t('cahier.cash.today')}
              value={data.today ? formatAmount(data.today.counted) : '—'}
            />
          </ul>

          <form onSubmit={submit} className="mt-3 rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-sm font-bold">{t('cahier.cash.title')}</p>
            <div className="mt-3 grid gap-3">
              <div>
                <Label htmlFor="cash-counted">{t('cahier.cash.counted')}</Label>
                <Input
                  id="cash-counted"
                  data-testid="cash-counted"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  inputMode="decimal"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cash-note">{t('cahier.note')}</Label>
                <Input
                  id="cash-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  className="mt-1"
                />
              </div>
            </div>
            <Button
              type="submit"
              data-testid="cash-submit"
              disabled={saving}
              className="mt-3 w-full rounded-full font-bold"
            >
              {saving ? <Spinner className="size-4" /> : <Wallet />}
              {t('cahier.cash.close')}
            </Button>
          </form>

          {data.closings.length > 0 ? (
            <>
              <h3 className="mt-4 text-sm font-bold">{t('cahier.cash.history')}</h3>
              <ul className="mt-2 grid gap-1.5">
                {data.closings.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
                  >
                    <span className="font-semibold">
                      {new Date(`${row.day}T12:00:00`).toLocaleDateString(lang)}
                    </span>
                    <span
                      className={cn(
                        row.difference === 0 ? 'text-muted-foreground' : 'text-destructive',
                      )}
                    >
                      {formatAmount(row.counted)} · {row.difference >= 0 ? '+' : ''}
                      {formatAmount(row.difference)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

// --- Customer credit -------------------------------------------------------

export function CreditsTab({ shopId }: { shopId?: Id<'shops'> }) {
  const { t, lang } = useI18n()
  const credits = useQuery(api.cahier_plus.listCredits, {
    ...(shopId ? { shopId } : {}),
  })
  const addCredit = useMutation(api.cahier_plus.addCredit)
  const payCredit = useMutation(api.cahier_plus.payCredit)
  const remindCredit = useMutation(api.cahier_plus.remindCredit)
  const removeCredit = useMutation(api.cahier_plus.removeCredit)

  const [customerName, setCustomerName] = useState('')
  const [label, setLabel] = useState('')
  const [total, setTotal] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [payAmount, setPayAmount] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await addCredit({
        customerName,
        label,
        total: Number(total.replace(',', '.')),
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).getTime() : Date.now(),
        ...(shopId ? { shopId } : {}),
      })
      if (res.ok) {
        toast.success(t('cahier.added'))
        setCustomerName('')
        setLabel('')
        setTotal('')
        setDueDate('')
      } else {
        toast.error(t('cahier.invalid'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="cahier-credits" data-state={credits ? 'ready' : 'loading'} className="mt-4">
      <form onSubmit={submit} className="rounded-xl border bg-card p-4 text-card-foreground">
        <p className="text-sm font-bold">{t('cahier.credit.add')}</p>
        <div className="mt-3 grid gap-3">
          <div>
            <Label htmlFor="credit-name">{t('cahier.credit.customer')}</Label>
            <Input
              id="credit-name"
              data-testid="credit-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={60}
              required
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="credit-total">{t('cahier.credit.total')}</Label>
              <Input
                id="credit-total"
                data-testid="credit-total"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                inputMode="decimal"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="credit-due">{t('cahier.credit.due')}</Label>
              <Input
                id="credit-due"
                data-testid="credit-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="credit-label">{t('cahier.label')}</Label>
            <Input
              id="credit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          type="submit"
          data-testid="credit-submit"
          disabled={saving}
          className="mt-3 w-full rounded-full font-bold"
        >
          {saving ? <Spinner className="size-4" /> : <Coins />}
          {t('cahier.credit.add')}
        </Button>
      </form>

      {!credits ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      ) : credits.results.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t('cahier.credit.empty')}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {credits.results.map((credit) => (
            <li
              key={credit.id}
              data-testid="cahier-credit-row"
              data-customer={credit.customerName}
              className="rounded-xl border bg-card p-3 text-card-foreground"
            >
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                {credit.customerName}
                {credit.overdue ? (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                    {t('cahier.credit.overdue')}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatAmount(credit.total)} · {t('cahier.credit.remaining')}{' '}
                {formatAmount(credit.remaining)} · {t('cahier.credit.due')}{' '}
                {new Date(credit.dueDate).toLocaleDateString(lang)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t('cahier.credit.reminders')}: {credit.reminderCount}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`${t('cahier.credit.pay')} ${credit.customerName}`}
                  value={payAmount[credit.id] ?? ''}
                  onChange={(e) =>
                    setPayAmount((prev) => ({ ...prev, [credit.id]: e.target.value }))
                  }
                  inputMode="decimal"
                  placeholder={t('cahier.credit.amount')}
                  className="h-9 w-28"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const amount = Number((payAmount[credit.id] ?? '').replace(',', '.'))
                    const res = await payCredit({ creditId: credit.id, amount })
                    if (res.ok) {
                      toast.success(t('cahier.credit.paid'))
                      setPayAmount((prev) => ({ ...prev, [credit.id]: '' }))
                    } else {
                      toast.error(t('cahier.invalid'))
                    }
                  }}
                >
                  <Check />
                  {t('cahier.credit.pay')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await remindCredit({ creditId: credit.id })
                    toast.success(t('cahier.credit.reminded'))
                  }}
                >
                  <BellRing />
                  {t('cahier.credit.remind')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`${t('common.delete')} ${credit.customerName}`}
                  onClick={() => void removeCredit({ creditId: credit.id })}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- Goals and budgets -----------------------------------------------------

export function TargetsTab() {
  const { t } = useI18n()
  const targets = useQuery(api.cahier_plus.listTargets)
  const report = useQuery(api.cahier_plus.report, { period: 'month' })
  const saveTarget = useMutation(api.cahier_plus.saveTarget)
  const [goal, setGoal] = useState('')
  const [budget, setBudget] = useState('')
  const [saving, setSaving] = useState(false)

  const monthGoal = targets?.results.find((row) => row.kind === 'goal' && row.period === 'month')
  const monthBudget = targets?.results.find((row) => row.kind === 'budget' && row.period === 'month')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (goal) {
        await saveTarget({
          kind: 'goal',
          period: 'month',
          amount: Number(goal.replace(',', '.')),
        })
      }
      if (budget) {
        await saveTarget({
          kind: 'budget',
          period: 'month',
          amount: Number(budget.replace(',', '.')),
        })
      }
      toast.success(t('cahier.targets.saved'))
    } catch {
      toast.error(t('cahier.invalid'))
    } finally {
      setSaving(false)
    }
  }

  const sales = report?.totals.sales ?? 0
  const expenses = report?.totals.expenses ?? 0
  const goalProgress = monthGoal && monthGoal.amount > 0 ? Math.min(1, sales / monthGoal.amount) : 0
  const budgetProgress =
    monthBudget && monthBudget.amount > 0 ? Math.min(1, expenses / monthBudget.amount) : 0

  return (
    <div data-testid="cahier-targets" data-state={targets ? 'ready' : 'loading'} className="mt-4">
      <form onSubmit={submit} className="rounded-xl border bg-card p-4 text-card-foreground">
        <p className="text-sm font-bold">{t('cahier.targets.title')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="target-goal">{t('cahier.targets.goal')}</Label>
            <Input
              id="target-goal"
              data-testid="target-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              inputMode="decimal"
              placeholder={monthGoal ? `${monthGoal.amount}` : ''}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="target-budget">{t('cahier.targets.budget')}</Label>
            <Input
              id="target-budget"
              data-testid="target-budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              inputMode="decimal"
              placeholder={monthBudget ? `${monthBudget.amount}` : ''}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          type="submit"
          data-testid="target-submit"
          disabled={saving}
          className="mt-3 w-full rounded-full font-bold"
        >
          {saving ? <Spinner className="size-4" /> : <Target />}
          {t('cahier.targets.save')}
        </Button>
      </form>

      <div className="mt-3 grid gap-2">
        {[
          {
            key: 'goal',
            label: t('cahier.targets.goal'),
            amount: monthGoal?.amount ?? 0,
            actual: sales,
            progress: goalProgress,
          },
          {
            key: 'budget',
            label: t('cahier.targets.budget'),
            amount: monthBudget?.amount ?? 0,
            actual: expenses,
            progress: budgetProgress,
          },
        ].map((row) => (
          <div key={row.key} className="rounded-xl border bg-card p-3 text-card-foreground">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold">{row.label}</span>
              <span className="text-muted-foreground">
                {formatAmount(row.actual)} / {formatAmount(row.amount)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand-yellow"
                style={{ width: `${Math.round(row.progress * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Shops and sellers -----------------------------------------------------

export function ShopsTab() {
  const { t } = useI18n()
  const shops = useQuery(api.cahier_plus.listShops)
  const createShop = useMutation(api.cahier_plus.createShop)
  const addMember = useMutation(api.cahier_plus.addMember)
  const removeMember = useMutation(api.cahier_plus.removeMember)
  const removeShop = useMutation(api.cahier_plus.removeShop)

  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Id<'shops'> | null>(null)
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState<'manager' | 'seller'>('seller')

  const activeShop = selected ?? shops?.shops[0]?.id ?? null
  const activeMembers = useQuery(
    api.cahier_plus.shopMembers,
    activeShop ? { shopId: activeShop } : 'skip',
  )

  return (
    <div data-testid="cahier-shops" data-state={shops ? 'ready' : 'loading'} className="mt-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const res = await createShop({ name })
          if (res.ok) {
            toast.success(t('cahier.shops.created'))
            setName('')
          } else {
            toast.error(t('cahier.invalid'))
          }
        }}
        className="rounded-xl border bg-card p-4 text-card-foreground"
      >
        <p className="text-sm font-bold">{t('cahier.shops.add')}</p>
        <div className="mt-3 flex gap-2">
          <Input
            aria-label={t('cahier.shops.name')}
            data-testid="shop-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            className="h-9"
          />
          <Button type="submit" size="sm" className="shrink-0 rounded-full" data-testid="shop-submit">
            <Store />
          </Button>
        </div>
      </form>

      {!shops ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {shops.shops.map((shop) => (
            <li key={shop.id}>
              <button
                type="button"
                onClick={() => setSelected(shop.id)}
                data-testid="cahier-shop-row"
                data-name={shop.name}
                className={cn(
                  'w-full rounded-xl border p-3 text-left text-sm',
                  activeShop === shop.id ? 'border-brand-yellow bg-brand-yellow/10' : 'bg-card',
                )}
              >
                <span className="font-bold">{shop.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{shop.role}</span>
              </button>
            </li>
          ))}
          {shops.shops.length === 0 ? (
            <li className="text-xs text-muted-foreground">{t('cahier.shops.empty')}</li>
          ) : null}
        </ul>
      )}

      {activeShop ? (
        <div className="mt-4 rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">{t('cahier.shops.team')}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t('cahier.shops.remove')}
              data-testid="shop-remove"
              onClick={async () => {
                const res = await removeShop({ shopId: activeShop })
                if (res.ok) {
                  toast.success(t('cahier.shops.removed'))
                  setSelected(null)
                } else {
                  toast.error(t('cahier.invalid'))
                }
              }}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              aria-label={t('cahier.shops.handle')}
              data-testid="member-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="pseudo.HZ"
              className="h-9"
            />
            <select
              aria-label={t('cahier.shops.role')}
              value={role}
              onChange={(e) => setRole(e.target.value as 'manager' | 'seller')}
              className={cn(selectClass, 'w-32')}
            >
              <option value="seller">{t('cahier.shops.seller')}</option>
              <option value="manager">{t('cahier.shops.manager')}</option>
            </select>
            <Button
              type="button"
              size="sm"
              className="shrink-0 rounded-full"
              data-testid="member-submit"
              onClick={async () => {
                const res = await addMember({ shopId: activeShop, handle, role })
                if (res.ok) {
                  toast.success(t('cahier.shops.memberAdded'))
                  setHandle('')
                } else {
                  toast.error(t('cahier.shops.memberError'))
                }
              }}
            >
              <Crown />
            </Button>
          </div>
          <ul className="mt-3 grid gap-1.5">
            {(activeMembers?.members ?? []).map((member) => (
              <li
                key={member.userId}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
              >
                <span className="truncate font-semibold">{member.name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {member.role}
                  {member.role !== 'owner' ? (
                    <button
                      type="button"
                      aria-label={`${t('common.delete')} ${member.name}`}
                      onClick={() =>
                        void removeMember({ shopId: activeShop, userId: member.userId })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

// --- Barcode scanner -------------------------------------------------------

type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>
}

export function BarcodeScanner({
  onFound,
}: {
  onFound: (product: { id: string; name: string; price: number }) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const found = useQuery(
    api.cahier_plus.findByBarcode,
    manual.trim() ? { code: manual.trim() } : 'skip',
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let timer = 0

    async function start() {
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike
        }
      ).BarcodeDetector
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        setError(t('cahier.scan.unsupported'))
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'qr_code'],
        })
        timer = window.setInterval(async () => {
          if (!videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0) setManual(codes[0].rawValue)
          } catch {
            // Ignore single-frame detection failures.
          }
        }, 600)
      } catch {
        setError(t('cahier.scan.denied'))
      }
    }

    void start()
    return () => {
      cancelled = true
      window.clearInterval(timer)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [open, t])

  useEffect(() => {
    if (!found?.product || !manual.trim()) return
    onFound(found.product)
    setOpen(false)
    setManual('')
    toast.success(found.product.name)
  }, [found, manual, onFound])

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="barcode-open"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className="w-full rounded-full"
      >
        <ScanLine />
        {t('cahier.scan.open')}
      </Button>
    )
  }

  return (
    <div data-testid="barcode-panel" className="rounded-xl border bg-card p-3 text-card-foreground">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{t('cahier.scan.title')}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('common.close')}
        </Button>
      </div>
      <video
        ref={videoRef}
        muted
        playsInline
        className="mt-2 aspect-video w-full rounded-lg bg-brand-black object-cover"
      />
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <Input
        aria-label={t('cahier.scan.manual')}
        data-testid="barcode-manual"
        value={manual}
        onChange={(e) => setManual(e.target.value)}
        placeholder={t('cahier.scan.manual')}
        className="mt-2 h-9"
      />
      {manual && found && !found.product ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('cahier.scan.notFound')}</p>
      ) : null}
    </div>
  )
}
