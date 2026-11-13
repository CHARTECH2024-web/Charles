import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { isPremiumUser } from "./premium"
import { requireShopPermission } from "./shopAccess"

const ENTRY_TYPE = v.union(
  v.literal("sale"),
  v.literal("expense"),
  v.literal("debt"),
)
const CONTACT_KIND = v.union(v.literal("customer"), v.literal("supplier"))
const DAY = 24 * 60 * 60 * 1000
const MAX_AMOUNT = 1_000_000_000

type Scope = {
  ownerId: Id<"users">
  shopId?: Id<"shops">
}

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

function positive(value: number, max = MAX_AMOUNT): boolean {
  return Number.isFinite(value) && value > 0 && value <= max
}

/** Business date chosen by the user, never in the future by more than a day. */
function businessDate(value?: number): number | null {
  if (value === undefined) return Date.now()
  if (!Number.isFinite(value)) return null
  const earliest = Date.UTC(2000, 0, 1)
  const latest = Date.now() + DAY
  if (value < earliest || value > latest) return null
  return Math.round(value)
}

function entryTime(entry: { occurredAt?: number; createdAt: number }): number {
  return entry.occurredAt ?? entry.createdAt
}

/**
 * Read a closed business-date interval using the date indexes. Legacy rows
 * without occurredAt are read by createdAt and included exactly once.
 */
async function entriesInPeriod(
  ctx: QueryCtx,
  scope: Scope,
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

/** Resolve the ledger owner and verify shop membership for the signed-in user. */
async function scopeFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  shopId?: Id<"shops">,
): Promise<Scope> {
  if (!shopId) return { ownerId: userId }
  const shop = await ctx.db.get(shopId)
  if (!shop) throw new ConvexError({ code: "FORBIDDEN" })
  if (shop.ownerId !== userId) {
    const members = await ctx.db
      .query("shopMembers")
      .withIndex("by_shop_user", (q) => q.eq("shopId", shopId).eq("userId", userId))
      .collect()
    if (!members.some((member) => member.userId === userId)) {
      throw new ConvexError({ code: "FORBIDDEN" })
    }
  }
  return { ownerId: shop.ownerId, shopId }
}

async function canAccessEntry(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  entry: { ownerId: Id<"users">; shopId?: Id<"shops"> },
): Promise<boolean> {
  if (!entry.shopId) return entry.ownerId === userId
  const shop = await ctx.db.get(entry.shopId)
  if (!shop) return false
  if (shop.ownerId === userId) return true
  const members = await ctx.db
    .query("shopMembers")
    .withIndex("by_shop_user", (q) => q.eq("shopId", entry.shopId!).eq("userId", userId))
    .collect()
  return members.some((member) => member.userId === userId)
}

async function entriesForScope(ctx: QueryCtx, scope: Scope) {
  if (scope.shopId) {
    return ctx.db
      .query("cahierEntries")
      .withIndex("by_shop_createdAt", (q) => q.eq("shopId", scope.shopId))
      .order("desc")
      .collect()
  }
  const rows = await ctx.db
    .query("cahierEntries")
    .withIndex("by_owner", (q) => q.eq("ownerId", scope.ownerId))
    .collect()
  return rows.filter((row) => !row.shopId)
}

async function purchasesForScope(ctx: QueryCtx, scope: Scope) {
  if (scope.shopId) {
    return ctx.db
      .query("purchases")
      .withIndex("by_shop_createdAt", (q) => q.eq("shopId", scope.shopId))
      .order("desc")
      .collect()
  }
  const rows = await ctx.db
    .query("purchases")
    .withIndex("by_owner", (q) => q.eq("ownerId", scope.ownerId))
    .collect()
  return rows.filter((row) => !row.shopId)
}

async function productsForScope(ctx: QueryCtx, scope: Scope) {
  if (scope.shopId) {
    return ctx.db
      .query("products")
      .withIndex("by_shop", (q) => q.eq("shopId", scope.shopId))
      .collect()
  }
  const rows = await ctx.db
    .query("products")
    .withIndex("by_owner", (q) => q.eq("ownerId", scope.ownerId))
    .collect()
  return rows.filter((row) => !row.shopId)
}

