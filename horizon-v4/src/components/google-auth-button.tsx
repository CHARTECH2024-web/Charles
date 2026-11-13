import { useRef, useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import {
  createGoogleAuthChallenge,
  createGoogleAuthHandoff,
  createGoogleAuthVerifier,
  takeGoogleAuthHandoff,
} from '@/lib/google-auth-handoff'

const POPUP_POLL_INTERVAL_MS = 2_000
const POPUP_TIMEOUT_MS = 10 * 60 * 1000
const POPUP_READY_TIMEOUT_MS = 10_000
const POPUP_READY_MESSAGE = 'macaly-google-popup-ready'
const POPUP_START_MESSAGE = 'macaly-google-popup-start'

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function openGoogleAuthPopup(): Window | null {
  const width = 520
  const height = 720
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  return window.open(
    '/auth/google/popup',
    '_blank',
    `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
  )
}

function waitForGoogleAuthPopup(authWindow: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage)
      reject(new Error('Google sign-in popup timed out'))
    }, POPUP_READY_TIMEOUT_MS)
    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== authWindow ||
        event.data?.type !== POPUP_READY_MESSAGE
      ) {
        return
      }
      window.clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)
      resolve()
    }
    window.addEventListener('message', handleMessage)
  })
}

export function GoogleAuthButton() {
  const { t } = useI18n()
  const { signIn } = useAuthActions()
  const createAuthorizationUrl = useAction(api.googleAuth.createAuthorizationUrl)
  const getAuthorizationStatus = useAction(api.googleAuth.getAuthorizationStatus)
  const attempt = useRef(0)
  const popup = useRef<Window | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const start = async () => {
    const attemptId = ++attempt.current
    setError(null)
    setLoading(true)
    let authWindow: Window | null = null
    try {
      const flowMode = window.top === window ? 'redirect' : 'popup'
      // Store the verifier in the initiating context before the first await.
      const handoffChallengePromise = createGoogleAuthHandoff('sign-in')
      const popupVerifier =
        flowMode === 'popup' ? createGoogleAuthVerifier() : null
      const popupChallengePromise = popupVerifier
        ? createGoogleAuthChallenge(popupVerifier)
        : Promise.resolve(null)
      let popupReady: Promise<void> | null = null
      if (flowMode === 'popup') {
        authWindow = openGoogleAuthPopup()
        if (!authWindow) throw new Error('Google sign-in popup was blocked')
        popup.current = authWindow
        popupReady = waitForGoogleAuthPopup(authWindow)
      }
      const [handoffChallenge, popupChallenge] = await Promise.all([
        handoffChallengePromise,
        popupChallengePromise,
      ])
      const authorizationPromise = createAuthorizationUrl({
        appOrigin: window.location.origin,
        handoffChallenge,
        flowMode,
        ...(popupChallenge ? { popupChallenge } : {}),
      })
      const authorization = authWindow
        ? (
            await Promise.all([
              authorizationPromise,
              popupReady ?? Promise.reject(new Error('Google popup failed')),
            ])
          )[0]
        : await authorizationPromise
      if (authWindow && popupVerifier) {
        authWindow.postMessage(
          {
            type: POPUP_START_MESSAGE,
            flowId: authorization.flowId,
            authorizationUrl: authorization.authorizationUrl,
            popupVerifier,
          },
          window.location.origin,
        )
      } else {
        window.location.href = authorization.authorizationUrl
      }
      if (!authWindow) return

      const deadline = Date.now() + POPUP_TIMEOUT_MS
      while (attempt.current === attemptId && Date.now() < deadline) {
        const status = await getAuthorizationStatus({
          flowId: authorization.flowId,
        })
        if (status.status === 'pending') {
          await wait(POPUP_POLL_INTERVAL_MS)
          continue
        }
        const handoff = takeGoogleAuthHandoff()
        if (status.status === 'error') {
          throw new Error(
            status.error === 'access_denied'
              ? 'Google sign-in was cancelled.'
              : 'Google sign-in failed.',
          )
        }
        if (!handoff) throw new Error('Google sign-in handoff expired.')
        await signIn('macaly-google', {
          grant: status.grant,
          handoffVerifier: handoff.verifier,
          linkToCurrentUser: handoff.mode === 'link',
        })
        authWindow.close()
        popup.current = null
        setLoading(false)
        return
      }
      if (attempt.current === attemptId) {
        throw new Error('Google sign-in timed out. Please try again.')
      }
    } catch {
      if (attempt.current !== attemptId) return
      authWindow?.close()
      popup.current = null
      takeGoogleAuthHandoff()
      setError(t('auth.googleError'))
      setLoading(false)
    }
  }

  const cancel = () => {
    attempt.current += 1
    popup.current?.close()
    popup.current = null
    takeGoogleAuthHandoff()
    setLoading(false)
    setError(null)
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 w-full text-base"
        onClick={() => void start()}
        disabled={loading}
      >
        <span aria-hidden className="text-lg font-bold">
          G
        </span>
        {loading ? t('auth.googleLoading') : t('auth.google')}
      </Button>
      {loading ? (
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          {t('auth.cancel')}
        </Button>
      ) : null}
      {error ? (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
