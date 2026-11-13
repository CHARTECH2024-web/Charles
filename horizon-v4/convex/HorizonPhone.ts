import { createAccount } from "@convex-dev/auth/server"
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials"
import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { PASSWORD_MAX, burnTime, hashPassword, verifyPassword } from "./passwordCrypto"
import { normalizePhone } from "./phoneAuth"

/**
 * Sign up / sign in with a phone number and a password.
 *
 * There is no SMS gateway in this project, so the number is verified by the
 * password the member chose at signup instead of a one-time code. Repeated
 * failures lock the account for a short time and every failure is
 * indistinguishable from an unknown number.
 */
export const HorizonPhone = ConvexCredentials({
  id: "horizon-phone",
  authorize: async (
    credentials,
    ctx,
  ): Promise<{ userId: Id<"users"> } | null> => {
    const rawPhone = credentials.phone
    const password = credentials.password
    const mode = credentials.mode === "register" ? "register" : "signin"
    const name = typeof credentials.name === "string" ? credentials.name : ""

    if (typeof rawPhone !== "string" || typeof password !== "string") return null
    const phone = normalizePhone(rawPhone)
    if (phone.replace(/\D/g, "").length < 8) return null
    if (password.length < 8 || password.length > PASSWORD_MAX) return null

    const existing = await ctx.runQuery(internal.phoneAuth.credentialForPhone, {
      phone,
    })

    if (mode === "register") {
      if (existing) return null
      const hash = await hashPassword(password)
      const { user } = await createAccount(ctx, {
        provider: "horizon-phone",
        account: { id: phone },
        profile: {
          phone,
          phoneVerificationTime: Date.now(),
          ...(name.trim() ? { name: name.trim().slice(0, 80) } : {}),
        },
      })
      await ctx.runMutation(internal.phoneAuth.storeCredential, {
        userId: user._id,
        phone,
        hash,
      })
      await ctx.runMutation(internal.phoneAuth.setUserPhone, {
        userId: user._id,
        phone,
      })
      return { userId: user._id }
    }

    if (!existing) {
      await burnTime(password)
      return null
    }
    if (existing.lockedUntil !== null && existing.lockedUntil > Date.now()) {
      await burnTime(password)
      return null
    }
    const ok = await verifyPassword(password, existing.hash)
    await ctx.runMutation(internal.phoneAuth.recordAttempt, {
      userId: existing.userId,
      success: ok,
    })
    return ok ? { userId: existing.userId } : null
  },
})
