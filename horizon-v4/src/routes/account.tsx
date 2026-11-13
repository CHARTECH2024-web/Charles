import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { Crown, LogOut, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import siteMetadata from '../metadata.json'
import { api } from '@/convex/_generated/api'
import { AppShell } from '@/components/app-shell'
import { cleanHandleInput } from '@/components/auth/onboarding-form'
import { MemberAvatar } from '@/components/member-avatar'
import { PageTitle } from '@/components/page-parts'
import { VerifiedBadge } from '@/components/verified-badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { errorKey } from '@/lib/account-errors'
import { useAppUpdate } from '@/lib/app-update'
import { useAccount } from '@/lib/account'
import { useI18n } from '@/lib/i18n'
import { MAX_PHOTO_BYTES, uploadFile } from '@/lib/upload'
import { cn } from '@/lib/utils'

const meta = siteMetadata['/account']

export const Route = createFileRoute('/account')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: AccountPage,
})

function AccountPage() {
  const { t } = useI18n()
  const account = useAccount()

  return (
    <AppShell>
      <PageTitle>{t('acc.title')}</PageTitle>
      <Link
        to="/premium"
        data-testid="account-premium-link"
        className="mt-1 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4"
      >
        <Crown className="size-4" aria-hidden="true" />
        {t('acc.premiumLink')}
      </Link>
      {account.status === 'loading' ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : account.status === 'ready' ? (
        <ProfileEditor account={account} />
      ) : (
        <div className="mt-6 rounded-xl border p-6 text-center">
          <p className="text-sm text-muted-foreground">{t('acc.needSignIn')}</p>
          <Link
            to="/auth"
            className={cn(buttonVariants({ size: 'lg' }), 'mt-4 font-bold')}
          >
            {t('home.login')}
          </Link>
        </div>
      )}
    </AppShell>
  )
}

