# HORIZON V4 — Cahier read audit

Status: partial correction in the isolated migration branch. Static source inspection only; no TypeScript compilation, Convex deployment, runtime test, or production operation has been performed.

## Corrections applied

1. Added direct relationship indexes to `cahierEntries`:
   - `by_purchaseId`
   - `by_creditId`
   - `by_debtEntryId`
   The existing `by_owner_debtEntryId` remains available for owner-scoped reversals.

2. Replaced broad owner-ledger scans in linked operations:
   - reversing a settled debt now queries `by_owner_debtEntryId`;
   - removing a debt now queries `by_owner_debtEntryId`;
   - removing a purchase now queries `by_purchaseId`;
   - completing/removing a credit now queries `by_creditId`.

3. Added date-window readers in `cahier.ts` and `cahier_plus.ts`:
   - business-date rows are queried through `by_shop_occurredAt` or `by_owner_shop_occurredAt`;
   - legacy rows without `occurredAt` are queried through the matching `createdAt` index and included only when `occurredAt === undefined`;
   - this avoids double-counting rows and preserves the original fallback rule `occurredAt ?? createdAt`.

4. Applied indexed date windows to:
   - Cahier journal queries when the caller supplies a date bound;
   - 30-day / 12-month / 24-month evolution;
   - cash-today calculations;
   - day/month/year financial reports and purchase totals.

5. Cash closing lookups now use day-specific indexes; the displayed closing history is limited to the newest 30 rows. The exact current-day closing lookup is not capped.

6. Date filtering now checks `!== undefined`, so a timestamp of zero is not accidentally treated as “no filter”.

## Why this is not yet a complete bounded-read solution

The remaining full-history reads are intentional blockers for now. Simply replacing them with `take(100)`, `take(500)`, or `take(1000)` would silently make totals, balances, stock values, or counts wrong.

Remaining areas requiring a separately verified design:

- `cahier.ts`: all-time journal list when no date range is supplied; all-time purchase history and month total; personal/shop ledger helper reads; product and contact inventories; stock-movement cleanup during product deletion.
- `cahier_plus.ts`: shop-wide journal totals; credit lists and overdue-credit totals; credit payment history; full product inventory used by report stock valuation; shop/member and target lists.
- Some linked cleanup operations still use `.collect()`. Their lookup is now indexed, but a single mutation can still exceed transaction limits if one source record has a very large number of linked rows.

## Financial correctness rule

No financial total has been changed to a capped partial sum. The date-window paths use indexes and retain the legacy `createdAt` fallback. All-time filtered totals remain unbounded until we choose and implement a complete solution.

For large all-time histories, a hard `take()` limit is not acceptable. The next design step is to inspect every frontend caller and its expected response shape, then decide between:
- cursor pagination for displayed rows, with explicit continuation metadata; and
- transactionally maintained aggregate records (including a safe backfill/reconciliation plan) for exact totals.

Any aggregate design must cover every create, settlement, payment, reversal, edit, and delete path before it can replace the existing sums. Search-text filters cannot be represented by ordinary daily totals, so their current semantics must be checked before changing the API.

## Validation status

- Static index-name and source-anchor checks: performed for the changes above.
- TypeScript / Convex type generation: not run.
- Unit / integration tests: not run.
- Convex development deployment: not run.
- Macaly Live, Neon, Vercel Production, and Convex Production: untouched.
