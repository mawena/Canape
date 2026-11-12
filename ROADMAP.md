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
- [ ] Mise en ligne sur le VPS, à l'adresse https://canape.mawena.cloud (déploiement fait par l'utilisateur)

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
- [ ] Recherche produit et design : direction artistique (`docs/DESIGN.md`)
- [ ] Recherche technique : conversion à la volée, synchro, tus, WebRTC, SQLite, SvelteKit (`docs/RECHERCHE-TECHNIQUE.md`)

## Phase 8 — Socle

- [x] Espaces de travail npm, TypeScript exécuté par Node 26, Fastify, SQLite et migrations, SvelteKit, types partagés
- [x] Kit d'interface de base, client d'API, application de test, retrait du code 0.1

## Phase 9 — Modules (en parallèle)

- [ ] Comptes : connexion Argon2id, sessions, invitations, réinitialisation, administration, quotas
- [ ] Médiathèque : téléversement tus, analyse, fiches automatiques (titre, année, image, TMDB), partage, sous-titres, import 0.1
- [ ] Lecture universelle : direct, son seul converti, vidéo convertie à la volée (HLS), HDR → SDR, préparation, sous-titres intégrés
- [ ] Séances (serveur) : séances et liens, WebSocket, synchro, chat, réactions, reprise et historique, TURN
- [ ] Salle (client) : lecteur synchronisé, appel vidéo, langue et sous-titres partagés, chat, réactions, compte à rebours
- [ ] Interface : direction artistique, kit d'interface, accueil « Ce soir », historique, navigation, PWA

## Phase 10 — Livraison

- [ ] Paquet, `installer-serveur.sh` 1.0 (mise à niveau depuis la 0.1), mise à jour atomique avec retour arrière
- [ ] GitHub Actions : CI sur `develop`, déploiement automatique sur `main`, release GitHub du tag
- [ ] Préparation du VPS pour le déploiement automatique (utilisateur, clé verrouillée, sudo limité, secrets du dépôt)

## Phase 11 — Intégration et essais

- [ ] Réunion des modules, corrections d'intégration
- [ ] Essais de bout en bout Playwright (Chromium, Firefox, WebKit), caméras simulées
- [ ] README 1.0

## Phase 12 — Release 1.0.0

- [ ] Version, CHANGELOG, tag, release GitHub
- [ ] Premier déploiement automatique sur https://canape.mawena.cloud, vérifié