async function contactName(ctx: QueryCtx, id?: Id<"contacts">) {
  if (!id) return null
  const contact = await ctx.db.get(id)
  return contact?.name ?? null
}

async function productInfo(ctx: QueryCtx, id?: Id<"products">) {
  if (!id) return null
  const product = await ctx.db.get(id)
  return product ? { name: product.name, unit: product.unit } : null
}

async function sellerName(ctx: QueryCtx, id?: Id<"users">) {
  if (!id) return null
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", id))
    .first()
  if (profile) return profile.displayName || profile.handle
  const user = await ctx.db.get(id)
  return user?.name ?? null
}

// --- Journal ---------------------------------------------------------------

export const list = query({
  args: {
    shopId: v.optional(v.id("shops")),
    type: v.optional(ENTRY_TYPE),
    category: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const scope = await scopeFor(ctx, userId, args.shopId)
    const all = args.from !== undefined || args.to !== undefined
      ? await entriesInPeriod(
          ctx,
          scope,
          args.from ?? 0,
          args.to ?? Date.now(),
        )
      : await entriesForScope(ctx, scope)
    const search = cleanText(args.search ?? "", 80).toLowerCase()
    const category = cleanText(args.category ?? "", 40)

    const filtered = all
      .filter((entry) => (args.type ? entry.type === args.type : true))
      .filter((entry) => (category ? entry.category === category : true))
      .filter((entry) => (args.from !== undefined ? entryTime(entry) >= args.from : true))
      .filter((entry) => (args.to !== undefined ? entryTime(entry) <= args.to : true))
      .filter((entry) =>
        search
          ? `${entry.label} ${entry.note ?? ""}`.toLowerCase().includes(search)
          : true,
      )
      .sort((a, b) => entryTime(b) - entryTime(a))

    let sales = 0
    let expenses = 0
    let debts = 0
    let debtsSettled = 0
    let receivable = 0
    let payable = 0
    for (const entry of filtered) {
      if (entry.type === "sale") sales += entry.amount
      if (entry.type === "expense") expenses += entry.amount
      if (entry.type === "debt") {
        if (entry.settled) debtsSettled += entry.amount
        else if (entry.debtDirection === "payable") payable += entry.amount
        else receivable += entry.amount
        if (!entry.settled) debts += entry.amount
      }
    }

    const results = await Promise.all(
      filtered.slice(0, 300).map(async (entry) => ({
        id: entry._id,
        type: entry.type,
        label: entry.label,
        amount: entry.amount,
        note: entry.note ?? "",
        category: entry.category ?? null,
        settled: entry.settled === true,
        createdAt: entry.createdAt,
        occurredAt: entryTime(entry),
        quantity: entry.quantity ?? null,
        debtDirection: entry.debtDirection ?? null,
        contactName: await contactName(ctx, entry.contactId),
        productName: (await productInfo(ctx, entry.productId))?.name ?? null,
        sellerName: await sellerName(ctx, entry.sellerId),
        linkedPurchase: Boolean(entry.purchaseId),
        linkedCredit: Boolean(entry.creditId),
        linkedDebt: Boolean(entry.debtEntryId),
      })),
    )

    return {
      ok: true as const,
      entries: results,
      totalCount: filtered.length,
      totals: {
        sales,
        expenses,
        debts,
        debtsSettled,
        receivable,
        payable,
        balance: sales - expenses,
      },
    }
  },
})

