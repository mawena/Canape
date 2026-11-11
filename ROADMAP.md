# Feuille de route — Canapé

Canapé sert à regarder un film à deux, chacun chez soi, en se voyant et en s'entendant. Le film est sur le
serveur et chaque navigateur le lit lui-même : plus de partage d'écran saccadé, et le son du film et la voix
passent en même temps. Conception : [docs/CONCEPTION.md](docs/CONCEPTION.md).

## Phase 1 — Fondations

- [x] Dépôt git, git flow (`main`, `develop`)
- [ ] Dépôt distant en SSH
- [x] Conception et contrat commun (`docs/CONCEPTION.md`), feuille de route, `.gitignore`

## Phase 2 — Serveur

- [ ] Configuration (variables d'environnement, fichier `--config`), démarrage HTTP ou HTTPS
- [ ] Connexion par mot de passe commun, cookie de session signé, limite d'essais
- [ ] Liste des films, sous-titres, compatibilité navigateur (ffprobe)
- [ ] Envoi des films avec requêtes `Range`, sans sortie du dossier des films
- [ ] Sous-titres `.srt` convertis en WebVTT
- [ ] Salon : état de lecture partagé, attente mutuelle, signalisation WebRTC par WebSocket
- [ ] Identifiants TURN temporaires (coturn)
- [ ] `canape-convertir` : film converti pour le navigateur (ffmpeg)

## Phase 3 — Interface

- [ ] Écran de connexion (prénom, mot de passe)
- [ ] Choix du film
- [ ] Lecteur synchronisé : lecture, pause, déplacement, rattrapage de l'écart, sous-titres
- [ ] Caméras et micros (WebRTC) en vignettes sur le film, couper micro et caméra
- [ ] Volumes séparés film et voix, film baissé quand l'autre parle, conseil du casque
- [ ] Plein écran avec les caméras, affichage sur téléphone

## Phase 4 — Tests

- [ ] Tests unitaires et d'intégration du serveur (`npm test`)
- [ ] Essai réel dans le navigateur, à deux onglets

## Phase 5 — Paquet Debian et dépôt APT

- [ ] Paquet `.deb` : service systemd, utilisateur `canape`, `/etc/canape/canape.conf`, `/var/lib/canape/films`
- [ ] Clé de signature du dépôt APT, source deb822 et clé installées par le paquet
- [ ] `scripts/publier-apt.sh`, page d'accueil du site et `installer.sh`
- [ ] README (site, installation par apt, utilisation, configuration, HTTPS, TURN)

## Phase 6 — Release

- [ ] Version, CHANGELOG, tag, push de `main`, `develop` et des tags
- [ ] Release GitHub avec le `.deb` et `SHA256SUMS`
- [ ] Publication dans le dépôt APT, vérifiée par `apt-get update` sans root
- [ ] « About » GitHub : site web et description
