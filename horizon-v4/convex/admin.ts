import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"

// The owner of the app always keeps administration rights, even before the
// role is stored on a profile row.
const OWNER_EMAILS = new Set(["charlestechnology46@gmail.com"])

const ROLE = v.union(v.literal("admin"), v.literal("member"))

async function currentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" })
  const user = await ctx.db.get(userId)
  if (!user) throw new ConvexError({ code: "UNAUTHENTICATED" })
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  return { userId, user, profile }
}

function isOwner(user: Doc<"users">): boolean {
  return Boolean(user.email && OWNER_EMAILS.has(user.email.toLowerCase()))
}

/** True for the owner account and for profiles with the admin role. */
export async function isAdminUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const user = await ctx.db.get(userId)
  if (!user) return false
  if (isOwner(user)) return true
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  return profile?.role === "admin"
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const current = await currentUser(ctx)
  const admin = current.profile?.role === "admin" || isOwner(current.user)
  if (!admin) throw new ConvexError({ code: "FORBIDDEN" })
  return current
}

export const amIAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false as const, isAdmin: false }
    const user = await ctx.db.get(userId)
    if (!user) return { ok: false as const, isAdmin: false }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    return {
      ok: true as const,
      isAdmin: profile?.role === "admin" || isOwner(user),
    }
  },
})

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const profiles = await ctx.db.query("profiles").collect()
    const posts = await ctx.db.query("posts").collect()
    const messages = await ctx.db.query("messages").collect()
    const entries = await ctx.db.query("cahierEntries").collect()
    return {
      ok: true as const,
      members: profiles.length,
      admins: profiles.filter((p) => p.role === "admin").length,
      verified: profiles.filter((p) => p.verified).length,
      posts: posts.length,
      messages: messages.length,
      ledgerEntries: entries.length,
      lastSignupAt: profiles.reduce(
        (latest, p) => Math.max(latest, p._creationTime),
        0,
      ),
    }
  },
})

export const listMembers = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const term = args.search.trim().toLowerCase().slice(0, 40)

    const profiles = await ctx.db.query("profiles").order("desc").take(300)
    const matches = term
      ? profiles.filter(
          (p) =>
            p.handle.includes(term.replace(/\.hz$/, "")) ||
            p.displayName.toLowerCase().includes(term),
        )
      : profiles

    const rows = await Promise.all(
      matches.slice(0, 60).map(async (profile) => {
        const user = await ctx.db.get(profile.userId)
        return {
          userId: profile.userId,
          handle: profile.handle,
          horizonId: `${profile.handle}.HZ`,
          displayName: profile.displayName,
          photoUrl: profile.photoUrl ?? null,
          role:
            profile.role === "admin"
              ? ("admin" as const)
              : ("member" as const),
          verified: profile.verified === true,
          owner: user ? isOwner(user) : false,
          // Admin-only view: contact details are never exposed publicly.
          email: user?.email ?? null,
          createdAt: profile._creationTime,
        }
      }),
    )
    return { ok: true as const, results: rows }
  },
})

export const setRole = mutation({
  args: { userId: v.id("users"), role: ROLE },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx)
    const target = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (!target) return { ok: false as const, code: "NO_PROFILE" as const }

    if (args.role === "member") {
      const targetUser = await ctx.db.get(args.userId)
      if (targetUser && isOwner(targetUser)) {
        return { ok: false as const, code: "OWNER_IMMUTABLE" as const }
      }
      if (args.userId === adminId) {
        return { ok: false as const, code: "CANNOT_DEMOTE_SELF" as const }
      }
    }

    await ctx.db.patch(target._id, { role: args.role })
    return { ok: true as const, role: args.role }
  },
})

export const setVerified = mutation({
  args: { userId: v.id("users"), verified: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const target = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (!target) return { ok: false as const, code: "NO_PROFILE" as const }
    await ctx.db.patch(target._id, {
      verified: args.verified,
      ...(args.verified ? { verifiedAt: Date.now() } : { verifiedAt: undefined }),
    })
    return { ok: true as const, verified: args.verified }
  },
})

export const deleteAccount = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx)
    if (args.userId === adminId) {
      return { ok: false as const, code: "CANNOT_DELETE_SELF" as const }
    }
    const target = await ctx.db.get(args.userId)
    if (target && isOwner(target)) {
      return { ok: false as const, code: "OWNER_IMMUTABLE" as const }
    }

    // Content authored by this person.
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", args.userId))
      .collect()
    for (const post of posts) {
      const comments = await ctx.db
        .query("postComments")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect()
      for (const row of comments) await ctx.db.delete(row._id)
      const likes = await ctx.db
        .query("postLikes")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect()
      for (const row of likes) await ctx.db.delete(row._id)
      if (post.mediaId) await ctx.storage.delete(post.mediaId)
      await ctx.db.delete(post._id)
    }

    const ownLikes = await ctx.db
      .query("postLikes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()
    for (const row of ownLikes) await ctx.db.delete(row._id)

    const ownComments = await ctx.db
      .query("postComments")
      .withIndex("by_author", (q) => q.eq("userId", args.userId))
      .collect()
    for (const row of ownComments) await ctx.db.delete(row._id)

    const sent = await ctx.db
      .query("messages")
      .withIndex("by_from", (q) => q.eq("fromId", args.userId))
      .collect()
    const received = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", args.userId))
      .collect()
    for (const message of [...sent, ...received]) {
      if (message.mediaId) await ctx.storage.delete(message.mediaId)
      await ctx.db.delete(message._id)
    }

    const entries = await ctx.db
      .query("cahierEntries")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect()
    for (const row of entries) await ctx.db.delete(row._id)

    const credentials = await ctx.db
      .query("passwordCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (credentials) await ctx.db.delete(credentials._id)

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (profile) await ctx.db.delete(profile._id)

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect()
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect()
      for (const row of codes) await ctx.db.delete(row._id)
      await ctx.db.delete(account._id)
    }

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect()
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect()
      for (const row of tokens) await ctx.db.delete(row._id)
      await ctx.db.delete(session._id)
    }

    if (target) await ctx.db.delete(target._id)
    return { ok: true as const }
  },
})
