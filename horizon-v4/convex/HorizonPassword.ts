import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials"
import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import {
  PASSWORD_MAX,
  burnTime,
  verifyPassword,
} from "./passwordCrypto"

// Sign in with the HORIZON address (e.g. "charles.HZ") and a password.
// Every failure returns the same null so nobody can tell whether an address
// exists, and repeated failures lock the account for a short time.
export const HorizonPassword = ConvexCredentials({
  id: "horizon-password",
  authorize: async (
    credentials,
    ctx,
  ): Promise<{ userId: Id<"users"> } | null> => {
    const rawHandle = credentials.handle
    const password = credentials.password
    if (typeof rawHandle !== "string" || typeof password !== "string") {
      return null
    }
    if (password.length === 0 || password.length > PASSWORD_MAX) return null

    const handle = rawHandle.trim().toLowerCase().replace(/\.hz$/, "")
    if (handle.length < 3 || handle.length > 24) return null

    const row = await ctx.runQuery(internal.passwords.credentialForHandle, {
      handle,
    })
    if (!row) {
      await burnTime(password)
      return null
    }
    if (row.lockedUntil !== null && row.lockedUntil > Date.now()) {
      await burnTime(password)
      return null
    }

    const ok = await verifyPassword(password, row.hash)
    await ctx.runMutation(internal.passwords.recordAttempt, {
      userId: row.userId,
      success: ok,
    })
    return ok ? { userId: row.userId } : null
  },
})
