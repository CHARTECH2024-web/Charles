# NURU V4.0 — Platform Foundation

This branch starts the transition from the Charles personal portfolio to **NURU**, a technology platform concept.

## What changed in this foundation
- Rebuilt the homepage around NURU's proposed technology domains: Digital, AI, Electronics, EcoTech and Lab.
- Introduced a responsive yellow/black/white visual identity inspired by the NURU mark.
- Rebranded the shared navigation, footer and assistant label to NURU.
- Preserved the existing HTML/CSS/JavaScript structure and kept existing service links to projects, community, media, contact and Cahier de Compte.
- Kept this work on the separate `nuru-v4-foundation` branch. The production `main` branch has not been changed.

## Existing services to preserve and audit
- Firebase Google Authentication
- Firestore-backed community/messaging
- Public media and document pages
- Cahier de Compte
- Admin dashboard and upload workflows
- Theme/language controls and visitor tracking

## Important implementation note
The homepage introduces the proposed NURU service architecture and does not claim every proposed division is already operational. Existing service pages must be reviewed and rebranded incrementally. Firebase rules, storage rules, authentication, multi-user business data isolation and admin permissions must be tested before deployment.

## Next phase
1. Audit all existing service and admin pages for legacy branding and regressions.
2. Validate the new homepage and navigation on small mobile screens and desktop.
3. Review Firestore and Storage rules without replacing working production rules blindly.
4. Build a release checklist and open a pull request only after the existing features are verified.
