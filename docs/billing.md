# Facturation & devis

## Mise en service

Le module est accessible dans **Facturation**, sous `/dashboard/billing`. Aucun déploiement ni migration de la base configurée du projet n’a été réalisé pour cette livraison.

1. Appliquer la migration additive avec `npx prisma migrate deploy` sur l’environnement choisi, puis générer le client Prisma si nécessaire (`npx prisma generate`).
2. Définir `BILLING_WORKSPACE_ID` si plusieurs workspaces existent. Avec un seul workspace, celui-ci est sélectionné automatiquement. L’identifiant est exclusivement résolu côté serveur.
3. Configurer au moins une société émettrice dans **Sociétés**, et disposer d’une Brand dans ce workspace. Plusieurs marques peuvent utiliser la même société.
4. Le logo utilise le stockage Vercel Blob déjà présent (`BLOB_READ_WRITE_TOKEN`). Il est décodé et redimensionné via Sharp, stocké en Blob et embarqué dans le profil/snapshot pour garantir le rendu historique sans téléchargement externe. PNG/JPEG, 2 Mo maximum.
5. Créer un document, enregistrer le brouillon, prévisualiser le PDF, puis confirmer son émission. « Envoyé » pour un devis ne déclenche aucun email.

## Accès et invariants

L’authentification existante est celle d’un administrateur unique de l’installation : elle ne contient aucune identité utilisateur ni appartenance à un workspace. La facturation ne crée pas de modèle de rôles parallèle : chaque page, action et téléchargement revérifie la session et le workspace autorisé côté serveur. Avec plusieurs workspaces et sans configuration explicite, l’accès échoue fermé. Cette restriction concerne le nouveau module, pas les autres modules existants.

Les clés étrangères composites lient Brand et société au workspace du document. Aucun identifiant de workspace fourni par le navigateur n’est accepté. Les clients enregistrés sont limités au même workspace. Le PDF est servi par une route authentifiée avec `private, no-store`.

Les compteurs facture et devis appartiennent à la société. Les séries continues sont `PREFIX-000001` et `PREFIX-DEV-000001`, sans remise à zéro annuelle. Le préfixe est verrouillé après la première émission. La numérotation, le snapshot et le PDF sont écrits dans une même transaction Serializable, avec verrous PostgreSQL et reprise des conflits de sérialisation. Un échec PDF ne consomme pas de numéro. Les dates d’émission doivent suivre la chronologie de la série.

Les brouillons emploient un numéro de révision contre les écrasements concurrents. Une facture émise ne peut plus être modifiée ni supprimée ; un trigger PostgreSQL protège aussi ces invariants hors du service applicatif. Seul le passage émis → payé est proposé. Les devis restent modifiables : une modification rétablit le brouillon et exige une nouvelle prévisualisation/émission sous le même numéro. Un devis accepté peut être converti en facture brouillon ; une conversion concurrente retourne une seule facture. Une duplication produit toujours un nouveau brouillon sans numéro.

## TVA et calculs

Les valeurs sont des chaînes décimales. Decimal utilise 40 chiffres de précision ; les bases par ligne sont arrondies au centime, puis la TVA par ligne au centime, en arrondi commercial HALF_UP. Les ventilations et totaux somment ces montants arrondis. Les devises ISO à deux décimales sont acceptées, EUR par défaut. Les devises à zéro ou trois décimales ne sont pas prises en charge dans ce run.

Le statut TVA de la société est explicite. Le régime normal nécessite un numéro TVA ; les taux sont configurables par ligne. Un taux zéro demande un fondement dans les notes. La franchise luxembourgeoise impose zéro TVA et ajoute la mention de l’article 57bis. L’autoliquidation exige un client entreprise avec numéro TVA, un fondement explicite et la confirmation de l’applicabilité pour l’opération. Le module n’effectue pas de vérification VIES ni de détermination automatique du lieu d’imposition. Les opérations particulières (par exemple moyens de transport neufs ou régimes de marge) exigent des informations spécifiques non automatisées ici.

