import { useI18n } from '@/lib/i18n'

export type EvolutionPoint = {
  key: string
  sales: number
  expenses: number
  profit: number
  timestamp: number
}

const WIDTH = 320
const HEIGHT = 150
const PADDING = 18

function formatShort(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`
  return `${Math.round(value)}`
}

type ChartPeriod = 'day' | 'month' | 'twoYear' | 'year'

function labelFor(point: EvolutionPoint, period: ChartPeriod, lang: string) {
  const date = new Date(point.timestamp)
  if (period === 'year') return `${date.getFullYear()}`
  if (period === 'day') {
    return date.toLocaleDateString(lang, { day: '2-digit', month: '2-digit' })
  }
  return date.toLocaleDateString(lang, { month: 'short', year: '2-digit' })
}

/** Revenue vs expenses bars with a profit line, drawn without any dependency. */
export function EvolutionChart({
  points,
  period,
}: {
  points: EvolutionPoint[]
  period: ChartPeriod
}) {
  const { t, lang } = useI18n()

  if (points.length === 0) return null

  const max = Math.max(
    1,
    ...points.map((point) => Math.max(point.sales, point.expenses)),
  )
  const innerWidth = WIDTH - PADDING * 2
  const innerHeight = HEIGHT - PADDING * 2
  const slot = innerWidth / points.length
  const barWidth = Math.max(2, Math.min(8, slot / 3))

  const y = (value: number) => PADDING + innerHeight - (value / max) * innerHeight
  const profitLine = points
    .map((point, index) => {
      const x = PADDING + slot * index + slot / 2
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y(Math.max(0, point.profit)).toFixed(1)}`
    })
    .join(' ')

  const labelEvery = Math.ceil(points.length / 6)

  return (
    <figure data-testid="cahier-chart" className="mt-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-40 w-full"
        role="img"
        aria-label={t('cahier.chart.aria')}
      >
        <line
          x1={PADDING}
          y1={HEIGHT - PADDING}
          x2={WIDTH - PADDING}
          y2={HEIGHT - PADDING}
          className="stroke-border"
          strokeWidth="1"
        />
        {points.map((point, index) => {
          const x = PADDING + slot * index
          const salesHeight = (point.sales / max) * innerHeight
          const expensesHeight = (point.expenses / max) * innerHeight
          return (
            <g key={point.key}>
              <rect
                x={x + slot / 2 - barWidth - 1}
                y={HEIGHT - PADDING - salesHeight}
                width={barWidth}
                height={Math.max(0, salesHeight)}
                className="fill-brand-yellow"
                rx="1"
              />
              <rect
                x={x + slot / 2 + 1}
                y={HEIGHT - PADDING - expensesHeight}
                width={barWidth}
                height={Math.max(0, expensesHeight)}
                className="fill-muted-foreground/60"
                rx="1"
              />
            </g>
          )
        })}
        <path
          d={profitLine}
          fill="none"
          strokeWidth="2"
          className="stroke-primary"
          strokeLinecap="round"
        />
      </svg>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        {points.map((point, index) =>
          index % labelEvery === 0 ? (
            <span key={point.key}>{labelFor(point, period, lang)}</span>
          ) : null,
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-brand-yellow" aria-hidden="true" />
          {t('cahier.chart.sales')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-muted-foreground/60" aria-hidden="true" />
          {t('cahier.chart.expenses')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-3 rounded bg-primary" aria-hidden="true" />
          {t('cahier.chart.profit')}
        </span>
        <span className="ml-auto font-semibold">
          {formatShort(points.reduce((sum, point) => sum + point.sales, 0))} CDF
        </span>
      </figcaption>
    </figure>
  )
}
