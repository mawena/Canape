# Canapé

**Site : <https://mawena.github.io/Canape/>**

Canapé permet à deux personnes, chacune chez soi, de regarder un film ensemble en se voyant et en s'entendant.

## À quoi ça sert

Avant Canapé, on lisait le film sur un PC et on le partageait par l'écran dans Google Meet. Deux défauts :

- l'image arrivait saccadée chez l'autre (l'écran est filmé, compressé puis renvoyé en direct) ;
- Meet ne laisse passer qu'une source de son : soit le son du film, soit le micro, jamais les deux.

Canapé n'a pas de partage d'écran. Le film est sur le serveur et chaque navigateur le lit lui-même, directement
(HTTP avec requêtes `Range`) : l'image est aussi nette chez l'un que chez l'autre. La lecture est synchronisée
(lecture, pause, déplacement, choix du film ; écart visé : moins de 0,5 s). Le son du film sort chez chacun, et
les caméras et micros passent à côté, en WebRTC pair à pair : les vignettes des caméras s'affichent sur le film.

Un salon privé protégé par un mot de passe commun, pensé pour deux personnes (jusqu'à 4). Chrome, Firefox et Edge
récents sur ordinateur ; utilisable sur téléphone.

## Installation

Sur Ubuntu 24.04 (et les distributions Debian équivalentes), Canapé s'installe par son dépôt APT signé, avec
Node.js 18 ou plus.

### En une ligne

```sh
curl -fsSL https://mawena.github.io/Canape/installer.sh | sh
```

Le script fait les trois étapes ci-dessous ; une fenêtre de mot de passe s'ouvre pour les droits administrateur.

### Pas à pas

```sh
# 1. la clé qui signe le dépôt
sudo curl -fsSLo /usr/share/keyrings/canape.gpg https://mawena.github.io/Canape/apt/canape.gpg
# 2. le dépôt
sudo curl -fsSLo /etc/apt/sources.list.d/canape.sources https://mawena.github.io/Canape/apt/canape.sources
# 3. l'installation
sudo apt update && sudo apt install canape
```

Clé du dépôt : « Canapé APT (mawena) », empreinte `1815 E2DB B0A8 04AC 536A  745B 7CE1 26A8 2EFB F1C9`.
Le service `canape` est activé et démarré à l'installation. `ffmpeg` est recommandé (voir plus bas).

### Mise à jour

```sh
sudo apt update && sudo apt upgrade
```

### En dernier recours : le `.deb` des releases

Téléchargez `canape_<version>_all.deb` et `SHA256SUMS` sur la page des
[releases](https://github.com/mawena/Canape/releases/latest), vérifiez la somme (`sha256sum -c SHA256SUMS`), puis
`sudo apt install ./canape_<version>_all.deb`. Le paquet ajoute lui-même le dépôt APT : les mises à jour suivantes
passent par `apt upgrade`.

## Premiers pas

1. **Le mot de passe commun** est créé à l'installation, avec le secret des sessions, dans
   `/etc/canape/secrets.conf` : `sudo cat /etc/canape/secrets.conf`. Pour le changer, modifiez
   `CANAPE_MOT_DE_PASSE` (dans ce fichier ou dans `canape.conf`, qui l'emporte), puis
   `sudo systemctl restart canape`. Ce fichier est lu avant `canape.conf`, qui n'est jamais réécrit par les mises à
   jour.
2. **Les films** se mettent dans `/var/lib/canape/films` (sous-dossiers permis ; `.mp4`, `.m4v`, `.webm`, `.mkv`,
   `.mov`, `.ogv`). Le dossier appartient au groupe `canape` et est inscriptible par lui : ajoutez-vous-y pour
   copier sans droits administrateur (`sudo adduser "$USER" canape`, puis reconnectez-vous). Une désinstallation, même
   avec `purge`, ne supprime jamais les films.
3. **Films « à convertir »** : si `ffprobe` est présent, le serveur lit les codecs et marque un film « lisible
   partout » (vidéo H.264, VP8, VP9 ou AV1 ; son AAC, MP3, Opus ou Vorbis) ou « à convertir ». `canape-convertir
   <film>` produit un MP4 H.264 + AAC (`+faststart`) à côté de l'original, et extrait les sous-titres texte
   intégrés en `.vtt`. Il demande `ffmpeg` : `sudo apt install ffmpeg`.
4. **Sous-titres** : un fichier `.srt` ou `.vtt` à côté du film, même nom de base, avec un code de langue
   facultatif (`Film.mp4`, `Film.srt`, `Film.fr.srt`, `Film.en.vtt`).
5. Ouvrez `http://localhost:8080`.

## HTTPS obligatoire pour la caméra

Le navigateur n'autorise la caméra et le micro que sur une page sûre : HTTPS, ou `http://localhost`. Pour que l'autre
personne se connecte de chez elle, il faut donc HTTPS. Trois façons.

**Caddy (le plus simple : il obtient et renouvelle le certificat tout seul)**

```
canape.exemple.fr {
    reverse_proxy 127.0.0.1:8080
}
```

**nginx**

```nginx
server {
    listen 443 ssl;
    server_name canape.exemple.fr;
    ssl_certificate     /etc/letsencrypt/live/canape.exemple.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/canape.exemple.fr/privkey.pem;
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # WebSocket (/ws)
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 3600s;
        proxy_buffering off;                          # films en flux, requêtes Range
    }
}
```

Avec un proxy, dans `/etc/canape/canape.conf` : `CANAPE_DERRIERE_PROXY=1` et `CANAPE_HOTE=127.0.0.1`.

**Certificat direct** (sans proxy) : dans `/etc/canape/canape.conf`, `CANAPE_TLS_CERT=` et `CANAPE_TLS_CLE=` avec les
chemins du certificat et de la clé, lisibles par l'utilisateur `canape` (par exemple `CANAPE_PORT=443`, le service
peut ouvrir ce port). Puis `sudo systemctl restart canape`.

## TURN : quand l'appel ne passe pas

Les caméras se parlent directement d'un navigateur à l'autre. Derrière un réseau strict (entreprise, pare-feu,
NAT symétrique), il faut un relais TURN. Installez `coturn` (`sudo apt install coturn`), activez-le avec
`use-auth-secret` et un `static-auth-secret=<secret>` dans `/etc/turnserver.conf`, ouvrez le port 3478 (UDP et TCP),
puis dans `/etc/canape/canape.conf` :

```
CANAPE_TURN_URLS=turn:canape.exemple.fr:3478
CANAPE_TURN_SECRET=<le même secret>
```

Canapé fabrique alors des identifiants TURN temporaires pour chaque navigateur. `CANAPE_ICE` remplace la liste des
serveurs STUN/TURN donnée aux navigateurs (JSON).

## Configuration

Le service lit `/etc/canape/secrets.conf` puis `/etc/canape/canape.conf` (format `CLÉ=valeur`, `#` pour un
commentaire ; les variables d'environnement l'emportent sur un fichier lu par `--config`).

| Variable | Défaut | Rôle |
|---|---|---|
| `CANAPE_HOTE` | `0.0.0.0` | adresse d'écoute |
| `CANAPE_PORT` | `8080` | port d'écoute |
| `CANAPE_FILMS` | `./films` (paquet : `/var/lib/canape/films`) | dossier des films (sous-dossiers permis) |
| `CANAPE_MOT_DE_PASSE` | vide (paquet : créé dans `secrets.conf`) | mot de passe commun ; vide = accès libre, avec un avertissement au démarrage |
| `CANAPE_SECRET` | aléatoire à chaque démarrage (paquet : créé dans `secrets.conf`) | signe les cookies de session (sinon les sessions tombent au redémarrage) |
| `CANAPE_TLS_CERT`, `CANAPE_TLS_CLE` | vides | chemins du certificat et de la clé : HTTPS servi directement |
| `CANAPE_DERRIERE_PROXY` | `0` | `1` = faire confiance à `X-Forwarded-Proto` / `X-Forwarded-For` (proxy HTTPS devant) |
| `CANAPE_ICE` | `[{"urls":"stun:stun.l.google.com:19302"}]` | serveurs STUN/TURN donnés aux navigateurs (JSON) |
| `CANAPE_TURN_URLS` | vide | URL TURN séparées par des virgules (ex. `turn:exemple.fr:3478`) |
| `CANAPE_TURN_SECRET` | vide | secret partagé de coturn (`static-auth-secret`) : identifiants TURN temporaires |

Après une modification : `sudo systemctl restart canape`. Journal : `journalctl -u canape`. Test de santé :
`curl http://localhost:8080/api/etat`.

## Utilisation

1. Chacun ouvre l'adresse de Canapé dans son navigateur, entre le mot de passe commun et un prénom.
2. « Entrer dans le salon » : ce premier geste autorise la lecture avec son (les navigateurs bloquent la lecture
   automatique). Acceptez la caméra et le micro. Si la lecture est quand même refusée, un bouton « Reprendre ici »
   s'affiche.
3. L'un choisit le film : il se lance chez les deux.
4. Les commandes sont partagées : lecture, pause, déplacement dans le film et choix du film. Si un navigateur charge
   plus d'une seconde, le salon se met en pause pour tous puis reprend quand tout le monde est prêt.
5. Le volume du film et celui de la voix se règlent séparément ; boutons pour couper le micro et la caméra ;
   plein écran avec les vignettes des caméras.
6. **Un casque est conseillé** : sans casque, le son du film sort des enceintes et repart dans le micro (écho).

## Développement

```sh
npm install
CANAPE_FILMS=./films CANAPE_MOT_DE_PASSE=essai bin/canape    # http://localhost:8080
npm test                                                     # tests node:test
```

Construire le paquet et le publier (voir `docs/CONCEPTION.md` pour le contrat commun) :

```sh
make deb      # dist/canape_<version>_all.deb, SHA256SUMS, tests et lintian
make apt      # publie dist/*.deb dans le dépôt APT signé (branche gh-pages)
```

La construction demande `debhelper`, `nodejs`, `npm`, `lintian` ; la publication, la clé de signature du dépôt
(empreinte dans `data/apt/LISEZMOI`).

## Structure du dépôt

```
bin/canape              point d'entrée : lance le serveur
bin/canape-convertir    convertit un film pour le navigateur (ffmpeg)
src/                    modules du serveur (Node >= 18, CommonJS)
public/                 interface web statique
tests/                  tests node:test
debian/                 paquet Debian (dont canape.service, canape.conf)
scripts/                build-deb.sh, publier-apt.sh
data/apt/               clé publique et source deb822 du dépôt APT
site/                   page d'accueil GitHub Pages et installer.sh
docs/CONCEPTION.md      conception et contrat commun
Makefile                cibles deb, apt, test, clean
```

## Licence

MIT, voir [LICENSE](LICENSE).
