# HORIZON V4 — plan de tests de sécurité et de régression

## Tests automatisés ajoutés
- `tests/shopAccess.test.ts` vérifie les permissions pures des rôles vendeur, gérant et propriétaire.

## Tests à exécuter dès que l'environnement Node/Convex isolé est initialisé
1. **Rôles boutique**
   - vendeur : lecture, vente, dette client, création de contact autorisées ;
   - vendeur : suppression comptable, achat, ajustement de stock, création/suppression de produit refusés ;
   - gérant : opérations comptables et stock autorisées, gestion des membres refusée ;
   - propriétaire : gestion complète de la boutique.
2. **Fichiers**
   - un utilisateur ne peut réclamer qu'un fichier avec son jeton d'intention ;
   - un jeton expiré, réutilisé ou appartenant à un autre compte est refusé ;
   - un fichier réclamé pour `post` ne peut pas être attaché à un message ou à un profil ;
   - un fichier déjà attaché ne peut pas être réutilisé.
3. **Messages**
   - conversations, fils, messages non lus et marquage comme lu ;
   - limites de lecture et pagination au-delà de 100/500/1 000 enregistrements.
4. **Notifications**
   - visibilité limitée au destinataire ;
   - index des notifications non lues ;
   - marquage individuel et par lots, y compris les anciennes lignes sans `readAt`.
5. **Cahier**
   - vendeur/gérant/propriétaire sur ventes, dettes, dépenses, achats, produits, stock et clôtures ;
   - données personnelles séparées des données boutique ;
   - dates historiques : `occurredAt` avec repli vers `createdAt` pour les anciennes lignes ;
   - volumes supérieurs aux limites de lecture et exactitude des totaux.
6. **Régression**
   - conserver tous les exports consommés par le frontend ;
   - vérifier les relations et les index du schéma ;
   - compiler TypeScript puis valider le schéma sur le déploiement Convex Development uniquement.

## Limites actuelles
Les tests ne sont pas déclarés exécutés. Le dépôt ne contient pas encore de configuration de test ni de manifeste Node pour cette reconstruction. Aucun déploiement Convex n'a été effectué. Les chemins Macaly d'App Files restent à remplacer/auditer avant de déclarer toute la propriété des fichiers sécurisée.
