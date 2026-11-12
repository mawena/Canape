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
- [ ] Premier déploiement automatique sur https://canape.mawena.cloud, vérifié

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
- [ ] Release du nouveau design (version mineure : rien d'incompatible)
