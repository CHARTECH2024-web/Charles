import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"

/**
 * In-app notifications. Every notification belongs to exactly one member and
 * is created by backend events (a new message, a connection request, an alert),
 * never by the browser.
 */

export const push = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.union(
      v.literal("message"),
      v.literal("connection"),
      v.literal("post"),
      v.literal("comment"),
      v.literal("alert"),
    ),
    title: v.string(),
    body: v.string(),
    href: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      userId: args.userId,
      kind: args.kind,
      title: args.title.slice(0, 120),
      body: args.body.slice(0, 300),
      ...(args.href ? { href: args.href } : {}),
      createdAt: Date.now(),
    })
  },
})

/** Notifications of the signed-in member, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: true as const, items: [], unread: 0 }
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60)
    return {
      ok: true as const,
      items: rows.map((row) => ({
        id: row._id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        href: row.href ?? null,
        read: row.readAt !== undefined,
        createdAt: row.createdAt,
      })),
      unread: rows.filter((row) => row.readAt === undefined).length,
    }
  },
})

export const unread = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return 0
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
    return rows.filter((row) => row.readAt === undefined).length
  },
})

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false as const }
    const row = await ctx.db.get(args.notificationId)
    if (!row || row.userId !== userId) return { ok: false as const }
    if (!row.readAt) await ctx.db.patch(row._id, { readAt: Date.now() })
    return { ok: true as const }
  },
})

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false as const }
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
    for (const row of rows) {
      if (!row.readAt) await ctx.db.patch(row._id, { readAt: Date.now() })
    }
    return { ok: true as const }
  },
})
