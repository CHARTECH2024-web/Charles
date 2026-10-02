# Portfolio V3.1 — Bisimwa Mushimanja Charles

Évolution du **Portfolio Privé V3** existant (`C.html`). L'architecture reste
**un seul dossier racine, sans sous-dossier**, avec plusieurs fichiers HTML/CSS/JS,
une vraie authentification Google (Firebase) et un stockage distant (Firebase
Storage + Firestore) pour que les photos, vidéos et documents publiés depuis un
téléphone soient visibles depuis n'importe quel autre appareil.

---

## 1. Ce qui a été conservé du V3

- Identité visuelle : orange `#ff6b00` / noir / blanc, thème clair-sombre, cartes,
  navbar avec soulignement animé, hero avec grille en fond.
- Le chatbot local **Charles AI** (réponses sur le parcours, Blacksmith, Ecochar,
  Cahier de Compte, calculs simples), avec streaming mot-par-mot.
- Les sections : Accueil, À propos, Compétences, Projets (avec recherche),
  Médias (avec filtres Photos/Vidéos), Documents, Contact.
- Le comportement responsive (drawer mobile, hamburger).

## 2. Ce qui a changé

- Chaque section est maintenant sa **propre page HTML** (plus une SPA à sections cachées).
- Le CSS et le JS sont **séparés en plusieurs fichiers**, tous à la racine.
- L'ancien panneau admin "mot de passe en dur + IndexedDB local" a été **remplacé**
  par un vrai espace privé (`admin-*.html`) protégé par **Firebase Authentication
  (Google)**, avec stockage des fichiers sur **Firebase Storage** et des métadonnées
  sur **Firestore**. Les photos/vidéos/documents publiés sont donc visibles depuis
  n'importe quel appareil, immédiatement, sans dépendre du navigateur.
- **Aucun bouton, lien ou mention "Admin"** n'apparaît sur les pages publiques.

## 3. Arborescence (dossier unique, aucun sous-dossier)

```
index.html            about.html          skills.html
projects.html          media.html          documents.html
contact.html
admin-login.html       admin-dashboard.html
admin-media.html        admin-documents.html   admin-settings.html

style.css   responsive.css   admin.css   animations.css

main.js   auth.js   media.js   documents.js   admin.js   firebase-config.js

README.md
```

## 4. Configuration Firebase (déjà en place)

Projet Firebase : `portfolio-charles-v31-98fc9`
Fichier `firebase-config.js` : contient la config Web (non secrète — voir §7).
Compte administrateur autorisé : **chartech031@gmail.com** (constante `ADMIN_EMAIL`
dans `firebase-config.js`). Pour changer d'administrateur, modifiez cette
constante **et** les règles Firestore/Storage ci-dessous (même adresse partout).

### Services à activer dans la console Firebase (si pas déjà fait)
1. **Authentication → Sign-in method → Google** : activé.
2. **Firestore Database** : créée (mode production).
3. **Storage** : créée (nécessite le plan Blaze, avec un quota gratuit généreux).

### Règles Firestore à coller (Firestore → Règles)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /media/{mediaId} {
      allow read: if resource.data.visibility == 'public'
                  || (request.auth != null && request.auth.token.email == 'chartech031@gmail.com');
      allow create, update, delete: if request.auth != null
                  && request.auth.token.email == 'chartech031@gmail.com';
    }
    match /documents/{docId} {
      allow read: if resource.data.visibility == 'public'
                  || (request.auth != null && request.auth.token.email == 'chartech031@gmail.com');
      allow create, update, delete: if request.auth != null
                  && request.auth.token.email == 'chartech031@gmail.com';
    }
  }
}
```

### Règles Storage à coller (Storage → Règles)
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /media/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.token.email == 'chartech031@gmail.com'
                   && request.resource.size < 300 * 1024 * 1024;
    }
    match /documents/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.token.email == 'chartech031@gmail.com'
                   && request.resource.size < 50 * 1024 * 1024;
    }
  }
}
```

⚠️ **Limite connue** : ces règles Storage autorisent la lecture publique du
*fichier brut* si quelqu'un connaît son URL directe (Storage ne peut pas lire le
champ `visibility` de Firestore sans configuration avancée). Le bouton "Rendre
privé" retire bien l'élément de la galerie publique et des requêtes Firestore,
mais ne rend pas le fichier totalement introuvable pour quelqu'un qui aurait
déjà le lien exact. Pour un besoin de confidentialité stricte au niveau fichier,
il faudrait ajouter une Cloud Function ou des URLs signées à durée limitée —
non nécessaire pour un usage portfolio classique.

## 5. Installation / déploiement (GitHub Pages)

1. Placez tous les fichiers de ce projet **directement à la racine** de votre
   dépôt `CHARTECH2024-web/Charles` (remplacez l'ancien `C.html` si besoin, ou
   gardez-le de côté comme archive).
