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


## Frontend contract audit — Macaly source

Read-only source inspection covered src/routes/cahier.tsx, src/components/cahier/extra-tabs.tsx, src/components/cahier/evolution-chart.tsx, src/lib/cahier-export.ts and src/lib/offline-queue.ts in the original Macaly project.

The isolated GitHub branch currently contains the Cahier Convex modules, but the two frontend component paths are not yet present under horizon-v4/src/. This is a source-contract audit, not a frontend integration or compile check.

### Existing query contracts and UI dependencies

| Query | Current UI dependency | Pagination implication |
|---|---|---|
| cahier.list | Journal cards; entries, exact totalCount and totals (sales, expenses, debts, settled debts, receivable, payable, balance). Type/category filters affect rows and totals. UI shows count when totalCount exceeds loaded entries. | Split exact summary/count from cursor-paginated rows. Preserve totals for active filters. Add a visible load-more control; never silently truncate at 300. |
| cahier.evolution | Chart consumes points, totalSales, totalExpenses, totalProfit and premium lock state. Periods: day, month, twoYear. | Keep response contract and exact period aggregates; fixed 30/12/24 buckets need no row pagination. |
| cahier.products | Used by journal/purchase forms as product dropdown and by Products tab as complete inventory; stock, minStock, lowStock and stockValue are displayed. | Do not cap inventory silently. Add paginated inventory/searchable product picker. Report stock totals need a separate exact aggregate. |
| cahier.contacts | Used in sale/purchase forms and Contacts tab; full results populate dropdowns and contact cards. | A hard cap hides selectable contacts. Add cursor pagination plus searchable/load-more selector, or explicitly decide a separate bounded selector. |
| cahier.purchases | Purchase cards use results, totalCount and monthTotal; current rows capped at 200. | Cursor-paginate displayed rows. Keep monthTotal and totalCount exact through aggregates. |
| cahier_plus.listCredits | Credit cards use all returned rows; each has paid, remaining, overdue, dueDate and reminderCount. No paging control exists. | Paginate cards; paid/remaining/overdue must use exact payment totals, not capped payment history. |
| cahier_plus.cashToday | Shows today's sales/expenses/expected cash, today's close and latest 30 closings. | Today's figures and close remain exact. Only historical closing list is intentionally limited to 30. |
| cahier_plus.report | PDF/XLSX exports consume period totals and stock array. XLSX exports every stock row; PDF intentionally prints at most 40. | Financial totals and stockValue/lowStock stay exact regardless of page size. XLSX needs a complete export path independent of on-screen inventory pagination. |
| cahier_plus.shopEntries | Backend endpoint exists, but no caller was found in inspected Cahier route/components. | Do not treat it as a current UI contract until a caller is found. |
| listShops, shopMembers, listTargets | Shop selector, team panel and target form expect complete small lists. | Assess separately as administrative lists; don't mix them into journal financial aggregation. |

### Compatibility findings

1. Journal totals are filtered by selected transaction type and category, not only by the first 300 cards. A summary endpoint must accept the same filters and return the same seven total fields.
2. The backend search argument exists, but no search input/caller was found in inspected frontend. Preserve it if used elsewhere, but it need not block the first compatible pagination slice.
3. The UI has no load-more control for journal, products, contacts, purchases or credits. Returning fewer rows without UI changes would hide records.
4. Products and contacts are form inputs as well as display lists. Pagination must not make older items impossible to select.
5. XLSX requires all report.stock rows; PDF intentionally slices to 40. Full export must remain independent of on-screen inventory pagination.

### Concrete write-integrity issue in the offline queue

The browser queue creates a local id, but flushQueue sends only the payload to cahier.add; the mutation does not receive or persist that queue ID. If the server commits a sale and its response is lost, the client catches the error and queues the same sale again. Replaying it can create a duplicate. Also, a rejected result is removed from the queue as permanently failed.

Before claiming no lost or duplicated writes, the write path needs:
- A stable client-generated idempotency key sent with every online/offline attempt.
- An indexed operation receipt scoped to authenticated owner and shop.
- The journal insert, stock movement and aggregate contribution in the same Convex mutation.
- Replay that returns the original result when a key has already committed.
- Rejected items retained or surfaced for review, not silently discarded.

### Proposed compatible read architecture — design only

