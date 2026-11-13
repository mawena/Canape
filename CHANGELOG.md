# Journal des versions — Canapé

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; versions selon [SemVer](https://semver.org/lang/fr/).

## [1.7.0] — 2026-11-13

Fin de séance et souvenirs.

### Ajouté

- **Écran de fin** dans la salle, quand le film arrive à la fin ou quand l'hôte termine la séance : « C'était
  bien. », le temps passé ensemble (« 1 h 52 ensemble », ou « Tu as regardé seul·e »), les personnes présentes et
  une note d'un mot : coup de cœur, bien ou bof. La note des autres apparaît en direct sur leur avatar. « Revoir la
  fin » ferme l'écran sans qu'il revienne ; « Quitter la salle » sort.
- **Souvenirs dans l'historique** : chaque séance passée montre qui était là, le temps passé ensemble et la note de
  chacun ; on peut noter (ou changer sa note) après coup.
- Le **temps ensemble** est mesuré par le serveur de salle : il compte les moments où au moins deux personnes sont
  dans la salle, et survit aux allers-retours.

### Modifié

- Quand le film arrive à la fin, il est marqué « terminé » dans l'historique de toutes les personnes présentes, et
  plus seulement de celle dont le lecteur a signalé la fin.

### Base de données

- Migration `060_souvenirs.sql`, appliquée toute seule au démarrage (la mise à jour sauvegarde la base avant) :
  colonne `seances.ensemble_secondes`, tables `seances_presences` et `seances_notes`.

## [1.6.0] — 2026-11-13

Un accueil qui va droit au but.

### Ajouté

- **Lancement rapide** : sur l'accueil, touche un film puis « Lancer » : la séance est créée tout de suite, avec son
  lien, « Copier le lien », « Partager le message » et « Entrer dans la salle ». « Plus d'options » mène toujours au
  formulaire complet (date, invités).
- **Téléchargements en cours** sur l'accueil : nom, avancement, débit et temps restant de chaque torrent, avec un
  lien vers la galerie ; rien ne s'affiche quand il n'y en a pas.
- **« Reprendre » en un geste** : chaque film commencé a sa ligne avec miniature, « Arrêté à… », barre de progression
  et bouton de lecture.

### Modifié

- L'accueil est réorganisé par ordre d'importance : la séance en cours (« Rejoindre ») ou la prochaine (« Entrer
  dans la salle », « Copier le lien ») d'abord, ou le lancement rapide s'il n'y en a pas ; puis « Reprendre », les
  téléchargements, les ajouts récents ; « Pour bien démarrer » passe en bas, sauf pour un compte neuf où il guide
  les premiers pas.
- Sur téléphone, la carte de la séance tient dans le premier écran (affiche réduite à côté du titre), et ses
  boutons ne passent plus sous la barre du bas.

Rien ne change côté serveur, base de données ou déploiement : la mise à jour se fait comme d'habitude.

## [1.5.0] — 2026-11-12

Inviter quelqu'un pendant la séance, même quand le film est déjà lancé.

### Ajouté

- **Bouton « Inviter » dans la salle**, pour l'hôte de la séance : il s'utilise pendant le film, sans le mettre en
  pause ni toucher à la synchronisation, et marche aussi en plein écran. Il ouvre un petit panneau avec le lien de la
  séance, « Copier le lien » et, sur téléphone, « Partager… » (le panneau s'ouvre alors en bas de l'écran). Échap le
  ferme.
- La même option dans le sas, avant d'entrer dans la salle.
- **« Copier le lien »** dans la liste des séances, sur chaque séance prévue ou en cours dont tu es l'hôte.
- La personne qui ouvre le lien pendant le film arrive directement dans la salle, au même moment du film que les
  autres (vérifié par un nouvel essai Playwright, sous Chromium et Firefox : un troisième compte rejoint en pleine
  lecture).

Rien ne change côté serveur, base de données ou déploiement : la mise à jour se fait comme d'habitude.

## [1.4.1] — 2026-11-12

Correctif : Transmission peut écrire dans les dossiers de téléchargement.

### Corrigé

- **« Transmission n'a pas le droit d'écrire dans le dossier des téléchargements (… Permission denied) »** : en
  production, le durcissement du service (`RestrictSUIDSGID=true`) refusait à Canapé le `chmod 2770` du dossier de
  chaque téléchargement, qui restait en `2750`, fermé à Transmission. Canapé crée maintenant ce dossier directement
  en `2770` (sous un umask `007`, le bit setgid hérité du dossier parent), sans chmod ; vérifié dans le même bac à
  sable systemd que le service.
- Un dossier de téléchargement qui existe déjà (laissé par la 1.4.0, ou commencé par WebTorrent avant le passage à
  Transmission) est rouvert au groupe avant d'être confié à Transmission ; WebTorrent écrit désormais ses fichiers
  ouverts au groupe.
- `mettre-a-jour` ne remet plus `/srv/canape/telechargements` en `0750` : il le garde en `2770` et rouvre au groupe
  les dossiers et fichiers laissés fermés par la 1.4.0.
- Canapé signale dans son journal un dossier des téléchargements qui n'est pas en `2770`.

## [1.4.0] — 2026-11-12

Les torrents passent par **Transmission** : les trackers privés (qui refusaient WebTorrent) marchent, et les torrents
privés restent partagés comme ils le demandent.

### Ajouté

- **Moteur Transmission** : Canapé pilote `transmission-daemon`, installé sur le même serveur, par son RPC local
  (identifiant et mot de passe, jamais exposé) pour tous les torrents, publics comme privés. WebTorrent ne sert plus
  qu'en secours quand Transmission n'est pas installé (`CANAPE_TORRENT_MOTEUR` : `auto`, `transmission`,
  `webtorrent`). Les téléchargements WebTorrent en cours passent à Transmission dès qu'il répond, sans tout reprendre
  de zéro.
- **Le film ne prend pas de place en plus** : à la fin, il entre dans la galerie par un lien physique vers le fichier
  téléchargé (copie seulement en dernier recours).
- **Torrents privés partagés** jusqu'à ce que tu les retires (`CANAPE_TORRENT_PARTAGE_PRIVES`, `toujours` par défaut,
  ou un ratio) ; les torrents publics s'arrêtent dès que le film est dans la galerie (`CANAPE_TORRENT_PARTAGE`).
