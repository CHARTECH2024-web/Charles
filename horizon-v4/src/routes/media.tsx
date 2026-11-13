import { createFileRoute } from '@tanstack/react-router'
import { Image as ImageIcon } from 'lucide-react'
import siteMetadata from '../metadata.json'
import { AppShell } from '@/components/app-shell'
import { EmptyState, PageTitle } from '@/components/page-parts'
import { useI18n } from '@/lib/i18n'

const meta = siteMetadata['/media']

export const Route = createFileRoute('/media')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: MediaPage,
})

function MediaPage() {
  const { t } = useI18n()
  return (
    <AppShell>
      <PageTitle>{t('media.title')}</PageTitle>
      <EmptyState
        icon={ImageIcon}
        title={t('media.empty')}
        hint={t('media.emptyHint')}
      />
    </AppShell>
  )
}
