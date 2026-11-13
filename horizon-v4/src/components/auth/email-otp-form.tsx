import { useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function EmailOtpForm() {
  const { t } = useI18n()
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function sendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const value = email.trim().toLowerCase()
    if (!EMAIL_RE.test(value)) {
      setError(t('auth.errorEmail'))
      return
    }
    setBusy(true)
    try {
      const data = new FormData()
      data.set('email', value)
      await signIn('resend-otp', data)
      setEmail(value)
      setStep('code')
    } catch {
      setError(t('auth.errorSend'))
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = new FormData(e.currentTarget)
    const code = String(form.get('code') ?? '').replace(/\s/g, '')
    if (!/^\d{6}$/.test(code)) {
      setError(t('auth.errorCode'))
      return
    }
    setBusy(true)
    try {
      const data = new FormData()
      data.set('email', email)
      data.set('code', code)
      await signIn('resend-otp', data)
      // On success the account state changes and the page moves on by itself.
    } catch {
      setError(t('auth.errorCode'))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'code') {
    return (
      <form onSubmit={verifyCode} noValidate className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {t('auth.codeSentTo')}{' '}
          <span className="font-semibold text-foreground">{email}</span>
        </p>
        <div className="grid gap-2">
          <Label htmlFor="otp-code">{t('auth.code')}</Label>
          <Input
            id="otp-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            disabled={busy}
            aria-invalid={error ? true : undefined}
            className="h-12 text-center text-xl tracking-[0.4em]"
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" disabled={busy} className="h-12 w-full text-base font-bold">
          {busy ? t('auth.verifying') : t('auth.verify')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setStep('email')
            setError('')
          }}
        >
          {t('auth.changeEmail')}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={sendCode} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="otp-email">{t('auth.email')}</Label>
        <Input
          id="otp-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          className="h-12 text-base"
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" disabled={busy} className="h-12 w-full text-base font-bold">
        {busy ? t('auth.sending') : t('auth.sendEmailCode')}
      </Button>
    </form>
  )
}