export const add = mutation({
  args: {
    type: ENTRY_TYPE,
    label: v.string(),
    amount: v.number(),
    note: v.optional(v.string()),
    category: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
    contactId: v.optional(v.id("contacts")),
    productId: v.optional(v.id("products")),
    quantity: v.optional(v.number()),
    shopId: v.optional(v.id("shops")),
    debtDirection: v.optional(
      v.union(v.literal("receivable"), v.literal("payable")),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const scope = await scopeFor(ctx, userId, args.shopId)
    if (scope.shopId) await requireShopPermission(ctx, scope.shopId, userId, args.type === "expense" ? "accounting:write" : args.type === "debt" ? "debt" : "sale")
    const label = cleanText(args.label, 80)
    if (label.length < 2) {
      return { ok: false as const, code: "INVALID_LABEL" as const }
    }
    if (!positive(args.amount)) {
      return { ok: false as const, code: "INVALID_AMOUNT" as const }
    }
    const occurredAt = businessDate(args.occurredAt)
    if (occurredAt === null) {
      return { ok: false as const, code: "INVALID_DATE" as const }
    }

    const quantity =
      args.quantity && positive(args.quantity, 1_000_000)
        ? Math.round(args.quantity)
        : undefined

    if (args.contactId) {
      const contact = await ctx.db.get(args.contactId)
      if (!contact || contact.ownerId !== scope.ownerId) {
        return { ok: false as const, code: "INVALID_CONTACT" as const }
      }
    }

    let product: Doc<"products"> | null = null
    if (args.productId) {
      product = await ctx.db.get(args.productId)
      if (!product || product.ownerId !== scope.ownerId) {
        return { ok: false as const, code: "INVALID_PRODUCT" as const }
      }
      if (scope.shopId) {
        if (product.shopId !== scope.shopId) {
          return { ok: false as const, code: "INVALID_PRODUCT" as const }
        }
      } else if (product.shopId) {
        return { ok: false as const, code: "INVALID_PRODUCT" as const }
      }
    }

    const sold = args.type === "sale" && product ? quantity ?? 1 : undefined
    if (product && sold && sold > product.stock) {
      return { ok: false as const, code: "INSUFFICIENT_STOCK" as const }
    }

    const id = await ctx.db.insert("cahierEntries", {
      ownerId: scope.ownerId,
      type: args.type,
      label,
      amount: Math.round(args.amount),
      note: cleanText(args.note ?? "", 200),
      category: cleanText(args.category ?? "", 40) || undefined,
      settled: args.type === "debt" ? false : undefined,
      createdAt: Date.now(),
      occurredAt,
      sellerId: userId,
      ...(scope.shopId ? { shopId: scope.shopId } : {}),
      ...(args.contactId ? { contactId: args.contactId } : {}),
      ...(product ? { productId: product._id } : {}),
      ...(sold ? { quantity: sold } : quantity ? { quantity } : {}),
      ...(args.type === "debt"
        ? { debtDirection: args.debtDirection ?? ("receivable" as const) }
        : {}),
    })

    // A sale linked to a product takes the quantity out of that shop's stock.
    if (product && sold) {
      await ctx.db.patch(product._id, { stock: product.stock - sold })
      await ctx.db.insert("stockMoves", {
        ownerId: scope.ownerId,
        productId: product._id,
        delta: -sold,
        reason: "sale",
        createdAt: Date.now(),
      })
    }
    return { ok: true as const, id }
  },
})

export const toggleSettled = mutation({
  args: { entryId: v.id("cahierEntries") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const entry = await ctx.db.get(args.entryId)
    if (!entry || !(await canAccessEntry(ctx, userId, entry))) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    if (entry.shopId) await requireShopPermission(ctx, entry.shopId, userId, "accounting:write")
    if (entry.type !== "debt") {
      return { ok: false as const, code: "NOT_A_DEBT" as const }
    }
    if (entry.creditId) {
      return { ok: false as const, code: "LINKED_CREDIT" as const }
    }

    const now = Date.now()
    if (entry.settled !== true) {
      // Settling a receivable brings cash in; settling a payable sends cash out.
      await ctx.db.insert("cahierEntries", {
        ownerId: entry.ownerId,
        type: entry.debtDirection === "payable" ? "expense" : "sale",
        label: `Règlement: ${entry.label}`.slice(0, 80),
        amount: entry.amount,
        note: entry.note ?? "",
        category: "debt_settlement",
        createdAt: now,
        occurredAt: now,
        sellerId: userId,
        debtEntryId: entry._id,
        ...(entry.shopId ? { shopId: entry.shopId } : {}),
        ...(entry.contactId ? { contactId: entry.contactId } : {}),
      })
      await ctx.db.patch(entry._id, { settled: true })
      return { ok: true as const, settled: true }
    }

    const linked = await ctx.db
      .query("cahierEntries")
      .withIndex("by_owner_debtEntryId", (q) =>
        q.eq("ownerId", entry.ownerId).eq("debtEntryId", entry._id),
      )
      .collect()
    for (const row of linked) await ctx.db.delete(row._id)
    await ctx.db.patch(entry._id, { settled: false })
    return { ok: true as const, settled: false }
  },
})

export const remove = mutation({
  args: { entryId: v.id("cahierEntries") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const entry = await ctx.db.get(args.entryId)
    if (!entry || !(await canAccessEntry(ctx, userId, entry))) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    if (entry.shopId) await requireShopPermission(ctx, entry.shopId, userId, "accounting:write")
    if (entry.purchaseId || entry.creditId || entry.debtEntryId) {
      return { ok: false as const, code: "LINKED_ENTRY" as const }
    }

    if (entry.type === "debt") {
      const linked = await ctx.db
        .query("cahierEntries")
        .withIndex("by_owner_debtEntryId", (q) =>
          q.eq("ownerId", entry.ownerId).eq("debtEntryId", entry._id),
        )
        .collect()
      for (const row of linked) await ctx.db.delete(row._id)
    }

    // Removing a product sale puts the goods back in the same shop's stock.
    if (entry.type === "sale" && entry.productId) {
      const product = await ctx.db.get(entry.productId)
      if (product) {
        const sold = entry.quantity ?? 1
        await ctx.db.patch(product._id, { stock: product.stock + sold })
        await ctx.db.insert("stockMoves", {
          ownerId: entry.ownerId,
          productId: product._id,
          delta: sold,
          reason: "adjustment",
          createdAt: Date.now(),
        })
      }
    }
    await ctx.db.delete(entry._id)
    return { ok: true as const }
  },
})

// --- Products and stock ----------------------------------------------------

export const products = query({
  args: { shopId: v.optional(v.id("shops")) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const scope = await scopeFor(ctx, userId, args.shopId)
    const rows = await productsForScope(ctx, scope)
    return {
      ok: true as const,
      results: rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((product) => ({
          id: product._id,
          name: product.name,
          unit: product.unit,
          price: product.price,
          stock: product.stock,
          minStock: product.minStock,
          lowStock: product.stock <= product.minStock,
          stockValue: product.stock * product.price,
          shopId: product.shopId ?? null,
        })),
    }
  },
})

export const addProduct = mutation({
  args: {
    name: v.string(),
    unit: v.string(),
    price: v.number(),
    stock: v.number(),
    minStock: v.number(),
    barcode: v.optional(v.string()),
    shopId: v.optional(v.id("shops")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const scope = await scopeFor(ctx, userId, args.shopId)
    if (scope.shopId) await requireShopPermission(ctx, scope.shopId, userId, "product:write")
    const name = cleanText(args.name, 60)
    if (name.length < 2) return { ok: false as const, code: "INVALID_NAME" as const }
    if (!positive(args.price)) return { ok: false as const, code: "INVALID_PRICE" as const }
    const stock = Number.isFinite(args.stock) && args.stock >= 0 ? Math.round(args.stock) : 0
    const minStock =
      Number.isFinite(args.minStock) && args.minStock >= 0 ? Math.round(args.minStock) : 0
    const barcode = cleanText(args.barcode ?? "", 64) || undefined

    if (barcode) {
      const existing = scope.shopId
        ? await ctx.db.query("products")
            .withIndex("by_shop_barcode", (q) => q.eq("shopId", scope.shopId).eq("barcode", barcode))
            .first()
        : await ctx.db.query("products")
            .withIndex("by_owner_barcode", (q) => q.eq("ownerId", scope.ownerId).eq("barcode", barcode))
            .first()
      if (existing) return { ok: false as const, code: "DUPLICATE_BARCODE" as const }
    }

    const id = await ctx.db.insert("products", {
      ownerId: scope.ownerId,
      name,
      unit: cleanText(args.unit, 20) || "pièce",
      price: Math.round(args.price),
      stock,
      minStock,
      createdAt: Date.now(),
      ...(scope.shopId ? { shopId: scope.shopId } : {}),
      ...(barcode ? { barcode } : {}),
    })
    return { ok: true as const, id }
  },
})

export const adjustStock = mutation({
  args: { productId: v.id("products"), delta: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const product = await ctx.db.get(args.productId)
    if (!product) return { ok: false as const, code: "NOT_FOUND" as const }
    if (product.shopId) await requireShopPermission(ctx, product.shopId, userId, "stock:write")
    else if (product.ownerId !== userId) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    const delta = Math.round(args.delta)
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
      return { ok: false as const, code: "INVALID_QUANTITY" as const }
    }
    const next = product.stock + delta
    if (next < 0) return { ok: false as const, code: "INSUFFICIENT_STOCK" as const }
    await ctx.db.patch(product._id, { stock: next })
    await ctx.db.insert("stockMoves", {
      ownerId: product.ownerId,
      productId: product._id,
      delta,
      reason: "adjustment",
      createdAt: Date.now(),
    })
    return { ok: true as const }
  },
})

export const removeProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const product = await ctx.db.get(args.productId)
    if (!product) return { ok: false as const, code: "NOT_FOUND" as const }
    if (product.shopId) await requireShopPermission(ctx, product.shopId, userId, "product:write")
    else if (product.ownerId !== userId) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    const moves = await ctx.db
      .query("stockMoves")
      .withIndex("by_product_createdAt", (q) => q.eq("productId", product._id))
      .order("desc")
      .collect()
    for (const move of moves) await ctx.db.delete(move._id)
    await ctx.db.delete(product._id)
    return { ok: true as const }
  },
})

