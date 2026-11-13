import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { consumeOwnedUpload } from "./uploads"
import { internal } from "./_generated/api"
import { limitsOf, planOf } from "./billing"

const MEDIA_KIND = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("pdf"),
)

const MAX_BODY = 2000

function cleanText(input: string, max: number): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

async function requireUser(ctx: Parameters<typeof getAuthUserId>[0]) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" })
  return userId
}

/** Accepted contacts of one member, both request directions included. */
async function connectionIds(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Set<Id<"users">>> {
  const sent = await ctx.db
    .query("connections")
    .withIndex("by_from", (q) => q.eq("fromId", userId))
    .collect()
  const received = await ctx.db
    .query("connections")
    .withIndex("by_to", (q) => q.eq("toId", userId))
    .collect()
  const ids = new Set<Id<"users">>()
  for (const row of [...sent, ...received]) {
    if (row.status !== "accepted") continue
    ids.add(row.fromId === userId ? row.toId : row.fromId)
  }
  ids.delete(userId)
  return ids
}

async function notify(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: "post" | "comment",
  title: string,
  body: string,
  href: string,
) {
  await ctx.runMutation(internal.notifications.push, {
    userId,
    kind,
    title,
    body,
    href,
  })
}

async function publicAuthor(ctx: QueryCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  return {
    displayName: profile?.displayName ?? "HORIZON",
    horizonId: profile ? `${profile.handle}.HZ` : "",
    photoUrl: profile?.photoUrl ?? null,
    verified: profile?.verified === true,
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx)
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(30)

    const results = await Promise.all(
      posts.map(async (post) => {
        const likes = await ctx.db
          .query("postLikes")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect()
        const comments = await ctx.db
          .query("postComments")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect()
        return {
          id: post._id,
          body: post.body,
          mediaKind: post.mediaKind ?? null,
          mediaName: post.mediaName ?? null,
          boosted: post.boostedAt !== undefined,
          mediaUrl: post.mediaId ? await ctx.storage.getUrl(post.mediaId) : null,
          createdAt: post.createdAt,
          author: await publicAuthor(ctx, post.authorId),
          isMine: post.authorId === userId,
          likeCount: likes.length,
          likedByMe: likes.some((like) => like.userId === userId),
          commentCount: comments.length,
        }
      }),
    )
    return { ok: true as const, results }
  },
})

export const create = mutation({
  args: {
    body: v.string(),
    mediaId: v.optional(v.id("_storage")),
    mediaKind: v.optional(MEDIA_KIND),
    mediaName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const body = cleanText(args.body, MAX_BODY)
    if (body.length === 0 && !args.mediaId) {
      return { ok: false as const, code: "EMPTY_POST" as const }
    }
    if (args.mediaId) {
      const file = await ctx.db.system.get(args.mediaId)
      if (!file) return { ok: false as const, code: "INVALID_MEDIA" as const }
      if (!args.mediaKind) {
        return { ok: false as const, code: "INVALID_MEDIA" as const }
      }
      // Concrete plan limits: media size and total storage.
      const { plan } = await planOf(ctx, userId)
      const limits = limitsOf(plan)
      const mb = file.size / (1024 * 1024)
      if (args.mediaKind === "video" && mb > limits.videoMb) {
        return { ok: false as const, code: "VIDEO_TOO_BIG" as const }
      }
      if (args.mediaKind === "pdf" && mb > limits.pdfMb) {
        return { ok: false as const, code: "PDF_TOO_BIG" as const }
      }
      const mine = await ctx.db
        .query("posts")
        .withIndex("by_author", (q) => q.eq("authorId", userId))
        .collect()
      let used = 0
      for (const post of mine) {
        if (!post.mediaId) continue
        const existing = await ctx.db.system.get(post.mediaId)
        used += existing?.size ?? 0
      }
      if (used + file.size > limits.storageMb * 1024 * 1024) {
        return { ok: false as const, code: "STORAGE_FULL" as const }
      }
      const owned = await consumeOwnedUpload(ctx, userId, args.mediaId, "post")
      if (!owned) return { ok: false as const, code: "INVALID_MEDIA_OWNER" as const }
    }
    const id = await ctx.db.insert("posts", {
      authorId: userId,
      body,
      ...(args.mediaId ? { mediaId: args.mediaId } : {}),
      ...(args.mediaKind ? { mediaKind: args.mediaKind } : {}),
      ...(args.mediaName
        ? { mediaName: cleanText(args.mediaName, 120) }
        : {}),
      createdAt: Date.now(),
    })

    // Everyone connected to the author hears about the new publication.
    const author = await publicAuthor(ctx, userId)
    const preview =
      body ||
      (args.mediaKind === "video"
        ? "Vidéo"
        : args.mediaKind === "pdf"
          ? "Document PDF"
          : "Photo")
    const contacts = await connectionIds(ctx, userId)
    for (const contact of contacts) {
      await notify(
        ctx,
        contact,
        "post",
        `Nouvelle publication de ${author.displayName}`,
        preview.slice(0, 140),
        "/",
      )
    }

    return { ok: true as const, id }
  },
})