function ProfileEditor({
  account,
}: {
  account: Extract<ReturnType<typeof useAccount>, { status: 'ready' }>
}) {
  const { t, lang } = useI18n()
  const { signOut } = useAuthActions()
  const updateProfile = useMutation(api.profiles.updateProfile)
  const changeHandle = useMutation(api.profiles.changeHandle)
  const passwordStatus = useQuery(api.passwords.status)
  const savePasswordAction = useAction(api.passwords.setPassword)
  const revokeOtherSessions = useAction(api.googleAuth.revokeOtherSessions)
  const { forceUpdate, version } = useAppUpdate()
  const { profile, email } = account

  const [name, setName] = useState(profile.displayName)
  const [bio, setBio] = useState(profile.bio)
  const [saving, setSaving] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [newHandle, setNewHandle] = useState('')
  const [handleError, setHandleError] = useState('')
  const [changing, setChanging] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [revokingSessions, setRevokingSessions] = useState(false)

  const check = useQuery(
    api.profiles.checkHandle,
    newHandle.length >= 3 ? { handle: newHandle } : 'skip',
  )

  const dateFmt = (ms: number) => new Date(ms).toLocaleDateString(lang)
  const cooldownActive =
    profile.nextHandleChangeAt !== null && profile.nextHandleChangeAt > Date.now()

  async function save(e: FormEvent) {
    e.preventDefault()
    setProfileError('')
    setSaving(true)
    try {
      const res = await updateProfile({ displayName: name, bio })
      if (res.ok) toast.success(t('acc.saved'))
      else setProfileError(t(errorKey(res.code)))
    } catch {
      setProfileError(t('err.UNKNOWN'))
    } finally {
      setSaving(false)
    }
  }

  async function applyHandle(e: FormEvent) {
    e.preventDefault()
    setHandleError('')
    setChanging(true)
    try {
      const res = await changeHandle({ handle: newHandle })
      if (res.ok) {
        toast.success(t('acc.handleChanged'))
        setNewHandle('')
      } else if (res.code === 'COOLDOWN' && 'retryAfter' in res) {
        setHandleError(`${t('err.COOLDOWN')} ${dateFmt(res.retryAfter)}.`)
      } else {
        setHandleError(t(errorKey(res.code)))
      }
    } catch {
      setHandleError(t('err.UNKNOWN'))
    } finally {
      setChanging(false)
    }
  }

  const handleUnavailable =
    check && check.ok && !check.available ? errorKey(check.reason) : null

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordError('')
    if (password.length < 8) {
      setPasswordError(t('err.PASSWORD_TOO_SHORT'))
      return
    }
    if (password.length > 128) {
      setPasswordError(t('err.PASSWORD_TOO_LONG'))
      return
    }
    if (password !== passwordConfirm) {
      setPasswordError(t('pw.mismatch'))
      return
    }
    setSavingPassword(true)
    try {
      const result = await savePasswordAction({ password })
      if (result.ok) {
        toast.success(t('pw.saved'))
        setPassword('')
        setPasswordConfirm('')
      } else if (result.code === 'REAUTH_REQUIRED') {
        setPasswordError(t('pw.reauthHint'))
      } else if (result.code === 'PASSWORD_TOO_SHORT') {
        setPasswordError(t('err.PASSWORD_TOO_SHORT'))
      } else if (result.code === 'PASSWORD_TOO_LONG') {
        setPasswordError(t('err.PASSWORD_TOO_LONG'))
      } else {
        setPasswordError(t('err.UNAUTHENTICATED'))
      }
    } catch {
      setPasswordError(t('account.error'))
    } finally {
      setSavingPassword(false)
    }
  }

  async function signOutOtherDevices() {
    if (!window.confirm(t('security.revokeOtherConfirm'))) return
    setRevokingSessions(true)
    try {
      await revokeOtherSessions({})
      toast.success(t('security.revokeSuccess'))
    } catch {
      toast.error(t('security.error'))
    } finally {
      setRevokingSessions(false)
    }
  }

  return (
    <div className="mt-4 grid gap-6">
      <section className="flex items-center gap-4 rounded-2xl bg-brand-black p-5 text-white">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xl font-extrabold text-primary-foreground">
          {profile.photoUrl ? (
            <img
              src={profile.photoUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            profile.displayName.slice(0, 1).toUpperCase()
          )}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-lg font-bold">
            {profile.displayName}
            {profile.verified ? <VerifiedBadge /> : null}
          </p>
          <p className="truncate text-sm font-semibold text-brand-yellow">
            {profile.horizonId}
            {profile.role === 'admin' ? ` · ${t('admin.role.admin')}` : ''}
          </p>
          {email ? (
            <p className="truncate text-xs text-white/60">
              {t('acc.email')}: {email}
            </p>
          ) : null}
        </div>
      </section>

      <PhotoSection
        name={profile.displayName}
        photoUrl={profile.photoUrl}
      />

      <form onSubmit={save} noValidate className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="acc-name">{t('onb.name')}</Label>
          <Input
            id="acc-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="h-12 text-base"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="acc-bio">{t('acc.bio')}</Label>
          <Textarea
            id="acc-bio"
            value={bio}
            maxLength={200}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        {profileError ? (
          <p className="text-sm text-destructive" role="alert">
            {profileError}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={saving} className="font-bold">
          {t('acc.save')}
        </Button>
      </form>

      <form
        onSubmit={applyHandle}
        noValidate
        className="grid gap-3 rounded-xl border p-4"
      >
        <div>
          <h2 className="font-bold">{t('acc.handleSection')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('acc.handleRule')}
            {cooldownActive && profile.nextHandleChangeAt
              ? ` ${t('err.COOLDOWN')} ${dateFmt(profile.nextHandleChangeAt)}.`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            aria-label={t('acc.handleSection')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={newHandle}
            disabled={cooldownActive}
            placeholder={profile.handle}
            onChange={(e) => setNewHandle(cleanHandleInput(e.target.value))}
            className="h-11 flex-1"
          />
          <span className="rounded-md bg-brand-black px-3 py-2.5 text-sm font-bold text-brand-yellow">
            .HZ
          </span>
        </div>
        {handleUnavailable ? (
          <p className="text-sm text-destructive">{t(handleUnavailable)}</p>
        ) : null}
        {handleError ? (
          <p className="text-sm text-destructive" role="alert">
            {handleError}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="outline"
          disabled={
            changing ||
            cooldownActive ||
            newHandle.length < 3 ||
            handleUnavailable !== null
          }
        >
          {t('acc.changeHandle')}
        </Button>
      </form>

      <section
        data-testid="app-version"
        className="grid gap-3 rounded-xl border p-4"
      >
        <div>
          <h2 className="font-bold">{t('update.version')}</h2>
          <p className="text-sm text-muted-foreground">{t('update.versionHint')}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {version ?? '—'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={forceUpdate}
          data-testid="force-update"
          className="w-full rounded-full"
        >
          <RefreshCw />
          {t('update.force')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('update.forceHint')}</p>
      </section>

      <section className="grid gap-3 rounded-xl border p-4">
        <div>
          <h2 className="font-bold">{t('pw.section')}</h2>
          <p className="text-sm text-muted-foreground">{t('pw.sectionHint')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {passwordStatus?.ok && passwordStatus.hasPassword ? t('pw.change') : t('pw.none')}
          </p>
        </div>
        <form onSubmit={savePassword} noValidate className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="account-password">{t('pw.label')}</Label>
            <Input
              id="account-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={savingPassword}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-password-confirm">{t('pw.confirm')}</Label>
            <Input
              id="account-password-confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              disabled={savingPassword}
              className="h-11"
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('pw.hint')}</p>
          {passwordError ? <p className="text-sm text-destructive" role="alert">{passwordError}</p> : null}
          <Button type="submit" disabled={savingPassword || !password || !passwordConfirm}>
            {savingPassword ? t('auth.sending') : passwordStatus?.ok && passwordStatus.hasPassword ? t('pw.change') : t('pw.set')}
          </Button>
        </form>
      </section>

      <section className="grid gap-3 rounded-xl border p-4">
        <div>
          <h2 className="font-bold">{t('security.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('security.sessionsHint')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void signOutOtherDevices()} disabled={revokingSessions}>
          {revokingSessions ? t('auth.sending') : t('security.revokeOther')}
        </Button>
      </section>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => void signOut()}
      >
        <LogOut />
        {t('acc.signOut')}
      </Button>
    </div>
  )
}

function PhotoSection({
  name,
  photoUrl,
}: {
  name: string
  photoUrl: string | null
}) {
  const { t } = useI18n()
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl)
  const setPhoto = useMutation(api.profiles.setPhoto)
  const removePhoto = useMutation(api.profiles.removePhoto)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > MAX_PHOTO_BYTES) {
      toast.error(t('profile.photoError'))
      return
    }
    setBusy(true)
    try {
      const storageId = await uploadFile(() => generateUploadUrl(), file)
      const res = await setPhoto({ storageId })
      if (res.ok) toast.success(t('profile.photoSaved'))
      else toast.error(t('profile.photoError'))
    } catch {
      toast.error(t('profile.photoError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      data-testid="profile-photo"
      data-state={busy ? 'loading' : 'ready'}
      className="rounded-2xl border bg-card p-4 text-card-foreground"
    >
      <p className="text-sm font-bold">{t('profile.photo')}</p>
      <div className="mt-3 flex items-center gap-4">
        <MemberAvatar name={name} photoUrl={photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{t('profile.photoHint')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void pick(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Spinner className="size-4" /> : null}
              {t('profile.changePhoto')}
            </Button>
            {photoUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void removePhoto()}
              >
                {t('profile.removePhoto')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
