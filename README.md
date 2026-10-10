# JDR Runeterra pour Foundry VTT 14

Système français fondé sur le dossier Drive fourni. Compatible avec Foundry VTT **14.368**. L’Héritage de Magnus, ses documents de campagne et le grimoire associé sont exclus. Les contenus de campagne pourront être ajoutés par un module indépendant.

## Installation

Dans Foundry, ouvrir **Syst?mes de jeu ? Installer un syst?me**, puis coller cette URL de manifeste :

```text
https://github.com/PrevotYann/jdr-runterra-foundry/releases/latest/download/system.json
```

Installer **JDR Runeterra**, cr?er un monde et choisir Fran?ais dans les param?tres g?n?raux. Le bouton de mise ? jour de Foundry utilisera cette m?me URL pour les prochaines versions.

Pour une installation manuelle, t?l?charger [l?archive v0.8.0](https://github.com/PrevotYann/jdr-runterra-foundry/releases/download/v0.8.0/jdr-runeterra-0.8.0.zip) et d?compresser son dossier `jdr-runeterra` dans `Data/systems`, Foundry ferm?. Le r?sultat doit ?tre `Data/systems/jdr-runeterra/system.json`.

Ouvrir le compendium **R?gles & aides de jeu ? Aides de jeu ? Prise en main & arbitrages**. L?identifiant du syst?me reste `jdr-runeterra` pour conserver la compatibilit? avec les mondes existants.

## Utilisation

Créer un personnage ajoute son métier niveau 3, trois compétences, son passif et son Ultimate. Répartir les 600 points, nommer les spéciaux, choisir l’espèce et vérifier la création. Le bouton Enregistrer la fiche sauvegarde les modifications du personnage ensemble. Lors de la création uniquement, exactement un attribut de base à 80, un malus permanent à 10 et les autres entre 20 et 70 sont requis. Les bonus ne comptent pas dans cette répartition. Après Vérifier la création, plusieurs attributs peuvent atteindre ou dépasser 80 ; la progression ne réactive pas les contraintes de création. Les règles raciales et le malus permanent sont pris en compte dans les valeurs effectives. Glisser les objets des compendiums sur la fiche ; équiper les protections dans Inventaire. Cliquer sur un attribut ou sur les dés d’une compétence pour effectuer un jet.

Une attaque affiche une seule carte avec son jet, son résultat et ses dégâts, dans le style des fiches. En mêlée, seul un échec critique empêche de toucher : un jet de Force raté ne donne aucun bonus de dégâts. Un tir ou un sort raté ne propose aucun dégât à appliquer. Les cartes de dégâts proposent une application aux tokens ciblés, avec zone, pénétration et atténuation. Le MJ applique les dégâts aux cibles dont le joueur n’est pas propriétaire. Une carte permet d’annuler son dernier changement tant que les ressources, protections et effets concernés n’ont pas changé.

Le choix du malus permanent déplace immédiatement le cadenas et fixe l’attribut choisi à 10, en lecture seule. Les valeurs de base des deux attributs sont échangées pour conserver la répartition. Ce choix reste modifiable pendant la création et devient fixe après validation.

Les réglages du monde activent ou désactivent l’intégrité, la survie, les progressions et le suivi IRL. Le suivi IRL nécessite un MJ actif et une partie sans pause. En combat, seul le personnage du tour est suivi. Hors combat, le MJ choisit « Suivre ce personnage en IRL » puis « Arrêter le suivi IRL » dans Survie. Les effets de froid utilisent le temps du monde. Le bouton Avancer le temps RP est réservé au MJ.

Les descriptifs, recettes, dosages, restrictions et dangers restent consultables sur les objets. Les objets particuliers se configurent avec une formule de dégâts/soin, des bonus, une durée, une recharge et des utilisations. Les compétences des PJ sont libres dans la source : leur effet et leurs améliorations se définissent avec le MJ.

## Contenu

Six compendiums natifs LevelDB : équipement, consommables/flore/livres, magie/reliques/runes, bestiaire, atlas, règles. Dossiers par famille, rareté et ensemble ; liens UUID entre entrées ; illustrations locales issues du Drive, aucune dépendance réseau pendant la partie. Les protections d’un ensemble sont des objets distincts à équiper, sans créer un doublon de l’ensemble complet.

Les illustrations sont distribuées en WebP qualité 90, sans réduction de résolution, avec transparence conservée. Les originaux restent dans les sources de développement et sont exclus de l’archive. À la première connexion du MJ après la mise à jour, les références aux anciennes images du système sont corrigées dans les documents du monde. Le logo original du site accompagne une miniature, une bannière et un fond dans `assets/branding` ; le manifeste configure leur affichage dans Foundry.

La version 0.1.2 corrige les noms et illustrations du catalogue, classe les armes dans des sous-dossiers et affiche leur type sur la fiche. Les groupes du Grand-Ouest et les variantes de Félice ont chacun leurs profils. ARM et RM des créatures sont distinctes et modifiables en haut de la fiche ; les champs descriptifs utilisent un éditeur de texte enrichi. Les documents déjà importés dans un monde conservent leurs données : réimporter les entrées concernées pour bénéficier des corrections du catalogue.

Les fourchettes du bestiaire restent visibles ; les profils utilisent leur borne basse et le MJ choisit les valeurs adaptées. Les attributs que les sources ne chiffrent pas sont personnalisables et ne constituent pas des profils officiels supplémentaires.

## Couverture et conventions

[Couverture des règles](docs/coverage.md) détaille les automatismes et les décisions réservées au MJ. [Guide](docs/guide.html) expose les contradictions et les réglages. Les règles originales sont intégrées dans le compendium, après retrait des références à la campagne exclue. Une règle narrative ou un effet dont la source ne fournit pas de calcul ne reçoit pas de formule inventée.

Cette version est une première implémentation testée sur le moteur fourni. Les effets personnalisés, les décisions narratives et les valeurs absentes de la source demandent toujours une configuration par le MJ ; le système ne prétend pas arbitrer automatiquement ces passages.

## Développement et traduction

La version 0.1.6 vérifie les combats de quatre personnages et corrige les durées, recharges, soins ciblés et résistances. Voir le [rapport de simulation](docs/fight-validation.md). `npm run test:fights` reproduit les contrôles dans le monde isolé sur le port 30014.

`npm ci`, `npm test`, `npm run build`. Construire les compendiums lorsque Foundry est fermé. Le constructeur utilise `classic-level` fourni par l’installation Foundry locale, à configurer dans `tools/pack.mjs` sur une autre machine. `npm run test:foundry` lance les contrôles navigateur contre le monde de test sur le port 30014. `npm run release` produit l’archive sans sources privées, monde de test, licence Foundry ou dépendances de développement.

Les libellés de l’interface et des messages sont des clés dans `lang/fr.json`. Ajouter une langue au manifeste et son dictionnaire ; conserver les identifiants techniques, les UUID et les noms de champs. Les descriptifs des compendiums sont du contenu français à traduire séparément. `content/*.json` conserve des identifiants stables et permet de produire des packs localisés ; les modules peuvent utiliser `game.runeterra` et les classes de documents.

Le français sert également de repli si la langue de Foundry ne dispose pas encore d’une traduction du système. `tools/localize.mjs` régénère le dictionnaire français et son repli. Les attributs spéciaux supplémentaires apportés par un objet peuvent être ajoutés depuis Compétences et sélectionnés comme attribut d’un jet.

Code spécifique sous licence MIT, voir [LICENSE](LICENSE). Les règles, textes, illustrations et éléments de Runeterra conservent les droits de leurs auteurs respectifs ; voir [CREDITS.md](CREDITS.md).

## Publication des versions

Le d?p?t contient les compendiums et illustrations pr?ts ? distribuer. Les sources priv?es et le monde de test sont exclus. `npm ci`, `npm test` et `npm run release` suffisent pour produire une archive sans installation locale de Foundry. La reconstruction du contenu n?cessite les sources originales.

Pour publier une nouvelle version, modifier les versions de `system.json`, `package.json` et `package-lock.json`, puis adapter le lien `download` du manifeste au nouveau tag et au nom de l?archive. Conserver le lien `manifest` vers `releases/latest/download/system.json`. Committer, puis pousser un tag `vX.Y.Z` : le workflow GitHub publie l?archive, son SHA-256 et le manifeste. Foundry proposera ensuite cette version via son bouton de mise ? jour.

La version 0.8.0 ajoute les dégâts mixtes, les variantes, les récompenses uniques, les objets contextuels et les contrôles d’artisanat. Voir [le changelog](docs/changelog.md) et [la validation](docs/rules-validation.md). `npm run test:playable` vérifie les nouveaux parcours dans Foundry 14.368.
