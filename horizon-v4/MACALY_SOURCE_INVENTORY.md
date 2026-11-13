# HORIZON V4 — Macaly source inventory

Audit date: 2026-11-13  
Source project: Macaly `HORIZON Workspace V4`  
Target branch: `migration/horizon-v4-vercel`  
Target folder: `horizon-v4/`

## Source inventory

The Macaly file listing returned 179 paths across two pages.

- 165 text/source/configuration paths were identified under `src/`, `convex/`, `public/`, and the project root.
- 8 binary PWA icon files were identified under `public/` (PNG/ICO).
- 1 `package-lock.json` was identified.
- 1 `.env.local` and 3 generated user downloads were excluded from migration.
- No environment-variable values, credentials, tokens, or user-generated exports are to be copied into Git.

The source inventory includes all principal route files:
`/`, `/account`, `/admin`, `/ai`, `/also`, `/auth`, Google auth callback/popup, `/cahier`, `/checkout`, `/connect`, `/media`, `/messages`, `/notifications`, `/premium`, and `/pro`.

## Source architecture observed

- React 19 + TypeScript
- TanStack Start + Vite + Nitro
- Convex + Convex Auth
- Tailwind CSS v4
- PWA manifest, service worker, update/recovery logic
- Vitest tests and TypeScript configuration

## Macaly-coupled code that must be handled before an independent Vercel build

1. `@macaly/bridge` and the `MacalyBridge` component in `src/routes/__root.tsx`.
2. `@macaly/static-tagger` and Macaly-only allowed development hosts in `vite.config.ts`.
3. `convex/macaly.ts` uses `MACALY_API_TOKEN`, `MACALY_BASE_URL`, and `MACALY_CHAT_ID` to call protected Macaly client-app endpoints.
4. `convex/MacalyGoogle.ts` redeems Google OAuth grants through a Macaly endpoint.
5. `convex/ResendOTP.ts` delegates email OTP delivery to an externally configured endpoint.
6. `convex/appFiles.ts` delegates file grants and file operations to the Macaly App Files/R2 bridge.
7. The assistant integration has a Macaly-managed LLM usage dependency that requires separate review.

These dependencies are recorded for migration planning; this inventory does not remove or replace them.

## Important environment and data safety

The Macaly project reports its preview/sandbox and publish database as the same Live Convex deployment. Do not run mutating tests or schema changes against that deployment. The new Vercel Preview must use a separate non-production Convex deployment and its own environment variables.

Do not copy `.env.local`, secrets, tokens, or the three generated Downloads files. Do not migrate Macaly Live user data as part of this source-code copy. Keep the legacy Neon source untouched.

## Reconciliation status

The original Macaly source tree has been inventoried. A complete source-file transfer, binary-asset transfer, and compile validation have **not** yet been completed. Do not treat this inventory as a successful frontend migration or a deployable release.

## Next technical steps

1. Transfer the complete text/source tree into `horizon-v4/`, excluding secrets and generated downloads.
2. Transfer the eight binary PWA icons without altering their bytes.
3. Compare every transferred path against the Macaly inventory and verify no source files are missing.
4. Remove or replace Macaly-only integrations only in a separately reviewed implementation step.
5. Install dependencies and run a clean build on the isolated branch.
6. Create a Vercel Preview deployment only after the source tree is complete and the Preview environment is confirmed not to target Macaly Live Convex.
