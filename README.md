# NURU V4.0 — Platform Foundation

The `main` branch now contains the initial **NURU V4** platform foundation, with existing services being hardened incrementally.

## What changed in this foundation
- Rebuilt the homepage around NURU's proposed technology domains: Digital, AI, Electronics, EcoTech and Lab.
- Introduced a responsive yellow/black/white visual identity inspired by the NURU mark.
- Rebranded the shared navigation, footer and assistant label to NURU.
- Preserved the existing HTML/CSS/JavaScript structure and kept existing service links to projects, community, media, contact and Cahier de Compte.
- Applied the visual foundation to `main`; existing authentication, messaging, media and business features remain under staged verification.

## Existing services to preserve and audit
- Firebase Google Authentication
- Firestore-backed community/messaging
- Public media and document pages
- Cahier de Compte
- Admin dashboard and upload workflows
- Theme/language controls and visitor tracking

## Important implementation note
The homepage introduces the proposed NURU service architecture and does not claim every proposed division is already operational. Existing service pages and admin workflows still require end-to-end regression testing. Firestore rules have been tightened for business ownership, immutable financial history, linked stock movements and linked debt payments; these rules must be tested in the Firebase Emulator before being treated as production-validated.

## Next phase
1. Run Firebase Emulator tests for Firestore rules and business transactions.
2. Validate Google sign-in and the shared session on Android and desktop.
3. Regression-test private messaging, media/document publishing, admin controls and business records.
4. Review Storage/Cloudinary access and complete the release checklist.
