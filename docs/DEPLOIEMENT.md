# Déploiement et exploitation de Canapé

Guide pour le serveur (VPS Ubuntu, nginx déjà en place pour d'autres sites). Production : `https://canape.mawena.cloud`.

## Disposition sur le serveur

| Chemin | Rôle |
|---|---|
| `/opt/canape/versions/<version>-<commit>/` | une version du paquet (3 gardées) |
| `/opt/canape/actuelle` | lien vers la version en service |
| `/opt/canape/node` | copie de Node.js (celle indiquée par `--node`, jamais installée par le script) |
| `/opt/canape/deploiement/` | scripts, `root:root`, non modifiables par l'utilisateur de déploiement |
| `/etc/canape/canape.conf` | configuration (`CLÉ=valeur`) |
| `/srv/canape/{donnees,films,cache,televersements,telechargements}` | données ; sauvegardes de la base dans `donnees/sauvegardes/` (5 gardées) |
| `/etc/systemd/system/canape.service` | service (`CPUWeight=50`, `IOWeight=50` : les autres sites passent avant pendant les conversions) |
| `/usr/local/bin/canape` | ligne de commande (`canape admin inviter`, `canape films importer`…) |

## Installation initiale

Depuis un clone du dépôt, en root :

```bash
sudo ./deploiement/installer-serveur.sh --domaine canape.exemple.fr --port 8780 --node /chemin/vers/node
```

Options : `--domaine`, `--port`, `--node`, `--paquet <canape-x.y.z.tar.gz>`, `--essai` (décrit sans rien modifier), `--desinstaller`.
Sans `--paquet`, le script télécharge le paquet de la dernière release GitHub et vérifie son `SHA256SUMS` : rien n'est construit
sur le serveur, ce qui épargne le processeur des autres sites. Le script est relançable.

Garanties pour nginx : `nginx -t` avant et après, état d'origine remis exactement si la nouvelle configuration est refusée, marqueur
`Géré par Canapé`, refus d'écraser un fichier qui n'est pas à lui, `reload` seulement (jamais de redémarrage), IPv6 gardé seulement là
où un autre site écoute déjà. Le certificat Let's Encrypt existant est réutilisé.

À la fin, le script lance `canape admin inviter --role admin` et affiche le **lien d'invitation de l'administrateur** : ouvre-le pour
créer le premier compte. Pour en recréer un : `sudo canape admin inviter --role admin`.

## Mise à niveau depuis la 0.1

Même commande que l'installation (`installer-serveur.sh --domaine canape.mawena.cloud --port 8780 …`). Le script :

- garde le port, les dossiers et le certificat ;
- met `/etc/canape/canape.conf` à niveau : `CANAPE_MOT_DE_PASSE` et `CANAPE_SECRET` sont commentés (devenus inutiles), `CANAPE_URL_PUBLIQUE=https://<domaine>` et les dossiers sont ajoutés ;
- remplace l'ancienne unité par la nouvelle (`SystemCallFilter=@system-service @pkey` : sans `@pkey`, Node meurt au démarrage) ;
- ajoute à nginx `/api/televersement` (64 Mo, sans tampon), `/media/` (sans tampon) et `/ws/` (Upgrade, délai 6 h) ;
- **ne déplace pas** les films posés à plat dans `/srv/canape/films/*.mp4`. Après la création du compte admin, les importer :
  `sudo canape films importer /srv/canape/films --proprietaire <identifiant-admin>`.

## Déploiement automatique (GitHub Actions)

Un push sur `main` met la production à jour : « le VPS récupère et fait la mise en prod ».

### 1. Une fois, sur le poste : la paire de clés

```bash
ssh-keygen -t ed25519 -N "" -C canape-deploiement -f ~/.ssh/canape-deploiement
```

### 2. Une fois, sur le VPS (root)

```bash
sudo /opt/canape/deploiement/preparer-deploiement-auto.sh ~/canape-deploiement.pub   # après avoir copié la clé PUBLIQUE
```

Options : `--essai <clé>` (ne modifie rien), `--retirer` (défait tout, sauf les données). Le script crée l'utilisateur
`canape-deploiement` (sans mot de passe), installe la clé avec `command="/opt/canape/deploiement/recevoir",restrict`, ajoute
`/etc/sudoers.d/canape-deploiement` (limité à `mettre-a-jour`, validé par `visudo -cf`) et affiche l'empreinte d'hôte.

### 3. Les secrets GitHub (environnement `production`)

| Secret | Valeur |
|---|---|
| `VPS_HOTE` | adresse du serveur |
| `VPS_PORT` | port SSH (22 le plus souvent) |
| `VPS_UTILISATEUR` | `canape-deploiement` |
| `VPS_CLE_SSH` | clé PRIVÉE `~/.ssh/canape-deploiement` |
| `VPS_EMPREINTE_HOTE` | ligne affichée par `preparer-deploiement-auto.sh` (`StrictHostKeyChecking=yes`) |

Ils se créent par `gh secret set VPS_HOTE --env production -R mawena/Canape` (et de même pour les autres), ou dans les réglages du dépôt.

### 4. Ce que fait un push

- Push sur `develop` ou pull request : `ci.yml` (typage, tests, construction, e2e Playwright).
- Push sur `main` : `deploiement.yml` : `verifier` (CI) → `paquet` (construit `canape-<version>.tar.gz` + `SHA256SUMS`, artefact) →
  `deployer` (environnement `production`, une seule mise en production à la fois, sans annulation) : `ssh … "deployer <sha256>" < paquet`.
  Côté serveur, `recevoir` (commande forcée) n'accepte que cette forme, borne la taille (400 Mo), vérifie le SHA-256, puis lance
  `sudo -n mettre-a-jour`. La sortie revient dans le journal du job ; le job échoue si la mise à jour échoue.
- Tag `v*` : en plus, `release` crée la release GitHub « Canapé x.y.z — résumé » (notes = section du `CHANGELOG.md`, paquet et `SHA256SUMS` joints).

### Ce que fait `mettre-a-jour`

Vérifie le SHA-256, extrait dans `versions/`, arrête le service, sauvegarde la base (`canape.sqlite`, `-wal`, `-shm`), bascule `actuelle`,
démarre, puis vérifie `/api/etat` (version attendue) pendant 30 s. En cas d'échec : arrêt, base restaurée à l'identique, ancien lien,
redémarrage, code de sortie non nul. Verrou contre deux mises à jour simultanées. Ne touche jamais nginx.
Codes : 0 réussi, 1 échec (retour arrière fait), 2 usage, 3 SHA-256 faux, 4 paquet invalide, 70 retour arrière en échec, 75 déjà en cours.

## Torrents (1.1)

Le moteur (WebTorrent) tourne dans un processus enfant du service, en `nice` ; ses données sont dans
`/srv/canape/telechargements` (créé par l'installation et par `mettre-a-jour`, `CANAPE_TELECHARGEMENTS` ajouté à
`canape.conf`). L'unité systemd laisse passer le TCP et l'UDP et n'autorise l'écriture que sous `/srv/canape`.

- **Pare-feu** : sans port ouvert, Canapé télécharge quand même (connexions sortantes) mais trouve moins de pairs. Fixer
  `CANAPE_TORRENT_PORT=51413`, puis `sudo ufw allow 51413` (TCP et UDP), puis `sudo systemctl restart canape`.
- **Hébergeur** : beaucoup d'hébergeurs interdisent ou surveillent le téléchargement de torrents (courriers d'abus). Lire les
  conditions avant d'activer la fonction ; `CANAPE_TORRENTS=0` la coupe. Ne télécharger que des contenus dont on a le droit.
