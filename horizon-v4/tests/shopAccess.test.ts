import { describe, expect, it } from "vitest"
import { roleCan } from "../convex/shopAccess"

describe("HORIZON shop role permissions", () => {
  it("allows sellers to read, record sales/debts and add contacts", () => {
    expect(roleCan("seller", "read")).toBe(true)
    expect(roleCan("seller", "sale")).toBe(true)
    expect(roleCan("seller", "debt")).toBe(true)
    expect(roleCan("seller", "contact:create")).toBe(true)
  })

  it("prevents sellers from changing stock, products or accounting history", () => {
    expect(roleCan("seller", "accounting:write")).toBe(false)
    expect(roleCan("seller", "stock:write")).toBe(false)
    expect(roleCan("seller", "product:write")).toBe(false)
  })

  it("allows managers to operate the shop but not administer membership/settings", () => {
    expect(roleCan("manager", "accounting:write")).toBe(true)
    expect(roleCan("manager", "stock:write")).toBe(true)
    expect(roleCan("manager", "product:write")).toBe(true)
    expect(roleCan("manager", "shop:manage")).toBe(false)
  })

  it("reserves shop administration for the owner", () => {
    expect(roleCan("owner", "shop:manage")).toBe(true)
  })
})
