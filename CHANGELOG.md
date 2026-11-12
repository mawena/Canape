# Journal des versions — Canapé

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; versions selon [SemVer](https://semver.org/lang/fr/).

## [1.2.0] — 2026-11-12

Nouveau design : plus lumineux, plus professionnel, plus facile à prendre en main.

### Changé

- **Thème clair par défaut, à dominante bleue** : fond clair légèrement bleuté, cartes blanches, bleu franc pour toutes
  les actions, dégradé bleu → violet pour ce qui compte (séance du soir, connexion, bouton principal), ombres douces ;
  contrastes calculés, au niveau AA partout.
- **Thème sombre bleu nuit en option** : « Clair / Sombre / Comme mon appareil » dans le menu du compte et dans
  « Mon compte » (clair par défaut). La salle reste sombre dans les deux thèmes, pour regarder le film.
- **Typographie** : Figtree pour toute l'interface ; Instrument Serif seulement pour les grands titres et les noms de
  films.
- **Composants refaits** : boutons, champs, cartes d'affiche, onglets en segments, modales, menus, panneaux, états
  vides et chargements ; verre dépoli sur ce qui flotte au-dessus du film ; navigation plus nette.
- **Écrans repris un par un** : accueil, connexion et invitation, galerie et fiche d'un film, téléchargements,
  séances et nouvelle séance (trois étapes), sas et salle, historique, compte, administration ; cibles tactiles d'au
  moins 44 px.
- Icônes, manifeste et écrans de démarrage de l'application installable aux nouvelles couleurs.

### Ajouté

- **Premiers pas guidés** sur l'accueil d'un compte neuf : ajouter un film, inviter quelqu'un, lancer une séance ;
  les étapes se cochent d'elles-mêmes et le guide se referme.

## [1.1.0] — 2026-11-12

Ajouter un film à sa galerie par torrent (lien magnet ou fichier `.torrent`) et suivre son téléchargement.

### Ajouté

- **Films par torrent** : dans la galerie, « Ajouter un film » propose « Depuis mon ordinateur » ou « Par torrent » ;
  coller un lien magnet ou déposer un `.torrent` (aussi par glisser-déposer sur la galerie). À la fin, le film entre
  seul dans la galerie, avec les sous-titres `.srt`/`.vtt` de son dossier, puis passe par la lecture universelle.
- **Panneau « Téléchargements »** : progression, reçu / total, débit, temps restant, pairs, état en clair ; pause,
  reprise, annulation, « Choisir les fichiers » quand le torrent contient plusieurs vidéos ; notification « … est dans
  ta galerie » ; feuille du bas sur téléphone.
- **Moteur WebTorrent dans un processus séparé** : un plantage ou une charge du moteur ne touche ni les séances ni
  l'API ; relancé seul, il reprend les téléchargements là où ils étaient (morceaux reçus revérifiés).
- **Règles** : seule la plus grosse vidéo et ses sous-titres sont choisis d'office (jamais les « sample ») ; quota
  compté dès que la taille est connue ; au plus deux téléchargements à la fois, à basse priorité, débits plafonnés
  (envoi 1 Mo/s) ; le torrent cesse d'être partagé dès la fin (`CANAPE_TORRENT_PARTAGE` pour continuer) ; liens
  magnet nettoyés, jamais de source web donnée par un utilisateur ; `CANAPE_TORRENTS=0` coupe la fonction.
- **Réglages** `CANAPE_TORRENTS`, `CANAPE_TELECHARGEMENTS`, `CANAPE_TORRENT_SIMULTANES`, `CANAPE_TORRENT_DEBIT_MAX`,
  `CANAPE_TORRENT_ENVOI_MAX`, `CANAPE_TORRENT_PARTAGE`, `CANAPE_TORRENT_PORT` ; dossier `/srv/canape/telechargements`
  créé par l'installateur et par `mettre-a-jour`.
- **Essais** : 20 tests serveur des torrents avec un vrai pair local (sans Internet) ; essais Playwright des torrents
  sur Chromium et Firefox (magnet, `.torrent`, pause, reprise, annulation, choix des fichiers, erreurs, droits).

## [1.0.0] — 2026-11-12

Canapé devient une plateforme privée : comptes, galeries, envoi de n'importe quel fichier vidéo, lecture de tous les
formats sans conversion à la main, séances avec lien, salle refaite, mise en production automatique.

### Changé (incompatible avec la 0.1)

- **Comptes au lieu du mot de passe commun** : un administrateur et des viewers, invités par lien (7 jours, usage
  unique) ; plus de salon unique, des **séances**. Les films de la 0.1 se reprennent avec
  `canape films importer <dossier> --proprietaire <identifiant> [--copier]`.
- **Nouvelle pile** : Node.js 26 qui exécute directement le TypeScript, Fastify 5, SQLite intégré à Node (`node:sqlite`),
  Svelte 5 + SvelteKit 2 ; configuration `CANAPE_*` revue (voir le README).
- **`canape-convertir` retiré** : le serveur lit tout seul tous les formats (voir « Lecture universelle »).
- **Déploiement revu** : paquet `canape-<version>.tar.gz`, versions côte à côte dans `/opt/canape/versions/`, données dans
  `/srv/canape/` ; `installer-serveur.sh` met à niveau une installation 0.1 en place. `deployer.sh` est retiré.

### Ajouté

- **Comptes** : connexion protégée par Argon2id (5 essais par minute), sessions de 30 jours glissants, réinitialisation
  du mot de passe par lien, couleur de chacun ; administration des comptes, invitations, quotas, droit d'envoyer des
  films, espace disque et réglages ; le dernier admin ne peut pas être retiré ; `canape admin inviter` et
  `canape admin reinitialiser` ; lien admin écrit dans le journal au premier démarrage.
- **Médiathèque** : chacun sa galerie ; envoi par morceaux (tus) avec pause, reprise, débit et temps restant, par le
  bouton ou par glisser-déposer, dans la limite de son quota ; analyse du fichier, titre et année tirés du nom, affiche
  et image de fond tirées du film (couleurs HDR corrigées), couleur dominante pour la « lueur » ; fiches TMDB si une clé
  est configurée ; films privés par défaut, partagés avec certains comptes ou avec tous ; sous-titres `.srt`/`.vtt` à
  ajouter ; recherche, filtres, tri.
- **Lecture universelle** : lecture directe quand le navigateur sait lire le fichier ; sinon le son seul est converti,
  ou l'image est convertie pendant la lecture (HLS par morceaux de 6 s, saut n'importe où, une seule conversion par film
  partagée par tous, priorité basse pour ne pas gêner les autres sites, préréglage choisi d'après la vitesse mesurée) ;
  HDR → SDR (`zscale` + `tonemap` mobius) ; préparation à l'avance des films lourds quand le serveur est calme ;
  sous-titres intégrés extraits en WebVTT ; page d'administration des conversions ; « Regarder seul » sur la fiche.
- **Séances** : séance tout de suite ou prévue, invités, lien pour rejoindre (stable tant qu'on ne le retire pas),
  chat, réactions, reprise là où on s'est arrêté, historique, identifiants TURN temporaires.
- **Salle** : sas avant d'entrer (aperçu de la caméra, micro, casque) ; lecture synchronisée (rattrapage par vitesse ou
  par saut, attente mutuelle avec « Ne plus attendre … », pause pour tous quand quelqu'un perd la connexion, reprise
  même sur les navigateurs qui ne chargent pas un film en pause) ; compte à rebours « Lancer ensemble » ; langue et
  sous-titres choisis pour tous ; chaque geste dit qui l'a fait ; appel vidéo pair à pair jusqu'à 8 avec vignettes
  déplaçables ou en rangée, volumes film / voix / par personne, film baissé quand quelqu'un parle, conseil du casque ;
  chat repliable, réactions qui flottent, « Je reviens dans 5 min », écran de fin ; plein écran, raccourcis clavier,
  téléphone en portrait et en paysage.
- **Interface** : direction artistique « un salon la nuit, une lampe allumée » (nuit prune, lampe ambre, rose pour
  l'autre, Instrument Serif et Hanken Grotesk servies par l'application, icônes Lucide), accueil « Ce soir », reprise,
  ajouts récents, historique ; accessible (WCAG 2.2 AA visé, mouvement réduit respecté) ; installable (PWA) sans jamais
  mettre en cache les films ni l'API.
- **Mise en production automatique** : GitHub Actions (vérifications sur `develop`, déploiement sur `main` par une clé
  SSH à commande forcée, release GitHub du tag avec le paquet) ; `mettre-a-jour` sauvegarde la base, bascule de
  version, vérifie que le service répond et revient seul à l'ancienne version sinon ; garde 3 versions ;
  `preparer-deploiement-auto.sh` prépare le VPS. Guide : `docs/DEPLOIEMENT.md`.
- **Documents** : conception (`docs/CONCEPTION.md`), direction artistique et maquette (`docs/DESIGN.md`,
  `docs/maquettes/canape.html`), recherche technique chiffrée (`docs/RECHERCHE-TECHNIQUE.md`), README réécrit.
- **Essais** : 274 tests Node du serveur et de la logique du client ; 70 essais de bout en bout Playwright dans
  Chromium, Firefox, WebKit, Chrome et sur téléphone, à deux avec caméras simulées ; essais du déploiement (mise à jour,
  installation, nginx) sans root.

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

[1.2.0]: https://github.com/mawena/Canape/releases/tag/v1.2.0
[1.1.0]: https://github.com/mawena/Canape/releases/tag/v1.1.0
[1.0.0]: https://github.com/mawena/Canape/releases/tag/v1.0.0
[0.1.0]: https://github.com/mawena/Canape/releases/tag/v0.1.0
