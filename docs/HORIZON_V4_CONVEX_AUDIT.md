# HORIZON Workspace V4 — Audit technique Convex (étape 1)

Date : 2026-11-13  
Source de référence : projet Macaly `HORIZON Workspace V4` (`vu6z2k4cadxfs9hig105hjs1`)  
Branche de travail : `migration/horizon-v4-vercel`

## Périmètre vérifié

Lecture du schéma original `convex/schema.ts` (420 lignes) et audit statique des usages d'index et des chaînes de requêtes dans les modules backend disponibles :

- `profiles.ts`, `posts.ts`, `connections.ts`, `messages.ts`, `notifications.ts`
- `cahier.ts`, `cahier_plus.ts`, `admin.ts`, `billing.ts`, `premium.ts`
- `assistant.ts`, `appFiles.ts`, `uploads.ts`, `stripe.ts`
- `phoneAuth.ts`, `passwords.ts`, `googleAuth.ts`, `auth.ts`, `authUsers.ts`, `http.ts`, `macaly.ts`
- fournisseurs Convex Auth : `HorizonPassword.ts`, `HorizonPhone.ts`, `MacalyGoogle.ts`, `ResendOTP.ts`

Il s'agit d'un audit statique du code source. Aucun test d'exécution, accès aux lignes de la base Live, déploiement ou test de production n'a été effectué.

## Schéma original — inventaire confirmé

Le schéma contient **29 tables applicatives**, en plus des tables fournies par Convex Auth :

1. `users`
2. `profiles`
3. `passwordCredentials`
4. `posts`
5. `postLikes`
6. `postComments`
7. `messages`
8. `cahierEntries`
9. `contacts`
10. `products`
11. `stockMoves`
12. `purchases`
13. `premiumSubscriptions`
14. `mobileMoneyRequests`
15. `paymentSettings`
16. `aiUsage`
17. `creditGrants`
18. `boosts`
19. `shops`
20. `shopMembers`
21. `credits`
22. `creditPayments`
23. `cahierTargets`
24. `notifications`
25. `connections`
26. `phoneCredentials`
27. `assistantMessages`
28. `assistantMemory`
29. `cashClosings`

Les références d'index applicatives rencontrées dans les modules examinés correspondent aux index déclarés dans le schéma. Les références telles que `authAccounts.userIdAndProvider`, `authVerificationCodes.accountId`, `authSessions.userId` et `authRefreshTokens.sessionId` appartiennent aux tables Convex Auth. Aucun index applicatif manifestement absent n'a été identifié dans ce premier rapprochement.

**Attention :** un index Convex n'impose pas l'unicité. Les appels `.unique()` sur des profils, credentials ou relations supposent qu'une seule ligne existe ; l'unicité doit être garantie par la logique transactionnelle et des contrôles appropriés, pas par le seul index.

## Problèmes de performance vérifiés

### Critiques à traiter avant montée en charge

- **Administration — `admin.ts` :** les statistiques globales chargent intégralement `profiles`, `posts`, `messages` et `cahierEntries` avec `.collect()`. Cette approche ne passera pas à l'échelle.
- **Messagerie — `messages.ts` et `assistant.ts` :** récupération non bornée des messages envoyés/reçus et des conversations par paire ; le tri ou le filtrage en mémoire ne remplace pas une pagination côté base.
- **Réseau — `connections.ts` et `posts.ts` :** récupération de toutes les demandes entrantes/sortantes pour filtrer ensuite les statuts ; le fil d'actualité charge aussi les relations et interactions de publications avec plusieurs `.collect()`.
- **Notifications — `notifications.ts` :** le compteur non lu et la suppression/récupération de notifications reposent sur un `.collect()` par utilisateur.
- **Cahier — `cahier.ts` et `cahier_plus.ts` :** plusieurs listes complètes par boutique/propriétaire sont chargées avant filtrage par dates, catégorie, statut ou période. Cela concerne notamment écritures, achats, produits, crédits, paiements, mouvements de stock et clôtures.
- **Premium et facturation — `premium.ts` et `billing.ts` :** certaines recherches récupèrent tous les enregistrements d'un utilisateur puis filtrent le mode, le statut ou la période.
- **Assistant — `assistant.ts` :** l'historique principal est limité dans certains chemins, mais les messages entrants/sortants et les paiements de crédits associés peuvent encore être lus sans borne.