2. Dans les paramètres du dépôt GitHub → **Pages** → Source : branche `main`,
   dossier `/ (root)`.
3. Le site est servi à `https://chartech2024-web.github.io/Charles/` —
   `index.html` devient la page d'accueil automatiquement.
4. Dans la console Firebase → **Authentication → Settings → Authorized domains**,
   ajoutez `chartech2024-web.github.io` (obligatoire, sinon Google Login refuse
   la popup depuis ce domaine).

## 6. Publier une vidéo depuis le téléphone

1. Ouvrez `https://chartech2024-web.github.io/Charles/admin-login.html`
   (gardez ce lien dans vos favoris — il n'est accessible depuis aucun menu public).
2. Connectez-vous avec **chartech031@gmail.com**.
3. Allez dans **Media**, choisissez "Vidéo", sélectionnez le fichier, remplissez
   titre/description, visibilité, puis **PUBLISH VIDEO / PHOTO**.
4. La barre de progression affiche l'envoi vers Firebase Storage. Une fois
   terminé : "Published successfully".
5. Ouvrez `media.html` depuis n'importe quel autre téléphone, ordinateur ou
   navigateur : la vidéo apparaît, car elle est lue depuis Firestore/Storage,
   pas depuis le stockage local d'un appareil.

## 7. Gestion des documents

Même principe depuis `admin-documents.html` : PDF, DOC/DOCX, PPT/PPTX, TXT, ODT
(50 Mo max). Les visiteurs peuvent uniquement consulter/télécharger les documents
marqués "public".

## 8. Sécurité mise en place

- Authentification réelle **Firebase Auth + Google**, pas de mot de passe en dur.
- Un seul compte autorisé (`ADMIN_EMAIL`), vérifié côté client **et** dans les
  règles Firestore/Storage (donc même un appel API direct sans passer par le site
  serait refusé pour tout autre compte).
- Les pages `admin-*.html` redirigent automatiquement vers `admin-login.html`
  si l'utilisateur n'est pas connecté ou n'est pas l'administrateur.
- Validation du **type MIME réel** (pas seulement l'extension) et de la taille
  maximale à l'upload, côté client (`media.js` / `documents.js`) et côté règles
  Storage.
- Le fichier `firebase-config.js` est public par design (c'est le fonctionnement
  normal de Firebase Web) : ne jamais y mettre de mot de passe ou de clé secrète
  de service. La vraie protection vient des règles Firestore/Storage ci-dessus.
- Aucun onglet, lien ou mention "Admin" n'apparaît sur les pages publiques
  (`index.html`, `about.html`, `skills.html`, `projects.html`, `media.html`,
  `documents.html`, `contact.html` — vérifiez leur code source si besoin).

## 9. Notes

- `logo.png` / `favicon.png` ne sont pas fournis (aucun visuel source disponible) ;
  un favicon ⚡ en SVG intégré est utilisé par défaut. Ajoutez vos propres
  `logo.png` / `favicon.png` à la racine et mettez à jour les balises `<link>`
  si vous voulez les remplacer.
- Le chatbot Charles AI reste 100% local (aucune donnée envoyée à un serveur).
- Pour ajuster les limites de taille de fichier, modifiez `MAX_SIZE_BYTES` dans
  `media.js` / `documents.js` **et** la valeur correspondante dans les règles Storage.


## V3.2 — architecture sans carte bancaire

Firebase **Cloud Storage n'est pas utilisé** dans cette version. Depuis le 3 février 2026, Cloud Storage for Firebase nécessite le forfait Blaze associé à un compte Cloud Billing. Le site conserve donc Firebase Authentication + Cloud Firestore sur le projet actuel et utilise **Cloudinary Free** pour les photos, vidéos et documents.

### Médias et documents
1. Créer un compte Cloudinary Free.
2. Créer un **unsigned upload preset** limité aux formats nécessaires.
3. Copier le Cloud Name et le nom du preset dans `cloudinary-config.js`.
4. Les fichiers sont envoyés directement à Cloudinary depuis l'espace admin.
5. Firestore conserve uniquement les métadonnées et l'URL de livraison.
6. La suppression depuis le site retire la publication de Firestore; la suppression physique de l'asset Cloudinary se fait depuis Cloudinary, car la clé API secrète ne doit jamais être placée dans le navigateur.

Le plan Free Cloudinary ne nécessite pas de carte bancaire et inclut un quota mensuel gratuit. Les limites actuelles du plan Free sont notamment 10 MB par image, 100 MB par vidéo et 10 MB par fichier raw/document.

### Communauté
La page Community est un chat général temps réel basé sur Cloud Firestore :
- connexion Google obligatoire pour participer ;
- messages synchronisés entre appareils ;
- avatar et nom Google ;
- suppression de ses propres messages ;
- modération administrateur ;
- limite de 1000 caractères par message.

### Thèmes
Le site propose quatre thèmes : **Orange**, **Vert**, **Blanc** et **Bleu de nuit**.
