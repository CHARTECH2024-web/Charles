# HORIZON V4 — Migration plan (audit baseline)

Date: 2026-11-13

## Safety boundaries

- Production Vercel project: `horizon-pwa` / `horizon-pwa.vercel.app`.
- Do not deploy to production or change its aliases during migration.
- Do not run mutating tests against the Macaly Convex deployment: the Macaly project reports both its sandbox and publish database as the same `Live` deployment (`formal-wildebeest-538`).
- Keep Neon unchanged and available as the legacy source of truth until the new Preview passes migration checks.
- Never copy or commit environment-variable values, tokens, password plaintext, or payment secrets.

## Architecture observed

### Macaly HORIZON Workspace V4

- React 19 + TypeScript + TanStack Start/Vite.
- Convex backend with Convex Auth.
- Convex schema has 29 application tables, in addition to Convex Auth tables.
- Main backend domains: profiles/auth, posts/likes/comments, connections, messages, notifications, Cahier, shops/members, stock, purchases, credits/payments, cash closings, targets, premium/mobile money, assistant history/memory, uploads.
- Main frontend routes: home, auth, account, connect, messages, notifications, AI, Cahier, media, admin, premium, pro, checkout.
- Main Macaly-specific dependencies to replace: Google OAuth grant/redeem endpoints, email OTP delivery endpoint, LLM usage endpoint, App Files/R2 bridge.
- Phone login currently uses phone + password; it does not perform SMS OTP verification.
- Media library route is an empty state.
- AI system prompt and some labels still use the legacy name CHARLES; target product assistant name is Sun.
- Cahier includes sales/expenses/debts, products/stock, contacts, purchases, shops and roles, reports/exports, targets, cash closing and offline queue.
- Existing automated tests are sparse; the generic page test is only a placeholder.

### Current Vercel deployment

- React 18.3 + Vite.
- The deployed source tree has a small frontend and API routes for login, registration, logout, current user and username availability.
- Backend uses Neon PostgreSQL and custom cookie sessions.
- The included Neon bootstrap migration creates only `hz_users`, `hz_sessions` and `hz_login_attempts`; it does not define the Macaly feature domains.
- The latest inspected deployment has empty Git metadata even though the Vercel project is linked to the GitHub repository. Treat the deployed source and Git branch as separate until reconciled.
- The deployment file API returns truncated content for some larger source files; full source reconciliation is still required before claiming a complete Vercel code audit.

## Identity reconciliation: Macaly Convex Live ↔ Neon

### What the schemas establish

- Neon `hz_users` contains a legacy UUID, username, display name, birth date, bio, username-change timestamp, creation timestamp and scrypt password hash. The inspected bootstrap does not define email or phone fields.
- Macaly stores private account identifiers in Convex `users` (email, phone, Google subject and provider-auth relationships) and the public HORIZON identity in `profiles` (unique normalized `handle`, display name, bio, age-confirmation timestamp and `userId`).
- Therefore the only common stable-looking identity field established by the inspected schemas is the HORIZON username/handle. It is a candidate matching key, not proof that two rows are the same person.
- Display name is not a safe identity key. It can be shared or changed.
- Do not merge accounts using display name, approximate spelling, or a guessed email/phone relationship.

### Required matching rules

1. Normalize both Neon `username` and Macaly `profiles.handle`: trim whitespace, lowercase, remove one trailing `.HZ` suffix, and normalize Unicode only if the source format requires it. Preserve original values in the audit report.
2. Classify exact normalized-handle matches as **candidate matches**. Do not automatically merge or delete either account.
3. Classify one Neon handle matching multiple Convex profiles, or one Convex handle matching multiple Neon rows, as **conflicts** requiring manual review.
4. Classify unmatched Neon rows as **Neon-only** and unmatched Macaly profiles as **Convex-only**.
5. Where both systems later provide a verified identical email or E.164 phone, that can strengthen a candidate match. Never infer verification from an unverified provider claim.
6. For every approved match, retain both source IDs in a dedicated identity-mapping record (source system + source ID → canonical Convex user ID). Keep a unique constraint/index per source-system/source-ID pair. Do not reuse a Neon UUID as a Convex document ID.
7. Preserve all Convex-auth account/provider relationships and all Macaly-owned feature data. Repointing a duplicate identity must also preserve foreign-key relationships to posts, messages, Cahier, shops, credits, notifications and assistant history. No account merge is safe until a complete reference map exists.
8. Keep ambiguous and unmatched accounts separate pending verified account linking or recovery. Never discard a source row just because a candidate match exists.

### Actual comparison status — BLOCKED, NOT YET EXECUTED

- Macaly project metadata confirms the selected sandbox and published database both target the same Live Convex deployment. No test writes or schema changes were made there.
- The available Macaly connector exposes project/schema reads and database imports, but no read-only Convex table query or database export action. The existing admin query returns aggregate counts and its member listing requires an authenticated administrator session; neither gives an authorized cross-system export through the available connector.
- The available Vercel connector exposes deployment files and environment-variable metadata, but no SQL query interface for Neon. No decrypted database secret was retrieved or exposed.
- Consequently, no row-level comparison, overlap count, duplicate count, or identity merge has been performed. Claiming that accounts have been reconciled would be false.
- To execute the comparison safely, obtain two read-only exports: (A) Neon `hz_users` with only legacy UUID, username, display name and timestamps (exclude password hashes and birth dates from the matching file); (B) Macaly Convex `users` + `profiles` with Convex user ID, profile handle/display name and only the verified email/phone fields needed for matching. Keep exports private and temporary; do not commit them to GitHub or upload them to a public media library.
- Run a local/offline reconciliation report that outputs only aggregate counts and masked candidate identifiers. Keep the raw export files out of chat and delete temporary copies after the report is validated.

