import { ConvexError } from "convex/values"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

export type ShopRole = "owner" | "manager" | "seller"
export type ShopPermission =
  | "read"
  | "sale"
  | "debt"
  | "contact:create"
  | "accounting:write"
  | "stock:write"
  | "product:write"
  | "shop:manage"

const ALLOWED: Record<ShopPermission, readonly ShopRole[]> = {
  read: ["owner", "manager", "seller"],
  sale: ["owner", "manager", "seller"],
  debt: ["owner", "manager", "seller"],
  "contact:create": ["owner", "manager", "seller"],
  "accounting:write": ["owner", "manager"],
  "stock:write": ["owner", "manager"],
  "product:write": ["owner", "manager"],
  "shop:manage": ["owner"],
}

export async function getShopRole(
  ctx: QueryCtx | MutationCtx,
  shopId: Id<"shops">,
  userId: Id<"users">,
): Promise<ShopRole | null> {
  const shop = await ctx.db.get(shopId)
  if (!shop) return null
  if (shop.ownerId === userId) return "owner"
  const member = await ctx.db
    .query("shopMembers")
    .withIndex("by_shop_user", (q) =>
      q.eq("shopId", shopId).eq("userId", userId),
    )
    .unique()
  return member?.role ?? null
}

export async function requireShopPermission(
  ctx: QueryCtx | MutationCtx,
  shopId: Id<"shops">,
  userId: Id<"users">,
  permission: ShopPermission,
): Promise<ShopRole> {
  const role = await getShopRole(ctx, shopId, userId)
  if (!role || !ALLOWED[permission].includes(role)) {
    throw new ConvexError({ code: "FORBIDDEN" })
  }
  return role
}
