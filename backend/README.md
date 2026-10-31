# HORIZON backend configuration

- `firestore.rules`: Firestore access-control rules.
- `storage.rules`: Firebase Storage access-control rules.

The Firebase CLI loads these files through the root `firebase.json`. Never put service-account private keys, API secrets or server credentials in `frontend/`.
