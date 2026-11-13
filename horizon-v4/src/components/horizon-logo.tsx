import { cn } from '@/lib/utils'

/** Official HORIZON mark: the yellow H (with its swoosh) on black. */
export function HorizonLogo({
  className,
  withName = false,
}: {
  className?: string
  withName?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-xl bg-brand-black ring-1 ring-border"
      >
        <img src="/logo-h.svg" alt="" className="h-6 w-auto" draggable={false} />
      </span>
      {withName ? (
        <span className="text-lg font-extrabold tracking-wide">HORIZON</span>
      ) : null}
    </span>
  )
}
