import { useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n'

export function HorizonPasswordForm() {
  const { t } = useI18n()
  const { signIn } = useAuthActions()
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const normalizedHandle = handle.trim().toLowerCase().replace(/\\.hz$/, '')
    if (normalizedHandle.length < 3 || password.length === 0 || password.length > 128) {
      setError(t('auth.errorLogin'))
      return
    }

    setBusy(true)
    try {
      const data = new FormData()
      data.set('handle', normalizedHandle)
      data.set('password', password)
      await signIn('horizon-password', data)
    } catch {
      // Deliberately identical for unknown addresses, wrong passwords and locked accounts.
      setError(t('auth.errorLogin'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="mt-5 rounded-xl border px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {t('auth.hintHz')}
      </summary>
      <form onSubmit={submit} noValidate className="mt-4 grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="horizon-login-handle">{t('auth.hzAddress')}</Label>
          <Input
            id="horizon-login-handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder={t('auth.hzPlaceholder')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            maxLength={28}
            disabled={busy}
            className="h-12"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="horizon-login-password">{t('auth.password')}</Label>
          <Input
            id="horizon-login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            maxLength={128}
            disabled={busy}
            className="h-12"
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        ) : null}
        <Button type="submit" size="lg" disabled={busy || !handle.trim() || !password}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
      </form>
    </details>
  )
}
