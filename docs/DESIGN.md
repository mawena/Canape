# Design — Canapé (1.0, puis version 2)

Direction artistique et produit de Canapé 1.0. Ce document est le contrat de l'agent « interface » : les valeurs
(couleurs, tailles, durées) sont exactes et reprises telles quelles dans `docs/maquettes/canape.html`, qui est la
référence visuelle (à ouvrir dans un navigateur). En cas d'écart entre les deux, c'est ce document qui l'emporte.

Sommaire : **Version 2 (phase 14)** · 1 Positionnement · 2 Recherche · 3 Système de design · 4 Composants · 5 Écrans · 6 Ton et textes ·
7 Accessibilité et PWA · 8 Fonctions supplémentaires recommandées · 9 Sources.

---

## Version 2 (phase 14) : « la salle de cinéma privée, une lampe allumée »

**Cette section l'emporte** sur les valeurs plus bas quand elles diffèrent (les §3.1 à 3.4 ont été mises à jour ; la maquette
`docs/maquettes/canape.html` reste celle de la 1.0). Demande : une application plus attirante, plus professionnelle et plus
facile à utiliser, couleurs comprises.

### Révision des couleurs : thème clair bleu par défaut, thème sombre en option

Retour de l'utilisateur sur la première version 2 : « trop sombre et pas attractif ». **Les couleurs et la luminosité
changent ; la structure, le kit, Figtree, les premiers pas et les écrans restent.** Cette révision **remplace la palette
ambre/encre** du tableau plus bas (gardé pour mémoire) : le nom des jetons ne change pas (`--lampe` est désormais le bleu
d'action), seules les valeurs changent. Les jetons sont dans `client/src/lib/ui/jetons.css`, un bloc par thème.

**Principes.** Clair par défaut : fond bleuté très clair, cartes blanches, texte bleu nuit, **bleu `#1f5ce0` comme seule couleur
d'action**, dégradé bleu → indigo → violet réservé aux éléments vedettes (carte « Ce soir », fond de la connexion et de
l'invitation, bouton principal), ombres douces teintées de bleu, rayons inchangés. L'autre personne reste en rose/magenta.
La lueur des affiches (ombre colorée d'après `film.couleur`) reste. **La salle, le sas, le lecteur seul et les pastilles posées
sur une affiche restent sombres dans les deux thèmes** (`data-theme="sombre"` posé sur l'élément) avec les accents bleus.

**Palette claire** (ratios WCAG calculés ; seuils AA : texte 4,5 : 1, UI et contours 3 : 1) :

| Jeton | Valeur | Rôle | sur `--fond` | sur `--s1` | sur `--s3` |
|---|---|---|---|---|---|
| `--fond` | `#f5f7fb` | page | n.a. | | |
| `--s1` | `#ffffff` | cartes, barres | | | |
| `--s2` / `--s3` | `#f1f4f9` / `#e5eaf3` | champs, survols, onglet inactif | | | |
| `--bord` / `--bord-vif` | `#e2e8f1` / `#cdd6e4` | séparateurs / carte en avant (décoratifs) | | | |
| `--bord-champ` | `#70829c` | contour des champs et boutons | 3,7 | 3,9 | 3,2 |
| `--texte` | `#0f172a` | texte principal | 16,6 | 17,9 | 14,8 |
| `--doux` | `#475569` | texte secondaire | 7,1 | 7,6 | 6,3 |
| `--discret` | `#54647c` | aides, légendes | 5,6 | 6,0 | 5,0 |
| `--lampe` | `#1f5ce0` | action, lien, focus | 5,3 | 5,7 | 4,7 |
| `--lampe-vive` | `#1b4fd1` | survol, anneau de focus | 6,8 avec texte blanc dessus | | |
| `--lampe-sur` | `#ffffff` | texte sur le bleu | 5,7 sur `--lampe` ; 6,3 sur l'indigo `#4f46e5` | | |
| `--rose` | `#c4165f` | l'autre personne | 5,4 | 5,8 | 4,8 |
| `--ok` | `#13753a` | réussite | 5,4 | 5,8 | 4,8 |
| `--alerte` | `#8f4a06` | attention | 6,2 | 6,7 | 5,5 |
| `--mal` | `#c62222` | erreur, danger (5,7 avec texte blanc dessus) | 5,4 | 5,7 | 4,8 |
| `--info` | `#0369a1` | information | 5,5 | 5,9 | 4,9 |

Dégradés : `--lampe-degrade` `#2f6df0 → #4f46e5` (bouton principal) ; `--hero-degrade` `#1d4ed8 → #3b3fe0 → #6d3df0`
(carte vedette, connexion). Sur le dégradé, texte blanc (≥ 5,9 : 1 au plus clair, mesuré au milieu) ; les boutons y deviennent blancs à texte
`#1e3a8a`. Ombres : `--ombre-1` à `--ombre-4` en `rgba(30,58,138,…)` (halo bleu), `--halo-lampe` sous le bouton principal.

**Palette sombre** (bleu nuit, fini l'encre violette) :

| Jeton | Valeur | sur `--fond` | sur `--s1` | sur `--s3` |
|---|---|---|---|---|
| `--fond` / `--s1` / `--s2` / `--s3` | `#0b1220` / `#111a2e` / `#16213a` / `#1e2b4a` | | | |
| `--bord-champ` | `#6b7fa3` | 4,6 | 4,3 | 3,5 |
| `--texte` | `#f1f5ff` | 17,2 | 15,9 | 12,8 |
| `--doux` | `#b4c0d8` | 10,2 | 9,5 | 7,6 |
| `--discret` | `#94a3c4` | 7,4 | 6,8 | 5,5 |
| `--lampe` (bleu d'action) | `#60a5fa` | 7,4 | 6,8 | 5,5 |
| `--lampe-vive` | `#93c5fd` | | | |
| `--lampe-sur` | `#071226` | 7,4 sur `--lampe`, 8,9 sur `#7ab6ff` | | |
| `--rose` | `#ff8fc0` | 8,9 | 8,2 | 6,6 |
| `--ok` / `--alerte` / `--mal` / `--info` | `#4ade80` / `#fbbf24` / `#ff7b72` / `#7dd3fc` | 10,7 / 11,2 / 7,4 / 11,2 | 10,0 / 10,4 / 6,9 / 10,4 | 8,0 / 8,4 / 5,6 / 8,4 |

**Choix du thème.** Trois valeurs : *Clair* (défaut), *Sombre*, *Comme mon appareil* (`prefers-color-scheme`, suivi en direct).
Menu du compte (trois lignes « Thème : … » et, sur téléphone, un sélecteur en segments dans la feuille « Moi ») et page « Mon compte »
(carte « Apparence »). Mémorisé dans `localStorage` (`canape.theme`, lecture et écriture protégées par try/catch) ; l'attribut
`data-theme` de `<html>` est posé **avant le premier rendu** par un court script en ligne de `client/src/app.html` (aucun flash) ;
`client/src/lib/interface/theme.svelte.ts` le relit et le change. `<meta name="theme-color">` suit le thème (`#f5f7fb` / `#0b1220`) ;
manifeste PWA, icônes (dégradé bleu → violet) et écrans de démarrage iOS passent au clair.
**CSP** : le serveur hache les scripts en ligne d'`index.html` (`hachagesScriptsEnLigne`, regex sur tous les `<script>` sans `src`) ; le script de thème
est donc haché comme celui de SvelteKit et s'exécute sans changement côté serveur (vérifié par un essai Playwright sans erreur console).

**Constat.** La 1.0 avait la bonne idée (la lampe, la lueur, le film au centre) mais restait artisanale : surfaces violettes
un peu ternes et toutes au même niveau, boutons en pastille, titres de cartes en serif qui se mélangeaient aux noms de films,
pages sans hiérarchie (colonnes étroites, doubles marges), états vides sans guide. Recherche : les interfaces de streaming 2026
(Apple TV, Netflix, Disney+) misent sur le calme visuel et une hiérarchie nette, des surfaces qui montent par paliers de
luminosité plutôt que par ombres, du verre dépoli pour ce qui flotte sur l'image, une seule couleur d'action ; pour le sombre,
éviter le noir pur et le blanc pur, viser 12 à 16 : 1 pour le texte principal, désaturer les accents.

**Intention.** On passe du « salon la nuit » à une **salle de cinéma privée** : un noir d'encre presque neutre qui s'efface
devant le film, une lampe ambre plus lumineuse qui guide l'œil vers la seule action possible, du verre sur ce qui flotte
(barres, chat, voiles), des reflets fins qui donnent du volume. Le serif ne sert plus qu'aux **grands titres et aux affiches**
(le nom d'un film, « Bonjour Alix »), l'interface passe tout entière en sans-serif.

**Palette ambre/encre d'origine, remplacée par la révision ci-dessus** (contrastes calculés par script, formule WCAG 2.x ; seuils AA : texte 4,5 : 1, UI et contours 3 : 1) :

| Jeton | Valeur | Rôle | sur `--fond` | sur `--s1` | sur `--s2` | sur `--s3` |
|---|---|---|---|---|---|---|
| `--fond` | `#0d0c12` | page | n.a. | | | |
| `--s1` | `#15141c` | cartes, barres | n.a. | | | |
| `--s2` | `#1d1b26` | champs, menus, bulles | n.a. | | | |
| `--s3` | `#282532` | survol, bulles reçues, onglet actif | n.a. | | | |
| `--bord` / `--bord-vif` | `#2f2c3b` / `#3b3749` | séparateurs / carte en avant (décoratifs) | | | | |
| `--bord-champ` | `#7d7790` | contour des champs et boutons | 4,6 | 4,3 | 4,0 | 3,5 |
| `--texte` | `#f7f3ee` | texte principal | 17,6 | 16,5 | 15,4 | 13,6 |
| `--doux` | `#c0bacb` | texte secondaire | 10,3 | 9,7 | 9,0 | 7,9 |
| `--discret` | `#9f99ad` | légendes, aides | 7,1 | 6,6 | 6,2 | 5,4 |
| `--lampe` | `#ffb347` | action, focus, progression | 10,9 | 10,3 | 9,5 | 8,4 |
| `--lampe-vive` | `#ffc873` | survol, anneau de focus | 12,8 | | | |
| `--lampe-sur` | `#1a1006` | texte sur la lampe | 10,5 sur `--lampe`, 12,3 sur `--lampe-vive` | | | |
| `--rose` | `#ff8fb4` | l'autre personne | 9,1 | 8,6 | 8,0 | 7,0 |
| `--ok` | `#5fdcae` | « ça va » | 11,4 | 10,7 | 10,0 | 8,8 |
| `--alerte` | `#ffd166` | attention | 13,5 | 12,7 | 11,8 | 10,4 |
| `--mal` | `#ff7b6e` | erreur, danger | 7,7 | 7,2 | 6,7 | 5,9 |
| `--info` | `#7cc0ff` | information neutre (nouveau jeton) | 10,1 | 9,4 | 8,8 | 7,7 |

Texte sombre sur fond coloré : `--mal-sur` `#2a0d0a` sur `--mal` 7,2 : 1 ; texte `#16101c` sur les six couleurs de présence
(`#ffb347 #ff8fb4 #8fc7f0 #b4a2f0 #9ad9a0 #f0d27a`) : de 8,3 à 12,6 : 1. Le script de vérification n'est pas dans le dépôt
(feuille de calcul à refaire : luminance relative, `(L1+0,05)/(L2+0,05)`).

**Typographie.** *Figtree* (variable 300–900, OFL, hébergée dans `client/static/polices/`, latin et latin-ext, `font-display: swap`)
pour toute l'interface : géométrique et chaleureuse, très lisible petite, chiffres nets, plus personnelle que Inter ou
Geist, et sans le côté « tableau de bord ». *Instrument Serif* (romain seul, l'italique n'est plus embarqué) pour l'affiche,
le titre de page (h1), les titres de film sur les affiches et les grands chiffres. Titres de section (h2) : Figtree 700,
`-0,02em`. Hanken Grotesk et l'italique d'Instrument Serif sont retirés.

**Rayons.** Champs et boutons 12 px (`--r-m`), cartes 20 (`--r-l`), grandes surfaces (modales, hero, tiroirs, chat) 28 (`--r-xl`),
affiches 12, boutons « gros » 16, boutons « petits » 10 ; pastilles, badges et avatars restent ronds. Les boutons ne sont plus
des pilules : plus net, plus « outil ».

**Élévations.** Surface d'abord (`--fond` → `--s3`), puis un **reflet** d'1 px en haut de chaque surface (`--reflet`,
`rgba(255,255,255,.055)`) et une ombre par plan (`--ombre-1` à `--ombre-4`). Le bouton principal porte un dégradé
`--lampe-degrade` et un halo ambre (`--halo-lampe`) : c'est le seul élément lumineux de l'écran.

**Verre.** Barre du haut, barre d'onglets du téléphone, chat, voiles et réactions : `--fond-verre` (`rgba(21,20,28,.78)`) +
`--flou-verre` (`blur(20px) saturate(1.4)`).

**Mouvement.** Inchangé (120 / 220 / 420 ms, `--ease`) avec un `--ressort` pour les retours d'action ; l'onglet actif de la
barre est marqué par un filet lumineux (pas d'animation de page) ; tout passe à ~0 avec `prefers-reduced-motion`.

**Ce qui change pour l'utilisateur.** Barre du haut en verre avec filet ambre sous la page courante, boutons rectangles à
bords doux, onglets en segments, affiches avec filet de lumière, accueil guidé par les **premiers pas** (3 étapes qui se
cochent seules, refermables), connexion et invitation « affiche de cinéma », séances avec pastille de date, création de
séance en trois cartes numérotées (c'est une vraie suite), compte et administration alignés sur le kit, chat et voiles en
verre, états vides avec une action. Aucun comportement n'a changé (API, synchro, magasins).

---

## 1. Positionnement et principes

### Ce que Canapé est

Un salon à distance pour deux personnes (parfois cinq ou six) qui se connaissent. Ce n'est pas un service de
streaming (on n'y « découvre » rien) ni une salle de conférence où l'on regarde un film : c'est **la pièce où l'on
s'installe**. La 0.1 jouait la salle de cinéma (rideaux de velours, or, néon) ; c'est un décor de plus, celui qu'on
voit partout dès qu'on dit « film » et « sombre ». La 1.0 change de pièce : **un salon, la nuit, une lampe allumée,
l'écran qui éclaire les visages**. Le canapé, pas la salle.

### Idée directrice : « la lueur »

Quand on regarde un film dans le noir, c'est lui qui éclaire la pièce. Toute l'interface est bâtie sur ça :

- un **fond nuit prune** (pas du noir pur) qui laisse la lumière du film s'y poser ;
- **une seule couleur d'action, la lampe** (ambre chaud), utilisée pour ce sur quoi on peut agir et pour le focus ;
- **la lueur** : l'image et l'affiche du film déposent leurs couleurs autour d'elles (halo flou derrière l'affiche
  de la séance de ce soir, éclairage de la pièce autour de l'image dans la salle) ;
- **le rose, réservé à l'autre personne** : sa présence, son nom dans le chat. On n'a jamais besoin d'une deuxième
  couleur d'action, alors le rose peut garder un seul sens : « quelqu'un est là avec toi ».

### Sept principes

1. **Le film d'abord, l'interface ensuite.** Dans la salle, rien n'occupe le centre de l'image ; les commandes
   disparaissent après 3 s d'inactivité, les vignettes restent petites et déplaçables.
2. **Le dernier geste est visible.** Toute commande partagée dit qui l'a faite (« Léa a mis en pause ») : c'est la
   leçon de SharePlay et de Syncplay, et ce qui évite les disputes silencieuses.
3. **Jamais de blocage silencieux.** Si la lecture attend quelqu'un, on le dit en clair, avec le nom, et on offre une
   sortie (« Ne plus attendre Sam »). Les utilisateurs de Jellyfin SyncPlay et de Plex Watch Together se plaignent
   surtout de groupes qui « gèlent » sans explication.
4. **Tout ce qui est partagé reste dans le même cadre.** Film, caméras, chat, réactions vivent dans un seul
   conteneur : le plein écran ne perd rien (Teleparty a été critiqué pour son chat dans une fenêtre séparée, qui
   obligeait à quitter le plein écran).
5. **Chaleureux, pas mignon.** Phrases courtes, tutoiement non imposé (vouvoiement par défaut, voir §6), pas de
   mascotte, pas de confettis. La chaleur vient de la lumière, du serif des titres et de la douceur des formes.
6. **Un seul moment de bravoure.** La lueur (hero « Ce soir », éclairage de la salle) est l'élément mémorable ; tout
   le reste est silencieux. Pas de dégradé décoratif ailleurs, pas de verre dépoli partout.
7. **Accessible d'abord.** Contrastes AA vérifiés, focus toujours visible, cibles de 44 px, mouvement réductible,
   états jamais portés par la couleur seule. On regarde à deux, parfois avec un parent âgé : ça doit marcher pour
   tout le monde.

### Ce qu'on reprend et ce qu'on évite

| Produit | On reprend | On évite | Pourquoi |
|---|---|---|---|
| **Teleparty** | Chat à côté de l'image, indication de qui tamponne | Fenêtre de chat séparée ; vidéo derrière un abonnement ; extension fragile ; pubs | Les avis (Mozilla, Trustpilot, App Store) citent le plein écran cassé, l'invisibilité de qui tamponne et l'UI mobile mauvaise |
| **Rave / Kosmi** | Salle accessible par un lien, sans installation ; navigateur suffisant | Ambiance « jeux / réseau social », publicités, grilles de salles publiques | Canapé est privé : pas de découverte, pas de salles publiques |
| **Scener / TwoSeven / NeverFar** | Caméras à côté de la vidéo, pensées pour les couples | Barre latérale qui réduit le film | La caméra est la raison d'être ; mais l'image garde la plus grande part |
| **Discord (Go Live, activités)** | Bascule d'un salon vocal à l'écran, volumes individuels par personne | Interface de communauté (serveurs, canaux) | Garder l'idée « volume par personne », laisser le reste |
| **Syncplay** | État « prêt / pas prêt », pause quand quelqu'un se déconnecte, message « X est parti, Y est en pause », avertissement si le fichier diffère | Interface d'administrateur, réglages techniques | Le modèle mental est juste (attente mutuelle), l'habillage est trop technique |
| **Jellyfin SyncPlay / Plex Watch Together** | Attendre ceux qui tamponnent ; option de ne plus attendre | Groupes qui gèlent sans message, invitations à refaire à chaque session | Plex a retiré Watch Together de ses nouvelles applications en 2025 : le besoin existe et reste mal servi |
| **Disney+ GroupWatch / Hulu / Prime Watch Party** | Réactions émojis légères et immédiates | Communication limitée à des émojis, pas de voix | Un couple veut parler, pas seulement réagir |
| **Apple SharePlay (FaceTime)** | La voix et les visages comme point de départ ; notifications des gestes des autres (pause, avance) ; commandes partagées par défaut | Dépendance à l'écosystème Apple | Les directives d'Apple insistent sur le contrôle partagé, la présence et la notification des actions des autres |
| **Netflix** | Hero géant avec la séance du moment ; lignes horizontales (« Reprendre ») | Lecture automatique sonore, rangées infinies, algorithmes | Quarante films, pas quarante mille : l'abondance n'est pas le sujet |
| **Apple TV / Apple TV+** | Chrome minimal, l'affiche porte la couleur, grande aération | Noir pur absolu | Le noir pur fatigue en lecture longue et fait vibrer les halos ; la nuit prune est plus douce |
| **Mubi / Criterion Channel** | Titres éditoriaux en serif, ton de programmateur (« ce soir à l'affiche ») | Ton snob, grilles denses de métadonnées | Le goût est affaire de couple, pas de critique |
| **Letterboxd** | Fond sombre où les affiches sont les seules couleurs ; serif pour les titres, sans pour l'interface ; sobriété | Réseau social, notes, listes publiques | Canapé garde l'idée « le chrome s'efface devant les affiches » |
| **Plex / Jellyfin / Infuse** | Grille d'affiches, états « en cours de préparation », reprise de lecture | Densité de réglages, vocabulaire technique (codec, transcodage) à la une | Le vocabulaire technique reste dans la fiche, derrière un « Détails » |

### Ce qui rend l'expérience « intime »

Synthèse de la recherche (voir les sources) et des choix qui en découlent :

- **Se voir pendant le film**, pas seulement s'entendre : les couples cherchent des outils où webcam et micro sont à
  côté de la vidéo (TwoSeven, NeverFar, Scener). → vignettes toujours présentes, jamais cachées derrière un panneau.
- **Rituel plutôt que service** : une séance a une date, un lien, un compte à rebours, un moment « on lance ensemble »
  (3-2-1). La date prévue devient la première chose qu'on voit à l'ouverture (« Ce soir »).
- **Le pouvoir est partagé** : n'importe qui peut mettre en pause (on rit, on rattrape un message), et tout le monde
  voit qui l'a fait. Pas de « télécommande » réservée à l'organisateur.
- **Pas de bruit** : pas de notification inutile, pas de publicité, pas de suggestions. Un salon n'a pas de bandeau.
- **Reprendre où l'on s'est arrêté** et se rappeler ce qu'on a vu ensemble (historique) : c'est la mémoire du couple.

---

## 2. Notes de recherche (résumé des constats)

Limites : les sources sont des avis d'utilisateurs, des forums et des comparatifs commerciaux, rarement des études
UX formelles. Les constats ci-dessous sont les plus solides et sont présentés comme tels.

**Applications pour regarder ensemble**
- Teleparty : extension de navigateur, large compatibilité avec les services, mais la discussion vidéo ou vocale est
  réservée aux abonnés premium ; plaintes sur un chat en fenêtre séparée (plein écran cassé), sur l'impossibilité de
  voir qui tamponne et sur une interface mobile médiocre (Mozilla Add-ons, Trustpilot, App Store).
- Rave : applications natives partout, voix et texte, version gratuite avec publicités. Kosmi : dans le navigateur,
  sans installation, orienté jeux. Scener : le plus orienté vidéo pendant la lecture, extension de bureau.
- Disney+ GroupWatch : réactions émojis seulement. Hulu et Prime Watch Party : texte seulement. Apple SharePlay : la
  même chose avec un appel FaceTime par-dessus. (Sound & Vision, Tom's Guide.) Prime Watch Party aurait été arrêté
  en 2024 (source non officielle, à prendre avec précaution).
- Plex Watch Together : retiré des nouvelles applications en 2025, décalages de synchro et ré-invitations fréquentes
  rapportés sur le forum Plex. Jellyfin SyncPlay : groupes qui gèlent, avertissements d'attente, dépendance au
  réglage des proxys WebSocket ; la documentation prévoit qu'un client lent puisse « ne pas faire attendre » le
  groupe.
- Syncplay : modèle « prêt / pas prêt », pause si quelqu'un se déconnecte, messages à l'écran, avertissement quand
  les fichiers diffèrent, volume et pistes non synchronisés, pas de voix.
- Pour les couples (TwoSeven, NeverFar, Scener) : vidéo et caméras côte à côte, séance à deux, souvent comparées à
  Discord comme solution de repli (voix + partage d'écran).

**Médiathèques et streaming** : Letterboxd (fond charbon, affiches comme seule couleur, serif pour les titres et
sans pour le chrome : Tiempos et Graphik), Apple TV (chrome minimal), Netflix (hero + rangées, tuiles denses).
Mubi et Criterion Channel : non couverts par une source directe fiable dans cette recherche ; leurs partis pris
(titres éditoriaux, ton de programmateur) sont repris comme intention, pas comme mesure.

**Accessibilité (WCAG 2.2, W3C)** : 2.4.11 Focus non masqué (AA), 2.5.7 Déplacements par glissement (AA : tout
glisser-déposer a une alternative au clic), 2.5.8 Taille de cible 24×24 px minimum (AA), 3.3.7 Saisie redondante (A),
3.3.8 Authentification accessible (AA). 2.4.13 Apparence du focus (AAA) : on le vise (3:1, 3 px).

**Audio** : l'annulation d'écho du navigateur (`echoCancellation`) retire le son que renvoie le haut-parleur dans le
micro, mais l'annulateur peut « hacher » la voix quand deux sons se croisent (double conversation) ; avec un casque,
elle n'est plus utile. MDN : la contrainte accepte `true`, `false`, `"all"` ou `"remote-only"`. D'où les
recommandations de §3.9 et §5.5.

---

## 3. Système de design

### 3.1 Couleurs (thème sombre unique)

Canapé n'a **qu'un thème, sombre** (`color-scheme: dark`). Un thème clair n'apporte rien à un usage nocturne ;
il pourra venir plus tard par les mêmes jetons.

Valeurs de la version 2 (ratios dans la section « Version 2 » ci-dessus ; les ratios de ce tableau sont ceux de la 1.0 et ne sont plus à jour). Tous les contrastes sont calculés (formule WCAG 2.x). Seuils : texte 4,5:1, texte large (≥ 24 px ou 19 px gras)
3:1, composants d'interface et contours 3:1.

| Jeton | Valeur | Rôle | Contraste sur `--fond` | sur `--s2` |
|---|---|---|---|---|
| `--fond` | `#0d0c12` | arrière-plan de l'application | n.a. | n.a. |
| `--s1` | `#15141c` | cartes, barres, tiroirs | n.a. | n.a. |
| `--s2` | `#1d1b26` | champs, menus, bulles | n.a. | n.a. |
| `--s3` | `#282532` | survol, bulles reçues, rails | n.a. | n.a. |
| `--bord` | `#2f2c3b` | séparateurs décoratifs seulement (jamais seul porteur d'une information) | 1,5:1 | n.a. |
| `--bord-champ` | `#7d7790` | contour des champs, boutons secondaires, zone de dépôt | 4,6:1 | 3,9:1 (3,4:1 sur `--s3`) |
| `--texte` | `#f7f3ee` | texte principal | 16,2:1 | 13,7:1 |
| `--doux` | `#c0bacb` | texte secondaire | 8,9:1 | 7,5:1 |
| `--discret` | `#9f99ad` | légendes, aides, désactivé lisible | 6,0:1 | 5,1:1 (4,5:1 sur `--s3`) |
| `--lampe` | `#ffb347` | action, focus, progression, lien | 9,4:1 | 7,9:1 |
| `--lampe-vive` | `#ffc873` | survol de l'action, anneau de focus, poignée | 11,6:1 | 9,8:1 |
| `--lampe-sur` | `#1a1006` | texte sur fond lampe | 9,3:1 sur `--lampe` | |
| `--lampe-fond` | `rgba(255,179,71,.14)` | fond teinté (puces, bulles envoyées, zone de dépôt) | | |
| `--ok` (veilleuse) | `#5fdcae` | « ça va » : synchro, parle, prêt | 10,9:1 | 9,2:1 |
| `--alerte` | `#ffd166` | attention : connexion faible, préparation | 12,9:1 | 10,9:1 |
| `--mal` | `#ff7b6e` | erreur, micro coupé, danger | 7,6:1 | 6,4:1 |
| `--rose` | `#ff8fb4` | l'autre personne (nom dans le chat, marque sur la barre de temps) | 8,2:1 | 6,9:1 |

Règles d'emploi :
- Le texte sur surface : `--texte`, `--doux` ou `--discret` seulement. Jamais de texte `--bord-champ`.
- `--lampe` est la **seule** couleur de bouton principal. Un écran n'a qu'un bouton principal (deux au plus).
- **Pas de noir pur** (`#000`) sauf dans l'image du film elle-même (letterbox).
- Couleurs de présence (anneau et initiale des avatars, 6 teintes, texte `#16101c` dessus, tous ≥ 8:1) :
  `#ffb347` `#ff8fb4` `#8fc7f0` `#b4a2f0` `#9ad9a0` `#f0d27a`. Attribuées par l'ordre d'arrivée dans la séance
  (la première personne a toujours la lampe, la deuxième le rose : le couple retrouve ses couleurs).
- **Sur l'image du film** (commandes, légendes) : texte `#fff` sur dégradé noir `rgba(8,6,12,.9)` → transparent,
  minimum 4,5:1 même sur une image blanche ; vignettes à contour `rgba(255,255,255,.14)`.
- **La lueur** (l'élément de signature, §3.8) n'utilise que des couleurs tirées de l'image.

Format CSS (à placer dans `:root`, chaque jeton en variable) : voir le bloc `:root` de la maquette, qui peut être
copié tel quel.

### 3.2 Typographie

Deux familles, sous licence SIL OFL 1.1, **hébergées sur le serveur de Canapé** (aucune requête à Google Fonts) :

| Rôle | Police | Poids | Licence |
|---|---|---|---|
| Affiche, titre de page (h1), titres de film sur les affiches, grands chiffres (compte à rebours) | **Instrument Serif** | 400 romain (plus d'italique depuis la version 2) | OFL 1.1 |
| Interface, titres de section, corps de texte, chiffres | **Figtree** (variable, axe `wght` 300–900) | 400 à 700 | OFL 1.1 |

*Version 2 : Figtree remplace Figtree Grotesk (voir « Version 2 ») ; les adresses Fontsource ci-dessous valent pour Figtree
(`@fontsource-variable/figtree@5.3.0`, `figtree-latin-wght-normal.woff2` et `figtree-latin-ext-wght-normal.woff2`) ; l'italique d'Instrument Serif n'est plus embarqué.*

Pourquoi : Instrument Serif est un serif étroit, d'allure éditoriale (affiche, titre de film), qui fait ressortir les
titres sans les alourdir et tient bien en grande taille. Figtree Grotesk est un sans-serif humaniste, chaleureux
(courbes ouvertes), lisible aux petites tailles, avec des chiffres tabulaires. Les deux contiennent les caractères
français (accents, cédille, œ). Ils évitent les choix par défaut du moment (Fraunces + terracotta, Inter partout).

**Fichiers `woff2` à héberger** (sous-ensemble `latin` suffisant pour le français ; `latin-ext` en secours pour les
titres étrangers). Fontsource, via jsDelivr — à télécharger au moment de la construction et à placer dans
`client/static/polices/` :

```
https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.2.8/files/instrument-serif-latin-400-normal.woff2
https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.2.8/files/instrument-serif-latin-400-italic.woff2
https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.2.8/files/instrument-serif-latin-ext-400-normal.woff2
https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.2.8/files/instrument-serif-latin-ext-400-italic.woff2
https://cdn.jsdelivr.net/npm/@fontsource-variable/hanken-grotesk@5.2.8/files/hanken-grotesk-latin-wght-normal.woff2
https://cdn.jsdelivr.net/npm/@fontsource-variable/hanken-grotesk@5.2.8/files/hanken-grotesk-latin-ext-wght-normal.woff2
```

Taille : environ 21 Ko + 22 Ko (Instrument Serif latin) et 35 Ko (Figtree Grotesk latin). Les adresses ont été
vérifiées (réponse 200) le 12/11/2026. Alternative plus propre : installer les paquets npm `@fontsource/instrument-serif`
et `@fontsource-variable/hanken-grotesk` et laisser Vite copier les fichiers. Mettre les textes de licence OFL dans
`client/static/polices/LICENCES.txt`.

```css
@font-face{font-family:"Instrument Serif";font-style:normal;font-weight:400;font-display:swap;
  src:url(/polices/instrument-serif-latin-400-normal.woff2) format("woff2");
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
/* idem italique ; Figtree Grotesk : font-weight:100 900 */
```

Repli : `--titre: "Instrument Serif","Iowan Old Style","Palatino Linotype",Georgia,serif` ;
`--texte-police: "Figtree Grotesk",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`. Précharger
(`<link rel="preload" as="font" type="font/woff2" crossorigin>`) uniquement Instrument Serif normal et Figtree latin.

**Émojis des réactions** : ceux du système. Sur Linux sans police d'émojis, embarquer *Noto Color Emoji* (OFL) ;
décision à prendre si besoin, l'apparence varie selon la plateforme et c'est acceptable.

**Échelle** (rem, base 16 px ; le corps ne descend jamais sous 16 px sur mobile pour éviter le zoom automatique d'iOS
dans les champs) :

| Nom | Police | Taille / interligne | Usage |
|---|---|---|---|
| Affiche | Instrument Serif | 72 / 70 px (téléphone 44 / 44) | « Bonsoir Awa » |
| Titre 1 | Instrument Serif | 56 / 56 (téléphone 36 / 38) | titre de page, de film |
| Titre 2 | Figtree 700 | 24 / 29 (téléphone 20 / 24), `-0,02em` | sections |
| Titre 3 | Figtree 650 | 18 / 23 | titres de cartes, de dialogues |
| Corps | Figtree 400 | 16 / 24 | texte courant (longueur de ligne ≤ 65 caractères) |
| Corps fort | Figtree 600 | 16 / 24 | libellés, boutons (15 / 20 pour les boutons) |
| Petit | Figtree 400 | 14 / 20 | métadonnées, aides |
| Légende | Figtree 500 | 12 / 16 | étiquettes sur vignette (le minimum absolu) |
| Chiffres | Figtree 600 `tabular-nums` | 14–24 | durées, compte à rebours, tailles de fichier |

Règles : sentence case partout (jamais de capitales de remplissage) ; espacement des lettres 0 sauf titres
grands (`-0,01em`) ; pas de mot isolé en couleur ou en italique dans un titre ; les noms de films en Instrument
Serif, les autres éléments en Figtree ; les titres français suivent la règle typographique (espace insécable avant
`:`, `;`, `?`, `!` et « » : utiliser `&nbsp;` ou ` `).

### 3.3 Espacement, grille, rayons

- Unité de base **4 px**. Échelle : `4 8 12 16 20 24 32 40 56 72 96`.
- Page ordinateur : contenu à 40 px des bords, largeur maximale 1440 px centrée ; galerie en grille de
  `repeat(auto-fill, minmax(168px, 1fr))` (6 colonnes vers 1120 px), écart 28 px en hauteur et 20 px en largeur.
- Téléphone : gouttière 16 px, rangées d'affiches défilantes (carte de 104–120 px) ; galerie en 2 colonnes (3 en
  tablette).
- Points de rupture : 640 px (téléphone → tablette), 1024 px (tablette → ordinateur).
- Rayons (version 2) : `--r-s 8px` (menus, légende), `--r-m 12px` (champs, boutons, onglets), `--r-l 20px` (cartes), `--r-xl 28px`
  (modales, hero, tiroir de chat), `--r-affiche 12px` (affiches), `--r-pill 999px` (badges, puces, avatars).
- Zones sûres : `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
  env(safe-area-inset-left)` sur la barre d'onglets, la salle et les modales.

### 3.4 Élévation et ombres

On élève d'abord par la **surface** (plus clair = plus proche), ensuite par l'ombre :

| Niveau | Surface | Ombre | Usage |
|---|---|---|---|
| 0 | `--fond` | aucune | page |
| 1 | `--s1` | aucune, `1px solid --bord` | cartes, barres |
| 2 | `--s2` | `--ombre-2` : `0 8px 20px rgba(0,0,0,.38)` + reflet | affiches, menus |
| 3 | `--s3` | `--ombre-3` : `0 14px 36px rgba(0,0,0,.5)` + reflet | toasts, bulles |
| 4 | `--s2` | `--ombre-4` : `0 32px 90px rgba(0,0,0,.62)` + reflet | modales, chat |

Survol d'une affiche : monte de 4 px et ajoute `0 0 40px -6px var(--lueur)` (voir §3.8).

### 3.5 Flous

- Verre dépoli (`backdrop-filter: blur(18px)` + fond `rgba(28,24,36,.82)`) **uniquement** pour le tiroir de chat sur
  le film, la barre du menu de la maquette et le menu mobile qui passe sur une image. Ailleurs, des aplats.
- `blur(30–40px)` pour les halos de lueur (éléments décoratifs, `aria-hidden`).
- Si `backdrop-filter` n'est pas pris en charge, fond opaque `--s1` à .96 (`@supports not (backdrop-filter: blur(1px))`).

### 3.6 Mouvement

| Usage | Durée | Courbe |
|---|---|---|
| Survol, pression (boutons, cartes) | 120 ms | `cubic-bezier(.2,.7,.2,1)` (`--ease`) |
| Ouverture de menu, de tiroir, de toast | 220 ms | `--ease` |
| Changement d'écran, halo de la lueur qui change de film | 420 ms | `--ease` |
| Réaction flottante | 4,5 s | `--ease`, monte de 220 px et s'efface |
| Squelette | 1,6 s, en boucle | linéaire |

Principes : un seul mouvement d'entrée orchestré (la lueur de l'accueil qui s'allume en 420 ms au chargement) ;
pas d'entrée en fondu glissant sur chaque section ; le mouvement répond à une action (ouverture, confirmation)
ou signale un événement (réaction, arrivée).

**`prefers-reduced-motion: reduce`** : durées ramenées à ~0, plus de survol qui monte, squelettes fixes, réactions
**remplacées** par une rangée statique « Léa a envoyé 😂 » en bas du chat (le sens est conservé), compte à rebours
sans animation d'échelle (le chiffre change simplement), pas de défilement fluide, pas de lecture automatique
d'aperçus. Le réglage est aussi proposé dans « Mon compte → Mouvement réduit » (cases : Système / Toujours).

### 3.7 Iconographie

**Lucide** (licence ISC, `lucide.dev/license` ; les icônes issues de Feather sont MIT : conserver les deux mentions
dans `LICENCES.txt`). Paquet : `@lucide/svelte` (Svelte 5), qui importe **uniquement** les icônes utilisées (poids
négligeable), rendues en SVG intégré. Trait de 1,75 px (`stroke-width`), bouts ronds, taille 20 px (16 px dans les
puces, 24 px pour les commandes du lecteur), couleur `currentColor`. Pas de remplissage, sauf le triangle de lecture
(rempli). Icônes retenues : `play`, `pause`, `rotate-ccw`, `rotate-cw`, `volume-2`, `volume-x`, `mic`, `mic-off`,
`video`, `video-off`, `message-circle`, `maximize`, `minimize`, `subtitles`, `languages`, `headphones`, `wifi-low`,
`triangle-alert`, `search`, `plus`, `upload`, `check`, `x`, `link`, `calendar`, `house`, `clapperboard`, `film`,
`users`, `user`, `send`, `chevron-right`, `settings`, `hard-drive`, `sofa`, `popcorn`, `copy`, `trash-2`.
Les icônes de la maquette sont des reproductions approchées (pas de dépendance) ; en production, prendre les
originales du paquet. Toute icône seule porte un `aria-label` (ou un texte masqué `.vh`) ; une icône à côté d'un
texte est `aria-hidden`.

Pas de pictogrammes dessinés sur mesure sauf le logo.

### 3.8 Éléments de signature

1. **La lueur.** Une couleur dominante (ou deux) tirée du film (affiche ou image du film, calculée côté serveur à la
   création de la fiche et stockée sous forme `#rrggbb` ; repli : lampe `#f4a85b`). Elle sert :
   - à l'**accueil** : halo flou derrière l'affiche de la séance de ce soir (`radial-gradient` + `blur(30px)`) ;
   - à la **salle** : la pièce autour de l'image est éclairée par les couleurs de l'image (à 75 % d'opacité), avec
     un changement doux (420 ms) quand le film change ;
   - au **survol d'une affiche** : ombre colorée discrète.
   Elle n'a jamais d'effet sur le texte (aucun texte n'est posé sur une lueur sans fond opaque) et reste
   décorative (`aria-hidden`).
2. **Le logo « deux coussins ».** Deux coussins arrondis qui se chevauchent (lampe et rose) sur une assise claire :
   un canapé pour deux, lu sans légende. Marque seule (32 px) ou avec le mot « Canapé » en Instrument Serif 30 px.
   SVG dans la maquette (symbole `i-logo`), à décliner en icônes d'application (§7).
3. **Les couleurs du couple.** La première personne dans une séance est lampe, la deuxième rose : mêmes couleurs sur
   l'anneau de la caméra, le nom dans le chat, la marque sur la barre de temps (voir §4.4), la pile d'avatars.
4. **Titres en serif, interface en sans.** Un nom de film est toujours en Instrument Serif, même sur une affiche
   générée (les films sans affiche reçoivent un dégradé propre et leur titre en grand : ils sont presque plus
   beaux que ceux qui en ont une).
5. **Le canapé en repos.** À la fin d'un film (dernière image), un écran silencieux « C'était bien. » avec le
   temps passé ensemble et un bouton « Choisir le prochain » : seul instant où l'on parle de la relation, sans
   gadget (une phrase, pas d'animation).

### 3.9 Audio (conseil et comportement)

- **Conseil du casque** : à l'entrée dans la salle, bandeau discret, une fois (case « Ne plus afficher ») : « Un
  casque évite l'écho : sans casque, le film repart dans le micro. » Dans la barre de commandes, une puce « Casque
  conseillé » tant que l'appareil ne déclare pas de sortie casque (`enumerateDevices` : étiquette contenant
  « head », « casque », « bluetooth », « airpods » ; c'est un indice, pas une certitude).
- **Volumes séparés** : curseur « Film » et curseur « Voix » dans un menu (icône haut-parleur), plus un curseur
  par personne (clic droit / appui long sur sa vignette). Le volume d'une personne n'affecte qu'elle chez toi.
- **Baisse automatique du film quand quelqu'un parle** (« voix par-dessus ») : option activée par défaut, réglage
  `Mon compte → Son`. Quand une voix distante dépasse −45 dBFS pendant 200 ms, le film descend à 35 % de son volume
  (rampe de 150 ms), remonte 600 ms après la fin de la parole (rampe de 400 ms). Aucune baisse sur son propre micro
  (évite l'effet pompage). C'est le même principe que le ducking des applications de téléphonie et de Discord ; ici
  il s'applique côté lecteur (`GainNode`), donc sans toucher à l'écho.
- **Écho** : par défaut `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true` ; si un casque
  est détecté (ou case « J'ai un casque »), `echoCancellation: false` et `autoGainControl: false` pour éviter les
  voix hachées en double parole (constat des listes WebRTC : l'annulateur peut couper un sens quand l'autre parle).
  Un indicateur « Écho détecté » (niveau du micro corrélé au film) propose de passer au casque.

---

## 4. Composants

Conventions : hauteur minimale des cibles 44 px (24 px absolu pour les icônes seules à l'intérieur d'un élément
déjà de 44 px) ; état focus : `outline: 3px solid var(--lampe-vive); outline-offset: 3px`, jamais retiré ; états
`:hover` (sur pointeur fin seulement, `@media (hover:hover)`), `:active` (échelle .97), `[disabled]` (opacité .45,
`cursor: not-allowed`, et le texte reste ≥ 3:1).

### 4.1 Boutons

| Variante | Fond / texte / contour | Usage |
|---|---|---|
| Primaire | `--lampe` / `--lampe-sur` / aucun ; survol `--lampe-vive` | l'action principale de l'écran |
| Secondaire | `--s2` / `--texte` / 1 px `--bord-champ` ; survol `--s3` | actions de second rang |
| Discret | transparent / `--doux` ; survol `--s2` | annuler, plus tard |
| Danger | transparent / `--mal` / 1 px `--mal` ; confirmé : fond `--mal`, texte `#2a0d0a` | supprimer |
| Rond (icône) | 44 × 44, rond | commandes, fermer |
| Gros | 56 px de haut, 28 px de marge | « Entrer dans la salle », « Lancer une séance » |

Forme pilule, 15 px, `font-weight: 600`, icône à gauche à 8 px. Un bouton qui lance un traitement long passe en
état « en cours » (anneau 18 px, texte « Envoi… »), reste cliquable seulement pour annuler. Pas de flèche `→`
ajoutée au texte.

### 4.2 Champs

Hauteur 48 px, rayon 14 px, fond `--s2`, contour `--bord-champ` (3,9:1), texte 16 px. Libellé **au-dessus** (pas de
libellé flottant), aide dessous en `--discret`. Erreur : contour `--mal` **et** icône `triangle-alert` **et** texte
(« 12 caractères au minimum. Il en manque 7. ») : jamais la couleur seule, et message relié par `aria-describedby`,
champ `aria-invalid="true"`. Mot de passe : bouton « Afficher » (accessibilité WCAG 3.3.8 : coller et gestionnaire
de mots de passe autorisés, `autocomplete` correct). Recherche : icône à gauche, pilule, `type="search"`.

### 4.3 Cartes d'affiche

Ratio 2:3, rayon 10 px, ombre niveau 2.
- **Avec affiche** : image TMDB ou image tirée du film (recadrée en 2:3 par le haut du sujet, `object-fit: cover`),
  dégradé de pied `rgba(0,0,0,.55)` pour les badges et la barre de reprise.
- **Sans affiche** : dégradé diagonal à partir d'une teinte dérivée du titre (`hsl(hash(titre) % 360, 38%, 30%)` →
  même teinte à 12 % de clarté), un voile noir en pied, **le titre en Instrument Serif 24 px blanc** (jusqu'à 3 lignes,
  tronqué avec `…`), l'année en dessous en Figtree 12 px. Contraste du texte blanc ≥ 7:1 (la clarté plafonne à 30 %).
- Sous l'affiche : titre (Figtree 600, 15 px, 2 lignes), « année · durée » (`--discret`, 14 px).
- Badges (coin haut gauche, puces à fond `rgba(20,17,26,.8)`) : `Prêt` (vert, coche), `Préparation 62 %` (jaune),
  `Son non lisible` (rouge), `Partagé` (rose, icône `users`), `Nouveau`.
- Barre de reprise : 5 px de lampe au pied de l'affiche, longueur = progression.
- États : survol (+4 px, lueur), focus (anneau lampe 3 px autour de l'affiche), sélection (case en coin si en mode
  « Sélectionner »), chargement (squelette 2:3 + deux lignes).
- Toute la carte est un lien (`<a>`) ; `aria-label="Les Heures bleues, 2023, 1 h 52, prêt"`.

### 4.4 Téléversement

Chaque fichier est une carte (rayon 14, `--s1`, 1 px `--bord`) : vignette 48 px (icône `upload`) · nom (tronqué
au milieu pour garder l'extension) · barre de progression 6 px · ligne de détails (« 64 % · 2,7 Go sur 4,2 Go · 12
Mo/s · il reste 2 min », chiffres tabulaires) · actions.
- **En cours** : barre lampe ; action « Mettre en pause » (`pause`) et « Annuler » (`x`, confirmation si > 5 %).
- **En pause** : barre `--doux`, texte « En pause à 31 % : on reprend où on s'est arrêté. », action « Reprendre ».
- **Reprise automatique** après coupure : texte « Connexion perdue. Nouvel essai dans 4 s… » puis barre repart, sans
  intervention (tus gère déjà la reprise) ; au bout de 5 essais, état erreur.
- **Erreur** : contour `rgba(255,127,112,.6)`, icône `triangle-alert`, message précis (« Connexion perdue à 78 %.
  Rien n'est perdu, reprenez quand elle revient. » / « Fichier trop lourd pour votre espace : il manque 3 Go. » /
  « Ce fichier n'est pas une vidéo. ») et un bouton « Reprendre » ou « Libérer de l'espace ».
- **Terminé** : coche verte, « Reçu. Préparation de la fiche… » puis la carte se transforme en carte d'affiche
  (squelette → image) avec le toast « Les Heures bleues est prêt. ».
- **Zone de dépôt** : bande à contour pointillé `--lampe` et fond `--lampe-fond` quand un fichier est survolé sur la
  page ; sinon, simple bouton « Ajouter un film » dans la barre (la zone n'encombre pas la galerie).
- La barre porte `role="progressbar"` + `aria-valuenow`, et un `aria-live="polite"` annonce 25, 50, 75, 100 %.

### 4.5 Commandes du lecteur

Barre sur dégradé `transparent → rgba(8,6,12,.9)`, marge 24 px (16 px sur mobile).
- **Rangée du haut** : temps écoulé · barre de temps · durée (chiffres tabulaires). Barre de 6 px (10 px au survol,
  zone de pointeur de 32 px de haut). Trois couches : fond `rgba(255,255,255,.22)`, tampon `rgba(255,255,255,.28)`,
  lu `--lampe`. **Poignée** 16 px `--lampe-vive` avec halo `0 0 0 5px rgba(244,168,91,.25)`. **Marque de l'autre
  personne** : petit rond à contour rose posé sur la barre à *sa* position quand elle diffère de la tienne de plus
  de 5 s (voir §5.5, rattrapage). Info-bulle de survol : temps + vignette si disponible.
- **Rangée du bas, de gauche à droite** : Lecture/Pause (52 px, rond clair `--texte`/`--fond`) · reculer 10 s · avancer
  10 s · volume (icône + rail 92 px) · puce « Casque conseillé » · *espace* · **réactions** (8 émojis, boutons de 40
  px dans une pilule) · | · langue et sous-titres · micro · caméra · discussion · plein écran.
- États des boutons rond : repos transparent ; survol `rgba(255,255,255,.12)` ; **actif** (`--lampe-fond` + texte
  `--lampe`) pour discussion ouverte / caméra allumée ; **coupé** (`rgba(255,127,112,.16)` + texte `--mal` + icône
  barrée) pour micro coupé.
- Clavier : `Espace`/`K` lecture-pause, `←/→` ±10 s (`Maj` = ±30 s), `↑/↓` volume, `M` micro, `V` caméra, `C` chat,
  `F` plein écran, `S` sous-titres, `1`–`8` réactions, `?` liste des raccourcis. Les raccourcis sont désactivés
  quand un champ a le focus.
- Chaque commande a un `aria-label` en français et une info-bulle (apparaît après 600 ms). La barre de temps est un
  `role="slider"` (`aria-valuetext="1 h 12 min 48 s sur 1 h 52 min"`, pas de ±1 s au clavier).

### 4.6 Vignettes caméra

Rapport 4:3, 176 px de large sur ordinateur (réglable 128–288), 92 px en paysage téléphone. Rayon 14 px, contour 2
px `rgba(255,255,255,.14)`, ombre niveau 3. Étiquette de pied : nom (Figtree 600, 12 px) sur dégradé noir ; pour soi :
« Awa (moi) » et image en miroir.
- **Parle** : contour 3 px `--ok` + halo `0 0 0 3px rgba(111,217,177,.3)` ; 150 ms d'attaque, 600 ms de relâchement
  (évite le clignotement). Un picto n'est pas nécessaire : le contour porte l'information, mais l'étiquette passe
  en `--ok` et `aria-label="Léa parle"` est mis à jour.
- **Micro coupé** : icône `mic-off` rouge à droite de l'étiquette (le texte du nom ne change pas).
- **Caméra coupée** : fond `--s3`, initiale en Instrument Serif 48 px dans un rond de la couleur de présence ; icône
  `video-off` à côté du nom.
- **Connexion faible** : puce jaune en haut à gauche (`wifi-low` + « Connexion faible »), l'image garde sa dernière
  qualité ; si la caméra est perdue plus de 8 s, retomber sur l'état « caméra coupée » avec « Connexion perdue »
  et nouvelle tentative automatique.
- **Connexion en cours** : initiale + anneau qui tourne autour (1,1 s), pas de puce.
- **Déplaçables** : glisser par n'importe quelle vignette ; **alternative sans glisser** (WCAG 2.5.7) : menu de la
  vignette (clic ou `Entrée`) → « Placer en haut à gauche / haut à droite / bas à gauche / bas à droite ».
  Position mémorisée par appareil (stockage local). Se magnétise aux coins. Double clic : agrandir (288 px) puis
  réduire ; dans le menu : « Masquer toutes les caméras » (reviennent à un geste).
- **Mode « rangée »** (par défaut sur téléphone, optionnel sur ordinateur) : les vignettes sortent du film et se
  placent dans une rangée sous l'image (voir §5.5).

### 4.7 Avatars et présence

Rond 36 px (24 px en chat, 56 px en tête de profil), initiale du prénom (Figtree 600) sur la couleur de présence, texte
`#16101c`, contour 2 px `--fond` (pour se chevaucher proprement). Pastille verte 12 px = présent dans la salle ; pas de
pastille = absent. **Pile d'avatars** (chevauchement −10 px) pour une séance : « Awa, Léa et 2 autres ». Pas de photo
de profil en 1.0 (les caméras servent de visage ; fonction éventuelle en §8). Dans la salle, la pile est en haut à
droite de la barre supérieure ; au survol/au toucher : liste avec « micro / caméra / connexion » par personne.

### 4.8 Réactions

Huit émojis fixes (😂 ❤️ 😱 😭 🔥 👏 😮 🍿), boutons de 40 px (38 px mobile) dans une pilule `rgba(20,17,26,.7)`.
- **Envoi** : un clic = une réaction ; maintenir = rafale à 4/s, limitée côté serveur (5/s). Retour tactile
  `navigator.vibrate(8)` si disponible.
- **Affichage** : l'émoji monte de 220 px en 4,5 s, avec dérive horizontale aléatoire de ±24 px, grossit de .6 à 1 en
  120 ms puis s'efface ; il part du **bord de la vignette de l'auteur** si les caméras sont visibles, sinon du bas
  (zone 55–75 % de la largeur). Pas plus de 12 émojis à l'écran (les plus anciens disparaissent). Taille 38 px
  (28 sur téléphone), `drop-shadow` léger. Les siennes sont un peu plus petites (88 %) et plus transparentes
  (80 %) : on réagit, sans se noyer.
- **Mouvement réduit** : aucun mouvement ; ligne d'information en bas du chat « Léa : 😂 » pendant 2 s.
- **Lecteur d'écran** : annoncées par une zone polie, regroupées (« Léa a réagi 3 fois : rire »).

### 4.9 Chat

Tiroir sur ordinateur (300 px, rayon 22 px, verre dépoli) posé sur le film **du côté opposé aux vignettes** (à gauche quand elles sont à droite, comme dans la maquette), ouvert par le bouton
`message-circle` ou `C`, fermé par `Échap`. Sur tablette et téléphone : tiroir plein-largeur depuis le bas,
hauteur 55 % (portrait), ou volet droit (paysage).
- Messages : bulle `--s3` (reçus, coin haut-gauche à 4 px), bulle `--lampe-fond` (envoyés, alignés à droite, coin
  haut-droit à 4 px), nom de l'auteur au-dessus en couleur de présence (une seule fois par série), heure au survol.
- Messages système (centre, `--discret`, 13 px) : arrivée, départ, changement de piste/film, pause.
- **Nouveau message quand le tiroir est fermé** : pastille lampe sur l'icône de chat et un aperçu discret de 4 s (une
  ligne, 280 px de large, au-dessus des commandes) ; pas de son par défaut. Après 3 s sans nouveau message, l'aperçu
  disparaît.
- Saisie : pilule 40 px, `Entrée` envoie, `Maj+Entrée` retour à la ligne, 500 caractères (compteur visible à 450),
  texte brut avec liens non cliquables (pas de risque, pas de prévisualisation).
- `role="log"`, `aria-live="polite"` ; les 50 derniers messages sont conservés à l'ouverture.

### 4.10 Toasts

Pilule `--s3`, contour `--bord-champ`, ombre niveau 3, icône ronde de 28 px (teinte selon le type), texte 14–15
px. Pile verticale de 3 au plus, en haut au centre de la salle, en bas au centre ailleurs (au-dessus de la barre
d'onglets sur mobile). Durée 4 s (6 s si une action « Annuler » est proposée ; ne s'arrêtent pas quand le pointeur
est dessus). Pas de toast pour une erreur qui bloque : utiliser un bandeau ou une modale. `role="status"`
(`role="alert"` pour une erreur). Le texte reprend le verbe du bouton qui l'a déclenché (« Copier le lien » →
« Lien copié. »).

### 4.11 Modales

Fond `--s2`, rayon 22, largeur max 440 px, ombre niveau 4, voile `rgba(8,6,12,.7)`. Titre en Instrument Serif 29 px,
texte `--doux`, boutons alignés à droite (secondaire à gauche du primaire ; danger = primaire rouge). Piège de focus,
fermeture par `Échap` et par clic sur le voile (sauf destruction), retour du focus à l'élément déclencheur,
`role="dialog" aria-modal="true" aria-labelledby`. Sur téléphone : feuille qui monte du bas (rayon 22 en haut),
poignée de 36 × 4 px.

### 4.12 Menus

Fond `--s2`, contour `--bord-champ`, rayon 14, marge 6 px, lignes de 44 px, survol `--s3`, séparateurs `--bord`.
`role="menu"`, flèches ↑↓, `Échap`, première lettre. Action destructive en `--mal`, séparée en bas.

### 4.13 Onglets et segments

Onglets « pilule » (fond `--s1`, 1 px `--bord`, élément actif `--s3`, 36 px de haut, texte 14–15 px).
`role="tablist"`, flèches ← →. En barre du bas sur téléphone (4 entrées : Ce soir, Films, Séances, Moi) : icône 20
px + libellé 11 px, élément actif en `--lampe`.

### 4.14 États vides

Bloc centré : icône `--lampe` (24 px), titre en Instrument Serif 27 px, une phrase `--doux`, **un seul** bouton
primaire. Fond `--s1`, contour 1,5 px pointillé `--bord-champ`, rayon 22. Voir les textes en §6.

### 4.15 Chargements

Squelettes : même forme que le contenu (affiche 2:3, ligne de titre 14 px × 70 %, ligne de détail 12 px × 40 %),
dégradé qui glisse (1,6 s). Pas de roue qui tourne pour un contenu qui a une forme. Pour les actions (attente de la
lecture, connexion) : anneau de 46 px à contour 3 px `--lampe`. Délai de 150 ms avant affichage (pas de clignotement
pour les chargements courts). Mouvement réduit : squelette statique.

### 4.16 Fiche (détails d'un film), badges, tags

Puces 28 px (rayon pilule, texte 13 px) : tonalités neutre / ok / alerte / mal / lampe. Chaque puce avec icône ou
texte explicite.

---

## 5. Écrans

### 5.0 Navigation générale

- **Ordinateur** : barre en haut, 72 px de haut, bordure inférieure `--bord` : logo (à gauche) · onglets « Ce soir,
  Films, Séances, Historique » · bouton secondaire « Ajouter un film » · avatar (menu : Mon compte, Administration
  si admin, Se déconnecter). Pas de barre latérale.
- **Téléphone** : barre d'onglets en bas (Ce soir, Films, Séances, Moi) ; l'administration est dans « Moi ». En-tête
  réduit (logo, bouton Ajouter).
- Dans la salle : pas de navigation générale (écran immersif, bouton Quitter en haut à gauche).
- Retour : `Échap` ferme les panneaux, jamais la salle ; « Quitter » demande confirmation seulement si la lecture
  est en cours et que d'autres sont présents.

### 5.1 Connexion et invitation

**Connexion (ordinateur et téléphone)** : fond `--fond` avec une lueur ambre en haut à droite très douce (aucun
rideau, aucune image), au centre une colonne de 400 px : le logo (48 px), une phrase d'accroche en Instrument Serif
(« Le même film, au même instant, chacun chez soi. »), puis la carte (champ identifiant, champ mot de passe avec
« Afficher », bouton primaire « Se connecter »). Aide discrète : « Pas de compte ? Il faut une invitation. »
Erreur : « Identifiant ou mot de passe incorrect. Il reste 3 essais avant une courte pause. ». Limite de débit :
« Trop d'essais. Réessayez dans 1 minute. » (avec un compte à rebours visible).

**Invitation** (lien `/invitation/:jeton`) : même page, titre « Léa vous invite chez elle. » (prénom de la personne qui
invite), prénom suggéré pré-rempli, trois champs (prénom, identifiant, mot de passe avec jauge de longueur, pas de
règles de composition imposées), bouton primaire « Créer mon compte ». Jeton invalide ou expiré : état vide « Ce lien
a expiré. Demandez-en un nouveau à Léa. ». Réinitialisation : même mise en page, « Nouveau mot de passe ».

**Première installation** (`installationRequise`) : « Bienvenue chez vous. Créons le compte administrateur. » (trois champs
et c'est tout).

### 5.2 Accueil « Ce soir »

Ordinateur (maquette : section Accueil) :
1. Date en `--doux` (« Vendredi 13 novembre »), titre Affiche « Bonsoir Awa, Léa arrive à 21 h. » (la phrase s'adapte :
   séance du jour avec heure, ou « Qu'est-ce qu'on regarde ? », ou « Reprenez où vous en étiez. »).
2. **Carte « Ce soir »** (le moment de bravoure) : affiche 220 px à gauche avec lueur, à droite puce « Séance de ce
   soir · 21 h 00 », titre du film (Instrument Serif 54 px), résumé 2 lignes, pile d'avatars des invités avec leur
   état (« Léa n'est pas encore là. Ouverture de la salle à 20 h 45. »), boutons « Entrer dans la salle » (primaire,
   gros ; désactivé avant l'ouverture avec « La salle ouvre à 20 h 45 ») et « Copier le lien » ; compte à rebours en
   chiffres tabulaires (« dans 2 h 10 »). Sans séance ce soir : la carte devient « Pas de séance ce soir. » avec
   « Lancer une séance » et la dernière séance en cours (« Reprendre Un été à Sète avec Léa »).
3. Ligne **Reprendre** (affiches avec barre de progression, « Arrêté à 0 h 52 · avec Léa »).
4. Ligne **Ajoutés récemment** (6 affiches, nom de la personne qui l'a ajouté).
5. Bouton « Lancer une séance » toujours accessible (barre supérieure ou bouton flottant sur mobile).

Téléphone : le titre passe à 42 px, la carte « Ce soir » s'empile (affiche 120 px au-dessus), les lignes d'affiches
défilent horizontalement (cartes 104 px). Barre d'onglets en bas. Premier écran pour un nouvel utilisateur sans
film : l'état vide « Rien à l'affiche pour l'instant » avec « Ajouter un film ».

### 5.3 Galerie

(Maquette : section Galerie.) Titre Titre 1 « Films ». Rangée d'outils : onglets (Tous · Les miens · Partagés avec moi,
avec les nombres), champ de recherche (titre, année, nom de la personne), puce d'espace (« Vos films : 31 Go sur
100 Go », ambre à 85 %, rouge à 100 %), tri (menu : Récents, Titre, Durée). Les filtres vivent dans l'adresse
(`?filtre=miens&q=…`) pour pouvoir les partager.
- **Téléversement** : bouton primaire « Ajouter un film » (barre) ; glisser un fichier n'importe où sur la page
  déclenche un voile plein écran « Déposez pour envoyer » (contour pointillé lampe). La pile des envois en cours
  s'insère **au-dessus de la grille**, et se réduit en pastille dans la barre (« 2 envois · 64 % ») quand on
  navigue ailleurs (l'envoi continue, le service de reprise tus tient la file). Plusieurs fichiers : envois en
  série (un à la fois), avec file visible.
- **Grille** : cartes d'affiche (§4.3). Un clic ouvre la fiche. Menu contextuel (clic droit / appui long / bouton
  « ⋯ ») : Lancer une séance · Partager · Supprimer.
- **Vide** : « Rien à l'affiche pour l'instant. Déposez un film ici, il sera prêt à regarder dès qu'il est arrivé. »
- **Recherche sans résultat** : « Aucun film ne s'appelle “Lointan”. Vous cherchiez “Lointain” ? »
- Téléphone : 2 colonnes, filtres en pilules défilantes, recherche en tête, bouton Ajouter dans la barre. Sur iOS,
  le sélecteur de fichiers est celui du système (le glisser-déposer n'existe pas : le bouton « Choisir un film »
  occupe toute la largeur sous la recherche s'il y a peu de films).

### 5.4 Fiche d'un film

Page à deux colonnes (ordinateur) : à gauche l'affiche 280 px (lueur dessous) ; à droite : titre (Titre 1), « année ·
durée · réalisateur » (`--doux`), résumé (≤ 65 caractères par ligne), puces (« Lisible partout », « 2 pistes audio »,
« Sous-titres : français, anglais »), boutons : **« Lancer une séance »** (primaire), « Regarder seul » (secondaire,
ouvre la salle sans invité), « Partager » (menu : Pas de partage · Certaines personnes · Tout le monde).
Sections repliables dessous : **Pistes et sous-titres** (liste, langue par défaut), **Détails techniques** (codec,
conteneur, taille, mode de lecture : direct / son converti / image convertie) avec le vocabulaire expliqué en une
phrase, **Préparation** (« Préparer ce film pour qu'il se lance plus vite » + progression, file d'attente), **Historique de
ce film** (dates, avec qui, jusqu'où). Propriétaire et admin : « Modifier la fiche » (titre, année, affiche : choisir
une image du film ou TMDB), « Supprimer » (modale danger : « Supprimer Les Heures bleues ? Les séances prévues avec ce
film seront annulées. »).
Téléphone : affiche 140 px en tête centrée, boutons pleine largeur, sections en accordéon.

### 5.5 Séances

**Liste** : onglets « À venir · Passées ». Chaque séance est une ligne-carte : mini-affiche 64 px, titre du film,
date en toutes lettres (« samedi 14 novembre, 21 h »), pile d'avatars avec leur état (invité / a répondu / présent),
bouton « Entrer » (actif à partir de l'ouverture) ou « Voir ». Séance du jour mise en tête avec une bordure lampe.
Vide : « Aucune séance prévue. Choisissez un film et fixez une heure. » + « Lancer une séance ».

**Création** (modale sur ordinateur, feuille plein écran sur téléphone), 3 étapes courtes sur un seul écran, pas de
fenêtre en plus :
1. **Film** (liste d'affiches avec recherche, préselectionné s'il vient d'une fiche).
2. **Quand** : « Maintenant » ou date et heure (sélecteur natif `datetime-local`, par défaut ce soir 21 h), note
   facultative (« Apporte du pop-corn »).
3. **Qui** : cases des comptes existants (avatars), + « Inviter quelqu'un par lien ». Le bouton primaire est « Créer la
   séance ». Après création : écran de succès avec le lien en champ à copier + boutons « Copier le lien »,
   « Partager » (Web Share API sur mobile), puis « Entrer dans la salle ».

**Invitation par lien** : page de séance `/seance/:id` avec affiche, date, pile d'invités, bouton « Rejoindre ».
Quelqu'un sans compte arrive sur la connexion, puis revient à la séance. Le message à coller est pré-rédigé :
« Ce soir 21 h, on regarde Les Heures bleues. Voici le lien : … ».

### 5.6 La salle (détail)

**Principe** : un seul conteneur plein cadre (`.salle`) contient film, vignettes, commandes, chat, réactions, toasts,
états. Le plein écran s'applique **à ce conteneur** (`element.requestFullscreen()`), jamais à la vidéo seule. Sur
iOS Safari iPhone, qui ne permet pas le plein écran d'un conteneur : la mise en page se rabat sur « plein cadre »
(position fixe, `100dvh`, barre d'URL masquée) et la salle reste complète.

**Disposition ordinateur (> 1024 px)**
```
┌────────────────────────────────────────────────────────────────────┐
│ ‹  Les Heures bleues              ● Synchro   (A)(L)   [barre haut]│
│                                                     ┌────────┐     │
│            F I L M  (16:9, centré,                  │ Léa    │ ← vignettes
│            éclairé par la lueur)                    ├────────┤     │
│  ┌ chat ┐                                       │ Moi    │     │
│  │      │                                       └────────┘     │
│ 01:12 ━━━━━━━━●━━━━━━━━━━━━━━ 01:52                                 │
│ ▶ ↺ ↻ 🔊───  Casque conseillé      😂❤️😱😭🔥👏😮🍿 | CC 🎙 📹 💬 ⛶ │
└────────────────────────────────────────────────────────────────────┘
```
- Le film est contenu dans le cadre (`object-fit: contain`), centré ; la pièce autour est la lueur (couleurs du
  film à 75 %, flou 40 px) ; la barre supérieure et les commandes sont des dégradés sombres posés **sur** l'image
  (elles ne rognent pas le film).
- Vignettes : en haut à droite par défaut, pile verticale, déplaçables, mémorisées. Sur écran < 1100 px de large :
  176 → 144 px.
- Chat : tiroir de 300 px, du côté opposé aux vignettes, au-dessus des commandes, fermé par défaut au premier lancement, ouvert
  ensuite selon la dernière préférence.
- **Ce qui apparaît et disparaît** : en lecture, après **3 s** sans mouvement du pointeur ni de touche, la barre
  supérieure, les commandes et les noms sous les vignettes s'effacent (fondu 220 ms) et le curseur se cache ;
  les vignettes restent, **sans** nom. Tout revient au moindre mouvement. En pause, rien ne disparaît. Ne
  disparaissent jamais : le toast en cours, un compte à rebours, l'état d'attente, un focus clavier (si une
  commande a le focus, la barre reste).
- **Barre supérieure** : bouton Quitter (`chevron` retourné) · titre du film (Instrument Serif 24 px) · indicateur
  de synchro · pile d'avatars. L'indicateur de synchro :
  - vert « Tout le monde est au même point » (écart < 0,3 s) ;
  - jaune « Léa est 2 s en retard » (> 1 s, rattrapage en cours, mention de la vitesse 0,95/1,05 si active) ;
  - rouge « Synchro perdue — Resynchroniser » (bouton qui rattrape la position du groupe) ;
  - texte toujours présent (pas seulement la pastille), détails au clic (écart par personne, latence serveur).

**Commandes partagées** : tous peuvent lire, mettre en pause, avancer, reculer, choisir la piste audio et les
sous-titres (règle de l'architecture). Chaque geste est annoncé par un toast de 2,5 s avec le **nom** : « Léa a mis en
pause », « Awa a avancé à 1 h 14 min », « Léa a mis les sous-titres en français ». Les gestes rapprochés se
regroupent (pas plus d'un toast à la fois par type). Changer de piste audio ou de film remet tout le monde en pause à
la même position (règle de l'architecture) : le toast le dit (« Awa a changé la langue : VO. Tout le monde est en
pause. »).

**Compte à rebours 3-2-1** : bouton « Lancer ensemble » à côté de Lecture (visible en pause). Au clic, le film
se floute légèrement (`blur(2px)`, 40 % d'obscurité) et un chiffre en Instrument Serif 104 px apparaît au centre
(3, 2, 1, chacun 1 s, remplacé instantanément, avec fondu de 200 ms), sous le texte « Awa a lancé le compte à
rebours. » ; à 0, le voile se retire et le film part. Bouton « Annuler » visible. Mouvement réduit : le chiffre change
sans animation. Il est lu par le lecteur d'écran (`aria-live="assertive"` pour 3, 2, 1).

**Attente mutuelle** : si quelqu'un tamponne ou n'a pas chargé, voile léger sur le film (anneau + « On attend Sam… » en
Instrument Serif 27 px + « Son film charge encore. Ça reprend dès qu'il est prêt. »), avec le bouton « Ne plus
attendre Sam » (reprend sans lui ; il rattrape ensuite, et on ne le lui reproche pas). Si l'attente dépasse 20 s :
suggestion « Sam a peut-être une connexion lente. Baisser la qualité pour lui ? » (réservée à la conversion à la
volée, si disponible). Pour la personne qui attend, l'écran dit « Votre film charge… 62 % ».

**Reprise** : quand on entre dans une salle dont le film a déjà une position enregistrée : « Reprendre ici ? Vous vous
étiez arrêtés à 0 h 52 avec Léa. » avec « Reprendre à 0:52 » (primaire) et « Depuis le début ».

**Réactions** : voir §4.8 ; les réactions flottent devant les vignettes mais derrière les commandes.

**Rattrapage (« tu es en avance / en retard »)** : au-delà de 5 s d'écart, une marque rose apparaît sur la barre de
temps (position de l'autre) ; discrètement, un bouton « Rejoindre Léa » (aller à sa position).

**Sous-titres** : réglage partagé (la langue et la présence sont communes), **mais le style est personnel** (taille,
fond, contour) : Petit/Moyen/Grand/Très grand (16/22/30/40 px à 1080p), fond `rgba(0,0,0,.38)` par défaut,
contour noir, police Figtree 500, jamais en dessous des commandes quand elles sont visibles (les sous-titres
remontent de 56 px quand la barre est affichée : `::cue` / position calculée). Contraste ≥ 7:1 avec fond opaque
au choix (« Fond noir »).

**Départ et arrivée** : toast « Léa est arrivée » (avec un son très discret si activé : un seul « tic » de 120 ms) ;
si la dernière personne quitte, le film passe en pause. Déconnexion réseau d'un tiers : « Léa a perdu la
connexion. Elle revient… » (vignette en état « connexion en cours ») et pause automatique après 10 s (option).

**Fin du film** : à la dernière image, écran « C'était bien. » (Instrument Serif 56 px), « 1 h 52 passées ensemble. »,
boutons « Choisir le prochain » (primaire) et « Quitter ». Le film est marqué « vu avec Léa » dans l'historique.

**Téléphone en portrait**
```
┌──────────────┐
│ ‹ Titre  ●   │  barre haute 44 px
├──────────────┤
│   FILM 16:9  │  jamais couvert (pas de vignette dessus)
├──────────────┤
│ (Léa)  (moi) │  rangée de vignettes 4:3, hauteur 92 px
│ 1:12 ━●━ 1:52│
│ ↺  ▶  ↻  CC 🎙 💬 │
│ 😂 ❤️ 😱 😭 🔥 🍿 │  réactions, 6 émojis (les 2 autres dans « plus »)
│  chat (tiroir) │
└──────────────┘
```
Le film occupe la largeur ; en dessous vignettes (alignées horizontalement, jusqu'à 4 visibles, ensuite défilement),
barre de temps, commandes à 48 px, réactions, puis zone de discussion (tiroir 40 % de la hauteur restante). Réactions
qui flottent au-dessus de l'image (partie basse). Pas de masquage automatique : l'écran est assez grand.
**En paysage** : le film en plein cadre ; une seule vignette de 92 px (la personne qui parle, les autres en pastilles
de 36 px) en haut à droite ; commandes en surimpression (barre de temps + une rangée), qui s'effacent après 3 s ; un
tap sur l'image les rappelle (un double tap sur les côtés : ±10 s) ; chat en volet droit de 280 px (qui réduit
l'image : le film ne se superpose jamais au chat sur petit écran). Rotation fluide sans interruption de la lecture.
Le verrouillage de l'écran empêché (`navigator.wakeLock`) pendant la lecture.

### 5.7 Historique

Liste groupée par mois : mini-affiche · titre · « vu avec Léa et Mehdi » · date · durée regardée · barre de progression ·
bouton « Revoir ». Vide : « Rien de vu ensemble pour l'instant. La première séance se lance depuis un film. »

### 5.8 Compte

Sections : **Profil** (prénom, identifiant, couleur de présence parmi 6), **Mot de passe**, **Son** (baisse automatique
du film, détection du casque, volumes par défaut, test du micro avec jauge), **Image** (qualité des caméras : Auto / Économie /
Haute), **Affichage** (taille des sous-titres, mouvement réduit, position des caméras), **Appareils connectés**
(sessions, bouton « Déconnecter »), **Mon espace** (quota). Chaque réglage s'enregistre à la modification
(toast « Enregistré. »), pas de bouton global.

### 5.9 Administration

Onglets : **Comptes** (tableau : prénom, rôle, espace utilisé/quota, droit de téléverser, dernière connexion ;
actions : modifier, désactiver, réinitialiser le mot de passe), **Invitations** (« Inviter quelqu'un » → lien
7 jours à usage unique avec bouton Copier ; liste des invitations actives avec date d'expiration), **Espace disque**
(barre segmentée : films, préparations, cache, libre ; liste des plus gros films avec bouton « Supprimer la
préparation »), **Conversions** (file d'attente : en cours avec progression et vitesse, suivantes, terminées ; boutons
Pause / Annuler / Réessayer ; charge CPU), **Réglages** (clé TMDB, préparation automatique, priorité, URL publique ;
chaque réglage avec une phrase d'aide). Tableaux : lignes de 56 px, en-têtes `--discret` 13 px (pas en capitales),
survol `--s1`. Sur téléphone, chaque ligne devient une carte empilée. Les jauges d'espace deviennent rouges à
95 % avec le texte « Il reste 3 Go ».

---

## 6. Ton et textes de l'interface (français)

**Voix** : chaleureuse, claire, brève ; elle parle à une personne qu'elle connaît mais ne la tutoie pas
(**vouvoiement par défaut**, comme une maison bien tenue ; le choix du tutoiement est une préférence d'affichage
possible, voir §8). Phrases à la voix active, verbe d'action sur les boutons, sentence case, pas d'excuse ni
d'humour forcé dans les erreurs. Pas de « Oups ». Pas de point d'exclamation sauf accueil exceptionnel.

**Vocabulaire fixe** : *film*, *séance* (une soirée), *salle* (où l'on regarde), *galerie* (les films, appelée
« Films » dans la navigation), *inviter*, *entrer dans la salle*, *quitter*, *ajouter un film*, *préparer* (conversion).
On ne dit jamais « transcodage », « HLS », « codec » en dehors de « Détails techniques ».

### Exemples

| Contexte | Texte |
|---|---|
| Accroche | Le même film, au même instant, chacun chez soi. |
| Accueil | Bonsoir Awa, Léa arrive à 21 h. / Qu'est-ce qu'on regarde ? |
| Bouton principal salle | Entrer dans la salle |
| Avant l'ouverture | La salle ouvre à 20 h 45. |
| Séance sans invité | Personne n'est encore là. Copiez le lien pour inviter. |
| Lien copié | Lien copié. À coller où vous voulez. |
| Casque | Un casque évite l'écho : sans casque, le film repart dans le micro. |
| Pause partagée | Léa a mis en pause. |
| Saut | Awa a avancé à 1 h 14 min. |
| Langue | Awa a changé la langue : VO. Tout le monde est en pause. |
| Attente | On attend Sam… Son film charge encore. |
| Retard | Léa est 2 s en retard. On se recale. |
| Synchro perdue | Synchro perdue. Resynchroniser |
| Compte à rebours | Awa a lancé le compte à rebours. On lance dans 3, 2, 1. |
| Départ | Léa est partie. Le film est en pause. |
| Connexion faible | Connexion faible : l'image de Léa peut saccader. |
| Caméra refusée | Le navigateur n'a pas accès à la caméra. Autorisez-la dans les réglages du site, ou entrez sans image. |
| Micro refusé | Le micro est bloqué. Sans lui, Léa ne vous entendra pas. Autorisez-le dans les réglages du site. |
| Navigateur incompatible | Ce navigateur ne sait pas lire ce film. Essayez Firefox, Chrome, Safari ou Edge à jour. |
| Film introuvable | Ce film n'existe plus ou ne vous est pas partagé. |
| Séance introuvable | Cette séance n'existe pas ou a été supprimée. (un refus d'accès affiche le même message : 404) |
| Quota | Votre espace est plein : il manque 3 Go. Supprimez un film ou demandez plus de place. |
| Téléversement interrompu | Connexion perdue à 78 %. Rien n'est perdu, reprenez quand elle revient. |
| Format non lisible | Ce fichier n'est pas une vidéo. Essayez un fichier .mp4, .mkv, .avi, .mov ou .webm. |
| Sous-titres image | Ces sous-titres sont des images : ils ne peuvent pas s'afficher ici. |
| Préparation | Ce film est lourd : il sera préparé cette nuit pour se lancer plus vite. |
| Session expirée | Votre session a expiré. Reconnectez-vous pour continuer : vous reprendrez où vous étiez. |
| Limite d'essais | Trop d'essais. Réessayez dans 1 minute. |
| Hors ligne | Vous êtes hors ligne. Canapé revient dès que le réseau revient. |
| Fin du film | C'était bien. 1 h 52 passées ensemble. |
| État vide (galerie) | Rien à l'affiche pour l'instant. Déposez un film ici. |
| État vide (historique) | Rien de vu ensemble pour l'instant. |
| Confirmation de suppression | Supprimer Les Heures bleues ? Les séances prévues avec ce film seront annulées. [Supprimer] [Garder] |
| Invitation | Léa vous invite chez elle. |
| Message à coller | Ce soir 21 h, on regarde Les Heures bleues. Voici le lien : … |

**Dates et nombres** : « samedi 14 novembre, 21 h », « 1 h 52 », « 4,2 Go » (espace fine insécable avant l'unité),
« 64 % » (espace insécable), durées « 1:12:48 » dans les commandes (chiffres tabulaires), « 12 Mo/s ».
Formatage par `Intl` avec la locale `fr`.

---

## 7. Accessibilité et PWA

### 7.1 Accessibilité

- **WCAG 2.2 AA visé, AAA pour le focus.** Contrastes dans §3.1. Texte courant ≥ 4,5:1 ; composants et contours ≥
  3:1. Test automatisé (axe-core dans Playwright) sur chaque écran ; pas d'échec toléré.
- **Focus** : visible en toutes circonstances (`outline: 3px solid #ffbf7d; offset 3px`, 11,6:1 sur le fond), pas masqué
  par la barre de commandes (2.4.11 : les barres collantes ne recouvrent pas le focus, `scroll-padding-bottom`).
- **Cibles** ≥ 44 × 44 CSS px (le minimum WCAG est 24 × 24). **Aucune fonction ne dépend d'un glisser**
  (vignettes : menu de placement ; barre de temps : flèches et clics ; envoi : bouton « Choisir »).
- **Clavier** : ordre logique, tout opérable, raccourcis de la salle (§4.5) avec liste `?`, pas de piège de focus
  hors des modales.
- **Lecteur d'écran** : repères (`header`, `nav`, `main`, `aside` pour le chat), titres hiérarchiques, `aria-live` pour
  les toasts, l'indicateur de synchro, le compte à rebours et le chat ; `aria-label` sur toutes les icônes.
  Alternatives textuelles des affiches (`alt=""` : le titre est déjà à côté).
- **Mouvement** : voir §3.6. Aucun clignotement > 3 par seconde (la réaction à 4/s en rafale s'étale).
- **Couleur** : aucun état par la couleur seule (icône + texte). Palettes de présence distinguables par la forme
  (initiale) et le nom, pas seulement la teinte.
- **Sous-titres** : voir §5.6 (taille réglable, fond opaque au choix). Les commandes ne les masquent jamais.
- **Authentification** : champs standards, collage autorisé, aucun test cognitif (3.3.8), pas de CAPTCHA.
- **Zoom** : mise en page utilisable à 200 % et 400 % sans défilement horizontal (la salle se replie en
  disposition téléphone) ; `meta viewport` sans `user-scalable=no`.
- **Langue** : `<html lang="fr">`, passages dans une autre langue balisés (titres de films étrangers : `lang`).
- Page `/accessibilite` : déclaration courte (ce qui est couvert, comment signaler un problème).

### 7.2 PWA

- **Manifeste** (`/manifest.webmanifest`) : `name: "Canapé"`, `short_name: "Canapé"`, `lang: "fr"`, `start_url: "/?source=pwa"`,
  `scope: "/"`, `display: "standalone"` (seul mode pris en charge partout ; sur iOS `fullscreen` retombe sur
  `standalone`), `orientation: "any"` (la salle gère paysage et portrait), `background_color: "#14111a"`,
  `theme_color: "#14111a"`, `description: "Regardez un film ensemble, chacun chez soi."`, `categories: ["entertainment"]`,
  `id: "/"`.
- **Icônes** : `192`, `512` (`purpose: "any"`) ; `512` maskable (`purpose: "maskable"`, logo à 60 % centré sur fond
  `#14111a`, zone sûre 80 %) ; `apple-touch-icon` 180 × 180 (sans transparence : sur iOS, la transparence devient noire) ;
  favicon SVG (le logo) + `favicon.ico` 32 px. Principe : le logo « deux coussins » sur fond nuit prune. En raccourcis
  (`shortcuts`) : « Ce soir » (`/`), « Films » (`/films`), « Séances » (`/seances`).
- **Écran de démarrage** : Chrome Android le compose avec `background_color` + icône + `name`. iOS demande des images
  `apple-touch-startup-image` par taille d'appareil : on les génère (fond `#14111a`, logo 96 px centré, mot « Canapé »
  en Instrument Serif dessous) pour les 8 tailles d'iPhone/iPad courantes ; à défaut iOS affiche un fond
  noir, ce qui reste acceptable ici (fond sombre).
- **Zones sûres** : `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` +
  `env(safe-area-inset-*)` sur la barre d'onglets, la barre de commandes de la salle et les modales ; `theme-color`
  identique au fond pour que la barre d'état se fonde.
- **Service worker** : met en cache seulement l'enveloppe (HTML de repli, JS, CSS, polices, icônes) ; jamais les
  médias ni l'API. Page hors ligne : « Vous êtes hors ligne. Canapé revient dès que le réseau revient. » avec le logo.
  Mises à jour discrètes : toast « Une nouvelle version est prête. [Recharger] » (jamais de rechargement forcé
  pendant une séance).
- **Installation** : invite d'installation proposée une fois, sur la page Accueil, après la deuxième visite, en
  discret : « Installer Canapé sur cet appareil ? » ; sur iOS, mini-guide « Partager → Sur l'écran d'accueil ».
- **Plein écran immersif en mode installé** : la barre de titre disparaît ; `screen.orientation.lock` n'est pas imposé.
- **Réduction de l'énergie** : en arrière-plan (onglet masqué) on garde l'audio mais on réduit la vidéo des caméras
  (`Page Visibility`) ; `Wake Lock` actif seulement en salle avec lecture.

---

## 8. Fonctions et détails supplémentaires recommandés (je tranche)

Classés par intérêt, du plus utile au moins urgent, avec le coût estimé (S : une demi-journée, M : une à deux
journées, L : plus).

**Fort intérêt**
1. **Baisse automatique du film quand quelqu'un parle** (§3.9) : le seul vrai différenciant sonore ; sans elle, on
   règle le volume à la main toutes les deux minutes. Coût M.
2. **Pause automatique quand quelqu'un se déconnecte ou perd la connexion** (Syncplay le fait) avec message nommé et
   reprise facile. Évite le « tu as raté 5 minutes ». Coût S.
3. **Marque de l'autre personne sur la barre de temps + « Rejoindre Léa »** (§4.5) : règle les décalages après une
   pause de chacun. Coût S.
4. **Volumes par personne** (clic droit sur la vignette) : pour la tante qui parle trop fort. Coût S.
5. **Salle qui s'ouvre 15 minutes avant** avec un petit sas (« Léa est arrivée, on lance quand vous voulez ») :
   prolonge le rituel et laisse le temps de régler son casque. Coût S.
6. **Sas de test avant d'entrer** (écran « Vérifions que tout marche » : caméra, micro avec jauge, son du film, casque) :
   évite 80 % des problèmes de la première séance. Coût M.
7. **Mode « rangée » des caméras sur ordinateur** (vignettes sous le film) pour qui veut voir l'image entière. Coût S.

**Intérêt moyen**
8. **Fin de séance avec résumé** (« C'était bien. 1 h 52 ensemble. ») et noter un film d'un mot (« ❤️ coup de cœur »,
   « 👍 bien », « 😴 bof ») visible dans l'historique : mémoire du couple. Coût S.
9. **Messages vocaux ou « psst »** (un chuchotement : micro qui n'est entendu que par une personne) : intime, mais
   demande du WebRTC en plus. Coût L.
10. **Pause « vite, je reviens »** (bouton « Je reviens dans 5 min » qui met en pause, annonce et revient avec compte à
    rebours) : très utilisée en vrai. Coût S.
11. **Photo de profil / avatar optionnel** et **tutoiement choisi** par personne (réglage d'affichage). Coût S.
12. **Instantané** : bouton appareil photo qui enregistre une image du film *et* des deux vignettes (« notre capture de
    ce soir ») dans l'historique. Joli, sensible côté vie privée : à demander à chacun. Coût M.
13. **Mode « soirée »** : plusieurs films enchaînés (liste d'attente), et un entracte avec une petite pause de 5 min. Coût M.
14. **Ajustement des lèvres** (décalage du son pour les casques Bluetooth qui retardent le son : curseur ±300 ms, par
    appareil). Coût S.
15. **Résilience** : reconnexion avec reprise exacte (déjà prévu), indicateur de débit montant/descendant dans le menu de la
    synchro. Coût S.

**À garder pour plus tard**
16. **Thème clair automatique** (jetons déjà prévus) pour lecture de jour. Coût M.
17. **Application Android** (TWA) à partir de la PWA. Coût M.
18. **Calendrier** : fichier `.ics` d'une séance. Coût S.
19. **Notifications push** « Léa est dans la salle » (Web Push, accord explicite). Coût M.
20. **Cast** vers la TV (Chromecast) : la salle reste sur le téléphone ou l'ordinateur, le film part sur la télé.
    Coût L.

À éviter : réseaux sociaux (notes publiques, abonnés), jeux, publicités, notifications de promotion, recommandations
algorithmiques.

---

## 9. Sources consultées

**Applications pour regarder ensemble**
- AlternativeTo : Teleparty https://alternativeto.net/software/netflix-party · Rave https://www.alternativeto.net/software/rave/ ·
  Scener https://www.alternativeto.net/software/scener/ · Kosmi https://www.alternativeto.net/software/kosmi/
- Kosmi (blog) https://blog.kosmi.io/p/kosmiio-is-the-best-rave-alternative
- Comparatif 2026 https://asdqwefz.github.io/inj/blog/best-watch-party-apps-2026.html (source commerciale : indicatif)
- Apps pour regarder à distance https://rigorousthemes.com/blog/apps-to-watch-movies-together-long-distance-on-phone-pc-and-tv/
- Avis Teleparty : https://www.trustpilot.com/review/teleparty.com ·
  https://addons.mozilla.org/en-US/firefox/addon/netflix-party-is-now-teleparty/reviews/ ·
  https://apps.apple.com/us/app/teleparty-watch-party/id1620026075?see-all=reviews&platform=iphone ·
  https://www.producthunt.com/products/netflix-party
- SharePlay et GroupWatch : https://soundandvision.com/node/121432 ·
  https://www.tomsguide.com/news/shareplay-on-ios-15-looks-great-but-its-missing-one-big-thing ·
  https://www.macrumors.com/2021/12/15/disney-plus-shareplay · Apple, directives SharePlay
  https://developer.apple.com/design/human-interface-guidelines/shareplay
- Prime Watch Party : https://t3.com/news/amazon-prime-video-has-just-added-a-fantastic-new-feature-subscribers-will-love (et
  l'arrêt en 2024, source non officielle : https://www.eskimo.travel/blog/amazon-watch-party)
- Plex Watch Together : https://forums.plex.tv/t/add-watch-together-to-new-plex-experience/906941 ·
  https://forums.plex.tv/t/watch-together-going-away-in-app · https://hothardware.com/news/plex-punts-a-popular-feature ·
  https://forums.plex.tv/t/plex-please-fix-watch-together/850222
- Jellyfin SyncPlay : https://github.com/orgs/jellyfin/discussions/10310 · https://forum.jellyfin.org/t-syncplay-issues ·
  documentation de l'API https://eb48e63b.jellyfin-org.pages.dev/developers/docs/api/syncplay
- Syncplay : https://syncplay.pl/about/syncplay/ · https://syncplay.pl/?p=691 · https://syncplay.pl/changelog/
- Couples à distance (Discord, TwoSeven, NeverFar) : https://bestforandroid.com/watch-movies-together-online/ ·
  https://ask.metafilter.com/368529/Phone-things-for-couples-in-a-long-distance-relationship ·
  https://www.producthunt.com/products/your-private-room-for-ldr

**Interfaces de streaming et médiathèques**
- Letterboxd (typographie, charte) : https://www.shadcn.io/design/letterboxd · https://www.fontsinuse.com/tags/9728/letterboxd ·
  https://fontsinuse.com/uses/14608/letterboxd-for-iphone
- Apple TV / Netflix (spécifications de design) : https://www.webdesignhot.com/design.md/apple-tv/ ·
  https://www.webdesignhot.com/design.md/netflix/
- Mubi et Criterion Channel : aucune source fiable trouvée par cette recherche ; parti pris de ton éditorial déduit de
  leur usage public.

**Tendances 2025-2026** : https://abp.io/community/articles/UI-UX-Trends-That-Will-Shape-2026-bx4c2kow ·
https://trends.daisyui.com/ui-design-trends-2026/ · https://musemind.agency/blog/ui-design-trends

**Accessibilité et PWA**
- W3C, nouveautés de WCAG 2.2 https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- web.dev, installation des PWA https://web.dev/learn/pwa/installation
- MDN, `echoCancellation` https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation

**Audio, écho**
- Liste de discussion WebRTC, « ducking » de l'annulateur d'écho : https://groups.google.com/g/discuss-webrtc/c/V-VoiZit360
- Fonctionnement de l'AEC de WebRTC : https://switchboard-website-astro.pages.dev/hub/how-webrtc-aec3-works ·
  https://getstream.io/blog/what-is-echo-cancellation/

**Polices et icônes**
- Fontsource : https://fontsource.org/fonts/fraunces (comparaison, écartée) ;
  https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.2.8/ ·
  https://cdn.jsdelivr.net/npm/@fontsource-variable/hanken-grotesk@5.2.8/
- Lucide, licence https://lucide.dev/license

Limite de cette recherche : la plupart des avis sur Teleparty, Plex et Jellyfin sont des messages de forums ou des
magasins d'applications, pas des études ; les constats sont donc des tendances, pas des mesures. Les comparatifs
commerciaux (alternativeto, blogs de marques) sont signalés comme indicatifs. Aucune donnée de l'utilisateur n'a
été envoyée à un service extérieur.
