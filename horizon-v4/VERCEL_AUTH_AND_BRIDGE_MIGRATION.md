# HORIZON V4 — Macaly bridge and Google authentication migration

Scope: migration branch only. The Macaly project, its Live Convex deployment, GitHub `main`, and production Vercel configuration must remain untouched.

## 1. Macaly bridge

The Vercel frontend no longer imports or renders `@macaly/bridge`. Its runtime dependency has been removed from this app's `package.json`. This removes the frontend wrapper from the migration build without changing the original Macaly project.

This is only the frontend bridge decoupling. Backend Macaly services are still present and must be replaced independently before the app can be considered Macaly-free:

- `convex/macaly.ts` — authenticated calls to Macaly client-app endpoints.
- `convex/MacalyGoogle.ts` and `convex/googleAuth.ts` — Google grants, popup completion and identity redemption.
- `convex/appFiles.ts` — Macaly-managed file grants/storage bridge.
- Assistant/AI actions — inspect their Macaly-managed model and usage dependencies before selecting a replacement.
- `@macaly/static-tagger` in `vite.config.ts` is a development-only Visual Edits tool; it remains conditional on `DEV_BUILD`. Remove it only in a separate cleanup after confirming Macaly authoring is no longer needed.

Do not delete backend Macaly helpers until each caller has a tested replacement. Keep this migration branch isolated.

## 2. Independent Google OAuth — implementation plan

The app currently uses a custom `macaly-google` Convex Credentials provider. The browser asks Macaly to create an authorization URL, polls Macaly for popup completion, then redeems a one-time grant through Macaly. Merely renaming the provider would not make it independent.

The intended replacement is the native Google OAuth provider supported by the installed Convex Auth v1 line (`@convex-dev/auth ^0.0.94`), configured on the independent Preview Convex deployment:

1. Register a Google OAuth Web application owned by the HORIZON project.
2. Set the OAuth redirect URI to the callback route exposed by the exact installed Convex Auth v1 version on the Preview deployment's `CONVEX_SITE_URL`. Verify the callback path against the installed package/docs before registering it; do not assume the Convex Auth v2 route.
3. Store the Google client ID and client secret as backend-only Convex environment variables (for example `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`); never expose the secret through a `VITE_` variable.
4. Add the official Google provider to `convex/auth.ts`, preserving the existing OTP, HORIZON password and phone providers.
5. Replace the Macaly-specific browser grant/popup flow with the standard Convex Auth `signIn("google")` flow and an allowlisted Preview/production redirect policy.
6. Preserve account ownership rules. Review how native OAuth accounts are associated with existing OTP/password users before enabling automatic account linking. Never link solely on an unverified email claim, overwrite an existing canonical profile, or remove a user's last recovery method.
7. Remove `MacalyGoogle`, the Macaly-specific callback/popup grant protocol, and now-unused Google handoff code only after the new flow passes sign-in, sign-out, existing-account, account-linking, cancellation, and session-revocation tests.

The existing `googleSubject` and account-security functions need a deliberate compatibility decision during this change. Do not silently discard those protections.

## 3. PWA icon recovery

The manifest and service worker refer to PNG assets that are absent from this migration branch: `favicon-32.png`, `favicon-16.png`, `icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png`, and `apple-touch-icon.png` (plus any original ICO variant from the source inventory).

Preferred recovery: copy the exact original binary assets from the Macaly project's public directory or its original source archive. Do not redraw, resize, or substitute them while claiming they are originals. The Macaly workspace file/media access was unavailable during this pass, so these binaries have not yet been recovered. After recovery, verify every manifest and service-worker URL returns HTTP 200 and check dimensions and maskable safe zones.

## 4. Validation gates

Before calling the migration ready:
- install dependencies and create a reproducible lockfile;
- run TypeScript checks, Vitest, and a production build;
- deploy only to an isolated Vercel Preview and independent Convex Preview deployment;
- test OAuth only with test accounts and verify callback origin restrictions;
- test PWA manifest, icons, service-worker install/update/offline behavior;
- confirm no runtime request still targets Macaly endpoints;
- leave GitHub `main`, the Macaly app/Live database, and production Vercel settings untouched.
