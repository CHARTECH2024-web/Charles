import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError } from "convex/values"
import { mutation } from "./_generated/server"

// Signed-in members upload photos, videos, PDFs and voice notes straight to
// Convex file storage; the file id is then attached to a post or a message.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" })
    return await ctx.storage.generateUploadUrl()
  },
})