// --- Customers and suppliers ----------------------------------------------

export const contacts = query({
  args: { shopId: v.optional(v.id("shops")) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const scope = await scopeFor(ctx, userId, args.shopId)
    const rows = await ctx.db
      .query("contacts")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", scope.ownerId))
      .order("desc")
      .collect()
    return {
      ok: true as const,
      results: rows.map((contact) => ({
        id: contact._id,
        name: contact.name,
        kind: contact.kind,
        phone: contact.phone ?? "",
      })),
    }
  },
})

export const addContact = mutation({
  args: {
    name: v.string(),
    kind: CONTACT_KIND,
    phone: v.optional(v.string()),
    shopId: v.optional(v.id("shops")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const scope = await scopeFor(ctx, userId, args.shopId)
    if (scope.shopId) await requireShopPermission(ctx, scope.shopId, userId, "contact:create")
    const name = cleanText(args.name, 60)
    if (name.length < 2) return { ok: false as const, code: "INVALID_NAME" as const }
    const id = await ctx.db.insert("contacts", {
      ownerId: scope.ownerId,
      name,
      kind: args.kind,
      phone: cleanText(args.phone ?? "", 24),
      createdAt: Date.now(),
    })
    return { ok: true as const, id }
  },
})

export const removeContact = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const contact = await ctx.db.get(args.contactId)
    if (!contact || contact.ownerId !== userId) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }
    await ctx.db.delete(contact._id)
    return { ok: true as const }
  },
})

