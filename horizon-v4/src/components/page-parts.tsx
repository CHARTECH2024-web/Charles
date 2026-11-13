import type { ComponentType, ReactNode } from 'react'

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="mb-1 text-2xl font-extrabold tracking-tight">{children}</h1>
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  hint: string
}) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-7" />
      </span>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'brand'
  children: ReactNode
}) {
  return (
    <span
      className={
        tone === 'brand'
          ? 'inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground'
          : 'inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground'
      }
    >
      {children}
    </span>
  )
}
