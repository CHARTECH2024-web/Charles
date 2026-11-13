import { createFileRoute } from '@tanstack/react-router'
import { BookOpen, Briefcase, Bot, Users } from 'lucide-react'
import siteMetadata from '../metadata.json'
import { AppShell } from '@/components/app-shell'
import { PageTitle, StatusBadge } from '@/components/page-parts'
import { useI18n } from '@/lib/i18n'

const meta = siteMetadata['/also']

export const Route = createFileRoute('/also')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: AlsoPage,
})

function AlsoPage() {
  const { t } = useI18n()

  // Honest availability: nothing here is operational yet.
  const services = [
    {
      icon: BookOpen,
      name: t('also.cahier.name'),
      desc: t('also.cahier.desc'),
      status: t('also.status.inProgress'),
      priority: true,
    },
    {
      icon: Briefcase,
      name: t('also.business.name'),
      desc: t('also.business.desc'),
      status: t('also.status.planned'),
      priority: false,
    },
    {
      icon: Users,
      name: t('also.connect.name'),
      desc: t('also.connect.desc'),
      status: t('also.status.planned'),
      priority: false,
    },
    {
      icon: Bot,
      name: t('also.ai.name'),
      desc: t('also.ai.desc'),
      status: t('also.status.planned'),
      priority: false,
    },
  ]

  return (
    <AppShell>
      <PageTitle>{t('also.title')}</PageTitle>
      <p className="text-sm text-muted-foreground">{t('also.intro')}</p>

      <ul className="mt-5 grid gap-3">
        {services.map(({ icon: Icon, name, desc, status, priority }) => (
          <li
            key={name}
            className="flex gap-4 rounded-xl border bg-card p-4 text-card-foreground"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-black text-brand-yellow">
              <Icon className="size-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{name}</p>
                <StatusBadge tone={priority ? 'brand' : 'neutral'}>
                  {status}
                </StatusBadge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  )
}