A. Exact summary/read model
- Keep a separate exact journal summary query for totals and count under active shop, type and category filters.
- Maintain daily ledger aggregates by ledger owner, optional shop, business-day key, transaction type, category and debt state/direction. Use them for period totals, evolution, expected cash, report totals and exact filtered journal totals where dimensions suffice.
- Maintain purchase-period aggregates and inventory aggregates separately. Stock value and low-stock count must change atomically with every product stock, price or minStock change.
- Maintain exact payment totals per credit so remaining/overdue never depend on collecting every payment row.

B. Paginated detail queries
- Add cursor-based endpoints for journal, purchases, credits, products, contacts and (if needed) cash-closing history.
- Use stable indexed ordering and pass the same shop/type/category filters to every page.
- UI consumes Convex usePaginatedQuery, displays exact summary/count separately and offers load more. Existing row fields and ordering remain unchanged.
- Page length is never a financial count or total.

C. No-gap aggregate rollout
- First add idempotency keys and transactional contribution updates to every relevant mutation: create, settle/reverse, delete, purchase create/delete, credit create/payment/delete, stock adjust/sale/purchase and product price/minStock changes.
- Represent each source row's current aggregate contribution in an indexed contribution record. Updating/deleting a source row changes its contribution and rollup in the same transaction.
- Backfill legacy rows in cursor batches. Each batch checks/creates the source contribution transactionally; if a live mutation already contributed that source row, backfill skips it. Concurrent change/delete must be resolved through Convex transaction conflict/retry and the contribution record, preventing double application or omission.
- Reconcile aggregate totals against a full cursor scan before switching reads. Keep the old exact scan as comparison/fallback until reconciliation passes.
- Only then switch summary/report/evolution reads to aggregates. Keep an audit/rebuild path to regenerate aggregates from source rows.

Important: the contribution/rollup design is a proposal, not a proven implementation. Validate transaction limits, index uniqueness assumptions, OCC retries and every mutation path before making it authoritative. No financial read has been switched to a capped sum.

## Next implementation slice

The safest first slice is not a broad rewrite. Implement and test Cahier write idempotency first, because duplicate replay is a concrete integrity risk. Then add a read-only aggregate prototype for one operation family (journal sale/expense/debt), compare it with the existing exact scan on fixtures, and only after reconciliation design the paginated UI contract. No production deployment is authorized or planned.


## Idempotency implementation — first backend slice

Implemented on the isolated migration branch:

- Added the `cahierOperations` receipt table, indexed by authenticated actor + idempotency key and by source journal entry.
- `cahier.add` now requires an `idempotencyKey` (8–128 characters).
- The receipt stores the normalized payload fingerprint and the created journal entry ID.
- A retry with the same actor, key and payload returns the original entry ID with `duplicate: true`, without inserting another journal row or repeating stock deductions.
- Reusing a key with a different normalized payload throws `IDEMPOTENCY_KEY_REUSED`.
- Receipt creation and journal/stock writes are in the same Convex mutation transaction. The receipt remains if a user later deletes the journal entry, preventing a delayed retry from resurrecting that transaction.

### Required frontend contract — not yet integrated

The original Macaly frontend was inspected but was not modified, and its UI files are not yet present in the isolated `horizon-v4/` app tree. Before this backend can be called by the migrated UI:

1. Generate a stable UUID before an online submission and reuse that exact key if the request times out.
2. Persist the same key with an offline queue item; replay must pass it as `idempotencyKey`.
3. Change the queue sender signature to pass both payload and idempotency key.
4. Remove a queued item only after a confirmed `ok: true` response. A rejected or ambiguous result must remain visible for retry/review; never silently discard it.
5. For offline queue records created before this change, create and persist one key per queue item before the first replay.

The inspected original queue currently passes only the payload to `cahier.add`, and drops rejected results from localStorage. Therefore end-to-end duplicate protection is **not yet complete** until the frontend contract above is integrated. The backend now enforces a key, so the old frontend contract will not compile against the new generated API and must be updated as part of the frontend port.

### Validation status for this slice

- GitHub source edits committed to the isolated branch.
- Static source review only; no TypeScript compile, Convex codegen, unit test, concurrency test, or development deployment has been run.
- No live app preview is implied by these commits. Vercel preview availability must be checked separately.
- No Macaly Live, Neon, Vercel Production, or Convex Production resource was modified.
