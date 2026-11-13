import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import {
  BookOpen,
  Check,
  FileDown,
  Minus,
  Package,
  Plus,
  ShoppingBasket,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { AppShell } from '@/components/app-shell'
import { EvolutionChart } from '@/components/cahier/evolution-chart'
import { PremiumCard } from '@/components/cahier/premium-card'
import {
  BarcodeScanner,
  CashTab,
  CreditsTab,
  ReportsTab,
  ShopsTab,
  TargetsTab,
} from '@/components/cahier/extra-tabs'
import { exportReceiptPdf } from '@/lib/cahier-export'
import {
  enqueueEntry,
  flushQueue,
  isOnline,
  listQueued,
} from '@/lib/offline-queue'
import { EmptyState, PageTitle, StatusBadge } from '@/components/page-parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useI18n, type TranslationKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const meta = siteMetadata['/cahier']

export const Route = createFileRoute('/cahier')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: CahierPage,
})

type EntryType = 'sale' | 'expense' | 'debt'
type Tab =
  | 'journal'
  | 'chart'
  | 'reports'
  | 'cash'
  | 'credits'
  | 'targets'
  | 'shops'
  | 'products'
  | 'contacts'
  | 'purchases'
type Period = 'day' | 'month' | 'twoYear'

function formatAmount(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} CDF`
}

function typeKey(type: EntryType) {
  if (type === 'sale') return 'cahier.type.sale' as const
  if (type === 'expense') return 'cahier.type.expense' as const
  return 'cahier.type.debt' as const
}

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground'

const CATEGORIES = {
  sale: ['sale_goods', 'sale_service', 'sale_credit', 'sale_other'],
  expense: [
    'expense_goods',
    'expense_rent',
    'expense_transport',
    'expense_salary',
    'expense_utilities',
    'expense_tax',
    'expense_supplies',
    'expense_other',
  ],
  debt: ['debt_receivable', 'debt_payable', 'debt_settlement'],
} as const

function todayValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`
}

function categoryLabel(t: (key: TranslationKey) => string, category?: string | null) {
  return category ? t(`cahier.category.${category}` as TranslationKey) : ''
}

