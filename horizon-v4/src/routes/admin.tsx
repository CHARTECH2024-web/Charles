import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Search, ShieldCheck, ShieldOff, Trash2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { AppShell } from '@/components/app-shell'
import { PaymentsAdmin } from '@/components/admin/payments-admin'
import { MemberAvatar } from '@/components/member-avatar'
import { PageTitle, StatusBadge } from '@/components/page-parts'
import { VerifiedBadge } from '@/components/verified-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/lib/i18n'

const meta = siteMetadata['/admin']

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: AdminPage,
})

function AdminPage() {
  const { t } = useI18n()
  const admin = useQuery(api.admin.amIAdmin)

  return (
    <AppShell>
      <PageTitle>{t('admin.title')}</PageTitle>
      <p className="text-sm text-muted-foreground">{t('admin.intro')}</p>
      {admin === undefined ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-5" />
        </div>
      ) : admin.isAdmin ? (
        <AdminConsole />
      ) : (
        <p className="mt-6 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t('admin.forbidden')}
        </p>
      )}
    </AppShell>
  )
}

function AdminConsole() {
  const { t } = useI18n()
  const stats = useQuery(api.admin.stats)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(query.trim()), 300)
    return () => window.clearTimeout(id)
  }, [query])

  const members = useQuery(api.admin.listMembers, { search })
  const setRole = useMutation(api.admin.setRole)
  const setVerified = useMutation(api.admin.setVerified)
  const deleteAccount = useMutation(api.admin.deleteAccount)

  async function changeRole(userId: Id<'users'>, role: 'admin' | 'member') {
    try {
      const res = await setRole({ userId, role })
      if (res.ok) toast.success(t('admin.roleUpdated'))
      else toast.error(t('admin.actionFailed'))
    } catch {
      toast.error(t('admin.actionFailed'))
    }
  }

  async function toggleVerified(userId: Id<'users'>, verified: boolean) {
    try {
      const res = await setVerified({ userId, verified })
      if (res.ok) toast.success(t('admin.verifiedUpdated'))
      else toast.error(t('admin.actionFailed'))
    } catch {
      toast.error(t('admin.actionFailed'))
    }
  }

  async function removeAccount(userId: Id<'users'>) {
    if (!window.confirm(t('admin.deleteConfirm'))) return
    try {
      const res = await deleteAccount({ userId })
      if (res.ok) toast.success(t('admin.deleted'))
      else toast.error(t('admin.actionFailed'))
    } catch {
      toast.error(t('admin.actionFailed'))
    }
  }

  const statItems = stats
    ? [
        { key: 'members', label: t('admin.stat.members'), value: stats.members },
        { key: 'admins', label: t('admin.stat.admins'), value: stats.admins },
        { key: 'verified', label: t('admin.stat.verified'), value: stats.verified },
        { key: 'posts', label: t('admin.stat.posts'), value: stats.posts },
        { key: 'messages', label: t('admin.stat.messages'), value: stats.messages },
        { key: 'ledger', label: t('admin.stat.ledger'), value: stats.ledgerEntries },
      ]
    : []

  return (
    <div data-testid="admin-console" data-state={members ? 'ready' : 'loading'}>
      <PaymentsAdmin />
      <ul className="mt-5 grid grid-cols-3 gap-2">
        {statItems.map((item) => (
          <li
            key={item.key}
            className="rounded-xl border bg-card p-3 text-center text-card-foreground"
          >
            <p className="text-xl font-extrabold">{item.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {item.label}
            </p>
          </li>
        ))}
      </ul>

      <div className="relative mt-6">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          data-testid="admin-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.searchPlaceholder')}
          aria-label={t('admin.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      {!members ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5" />
        </div>
      ) : members.results.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t('admin.noResults')}
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {members.results.map((member) => (
            <li
              key={member.userId}
              data-testid="admin-member"
              data-handle={member.handle}
              className="rounded-xl border bg-card p-3 text-card-foreground"
            >
              <div className="flex items-center gap-3">
                <MemberAvatar name={member.displayName} photoUrl={member.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                    {member.displayName}
                    {member.verified ? <VerifiedBadge /> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.horizonId}
                    {member.email ? ` · ${member.email}` : ''}
                  </p>
                </div>
                <StatusBadge tone={member.role === 'admin' ? 'brand' : 'neutral'}>
                  {member.role === 'admin'
                    ? t('admin.role.admin')
                    : t('admin.role.member')}
                </StatusBadge>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void changeRole(
                      member.userId,
                      member.role === 'admin' ? 'member' : 'admin',
                    )
                  }
                >
                  {member.role === 'admin' ? <ShieldOff /> : <ShieldCheck />}
                  {member.role === 'admin'
                    ? t('admin.makeMember')
                    : t('admin.makeAdmin')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleVerified(member.userId, !member.verified)}
                >
                  <UserCheck />
                  {member.verified ? t('admin.unverify') : t('admin.verify')}
                </Button>
                {member.owner ? (
                  <StatusBadge tone="brand">{t('admin.owner')}</StatusBadge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => void removeAccount(member.userId)}
                  >
                    <Trash2 />
                    {t('admin.delete')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
