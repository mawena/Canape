# Feuille de route — Canapé

Canapé sert à regarder un film à deux, chacun chez soi, en se voyant et en s'entendant. Le film est sur le
serveur et chaque navigateur le lit lui-même : plus de partage d'écran saccadé, et le son du film et la voix
passent en même temps. Conception : [docs/CONCEPTION.md](docs/CONCEPTION.md).

## Phase 1 — Fondations

- [x] Dépôt git, git flow (`main`, `develop`)
- [x] Dépôt distant en SSH (`git@github.com:mawena/Canape.git`, public)
- [x] Conception et contrat commun (`docs/CONCEPTION.md`), feuille de route, `.gitignore`

## Phase 2 — Serveur

- [x] Configuration (variables d'environnement, fichier `--config`), démarrage HTTP ou HTTPS
- [x] Connexion par mot de passe commun, cookie de session signé, limite d'essais
- [x] Liste des films, sous-titres, compatibilité navigateur (ffprobe)
- [x] Envoi des films avec requêtes `Range`, sans sortie du dossier des films
- [x] Sous-titres `.srt` convertis en WebVTT
- [x] Salon : état de lecture partagé, attente mutuelle, signalisation WebRTC par WebSocket
- [x] Identifiants TURN temporaires (coturn)
- [x] `canape-convertir` : film converti pour le navigateur (ffmpeg)

## Phase 3 — Interface

- [x] Écran de connexion (prénom, mot de passe)
- [x] Choix du film
- [x] Lecteur synchronisé : lecture, pause, déplacement, rattrapage de l'écart, sous-titres
- [x] Caméras et micros (WebRTC) en vignettes sur le film, couper micro et caméra
- [x] Volumes séparés film et voix, film baissé quand l'autre parle, conseil du casque
- [x] Plein écran avec les caméras, affichage sur téléphone

## Phase 4 — Tests

- [x] Tests unitaires et d'intégration du serveur (`npm test`)
- [x] Essai réel dans un navigateur, à deux participants (caméras simulées), avec corrections (`npm run essai-navigateur`)
- [x] `canape-convertir` essayé sur un vrai fichier
- [x] Tests et essai navigateur sous Node 26 (version du VPS) comme sous Node 18

## Phase 5 — Déploiement sur le serveur (nginx)

Canapé est une application web déployée sur un serveur à soi, derrière nginx : pas de paquet Ubuntu.

- [x] Retrait du paquet Debian, du dépôt APT, du site et de leurs scripts
- [x] Unité systemd durcie et fichier de réglages d'exemple (`deploiement/`)
- [x] Configuration nginx : HTTPS (Let's Encrypt), WebSocket, envoi des films
- [x] Script de déploiement depuis le poste (`deploiement/deployer.sh`)
- [x] README : déploiement, nginx, HTTPS, TURN, configuration, utilisation, développement
- [x] Mise en ligne sur le VPS, à l'adresse https://canape.mawena.cloud (déploiement fait par l'utilisateur)

## Phase 6 — Release

- [x] Version 0.1.0, CHANGELOG, tag, push de `main`, `develop` et des tags
- [x] Release GitHub (v0.1.0)
- [x] « About » GitHub : description sans dépôt APT, sans site GitHub Pages

---

# Canapé 1.0 — plateforme privée

Comptes (admin, viewers), galeries, téléversement par morceaux, lecture de tous les formats sans conversion à la
main, séances, chat et réactions, reprise, PWA, mise en production automatique. Contrat :
[docs/CONCEPTION.md](docs/CONCEPTION.md).

## Phase 7 — Conception et recherches

- [x] Contrat commun 1.0 (`docs/CONCEPTION.md`)
- [x] Recherche produit et design : direction artistique (`docs/DESIGN.md`)
- [x] Recherche technique : conversion à la volée, synchro, tus, WebRTC, SQLite, SvelteKit (`docs/RECHERCHE-TECHNIQUE.md`)

## Phase 8 — Socle

- [x] Espaces de travail npm, TypeScript exécuté par Node 26, Fastify, SQLite et migrations, SvelteKit, types partagés
- [x] Kit d'interface de base, client d'API, application de test, retrait du code 0.1

## Phase 9 — Modules (en parallèle)

- [x] Comptes : connexion Argon2id, sessions, invitations, réinitialisation, administration, quotas
- [x] Médiathèque : téléversement tus, analyse, fiches automatiques (titre, année, image, TMDB), partage, sous-titres, import 0.1
- [x] Lecture universelle : direct, son seul converti, vidéo convertie à la volée (HLS), HDR → SDR, préparation, sous-titres intégrés
- [x] Séances (serveur) : séances et liens, WebSocket, synchro, chat, réactions, reprise et historique, TURN
- [x] Salle (client) : lecteur synchronisé, appel vidéo, langue et sous-titres partagés, chat, réactions, compte à rebours
- [x] Interface : direction artistique, kit d'interface, accueil « Ce soir », historique, navigation, PWA

## Phase 10 — Livraison

- [x] Paquet, `installer-serveur.sh` 1.0 (mise à niveau depuis la 0.1), mise à jour atomique avec retour arrière
- [x] GitHub Actions : CI sur `develop`, déploiement automatique sur `main`, release GitHub du tag
- [x] Préparation du VPS pour le déploiement automatique (utilisateur, clé verrouillée, sudo limité, secrets du dépôt)

## Phase 11 — Intégration et essais

- [x] Réunion des modules, corrections d’intégration
- [x] Essais de bout en bout Playwright (Chromium, Firefox, WebKit), caméras simulées
- [x] README 1.0

## Phase 12 — Release 1.0.0

- [x] Version, CHANGELOG, tag, release GitHub
- [ ] Premier déploiement automatique sur https://canape.mawena.cloud, vérifié (en attente : facturation GitHub Actions débloquée fin novembre 2026)

---

# Canapé 1.1 — films par torrent

Ajouter un film par un lien magnet ou un fichier `.torrent` et suivre son téléchargement. Contrat :
[docs/CONCEPTION.md](docs/CONCEPTION.md), « Torrents ».

## Phase 13 — Torrents

- [x] Contrat : types partagés, table `telechargements`, réglages `CANAPE_TORRENT_*`, routes, dépendance WebTorrent
- [x] Serveur : moteur WebTorrent dans un processus enfant, choix des fichiers, quota, import dans la galerie, reprise après redémarrage
- [x] Interface : « Par torrent » (lien magnet ou `.torrent`), panneau « Téléchargements » avec progression, pause, reprise, annulation, choix des fichiers
- [x] Livraison : dossier `/srv/canape/telechargements`, réglages d'exemple, guide de déploiement, README
- [x] Essais de bout en bout (pair local, sans Internet), release 1.1.0

## Phase 14 — Design plus attirant, plus pro, plus facile

- [x] Recherche : applications de streaming et de visionnage à deux de 2026, palettes, typographie, composants
- [x] Nouvelle palette et jetons (contrastes AA vérifiés), typographie, élévations, mouvement
- [x] Kit d'interface et navigation repris (boutons, cartes, champs, modales, panneaux, états vides, chargements)
- [x] Écrans repris un par un : accueil, galerie et fiche, téléchargements, séances, salle, compte, administration, connexion et invitation
- [x] Facilité d'usage : premiers pas guidés, textes d'aide, messages d'erreur clairs, retours visuels, cibles tactiles
- [x] Captures avant / après (ordinateur et téléphone), DESIGN.md à jour, essais Playwright verts
- [x] Release du nouveau design (version mineure : rien d'incompatible) : 1.2.0
- [x] Mise en production de la 1.2.0 sur https://canape.mawena.cloud (avec la 1.4.0)

## Phase 15 — Inscription libre

N'importe qui peut venir sur https://canape.mawena.cloud, créer son compte et ajouter des films. Contrat :
[docs/CONCEPTION.md](docs/CONCEPTION.md), « Inscription libre » (branche `feature/inscription`).

- [x] Contrat : types, migration `011_inscription.sql`, réglages, routes, vie privée entre inconnus
- [x] Serveur : inscription avec jeton anti-robot et limites, réglages de l'admin, droit aux torrents par compte, liste des comptes restreinte et recherche par identifiant
- [x] Interface : pages `/inscription` et `/regles`, lien « Créer un compte », réglages et comptes de l'administration, partage et invitation par identifiant
- [x] Essais de bout en bout (inscription, droits, vie privée ; Chromium et Firefox), captures, README et guide de déploiement
- [x] Release 1.3.0 (version mineure : nouvelles fonctions compatibles)
- [x] Mise en production de la 1.3.0 sur https://canape.mawena.cloud (avec la 1.4.0)

## Phase 16 — Transmission pour les torrents

Les trackers privés (C411…) refusent WebTorrent mais acceptent Transmission : Canapé pilote `transmission-daemon` sur
le VPS pour tous les torrents. Contrat : [docs/CONCEPTION.md](docs/CONCEPTION.md), « Moteur Transmission » (branche
`feature/transmission`).

- [x] Diagnostic (torrent privé C411 : seul son tracker donne des pairs, il n'accepte pas WebTorrent) et contrat
- [x] Serveur : moteur Transmission par RPC (ajout, choix des fichiers, pause, reprise, retrait, suivi, messages des trackers), lien physique vers la galerie, partage des privés jusqu'au retrait, WebTorrent en secours
- [x] Interface : torrent privé signalé, « En partage » avec ratio, « Arrêter de partager », réponse du tracker en clair
- [x] Installation : `transmission-daemon` installé et configuré par l'installateur (RPC local, mot de passe, groupe, port), guide
- [x] Essais (Transmission réel en local, faux RPC, vrai journal ; Playwright Chromium et Firefox)
- [x] Release 1.4.0 (version mineure : nouvelles fonctions compatibles, WebTorrent en secours sans Transmission)
- [x] Mise en production de la 1.4.0 et installation de Transmission sur https://canape.mawena.cloud (torrent privé C411 vérifié par l'utilisateur)
- [x] Correctif 1.4.1 : dossiers de téléchargement ouverts au groupe sans chmod setgid (refusé par `RestrictSUIDSGID` : « Permission denied » chez Transmission), `mettre-a-jour` garde `telechargements` en `2770`
- [x] Mise en production de la 1.4.1 : le torrent privé C411 se télécharge (vérifié par l'utilisateur)
- [x] Premier film privé arrivé dans la galerie (lien physique, partage qui continue) — confirmé en production le 13/11/2026

---

# Canapé 1.5 — inviter pendant la séance

## Phase 17 — Lien de la séance à tout moment

L'hôte peut retrouver et envoyer le lien de la séance quand elle est déjà lancée, film en cours : la personne invitée
arrive dans la salle au bon moment du film.

- [x] Interface : bouton « Inviter » dans la salle (pendant le film, plein écran compris, sans pause) et dans le sas : lien, « Copier le lien », « Partager » sur téléphone ; « Copier le lien » dans la liste des séances ; seulement pour l'hôte
- [x] Arrivée en cours de film : la personne qui rejoint par le lien est synchronisée au bon moment (corrigé si besoin)
- [x] Essais (unitaires, Playwright : invitation pendant le film, troisième personne qui rejoint, invité sans le bouton), captures
- [x] Release 1.5.0 et mise en production — en ligne le 13/11/2026

# Canapé 1.6 à 1.9 — accueil, souvenirs, agenda, soirées

Quatre fonctions choisies le 13/11/2026, dans cet ordre ; une phase et une release chacune.

## Phase 18 — Accueil plus pratique

Aller droit au but dès l'ouverture : la séance en cours ou la prochaine en avant, reprendre un film commencé, voir les
téléchargements en cours, lancer une séance en deux clics ; une page claire sur téléphone.

- [x] Analyse de l'accueil actuel (ordinateur, téléphone, compte neuf, compte chargé) et nouvelle organisation
- [x] Interface : séance en cours ou à venir, « Reprendre », téléchargements en cours, lancement rapide d'une séance
- [x] Essais (unitaires, Playwright), captures ordinateur et téléphone, clair et sombre
- [x] Release 1.6.0 et mise en production

## Phase 19 — Fin de séance et souvenir

À la fin du film : un petit résumé (« 1 h 52 ensemble », qui était là) et une note d'un mot (coup de cœur, bien, bof),
gardés dans l'historique.

- [x] Serveur : durée passée ensemble, note de chaque personne (migration, API)
- [x] Interface : écran de fin de séance, note, souvenir visible dans l'historique
- [x] Essais (unitaires, Playwright), captures
- [x] Release 1.7.0 et mise en production

## Phase 20 — Agenda et notifications

Ajouter une séance à son agenda ; être prévenu quand quelqu'un entre dans la salle (avec l'accord de chacun).

- [x] Fichier agenda (.ics) d'une séance prévue
- [x] Notifications Web Push « Camille est dans la salle » : accord par appareil dans le compte, envoi par le serveur
- [x] Essais (sans contacter de vrai service de notifications), captures
- [x] Release 1.8.0 et mise en production

## Phase 21 — Soirée à plusieurs films

Enchaîner plusieurs films dans une même séance (liste d'attente), avec un entracte de 5 minutes entre deux.

- [x] Serveur : liste des films d'une séance, passage synchronisé au film suivant, entracte
- [x] Interface : liste à la création et dans la salle (hôte), entracte avec compte à rebours
- [x] Essais (unitaires, Playwright), captures
- [x] Release 1.9.0 et mise en production

# Canapé 1.10 et 1.11 — programme pour toute séance, films à voir ensemble

Choisis le 14/11/2026 ; une phase et une release chacune.

## Phase 22 — Programme dans toute séance

L'hôte peut ajouter un deuxième film (puis d'autres) à une séance prévue pour un seul film, depuis la salle, sans
recréer la séance ; la séance devient alors une soirée avec entracte.

- [ ] Bouton « Programme » dans la salle pour l'hôte même avec un seul film ; les autres ne le voient qu'à partir de deux films
- [ ] Serveur : ajout de films accepté pour toute séance (règles et essais)
- [ ] Essais (unitaires, Playwright), captures ordinateur et téléphone
- [ ] Release 1.10.0 et mise en production

## Phase 23 — Films à voir ensemble

Chacun marque les films de la galerie qu'il a envie de voir ; Canapé montre ceux qui plaisent à plusieurs et permet de
lancer la séance avec les intéressés en deux clics.

- [ ] Serveur : envies par personne et par film (migration, API), retirées pour ceux qui ont vu le film ensemble jusqu'au bout
- [ ] Interface : « J'ai envie de le voir » sur la fiche et la galerie, liste « À voir ensemble » sur l'accueil (qui en a envie), lancer une séance avec eux
- [ ] Essais (unitaires, Playwright), captures ordinateur et téléphone
- [ ] Release 1.11.0 et mise en production
