# HORIZON V4 — Macaly source inventory

Audit date: 2026-11-13  
Source project: Macaly `HORIZON Workspace V4`  
Target branch: `migration/horizon-v4-vercel`  
Target folder: `horizon-v4/`

## Source inventory

The Macaly file listing returned 179 paths across two pages.

- 164 text/source/configuration paths were identified under `src/`, `convex/`, `public/`, and the project root, excluding the package lock.
- 8 binary PWA icon files were identified under `public/` (PNG/ICO).
- 1 `package-lock.json` was identified.
- 1 `.env.local` and 3 generated user downloads were excluded from migration.
- No environment-variable values, credentials, tokens, or user-generated exports were copied into Git.

The source inventory includes all principal route files:
`/`, `/account`, `/admin`, `/ai`, `/also`, `/auth`, Google auth callback/popup, `/cahier`, `/checkout`, `/connect`, `/media`, `/messages`, `/notifications`, `/premium`, and `/pro`.

## Source architecture observed

- React 19 + TypeScript
- TanStack Start + Vite + Nitro
- Convex + Convex Auth
- Tailwind CSS v4
- PWA manifest, service worker, update/recovery logic
- Vitest tests and TypeScript configuration

## Transfer and comparison status

A path-level comparison against the migration branch found 159 of the 164 text/source paths present under `horizon-v4/`. The five absent paths are the Macaly-generated Convex files under `convex/_generated/`; these are intentionally not copied over the branch's backend setup and should be generated for the new Preview deployment.

The following original project files have been imported into `horizon-v4/`: package and TypeScript/Vite configuration, route tree, all main route pages, shared app shell/providers, core account/i18n/PWA helpers, UI components, styles, SVG branding, manifest and service worker.

The eight PNG/ICO PWA icons and the original `package-lock.json` have not yet been transferred. Macaly's file reader does not expose binary file bytes, so the icons must be retrieved through a binary-capable export route before claiming an exact asset copy. The npm lockfile can be regenerated after dependency review, but that will not be byte-identical to Macaly's lockfile.

## Existing Convex backend — preserve, do not overwrite

The migration branch already contains a modified Convex backend. A comparison of 30 non-generated Convex source files found 7 identical files and 23 files that differ from Macaly's originals. The branch versions include existing migration/backend work, so they have deliberately been preserved. Do not replace them wholesale with Macaly's copies.

Five generated Convex files from Macaly are absent in the target and should be generated only after the separate Preview Convex deployment is provisioned.

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

## Validation status

The source inventory and most text-file path transfer are complete, but the transfer is **not yet complete** because the eight binary icons and package lock remain outstanding. No independent Vercel build has been run and no Vercel deployment has been created. Do not treat this branch as a deployable release yet.

## Next technical steps

1. Retrieve and transfer the eight binary PWA icons without altering their bytes.
2. Review the branch's 23 modified Convex files against the Macaly originals and retain the migration improvements.
3. Review Macaly-only dependencies and replace their integration points without exposing secrets.
4. Provision a separate non-production Convex deployment for Preview; never point Preview at Macaly Live.
5. Generate the Preview Convex types, install dependencies, and run a clean build on the isolated branch.
6. Create a Vercel Preview deployment only after the source tree is complete and the Preview environment is confirmed not to target Macaly Live Convex.


## New findings — 2026-11-13

### Vercel build failure diagnosis

The latest failed Vercel deployment was inspected. Its build cloned branch `migration/horizon-v4-vercel`, then ran `npm install` at repository root. It failed with `ENOENT: Could not read package.json: /vercel/path0/package.json`. This is a root-directory mismatch: the migrated app's package.json is in `horizon-v4/`, while the Vercel project is currently building from repository root. No project settings were changed. Do not change the shared Vercel rootDirectory globally without first checking the production branch, because that could break existing production deployments. A branch-scoped build configuration or an isolated Preview project is safer.

### Current access limitation

The Macaly workspace has reached its 100/100 monthly Cloud action allowance (reset shown as 2026-12-01 UTC). Further Macaly file reads and shell inspection are currently blocked. As a result, the original 8 PNG/ICO bytes and the full 10,399-line package-lock cannot be retrieved in this session. The Macaly media library listing contains only one unrelated WAV asset; it does not contain the eight PWA icons. Do not recreate or substitute those icons while claiming an exact copy.

### Backend-difference review

The 23 differing Convex files remain a review item. The branch's versions must be retained unless a file-by-file semantic review proves a specific safe reconciliation. The Macaly read limit currently prevents completing that side-by-side review. No backend source was overwritten in this update.

### Revised readiness

Still not ready to compile or deploy. The known Vercel root cause is identified, but the original lockfile and icon assets remain unavailable, the 23 backend differences have not been semantically reviewed, Macaly-specific integrations have not yet been decoupled, and no separate Preview Convex deployment has been provisioned. No Vercel settings, deployments, production branch, or Macaly project were changed by this inspection.
