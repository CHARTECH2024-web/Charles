# HORIZON Workspace V4 — Schéma corrigé et revue des accès

Date : 13 novembre 2026  
Source auditée : Macaly `HORIZON Workspace V4`  
Branche : `migration/horizon-v4-vercel`

## Livrable préparé

Fichier préparé dans une racine isolée de l'ancienne application :

`horizon-v4/convex/schema.ts`

- Les 29 tables applicatives d'origine sont présentes.
- Tous les champs, validateurs, types de références et relations du schéma source ont été conservés.
- Les tables Convex Auth sont toujours incluses via `...authTables`.
- 41 index applicatifs supplémentaires ont été ajoutés aux index existants, pour 94 déclarations d'index dans les 29 tables applicatives.
- Aucun champ obligatoire n'a été ajouté, aucun champ d'origine n'a été supprimé ou renommé.
- Les commentaires de l'assistant ont été actualisés de CHARLES vers SUN ; cela ne modifie pas le modèle de données.

Vérifications statiques après enregistrement GitHub :
- 29 déclarations de tables retrouvées.
- Les 29 noms de tables d'origine sont présents.
- 94 déclarations d'index retrouvées.
- Aucun champ `_creationTime` ajouté à un index.
- Le fichier relu depuis la branche après création.

**Limite importante :** ce schéma est un brouillon de migration préparé, pas un schéma validé par le compilateur Convex. Les fonctions existantes ne consomment pas encore les nouveaux index. Un schéma seul ne corrige donc pas les lectures non bornées : les modules devront être refactorisés pour utiliser les index, `take` ou `paginate`.

## Index ajoutés et intention

- Messages : index par expéditeur/destinataire et date, par paire et date, ainsi que destinataire + état de lecture + date.
- Connexions : index par expéditeur/destinataire + statut + date.
- Publications, commentaires et likes : index chronologiques par auteur ou publication.
- Cahier et achats : index propriétaire/boutique + date de création ou date commerciale, en conservant les deux champs.
- Crédits et clôtures : index par propriétaire/boutique + échéance ou jour.
- Boutique : index composé boutique + membre pour résoudre directement l'appartenance.
- Produits : index propriétaire/boutique + code-barres.
- Mouvements de stock et paiements de crédit : index chronologiques par produit ou crédit.
- Notifications : index utilisateur + état de lecture + date.
- Abonnements : index utilisateur + mode et statut.
- Historique Sun : index propriétaire + date.

Les champs facultatifs `shopId`, `occurredAt` et `readAt` restent facultatifs. Les futures requêtes devront explicitement traiter les valeurs absentes. En particulier, les écritures et achats historiques sans `occurredAt` doivent continuer à retomber sur `createdAt` : deux index distincts sont prévus, mais la logique de fusion/tri des résultats doit être implémentée dans les fonctions.

## Revue des accès — constats statiques

### Contrôles présents dans les modules examinés

- Les statistiques et la liste des membres d'administration appellent `requireAdmin`.
- Les mutations de connexion vérifient le destinataire ou le propriétaire de la demande.
- Les notifications ne peuvent être marquées comme lues que par leur propriétaire.
- Les commentaires et publications sont supprimés après vérification de l'auteur.
- Les opérations de gestion des membres et de suppression d'une boutique exigent le rôle propriétaire.
- L'historique Sun est filtré par `ownerId`, et la fonction interne de lecture de pièce jointe vérifie le propriétaire du message.

### Risques ou incohérences à corriger avant intégration

1. **Rôles des boutiques trop peu différenciés.** `scopeFor` / `ledgerScope` autorisent tout membre reconnu (manager ou seller) à accéder à plusieurs opérations du Cahier. Certaines mutations permettent ainsi à un vendeur de supprimer des achats, supprimer des produits, ajuster le stock ou modifier/supprimer des écritures. Le code vérifie l'appartenance, mais ne définit pas une matrice claire par rôle. Il faut décider et appliquer les permissions owner / manager / seller sur chaque opération.
2. **Permissions incohérentes sur les produits et contacts.** `adjustStock` et `removeProduct` acceptent les membres de boutique via `scopeFor`, tandis que `setBarcode` vérifie seulement `product.ownerId === userId`. `removeContact` vérifie aussi le propriétaire direct, ce qui peut bloquer les membres légitimes d'une boutique. Ces règles doivent être harmonisées selon la matrice de rôles.
3. **Propriété des fichiers Convex non vérifiée de façon démontrée.** `messages.send` et `posts.create` vérifient que le fichier existe, mais ne démontrent pas que l'utilisateur qui l'attache l'a téléversé. `profiles.setPhoto` vérifie l'existence et le type MIME, pas l'auteur du téléversement. Avant de conserver ces chemins, il faut associer chaque upload à son propriétaire et vérifier cette association lors de l'attachement.
4. **App Files.** `assistant.ownedFile` vérifie le propriétaire du message avant de demander un lien média. Le contrôle de propriété du fichier côté service Macaly ne peut pas être entièrement vérifié depuis le code Convex seul ; le remplacement du pont App Files devra conserver une vérification stricte côté serveur.
5. **Unicité logique.** Les index Convex ne sont pas des contraintes SQL `UNIQUE`. Les recherches `.unique()` supposent l'absence de doublons. Les mutations de création de profil vérifient le handle avant insertion dans une mutation transactionnelle ; les autres couples (credentials, membres de boutique, likes, abonnements) doivent également être audités pour empêcher les doublons.
6. **Historique et suppression en masse.** `assistant.clear`, les suppressions de notifications, commentaires/likes, membres de boutique et mouvements de stock ont des lectures `.collect()` et boucles de suppression. Il faudra prévoir un traitement borné/paginé ou par lots lorsque ces tables peuvent croître.

## Tests indispensables avant de valider ce schéma

1. Installer les dépendances dans un projet V4 isolé et lancer `npx tsc --noEmit`.
2. Lancer `npx convex dev --once` uniquement sur le nouveau déploiement Development vierge, après vérification explicite de la cible de connexion.
3. Vérifier que le schéma est accepté par Convex, notamment les index contenant des champs facultatifs.
4. Tester les requêtes indexées pour messages, notifications, connexions, Cahier, achats, crédits et clôtures, avec des documents ayant et n'ayant pas `occurredAt`, `shopId` ou `readAt`.
5. Tests d'autorisation avec quatre identités : propriétaire, manager, seller et utilisateur extérieur ; couvrir lecture, création, modification, suppression, pièces jointes et fichiers.
6. Tester les doublons concurrents de handle, likes, credentials et membres de boutique.
7. Tester les volumes importants et la pagination ; aucun test ne doit écrire dans Macaly Live, Neon ou les environnements de production.

## État des environnements

Aucun changement sur Macaly Live, Neon, Vercel Production, Convex Production ou l'ancienne application. Aucun push Convex, déploiement, migration de données, test de compilation ou test fonctionnel n'a été réalisé pendant cette étape. Le nouveau Convex Development reste non déployé.