- **Panneau « Téléchargements »** : pastille « Privé » avec une aide ; partie « Partagés » avec « En partage · ratio
  1,24 · 480 Ko/s envoyés » et le bouton « Arrêter de partager » (le film reste dans ta galerie) ; réponse du tracker
  en clair (« Le tracker a refusé : … ») ; « En attente des pairs… » au lieu d'une attente muette.
- **Installation de Transmission en une commande** sur un serveur déjà en place :
  `deploiement/installer-transmission.sh` (`--essai` pour voir ce qu'il ferait). RPC sur 127.0.0.1 seulement, mot de
  passe généré dans `canape.conf`, Transmission dans le groupe `canape`, Canapé démarre après lui ; ni nginx ni le
  pare-feu ne sont touchés (le port des pairs à ouvrir est affiché). Il refuse de modifier un Transmission réglé par
  quelqu'un d'autre sans `--remplacer`. Aussi appelé par `installer-serveur.sh`.

### Sécurité

- Avant d'être confié à Transmission, un `.torrent` perd ses sources web (`url-list`, `httpseeds`) et ses trackers
  qui visent le serveur lui-même ou un réseau privé (bouclage, adresses privées, lien local, noms internes) ; même
  filtre pour les liens magnet. Personne ne peut ainsi faire appeler les services internes du serveur.
- La clé personnelle d'un tracker privé n'apparaît jamais dans les journaux ni dans les messages affichés.

### Essais

- 391 tests serveur et client, dont des essais avec un faux Transmission et avec un **vrai Transmission 4.0.5 en
  local** (sans Internet ni vrai torrent) : ajout, choix des fichiers, pause, reprise, fin, lien physique, partage d'un
  privé jusqu'au retrait, sources web et trackers internes retirés ; essais de l'installateur (27 vérifications) ;
  essais Playwright du panneau.

## [1.3.0] — 2026-11-12

Inscription libre : n'importe qui peut venir sur le site, créer son compte et ajouter ses films, sans invitation.

### Ajouté

- **Page « Créer un compte »** (`/inscription`, lien sur la connexion) : prénom, identifiant (lettres, chiffres,
  `.`, `_`, `-`, ou une adresse e-mail), mot de passe d'au moins 10 caractères avec sa jauge, couleur, acceptation des
  **règles d'usage** (nouvelle page `/regles`). Erreurs claires sous chaque champ ; « Les inscriptions sont fermées »
  ou « complètes » quand c'est le cas.
- **Garde-fous** : jeton anti-robot signé et horodaté, champ piège invisible, 3 inscriptions par heure et par adresse
  IP, 30 par jour en tout, 100 comptes inscrits au plus.
- **Réglages de l'administration** : ouvrir ou fermer les inscriptions (aussi `canape admin inscriptions
  ouvrir|fermer` sur le serveur), quota de chaque inscrit (20 Go par défaut), torrents pour les inscrits (fermés par
  défaut : un inconnu ne fait pas télécharger de torrents au serveur sans ton accord), nombre maximal de comptes.
  La liste des comptes montre leur origine (installation, invitation, inscription) et le droit aux torrents de
  chacun.
- **Partager un film ou inviter à une séance par identifiant** (« Ajouter quelqu'un : son identifiant »), en plus de
  la liste des personnes que tu connais déjà.

### Changé

- **Vie privée entre inconnus** : un spectateur ne voit plus la liste de tous les comptes, seulement ceux qu'il connaît
  (films partagés, séances, la personne qui l'a invité, les administrateurs) ; la recherche ne trouve que l'identifiant
  exact. La visibilité « tous » d'un film s'appelle « Tous les inscrits » et prévient que ce sont des inconnus quand les
  inscriptions sont ouvertes.
- L'ajout par torrent demande aussi le droit aux torrents du compte (accordé aux comptes invités et à l'administrateur).

### Essais

- 319 tests serveur et client ; essais Playwright de l'inscription, des droits et de la vie privée sur Chromium et
  Firefox.

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
