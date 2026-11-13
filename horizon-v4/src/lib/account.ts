import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export type AccountState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'needs-profile'; email: string | null; googleName: string | null }
  | {
      status: 'ready'
      email: string | null
      profile: {
        handle: string
        horizonId: string
        displayName: string
        photoUrl: string | null
        bio: string
        role: 'admin' | 'member'
        verified: boolean
        nextHandleChangeAt: number | null
      }
    }

/** Single source of truth for "who is using the app right now". */
export function useAccount(): AccountState {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const me = useQuery(api.profiles.me, isAuthenticated ? {} : 'skip')

  if (isLoading) return { status: 'loading' }
  if (!isAuthenticated) return { status: 'signed-out' }
  if (me === undefined) return { status: 'loading' }
  if (!me.ok) return { status: 'signed-out' }
  if (!me.profile) {
    return {
      status: 'needs-profile',
      email: me.email,
      googleName: me.googleName,
    }
  }
  return { status: 'ready', email: me.email, profile: me.profile }
}
