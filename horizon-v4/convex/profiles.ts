import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { QueryCtx } from "./_generated/server"

// ---------------------------------------------------------------------------
// HORIZON identity: every person has a unique address like "charles.HZ".
// The stored `handle` is the lowercase prefix ("charles"); ".HZ" is added for
// display. The HORIZON address is never the e-mail address.
// ---------------------------------------------------------------------------

const HANDLE_MIN = 3
const HANDLE_MAX = 24
const HANDLE_CHANGE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000

const RESERVED = new Set([
  "admin", "administrator", "horizon", "horizonai", "support", "help",
  "official", "staff", "moderator", "mod", "root", "system", "security",
  "team", "info", "contact", "service", "services", "null", "undefined",
  "api", "www", "mail", "hz", "cahier", "compte", "business", "billing",
])

type HandleCheck =
  | { valid: true; handle: string }
  | { valid: false; code: "INVALID_HANDLE" | "RESERVED_HANDLE" }

function normalizeHandle(input: string): string {
  return input.trim().toLowerCase().replace(/\.hz$/, "")
}

function validateHandle(input: string): HandleCheck {
  const handle = normalizeHandle(input)
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) {
    return { valid: false, code: "INVALID_HANDLE" }
  }
  if (!/^[a-z0-9]([a-z0-9._]*[a-z0-9])$/.test(handle)) {
    return { valid: false, code: "INVALID_HANDLE" }
  }
  if (/[._]{2}/.test(handle) || /^\d+$/.test(handle)) {
    return { valid: false, code: "INVALID_HANDLE" }
  }
  if (RESERVED.has(handle.replace(/[._]/g, ""))) {
    return { valid: false, code: "RESERVED_HANDLE" }
  }
  return { valid: true, handle }
}

function cleanText(input: string, max: number): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

async function profileByHandle(ctx: QueryCtx, handle: string) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique()
}

async function profileByUser(ctx: QueryCtx, userId: import("./_generated/dataModel").Id<"users">) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
}

const UNAUTHENTICATED = {
  ok: false as const,
  code: "UNAUTHENTICATED" as const,
}

// --- Current account --------------------------------------------------------

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const user = await ctx.db.get(userId)
    if (!user) return UNAUTHENTICATED
    const profile = await profileByUser(ctx, userId)
    return {
      ok: true as const,
      // Private data: only ever returned to its owner.
      email: user.email ?? null,
      googleName: user.name ?? null,
      googleImage: user.image ?? null,
      profile: profile
        ? {
            handle: profile.handle,
            horizonId: `${profile.handle}.HZ`,
            displayName: profile.displayName,
            photoUrl: profile.photoUrl ?? user.image ?? null,
            bio: profile.bio ?? "",
            role: profile.role === "admin" ? ("admin" as const) : ("member" as const),
            verified: profile.verified === true,
            nextHandleChangeAt: profile.handleChangedAt
              ? profile.handleChangedAt + HANDLE_CHANGE_COOLDOWN_MS
              : null,
          }
        : null,
    }
  },
})

// --- Availability + suggestions --------------------------------------------

export const checkHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const check = validateHandle(args.handle)
    if (!check.valid) {
      return { ok: true as const, available: false, reason: check.code }
    }
    const existing = await profileByHandle(ctx, check.handle)
    if (existing && existing.userId === userId) {
      return { ok: true as const, available: false, reason: "SAME" as const }
    }
    if (existing) {
      return { ok: true as const, available: false, reason: "TAKEN" as const }
    }
    return { ok: true as const, available: true, reason: null }
  },
})

function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export const suggestHandles = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const parts = cleanText(args.name, 60)
      .split(" ")
      .map(slug)
      .filter((p) => p.length > 0)
    const first = parts[0] ?? ""
    const last = parts.length > 1 ? parts[parts.length - 1] : ""
    const candidates = [
      first,
      first && last ? `${first}.${last}` : "",
      first && last ? `${first}${last[0]}` : "",
      first ? `${first}${last ? "." : ""}${last}1` : "",
      first ? `${first}2026` : "",
      first ? `${first}.rdc` : "",
    ].filter((c, i, all) => c && all.indexOf(c) === i)

    const suggestions: string[] = []
    for (const candidate of candidates) {
      if (suggestions.length >= 3) break
      const check = validateHandle(candidate)
      if (!check.valid) continue
      if (await profileByHandle(ctx, check.handle)) continue
      suggestions.push(check.handle)
    }
    return { ok: true as const, suggestions }
  },
})

// --- Create the profile (first sign-in) ------------------------------------

