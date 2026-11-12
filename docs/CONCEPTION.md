# Conception — Canapé

## Pourquoi

Deux personnes, chacune chez soi, veulent regarder un film ensemble en se voyant et en s'entendant.
Avant Canapé, on lisait le film sur un PC et on le partageait par l'écran dans Google Meet :

- l'image arrivait saccadée chez l'autre (l'écran est filmé, compressé puis renvoyé en direct) ;
- Meet ne laisse passer qu'une source de son : soit le son du film, soit le micro, jamais les deux.

## Principe

- **Pas de partage d'écran.** Le film est sur le serveur ; chaque navigateur le lit lui-même, directement
  depuis le serveur (HTTP avec requêtes `Range`). L'image est aussi nette chez l'un que chez l'autre.
- **Lecture synchronisée.** Lecture, pause, déplacement dans le film et choix du film sont partagés : ce que fait
  l'un arrive chez l'autre. Les deux lectures restent alignées (écart visé : moins de 0,5 s).
- **Film et voix séparés.** Le son du film sort chez chacun ; les micros ne servent qu'à la conversation.
- **Caméras.** Appel vidéo direct entre les navigateurs (WebRTC, pair à pair), le serveur ne sert qu'à mettre
  les deux navigateurs en relation (signalisation par WebSocket). Les vignettes des caméras s'affichent sur le film.

## Objectifs, non-objectifs

- Objectif : un salon privé, protégé par un mot de passe commun, conçu pour deux personnes (accepte jusqu'à 4).
- Objectif : fonctionner dans Chrome, Firefox et Edge récents sur ordinateur ; utilisable sur téléphone.
- Non-objectif : service public multi-salons, comptes utilisateurs, transcodage à la volée sur le serveur.
- Anti-objectif : image saccadée, ou devoir choisir entre le son du film et la voix.

## Arborescence et propriétaires

```
bin/canape              point d'entrée (#!/usr/bin/env node) : lance le serveur
bin/canape-convertir    script bash : convertit un film pour le navigateur (ffmpeg)
src/                    modules du serveur (CommonJS, Node >= 18, aucune étape de construction)
public/                 interface web statique (HTML, CSS, JS natif, sans framework ni construction)
tests/                  tests node:test (`npm test`)
package.json            seule dépendance de production : ws
deploiement/            mise en ligne sur un serveur à soi : unité systemd, réglages d'exemple,
                        configuration nginx, script de déploiement depuis le poste
README.md, LICENSE, CHANGELOG.md, ROADMAP.md
```

## Configuration

Le serveur se règle par des variables d'environnement. `bin/canape --config <fichier>` (ou la variable
`CANAPE_CONFIG`) lit en plus un fichier `CLÉ=valeur` (lignes `#` ignorées, valeurs éventuellement entre
guillemets) ; les variables déjà présentes dans l'environnement l'emportent sur le fichier.
Sur le serveur, `/etc/canape/canape.conf` est dans ce format, lu par systemd (`EnvironmentFile=`).

| Variable | Défaut | Rôle |
|---|---|---|
| `CANAPE_HOTE` | `0.0.0.0` | adresse d'écoute |
| `CANAPE_PORT` | `8080` | port d'écoute |
| `CANAPE_FILMS` | `./films` | dossier des films (sous-dossiers permis) |
| `CANAPE_MOT_DE_PASSE` | vide | mot de passe commun ; vide = accès libre, avec un avertissement au démarrage |
| `CANAPE_SECRET` | aléatoire à chaque démarrage | signe les cookies de session (sinon les sessions tombent au redémarrage) |
| `CANAPE_TLS_CERT`, `CANAPE_TLS_CLE` | vides | chemins du certificat et de la clé : HTTPS servi directement |
| `CANAPE_DERRIERE_PROXY` | `0` | `1` = faire confiance à `X-Forwarded-Proto` / `X-Forwarded-For` (proxy HTTPS devant) |
| `CANAPE_ICE` | `[{"urls":"stun:stun.l.google.com:19302"}]` | serveurs STUN/TURN donnés aux navigateurs (JSON) |
| `CANAPE_TURN_URLS` | vide | URL TURN séparées par des virgules (ex. `turn:exemple.fr:3478`) |
| `CANAPE_TURN_SECRET` | vide | secret partagé de coturn (`static-auth-secret`) : identifiants TURN temporaires |

Caméra et micro exigent une page sûre : HTTPS, ou `http://localhost`.

## Production

Canapé est une application web, pas un paquet Ubuntu. Elle tourne sur un serveur à soi (VPS) :

- Node.js écoute seulement en local (`CANAPE_HOTE=127.0.0.1`, port 8080), comme service systemd durci,
  sous un utilisateur dédié `canape` ;
- nginx est devant : HTTPS avec un certificat Let's Encrypt (certbot), passage du WebSocket `/ws`, envoi des
  films sans mise en mémoire tampon ; `CANAPE_DERRIERE_PROXY=1` ;
- le code va dans `/opt/canape`, les films dans `/srv/canape/films`, les réglages dans `/etc/canape/canape.conf`.

## Interface HTTP

| Méthode et chemin | Accès | Rôle |
|---|---|---|
| `GET /` et fichiers de `public/` | libre | l'application (elle affiche la connexion si besoin) |
| `GET /api/etat` | libre | `{ "version", "connecte", "motDePasseRequis", "prenom" }` : sert aussi de test de santé |
| `POST /api/connexion` | libre | `{ "motDePasse", "prenom" }` → 204 et cookie de session ; 401 ; 429 si trop d'essais |
| `POST /api/deconnexion` | session | efface le cookie |
| `GET /api/films` | session | liste des films, avec leurs sous-titres et leur compatibilité navigateur |
| `GET /api/config` | session | `{ "iceServers", "participantsMax" }` (STUN/TURN, identifiants TURN temporaires) |
| `GET /films/<chemin>` | session | le fichier du film, requêtes `Range` acceptées |
| `GET /sous-titres/<chemin>` | session | sous-titres en WebVTT (`.srt` converti à la volée) |
| `GET /ws` (WebSocket) | session | synchronisation de la lecture et signalisation WebRTC |

## Films

- Extensions reconnues : `.mp4`, `.m4v`, `.webm`, `.mkv`, `.mov`, `.ogv`.
- Sous-titres : fichier `.srt` ou `.vtt` à côté du film, même nom de base, avec un code de langue facultatif
  (`Film.mp4`, `Film.srt`, `Film.fr.srt`, `Film.en.vtt`).
- Compatibilité : si `ffprobe` est présent, le serveur lit les codecs (résultat mis en cache) et marque un film
  « lisible partout » (vidéo H.264, VP8, VP9 ou AV1 ; son AAC, MP3, Opus ou Vorbis), sinon « à convertir » ;
  sans ffprobe, la compatibilité est inconnue (`null`).
- `canape-convertir <film>` produit un MP4 H.264 + AAC avec `+faststart` à côté de l'original, et extrait les
  sous-titres texte intégrés en `.vtt`.

## Synchronisation

- Le serveur garde l'état du salon : film choisi, en lecture ou en pause, position, instant de la dernière
  modification, numéro de version. Il le renvoie à chaque nouvel arrivant.
- Chaque client estime le décalage de son horloge avec celle du serveur (échanges ping/pong) et calcule la
  position attendue ; écart > 1 s : il saute à la bonne position ; écart entre 0,3 et 1 s : il accélère ou
  ralentit légèrement la lecture jusqu'à rattraper.
- Attente mutuelle : quand un navigateur charge (mise en mémoire tampon) plus d'une seconde, le salon se met en
  pause pour tous avec un message « … charge le film », puis reprend quand tout le monde est prêt.
- Les navigateurs bloquent la lecture automatique avec son : le premier geste (« Entrer dans le salon ») sert
  à l'autoriser ; si la lecture est quand même refusée, un bouton « Reprendre ici » s'affiche.

## Appel vidéo

- WebRTC pair à pair, en maillage (chaque participant relié à chacun), signalisation par le WebSocket.
- Micro avec annulation d'écho, réduction de bruit et contrôle de gain automatique ; boutons couper le micro,
  couper la caméra ; le volume du film et celui de la voix se règlent séparément.
- Écho : sans casque, le son du film sortant des enceintes peut repartir dans le micro. L'application le dit
  à l'arrivée (« un casque évite l'écho ») et baisse un peu le film quand l'autre parle.
- Plein écran : c'est le conteneur (film + vignettes + commandes) qui passe en plein écran, pas la balise vidéo,
  pour garder les caméras visibles.
