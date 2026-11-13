import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { requireShopPermission } from "./shopAccess"

const SHOP_ROLE = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("seller"),
)

function clean(input: string, max: number): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" })
  return userId
}

/** Role of the signed-in user inside a shop, or null when not a member. */
async function shopRole(
  ctx: QueryCtx | MutationCtx,
  shopId: Id<"shops">,
  userId: Id<"users">,
): Promise<"owner" | "manager" | "seller" | null> {
  const shop = await ctx.db.get(shopId)
  if (!shop) return null
  if (shop.ownerId === userId) return "owner"
  const member = await ctx.db
    .query("shopMembers")
    .withIndex("by_shop_user", (q) => q.eq("shopId", shopId).eq("userId", userId))
    .collect()
  return member.find((row) => row.userId === userId)?.role ?? null
}

async function requireShop(
  ctx: QueryCtx | MutationCtx,
  shopId: Id<"shops">,
  userId: Id<"users">,
) {
  const role = await shopRole(ctx, shopId, userId)
  if (!role) throw new ConvexError({ code: "FORBIDDEN" })
  return role
}

function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`
}

function entryTime(entry: { occurredAt?: number; createdAt: number }): number {
  return entry.occurredAt ?? entry.createdAt
}

/**
 * Read a closed business-date interval through compound indexes.
 * Rows written before occurredAt existed are included through createdAt,
 * but only when occurredAt is absent, so no transaction is counted twice.
 */
async function entriesInPeriod(
  ctx: QueryCtx,
  scope: { ownerId: Id<"users">; shopId?: Id<"shops"> },
  from: number,
  to: number,
) {
  if (scope.shopId) {
    const [dated, legacyCandidates] = await Promise.all([
      ctx.db.query("cahierEntries")
        .withIndex("by_shop_occurredAt", (q) =>
          q.eq("shopId", scope.shopId!).gte("occurredAt", from).lte("occurredAt", to),
        ).collect(),
      ctx.db.query("cahierEntries")
        .withIndex("by_shop_createdAt", (q) =>
          q.eq("shopId", scope.shopId!).gte("createdAt", from).lte("createdAt", to),
        ).collect(),
    ])
    return [...dated, ...legacyCandidates.filter((row) => row.occurredAt === undefined)]
  }
  const [dated, legacyCandidates] = await Promise.all([
    ctx.db.query("cahierEntries")
      .withIndex("by_owner_shop_occurredAt", (q) =>
        q.eq("ownerId", scope.ownerId).eq("shopId", undefined)
          .gte("occurredAt", from).lte("occurredAt", to),
      ).collect(),
    ctx.db.query("cahierEntries")
      .withIndex("by_owner_shop_createdAt", (q) =>
        q.eq("ownerId", scope.ownerId).eq("shopId", undefined)
          .gte("createdAt", from).lte("createdAt", to),
      ).collect(),
  ])
  return [...dated, ...legacyCandidates.filter((row) => row.occurredAt === undefined)]
}

async function purchasesInPeriod(
  ctx: QueryCtx,
  scope: { ownerId: Id<"users">; shopId?: Id<"shops"> },
  from: number,
  to: number,
) {
  if (scope.shopId) {
    const [dated, legacyCandidates] = await Promise.all([
      ctx.db.query("purchases")
        .withIndex("by_shop_occurredAt", (q) =>
          q.eq("shopId", scope.shopId!).gte("occurredAt", from).lte("occurredAt", to),
        ).collect(),
      ctx.db.query("purchases")
        .withIndex("by_shop_createdAt", (q) =>
          q.eq("shopId", scope.shopId!).gte("createdAt", from).lte("createdAt", to),
        ).collect(),
    ])
    return [...dated, ...legacyCandidates.filter((row) => row.occurredAt === undefined)]
  }
  const [dated, legacyCandidates] = await Promise.all([
    ctx.db.query("purchases")
      .withIndex("by_owner_shop_occurredAt", (q) =>
        q.eq("ownerId", scope.ownerId).eq("shopId", undefined)
          .gte("occurredAt", from).lte("occurredAt", to),
      ).collect(),
    ctx.db.query("purchases")
      .withIndex("by_owner_shop_createdAt", (q) =>
        q.eq("ownerId", scope.ownerId).eq("shopId", undefined)
          .gte("createdAt", from).lte("createdAt", to),
      ).collect(),
  ])
  return [...dated, ...legacyCandidates.filter((row) => row.occurredAt === undefined)]
}

/** Owner of a personal or shop ledger, after checking membership. */
async function ledgerScope(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  shopId?: Id<"shops">,
): Promise<{ ownerId: Id<"users">; shopId?: Id<"shops"> }> {
  if (!shopId) return { ownerId: userId }
  const shop = await ctx.db.get(shopId)
  if (!shop) throw new ConvexError({ code: "FORBIDDEN" })
  const role = await shopRole(ctx, shopId, userId)
  if (!role) throw new ConvexError({ code: "FORBIDDEN" })
  return { ownerId: shop.ownerId, shopId }
}

async function canAccessCredit(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  credit: { ownerId: Id<"users">; shopId?: Id<"shops"> },
): Promise<boolean> {
  if (credit.shopId) return (await shopRole(ctx, credit.shopId, userId)) !== null
  return credit.ownerId === userId
}

// --- Shops and sellers -----------------------------------------------------

export const listShops = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: true as const, shops: [] }
    const owned = await ctx.db
      .query("shops")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()
    const memberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()

    const shops: {
      id: Id<"shops">
      name: string
      role: "owner" | "manager" | "seller"
    }[] = []
    for (const shop of owned) {
      shops.push({ id: shop._id, name: shop.name, role: "owner" as const })
    }
    for (const membership of memberships) {
      const shop = await ctx.db.get(membership.shopId)
      if (!shop || shop.ownerId === userId) continue
      shops.push({ id: shop._id, name: shop.name, role: membership.role })
    }
    return { ok: true as const, shops }
  },
})

export const createShop = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const name = clean(args.name, 60)
    if (name.length < 2) return { ok: false as const, code: "INVALID_NAME" as const }
    const id = await ctx.db.insert("shops", {
      ownerId: userId,
      name,
      currency: "CDF",
      createdAt: Date.now(),
    })
    return { ok: true as const, id }
  },
})

export const removeShop = mutation({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const role = await requireShop(ctx, args.shopId, userId)
    if (role !== "owner") return { ok: false as const, code: "FORBIDDEN" as const }
    const members = await ctx.db
      .query("shopMembers")
      .withIndex("by_shop_createdAt", (q) => q.eq("shopId", args.shopId))
      .order("desc")
      .collect()
    for (const member of members) await ctx.db.delete(member._id)
    await ctx.db.delete(args.shopId)
    return { ok: true as const }
  },
})

export const shopMembers = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: true as const, members: [], myRole: null }
    const role = await requireShop(ctx, args.shopId, userId)
    const shop = await ctx.db.get(args.shopId)
    const rows = await ctx.db
      .query("shopMembers")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect()
    const members: {
      userId: Id<"users">
      name: string
      role: "owner" | "manager" | "seller"
    }[] = []
    if (shop) {
      const owner = await ctx.db.get(shop.ownerId)
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", shop.ownerId))
        .first()
      members.push({
        userId: shop.ownerId,
        name: profile?.displayName ?? owner?.name ?? "Propriétaire",
        role: "owner" as const,
      })
    }
    for (const row of rows) {
      if (shop && row.userId === shop.ownerId) continue
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .first()
      members.push({
        userId: row.userId,
        name: profile?.displayName ?? profile?.handle ?? "Vendeur",
        role: row.role,
      })
    }
    return { ok: true as const, members, myRole: role }
  },
})

export const addMember = mutation({
  args: { shopId: v.id("shops"), handle: v.string(), role: SHOP_ROLE },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const role = await requireShop(ctx, args.shopId, userId)
    if (role !== "owner") return { ok: false as const, code: "FORBIDDEN" as const }
    if (args.role === "owner") return { ok: false as const, code: "INVALID_ROLE" as const }

    const raw = clean(args.handle, 40).replace(/^@/, "").replace(/\.hz$/i, "")
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_handle", (q) => q.eq("handle", raw.toLowerCase()))
      .first()
    if (!profile) return { ok: false as const, code: "MEMBER_NOT_FOUND" as const }

    const existing = await ctx.db
      .query("shopMembers")
      .withIndex("by_shop_user", (q) => q.eq("shopId", args.shopId).eq("userId", profile.userId))
      .unique()
    if (existing) {
      return { ok: false as const, code: "ALREADY_MEMBER" as const }
    }
    await ctx.db.insert("shopMembers", {
      shopId: args.shopId,
      userId: profile.userId,
      role: args.role,
      createdAt: Date.now(),
    })
    return { ok: true as const }
  },
})

export const removeMember = mutation({
  args: { shopId: v.id("shops"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const role = await requireShop(ctx, args.shopId, userId)
    if (role !== "owner") return { ok: false as const, code: "FORBIDDEN" as const }
    const target = await ctx.db
      .query("shopMembers")
      .withIndex("by_shop_user", (q) => q.eq("shopId", args.shopId).eq("userId", args.userId))
      .unique()
    if (!target) return { ok: false as const, code: "NOT_FOUND" as const }
    await ctx.db.delete(target._id)
    return { ok: true as const }
  },
})

// --- Shop scoped journal ---------------------------------------------------

export const shopEntries = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) {
      return {
        ok: true as const,
        entries: [],
        totals: { sales: 0, expenses: 0, balance: 0 },
      }
    }
    await requireShop(ctx, args.shopId, userId)
    const scoped = await ctx.db
      .query("cahierEntries")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect()
    scoped.sort((a, b) => entryTime(b) - entryTime(a))

    let sales = 0
    let expenses = 0
    for (const entry of scoped) {
      if (entry.type === "sale") sales += entry.amount
      if (entry.type === "expense") expenses += entry.amount
    }
    return {
      ok: true as const,
      entries: scoped.slice(0, 300).map((entry) => ({
        id: entry._id,
        type: entry.type,
        label: entry.label,
        amount: entry.amount,
        category: entry.category ?? null,
        createdAt: entry.createdAt,
        occurredAt: entryTime(entry),
        quantity: entry.quantity ?? null,
      })),
      totalCount: scoped.length,
      totals: { sales, expenses, balance: sales - expenses },
    }
  },
})

// --- Barcode lookup --------------------------------------------------------

export const findByBarcode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: true as const, product: null }
    const code = clean(args.code, 64)
    if (!code) return { ok: true as const, product: null }
    const product = await ctx.db
      .query("products")
      .withIndex("by_owner_barcode", (q) => q.eq("ownerId", userId).eq("barcode", code))
      .first()
    if (!product) return { ok: true as const, product: null }
    return {
      ok: true as const,
      product: {
        id: product._id,
        name: product.name,
        price: product.price,
        stock: product.stock,
        unit: product.unit,
      },
    }
  },
})

export const setBarcode = mutation({
  args: { productId: v.id("products"), barcode: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const product = await ctx.db.get(args.productId)
    if (!product) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    if (product.shopId) await requireShopPermission(ctx, product.shopId, userId, "product:write")
    else if (product.ownerId !== userId) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    await ctx.db.patch(product._id, { barcode: clean(args.barcode, 64) })
    return { ok: true as const }
  },
})

// --- Customer credit -------------------------------------------------------

async function creditState(
  ctx: QueryCtx,
  credit: { _id: Id<"credits">; total: number; dueDate: number },
) {
  const payments = await ctx.db
    .query("creditPayments")
    .withIndex("by_credit_createdAt", (q) => q.eq("creditId", credit._id))
    .order("desc")
    .collect()
  const paid = payments.reduce((sum, row) => sum + row.amount, 0)
  const remaining = Math.max(0, credit.total - paid)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const overdue = remaining > 0 && credit.dueDate < startOfToday.getTime()
  return { paid, remaining, overdue }
}

export const listCredits = query({
  args: { shopId: v.optional(v.id("shops")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: true as const, results: [] }
    const scope = await ledgerScope(ctx, userId, args.shopId)
    const rows = scope.shopId
      ? await ctx.db
          .query("credits")
          .withIndex("by_shop", (q) => q.eq("shopId", scope.shopId))
          .collect()
      : (await ctx.db
          .query("credits")
          .withIndex("by_owner", (q) => q.eq("ownerId", scope.ownerId))
          .collect()).filter((credit) => !credit.shopId)
    rows.sort((a, b) => b.createdAt - a.createdAt)
    const results = await Promise.all(
      rows.slice(0, 300).map(async (credit) => {
        const state = await creditState(ctx, credit)
        return {
          id: credit._id,
          customerName: credit.customerName,
          label: credit.label,
          total: credit.total,
          dueDate: credit.dueDate,
          reminderCount: credit.reminderCount,
          lastReminderAt: credit.lastReminderAt ?? null,
          ...state,
        }
      }),
    )
    return { ok: true as const, results }
  },
})

export const addCredit = mutation({
  args: {
    customerName: v.string(),
    label: v.string(),
    total: v.number(),
    dueDate: v.number(),
    contactId: v.optional(v.id("contacts")),
    shopId: v.optional(v.id("shops")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const customerName = clean(args.customerName, 60)
    const label = clean(args.label, 80) || "Crédit client"
    if (customerName.length < 2) return { ok: false as const, code: "INVALID_NAME" as const }
    if (!Number.isFinite(args.total) || args.total <= 0) {
      return { ok: false as const, code: "INVALID_AMOUNT" as const }
    }
    if (!Number.isFinite(args.dueDate)) {
      return { ok: false as const, code: "INVALID_DATE" as const }
    }
    const scope = await ledgerScope(ctx, userId, args.shopId)
    if (args.contactId) {
      const contact = await ctx.db.get(args.contactId)
      if (!contact || contact.ownerId !== scope.ownerId) {
        return { ok: false as const, code: "INVALID_CONTACT" as const }
      }
    }
    const id = await ctx.db.insert("credits", {
      ownerId: scope.ownerId,
      customerName,
      label,
      total: Math.round(args.total),
      dueDate: args.dueDate,
      reminderCount: 0,
      createdAt: Date.now(),
      ...(args.contactId ? { contactId: args.contactId } : {}),
      ...(scope.shopId ? { shopId: scope.shopId } : {}),
    })
    // The unpaid credit is a receivable in the journal from day one.
    await ctx.db.insert("cahierEntries", {
      ownerId: scope.ownerId,
      type: "debt",
      label: `Crédit ${customerName}`.slice(0, 80),
      amount: Math.round(args.total),
      note: label,
      category: "debt_receivable",
      settled: false,
      debtDirection: "receivable",
      creditId: id,
      sellerId: userId,
      createdAt: Date.now(),
      occurredAt: Date.now(),
      ...(scope.shopId ? { shopId: scope.shopId } : {}),
      ...(args.contactId ? { contactId: args.contactId } : {}),
    })
    return { ok: true as const, id }
  },
})

export const payCredit = mutation({
  args: { creditId: v.id("credits"), amount: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const credit = await ctx.db.get(args.creditId)
    if (!credit || !(await canAccessCredit(ctx, userId, credit))) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      return { ok: false as const, code: "INVALID_AMOUNT" as const }
    }
    const state = await creditState(ctx, credit)
    const amount = Math.min(Math.round(args.amount), state.remaining)
    if (amount <= 0) return { ok: false as const, code: "ALREADY_PAID" as const }
    await ctx.db.insert("creditPayments", {
      creditId: credit._id,
      amount,
      createdAt: Date.now(),
    })
    // A credit payment is money coming in: booked as a sale linked to the credit.
    await ctx.db.insert("cahierEntries", {
      ownerId: credit.ownerId,
      type: "sale",
      label: `Crédit ${credit.customerName}`.slice(0, 80),
      amount,
      note: credit.label,
      category: "sale_credit",
      creditId: credit._id,
      sellerId: userId,
      createdAt: Date.now(),
      occurredAt: Date.now(),
      ...(credit.shopId ? { shopId: credit.shopId } : {}),
      ...(credit.contactId ? { contactId: credit.contactId } : {}),
    })

    const remaining = state.remaining - amount
    if (remaining <= 0) {
      const entries = await ctx.db
        .query("cahierEntries")
        .withIndex("by_creditId", (q) => q.eq("creditId", credit._id))
        .collect()
      for (const entry of entries) {
        if (entry.type === "debt") await ctx.db.patch(entry._id, { settled: true })
      }
    }
    return { ok: true as const, remaining }
  },
})

export const remindCredit = mutation({
  args: { creditId: v.id("credits") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const credit = await ctx.db.get(args.creditId)
    if (!credit || !(await canAccessCredit(ctx, userId, credit))) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    await ctx.db.patch(credit._id, {
      reminderCount: credit.reminderCount + 1,
      lastReminderAt: Date.now(),
    })
    return { ok: true as const, count: credit.reminderCount + 1 }
  },
})

export const removeCredit = mutation({
  args: { creditId: v.id("credits") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const credit = await ctx.db.get(args.creditId)
    if (!credit || !(await canAccessCredit(ctx, userId, credit))) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    if (credit.shopId) await requireShopPermission(ctx, credit.shopId, userId, "accounting:write")
    const payments = await ctx.db
      .query("creditPayments")
      .withIndex("by_credit", (q) => q.eq("creditId", credit._id))
      .collect()
    for (const payment of payments) await ctx.db.delete(payment._id)

    // Remove the receivable and every payment sale booked for this credit.
    const entries = await ctx.db
      .query("cahierEntries")
      .withIndex("by_creditId", (q) => q.eq("creditId", credit._id))
      .collect()
    for (const entry of entries) await ctx.db.delete(entry._id)
    await ctx.db.delete(credit._id)
    return { ok: true as const }
  },
})

// --- Goals and budgets -----------------------------------------------------

export const listTargets = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: true as const, results: [] }
    const rows = await ctx.db
      .query("cahierTargets")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(50)
    return {
      ok: true as const,
      results: rows.map((row) => ({
        id: row._id,
        kind: row.kind,
        period: row.period,
        amount: row.amount,
      })),
    }
  },
})

export const saveTarget = mutation({
  args: {
    kind: v.union(v.literal("goal"), v.literal("budget")),
    period: v.union(v.literal("month"), v.literal("year")),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      return { ok: false as const, code: "INVALID_AMOUNT" as const }
    }
    const rows = await ctx.db
      .query("cahierTargets")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()
    const existing = rows.find(
      (row) => row.kind === args.kind && row.period === args.period,
    )
    if (existing) {
      await ctx.db.patch(existing._id, { amount: Math.round(args.amount) })
      return { ok: true as const }
    }
    await ctx.db.insert("cahierTargets", {
      ownerId: userId,
      kind: args.kind,
      period: args.period,
      amount: Math.round(args.amount),
      createdAt: Date.now(),
    })
    return { ok: true as const }
  },
})

// --- Cash closing ----------------------------------------------------------

async function expectedCash(
  ctx: QueryCtx,
  scope: { ownerId: Id<"users">; shopId?: Id<"shops"> },
  day: string,
) {
  const [year, month, date] = day.split("-").map(Number)
  const start = new Date(year, month - 1, date).getTime()
  const end = start + 24 * 60 * 60 * 1000 - 1
  const rows = await entriesInPeriod(ctx, scope, start, end)
  let sales = 0
  let expenses = 0
  for (const entry of rows) {
    if (entry.type === "sale") sales += entry.amount
    if (entry.type === "expense") expenses += entry.amount
  }
  return { sales, expenses, expected: sales - expenses }
}

export const cashToday = query({
  args: { shopId: v.optional(v.id("shops")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    const day = dayKey(Date.now())
    if (!userId) {
      return {
        ok: true as const,
        day,
        sales: 0,
        expenses: 0,
        expected: 0,
        today: null,
        closings: [],
      }
    }
    const scope = await ledgerScope(ctx, userId, args.shopId)
    const totals = await expectedCash(ctx, scope, day)
    const [today, closings] = await Promise.all([
      scope.shopId
        ? ctx.db.query("cashClosings")
            .withIndex("by_shop_day", (q) => q.eq("shopId", scope.shopId!).eq("day", day))
            .first()
        : ctx.db.query("cashClosings")
            .withIndex("by_owner_shop_day", (q) =>
              q.eq("ownerId", scope.ownerId).eq("shopId", undefined).eq("day", day),
            ).first(),
      scope.shopId
        ? ctx.db.query("cashClosings")
            .withIndex("by_shop_day", (q) => q.eq("shopId", scope.shopId!))
            .order("desc").take(30)
        : ctx.db.query("cashClosings")
            .withIndex("by_owner_shop_day", (q) =>
              q.eq("ownerId", scope.ownerId).eq("shopId", undefined),
            ).order("desc").take(30),
    ])
    return {
      ok: true as const,
      day,
      ...totals,
      today: today
        ? {
            id: today._id,
            expected: today.expected,
            counted: today.counted,
            note: today.note ?? "",
            difference: today.counted - today.expected,
          }
        : null,
      closings: closings.slice(0, 30).map((row) => ({
        id: row._id,
        day: row.day,
        expected: row.expected,
        counted: row.counted,
        difference: row.counted - row.expected,
      })),
    }
  },
})

export const closeCash = mutation({
  args: {
    counted: v.number(),
    note: v.optional(v.string()),
    shopId: v.optional(v.id("shops")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    if (!Number.isFinite(args.counted) || args.counted < 0) {
      return { ok: false as const, code: "INVALID_AMOUNT" as const }
    }
    const day = dayKey(Date.now())
    const scope = await ledgerScope(ctx, userId, args.shopId)
    if (scope.shopId) await requireShopPermission(ctx, scope.shopId, userId, "accounting:write")
    const totals = await expectedCash(ctx, scope, day)
    const existing = scope.shopId
      ? await ctx.db.query("cashClosings")
          .withIndex("by_shop_day", (q) => q.eq("shopId", scope.shopId!).eq("day", day))
          .first()
      : await ctx.db.query("cashClosings")
          .withIndex("by_owner_shop_day", (q) =>
            q.eq("ownerId", scope.ownerId).eq("shopId", undefined).eq("day", day),
          ).first()
    const payload = {
      expected: totals.expected,
      counted: Math.round(args.counted),
      note: clean(args.note ?? "", 200),
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return { ok: true as const }
    }
    await ctx.db.insert("cashClosings", {
      ownerId: scope.ownerId,
      day,
      createdAt: Date.now(),
      ...payload,
      ...(args.shopId ? { shopId: args.shopId } : {}),
    })
    return { ok: true as const }
  },
})

// --- Reports ---------------------------------------------------------------

export const report = query({
  args: {
    period: v.union(v.literal("day"), v.literal("month"), v.literal("year")),
    shopId: v.optional(v.id("shops")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) {
      return {
        ok: true as const,
        period: args.period,
        label: "",
        from: 0,
        totals: {
          sales: 0,
          expenses: 0,
          profit: 0,
          receivable: 0,
          payable: 0,
          purchases: 0,
          salesCount: 0,
          stockValue: 0,
          lowStock: 0,
        },
        stock: [],
      }
    }
    const scope = await ledgerScope(ctx, userId, args.shopId)

    const now = new Date()
    let from: number
    let label: string
    if (args.period === "day") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      from = start.getTime()
      label = start.toLocaleDateString("fr-FR")
    } else if (args.period === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      label = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    } else {
      from = new Date(now.getFullYear(), 0, 1).getTime()
      label = `${now.getFullYear()}`
    }

    const scoped = await entriesInPeriod(ctx, scope, from, Date.now())

    let sales = 0
    let expenses = 0
    let receivable = 0
    let payable = 0
    let salesCount = 0
    for (const entry of scoped) {
      if (entry.type === "sale") {
        sales += entry.amount
        salesCount += 1
      }
      if (entry.type === "expense") expenses += entry.amount
      if (entry.type === "debt" && !entry.settled) {
        if (entry.debtDirection === "payable") payable += entry.amount
        else receivable += entry.amount
      }
    }

    const purchases = await purchasesInPeriod(ctx, scope, from, Date.now())
    const purchasesTotal = purchases.reduce((sum, row) => sum + row.total, 0)

    const products = scope.shopId
      ? await ctx.db
          .query("products")
          .withIndex("by_shop", (q) => q.eq("shopId", scope.shopId))
          .collect()
      : (await ctx.db
          .query("products")
          .withIndex("by_owner", (q) => q.eq("ownerId", scope.ownerId))
          .collect()).filter((product) => !product.shopId)
    const stock = products.map((product) => ({
      name: product.name,
      unit: product.unit,
      stock: product.stock,
      price: product.price,
      value: product.stock * product.price,
      low: product.stock <= product.minStock,
    }))

    return {
      ok: true as const,
      period: args.period,
      label,
      from,
      totals: {
        sales,
        expenses,
        profit: sales - expenses,
        receivable,
        payable,
        purchases: purchasesTotal,
        salesCount,
        stockValue: stock.reduce((sum, row) => sum + row.value, 0),
        lowStock: stock.filter((row) => row.low).length,
      },
      stock,
    }
  },
})

export const overdueCredits = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: true as const, count: 0, amount: 0 }
    const rows = await ctx.db
      .query("credits")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()
    let count = 0
    let amount = 0
    for (const credit of rows) {
      const state = await creditState(ctx, credit)
      if (state.overdue) {
        count += 1
        amount += state.remaining
      }
    }
    return { ok: true as const, count, amount }
  },
})