## Data migration design: Neon → Convex

1. Keep Neon read-only as the migration source during the cutover window; do not drop or rewrite its tables.
2. Export a consistent snapshot of `hz_users` with legacy UUID, username, display name, birth date, bio, username-change timestamp, creation timestamp and password hash. Store it securely; exclude password hashes from the identity-matching report.
3. Import users into a dedicated Preview Convex deployment using an idempotent migration job and a stable legacy-ID mapping. Add a legacy source ID field/index or a dedicated migration mapping table; do not assume Neon UUIDs can be used as Convex document IDs.
4. Map username → normalized profile handle, display name → profile display name, bio → profile bio. Validate the age requirement from birth date and retain only the minimum age-confirmation evidence needed by the product; do not copy full birth dates unless required.
5. Password hashes in Neon use scrypt (`s1$...`); Macaly's current password credential helper uses PBKDF2. Do not copy scrypt hashes into PBKDF2 fields. Implement and test a server-side legacy-password verification/rehash-on-first-login bridge, or use a verified account-recovery flow if that cannot be done safely. Never export plaintext passwords.
6. Existing Neon sessions cannot be imported as Convex Auth sessions. Expire them and require a fresh sign-in after the migration notice.
7. `hz_login_attempts` is transient rate-limit data; do not migrate it.
8. The inspected Neon bootstrap has no Cahier, posts, messages, media, or stock tables. Before cutover, inspect the full Vercel frontend for device-local data and provide an export/import path if any user records exist outside Neon.
9. Import in bounded batches; record counts and a migration checkpoint; make retries safe. Verify row counts, duplicate handles, age eligibility, account-to-profile mapping, password checks and representative records before enabling the Preview.
10. Only after Preview validation should a planned cutover route new logins to Convex. Keep a rollback window with Neon intact.

## Target architecture

- Vercel Preview first; production remains untouched.
- React/Vite frontend can be retained initially to reduce unnecessary framework churn.
- Convex is the target application backend for new modules and real-time features.
- Keep authentication migration separate from feature migration. Do not remove Neon auth until the legacy-account bridge and recovery tests pass.
- Replace Macaly-only external services with independent providers/configuration for Google OAuth, email OTP, Sun AI and file storage.
- Store file bytes in object storage (not in Convex document rows); store ownership, metadata and opaque file references in Convex.
- Use a separate non-production Convex deployment for Preview. Never point Preview at the Macaly Live database.

## Delivery sequence

1. Finish source reconciliation and audit (Macaly + deployed Vercel source + GitHub branch).
2. Complete schema mapping and dry-run migration tooling.
3. Restore the current Vercel app source on the migration branch.
4. Add Convex infrastructure to Preview and validate connectivity.
5. Migrate authentication/profile compatibility.
6. Implement and test Cahier first, then Connect/messages/notifications, feed, Sun AI, admin and Premium.
7. Test every module on Preview, including authorization, mobile layout, offline behavior, exports and migration recovery.
8. Production cutover only after explicit validation; preserve rollback.

## Current state

- Branch: `migration/horizon-v4-vercel` (based on repository `main`).
- Added an explicit identity reconciliation protocol and recorded why the live row-level comparison is blocked.
- No account rows were merged, created or deleted.
- No Macaly Live or Neon data was changed.
- No application code was changed.
- No database was provisioned or migrated.
- No Vercel deployment was created or promoted.


## Décision de données confirmée par l'utilisateur — 2026-11-13

- L'utilisateur confirme que tous les comptes et toutes les données de l'ancien Convex Live de Macaly étaient ses propres comptes de test. Aucun compte tiers important ni donnée de production n'y est conservé.
- L'utilisateur autorise explicitement un nouveau déploiement Convex vierge. Les anciens comptes et données applicatives Macaly (profils, publications, messages, Cahier, boutiques, stock, etc.) sont exclus de la migration.
- Cette autorisation ne signifie pas qu'il faut supprimer immédiatement l'ancien déploiement Live. Il restera intact comme référence/secours temporaire jusqu'à validation du nouveau Preview. Toute suppression définitive demandera une confirmation distincte.
- Neon est une source séparée et reste préservé. Ses comptes existants doivent être conservés et migrés/compatibilisés avec le nouveau Convex. La décision d'abandon des comptes Macaly ne s'applique pas aux comptes Neon.
- La réconciliation ligne par ligne Macaly ↔ Neon n'est donc plus nécessaire pour les données Macaly abandonnées. Il faut toutefois conserver les UUID Neon via une correspondance d'identifiant legacy et vérifier l'unicité des handles avant import.
- À ce stade, aucune donnée Live n'a été supprimée ou modifiée et aucun nouveau déploiement Convex n'a encore été créé.
