# HORIZON Workspace — V4.0

## Structure
- `frontend/`: all browser-facing HTML, CSS, JavaScript modules, PWA files and public images.
- `backend/`: Firebase security rules and backend configuration assets.

## Cloudflare Workers
The root `wrangler.jsonc` serves `frontend/` at the domain root. The public URLs remain `/index.html`, `/manifest.webmanifest`, and `/service-worker.js`; do not expose a `/frontend/` URL prefix.

Deploy from the repository root with `npx wrangler deploy`. The Worker name remains `charles`.

## Firebase
The root `firebase.json` points to `backend/firestore.rules` and `backend/storage.rules`. The project alias remains in root `.firebaserc`.

Deploy rules from the repository root with `firebase deploy --only firestore:rules,storage`.

## Safeguards
- Keep private service-account keys and server secrets out of `frontend/`.
- Firebase browser configuration is client-side configuration, not a service-account secret.
- This folder split does not replace Firebase Authentication/Firestore or the existing Cloudinary/Cloudflare media flow.
- Production `main` stays unchanged until preview and device tests pass.