export const toggleLike = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const post = await ctx.db.get(args.postId)
    if (!post) return { ok: false as const, code: "NOT_FOUND" as const }
    const existing = await ctx.db
      .query("postLikes")
      .withIndex("by_post_user", (q) =>
        q.eq("postId", args.postId).eq("userId", userId),
      )
      .unique()
    if (existing) {
      await ctx.db.delete(existing._id)
      return { ok: true as const, liked: false }
    }
    await ctx.db.insert("postLikes", {
      postId: args.postId,
      userId,
      createdAt: Date.now(),
    })
    return { ok: true as const, liked: true }
  },
})

export const comments = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const rows = await ctx.db
      .query("postComments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("asc")
      .take(100)
    const results = await Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        body: row.body,
        createdAt: row.createdAt,
        isMine: row.userId === userId,
        author: await publicAuthor(ctx, row.userId),
      })),
    )
    return { ok: true as const, results }
  },
})

export const addComment = mutation({
  args: { postId: v.id("posts"), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const post = await ctx.db.get(args.postId)
    if (!post) return { ok: false as const, code: "NOT_FOUND" as const }
    const body = cleanText(args.body, 500)
    if (body.length === 0) {
      return { ok: false as const, code: "EMPTY_COMMENT" as const }
    }
    await ctx.db.insert("postComments", {
      postId: args.postId,
      userId,
      body,
      createdAt: Date.now(),
    })

    // The post author and everyone already in the thread are concerned.
    const recipients = new Set<Id<"users">>([post.authorId])
    const thread = await ctx.db
      .query("postComments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect()
    for (const row of thread) recipients.add(row.userId)
    recipients.delete(userId)

    const author = await publicAuthor(ctx, userId)
    for (const recipient of recipients) {
      await notify(
        ctx,
        recipient,
        "comment",
        `Nouvelle réponse de ${author.displayName}`,
        body.slice(0, 140),
        "/",
      )
    }

    return { ok: true as const }
  },
})

/** Members can remove their own replies, for example after a mistake. */
export const removeComment = mutation({
  args: { commentId: v.id("postComments") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const row = await ctx.db.get(args.commentId)
    if (!row) return { ok: false as const, code: "NOT_FOUND" as const }
    if (row.userId !== userId) {
      return { ok: false as const, code: "FORBIDDEN" as const }
    }
    await ctx.db.delete(row._id)
    return { ok: true as const }
  },
})

export const remove = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const post = await ctx.db.get(args.postId)
    if (!post) return { ok: false as const, code: "NOT_FOUND" as const }
    if (post.authorId !== userId) {
      return { ok: false as const, code: "FORBIDDEN" as const }
    }
    const comments = await ctx.db
      .query("postComments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect()
    for (const row of comments) await ctx.db.delete(row._id)
    const likes = await ctx.db
      .query("postLikes")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect()
    for (const row of likes) await ctx.db.delete(row._id)
    if (post.mediaId) await ctx.storage.delete(post.mediaId)
    await ctx.db.delete(post._id)
    return { ok: true as const }
  },
})
