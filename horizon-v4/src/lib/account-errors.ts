import type { TranslationKey } from '@/lib/i18n'

const KNOWN = new Set([
  'HANDLE_TAKEN',
  'INVALID_HANDLE',
  'RESERVED_HANDLE',
  'INVALID_NAME',
  'AGE_NOT_CONFIRMED',
  'ALREADY_HAS_PROFILE',
  'SAME_HANDLE',
  'SAME',
  'TAKEN',
  'COOLDOWN',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'UNAUTHENTICATED',
])

/** Maps a backend error code to a translation key (never leaks raw codes). */
export function errorKey(code: string | null | undefined): TranslationKey {
  return (code && KNOWN.has(code) ? `err.${code}` : 'err.UNKNOWN') as TranslationKey
}
