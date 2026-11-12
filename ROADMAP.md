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