- **Ménagement des autres sites** : `CANAPE_TORRENT_SIMULTANES`, `CANAPE_TORRENT_DEBIT_MAX` et `CANAPE_TORRENT_ENVOI_MAX`
  plafonnent le moteur ; il faut de la place pour le film en cours (le quota du compte compte les téléchargements).

## Retour arrière manuel

```bash
ls /opt/canape/versions /srv/canape/donnees/sauvegardes
sudo systemctl stop canape
sudo ln -sfn /opt/canape/versions/<ancienne-version> /opt/canape/actuelle
# si le schéma de la base a changé : restaurer la sauvegarde correspondante
sudo cp -p /srv/canape/donnees/sauvegardes/<date>/canape.sqlite* /srv/canape/donnees/
sudo chown canape: /srv/canape/donnees/canape.sqlite*
sudo systemctl start canape && curl -s http://127.0.0.1:8780/api/etat
```

Un push sur `main` avec le correctif ou un `revert` reste la voie normale.

## Journal et état

```bash
journalctl -u canape -f
systemctl status canape
curl -s http://127.0.0.1:8780/api/etat      # version en service
```

## Désinstallation

```bash
sudo ./deploiement/installer-serveur.sh --desinstaller --domaine canape.exemple.fr
```

Retire le service, `/opt/canape`, la commande `canape` et le site nginx (marqueur vérifié). Les réglages, les données et les films
sont **gardés** ; le script affiche la commande pour les supprimer. Le déploiement automatique se retire par
`preparer-deploiement-auto.sh --retirer`.

## Essais sans root

`deploiement/essais/essai-mise-a-jour.sh`, `essai-installation.sh` et `essai-nginx.sh` rejouent les scripts avec de faux chemins et de
fausses commandes (variables `CANAPE_ESSAI_*`) : rien n'est modifié sur le poste.
