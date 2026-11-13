import type { ComponentType } from 'react'
import { Info } from 'lucide-react'
import { PageTitle, StatusBadge } from '@/components/page-parts'

export type PlannedFeature = {
  icon: ComponentType<{ className?: string }>
  title: string
  desc: string
}

/** Honest "not usable yet" page: what is planned, clearly marked as such. */
export function PlannedModule({
  icon: Icon,
  title,
  intro,
  status,
  note,
  features,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  intro: string
  status: string
  note: string
  features: PlannedFeature[]
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-black text-brand-yellow">
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <PageTitle>{title}</PageTitle>
          <StatusBadge tone="brand">{status}</StatusBadge>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{intro}</p>

      <div
        role="note"
        className="mt-4 flex gap-3 rounded-xl border bg-accent p-4 text-accent-foreground"
      >
        <Info className="mt-0.5 size-5 shrink-0" />
        <p className="text-sm">{note}</p>
      </div>

      <ul className="mt-5 grid gap-3">
        {features.map(({ icon: FIcon, title: ft, desc }) => (
          <li
            key={ft}
            className="flex gap-4 rounded-xl border bg-card p-4 text-card-foreground"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <FIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-bold">{ft}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
