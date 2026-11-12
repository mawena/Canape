# Canapé

**Regarder un film à deux (ou à quelques-uns), chacun chez soi, en se voyant et en s'entendant.**

Production : <https://canape.mawena.cloud> (privée, sur invitation) · Dépôt : <https://github.com/mawena/Canape>

Canapé est une petite plateforme privée que l'on héberge soi-même sur un serveur (VPS) : on y range ses films, on invite
ses proches, et on les regarde ensemble, au même instant, avec les caméras et les voix. L'ambiance visée : un salon la
nuit, une lampe allumée, l'écran qui éclaire les visages.

## À quoi ça sert

Regarder un film à distance avec Google Meet, c'est partager son écran : l'image est saccadée, le son du film écrase la
voix (ou l'inverse), et la qualité dépend de la connexion de celui qui partage.

Avec Canapé, **personne ne partage son écran**. Chaque navigateur lit le film directement depuis le serveur, à sa
propre qualité, et la lecture est synchronisée (lecture, pause, déplacement). Le son du film **et** la voix passent en
même temps, chacun avec son volume. Les caméras et les micros circulent directement entre les participants.

## Fonctions

**Comptes et accès**
- Inscription libre (réglable) : n'importe qui peut créer son compte sur `/inscription` ; l'administrateur peut aussi inviter par lien (valable 7 jours, usage unique), fermer les inscriptions ou fixer leurs limites.
- Deux rôles : `admin` et `viewer` ; quota d'espace par compte, droit de téléverser retirable.
- Un film est privé par défaut ; son propriétaire le partage avec certains comptes ou avec tous.

**Films**
- Galeries (grille d'affiches, recherche, filtres), affiches et résumés via TMDB si l'on fournit une clé.
- Téléversement par morceaux (protocole tus) : pause, reprise, coupure de connexion sans tout recommencer.
- Lecture de tous les formats sans conversion à la main : lecture directe quand c'est possible, sinon conversion du
  son, ou de l'image à la volée en HLS (HDR converti en SDR), et préparation à l'avance des films lourds.
- Ajout d'un film par lien magnet ou fichier `.torrent` : téléchargement suivi, plus gros film et sous-titres choisis,
  moteur à part (processus enfant, `nice`, débits plafonnés) pour ne gêner ni les séances ni les autres sites.
- Sous-titres intégrés extraits à la demande ; choix de la langue et des sous-titres.

**Séances et salle**
- Séance créée en choisissant un film, avec un lien à envoyer aux invités.
- Lecture synchronisée, appel vidéo WebRTC, chat, réactions qui flottent, compte à rebours, indicateur de synchro.
- Langue et sous-titres partagés par tous.
- Reprise là où l'on s'était arrêté, historique des séances.

**Application**
- Interface en français, installable sur téléphone et ordinateur (PWA).
- Mise en production automatique par GitHub Actions, avec retour arrière automatique en cas d'échec.

## Comment ça marche

```
 Navigateurs ──HTTPS / WebSocket──▶ nginx ──▶ Canapé (Node.js) ──▶ ffmpeg
      │                                            │                (conversion à la volée,
      │                                            │                 préparation, sous-titres)
      │                                            ├── SQLite (comptes, films, séances)
      │                                            └── films, cache, téléversements (disque)
      │
      └──── WebRTC, pair à pair : caméras et voix ────▶ autres navigateurs
                      (relais TURN si le réseau l'empêche)
```

- Les films, le chat et la synchronisation passent par le serveur ; les caméras et les voix vont d'un navigateur à
  l'autre. Le serveur ne fait que donner l'adresse des serveurs STUN/TURN.
- nginx est devant : il porte le HTTPS, le téléversement sans tampon, la lecture des médias et les WebSocket.
- La lecture « universelle » (direct, son converti, image convertie, préparation) est décrite dans
  [`docs/CONCEPTION.md`](docs/CONCEPTION.md), section « Lecture universelle ».

## Prérequis du serveur

- Un VPS **Ubuntu** avec accès root, **nginx** et **certbot** (certificat Let's Encrypt) ; un nom de domaine qui pointe
  dessus. Canapé peut cohabiter avec d'autres sites : l'installation ne redémarre jamais nginx et le service tourne en
  basse priorité.
- **Node.js 26** (Node exécute le TypeScript directement, rien n'est compilé sur le serveur). Le script d'installation
  n'installe jamais Node : on lui indique le Node à copier (`--node`).
- **ffmpeg** et **ffprobe**.
- De la place disque pour les films, le cache de conversion et les téléversements.
- **Processeur** : la conversion à la volée demande un processeur correct. D'après les mesures de
  [`docs/RECHERCHE-TECHNIQUE.md`](docs/RECHERCHE-TECHNIQUE.md) (4 fils de calcul) : un film 1080p se convertit à
  environ 73 images par seconde, un film **4K HDR** vers du SDR 1080p à environ 27 images par seconde, soit à peine plus
  que le temps réel. Sur un petit VPS, **préparez les films 4K HDR à l'avance** (la préparation automatique s'en
  charge, `CANAPE_PREPARATION_AUTO`) plutôt que de les convertir pendant la séance. Les films lisibles directement
  (H.264 8 bits dans un MP4, par exemple) ne coûtent presque rien au serveur.
- Facultatif : un relais **TURN** (coturn) pour les réseaux qui bloquent l'appel pair à pair.

## Installation sur le VPS

Résumé ; le guide complet est [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) (disposition des fichiers, garanties pour
nginx, retour arrière, désinstallation).

```bash
git clone git@github.com:mawena/Canape.git && cd Canape
sudo ./deploiement/installer-serveur.sh --domaine canape.exemple.fr --port 8780 --node /chemin/vers/node
```

Options : `--domaine`, `--port`, `--node`, `--paquet <canape-x.y.z.tar.gz>`, `--essai` (décrit ce qui serait fait sans
rien modifier), `--desinstaller`. Sans `--paquet`, le script télécharge le paquet de la dernière release GitHub et
vérifie son `SHA256SUMS` : rien n'est construit sur le serveur. Le script peut être relancé.

Il installe le service systemd `canape`, la configuration `/etc/canape/canape.conf`, la commande `canape`, et ajoute le
site à nginx (avec `nginx -t` avant et après, et retour à l'état d'origine si la configuration est refusée).

Vérifier : `systemctl status canape`, `journalctl -u canape -f`, `curl -s http://127.0.0.1:8780/api/etat`.

## Mise à niveau depuis la 0.1

La 0.1 (salon à mot de passe commun) a disparu. Pour passer à la 1.0 : relancer **la même commande**
`installer-serveur.sh --domaine <votre-domaine> --port <votre-port> …`. Le script garde le port, les dossiers et le
certificat, met la configuration à niveau (le mot de passe commun et le secret de la 0.1 n'existent plus), remplace
l'unité systemd et complète nginx.

Les films posés à plat dans le dossier des films ne sont **pas** déplacés : après avoir créé le compte admin, les
importer dans sa galerie.

```bash
sudo canape films importer /srv/canape/films --proprietaire <identifiant-admin>            # les déplace
sudo canape films importer /srv/canape/films --proprietaire <identifiant-admin> --copier   # les copie
```

## Premier compte administrateur

À la fin de l'installation, le script lance `canape admin inviter --role admin` et affiche le **lien d'invitation de
l'administrateur** (au premier démarrage sans compte, le serveur l'écrit aussi dans son journal : `journalctl -u canape`) : l'ouvrir dans le navigateur et
choisir son identifiant et son mot de passe. Pour en recréer un :

```bash
sudo canape admin inviter --role admin
```

## Mise en production automatique

Un push sur `main` met la production à jour : GitHub Actions vérifie (types, tests, construction), construit le paquet
`canape-<version>.tar.gz` avec son `SHA256SUMS`, l'envoie au serveur par SSH avec une clé qui ne peut faire que cela, et
le serveur bascule sur la nouvelle version (sauvegarde de la base, vérification de `/api/etat`, **retour arrière
automatique** si ça échoue). Un tag `v*` publie en plus la release GitHub.

Préparation, une seule fois :

1. Sur le poste : `ssh-keygen -t ed25519 -N "" -C canape-deploiement -f ~/.ssh/canape-deploiement`
2. Sur le VPS : `sudo /opt/canape/deploiement/preparer-deploiement-auto.sh <clé-publique.pub>` (option `--essai` pour
   voir sans rien modifier, `--retirer` pour tout défaire).
3. Dans GitHub, environnement `production`, les secrets `VPS_HOTE`, `VPS_PORT`, `VPS_UTILISATEUR`, `VPS_CLE_SSH` et
   `VPS_EMPREINTE_HOTE`.

Le détail (valeurs des secrets, ce que fait chaque étape, codes de sortie) est dans
[`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md), section « Déploiement automatique ».

## Utilisation

**Inviter quelqu'un** : en tant qu'admin, ouvrir l'administration, page Invitations, choisir le rôle (viewer en
général) et envoyer le lien. En ligne de commande : `sudo canape admin inviter` (ou `--role admin`, `--jours 7`). Pour un
mot de passe oublié : `sudo canape admin reinitialiser <identifiant>`.

**Ajouter un film** : dans une galerie, glisser-déposer le fichier. Le téléversement peut être mis en pause et repris. La
fiche du film permet de le partager, de choisir les pistes et de le préparer à l'avance.

**Lancer une séance** : « Lancer une séance », choisir le film, puis envoyer le lien de la séance aux invités (ou les
inviter parmi les comptes). Chacun rejoint la salle, autorise sa caméra et son micro, et la lecture démarre pour tous.

**Conseils**
- **Casque conseillé** : sans casque, le micro reprend le son du film et renvoie de l'écho aux autres.
- **HTTPS obligatoire** : les navigateurs refusent la caméra et le micro hors HTTPS (sauf sur `localhost`).
- **L'appel ne passe pas** (réseau d'entreprise, 4G stricte…) : configurer un relais TURN (`CANAPE_TURN_URLS` et
  `CANAPE_TURN_SECRET`, voir ci-dessous).
- Les films lourds (4K, HDR) se préparent à l'avance depuis leur fiche ou automatiquement quand le serveur est calme.

**Inscription libre, côté visiteur** : sur `/connexion`, le lien « Créer un compte » (visible seulement quand c'est ouvert)
mène à `/inscription` : prénom, identifiant, mot de passe (au moins 10 caractères, jauge et confirmation), couleur, et la
case « J'accepte les règles d'usage » (page `/regles`, lisible sans compte). Une fois inscrit, il arrive connecté sur
l'accueil avec les premiers pas. Si l'administrateur a fermé les inscriptions (ou si le maximum est atteint), la page
l'explique. Ses films restent privés tant qu'il ne les partage pas.

**Inscription libre** : page Réglages de l'administration (ou `sudo canape admin inscriptions ouvrir|fermer`) :
`inscriptionsOuvertes` (défaut : oui), `quotaInscriptionOctets` (défaut 20 Go par inscrit), `torrentsInscrits` (défaut :
non, un inconnu ne fait pas télécharger de torrents au serveur sans ton accord ; le droit se donne compte par compte
dans la page Comptes) et `maxComptesInscrits` (défaut 100). Un inscrit ne voit pas les autres comptes : il retrouve
quelqu'un par son identifiant exact pour partager un film ou l'inviter à une séance.

## Configuration

Réglages dans `/etc/canape/canape.conf` (format `CLÉ=valeur`, `#` pour un commentaire ; modèle commenté :
[`deploiement/canape.conf.exemple`](deploiement/canape.conf.exemple)), ou en variables d'environnement `CANAPE_*`
(prioritaires sur le fichier). Le fichier se désigne par `--config <fichier>` ou `CANAPE_CONFIG`. Après modification :
`sudo systemctl restart canape`. Les tailles s'écrivent `100G`, `512M`, `1.5 Go`…

| Variable | Défaut | Rôle |
|---|---|---|
| `CANAPE_HOTE` | `127.0.0.1` | adresse d'écoute (derrière nginx, laisser en local) |
| `CANAPE_PORT` | `8080` | port d'écoute |
| `CANAPE_URL_PUBLIQUE` | `http://localhost:8080` | adresse publique : liens d'invitation, contrôle d'`Origin`, cookie `Secure` si HTTPS |
| `CANAPE_DERRIERE_PROXY` | `0` | `1` : faire confiance aux en-têtes `X-Forwarded-*` de nginx |
| `CANAPE_DONNEES` | `./donnees` | base SQLite et sauvegardes |
| `CANAPE_FILMS` | `./films` | films |
| `CANAPE_CACHE` | `./cache` | segments HLS, sous-titres extraits, index d'images clés |
| `CANAPE_TELEVERSEMENTS` | `./televersements` | téléversements en cours |
| `CANAPE_TORRENTS` | `1` | `0` désactive l'ajout par torrent |
| `CANAPE_TELECHARGEMENTS` | à côté de `CANAPE_TELEVERSEMENTS` (VPS : `/srv/canape/telechargements`) | données des torrents en cours et `.torrent` gardés |
| `CANAPE_TORRENT_SIMULTANES` | `2` | téléchargements actifs en même temps (les autres attendent) |
| `CANAPE_TORRENT_DEBIT_MAX` | `0` | octets/s reçus au plus (`0` = sans limite ; `20M` accepté) |
| `CANAPE_TORRENT_ENVOI_MAX` | `1M` | octets/s envoyés au plus |
| `CANAPE_TORRENT_PARTAGE` | `0` | ratio de partage après la fin (`0` = arrêt dès la fin ; sinon les fichiers sont copiés et gardés jusqu'au ratio, 24 h au plus) |
| `CANAPE_TORRENT_PORT` | `0` | port d'écoute des pairs (`0` = au hasard ; un port fixe ouvert dans le pare-feu aide) |
| `CANAPE_TELEVERSEMENT_MAX` | `100G` | taille maximale d'un téléversement |
| `CANAPE_QUOTA_DEFAUT` | `100G` | quota par défaut d'un compte |
| `CANAPE_CACHE_MAX` | `20G` | taille maximale du cache |
| `CANAPE_TRANSCODAGE_FILS` | moitié des cœurs (au moins 1) | fils de calcul de ffmpeg (1 à 256) |
| `CANAPE_TRANSCODAGE_PRIORITE` | `10` | priorité `nice` de ffmpeg (0 à 19) |
| `CANAPE_PREPARATION_AUTO` | `1` | préparer automatiquement les films qui ne se lisent pas directement |
| `CANAPE_TMDB_CLE` | vide | clé TMDB (affiches et résumés) |
| `CANAPE_ICE` | STUN public de Google | serveurs STUN/TURN donnés aux navigateurs (liste JSON) |
| `CANAPE_TURN_URLS` | vide | URL du relais TURN, séparées par des virgules |
| `CANAPE_TURN_SECRET` | vide | secret partagé avec coturn (identifiants temporaires par navigateur) |
| `CANAPE_TLS_CERT`, `CANAPE_TLS_CLE` | vides | HTTPS servi directement par Node (inutile derrière nginx) |

Le contrat complet est dans [`docs/CONCEPTION.md`](docs/CONCEPTION.md), section « Configuration ».

## Ligne de commande `canape`

```
canape [--config <fichier>] <commande>

  serve                                              démarre le serveur
  admin inviter [--role admin|viewer] [--jours 7]    crée un lien d'invitation
  admin inscriptions [ouvrir|fermer]                 ouvre ou ferme l'inscription libre (sans argument : état)
  admin reinitialiser <identifiant>                  crée un lien de réinitialisation de mot de passe
  films importer <dossier> --proprietaire <identifiant> [--copier]
                                                     importe des films existants (déplacés, ou copiés avec --copier)
  --version, --aide
```

Sur le serveur, la commande est installée dans `/usr/local/bin/canape` (à lancer en `sudo`, pour lire la configuration et
écrire dans la base). En développement : `bin/canape`.

## Développement

Prérequis : Node.js 26 et ffmpeg/ffprobe.

```bash
npm ci                 # installe les dépendances (serveur, client, partage)
npm run dev:serveur    # serveur sur le port 8080, données dans ./dev/ (relancé à chaque modification)
npm run dev:client     # interface SvelteKit sur http://localhost:5173
npm run typecheck      # tsc (serveur, partage) et svelte-check (client)
npm test               # tests node:test (serveur et logique du client)
npm run build          # construit le client
npm run paquet         # construit dist/canape-<version>.tar.gz et dist/SHA256SUMS
```

Essais de bout en bout (Playwright, Chromium, Firefox et WebKit, caméras simulées) : installer d'abord les navigateurs,
puis lancer les essais.

```bash
npx playwright install --with-deps chromium firefox webkit
npm run e2e                          # tous les navigateurs
npm run e2e -- --project=chromium    # un seul
```

Les tests, les essais Playwright et la construction sont des travaux lourds ; sur un poste modeste, ne pas les lancer en
parallèle. Les scripts de déploiement se rejouent sans root avec `deploiement/essais/*.sh` (faux chemins et fausses
commandes, rien n'est modifié).

Le projet suit git flow : travail sur `feature/*`, intégration dans `develop`, versions sur `main`. La CI
(`.github/workflows/ci.yml`) tourne sur `develop` et sur les pull requests.

## Structure du dépôt

```
bin/canape            point d'entrée de la ligne de commande
serveur/              serveur Node.js (Fastify, SQLite) : src/ (modules comptes, mediatheque, lecture, seances),
                      migrations/, tests/
client/               interface Svelte 5 / SvelteKit (application monopage, PWA) : src/, static/
partage/              types et protocole WebSocket partagés entre serveur et client
e2e/                  essais Playwright
deploiement/          installation, mise à jour, déploiement automatique, modèle nginx, service systemd, essais
scripts/paquet.sh     construction du paquet de livraison
.github/              workflows (CI, déploiement) et scripts
docs/                 conception, design, recherche technique, guide de déploiement, maquette
```

## Documents

- [`docs/CONCEPTION.md`](docs/CONCEPTION.md) : le contrat de la 1.0 (technologies, configuration, données, droits,
  routes, lecture universelle, livraison).
- [`docs/DESIGN.md`](docs/DESIGN.md) : direction artistique et produit (maquette : `docs/maquettes/canape.html`).
- [`docs/RECHERCHE-TECHNIQUE.md`](docs/RECHERCHE-TECHNIQUE.md) : recherche et mesures (conversion, écho, TURN…).
- [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) : guide d'exploitation du serveur.
- [`ROADMAP.md`](ROADMAP.md) : feuille de route.
- [`CHANGELOG.md`](CHANGELOG.md) : journal des versions.

## Licence

[MIT](LICENSE) © 2026 mawena
