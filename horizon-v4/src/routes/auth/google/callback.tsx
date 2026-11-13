import { useRef, useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useAction } from 'convex/react'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '@/convex/_generated/api'
import { useMountEffect } from '@/hooks/use-mount-effect'
import {
  describeGoogleAuthError,
  takeGoogleAuthHandoff,
  takeGoogleAuthPopupProof,
} from '@/lib/google-auth-handoff'

export const Route = createFileRoute('/auth/google/callback')({
  component: GoogleAuthCallbackPage,
})

function GoogleAuthCallbackPage() {
  const { signIn } = useAuthActions()
  const completeAuthorizationPopup = useAction(
    api.googleAuth.completeAuthorizationPopup,
  )
  const handled = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useMountEffect(() => {
    if (handled.current) return
    handled.current = true
    const params = new URLSearchParams(window.location.hash.slice(1))
    const grant = params.get('macaly_google_grant')
    const oauthError = params.get('macaly_google_error')
    const flowId = params.get('macaly_google_flow')
    window.history.replaceState(null, '', window.location.pathname)

    if (flowId) {
      const popupVerifier = takeGoogleAuthPopupProof(flowId)
      if (!grant || !popupVerifier || oauthError) {
        setError('Google sign-in failed. Return to the app and try again.')
        return
      }
      void completeAuthorizationPopup({ flowId, grant, popupVerifier })
        .then(() => window.close())
        .catch(() =>
          setError('Google sign-in failed. Return to the app and try again.'),
        )
      return
    }

    const handoff = takeGoogleAuthHandoff()

    if (!grant || !handoff || oauthError) {
      setError(
        oauthError === 'access_denied'
          ? 'Google sign-in was cancelled.'
          : 'Google sign-in failed.',
      )
      return
    }
    void signIn('macaly-google', {
      grant,
      handoffVerifier: handoff.verifier,
      linkToCurrentUser: handoff.mode === 'link',
    })
      .then(() => window.location.replace('/auth'))
      .catch((caught) =>
        setError(describeGoogleAuthError(caught, handoff.mode)),
      )
  })

  if (error) {
    return (
      <div className="p-6 text-center">
        <p role="alert">{error}</p>
        <a className="mt-3 inline-block underline" href="/auth">
          Retry
        </a>
      </div>
    )
  }
  return <p className="p-6 text-center">…</p>
}
