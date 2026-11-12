# Canapé

Regarder un film à deux, chacun chez soi, en se voyant et en s'entendant. Canapé est une application web que l'on
déploie sur son propre serveur (un VPS), derrière nginx.

## À quoi ça sert

Avant Canapé, on lisait le film sur un PC et on le partageait par l'écran dans Google Meet. Deux défauts :

- l'image arrivait saccadée chez l'autre (l'écran est filmé, compressé puis renvoyé en direct) ;
- Meet ne laisse passer qu'une source de son : soit le son du film, soit le micro, jamais les deux.

Canapé n'a pas de partage d'écran. Le film est sur le serveur Node.js et chaque navigateur le lit lui-même,
directement (HTTP avec requêtes `Range`) : l'image est aussi nette chez l'un que chez l'autre. La lecture est
synchronisée par WebSocket (lecture, pause, déplacement, choix du film ; écart visé : moins de 0,5 s). Le son du film
sort chez chacun, et les caméras et micros passent à côté, en WebRTC pair à pair : les vignettes des caméras
s'affichent sur le film, et on peut régler le volume du film et celui des voix séparément.

Un salon privé protégé par un mot de passe commun, pensé pour deux personnes (jusqu'à 4). Chrome, Firefox et Edge
récents sur ordinateur ; utilisable sur téléphone.

## Prérequis du serveur

- un VPS (Ubuntu ou Debian de préférence) où vous avez un accès SSH avec `sudo` ;
- **Node.js 18 ou plus** et `npm` ;
- **nginx** (c'est lui qui parle HTTPS au monde ; Node n'écoute qu'en local) ;
- un **nom de domaine** dont l'enregistrement DNS (A, et AAAA si IPv6) pointe sur le serveur, et les ports 80 et 443
  ouverts ;
- `rsync` et `curl` sur le serveur ; **certbot** pour le certificat Let's Encrypt ;
- `ffmpeg` (conseillé) : il fournit `ffprobe`, qui sert à savoir si un film passe dans les navigateurs, et
  `canape-convertir`.

```sh
sudo apt install nginx rsync curl certbot python3-certbot-nginx ffmpeg
sudo apt install nodejs npm      # si la version obtenue est inférieure à 18 : nodejs.org ou NodeSource
```

## Déploiement

### Sur le VPS : `installer-serveur.sh` (méthode conseillée)

Sur le serveur, clonez le dépôt puis lancez le script en root. Il copie le code vers `/opt/canape` (le clone n'est
jamais le code qui tourne) :

```sh
git clone https://github.com/mawena/Canape.git ~/Canape && cd ~/Canape
sudo ./deploiement/installer-serveur.sh --domaine canape.mawena.cloud
# mise à jour :
cd ~/Canape && git pull && sudo ./deploiement/installer-serveur.sh --domaine canape.mawena.cloud
```

Options : `--domaine <nom>` (site nginx et certificat Let's Encrypt), `--port <N>` (port local de Node),
`--node <chemin>` (Node.js 18+ à copier dans `/opt/canape/node`), `--essai` (affiche ce qui serait fait, sans rien
modifier ni root), `--desinstaller`. Sans `--domaine`, nginx n'est pas touché.

- **Port** : 8080 par défaut. S'il est déjà pris (par n'importe quel programme, sur n'importe quelle adresse), le
  premier déploiement choisit tout seul un port libre (8780 et suivants), le dit, et l'écrit dans `CANAPE_PORT` et
  dans le `proxy_pass` de nginx. Aux mises à jour, le port de `/etc/canape/canape.conf` est gardé.
- **Node.js** : le script n'installe ni ne remplace jamais Node.js. S'il en trouve un (18+) pour root, il l'utilise.
  Si `node` n'existe que pour votre utilisateur (nvm : `sudo node` répond « command not found »), donnez-le avec
  `--node` ; il est **copié** dans `/opt/canape/node` (le service ne peut pas lancer un Node placé dans un dossier
  personnel) et réutilisé aux mises à jour :

  ```sh
  sudo ./deploiement/installer-serveur.sh --domaine canape.mawena.cloud --node "$(command -v node)"
  ```

  (le `$(command -v node)` est évalué par votre shell, avant `sudo`).
- Votre compte (`$SUDO_USER`) est ajouté au groupe `canape` : il peut copier des films dans `/srv/canape/films`
  (après une reconnexion).

### À côté d'autres sites

Le serveur peut déjà héberger d'autres sites : le script est écrit pour ne rien leur faire.

- **Il touche seulement** : `/opt/canape`, `/etc/canape` (créé une fois, jamais réécrit sauf `CANAPE_PORT` si le port
  change), `/etc/systemd/system/canape.service`, `/usr/local/bin/canape-convertir`, l'utilisateur `canape`, et **un
  seul fichier nginx nommé d'après le domaine** (`sites-available/canape.mawena.cloud.conf` et son lien dans
  `sites-enabled`, ou `conf.d/` sans ce découpage), marqué `# Géré par Canapé`. Les films ne sont jamais touchés.
- **Il ne touche pas** : les autres fichiers nginx, `nginx.conf`, les autres certificats, Node.js du système,
  les autres services.
- **Avant** de toucher à nginx : `nginx -t` doit réussir sur la configuration actuelle (le code de sortie compte ;
  des avertissements déjà présents n'empêchent rien et sont notés pour être comparés ensuite). S'il échoue déjà,
  le script s'arrête sans rien modifier : le problème est antérieur. Il refuse aussi d'écraser un fichier du même
  nom sans marqueur, et de continuer si un autre fichier déclare déjà `server_name` pour ce domaine (il le nomme,
  sans le toucher : retirez-le vous-même s'il est obsolète).
- **Pendant** : si `nginx -t` échoue après la pose du fichier de Canapé, ou si certbot échoue après le bloc HTTP
  provisoire, l'état d'avant est remis exactement (ancien fichier restauré, ou fichier et lien supprimés) et nginx
  n'est jamais rechargé dans un état invalide. Seulement `reload`, jamais `restart`. Certificat par
  `certbot certonly --nginx -d <domaine>` (qui ne réécrit aucun fichier), avec `--deploy-hook` seulement si aucun
  hook de rechargement n'existe déjà. Après la pose, les nouveaux avertissements de `nginx -t` sont signalés.
- **Port** : vérifié avec `ss -ltnp` avant tout (voir plus haut).
- **IPv6** : le gabarit déclare `listen [::]:80` et `listen [::]:443`, mais le script ne les garde que si un autre
  fichier nginx écoute déjà en IPv6 sur ce port ; sinon Canapé deviendrait, en IPv6, le site par défaut de tous
  les autres domaines. Sur un serveur où nginx écoute déjà en IPv6, Canapé y est donc aussi joignable.
- **Sans certbot** : le site reste en HTTP seulement (sans caméra), avec la marche à suivre.

Vérifier soi-même ensuite :

```sh
sudo nginx -t
systemctl status canape
curl -I https://canape.mawena.cloud
curl http://127.0.0.1:8080/api/etat       # avec votre port si ce n'est pas 8080
```

**Désinstaller** : arrête et retire le service, retire le fichier nginx de Canapé (`nginx -t` puis `reload`, retour
arrière si besoin) et `/opt/canape` ; garde `/etc/canape`, les films et le certificat (le script donne les
commandes pour les supprimer à la main, dont `sudo certbot delete --cert-name canape.mawena.cloud`).

```sh
sudo ./deploiement/installer-serveur.sh --desinstaller --domaine canape.mawena.cloud
```

L'essai de la partie nginx (sans root, avec un faux `/etc/nginx` et le nginx du poste) :
`deploiement/essais/essai-nginx.sh`.

### Depuis le poste : `deployer.sh`

Même installation, lancée depuis votre poste : le script envoie le code (`rsync`) dans un dossier temporaire du
serveur et y lance `sudo ./deploiement/installer-serveur.sh` par `ssh -t` (le mot de passe sudo est demandé dans votre
terminal). Il n'a pas sa propre copie de l'installation : tout est dans `installer-serveur.sh`.

```sh
deploiement/deployer.sh moi@mon-serveur.exemple.fr --domaine canape.exemple.fr [--port N] [--node /chemin/node]
```

`--essai` affiche les commandes et la simulation de l'installation sans rien exécuter ;
`SSH_OPTS="-p 2222 -i ~/.ssh/vps"` passe des options à ssh. `--node` désigne ici un chemin **du serveur**.

### Pas à pas, à la main

Sur le serveur :

```sh
# 1. l'utilisateur et les dossiers
sudo useradd --system --user-group --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin canape
sudo install -d -m 0755 /opt/canape
sudo install -d -m 2775 -o root -g canape /srv/canape /srv/canape/films
sudo install -d -m 0750 -o root -g canape /etc/canape
```

Depuis votre poste, envoyez le code, puis sur le serveur installez les dépendances :

```sh
rsync -az --delete --relative bin src public package.json package-lock.json deploiement moi@mon-serveur:/tmp/canape/
# sur le serveur :
sudo rsync -a --delete /tmp/canape/ /opt/canape/
cd /opt/canape && sudo npm ci --omit=dev
sudo ln -sf /opt/canape/bin/canape-convertir /usr/local/bin/canape-convertir
```

La configuration (remplissez le mot de passe et le secret : `openssl rand -hex 32` pour le secret) :

```sh
sudo install -m 0640 -o root -g canape /opt/canape/deploiement/canape.conf.exemple /etc/canape/canape.conf
sudoedit /etc/canape/canape.conf
```

Le service systemd (vérifiez que `ExecStart` pointe sur votre `node`, `command -v node`) :

```sh
sudo cp /opt/canape/deploiement/canape.service /etc/systemd/system/canape.service
sudo systemctl daemon-reload
sudo systemctl enable --now canape
curl http://127.0.0.1:8080/api/etat        # {"version":…,"connecte":false,"motDePasseRequis":true,…}
```

nginx : copiez `deploiement/nginx/canape.conf`, remplacez `canape.exemple.fr` par votre domaine et `CANAPE_PORT_A_REMPLACER` par le port de Node. Le fichier
référence le certificat Let's Encrypt, qui n'existe pas encore : obtenez-le d'abord.

```sh
# 1. un site HTTP minimal (le premier bloc « server » du fichier) pour que certbot valide le domaine
sudo cp /opt/canape/deploiement/nginx/canape.conf /etc/nginx/sites-available/canape.mondomaine.fr.conf   # à réduire au bloc du port 80
sudo sed -i 's/canape\.exemple\.fr/canape.mondomaine.fr/g; s/CANAPE_PORT_A_REMPLACER/8080/g' /etc/nginx/sites-available/canape.mondomaine.fr.conf
sudo ln -s /etc/nginx/sites-available/canape.mondomaine.fr.conf /etc/nginx/sites-enabled/
# 2. le certificat (renouvelé tout seul par le minuteur de certbot)
sudo certbot certonly --nginx -d canape.mondomaine.fr --deploy-hook "systemctl reload nginx"
# 3. le fichier complet, puis
sudo nginx -t && sudo systemctl reload nginx
```

Ce que fait la configuration nginx : redirection du port 80 vers HTTPS (et `/.well-known/acme-challenge/` pour
certbot), HTTP/2, `proxy_pass` vers `127.0.0.1:<port de Node>` avec `Host`, `X-Forwarded-For` et `X-Forwarded-Proto` ;
`/ws` avec `Upgrade`/`Connection` et un délai de lecture de 6 heures (un film dure) ; `/films/` sans mise en mémoire
tampon (`proxy_buffering off`, `proxy_request_buffering off`) pour les gros fichiers et les requêtes `Range`. Les
en-têtes de sécurité (HSTS, `Permissions-Policy` avec caméra et micro pour `self`, CSP) sont envoyés par Canapé
lui-même.

Le service est durci (`ProtectSystem=strict`, `NoNewPrivileges`, filtre d'appels système…) et tourne sans aucun droit
particulier. Le filtre `SystemCallFilter=@system-service @pkey` doit garder `@pkey` : sans lui, Node (V8) meurt au
démarrage.

Journal : `journalctl -u canape -f`.

## Mise à jour

Relancez le script : il recopie le code, refait `npm ci --omit=dev` et redémarre le service, sans toucher à
`/etc/canape/canape.conf` ni aux films.

```sh
# sur le VPS
cd ~/Canape && git pull && sudo ./deploiement/installer-serveur.sh --domaine canape.mawena.cloud
# ou depuis le poste
git pull && deploiement/deployer.sh moi@mon-serveur.exemple.fr --domaine canape.mawena.cloud
```

## Ajouter des films

Copiez les fichiers dans `/srv/canape/films` (sous-dossiers permis ; `.mp4`, `.m4v`, `.webm`, `.mkv`, `.mov`,
`.ogv`). Il n'y a rien à redémarrer.

```sh
scp "Mon film.mp4" "Mon film.fr.srt" moi@mon-serveur.exemple.fr:/srv/canape/films/
rsync -avP Films/ moi@mon-serveur.exemple.fr:/srv/canape/films/
```

(Votre compte doit être dans le groupe `canape`, ce que fait `deployer.sh` ; reconnectez-vous ensuite.)

- **Sous-titres** : un fichier `.srt` ou `.vtt` à côté du film, même nom de base, avec un code de langue
  facultatif (`Film.mp4`, `Film.srt`, `Film.fr.srt`, `Film.en.vtt`). Le `.srt` est converti en WebVTT à la volée.
- **Films « à convertir »** : avec `ffprobe`, le serveur lit les codecs et marque un film « lisible partout » (vidéo
  H.264, VP8, VP9 ou AV1 ; son AAC, MP3, Opus ou Vorbis) ou « à convertir ». Sur le serveur,
  `canape-convertir <film>` produit un MP4 H.264 + AAC (`+faststart`) à côté de l'original et extrait les
  sous-titres texte intégrés en `.vtt`. Sans `ffprobe`, la compatibilité est inconnue.

## HTTPS est obligatoire

Les navigateurs n'autorisent la caméra et le micro que sur une page sûre : HTTPS, ou `http://localhost`. Pour que
l'autre personne se connecte de chez elle, il faut donc un vrai certificat : c'est le rôle de nginx et de Let's
Encrypt. Sans HTTPS, la lecture synchronisée marche mais pas l'appel vidéo. Derrière nginx, laissez
`CANAPE_DERRIERE_PROXY=1` : Canapé marque alors le cookie de session `Secure` et lit l'adresse du visiteur dans
`X-Forwarded-For`.

## TURN : quand l'appel ne passe pas

Les caméras se parlent directement d'un navigateur à l'autre (WebRTC pair à pair, avec un serveur STUN public). Derrière
un réseau strict (réseau d'entreprise, 4G très filtrée, NAT symétrique), la connexion directe échoue : il faut un
relais TURN. Sur le serveur (ou un autre) :

```sh
sudo apt install coturn
```

`/etc/turnserver.conf` minimal :

```
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=<un secret long, par exemple openssl rand -hex 32>
realm=canape.exemple.fr
total-quota=20
no-multicast-peers
no-cli
```

Activez-le (`TURNSERVER_ENABLED=1` dans `/etc/default/coturn` sur les versions qui le demandent), puis
`sudo systemctl enable --now coturn`. Ouvrez le port **3478 en UDP et en TCP** et la plage de relais par défaut
**49152-65535 en UDP** dans le pare-feu du serveur (ufw : `sudo ufw allow 3478 && sudo ufw allow 49152:65535/udp`).
Pour traverser les pare-feu qui ne laissent passer que le web, coturn peut aussi écouter en TLS sur le port 5349
(`tls-listening-port`, avec le certificat Let's Encrypt), à indiquer ensuite par une URL `turns:`.

Dans `/etc/canape/canape.conf`, puis `sudo systemctl restart canape` :

```
CANAPE_TURN_URLS=turn:canape.exemple.fr:3478
CANAPE_TURN_SECRET=<le même secret>
```

Canapé fabrique alors des identifiants TURN temporaires pour chaque navigateur. `CANAPE_ICE` remplace la liste
des serveurs STUN/TURN donnée aux navigateurs (JSON).

## Configuration

Le service lit `/etc/canape/canape.conf` (format `CLÉ=valeur`, `#` pour un commentaire). Le modèle est
`deploiement/canape.conf.exemple`. En dehors du service, `bin/canape --config <fichier>` (ou `CANAPE_CONFIG`) lit un
fichier du même format ; les variables d'environnement l'emportent sur le fichier.

| Variable | Défaut | En production | Rôle |
|---|---|---|---|
| `CANAPE_HOTE` | `0.0.0.0` | `127.0.0.1` | adresse d'écoute |
| `CANAPE_PORT` | `8080` | `8080` | port d'écoute |
| `CANAPE_FILMS` | `./films` | `/srv/canape/films` | dossier des films (sous-dossiers permis) |
| `CANAPE_MOT_DE_PASSE` | vide | généré par `deployer.sh` | mot de passe commun ; vide = accès libre, avec un avertissement au démarrage |
| `CANAPE_SECRET` | aléatoire à chaque démarrage | généré par `deployer.sh` | signe les cookies de session (sinon les sessions tombent au redémarrage) |
| `CANAPE_DERRIERE_PROXY` | `0` | `1` | `1` = faire confiance à `X-Forwarded-Proto` / `X-Forwarded-For` (proxy HTTPS devant) |
| `CANAPE_TLS_CERT`, `CANAPE_TLS_CLE` | vides | vides | chemins du certificat et de la clé : HTTPS servi directement par Node (inutile derrière nginx) |
| `CANAPE_ICE` | `[{"urls":"stun:stun.l.google.com:19302"}]` | défaut | serveurs STUN/TURN donnés aux navigateurs (JSON) |
| `CANAPE_TURN_URLS` | vide | vide | URL TURN séparées par des virgules (ex. `turn:exemple.fr:3478`) |
| `CANAPE_TURN_SECRET` | vide | vide | secret partagé de coturn (`static-auth-secret`) : identifiants TURN temporaires |

Après une modification : `sudo systemctl restart canape`. Test de santé : `curl http://127.0.0.1:8080/api/etat`.

## Utilisation

1. Chacun ouvre l'adresse de Canapé dans son navigateur, entre son prénom et le mot de passe commun.
2. « Entrer dans le salon » : ce premier geste autorise la lecture avec son (les navigateurs bloquent la lecture
   automatique). Acceptez la caméra et le micro. Si la lecture est quand même refusée, un bouton « Reprendre ici »
   s'affiche.
3. L'un choisit le film (« Quel film ce soir ? ») : il se lance chez les deux.
4. Les commandes sont partagées : lecture, pause, déplacement dans le film et choix du film. Si un navigateur charge
   plus d'une seconde, le salon se met en pause pour tous (« … charge le film ») puis reprend quand tout le monde
   est prêt (attente mutuelle). Si les lectures s'écartent, chaque navigateur rattrape tout seul.
5. Le volume du film et celui des voix se règlent séparément ; boutons pour couper le micro et la caméra ; option
   « Film plus bas quand on parle » ; sous-titres quand le film en a ; plein écran avec les vignettes des caméras
   (elles se déplacent par glisser-déposer).
6. **Un casque est conseillé** : sans casque, le son du film sort des enceintes et repart dans le micro (écho).

## Développement

```sh
npm install
CANAPE_FILMS=films CANAPE_MOT_DE_PASSE=test bin/canape    # http://localhost:8080, à ouvrir dans deux navigateurs
npm test                                                  # tests node:test
npm run essai-navigateur                                  # essai de bout en bout dans Chrome headless
```

Une seule dépendance de production : `ws`. Pas d'étape de construction : le serveur est du Node.js CommonJS et
l'interface du JavaScript natif. `docs/CONCEPTION.md` décrit le contrat (interface HTTP, synchronisation, appel
vidéo, production).

## Structure du dépôt

```
bin/canape              point d'entrée : lance le serveur
bin/canape-convertir    convertit un film pour le navigateur (ffmpeg)
src/                    modules du serveur (Node >= 18, CommonJS)
public/                 interface web statique
tests/                  tests node:test
outils/                 essai de bout en bout dans Chrome headless (npm run essai-navigateur)
deploiement/            canape.service (systemd), canape.conf.exemple, nginx/canape.conf, deployer.sh
docs/CONCEPTION.md      conception et contrat
ROADMAP.md              feuille de route
```

## Licence

MIT, voir [LICENSE](LICENSE).
