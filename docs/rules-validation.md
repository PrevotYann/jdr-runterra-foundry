# Validation 0.8.0

Les six sources demandées ont été lues sur le Drive le 10 octobre 2026 : RÈGLES, INDEX EFFETS ET ENCHANTEMENTS, NOTES BESTIAIRE, NOTES LIVRES, NOTES POTIONS, ECONOMIE ET RESSOURCES. Leurs textes correspondent exactement aux copies locales après normalisation des retours à la ligne, du BOM et des espaces de début/fin. Aucun de ces documents n’était inaccessible. Les documents de la campagne exclue n’ont pas été consultés ni intégrés.

Sources locales : règles du 21 septembre, index du 29 septembre, bestiaire du 5 septembre, livres du 28 septembre, potions du 3 septembre et économie du 6 septembre 2026.

Vérifications reproductibles : `npm test` (30 tests), `npm run test:foundry` (chargement des six compendiums, fiches, permissions et parcours existants), `npm run test:playable` (20 parcours ciblés) et `npm run test:fights` (89 contrôles, combats à quatre personnages). Exécutés sur Foundry **14.368** dans le monde isolé `.foundry-test`, sans erreurs navigateur dans les rapports. Les contrôles ciblés couvrent dégâts mixtes, résistances, intégrité, annulation depuis le bouton de chat, variantes, dépenses/progression uniques, magie ratée, consommation, guilde, récompenses, Anivia, blessures, survie, artisanat et préservation des valeurs personnalisées.

Les empreintes des identifiants de tous les documents, objets de bestiaire et pages de journal sont comparées à la version précédente. Les liens UUID, dossiers, illustrations locales et l’exclusion de campagne sont vérifiés. La reconstruction conserve 163 équipements, 216 consommables/ressources/livres, 131 entrées de magie, 87 profils, 66 lieux et 18 journaux de règles.

Limites : les tests ne remplacent pas une campagne complète ni la validation des modules tiers. Les quatre décisions suivantes restent explicites :

- Fourchettes et notations ambiguës (Aqua-Lame, rituel, soins par kit), conditions contextuelles et conséquences critiques : choix MJ, jamais une formule de dés inventée.
- Rendement ou conservation des ingrédients lorsque la source dit « pas de pertes » ; conversions L/kg vers unités d’inventaire et quantités de réparation.
- Effets narratifs, blessures non chiffrées, niveaux de kits laissés vides, pouvoirs de runes sans calcul et dangers mortels.
- Bonus contextuels des livres et enchantements : sélection uniquement dans la situation indiquée. Récompenses accordées manuellement avant la migration : cocher « Déjà accordée » pour enregistrer le palier sans appliquer une seconde fois.
