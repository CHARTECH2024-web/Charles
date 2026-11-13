import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Bell, CheckCheck, MessageCircle, MessageSquare, Newspaper, UserPlus } from 'lucide-react'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import { AppShell } from '@/components/app-shell'
import { EmptyState, PageTitle } from '@/components/page-parts'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'

const meta = siteMetadata['/notifications']

export const Route = createFileRoute('/notifications')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: NotificationsPage,
})

const ICONS = {
  message: MessageSquare,
  connection: UserPlus,
  post: Newspaper,
  comment: MessageCircle,
  alert: Bell,
} as const

function timeLabel(timestamp: number, lang: string): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000)
  if (minutes < 1) return lang === 'fr' ? "à l'instant" : lang === 'sw' ? 'sasa hivi' : 'just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  return new Intl.DateTimeFormat(lang === 'sw' ? 'sw' : lang === 'en' ? 'en' : 'fr', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(timestamp))
}

function NotificationsPage() {
  const { t, lang } = useI18n()
  const data = useQuery(api.notifications.list, {})
  const markRead = useMutation(api.notifications.markRead)
  const markAllRead = useMutation(api.notifications.markAllRead)

  const items = data?.items ?? []
  const unread = data?.unread ?? 0
  const loading = data === undefined

  return (
    <AppShell>
      <div data-testid="notifications-page" data-state={loading ? 'loading' : 'ready'}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <PageTitle>{t('notifications.title')}</PageTitle>
            {unread > 0 ? (
              <p className="text-sm text-muted-foreground">
                {unread} {unread === 1 ? t('notifications.unreadOne') : t('notifications.unread')}
              </p>
            ) : null}
          </div>
          {items.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="notifications-mark-all"
              onClick={() => void markAllRead({})}
              disabled={unread === 0}
            >
              <CheckCheck />
              {t('notifications.markAll')}
            </Button>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-6" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={t('notifications.empty')}
            hint={t('notifications.emptyHint')}
          />
        ) : (
          <ul className="mt-5 grid gap-2" data-testid="notifications-list">
            {items.map((item) => {
              const Icon = ICONS[item.kind]
              const label =
                item.kind === 'message'
                  ? t('notifications.kindMessage')
                  : item.kind === 'connection'
                    ? t('notifications.kindConnection')
                    : item.kind === 'post'
                      ? t('notifications.kindPost')
                      : item.kind === 'comment'
                        ? t('notifications.kindComment')
                        : t('notifications.kindAlert')

              const content = (
                <>
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Icon className="size-5" />
                    {!item.read ? (
                      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold">{item.title}</span>
                      <span className="ml-auto shrink-0 text-[11px] font-medium text-muted-foreground">
                        {timeLabel(item.createdAt, lang)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {item.body}
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </span>
                  </span>
                </>
              )

              const className = `flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
                item.read ? 'bg-card text-card-foreground' : 'border-primary/40 bg-accent/40'
              }`

              return (
                <li key={item.id} data-testid="notification-row" data-read={item.read ? 'yes' : 'no'}>
                  {item.href ? (
                    <Link
                      to={item.href as '/'}
                      className={className}
                      onClick={() => {
                        if (!item.read) void markRead({ notificationId: item.id })
                      }}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={className}
                      onClick={() => {
                        if (!item.read) void markRead({ notificationId: item.id })
                      }}
                    >
                      {content}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AppShell>
  )
}