// --- Purchases -------------------------------------------------------------

export const purchases = query({
  args: { shopId: v.optional(v.id("shops")) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const scope = await scopeFor(ctx, userId, args.shopId)
    const rows = await purchasesForScope(ctx, scope)
    const sorted = rows.sort((a, b) => entryTime(b) - entryTime(a))
    const results = await Promise.all(
      sorted.slice(0, 200).map(async (purchase) => ({
        id: purchase._id,
        label: purchase.label,
        quantity: purchase.quantity,
        unitCost: purchase.unitCost,
        total: purchase.total,
        createdAt: purchase.createdAt,
        occurredAt: entryTime(purchase),
        supplierName: await contactName(ctx, purchase.supplierId),
        productName: (await productInfo(ctx, purchase.productId))?.name ?? null,
      })),
    )
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthTotal = sorted
      .filter((purchase) => entryTime(purchase) >= monthStart.getTime())
      .reduce((sum, purchase) => sum + purchase.total, 0)
    return { ok: true as const, results, monthTotal, totalCount: sorted.length }
  },
})

export const addPurchase = mutation({
  args: {
    label: v.string(),
    quantity: v.number(),
    unitCost: v.number(),
    occurredAt: v.optional(v.number()),
    supplierId: v.optional(v.id("contacts")),
    productId: v.optional(v.id("products")),
    shopId: v.optional(v.id("shops")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const scope = await scopeFor(ctx, userId, args.shopId)
    if (scope.shopId) await requireShopPermission(ctx, scope.shopId, userId, "accounting:write")
    const label = cleanText(args.label, 80)
    if (label.length < 2) return { ok: false as const, code: "INVALID_LABEL" as const }
    if (!positive(args.unitCost)) {
      return { ok: false as const, code: "INVALID_AMOUNT" as const }
    }
    if (!positive(args.quantity, 1_000_000)) {
      return { ok: false as const, code: "INVALID_QUANTITY" as const }
    }
    const occurredAt = businessDate(args.occurredAt)
    if (occurredAt === null) {
      return { ok: false as const, code: "INVALID_DATE" as const }
    }
    const quantity = Math.round(args.quantity)
    const total = Math.round(args.unitCost * quantity)

    if (args.supplierId) {
      const supplier = await ctx.db.get(args.supplierId)
      if (!supplier || supplier.ownerId !== scope.ownerId) {
        return { ok: false as const, code: "INVALID_CONTACT" as const }
      }
      if (supplier.kind !== "supplier") {
        return { ok: false as const, code: "INVALID_CONTACT" as const }
      }
    }

    let product: Doc<"products"> | null = null
    if (args.productId) {
      product = await ctx.db.get(args.productId)
      if (!product || product.ownerId !== scope.ownerId) {
        return { ok: false as const, code: "INVALID_PRODUCT" as const }
      }
      if (scope.shopId) {
        if (product.shopId !== scope.shopId) {
          return { ok: false as const, code: "INVALID_PRODUCT" as const }
        }
      } else if (product.shopId) {
        return { ok: false as const, code: "INVALID_PRODUCT" as const }
      }
    }

    const purchaseId = await ctx.db.insert("purchases", {
      ownerId: scope.ownerId,
      label,
      quantity,
      unitCost: Math.round(args.unitCost),
      total,
      createdAt: Date.now(),
      occurredAt,
      ...(scope.shopId ? { shopId: scope.shopId } : {}),
      ...(args.supplierId ? { supplierId: args.supplierId } : {}),
      ...(product ? { productId: product._id } : {}),
    })

    if (product) {
      await ctx.db.patch(product._id, { stock: product.stock + quantity })
      await ctx.db.insert("stockMoves", {
        ownerId: scope.ownerId,
        productId: product._id,
        delta: quantity,
        reason: "purchase",
        createdAt: Date.now(),
      })
    }

    // A purchase is money leaving the shop: booked as a categorised expense.
    await ctx.db.insert("cahierEntries", {
      ownerId: scope.ownerId,
      type: "expense",
      label,
      amount: total,
      note: "",
      category: "expense_goods",
      createdAt: Date.now(),
      occurredAt,
      sellerId: userId,
      purchaseId,
      ...(scope.shopId ? { shopId: scope.shopId } : {}),
      ...(args.supplierId ? { contactId: args.supplierId } : {}),
      ...(product ? { productId: product._id } : {}),
      quantity,
    })

    return { ok: true as const, id: purchaseId }
  },
})

export const removePurchase = mutation({
  args: { purchaseId: v.id("purchases") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const purchase = await ctx.db.get(args.purchaseId)
    if (!purchase) return { ok: false as const, code: "NOT_FOUND" as const }
    if (purchase.shopId) await requireShopPermission(ctx, purchase.shopId, userId, "accounting:write")
    else if (purchase.ownerId !== userId) {
      return { ok: false as const, code: "NOT_FOUND" as const }
    }

    if (purchase.productId) {
      const product = await ctx.db.get(purchase.productId)
      if (product) {
        await ctx.db.patch(product._id, {
          stock: Math.max(0, product.stock - purchase.quantity),
        })
        await ctx.db.insert("stockMoves", {
          ownerId: purchase.ownerId,
          productId: product._id,
          delta: -purchase.quantity,
          reason: "adjustment",
          createdAt: Date.now(),
        })
      }
    }

    // Remove the expense created with the purchase, so cash stays correct.
    const entries = await ctx.db
      .query("cahierEntries")
      .withIndex("by_purchaseId", (q) => q.eq("purchaseId", purchase._id))
      .collect()
    for (const entry of entries) await ctx.db.delete(entry._id)
    await ctx.db.delete(purchase._id)
    return { ok: true as const }
  },
})

// --- Evolution over time ---------------------------------------------------

function bucketKey(date: Date, period: "day" | "month" | "year"): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  if (period === "year") return `${date.getFullYear()}`
  if (period === "month") return `${date.getFullYear()}-${month}`
  return `${date.getFullYear()}-${month}-${`${date.getDate()}`.padStart(2, "0")}`
}

