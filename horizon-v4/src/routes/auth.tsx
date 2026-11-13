import { useEffect } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import siteMetadata from '../metadata.json'
import { EmailOtpForm } from '@/components/auth/email-otp-form'
import { HorizonPasswordForm } from '@/components/auth/horizon-password-form'
import { OnboardingForm } from '@/components/auth/onboarding-form'
import { PhoneAuthForm } from '@/components/auth/phone-auth-form'
import { GoogleAuthButton } from '@/components/google-auth-button'
import { HorizonLogo } from '@/components/horizon-logo'
import { PreferencesMenu } from '@/components/preferences-menu'
import { Spinner } from '@/components/ui/spinner'
import { buttonVariants } from '@/components/ui/button'
import { useAccount } from '@/lib/account'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const meta = siteMetadata['/auth']

export const Route = createFileRoute('/auth')({
  head: () => ({
    meta: [
      { title: meta.title },
      { name: 'description', content: meta.description },
    ],
  }),
  component: AuthPage,
})

function AuthPage() {
  const { t } = useI18n()
  const account = useAccount()
  const navigate = useNavigate()

  // Once signed in with a complete identity, leave the auth page.
  useEffect(() => {
    if (account.status === 'ready') void navigate({ to: '/' })
  }, [account.status, navigate])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <Link
          to="/"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          <ArrowLeft />
          {t('common.back')}
        </Link>
        <PreferencesMenu />
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-12 pt-4">
        {account.status === 'loading' || account.status === 'ready' ? (
          <div className="flex justify-center py-24" aria-live="polite">
            <Spinner className="size-6" />
          </div>
        ) : account.status === 'needs-profile' ? (
          <OnboardingForm initialName={account.googleName ?? ''} />
        ) : (
          <SignInPanel />
        )}
      </main>
    </div>
  )
}

function SignInPanel() {
  const { t } = useI18n()
  return (
    <>
      <div className="flex flex-col items-center text-center">
        <HorizonLogo className="scale-125" />
        <h1 className="mt-5 text-2xl font-extrabold">{t('auth.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('auth.subtitle')}
        </p>
      </div>

      <div className="mt-6">
        <GoogleAuthButton />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('auth.or')}
        <span className="h-px flex-1 bg-border" />
      </div>

      <EmailOtpForm />
      <HorizonPasswordForm />

      <PhoneAuthForm />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t('auth.legal')}
      </p>
    </>
  )
}
