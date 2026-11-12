# Journal des versions — Canapé

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; versions selon [SemVer](https://semver.org/lang/fr/).

## [0.1.0] — 2026-11-12

Première version : regarder un film à deux, chacun chez soi, en se voyant et en s'entendant, sans le partage
d'écran saccadé de Google Meet, avec le son du film et la voix en même temps.

### Ajouté

- **Serveur Node.js** : connexion par mot de passe commun (cookie signé, 5 essais par minute), liste des films avec
  leurs sous-titres et leur compatibilité navigateur (ffprobe), envoi des films avec requêtes `Range`, sans sortie du
  dossier des films, sous-titres `.srt` convertis en WebVTT.
- **Salon synchronisé** : lecture, pause, déplacement et choix du film partagés ; rattrapage de l'écart (moins de
  0,5 s) ; attente mutuelle quand l'un charge le film ; bouton « Reprendre ici » si le navigateur bloque la lecture.
- **Appel vidéo** WebRTC pair à pair, jusqu'à 4 personnes : vignettes des caméras sur le film, couper le micro et la
  caméra, volumes du film et des voix séparés, film baissé quand l'autre parle, conseil du casque contre l'écho ;
  identifiants TURN temporaires pour coturn.
- **Interface** « salle de cinéma » en français : plein écran avec les caméras, mise en page téléphone.
- **`canape-convertir`** : convertit un film pour le navigateur (H.264 + AAC, `faststart`) et extrait ses
  sous-titres en `.vtt`.
- **Déploiement sur un VPS derrière nginx** : `deploiement/installer-serveur.sh` (sur le serveur, depuis un clone) et
  `deploiement/deployer.sh` (depuis le poste), service systemd durci, HTTPS Let's Encrypt. Il ne touche pas aux
  autres sites : `nginx -t` avant et après, retour arrière automatique, rechargement et jamais redémarrage, port libre
  choisi seul, Node.js de nvm copié dans `/opt/canape/node`. Désinstallation avec `--desinstaller`.
- **Tests** : 29 tests Node (unitaires et intégration), essai de bout en bout dans Chrome à deux participants
  (`npm run essai-navigateur`), essai nginx du déploiement (70 vérifications) ; passés sous Node 18 et Node 26.

[0.1.0]: https://github.com/mawena/Canape/releases/tag/v0.1.0