Sources officielles consultées le 24 octobre 2026 :

- [Guichet.lu : facture et mentions obligatoires](https://guichet.public.lu/fr/entreprises/gestion-juridique-comptabilite/facturation/encaissement/facture.html)
- [AED : contenu des factures](https://pfi.public.lu/fr/professionnel/tva/en-cours-activite-economique/que-doivent-contenir-factures.html)
- [Loi TVA coordonnée au 1er janvier 2026, article 57bis](https://pfi.public.lu/dam-assets/pdf/legislation/tva/loi/loi-tva-2026-01-01.pdf)

L’utilisateur renseigne RCS et autorisation lorsque son statut les exige. L’interface demande une vérification explicite avant émission. Un PDF ne remplace pas la facturation électronique structurée requise dans certains marchés publics. La conservation de dix ans indiquée par Guichet exige les sauvegardes et la politique de rétention de l’exploitant ; aucun mécanisme de purge n’est ajouté.

## PDF et limites physiques

PDF A4 natif via pdf-lib ; police Noto Sans sous licence OFL embarquée. Le rendu utilise les mesures réelles du texte, répète en-tête et pied de page ainsi que les colonnes du tableau lors de sa continuation. Les lignes restent entières ; les mots longs sont repliés. Les notes peuvent occuper plusieurs pages, puis les totaux restent groupés sur la dernière page. Les octets du PDF émis sont conservés en PostgreSQL ; un téléchargement ne régénère pas le document. Le profil légal, le client, les prestations, la marque et les montants sont figés dans un snapshot versionné.

Une prestation dont la description ne tient pas sur une page entière, même après réduction de police à 7 points, est refusée avec une demande de répartir la prestation sur plusieurs lignes. Les coordonnées trop longues pour l’en-tête sont également refusées. Aucun texte n’est tronqué. Les glyphes non couverts par Noto Sans provoquent un refus explicite, sans remplacement silencieux.

## Validation

`npm run test:billing` exécute les tests de calcul, TVA, validations, transitions, conversion et PDF. Les fixtures sont exclusivement dans les tests, sans seed ni données fictives de production. Les PDF de contrôle sont écrits dans `tmp/billing-qa/pdfs` (ignoré par Git).

Pour les tests PostgreSQL, utiliser une base **locale jetable** nommée `zuri_billing_qa`, migrée avec `prisma migrate deploy`, puis définir `BILLING_TEST_DATABASE_URL` avant la commande. Le test refuse les hôtes distants et ignore le test DB si cette variable n’est pas fournie. Il ne charge pas le `.env` du projet. Les données temporaires sont confinées à cette base.

Ont été vérifiés sur PostgreSQL temporaire local : isolation applicative et contraintes composites, cinq émissions simultanées, émission concurrente du même brouillon, rollback sans consommation de numéro, verrouillage de modification/suppression, concurrence de sauvegarde, stabilité du PDF après modification du profil, conversion concurrente idempotente et duplication.

Ont aussi été contrôlés : PDF de 1, 2 et 4 pages, descriptions longues et mots sans espaces, notes volumineuses, devis en franchise, octets déterministes, pages rendues via Poppler, parcours mobile de sauvegarde/prévisualisation/émission, accès HTTP anonyme et authentifié, refus d’accès inter-workspace. La validation finale a testé l’upload Blob réel depuis le formulaire société, la relecture exacte des octets, le logo dans les PDF et le nettoyage des fichiers de validation. Voir [le bilan final](billing-validation.md).

Les tests Blob distants sont désactivés par défaut. Ils exigent `BILLING_LIVE_BLOB_TEST=1`, un token fourni explicitement et une base locale valide. Les tests de migration requièrent un compte PostgreSQL local pouvant créer et supprimer une base jetable. Ne pas activer ces tests distants sans autorisation.

Aucun paiement en ligne, email, relance, module comptable ou déploiement n’est inclus.