### Index composés à étudier pour le schéma corrigé

Ces propositions doivent être confrontées aux fonctions complètes et aux tris réellement demandés avant de modifier le schéma :

- Messages : `[fromId, createdAt]`, `[toId, createdAt]`, `[fromId, toId, createdAt]`.
- Connexions : `[fromId, status, createdAt]`, `[toId, status, createdAt]`.
- Notifications : index adaptés à la lecture paginée par utilisateur et à la séparation lu/non lu ; pour les compteurs globaux, préférer des compteurs maintenus transactionnellement ou un composant d'agrégation.
- Publications/commentaires/likes : accès paginé par publication et ordre chronologique ; compter les réactions sans relire toutes les lignes à chaque affichage.
- Cahier : index chronologiques par propriétaire/boutique, pour `createdAt` et `occurredAt` selon la sémantique réelle des rapports.
- Achats, mouvements de stock, paiements de crédit et clôtures : index composés propriétaire/boutique + date/période.
- Premium : index utilisateur + mode (et éventuellement statut si les fonctions le requièrent).

Pour `cahierEntries`, `purchases` et les autres tables où `occurredAt` est facultatif et où les anciennes lignes retombent sur `createdAt`, la correction doit préserver exactement cette règle. Un simple index sur `occurredAt` ne suffit pas à couvrir les anciennes lignes ; une requête combinée/dédoublonnée ou un champ normalisé maintenu à l'écriture devra être évalué.

## Points de sécurité à approfondir

- Revoir chaque mutation de boutique pour confirmer qu'un vendeur ne peut pas modifier les données d'une autre boutique ou dépasser son rôle.
- Vérifier systématiquement les propriétaires des pièces jointes avant génération d'URL ou suppression.
- Revoir les endpoints HTTP/webhooks et leur vérification de signature.
- Vérifier les limites de tentatives, verrouillages et comparaisons temporelles des identifiants téléphone/mot de passe.
- Contrôler que les fonctions d'administration vérifient le rôle côté serveur, et pas seulement dans l'interface.
- Vérifier que les appels `.unique()` sont protégés contre les doublons et les courses concurrentes.

Ces contrôles de sécurité ne sont pas déclarés réussis à ce stade : ils nécessitent une revue fonction par fonction des chemins d'autorisation et des mutations.

## Dépendances Macaly à remplacer

- Google OAuth : le fournisseur actuel utilise le mécanisme Macaly de redeem de grant.
- Email OTP : le fournisseur actuel dépend d'un endpoint externe Macaly et de variables de configuration dédiées.
- Assistant Sun : l'action IA utilise les endpoints Macaly pour LLM/usage et transcription ; le prompt source contient encore l'ancien nom CHARLES à remplacer par **Sun**.
- Fichiers : `appFiles.ts` s'appuie sur le pont Macaly App Files/R2. Le module `uploads.ts` utilise aussi le stockage Convex natif ; les deux chemins doivent être réconciliés sans perdre les fichiers ni les autorisations.
- Paiements Stripe : module séparé, à conserver et auditer pour les webhooks, les statuts d'abonnement et les secrets.

Aucun fournisseur de remplacement n'est choisi dans ce rapport. Il faudra privilégier une solution compatible avec le budget et éviter de créer une dépendance payante sans accord explicite.

## État et décisions

- Le nombre de tables du plan de migration a été corrigé de 28 à 29.
- Le nouveau projet Convex Development reste vierge ; aucun code n'y a été poussé.
- Macaly Live, Neon, Convex Production et Vercel Production n'ont pas été modifiés.
- Aucune donnée n'a été exportée, importée, supprimée ou migrée.
- Aucun test de compilation ou test fonctionnel n'a été exécuté.

## Prochaine étape

Préparer un schéma corrigé complet à partir des 420 lignes originales, après validation des chemins de lecture/écriture et des règles d'accès. Ensuite, reconstruire d'abord les fonctions d'authentification et de profil, puis les modules Cahier et messagerie avec pagination, index composés et tests d'autorisation. Garder les fichiers dans une racine de projet V4 dédiée : la branche GitHub actuelle contient encore l'ancienne application HTML/CSS/JavaScript et ne constitue pas, à elle seule, le projet React 19 + TanStack Start de Macaly.