function CahierPage() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('journal')
  const shops = useQuery(api.cahier_plus.listShops)
  const [activeShop, setActiveShop] = useState<Id<'shops'> | ''>('')
  const shopId = activeShop || undefined

  // A seller works in the shop by default, so their sales reach the owner.
  useEffect(() => {
    if (!shops || shops.shops.length === 0) return
    setActiveShop((current) => current || shops.shops[0].id)
  }, [shops])

  const tabs: { value: Tab; label: string }[] = [
    { value: 'journal', label: t('cahier.tab.journal') },
    { value: 'chart', label: t('cahier.tab.chart') },
    { value: 'reports', label: t('cahier.tab.reports') },
    { value: 'cash', label: t('cahier.tab.cash') },
    { value: 'credits', label: t('cahier.tab.credits') },
    { value: 'targets', label: t('cahier.tab.targets') },
    { value: 'shops', label: t('cahier.tab.shops') },
    { value: 'products', label: t('cahier.tab.products') },
    { value: 'contacts', label: t('cahier.tab.contacts') },
    { value: 'purchases', label: t('cahier.tab.purchases') },
  ]

  return (
    <AppShell>
      <PageTitle>{t('cahier.title')}</PageTitle>
      <p className="text-sm text-muted-foreground">{t('cahier.intro')}</p>

      {shops && shops.shops.length > 0 ? (
        <div className="mt-3">
          <Label htmlFor="cahier-shop">{t('cahier.shop.active')}</Label>
          <select
            id="cahier-shop"
            data-testid="cahier-shop-select"
            value={activeShop}
            onChange={(e) => setActiveShop(e.target.value as Id<'shops'> | '')}
            className={cn(selectClass, 'mt-1')}
          >
            <option value="">{t('cahier.shop.none')}</option>
            {shops.shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-4 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            data-testid={`cahier-tab-${item.value}`}
            onClick={() => setTab(item.value)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === item.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'journal' ? <JournalTab shopId={shopId} /> : null}
      {tab === 'chart' ? <ChartTab shopId={shopId} /> : null}
      {tab === 'reports' ? <ReportsTab shopId={shopId} /> : null}
      {tab === 'cash' ? <CashTab shopId={shopId} /> : null}
      {tab === 'credits' ? <CreditsTab shopId={shopId} /> : null}
      {tab === 'targets' ? <TargetsTab /> : null}
      {tab === 'shops' ? <ShopsTab /> : null}
      {tab === 'products' ? <ProductsTab shopId={shopId} /> : null}
      {tab === 'contacts' ? <ContactsTab shopId={shopId} /> : null}
      {tab === 'purchases' ? <PurchasesTab shopId={shopId} /> : null}
    </AppShell>
  )
}

// --- Journal ---------------------------------------------------------------

function JournalTab({ shopId }: { shopId?: Id<'shops'> }) {
  const { t, lang } = useI18n()
  const [filterType, setFilterType] = useState<'all' | EntryType>('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const data = useQuery(api.cahier.list, {
    ...(shopId ? { shopId } : {}),
    ...(filterType !== 'all' ? { type: filterType } : {}),
    ...(filterCategory !== 'all' ? { category: filterCategory } : {}),
  })
  const products = useQuery(api.cahier.products, { ...(shopId ? { shopId } : {}) })
  const contacts = useQuery(api.cahier.contacts, { ...(shopId ? { shopId } : {}) })
  const addEntry = useMutation(api.cahier.add)
  const removeEntry = useMutation(api.cahier.remove)
  const toggleSettled = useMutation(api.cahier.toggleSettled)
  const [pending, setPending] = useState(0)

  const [type, setType] = useState<EntryType>('sale')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('')
  const [occurredAt, setOccurredAt] = useState(todayValue)
  const [contactId, setContactId] = useState('')
  const [productId, setProductId] = useState('')
  const [debtDirection, setDebtDirection] = useState<'receivable' | 'payable'>(
    'receivable',
  )
  const [saving, setSaving] = useState(false)

  const types: { value: EntryType; label: string }[] = [
    { value: 'sale', label: t('cahier.type.sale') },
    { value: 'expense', label: t('cahier.type.expense') },
    { value: 'debt', label: t('cahier.type.debt') },
  ]
  const filterCategories =
    filterType === 'all'
      ? [...CATEGORIES.sale, ...CATEGORIES.expense, ...CATEGORIES.debt]
      : CATEGORIES[filterType]

  // Replay offline entries as soon as the device is back online.
  useEffect(() => {
    const refresh = () => setPending(listQueued().length)
    refresh()

    const sync = async () => {
      const result = await flushQueue((payload) =>
        addEntry({
          ...payload,
          contactId: payload.contactId as Id<'contacts'> | undefined,
          productId: payload.productId as Id<'products'> | undefined,
          shopId: payload.shopId as Id<'shops'> | undefined,
        }),
      )
      refresh()
      if (result.synced > 0) toast.success(`${result.synced} ${t('cahier.offline.synced')}`)
    }

    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    window.addEventListener('horizon:cahier-queue', refresh)
    if (isOnline()) void sync()
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('horizon:cahier-queue', refresh)
    }
  }, [addEntry, t])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = Number(amount.replace(/\s/g, '').replace(',', '.'))
    const qty = Number(quantity.replace(/\s/g, '').replace(',', '.'))
    const payload = {
      type,
      label,
      amount: parsed,
      note,
      ...(category ? { category } : {}),
      ...(occurredAt ? { occurredAt: new Date(`${occurredAt}T12:00:00`).getTime() } : {}),
      ...(contactId ? { contactId } : {}),
      ...(productId ? { productId } : {}),
      ...(qty > 0 ? { quantity: qty } : {}),
      ...(shopId ? { shopId } : {}),
      ...(type === 'debt' ? { debtDirection } : {}),
    }
    setSaving(true)

    const reset = () => {
      setLabel('')
      setAmount('')
      setQuantity('')
      setNote('')
      setCategory('')
      setOccurredAt(todayValue())
      setContactId('')
      setProductId('')
    }

    if (!isOnline()) {
      enqueueEntry({ label, payload })
      setPending(listQueued().length)
      toast.success(t('cahier.offline.queued'))
      reset()
      setSaving(false)
      return
    }

    try {
      const res = await addEntry({
        ...payload,
        contactId: contactId ? (contactId as Id<'contacts'>) : undefined,
        productId: productId ? (productId as Id<'products'>) : undefined,
        shopId: shopId as Id<'shops'> | undefined,
      })
      if (res.ok) {
        toast.success(t('cahier.added'))
        reset()
      } else {
        toast.error(t('cahier.invalid'))
      }
    } catch {
      // Network dropped mid-request: keep the sale on the device.
      enqueueEntry({ label, payload })
      setPending(listQueued().length)
      toast.success(t('cahier.offline.queued'))
      reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="cahier-page"
      data-state={data ? 'ready' : 'loading'}
      className="mt-4"
    >
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          {pending > 0 ? (
            <p
              data-testid="cahier-offline-pending"
              className="mb-3 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground"
            >
              {pending} {t('cahier.offline.pending')}
            </p>
          ) : null}

          <ul className="grid grid-cols-2 gap-2">
            {[
              { key: 'sales', label: t('cahier.totals.sales'), value: data.totals.sales },
              { key: 'expenses', label: t('cahier.totals.expenses'), value: data.totals.expenses },
              { key: 'balance', label: t('cahier.totals.balance'), value: data.totals.balance },
              { key: 'receivable', label: t('cahier.totals.receivable'), value: data.totals.receivable },
              { key: 'payable', label: t('cahier.totals.payable'), value: data.totals.payable },
              { key: 'debts', label: t('cahier.totals.debts'), value: data.totals.debts },
            ].map((item) => (
              <li key={item.key} className="rounded-xl border bg-card p-3 text-card-foreground">
                <p className="text-[11px] uppercase text-muted-foreground">{item.label}</p>
                <p className="mt-0.5 text-base font-extrabold">{formatAmount(item.value)}</p>
              </li>
            ))}
          </ul>

          <form onSubmit={submit} className="mt-5 rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-sm font-bold">{t('cahier.addTitle')}</p>

            <div className="mt-3 flex gap-2">
              {types.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={type === option.value ? 'default' : 'outline'}
                  className={cn('flex-1', type === option.value && 'font-bold')}
                  onClick={() => {
                    setType(option.value)
                    setCategory('')
                  }}
                  data-testid={`cahier-type-${option.value}`}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {type === 'debt' ? (
              <div className="mt-3 flex gap-2">
                {(
                  [
                    { value: 'receivable', label: t('cahier.debt.receivable') },
                    { value: 'payable', label: t('cahier.debt.payable') },
                  ] as const
                ).map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={debtDirection === option.value ? 'default' : 'outline'}
                    className="flex-1 text-xs"
                    onClick={() => setDebtDirection(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="mt-3 grid gap-3">
              <div>
                <Label htmlFor="cahier-label">{t('cahier.label')}</Label>
                <Input
                  id="cahier-label"
                  data-testid="cahier-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={80}
                  required
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="cahier-date">{t('cahier.date')}</Label>
                  <Input
                    id="cahier-date"
                    data-testid="cahier-date"
                    type="date"
                    value={occurredAt}
                    max={todayValue()}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="cahier-category">{t('cahier.category.label')}</Label>
                  <select
                    id="cahier-category"
                    data-testid="cahier-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={cn(selectClass, 'mt-1')}
                  >
                    <option value="">—</option>
                    {CATEGORIES[type].map((key) => (
                      <option key={key} value={key}>
                        {categoryLabel(t, key)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="cahier-amount">{t('cahier.amount')}</Label>
                  <Input
                    id="cahier-amount"
                    data-testid="cahier-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="cahier-quantity">{t('cahier.entry.quantity')}</Label>
                  <Input
                    id="cahier-quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    inputMode="numeric"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="cahier-contact">{t('cahier.entry.contact')}</Label>
                <select
                  id="cahier-contact"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className={cn(selectClass, 'mt-1')}
                >
                  <option value="">—</option>
                  {(contacts?.ok ? contacts.results : []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="cahier-product">{t('cahier.entry.product')}</Label>
                <select
                  id="cahier-product"
                  data-testid="cahier-product"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className={cn(selectClass, 'mt-1')}
                >
                  <option value="">—</option>
                  {(products?.ok ? products.results : []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.stock} {product.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="cahier-note">{t('cahier.note')}</Label>
                <Input
                  id="cahier-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="mt-3">
              <BarcodeScanner
                onFound={(product) => {
                  setProductId(product.id)
                  setLabel(product.name)
                  setAmount(`${product.price}`)
                  setType('sale')
                }}
              />
            </div>

            <Button
              type="submit"
              data-testid="cahier-submit"
              disabled={saving}
              className="mt-3 w-full rounded-full font-bold"
            >
              {saving ? <Spinner className="size-4" /> : <Plus />}
              {t('common.save')}
            </Button>
          </form>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="cahier-filter-type">{t('cahier.filter.type')}</Label>
              <select
                id="cahier-filter-type"
                data-testid="cahier-filter-type"
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value as 'all' | EntryType)
                  setFilterCategory('all')
                }}
                className={cn(selectClass, 'mt-1')}
              >
                <option value="all">{t('cahier.filter.all')}</option>
                {types.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cahier-filter-category">{t('cahier.category.label')}</Label>
              <select
                id="cahier-filter-category"
                data-testid="cahier-filter-category"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className={cn(selectClass, 'mt-1')}
              >
                <option value="all">{t('cahier.category.all')}</option>
                {filterCategories.map((key) => (
                  <option key={key} value={key}>
                    {categoryLabel(t, key)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h2 className="mt-6 text-sm font-bold">
            {t('cahier.tab.journal')}
            {data.totalCount > data.entries.length ? ` (${data.entries.length}/${data.totalCount})` : ''}
          </h2>
          {data.entries.length === 0 ? (
            <EmptyState icon={BookOpen} title={t('cahier.empty')} hint={t('cahier.emptyHint')} />
          ) : (
            <ul className="mt-3 grid gap-2">
              {data.entries.map((entry) => (
                <li
                  key={entry.id}
                  data-testid="cahier-entry"
                  data-type={entry.type}
                  className="rounded-xl border bg-card p-3 text-card-foreground"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {entry.label}
                        <StatusBadge tone={entry.type === 'sale' ? 'brand' : 'neutral'}>
                          {t(typeKey(entry.type))}
                        </StatusBadge>
                        {entry.type === 'debt' ? (
                          <StatusBadge>
                            {entry.debtDirection === 'payable'
                              ? t('cahier.debt.payable')
                              : t('cahier.debt.receivable')}
                          </StatusBadge>
                        ) : null}
                        {entry.type === 'debt' && entry.settled ? (
                          <StatusBadge>{t('cahier.settled')}</StatusBadge>
                        ) : null}
                        {entry.linkedPurchase ? (
                          <StatusBadge>{t('cahier.entry.linkedPurchase')}</StatusBadge>
                        ) : null}
                        {entry.linkedCredit ? (
                          <StatusBadge>{t('cahier.entry.linkedCredit')}</StatusBadge>
                        ) : null}
                        {entry.linkedDebt ? (
                          <StatusBadge>{t('cahier.entry.linkedDebt')}</StatusBadge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(entry.occurredAt).toLocaleDateString(lang)}
                        {entry.category ? ` · ${categoryLabel(t, entry.category)}` : ''}
                        {entry.contactName ? ` · ${entry.contactName}` : ''}
                        {entry.productName ? ` · ${entry.productName}` : ''}
                        {entry.quantity ? ` ×${entry.quantity}` : ''}
                        {entry.sellerName ? ` · ${t('cahier.entry.seller')} ${entry.sellerName}` : ''}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-extrabold">{formatAmount(entry.amount)}</p>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {entry.type === 'debt' && !entry.linkedCredit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleSettled({ entryId: entry.id })}
                      >
                        <Check />
                        {entry.settled ? t('cahier.markOpen') : t('cahier.markSettled')}
                      </Button>
                    ) : null}
                    {entry.type === 'sale' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid="cahier-receipt"
                        onClick={() =>
                          void exportReceiptPdf(
                            {
                              label: entry.label,
                              amount: entry.amount,
                              createdAt: entry.createdAt,
                              quantity: entry.quantity,
                              productName: entry.productName,
                              contactName: entry.contactName,
                            },
                            {
                              receipt: t('cahier.receipt.print'),
                              date: t('cahier.receipt.date'),
                              seller: t('cahier.receipt.seller'),
                              label: t('cahier.label'),
                              quantity: t('cahier.entry.quantity'),
                              total: t('cahier.amount'),
                              thanks: t('cahier.receipt.thanks'),
                            },
                          )
                        }
                      >
                        <FileDown />
                        {t('cahier.receipt.print')}
                      </Button>
                    ) : null}
                    {!entry.linkedPurchase && !entry.linkedCredit && !entry.linkedDebt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void removeEntry({ entryId: entry.id })}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// --- Chart -----------------------------------------------------------------

function ChartTab({ shopId }: { shopId?: Id<'shops'> }) {
  const { t } = useI18n()
  const [period, setPeriod] = useState<Period>('month')
  const data = useQuery(api.cahier.evolution, {
    period,
    ...(shopId ? { shopId } : {}),
  })

  const periods: { value: Period; label: string }[] = [
    { value: 'day', label: t('cahier.period.day') },
    { value: 'month', label: t('cahier.period.month') },
    { value: 'twoYear', label: t('premium.period.twoYear') },
  ]

  return (
    <div data-testid="cahier-evolution" data-state={data ? 'ready' : 'loading'} className="mt-4">
      <div className="flex gap-2">
        {periods.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={period === option.value ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setPeriod(option.value)}
            data-testid={`cahier-period-${option.value}`}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : data.locked ? (
        <div className="mt-3 rounded-xl border border-dashed bg-card p-4 text-card-foreground">
          <p className="text-sm font-bold">{t('premium.locked')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('premium.lockedHint')}</p>
          <PremiumCard />
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-xl border bg-card p-3 text-card-foreground">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-brand-yellow" aria-hidden="true" />
              <p className="text-sm font-bold">{t('cahier.tab.chart')}</p>
            </div>
            <EvolutionChart points={data.points} period={data.period} />
            {data.points.every((point) => point.sales === 0 && point.expenses === 0) ? (
              <p className="mt-2 text-xs text-muted-foreground">{t('cahier.chart.empty')}</p>
            ) : null}
          </div>

          <ul className="mt-3 grid grid-cols-3 gap-2">
            {[
              { key: 'sales', label: t('cahier.chart.sales'), value: data.totalSales },
              { key: 'expenses', label: t('cahier.chart.expenses'), value: data.totalExpenses },
              { key: 'profit', label: t('cahier.chart.profit'), value: data.totalProfit },
            ].map((item) => (
              <li key={item.key} className="rounded-xl border bg-card p-3 text-center text-card-foreground">
                <p className="text-[11px] uppercase text-muted-foreground">{item.label}</p>
                <p className="mt-0.5 text-sm font-extrabold">{formatAmount(item.value)}</p>
              </li>
            ))}
          </ul>

          <PremiumCard />
        </>
      )}
    </div>
  )
}

// --- Products --------------------------------------------------------------

function ProductsTab({ shopId }: { shopId?: Id<'shops'> }) {
  const { t } = useI18n()
  const products = useQuery(api.cahier.products, { ...(shopId ? { shopId } : {}) })
  const addProduct = useMutation(api.cahier.addProduct)
  const adjustStock = useMutation(api.cahier.adjustStock)
  const removeProduct = useMutation(api.cahier.removeProduct)

  const [name, setName] = useState('')
  const [unit, setUnit] = useState('pièce')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [minStock, setMinStock] = useState('')
  const [barcode, setBarcode] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await addProduct({
        name,
        unit,
        price: Number(price.replace(',', '.')),
        stock: Number(stock.replace(',', '.')) || 0,
        minStock: Number(minStock.replace(',', '.')) || 0,
        barcode,
        ...(shopId ? { shopId } : {}),
      })
      if (res.ok) {
        setName('')
        setPrice('')
        setStock('')
        setMinStock('')
        setBarcode('')
        toast.success(t('cahier.added'))
      } else {
        toast.error(t('cahier.invalid'))
      }
    } catch {
      toast.error(t('cahier.invalid'))
    } finally {
      setSaving(false)
    }
  }

  const list = products?.ok ? products.results : []
  const lowCount = list.filter((product) => product.lowStock).length
  const stockValue = list.reduce((sum, product) => sum + product.stockValue, 0)

  return (
    <div data-testid="cahier-products" data-state={products ? 'ready' : 'loading'} className="mt-4">
      <form onSubmit={submit} className="rounded-xl border bg-card p-4 text-card-foreground">
        <p className="text-sm font-bold">{t('cahier.product.add')}</p>
        <div className="mt-3 grid gap-3">
          <div>
            <Label htmlFor="product-name">{t('cahier.product.name')}</Label>
            <Input
              id="product-name"
              data-testid="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="product-unit">{t('cahier.product.unit')}</Label>
              <Input
                id="product-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                maxLength={20}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="product-price">{t('cahier.product.price')}</Label>
              <Input
                id="product-price"
                data-testid="product-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                required
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="product-stock">{t('cahier.product.stock')}</Label>
              <Input
                id="product-stock"
                data-testid="product-stock"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                inputMode="numeric"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="product-min">{t('cahier.product.minStock')}</Label>
              <Input
                id="product-min"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                inputMode="numeric"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="product-barcode">{t('cahier.product.barcode')}</Label>
            <Input
              id="product-barcode"
              data-testid="product-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              maxLength={64}
              className="mt-1"
            />
          </div>
        </div>
        <Button type="submit" data-testid="product-submit" disabled={saving} className="mt-3 w-full rounded-full font-bold">
          {saving ? <Spinner className="size-4" /> : <Package />}
          {t('cahier.product.add')}
        </Button>
      </form>

      {!products ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            <li className="rounded-xl border bg-card p-3 text-card-foreground">
              <p className="text-[11px] uppercase text-muted-foreground">{t('cahier.product.value')}</p>
              <p className="text-sm font-extrabold">{formatAmount(stockValue)}</p>
            </li>
            <li className="rounded-xl border bg-card p-3 text-card-foreground">
              <p className="text-[11px] uppercase text-muted-foreground">{t('cahier.lowStockAlert')}</p>
              <p className="text-sm font-extrabold">{lowCount}</p>
            </li>
          </ul>

          {list.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {t('cahier.product.empty')}
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {list.map((product) => (
                <li
                  key={product.id}
                  data-testid="cahier-product-row"
                  data-name={product.name}
                  className="rounded-xl border bg-card p-3 text-card-foreground"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {product.name}
                        {product.lowStock ? (
                          <StatusBadge>{t('cahier.product.low')}</StatusBadge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatAmount(product.price)} · {product.stock} {product.unit}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-extrabold">
                      {formatAmount(product.stockValue)}
                    </p>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void adjustStock({ productId: product.id, delta: 1 })}
                      aria-label={`${t('cahier.product.in')} ${product.name}`}
                    >
                      <Plus />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void adjustStock({ productId: product.id, delta: -1 })}
                      aria-label={`${t('cahier.product.out')} ${product.name}`}
                    >
                      <Minus />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void removeProduct({ productId: product.id })}
                      aria-label={`${t('common.delete')} ${product.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// --- Contacts --------------------------------------------------------------

function ContactsTab({ shopId }: { shopId?: Id<'shops'> }) {
  const { t } = useI18n()
  const contacts = useQuery(api.cahier.contacts, { ...(shopId ? { shopId } : {}) })
  const addContact = useMutation(api.cahier.addContact)
  const removeContact = useMutation(api.cahier.removeContact)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [kind, setKind] = useState<'customer' | 'supplier'>('customer')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await addContact({
        name,
        kind,
        phone,
        ...(shopId ? { shopId } : {}),
      })
      if (res.ok) {
        setName('')
        setPhone('')
        toast.success(t('cahier.added'))
      } else {
        toast.error(t('cahier.invalid'))
      }
    } catch {
      toast.error(t('cahier.invalid'))
    } finally {
      setSaving(false)
    }
  }

  const list = contacts?.ok ? contacts.results : []

  return (
    <div data-testid="cahier-contacts" data-state={contacts ? 'ready' : 'loading'} className="mt-4">
      <form onSubmit={submit} className="rounded-xl border bg-card p-4 text-card-foreground">
        <p className="text-sm font-bold">{t('cahier.contact.add')}</p>
        <div className="mt-3 flex gap-2">
          {(
            [
              { value: 'customer', label: t('cahier.contact.customer') },
              { value: 'supplier', label: t('cahier.contact.supplier') },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={kind === option.value ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setKind(option.value)}
              data-testid={`contact-kind-${option.value}`}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid gap-3">
          <div>
            <Label htmlFor="contact-name">{t('cahier.contact.name')}</Label>
            <Input
              id="contact-name"
              data-testid="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="contact-phone">{t('cahier.contact.phone')}</Label>
            <Input
              id="contact-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={24}
              className="mt-1"
            />
          </div>
        </div>
        <Button type="submit" data-testid="contact-submit" disabled={saving} className="mt-3 w-full rounded-full font-bold">
          {saving ? <Spinner className="size-4" /> : <Users />}
          {t('cahier.contact.add')}
        </Button>
      </form>

      {!contacts ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      ) : list.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t('cahier.contact.empty')}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {list.map((contact) => (
            <li
              key={contact.id}
              data-testid="cahier-contact-row"
              data-name={contact.name}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{contact.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {contact.kind === 'supplier'
                    ? t('cahier.contact.supplier')
                    : t('cahier.contact.customer')}
                  {contact.phone ? ` · ${contact.phone}` : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void removeContact({ contactId: contact.id })}
                aria-label={`${t('common.delete')} ${contact.name}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- Purchases -------------------------------------------------------------

function PurchasesTab({ shopId }: { shopId?: Id<'shops'> }) {
  const { t, lang } = useI18n()
  const purchases = useQuery(api.cahier.purchases, { ...(shopId ? { shopId } : {}) })
  const products = useQuery(api.cahier.products, { ...(shopId ? { shopId } : {}) })
  const contacts = useQuery(api.cahier.contacts, { ...(shopId ? { shopId } : {}) })
  const addPurchase = useMutation(api.cahier.addPurchase)
  const removePurchase = useMutation(api.cahier.removePurchase)

  const [label, setLabel] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [occurredAt, setOccurredAt] = useState(todayValue)
  const [supplierId, setSupplierId] = useState('')
  const [productId, setProductId] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await addPurchase({
        label,
        quantity: Number(quantity.replace(',', '.')),
        unitCost: Number(unitCost.replace(',', '.')),
        ...(occurredAt
          ? { occurredAt: new Date(`${occurredAt}T12:00:00`).getTime() }
          : {}),
        ...(supplierId ? { supplierId: supplierId as Id<'contacts'> } : {}),
        ...(productId ? { productId: productId as Id<'products'> } : {}),
        ...(shopId ? { shopId } : {}),
      })
      if (res.ok) {
        setLabel('')
        setQuantity('')
        setUnitCost('')
        setOccurredAt(todayValue())
        toast.success(t('cahier.added'))
      } else {
        toast.error(t('cahier.invalid'))
      }
    } catch {
      toast.error(t('cahier.invalid'))
    } finally {
      setSaving(false)
    }
  }

  const list = purchases?.ok ? purchases.results : []

  return (
    <div data-testid="cahier-purchases" data-state={purchases ? 'ready' : 'loading'} className="mt-4">
      <form onSubmit={submit} className="rounded-xl border bg-card p-4 text-card-foreground">
        <p className="text-sm font-bold">{t('cahier.purchase.add')}</p>
        <div className="mt-3 grid gap-3">
          <div>
            <Label htmlFor="purchase-label">{t('cahier.purchase.label')}</Label>
            <Input
              id="purchase-label"
              data-testid="purchase-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="purchase-date">{t('cahier.date')}</Label>
            <Input
              id="purchase-date"
              data-testid="purchase-date"
              type="date"
              value={occurredAt}
              max={todayValue()}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="purchase-quantity">{t('cahier.purchase.quantity')}</Label>
              <Input
                id="purchase-quantity"
                data-testid="purchase-quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="numeric"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="purchase-cost">{t('cahier.purchase.unitCost')}</Label>
              <Input
                id="purchase-cost"
                data-testid="purchase-cost"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                inputMode="decimal"
                required
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="purchase-supplier">{t('cahier.purchase.supplier')}</Label>
            <select
              id="purchase-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={cn(selectClass, 'mt-1')}
            >
              <option value="">—</option>
              {(contacts?.ok ? contacts.results : [])
                .filter((contact) => contact.kind === 'supplier')
                .map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label htmlFor="purchase-product">{t('cahier.purchase.product')}</Label>
            <select
              id="purchase-product"
              data-testid="purchase-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={cn(selectClass, 'mt-1')}
            >
              <option value="">—</option>
              {(products?.ok ? products.results : []).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button type="submit" data-testid="purchase-submit" disabled={saving} className="mt-3 w-full rounded-full font-bold">
          {saving ? <Spinner className="size-4" /> : <ShoppingBasket />}
          {t('cahier.purchase.add')}
        </Button>
      </form>

      {!purchases ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-xl border bg-card p-3 text-card-foreground">
            <p className="text-[11px] uppercase text-muted-foreground">
              {t('cahier.purchase.monthTotal')}
            </p>
            <p className="text-base font-extrabold">{formatAmount(purchases.monthTotal)}</p>
          </div>

          {list.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {t('cahier.purchase.empty')}
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {list.map((purchase) => (
                <li
                  key={purchase.id}
                  data-testid="cahier-purchase-row"
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{purchase.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(purchase.occurredAt).toLocaleDateString(lang)}
                      {purchase.supplierName ? ` · ${purchase.supplierName}` : ''}
                      {purchase.productName ? ` · ${purchase.productName}` : ''}
                      {` ×${purchase.quantity}`}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-extrabold">{formatAmount(purchase.total)}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void removePurchase({ purchaseId: purchase.id })}
                    aria-label={`${t('common.delete')} ${purchase.label}`}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
