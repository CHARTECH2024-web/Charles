import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { consumeOwnedUpload } from "./uploads"
import { internal } from "./_generated/api"
import { limitsOf, planOf } from "./billing"

const KIND = v.union(v.literal("text"), v.literal("voice"))
const MAX_TEXT = 2000

function cleanText(input: string, max: number): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

/** Creates the in-app notification for a new incoming message. */
async function notifyMessage(
  ctx: MutationCtx,
  fromId: Id<"users">,
  toId: Id<"users">,
  preview: string,
) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", fromId))
    .unique()
  await ctx.runMutation(internal.notifications.push, {
    userId: toId,
    kind: "message",
    title: `Nouveau message de ${profile?.displayName ?? "un membre"}`,
    body: preview.slice(0, 120),
    href: "/messages",
  })
}

async function requireUser(ctx: Parameters<typeof getAuthUserId>[0]) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" })
  return userId
}

async function publicPerson(ctx: QueryCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  return {
    userId,
    displayName: profile?.displayName ?? "HORIZON",
    horizonId: profile ? `${profile.handle}.HZ` : "",
    photoUrl: profile?.photoUrl ?? null,
    verified: profile?.verified === true,
  }
}

async function toClient(ctx: QueryCtx, message: Doc<"messages">) {
  return {
    id: message._id,
    fromId: message.fromId,
    kind: message.kind,
    body: message.body ?? "",
    audioUrl: message.mediaId ? await ctx.storage.getUrl(message.mediaId) : null,
    durationMs: message.durationMs ?? null,
    createdAt: message.createdAt,
  }
}

/** People the signed-in member is talking to, newest conversation first. */
export const conversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx)
    const sent = await ctx.db
      .query("messages")
      .withIndex("by_from", (q) => q.eq("fromId", userId))
      .collect()
    const received = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", userId))
      .collect()

    const latest = new Map<
      Id<"users">,
      { message: Doc<"messages">; unread: number }
    >()
    for (const message of [...sent, ...received]) {
      const otherId = message.fromId === userId ? message.toId : message.fromId
      const entry = latest.get(otherId)
      const unread = message.toId === userId && !message.readAt ? 1 : 0
      if (!entry || message.createdAt > entry.message.createdAt) {
        latest.set(otherId, {
          message,
          unread: (entry?.unread ?? 0) + unread,
        })
      } else {
        entry.unread += unread
      }
    }

    const results = await Promise.all(
      [...latest].map(async ([otherId, entry]) => ({
        person: await publicPerson(ctx, otherId),
        lastMessage:
          entry.message.kind === "voice"
            ? {
                kind: "voice" as const,
                preview: "",
                createdAt: entry.message.createdAt,
              }
            : {
                kind: "text" as const,
                preview: entry.message.body ?? "",
                createdAt: entry.message.createdAt,
              },
        unread: entry.unread,
      })),
    )
    results.sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt)
    return { ok: true as const, results }
  },
})

export const thread = query({
  args: { withUserId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const sent = await ctx.db
      .query("messages")
      .withIndex("by_pair", (q) =>
        q.eq("fromId", userId).eq("toId", args.withUserId),
      )
      .collect()
    const received = await ctx.db
      .query("messages")
      .withIndex("by_pair", (q) =>
        q.eq("fromId", args.withUserId).eq("toId", userId),
      )
      .collect()

    const messages = [...sent, ...received]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-200)

    const results = await Promise.all(
      messages.map((message) => toClient(ctx, message)),
    )
    return {
      ok: true as const,
      person: await publicPerson(ctx, args.withUserId),
      results,
    }
  },
})

export const send = mutation({
  args: {
    toUserId: v.id("users"),
    kind: KIND,
    body: v.optional(v.string()),
    mediaId: v.optional(v.id("_storage")),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    if (args.toUserId === userId) {
      return { ok: false as const, code: "CANNOT_MESSAGE_SELF" as const }
    }
    const recipient = await ctx.db.get(args.toUserId)
    if (!recipient) return { ok: false as const, code: "NO_RECIPIENT" as const }

    if (args.kind === "text") {
      const body = cleanText(args.body ?? "", MAX_TEXT)
      if (body.length === 0) {
        return { ok: false as const, code: "EMPTY_MESSAGE" as const }
      }
      await ctx.db.insert("messages", {
        fromId: userId,
        toId: args.toUserId,
        kind: "text",
        body,
        createdAt: Date.now(),
      })
      await notifyMessage(ctx, userId, args.toUserId, body)
      return { ok: true as const }
    }

    if (!args.mediaId) {
      return { ok: false as const, code: "MISSING_AUDIO" as const }
    }
    const file = await ctx.db.system.get(args.mediaId)
    if (!file) return { ok: false as const, code: "MISSING_AUDIO" as const }
    const duration = Math.max(
      0,
      Math.min(Math.round(args.durationMs ?? 0), 10 * 60 * 1000),
    )
    const { plan } = await planOf(ctx, userId)
    if (duration > limitsOf(plan).voiceMinutes * 60 * 1000) {
      return { ok: false as const, code: "VOICE_TOO_LONG" as const }
    }
    const owned = await consumeOwnedUpload(ctx, userId, args.mediaId, "message")
    if (!owned) return { ok: false as const, code: "INVALID_MEDIA_OWNER" as const }
    await ctx.db.insert("messages", {
      fromId: userId,
      toId: args.toUserId,
      kind: "voice",
      mediaId: args.mediaId,
      durationMs: duration,
      createdAt: Date.now(),
    })
    await notifyMessage(ctx, userId, args.toUserId, "Message vocal")
    return { ok: true as const }
  },
})

export const markRead = mutation({
  args: { withUserId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const unread = await ctx.db
      .query("messages")
      .withIndex("by_pair", (q) =>
        q.eq("fromId", args.withUserId).eq("toId", userId),
      )
      .collect()
    for (const message of unread) {
      if (!message.readAt) await ctx.db.patch(message._id, { readAt: Date.now() })
    }
    return { ok: true as const }
  },
})

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx)
    const received = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", userId))
      .collect()
    return { ok: true as const, count: received.filter((m) => !m.readAt).length }
  },
})
