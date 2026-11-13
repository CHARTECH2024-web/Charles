import { useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n'

type Mode = 'signin' | 'register'

export function PhoneAuthForm() {
  const { t } = useI18n()
  const { signIn } = useAuthActions()
  const [mode, setMode] = useState<Mode>('signin')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const digits = phone.replace(/\D/g, '')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (digits.length < 8) {
      setError(t('auth.phone.error'))
      return
    }
    if (password.length < 8 || password.length > 128) {
      setError(t('auth.phone.weak'))
      return
    }

    setBusy(true)
    try {
      const data = new FormData()
      data.set('phone', phone.trim())
      data.set('password', password)
      data.set('mode', mode)
      if (mode === 'register') data.set('name', name.trim())
      await signIn('horizon-phone', data)
    } catch {
      setError(mode === 'register' ? t('auth.phone.exists') : t('auth.phone.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      data-testid="phone-auth"
      className="mt-6 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <h2 className="text-sm font-bold">{t('auth.phone.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('auth.phone.body')}</p>

      <form onSubmit={submit} noValidate className="mt-4 grid gap-3">
        {mode === 'register' ? (
          <div className="grid gap-2">
            <Label htmlFor="phone-name">{t('auth.phone.name')}</Label>
            <Input
              id="phone-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              maxLength={80}
              disabled={busy}
              className="h-12"
            />
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="phone-number">{t('auth.phone.label')}</Label>
          <Input
            id="phone-number"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t('auth.phone.placeholder')}
            autoComplete="tel"
            maxLength={24}
            disabled={busy}
            className="h-12"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="phone-password">{t('auth.phone.password')}</Label>
          <Input
            id="phone-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            maxLength={128}
            disabled={busy}
            className="h-12"
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={busy || digits.length < 8 || !password}>
          {busy
            ? t('auth.phone.working')
            : mode === 'register'
              ? t('auth.phone.signUp')
              : t('auth.phone.signIn')}
        </Button>
      </form>

      <button
        type="button"
        data-testid="phone-mode-toggle"
        className="mt-3 text-xs font-semibold text-muted-foreground underline underline-offset-4"
        onClick={() => {
          setError('')
          setMode(mode === 'signin' ? 'register' : 'signin')
        }}
        disabled={busy}
      >
        {mode === 'signin' ? t('auth.phone.toSignUp') : t('auth.phone.toSignIn')}
      </button>
    </section>
  )
}
