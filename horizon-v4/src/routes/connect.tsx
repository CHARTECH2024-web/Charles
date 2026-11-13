import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Check, Search, UserPlus, Users, X } from 'lucide-react'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import { AppShell } from '@/components/app-shell'
import { EmptyState, PageTitle, StatusBadge } from '@/components/page-parts'
import { Button } from '@/components/ui/button'
import { VerifiedBadge } from '@/components/verified-badge'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'

const meta = siteMetadata['/connect']

export const Route = createFileRoute('/connect')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: ConnectPage,
})

type Member = {
  handle: string
  horizonId: string
  displayName: string
  photoUrl: string | null
  verified?: boolean
  isMe?: boolean
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function MemberAvatar({ member }: { member: Member }) {
  if (member.photoUrl) {
    return (
      <img
        src={member.photoUrl}
        alt=""
        className="size-11 shrink-0 rounded-full object-cover"
        draggable={false}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-black text-sm font-bold text-brand-yellow"
    >
      {initials(member.displayName) || 'HZ'}
    </span>
  )
}

function MemberRow({
  member,
  state,
  onRequest,
  busy,
}: {
  member: Member
  state?: 'pending' | 'incoming' | 'accepted'
  onRequest: (handle: string) => void
  busy: boolean
}) {
  const { t } = useI18n()
  return (
    <li
      data-testid="connect-member"
      className="flex items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground"
    >
      <MemberAvatar member={member} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-bold">
          {member.displayName}
          {member.verified ? <VerifiedBadge /> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.horizonId}</p>
      </div>
      {member.isMe ? (
        <StatusBadge tone="brand">{t('connect.you')}</StatusBadge>
      ) : state === 'accepted' ? (
        <StatusBadge tone="brand">{t('connect.accept')}</StatusBadge>
      ) : state === 'pending' ? (
        <StatusBadge>{t('connect.requested')}</StatusBadge>
      ) : state === 'incoming' ? (
        <StatusBadge>{t('connect.incoming')}</StatusBadge>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid={`connect-request-${member.handle}`}
          disabled={busy}
          onClick={() => onRequest(member.handle)}
        >
          <UserPlus />
          {t('connect.request')}
        </Button>
      )}
    </li>
  )
}

function ConnectPage() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')

  // Avoid one backend query per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(query.trim()), 300)
    return () => window.clearTimeout(id)
  }, [query])

  const search = useQuery(
    api.profiles.searchByHandle,
    term.length >= 2 ? { term } : 'skip',
  )
  const suggestions = useQuery(api.profiles.suggestedMembers, {})
  const relations = useQuery(api.connections.list, {})
  const states = useQuery(api.connections.states, {})
  const requestConnection = useMutation(api.connections.request)
  const respondConnection = useMutation(api.connections.respond)
  const [busyHandle, setBusyHandle] = useState('')
  const [requestError, setRequestError] = useState('')

  async function onRequest(handle: string) {
    setRequestError('')
    setBusyHandle(handle)
    try {
      const result = await requestConnection({ handle })
      if (!result.ok) setRequestError(t('connect.requestError'))
    } catch {
      setRequestError(t('connect.requestError'))
    } finally {
      setBusyHandle('')
    }
  }

  const searching = term.length >= 2
  const searchLoading = searching && search === undefined
  const suggestionsLoading = !searching && suggestions === undefined
  const results: Member[] = search?.ok ? search.results : []
  const people: Member[] = suggestions?.ok ? suggestions.results : []

  return (
    <AppShell>
      <div
        data-testid="connect-page"
        data-state={
          searchLoading || suggestionsLoading ? 'loading' : 'ready'
        }
      >
        <PageTitle>{t('connect.title')}</PageTitle>
        <p className="text-sm text-muted-foreground">{t('connect.intro')}</p>

        <div className="mt-5">
          <label htmlFor="connect-search" className="sr-only">
            {t('connect.search')}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="connect-search"
              data-testid="connect-search"
              type="search"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('connect.searchPlaceholder')}
              className="pl-9"
            />
          </div>
        </div>

        {relations && relations.incoming.length > 0 ? (
          <section className="mt-6" data-testid="connect-incoming">
            <h2 className="text-sm font-bold">{t('connect.incomingTitle')}</h2>
            <ul className="mt-3 grid gap-2">
              {relations.incoming.map((request) => (
                <li
                  key={request.id}
                  className="flex items-center gap-3 rounded-xl border border-primary/40 bg-accent/40 p-3"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-black text-sm font-bold text-brand-yellow">
                    {initials(request.person.name) || 'HZ'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{request.person.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {request.person.handle}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      data-testid={`connect-accept-${request.id}`}
                      onClick={() => void respondConnection({ connectionId: request.id, accept: true })}
                    >
                      <Check />
                      <span className="sr-only sm:not-sr-only">{t('connect.accept')}</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`connect-decline-${request.id}`}
                      onClick={() => void respondConnection({ connectionId: request.id, accept: false })}
                    >
                      <X />
                      <span className="sr-only sm:not-sr-only">{t('connect.decline')}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {relations && relations.accepted.length > 0 ? (
          <section className="mt-6" data-testid="connect-contacts">
            <h2 className="text-sm font-bold">{t('connect.contactsTitle')}</h2>
            <ul className="mt-3 grid gap-2">
              {relations.accepted.map((contact) => (
                <li
                  key={contact.id}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-black text-sm font-bold text-brand-yellow">
                    {initials(contact.person.name) || 'HZ'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{contact.person.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contact.person.handle}
                    </p>
                  </div>
                  <StatusBadge tone="brand">{t('connect.contactsTitle')}</StatusBadge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {requestError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {requestError}
          </p>
        ) : null}

        {searching ? (
          <section className="mt-6" aria-live="polite" aria-busy={searchLoading}>
            <h2 className="text-sm font-bold">{t('connect.search')}</h2>
            {searchLoading ? (
              <div className="flex justify-center py-10">
                <Spinner className="size-5" />
              </div>
            ) : results.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                {t('connect.noResults')}
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {results.map((member) => (
                  <MemberRow
                    key={member.handle}
                    member={member}
                    state={states?.[member.handle]}
                    onRequest={(handle) => void onRequest(handle)}
                    busy={busyHandle === member.handle}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="mt-6" aria-busy={suggestionsLoading}>
            <h2 className="text-sm font-bold">{t('connect.suggestions')}</h2>
            {suggestionsLoading ? (
              <div className="flex justify-center py-10">
                <Spinner className="size-5" />
              </div>
            ) : people.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t('connect.empty')}
                hint={t('connect.emptyHint')}
              />
            ) : (
              <ul className="mt-3 grid gap-2">
                {people.map((member) => (
                  <MemberRow
                    key={member.handle}
                    member={member}
                    state={states?.[member.handle]}
                    onRequest={(handle) => void onRequest(handle)}
                    busy={busyHandle === member.handle}
                  />
                ))}
              </ul>
            )}
          </section>
        )}

      </div>
    </AppShell>
  )
}
