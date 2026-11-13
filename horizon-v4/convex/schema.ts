// HORIZON Workspace V4 — corrected schema draft.
// Derived from the original Macaly convex/schema.ts.
// All 29 application tables and every original field are preserved.
// Added indexes are migration preparation; update query code to use them before
// expecting performance improvements. No production deployment was performed.

import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

const role = v.union(v.literal("member"), v.literal("admin"))
const mediaKind = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("pdf"),
)

export default defineSchema({
  ...authTables,

  // Private account row managed by Convex Auth. The email is NEVER sent to
  // other users: public data lives in `profiles`.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    googleSubject: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("google_subject", ["googleSubject"]),

  // Public HORIZON identity (e.g. "charles" => charles.HZ).
  profiles: defineTable({
    userId: v.id("users"),
    // Lowercase prefix without the ".HZ" suffix. Unique across the app.
    handle: v.string(),
    displayName: v.string(),
    photoUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    // Timestamp at which the person confirmed being 15 or older.
    ageConfirmedAt: v.number(),
    // Set when the handle is changed; changes are limited to once per 90 days.
    handleChangedAt: v.optional(v.number()),
    // Administration role. Absent means "member".
    role: v.optional(role),
    // Premium account verification badge.
    verified: v.optional(v.boolean()),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_handle", ["handle"]),

  // Password for signing in on another device with the HORIZON address.
  // Only a salted PBKDF2 hash is stored, never the password itself.
  passwordCredentials: defineTable({
    userId: v.id("users"),
    hash: v.string(),
    failedAttempts: v.number(),
    lockedUntil: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Publications: text plus an optional photo, video or PDF attachment.
  posts: defineTable({
    authorId: v.id("users"),
    body: v.string(),
    mediaKind: v.optional(mediaKind),
    mediaId: v.optional(v.id("_storage")),
    mediaName: v.optional(v.string()),
    boostedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_author", ["authorId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_author_createdAt", ["authorId", "createdAt"]),

  postLikes: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_post_user", ["postId", "userId"])
    .index("by_user", ["userId"])
    .index("by_post_createdAt", ["postId", "createdAt"]),

  postComments: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_author", ["userId"])
    .index("by_post_createdAt", ["postId", "createdAt"])
    .index("by_author_createdAt", ["userId", "createdAt"]),

  // Direct messages: text or a recorded voice note.
  messages: defineTable({
    fromId: v.id("users"),
    toId: v.id("users"),
    kind: v.union(v.literal("text"), v.literal("voice")),
    body: v.optional(v.string()),
    mediaId: v.optional(v.id("_storage")),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_from", ["fromId"])
    .index("by_to", ["toId"])
    .index("by_pair", ["fromId", "toId"])
    .index("by_from_createdAt", ["fromId", "createdAt"])
    .index("by_to_createdAt", ["toId", "createdAt"])
    .index("by_to_readAt_createdAt", ["toId", "readAt", "createdAt"])
    .index("by_pair_createdAt", ["fromId", "toId", "createdAt"]),

  // Small business ledger: sales, expenses and debts.
  cahierEntries: defineTable({
    ownerId: v.id("users"),
    type: v.union(
      v.literal("sale"),
      v.literal("expense"),
      v.literal("debt"),
    ),
    label: v.string(),
    amount: v.number(),
    note: v.optional(v.string()),
    settled: v.optional(v.boolean()),
    createdAt: v.number(),
    // Business date chosen by the user. Older rows fall back to createdAt.
    occurredAt: v.optional(v.number()),
    // Stable category key, translated in the interface.
    category: v.optional(v.string()),
    // Commercial details (all optional so older entries stay valid).
    shopId: v.optional(v.id("shops")),
    sellerId: v.optional(v.id("users")),
    contactId: v.optional(v.id("contacts")),
    productId: v.optional(v.id("products")),
    quantity: v.optional(v.number()),
    // Links used to reverse an entry when its source is deleted.
    purchaseId: v.optional(v.id("purchases")),
    creditId: v.optional(v.id("credits")),
    debtEntryId: v.optional(v.id("cahierEntries")),
    // For debts: money owed to the shop or by the shop.
    debtDirection: v.optional(
      v.union(v.literal("receivable"), v.literal("payable")),
    ),
  })
    .index("by_owner", ["ownerId"])
    .index("by_shop", ["shopId"])
    .index("by_owner_shop_createdAt", ["ownerId", "shopId", "createdAt"])
    .index("by_owner_shop_occurredAt", ["ownerId", "shopId", "occurredAt"])
    .index("by_shop_createdAt", ["shopId", "createdAt"])
    .index("by_shop_occurredAt", ["shopId", "occurredAt"])
    .index("by_owner_debtEntryId", ["ownerId", "debtEntryId"])
    .index("by_purchaseId", ["purchaseId"])
    .index("by_creditId", ["creditId"])
    .index("by_debtEntryId", ["debtEntryId"]),

  // Customers and suppliers of one shop.
  contacts: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    kind: v.union(v.literal("customer"), v.literal("supplier")),
    phone: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"]),

  // Products sold by the shop, with their current stock.
  products: defineTable({
    ownerId: v.id("users"),
    shopId: v.optional(v.id("shops")),
    name: v.string(),
    barcode: v.optional(v.string()),
    unit: v.string(),
    price: v.number(),
    stock: v.number(),
    minStock: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_shop", ["shopId"])
    .index("by_owner_barcode", ["ownerId", "barcode"])
    .index("by_shop_barcode", ["shopId", "barcode"]),

  // Every stock movement, so the history can be audited.
  stockMoves: defineTable({
    ownerId: v.id("users"),
    productId: v.id("products"),
    delta: v.number(),
    reason: v.union(
      v.literal("sale"),
      v.literal("purchase"),
      v.literal("adjustment"),
    ),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_product", ["productId"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_product_createdAt", ["productId", "createdAt"]),

  // Supplier purchases, which also feed the stock.
  purchases: defineTable({
    ownerId: v.id("users"),
    shopId: v.optional(v.id("shops")),
    supplierId: v.optional(v.id("contacts")),
    productId: v.optional(v.id("products")),
    label: v.string(),
    quantity: v.number(),
    unitCost: v.number(),
    total: v.number(),
    createdAt: v.number(),
    occurredAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_shop", ["shopId"])
    .index("by_owner_shop_createdAt", ["ownerId", "shopId", "createdAt"])
    .index("by_owner_shop_occurredAt", ["ownerId", "shopId", "occurredAt"])
    .index("by_shop_createdAt", ["shopId", "createdAt"])
    .index("by_shop_occurredAt", ["shopId", "occurredAt"]),

  // Premium subscription entitlement, driven by payment webhooks.
  premiumSubscriptions: defineTable({
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    plan: v.string(),
    status: v.string(),
    currentPeriodEnd: v.number(),
    mode: v.union(v.literal("test"), v.literal("live")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_mode", ["mode"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"])
    .index("by_user_mode", ["userId", "mode"])
    .index("by_user_mode_status", ["userId", "mode", "status"]),

  // Manual mobile money payments waiting for admin review.
  mobileMoneyRequests: defineTable({
    userId: v.id("users"),
    item: v.string(), // "monthly" | "yearly" | credit pack id
    itemKind: v.union(v.literal("plan"), v.literal("credits")),
    operator: v.string(),
    phone: v.string(),
    transactionId: v.string(),
    amount: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    note: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_user_createdAt", ["userId", "createdAt"]),

  // Merchant numbers and payment instructions, editable by the admin only.
  paymentSettings: defineTable({
    key: v.string(),
    currency: v.string(),
    monthlyAmount: v.number(),
    yearlyAmount: v.number(),
    operators: v.array(
      v.object({
        id: v.string(),
        merchantNumber: v.string(),
        ussdCode: v.string(),
        instructions: v.string(),
        enabled: v.optional(v.boolean()),
      }),
    ),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_key", ["key"]),

  // SUN AI usage per member and per day (free daily quota).
  aiUsage: defineTable({
    userId: v.id("users"),
    day: v.string(),
    count: v.number(),
  }).index("by_user_day", ["userId", "day"]),

  // Extra SUN credits bought as packs.
  creditGrants: defineTable({
    userId: v.id("users"),
    credits: v.number(),
    source: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_user_createdAt", ["userId", "createdAt"]),

  // Post boosts, limited per month by the plan.
  boosts: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_post", ["postId"])
    .index("by_user_createdAt", ["userId", "createdAt"]),

  // Shops: one owner, several sellers with roles.
  shops: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    currency: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"]),

  shopMembers: defineTable({
    shopId: v.id("shops"),
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("manager"),
      v.literal("seller"),
    ),
    createdAt: v.number(),
  })
    .index("by_shop", ["shopId"])
    .index("by_user", ["userId"])
    .index("by_shop_user", ["shopId", "userId"]),

  // Ownership registry for files uploaded through HORIZON. The storage ID is
  // unguessable; a short-lived upload grant is consumed when the client claims it.
  uploads: defineTable({
    ownerId: v.id("users"),
    storageId: v.optional(v.id("_storage")),
    uploadToken: v.optional(v.string()),
    purpose: v.union(
      v.literal("post"),
      v.literal("message"),
      v.literal("profile"),
      v.literal("assistant"),
    ),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("attached")),
    contentType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_storage", ["storageId"])
    .index("by_uploadToken", ["uploadToken"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_owner_status", ["ownerId", "status"]),

  // Customer credit with installments and payment reminders.
  credits: defineTable({
    ownerId: v.id("users"),
    shopId: v.optional(v.id("shops")),
    contactId: v.optional(v.id("contacts")),
    customerName: v.string(),
    label: v.string(),
    total: v.number(),
    dueDate: v.number(),
    reminderCount: v.number(),
    lastReminderAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_shop", ["shopId"])
    .index("by_owner_shop_createdAt", ["ownerId", "shopId", "createdAt"])
    .index("by_owner_shop_dueDate", ["ownerId", "shopId", "dueDate"])
    .index("by_shop_createdAt", ["shopId", "createdAt"])
    .index("by_shop_dueDate", ["shopId", "dueDate"]),

  creditPayments: defineTable({
    creditId: v.id("credits"),
    amount: v.number(),
    createdAt: v.number(),
  }).index("by_credit", ["creditId"])
    .index("by_credit_createdAt", ["creditId", "createdAt"]),

  // Sales goals and spending budgets.
  cahierTargets: defineTable({
    ownerId: v.id("users"),
    shopId: v.optional(v.id("shops")),
    kind: v.union(v.literal("goal"), v.literal("budget")),
    period: v.union(v.literal("month"), v.literal("year")),
    amount: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_shop", ["shopId"])
    .index("by_owner_shop_kind_period", ["ownerId", "shopId", "kind", "period"]),

  // In-app notifications: messages, connection requests, platform alerts.
  notifications: defineTable({
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
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_readAt_createdAt", ["userId", "readAt", "createdAt"]),

  // Connection requests between members.
  connections: defineTable({
    fromId: v.id("users"),
    toId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_from", ["fromId"])
    .index("by_to", ["toId"])
    .index("by_pair", ["fromId", "toId"])
    .index("by_from_status_createdAt", ["fromId", "status", "createdAt"])
    .index("by_to_status_createdAt", ["toId", "status", "createdAt"]),

  // Phone + password credentials (no SMS provider needed).
  phoneCredentials: defineTable({
    userId: v.id("users"),
    phone: v.string(),
    hash: v.string(),
    failedAttempts: v.number(),
    lockedUntil: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_phone", ["phone"])
    .index("by_user", ["userId"]),

  // SUN chat history: persisted so the conversation survives reloads and
  // new sessions, and so the assistant can remember earlier exchanges.
  assistantMessages: defineTable({
    ownerId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    kind: v.optional(
      v.union(
        v.literal("text"),
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
      ),
    ),
    fileId: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
    mime: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"]),

  // Long-term memory summary per member, refreshed by SUN itself.
  assistantMemory: defineTable({
    ownerId: v.id("users"),
    summary: v.string(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // Daily cash closing: expected vs counted amount.
  cashClosings: defineTable({
    ownerId: v.id("users"),
    shopId: v.optional(v.id("shops")),
    day: v.string(),
    expected: v.number(),
    counted: v.number(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_shop", ["shopId"])
    .index("by_owner_shop_day", ["ownerId", "shopId", "day"])
    .index("by_shop_day", ["shopId", "day"]),
})
