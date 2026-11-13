import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorKey } from '@/lib/account-errors'
import { useI18n } from '@/lib/i18n'

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function cleanHandleInput(raw: string) {
  return raw.toLowerCase().replace(/\.hz$/, '').replace(/[^a-z0-9._]/g, '').slice(0, 24)
}

export function OnboardingForm({ initialName }: { initialName: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const createProfile = useMutation(api.profiles.createProfile)

  const [name, setName] = useState(initialName)
  const [handle, setHandle] = useState('')
  const [age, setAge] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const debouncedName = useDebounced(name.trim(), 400)
  const debouncedHandle = useDebounced(handle, 350)

  const suggestions = useQuery(
    api.profiles.suggestHandles,
    debouncedName.length >= 2 ? { name: debouncedName } : 'skip',
  )
  const check = useQuery(
    api.profiles.checkHandle,
    debouncedHandle.length >= 3 ? { handle: debouncedHandle } : 'skip',
  )

  const checking = handle.length >= 3 && (debouncedHandle !== handle || check === undefined)
  const availability =
    !checking && check && check.ok && handle.length >= 3
      ? check.available
        ? ('available' as const)
        : ('unavailable' as const)
      : null
  const unavailableKey =
    availability === 'unavailable' && check && check.ok
      ? errorKey(check.reason)
      : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!age) {
      setError(t(errorKey('AGE_NOT_CONFIRMED')))
      return
    }
    setBusy(true)
    try {
      const res = await createProfile({
        handle,
        displayName: name,
        ageConfirmed: age,
      })
      if (res.ok) {
        await navigate({ to: '/' })
        return
      }
      setError(t(errorKey(res.code)))
    } catch {
      setError(t('err.UNKNOWN'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">{t('onb.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('onb.subtitle')}</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="onb-name">{t('onb.name')}</Label>
        <Input
          id="onb-name"
          autoComplete="name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-base"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="onb-handle">{t('onb.handle')}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="onb-handle"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={handle}
            onChange={(e) => setHandle(cleanHandleInput(e.target.value))}
            aria-invalid={availability === 'unavailable' ? true : undefined}
            className="h-12 flex-1 text-base"
          />
          <span className="rounded-md bg-brand-black px-3 py-3 text-sm font-bold text-brand-yellow">
            .HZ
          </span>
        </div>
        <p className="min-h-5 text-sm" aria-live="polite">
          {checking ? (
            <span className="text-muted-foreground">{t('onb.checking')}</span>
          ) : availability === 'available' ? (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Check className="size-4" />
              {handle}.HZ — {t('onb.available')}
            </span>
          ) : unavailableKey ? (
            <span className="text-destructive">{t(unavailableKey)}</span>
          ) : (
            <span className="text-muted-foreground">{t('onb.handleHint')}</span>
          )}
        </p>

        {suggestions && suggestions.ok && suggestions.suggestions.length > 0 ? (
          <div className="grid gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('onb.suggestions')}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setHandle(s)}
                  className="rounded-full border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
                >
                  {s}.HZ
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={age}
          onChange={(e) => setAge(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        {t('auth.age')}
      </label>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={busy || checking || availability === 'unavailable' || name.trim().length < 2 || handle.length < 3}
        className="h-12 w-full text-base font-bold"
      >
        {t('onb.submit')}
      </Button>
    </form>
  )
}
