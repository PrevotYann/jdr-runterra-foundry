# Validation des combats — version 0.1.6

Simulation exécutée dans Foundry VTT 14.368, dans le monde de test isolé, avec quatre personnages, leurs tokens et un véritable suivi de combat. Les jets sont déterministes afin de vérifier les résultats attendus, y compris les échecs. Les compétences ci-dessous sont des configurations de test du MJ : les règles ne fournissent pas de classes et de compétences prédéfinies.

| Personnage | Espèce | Équipement et capacités |
|---|---|---|
| Guerrier | Minotaure | Tranchevif du catalogue, protection de torse rouge et casque bleu configurés pour le test ; 130 PV d’équipement, bonus de Force, ARM native raciale |
| Archer | Demi-troll des Glaces | Ofléore et tenue d’Explorateur Freljordien du catalogue ; Perception raciale, tir sur cible mobile, malus de distance et bonus d’ensemble |
| Mage | Vastaya | Galidarium du catalogue, robe configurée avec RM ; attaque magique, bonus temporaire, malus ciblé, brûlure, recharge, utilisations limitées et Ultimate |
| Soigneur | Humain | Métier Soin, manteau configuré pour le test, soin personnel et soin d’un allié ; repas, Rouge Vision et Curasom. Une phase en golem vérifie séparément le soin mécanique. |

Les quatre répartitions respectent les contraintes de création et le budget de 600 points. La simulation utilise plusieurs rounds, saute deux rounds, revient en arrière et redémarre le combat pour contrôler les déclenchements multiples. Le temps RP est ensuite avancé pour les soins différés et la fatigue. Les objets et acteurs de test sont supprimés et les réglages sont restaurés à la fin.

## Résultats

89 contrôles de la simulation, sans échec ni erreur navigateur/serveur. Le journal détaillé des valeurs attendues, des valeurs observées et des états de chaque personnage est produit dans `test-results/four-actor-fights.json`.

| Domaine | Vérifications |
|---|---|
| Attaques | Mêlée réussie, échec ordinaire, réussites et échecs critiques ; tirs ratés, distance et cible mobile ; attaque magique |
| Attributs | Bonus d’équipement et d’espèce, bonus et malus temporaires, maladie, fatigue, modificateur circonstanciel ; malus permanent à 10 |
| Dégâts | ARM et RM distinctes, protection ciblée, résistance native, résistance fixe d’équipement, résistance persistante et éphémère, PP et PM ; DB directement sur PV de base |
| Ressources | PV d’équipement supérieurs à 100, charges, Ultimate, recharge et blocage des utilisations indisponibles ; début, fin, saut, retour et redémarrage de rounds |
| Cibles | Boutons de chat appliquant réellement les dégâts, les malus et les soins aux tokens ciblés |
| Soins et objets | Priorité PV de base puis équipement, bandage, cautérisation, potion de PV bonus et expiration, quantité et annulation de dose ; Curasom à mi-parcours et à son terme |
| Repos et durée | +10 PV au chaud, +5 dehors, fatigue après repos court, expiration après une demi-journée ; effets actifs jusqu’à leur échéance, effets expirés inactifs |
| Équipement | Ensemble complet/incomplet, pièce cassée, réparation avec perte d’IPV maximum et déséquipement |

## Corrections apportées

- Les effets de fin de round ne se déclenchent plus au démarrage du combat. Les rounds sautés sont traités, sans répéter les dégâts lors d’un retour en arrière ; un combat redémarré reprend normalement.
- Les événements de temps sont mis en file et utilisent leur propre horodatage. Un second avancement ne supprime plus une potion avant sa dernière fraction de soin.
- Les durées utilisent le schéma de Foundry 14 et une expiration gérée par le système. Foundry et le système ne modifient plus simultanément un effet supprimé. Les effets déjà marqués expirés ne continuent plus à soigner ou à remplacer les attributs.
- Les arcs des demi-trolls des Glaces sont identifiés par leur type, même lorsque le type a été retiré du nom affiché.
- La PM chiffrée traverse la RM d’équipement en conservant la RM native. La PP traverse aussi l’ARM native. L’option explicite qui ignore entièrement les résistances reste distincte.
- Une protection locale en ARM n’absorbe plus les dégâts magiques.
- Une capacité de soin configurée pour les cibles soigne l’allié choisi ; les soins biologiques personnels suivent la même restriction mécanique que le bouton de soin.
- La fatigue d’un repos court et l’état de fatigue ont une durée d’une demi-journée.

Sources vérifiées : `sources/rules.txt`, sections combat en mêlée et à distance, demi-trolls des Glaces, pénétration physique/magique, résistances, saignement, soins, repos et fatigue ; descriptions des objets importés.

Les arbitrages narratifs restent au MJ : effets particuliers d’une blessure, esquive et atténuation choisies, restrictions contextuelles et pouvoirs uniques non configurés dans les champs d’un objet. Cette simulation ne constitue pas une vérification automatique de chaque pouvoir narratif du catalogue.

## Reproduction

Lancer le monde isolé sur le port 30014, puis `npm run test:fights`. Le script crée ses propres fixtures. `npm test` vérifie les règles pures et le contenu ; `npm run test:foundry` vérifie les autres mécaniques et les interactions de fiche, notamment progression, froid, invulnérabilité, coma, dialogues et permissions.