export const evolution = query({
  args: {
    period: v.union(
      v.literal("day"),
      v.literal("month"),
      v.literal("twoYear"),
      v.literal("year"),
    ),
    shopId: v.optional(v.id("shops")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const premium = await isPremiumUser(ctx, userId)
    const longHistory = args.period === "twoYear" || args.period === "year"

    // Long history is the only premium feature: free accounts keep one year.
    if (longHistory && !premium) {
      return {
        ok: true as const,
        period: args.period,
        locked: true as const,
        premium,
        points: [],
        totalSales: 0,
        totalExpenses: 0,
        totalProfit: 0,
      }
    }

    const scope = await scopeFor(ctx, userId, args.shopId)

    const now = new Date()
    const buckets: { key: string; date: Date }[] = []
    if (args.period === "day") {
      for (let index = 29; index >= 0; index -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - index)
        buckets.push({ key: bucketKey(date, "day"), date })
      }
    } else if (args.period === "month") {
      for (let index = 11; index >= 0; index -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
        buckets.push({ key: bucketKey(date, "month"), date })
      }
    } else if (args.period === "year") {
      for (let index = 11; index >= 0; index -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
        buckets.push({ key: bucketKey(date, "month"), date })
      }
    } else {
      for (let index = 23; index >= 0; index -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
        buckets.push({ key: bucketKey(date, "month"), date })
      }
    }

    const entries = await entriesInPeriod(
      ctx,
      scope,
      buckets[0].date.getTime(),
      Date.now(),
    )

    const totals = new Map<string, { sales: number; expenses: number }>()
    for (const bucket of buckets) {
      totals.set(bucket.key, { sales: 0, expenses: 0 })
    }
    const bucketPeriod = args.period === "day" ? "day" : "month"
    for (const entry of entries) {
      const key = bucketKey(new Date(entryTime(entry)), bucketPeriod)
      const bucket = totals.get(key)
      if (!bucket) continue
      if (entry.type === "sale") bucket.sales += entry.amount
      else if (entry.type === "expense") bucket.expenses += entry.amount
    }

    const points = buckets.map((bucket) => {
      const value = totals.get(bucket.key) ?? { sales: 0, expenses: 0 }
      return {
        key: bucket.key,
        sales: value.sales,
        expenses: value.expenses,
        profit: value.sales - value.expenses,
        timestamp: bucket.date.getTime(),
      }
    })

    return {
      ok: true as const,
      period: args.period,
      locked: false as const,
      premium,
      points,
      totalSales: points.reduce((sum, point) => sum + point.sales, 0),
      totalExpenses: points.reduce((sum, point) => sum + point.expenses, 0),
      totalProfit: points.reduce((sum, point) => sum + point.profit, 0),
    }
  },
})