export const createProfile = mutation({
  args: {
    handle: v.string(),
    displayName: v.string(),
    ageConfirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const user = await ctx.db.get(userId)
    if (!user) return UNAUTHENTICATED

    if (await profileByUser(ctx, userId)) {
      return { ok: false as const, code: "ALREADY_HAS_PROFILE" as const }
    }
    if (!args.ageConfirmed) {
      return { ok: false as const, code: "AGE_NOT_CONFIRMED" as const }
    }
    const displayName = cleanText(args.displayName, 60)
    if (displayName.length < 2) {
      return { ok: false as const, code: "INVALID_NAME" as const }
    }
    const check = validateHandle(args.handle)
    if (!check.valid) return { ok: false as const, code: check.code }

    // Convex mutations are serializable: this check + insert cannot race.
    if (await profileByHandle(ctx, check.handle)) {
      return { ok: false as const, code: "HANDLE_TAKEN" as const }
    }

    await ctx.db.insert("profiles", {
      userId,
      handle: check.handle,
      displayName,
      ...(user.image ? { photoUrl: user.image } : {}),
      ageConfirmedAt: Date.now(),
    })
    return { ok: true as const, horizonId: `${check.handle}.HZ` }
  },
})

// --- Edit the profile ------------------------------------------------------

export const updateProfile = mutation({
  args: { displayName: v.string(), bio: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const profile = await profileByUser(ctx, userId)
    if (!profile) return { ok: false as const, code: "NO_PROFILE" as const }
    const displayName = cleanText(args.displayName, 60)
    if (displayName.length < 2) {
      return { ok: false as const, code: "INVALID_NAME" as const }
    }
    await ctx.db.patch(profile._id, {
      displayName,
      bio: cleanText(args.bio, 200),
    })
    return { ok: true as const }
  },
})

// Allowed once every 90 days.
export const changeHandle = mutation({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const profile = await profileByUser(ctx, userId)
    if (!profile) return { ok: false as const, code: "NO_PROFILE" as const }

    const check = validateHandle(args.handle)
    if (!check.valid) return { ok: false as const, code: check.code }
    if (check.handle === profile.handle) {
      return { ok: false as const, code: "SAME_HANDLE" as const }
    }

    const now = Date.now()
    if (
      profile.handleChangedAt &&
      now - profile.handleChangedAt < HANDLE_CHANGE_COOLDOWN_MS
    ) {
      return {
        ok: false as const,
        code: "COOLDOWN" as const,
        retryAfter: profile.handleChangedAt + HANDLE_CHANGE_COOLDOWN_MS,
      }
    }
    if (await profileByHandle(ctx, check.handle)) {
      return { ok: false as const, code: "HANDLE_TAKEN" as const }
    }
    await ctx.db.patch(profile._id, {
      handle: check.handle,
      handleChangedAt: now,
    })
    return { ok: true as const, horizonId: `${check.handle}.HZ` }
  },
})

// --- Find people by HORIZON address ----------------------------------------

export const searchByHandle = query({
  args: { term: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const term = normalizeHandle(cleanText(args.term, 40))
    if (term.length < 2) return { ok: true as const, results: [] }
    const rows = await ctx.db
      .query("profiles")
      .withIndex("by_handle", (q) =>
        q.gte("handle", term).lt("handle", term + "\uffff"),
      )
      .take(10)
    return {
      ok: true as const,
      // Public fields only: no e-mail, no internal ids.
      results: rows.map((p) => ({
        handle: p.handle,
        horizonId: `${p.handle}.HZ`,
        displayName: p.displayName,
        photoUrl: p.photoUrl ?? null,
        verified: p.verified === true,
        isMe: p.userId === userId,
      })),
    }
  },
})

// --- Suggestions: newest members you may want to connect with ---------------

export const suggestedMembers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const rows = await ctx.db.query("profiles").order("desc").take(13)
    return {
      ok: true as const,
      // Public fields only: no e-mail, no internal ids.
      results: rows
        .filter((p) => p.userId !== userId)
        .slice(0, 12)
        .map((p) => ({
          handle: p.handle,
          horizonId: `${p.handle}.HZ`,
          displayName: p.displayName,
          photoUrl: p.photoUrl ?? null,
          verified: p.verified === true,
          userId: p.userId,
        })),
    }
  },
})

// --- Profile photo ----------------------------------------------------------

export const setPhoto = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const profile = await profileByUser(ctx, userId)
    if (!profile) return { ok: false as const, code: "NO_PROFILE" as const }
    const file = await ctx.db.system.get(args.storageId)
    if (!file) return { ok: false as const, code: "INVALID_FILE" as const }
    if (file.contentType && !file.contentType.startsWith("image/")) {
      return { ok: false as const, code: "NOT_AN_IMAGE" as const }
    }
    const url = await ctx.storage.getUrl(args.storageId)
    if (!url) return { ok: false as const, code: "INVALID_FILE" as const }
    await ctx.db.patch(profile._id, { photoUrl: url })
    return { ok: true as const, photoUrl: url }
  },
})

export const removePhoto = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return UNAUTHENTICATED
    const profile = await profileByUser(ctx, userId)
    if (!profile) return { ok: false as const, code: "NO_PROFILE" as const }
    await ctx.db.patch(profile._id, { photoUrl: undefined })
    return { ok: true as const }
  },
})
