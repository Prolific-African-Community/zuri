# Validation finale — Facturation Zuri

Contrôle du 24 octobre 2026. Verdict : **NOT READY pour exécuter la mise en production depuis cet environnement**. Validation fonctionnelle terminée ; aucun défaut fonctionnel bloquant connu après corrections. Deux réserves opérationnelles demeurent : connexion du moteur Prisma à Neon et accès aux variables Vercel Production.

## Cible et sécurité

- L’utilisateur a confirmé que `DATABASE_URL` est la bonne base.
- La console Neon confirme le projet **zuri**, branche **production**, et le compute correspondant à cette variable. Aucun mot de passe, token ou URI complète n’a été affiché ou ajouté au rapport.
- Aucun `.vercel/project.json` n’existe dans ce checkout ni dans ses dossiers parents. Aucun lien Vercel n’a été créé ou modifié.
- Le dépôt Git est `Prolific-African-Community/zuri`. Le statut Vercel du commit courant identifie le [projet zuri](https://vercel.com/jonathans-projects-e6d49b10/zuri), dans l’espace `jonathans-projects-e6d49b10`.
- Le token local liste uniquement `prolific-studio` et renvoie `404 not_found` pour le projet Zuri dans cet espace. La console Vercel demande une connexion. Il manque un token ou une session autorisés à lire **ce projet et ses variables Production** ; aucun secret ne doit être transmis dans le chat.
- Les lectures Neon ont été exécutées dans des transactions `READ ONLY`, terminées par `ROLLBACK`. Aucune migration, écriture de données, création de branche ou changement de configuration n’a été effectué dans Neon ou en production.
- Les données synthétiques sont confinées au PostgreSQL local jetable, conformément à l’autorisation explicite. Les uploads Blob réels ont utilisé des préfixes dédiés aux workspaces de validation ; tous les objets créés ont été supprimés après contrôle.

## Résultats

| Contrôle | Résultat et preuve |
| --- | --- |
| Migration compatible, sans perte | SQL additif : trois tables, index, contraintes et trigger. Aucun DROP de table/colonne ni réécriture des données existantes. 42 migrations existantes sans écart de checksum ; seule `20261024120000_billing` est en attente. Aucune migration inachevée, aucun doublon de clé Brand et aucune marque orpheline. |
| Structure de la base | Comparaison en lecture seule de Neon avec le PostgreSQL local migré : **512 colonnes, 146 valeurs d’enum et 392 contraintes préexistantes identiques**, hors ajout intentionnel de l’index composite Brand. |
| Conservation | Répétition sur base locale reproduisant les 42 migrations précédentes, avec données sentinelles locales : comptages et empreintes des **36 tables préexistantes strictement identiques** après ajout de la migration. Les trois nouvelles tables sont vides. Une Brand préexistante sans document reste supprimable. |
| Workspace / Brand / société | Clés étrangères composites interdisant un rattachement inter-workspace. Session revérifiée dans les pages, actions et route PDF. Identifiant du workspace résolu exclusivement côté serveur. Avec plusieurs workspaces sans configuration, refus fermé. |
| Permissions HTTP | Anonyme : GET redirigé vers login, POST refusé 401. Pages authentifiées : 200. Document d’un autre workspace : page 404 et PDF 422 sans contenu métier. PDF authentifié `private, no-store`, identique aux octets conservés en base. |
| Logo réel | Upload depuis le formulaire dans le navigateur intégré, stockage Blob réel, vérification PNG et relecture exacte des octets. Modification du profil sans nouveau fichier : logo conservé, aucun deuxième objet Blob. Logo visible dans les PDF de devis et de facture. PDF émis inchangé après suppression du Blob de validation. |
| Parcours UI | Configuration société avec logo → enregistrement client → devis à deux lignes / deux taux → réordonnancement → sauvegarde → prévisualisation → émission → acceptation → conversion → prévisualisation → émission facture. Numéros `UI-DEV-000001` puis `UI-000001`, facture verrouillée. Aucun email envoyé. |
| Calculs et TVA | Decimal, arrondi HALF_UP par ligne, ventilations par taux. Exemple UI : **426,50 EUR HT ; 1,50 EUR TVA à 3 % et 64,01 EUR à 17 % ; 492,01 EUR TTC**. Franchise et autoliquidation : aucune TVA facturée, mentions PDF contrôlées. Combinaisons incohérentes rejetées. |
| Numérotation et immutabilité | Cinq émissions simultanées sans doublon. Deux émissions du même brouillon : une seule réussit. Échec PDF sans numéro consommé. Conversion concurrente idempotente. Modification et suppression de facture émise refusées par le service et le trigger PostgreSQL ; passage émis → payé autorisé. |
| PDF A4 | 1, 2 et 4 pages, 50 lignes conservées, en-têtes du tableau répétés, descriptions et mots très longs, 350 occurrences de notes conservées, totaux sur la dernière page, marges et logo vérifiés avec Poppler et extraction de texte. Octets déterministes pour un snapshot identique. |
| Responsive | Contrôle visuel desktop et mobile. Largeurs CSS réelles mesurées : **1440 px** (document 1421 px) et **375 px** (document 356 px), sans débordement horizontal. Navigation et formulaires s’adaptent. |

Références légales : [Guichet.lu — Facture](https://guichet.public.lu/fr/entreprises/gestion-juridique-comptabilite/facturation/encaissement/facture.html), [loi TVA — article 57bis](https://pfi.public.lu/dam-assets/pdf/legislation/tva/loi/loi-tva-2026-01-01.pdf). L’applicabilité d’un régime particulier reste une décision explicite de l’émetteur ; pas de moteur fiscal automatique ni de validation VIES.

## Corrections limitées aux anomalies constatées

1. **Logo orphelin** : validation du profil, de la société et de la révision avant upload ; suppression compensatoire du nouveau Blob si l’écriture en base échoue après l’upload. Test du conflit de révision et du nettoyage.
2. **État du formulaire logo** : le profil normalisé renvoyé par le serveur remplace l’état local et le champ fichier est vidé après succès. Cela évite de réenvoyer le fichier à chaque sauvegarde ou de restaurer un ancien logo.
3. **Pagination avec raison sociale longue** : reproduction d’un texte atteignant 796 points, dans la zone du pied de page. Le calcul utilise maintenant la hauteur réelle de l’en-tête ; une ligne physiquement trop grande est refusée explicitement. Aucun en-tête de tableau orphelin avant un saut de page.
4. **Test de conversion dépendant du jour** : l’attendu de la date d’émission utilise la date de conversion, pour ne pas échouer les jours suivants.

Pas de refonte, pas de nouvelle fonctionnalité. La migration initiale n’a pas été modifiée pendant cette validation.

## Tests et qualité

- **14 tests exécutés, 14 réussis, aucun ignoré**, dont PostgreSQL local, Blob réel et répétition de la migration.
- `npm run typecheck` : réussi.
- `npm run lint` : réussi.
- `npm run build` : réussi.
- Schéma Prisma valide et police PDF embarquée dans la trace de production.

La commande ordinaire `npm run test:billing` n’effectue pas d’écriture distante : les tests de base sont ignorés sans `BILLING_TEST_DATABASE_URL` local valide ; le test Blob réel requiert en plus `BILLING_LIVE_BLOB_TEST=1` et un token Blob explicitement fourni. Ne pas l’activer sans autorisation d’upload et de nettoyage.

## Réserves avant application

1. Les lectures via le client PostgreSQL Node réussissent, mais les tentatives natives `prisma migrate diff` vers Neon échouent avec **P1001**. Le constat persiste en accès direct et avec routage explicite du compute, sans modification du fichier `.env`. La cause précise de la connectivité native n’est pas établie. Il faut confirmer le fonctionnement du moteur Prisma dans l’environnement qui appliquera la migration.
2. Les variables **Production** du projet Vercel Zuri n’ont pas pu être comparées au `.env` local faute d’accès à ce projet. La confirmation humaine de la bonne base est retenue ; la correspondance des variables du déploiement reste à contrôler par un compte autorisé.

## Commandes de migration — non exécutées sur Neon

Dans le checkout validé, avec la variable `DATABASE_URL` de la cible confirmée, et uniquement après autorisation d’écriture et résolution de la connectivité Prisma :

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
```

`migrate deploy` doit appliquer uniquement `20261024120000_billing`, puisque c’est la seule migration actuellement en attente sur la cible inspectée. Si `migrate status` retourne P1001 ou si une autre migration apparaît, arrêter et résoudre ce point avant application. Ne pas utiliser `migrate dev`, `db push`, un reset ou un seed sur cette cible.

Aucun déploiement ni changement de configuration Vercel n’a été effectué.
