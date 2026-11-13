import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalQuery, type ActionCtx } from "./_generated/server"
import { callMacalyJson } from "./macaly"

/**
 * App Files bridge: user photos, videos and voice notes for the CHARLES chat.
 * Files live in R2; Convex only stores opaque file ids and metadata.
 */

const APP_FILES_PROTOCOL = "bindings_v1" as const

const uploadGrant = v.object({
  fileId: v.string(),
  uploadUrl: v.string(),
  method: v.literal("PUT"),
  headers: v.record(v.string(), v.string()),
  expiresAt: v.string(),
  maxBytes: v.number(),
})

export const getCurrentAppUserId = internalQuery({
  args: {},
  returns: v.id("users"),
  handler: async (ctx): Promise<Id<"users">> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Authentication required")
    return userId
  },
})

async function requireAppUserId(
  ctx: Pick<ActionCtx, "runQuery">,
): Promise<Id<"users">> {
  return ctx.runQuery(internal.appFiles.getCurrentAppUserId, {})
}

export const createUpload = action({
  args: {
    filename: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    visibility: v.union(v.literal("public"), v.literal("private")),
  },
  returns: uploadGrant,
  handler: async (ctx, args) => {
    const appUserId = await requireAppUserId(ctx)
    const payload = {
      ...args,
      protocolVersion: APP_FILES_PROTOCOL,
      databaseEnvironment:
        process.env.MACALY_DATABASE_ENVIRONMENT === "development"
          ? "development"
          : "production",
      appSubjectId: appUserId,
    }
    let response: Record<string, unknown>
    try {
      response = await callMacalyJson("/api/client-app/app-files/create-upload", payload)
    } catch (error) {
      console.error(
        "appFiles.createUpload failed",
        error instanceof Error ? error.message : String(error),
        JSON.stringify({ visibility: args.visibility, contentType: args.contentType, size: args.fileSize }),
      )
      throw error
    }
    return response.upload as {
      fileId: string
      uploadUrl: string
      method: "PUT"
      headers: Record<string, string>
      expiresAt: string
      maxBytes: number
    }
  },
})

export async function completeAppFile(
  ctx: Pick<ActionCtx, "runQuery">,
  fileId: string,
) {
  const appUserId = await requireAppUserId(ctx)
  const response = await callMacalyJson("/api/client-app/app-files/complete-upload", {
    fileId,
    protocolVersion: APP_FILES_PROTOCOL,
    databaseEnvironment:
      process.env.MACALY_DATABASE_ENVIRONMENT === "development"
        ? "development"
        : "production",
    appSubjectId: appUserId,
  })
  return response.file as {
    fileId: string
    status: "ready"
    contentType: string
    fileSize: number
    visibility: "public" | "private"
    url: string | null
  }
}

export async function createAppFileDownloadUrl(
  ctx: Pick<ActionCtx, "runQuery">,
  fileId: string,
) {
  await requireAppUserId(ctx)
  const response = await callMacalyJson("/api/client-app/app-files/create-download-url", {
    fileId,
    protocolVersion: APP_FILES_PROTOCOL,
    databaseEnvironment:
      process.env.MACALY_DATABASE_ENVIRONMENT === "development"
        ? "development"
        : "production",
  })
  return response.download as {
    fileId: string
    visibility: "public" | "private"
    url: string
    expiresAt: string | null
  }
}

export async function deleteAppFile(
  ctx: Pick<ActionCtx, "runQuery">,
  fileId: string,
) {
  const appUserId = await requireAppUserId(ctx)
  const response = await callMacalyJson("/api/client-app/app-files/delete", {
    fileId,
    protocolVersion: APP_FILES_PROTOCOL,
    databaseEnvironment:
      process.env.MACALY_DATABASE_ENVIRONMENT === "development"
        ? "development"
        : "production",
    appSubjectId: appUserId,
  })
  return {
    success: response.success === true,
    cleanupPending: response.cleanupPending === true,
  }
}

/** Read grant for one of the signed-in member's own chat attachments. */
export const mediaUrl = action({
  args: { messageId: v.id("assistantMessages") },
  handler: async (ctx, args) => {
    const owned = await ctx.runQuery(internal.assistant.ownedFile, {
      messageId: args.messageId,
    })
    if (!owned?.fileId) return { url: null as string | null }
    const download = await createAppFileDownloadUrl(ctx, owned.fileId)
    return { url: download.url }
  },
})
