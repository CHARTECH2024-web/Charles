import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { mutation } from "./_generated/server"

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const INTENT_TTL_MS = 15 * 60 * 1000

export type UploadPurpose = "post" | "message" | "profile" | "assistant"

/**
 * Upload URLs are bearer capabilities. A separate per-user intent token binds
 * the resulting storage ID to the account that requested that URL.
 */
export const generateUploadUrl = mutation({
  args: {
    purpose: v.union(
      v.literal("post"),
      v.literal("message"),
      v.literal("profile"),
      v.literal("assistant"),
    ),
  },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" })
    const uploadToken = crypto.randomUUID()
    const now = Date.now()
    await ctx.db.insert("uploads", {
      ownerId: userId,
      uploadToken,
      purpose: args.purpose,
      status: "pending",
      createdAt: now,
      expiresAt: now + INTENT_TTL_MS,
    })
    const uploadUrl = await ctx.storage.generateUploadUrl()
    return { uploadUrl, uploadToken }
  },
})

export const claimUpload = mutation({
  args: { uploadToken: v.string(), storageId: v.id("_storage") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" })
    const intent = await ctx.db
      .query("uploads")
      .withIndex("by_uploadToken", (q) => q.eq("uploadToken", args.uploadToken))
      .unique()
    if (
      !intent ||
      intent.ownerId !== userId ||
      intent.status !== "pending" ||
      !intent.expiresAt ||
      intent.expiresAt < Date.now()
    ) return { ok: false }
    const file = await ctx.db.system.get(args.storageId)
    if (!file || file.size > MAX_UPLOAD_BYTES) return { ok: false }
    if (intent.purpose === "profile" && file.contentType && !file.contentType.startsWith("image/")) {
      return { ok: false }
    }
    await ctx.db.patch(intent._id, {
      storageId: args.storageId,
      uploadToken: undefined,
      status: "ready",
      contentType: file.contentType ?? "application/octet-stream",
      fileSize: file.size,
      expiresAt: undefined,
    })
    return { ok: true }
  },
})

/** Consume a claimed file exactly once, only for its owner and intended use. */
export async function consumeOwnedUpload(
  ctx: MutationCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">,
  purpose: UploadPurpose,
) {
  const upload = await ctx.db
    .query("uploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique()
  if (
    !upload ||
    upload.ownerId !== userId ||
    upload.purpose !== purpose ||
    upload.status !== "ready"
  ) return null
  await ctx.db.patch(upload._id, { status: "attached" })
  return { contentType: upload.contentType, fileSize: upload.fileSize }
}
